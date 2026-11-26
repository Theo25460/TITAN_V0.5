// SEO guard — what a robot reads in the RAW HTML a server returns (before any script runs). No dependency: a small tag tokenizer is
// enough for the pages this repository writes, and it never executes anything. The rendered DOM is checked separately (tools/seo-render.mjs).
import { createHash } from "node:crypto";

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", laquo: "«", raquo: "»", hellip: "…", mdash: "—", ndash: "–", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", icirc: "î", ucirc: "û", times: "×", middot: "·", euro: "€", copy: "©", reg: "®", thinsp: " ", nnbsp: " " };
export const decodeEntities = (text) => String(text ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
  if (code[0] === "#") {
    const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
  }
  return NAMED[code.toLowerCase()] ?? match;
});
// Whitespace, including non-breaking and narrow spaces, collapses to one space: a typographic change is not a content change.
export const normalizeSpace = (text) => String(text ?? "").replace(/[\s   ]+/g, " ").trim();

const ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
export function parseAttributes(source) {
  const attrs = {};
  for (const m of String(source || "").matchAll(ATTR)) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}

// Tokens: { type: "open"|"close"|"text", name, attrs, selfClosing, text }. Comments, doctype and CDATA are dropped; the content of script,
// style, template, textarea and noscript is kept as one raw text token so a "<" inside a script never opens a tag.
const RAW = new Set(["script", "style", "template", "textarea", "noscript", "title"]);
// Sticky: matched in place at the "<" (no copy of the rest of the document for every tag).
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
export function tokenize(html) {
  const tokens = [];
  const src = String(html || "");
  const lower = src.toLowerCase();
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { tokens.push({ type: "text", text: src.slice(i) }); break; }
    if (lt > i) tokens.push({ type: "text", text: src.slice(i, lt) });
    if (src.startsWith("<!--", lt)) { const end = src.indexOf("-->", lt + 4); i = end < 0 ? src.length : end + 3; continue; }
    if (src[lt + 1] === "!" || src[lt + 1] === "?") { const end = src.indexOf(">", lt); i = end < 0 ? src.length : end + 1; continue; }
    TAG.lastIndex = lt;
    const m = TAG.exec(src);
    if (!m) { tokens.push({ type: "text", text: "<" }); i = lt + 1; continue; }
    const name = m[2].toLowerCase();
    i = lt + m[0].length;
    if (m[1]) { tokens.push({ type: "close", name }); continue; }
    const selfClosing = /\/\s*$/.test(m[3]);
    tokens.push({ type: "open", name, attrs: parseAttributes(m[3].replace(/\/\s*$/, "")), selfClosing });
    if (RAW.has(name) && !selfClosing) {
      const close = lower.indexOf(`</${name}`, i);
      const end = close < 0 ? src.length : close;
      tokens.push({ type: "text", text: src.slice(i, end), raw: name });
      if (close >= 0) { const gt = src.indexOf(">", close); i = gt < 0 ? src.length : gt + 1; tokens.push({ type: "close", name }); } else i = src.length;
    }
  }
  return tokens;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
// Block boundaries for the readable content diff: a paragraph, a list item, a heading, a question or a cell is one block.
const BLOCK = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "dt", "dd", "summary", "td", "th", "figcaption", "blockquote", "section", "article", "div", "header", "footer", "nav", "aside", "ul", "ol", "dl", "details", "table", "tr", "form", "main", "br", "label", "button", "pre"]);
const HIDDEN_TEXT = new Set(["script", "style", "template", "noscript", "svg", "textarea"]);

const hash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);

// Internal links as a robot follows them: same origin (relative or absolute on the production origin), without query or fragment.
export function internalPath(href, origin) {
  const value = String(href || "").trim();
  if (!value || /^(mailto:|tel:|javascript:|data:|#)/i.test(value)) return null;
  try {
    const url = new URL(value, `${origin}/`);
    if (url.origin !== new URL(origin).origin) return null;
    return url.pathname || "/";
  } catch { return null; }
}

/**
 * Reads one HTML document as a search engine reads the raw response.
 * @param {string} html
 * @param {{ origin?: string }} [options] origin used to tell internal links apart (default https://titan-app.fr)
 */
export function extractPage(html, { origin = "https://titan-app.fr" } = {}) {
  const tokens = tokenize(html);
  const page = {
    lang: null, title: null, titleCount: 0, description: null, descriptionCount: 0, canonical: [], robotsMeta: [], hreflang: [],
    og: {}, jsonLd: [], jsonLdErrors: 0, h1: [], headings: [], links: [], ctas: [], scripts: [], stylesheets: [], hasMain: false,
    mainBlocks: [], faqQuestions: 0, playStoreLinks: [], refresh: null,
  };
  const stack = [];
  let inMain = 0, hidden = 0, inTitle = false, heading = null, block = [], anchor = null, jsonLd = false;
  const flush = () => {
    const text = normalizeSpace(decodeEntities(block.join("")));
    block = [];
    if (text && inMain) page.mainBlocks.push(text);
  };
  for (const t of tokens) {
    if (t.type === "text") {
      if (t.raw === "title" && inTitle) { page.title = normalizeSpace(decodeEntities(t.text)); continue; }
      if (t.raw === "script" && jsonLd) {
        try { page.jsonLd.push(JSON.parse(t.text)); } catch { page.jsonLdErrors += 1; }
        continue;
      }
      if (t.raw || hidden) continue;
      if (heading) heading.text += t.text;
      if (anchor) anchor.text += t.text;
      if (inMain) block.push(t.text);
      continue;
    }
    if (t.type === "open") {
      const { name, attrs } = t;
      if (name === "html" && attrs.lang) page.lang = attrs.lang;
      if (name === "title" && !inMain) { inTitle = true; page.titleCount += 1; }
      if (name === "meta") {
        const key = (attrs.name || "").toLowerCase();
        if (key === "description") { page.description = normalizeSpace(attrs.content); page.descriptionCount += 1; }
        if (key === "robots" || key === "googlebot") page.robotsMeta.push(normalizeSpace(attrs.content).toLowerCase());
        if (attrs.property?.startsWith("og:")) page.og[attrs.property.slice(3)] = attrs.content;
        if ((attrs["http-equiv"] || "").toLowerCase() === "refresh") page.refresh = attrs.content || "";
      }
      if (name === "link") {
        const rel = (attrs.rel || "").toLowerCase().split(/\s+/);
        if (rel.includes("canonical")) page.canonical.push(attrs.href || "");
        if (rel.includes("alternate") && attrs.hreflang) page.hreflang.push({ lang: attrs.hreflang, href: attrs.href });
        if (rel.includes("stylesheet") && attrs.href) page.stylesheets.push(attrs.href);
      }
      if (name === "script") {
        if (attrs.src) page.scripts.push(attrs.src);
        jsonLd = (attrs.type || "").toLowerCase() === "application/ld+json";
      }
      if (name === "main") { inMain += 1; page.hasMain = true; flush(); }
      if (HIDDEN_TEXT.has(name) && !t.selfClosing) hidden += 1;
      if (/^h[1-6]$/.test(name) && !hidden) heading = { level: Number(name[1]), text: "" };
      if (name === "a") {
        anchor = { href: attrs.href || "", text: "", cls: attrs.class || "", attrs };
        if (attrs["aria-label"]) anchor.text += ` ${attrs["aria-label"]}`;
      }
      if (BLOCK.has(name)) flush();
      if (!VOID.has(name) && !t.selfClosing) stack.push(name);
      continue;
    }
    // close
    const { name } = t;
    if (name === "title") inTitle = false;
    if (name === "script") jsonLd = false;
    if (/^h[1-6]$/.test(name) && heading) {
      const text = normalizeSpace(decodeEntities(heading.text));
      page.headings.push({ level: heading.level, text, inMain: inMain > 0 });
      if (heading.level === 1) page.h1.push(text);
      heading = null;
    }
    if (name === "a" && anchor) {
      const path = internalPath(anchor.href, origin);
      const text = normalizeSpace(decodeEntities(anchor.text));
      if (path) page.links.push(path);
      if (/play\.google\.com/i.test(anchor.href)) page.playStoreLinks.push({ href: anchor.href, hidden: "hidden" in anchor.attrs });
      if (/\basc-btn\b/.test(anchor.cls) && inMain) page.ctas.push({ href: path ?? anchor.href, text, primary: /\basc-btn-primary\b/.test(anchor.cls) });
      anchor = null;
    }
    if (BLOCK.has(name)) flush();
    if (HIDDEN_TEXT.has(name) && hidden) hidden -= 1;
    if (name === "main" && inMain) { flush(); inMain -= 1; }
    const at = stack.lastIndexOf(name);
    if (at >= 0) stack.length = at;
  }
  flush();
  // FAQ questions: the visible <details class="pub-faq"> summaries and the FAQPage entities, whichever is larger.
  const visibleFaq = (String(html).match(/<details\b[^>]*class="[^"]*\bpub-faq\b/g) || []).length;
  const faqEntities = page.jsonLd.flatMap((d) => (d?.["@graph"] || [d])).filter((n) => n?.["@type"] === "FAQPage").reduce((sum, n) => sum + (n.mainEntity?.length || 0), 0);
  page.faqQuestions = Math.max(visibleFaq, faqEntities);
  page.jsonLdTypes = [...new Set(page.jsonLd.flatMap((d) => (d?.["@graph"] || [d])).map((n) => n?.["@type"]).flat().filter(Boolean))].sort();
  const mainText = page.mainBlocks.join("\n");
  page.mainWords = mainText ? mainText.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
  page.mainDigest = hash(mainText);
  page.links = [...new Set(page.links)].sort();
  return page;
}

// "noindex" from any source: meta robots/googlebot, or the X-Robots-Tag header (possibly repeated or prefixed with a user agent).
export function robotsDirectives({ robotsMeta = [], xRobotsTag = "" } = {}) {
  const parts = [...robotsMeta, ...String(xRobotsTag || "").split(/,(?=\s*(?:[a-z-]+:)?\s*[a-z-])/i)]
    .flatMap((value) => String(value).toLowerCase().split(","))
    .map((value) => value.replace(/^\s*(googlebot|bingbot|otherbot)\s*:\s*/, "").trim())
    .filter(Boolean);
  return { noindex: parts.includes("noindex") || parts.includes("none"), nofollow: parts.includes("nofollow") || parts.includes("none"), parts: [...new Set(parts)] };
}

// The words a 404 page says, to recognise a "soft 404" (a missing page answered 200) by its content.
// Anchored at the start of the title: a page titled « Course 4040 m » or « Les 404 marches » is not a 404 page.
export const NOT_FOUND_TITLE = /^\s*(page introuvable|page not found|404\b)/i;

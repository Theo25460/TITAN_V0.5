// robots.txt read the way Google documents it (RFC 9309): the group of the most specific matching user agent applies, the longest
// matching rule wins, and Allow wins a tie. "*" matches any run of characters and "$" anchors the end of the path.
// https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") { sitemaps.push(value); continue; }
    if ((key === "allow" || key === "disallow") && current) current.rules.push({ allow: key === "allow", path: value });
  }
  return { groups, sitemaps };
}

const ruleRegex = (path) => new RegExp(`^${path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$")}`);

function groupFor(robots, userAgent) {
  const agent = userAgent.toLowerCase();
  let best = null;
  let bestLength = -1;
  for (const group of robots.groups) {
    for (const name of group.agents) {
      const length = name === "*" ? 0 : agent.startsWith(name) ? name.length : -1;
      if (length > bestLength) { best = group; bestLength = length; }
    }
  }
  if (!best) return [];
  // Every group naming the same most specific agent is merged, as the RFC asks.
  return robots.groups.filter((g) => g.agents.some((name) => (name === "*" ? bestLength === 0 : name.length === bestLength && agent.startsWith(name)))).flatMap((g) => g.rules);
}

/** @returns {{ allowed: boolean, rule: string | null }} whether `path` may be crawled by `userAgent`. */
export function isAllowed(robots, path, userAgent = "Googlebot") {
  let winner = null;
  for (const rule of groupFor(robots, userAgent)) {
    if (rule.path === "") continue; // "Disallow:" with no value allows everything.
    if (!ruleRegex(rule.path).test(path)) continue;
    const length = rule.path.length;
    if (!winner || length > winner.length || (length === winner.length && rule.allow && !winner.allow)) winner = { ...rule, length };
  }
  return { allowed: !winner || winner.allow, rule: winner ? `${winner.allow ? "Allow" : "Disallow"}: ${winner.path}` : null };
}

/** Sitemap XML: <loc> values, <lastmod> values and whether the document is a well-formed urlset (enough for a 50-URL site). */
export function parseSitemap(xml) {
  const text = String(xml || "");
  const urls = [...text.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: (/<loc>\s*([^<]+?)\s*<\/loc>/.exec(m[1]) || [])[1] || null,
    lastmod: (/<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(m[1]) || [])[1] || null,
  }));
  const valid = /^\s*(<\?xml[^>]*\?>\s*)?<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"[^>]*>[\s\S]*<\/urlset>\s*$/.test(text)
    && urls.every((u) => u.loc) && (text.match(/<url>/g) || []).length === (text.match(/<\/url>/g) || []).length;
  return { valid, urls, locs: urls.map((u) => u.loc).filter(Boolean) };
}

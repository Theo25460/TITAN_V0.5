// Provenance and indexing context of a public build (docs/seo/SEO_GUARD.md).
// - /build-info.json names the commit, the Netlify context and the deploy: a smoke test can then prove WHICH version is online
//   (a green check on another commit proves nothing). It holds no secret: the repository is public and Netlify shows the same data.
// - A non-production Netlify build (deploy preview, branch deploy, netlify dev) gets dist/_headers with a blanket noindex. Netlify adds
//   one to Deploy Previews by itself but not to the latest deploy of a branch. The file is written ONLY for those explicit contexts:
//   an empty or unknown CONTEXT never produces it, so a production build can never be de-indexed by a missing variable.
import { execFileSync } from "node:child_process";

export const NON_PRODUCTION_CONTEXTS = new Set(["deploy-preview", "branch-deploy", "dev"]);

function gitHead(cwd) {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null; } catch { return null; }
}

export function buildContext(env = process.env, { cwd = process.cwd() } = {}) {
  const onNetlify = env.NETLIFY === "true";
  const commit = /^[0-9a-f]{40}$/.test(env.COMMIT_REF || "") ? env.COMMIT_REF : gitHead(cwd);
  return {
    commit: commit || null,
    context: onNetlify ? env.CONTEXT || "unknown" : "local",
    branch: onNetlify ? env.BRANCH || env.HEAD || null : null,
    deployId: onNetlify ? env.DEPLOY_ID || null : null,
    reviewId: onNetlify && env.REVIEW_ID ? env.REVIEW_ID : null,
  };
}

/** The dist/_headers content for this context, or null (production, local, CI, unknown). */
export function previewHeaders(info) {
  if (!NON_PRODUCTION_CONTEXTS.has(info.context)) return null;
  return `# Written by tools/build-public.mjs for the Netlify context "${info.context}" only, never for production.\n/*\n  X-Robots-Tag: noindex\n`;
}

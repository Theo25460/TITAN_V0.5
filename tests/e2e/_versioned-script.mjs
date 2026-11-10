import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export async function watchScriptRevision(page, pathname, { current, previous }) {
  const digest = sha256(readFileSync(new URL(`../..${pathname}`, import.meta.url)));
  const requests = [];
  page.on("request", request => {
    if (request.resourceType() === "script" && new URL(request.url()).pathname === pathname) requests.push(request);
  });
  await page.route(url => url.pathname === pathname && url.searchParams.get("v") === previous,
    route => route.fulfill({ contentType: "text/javascript", body: "window.previousVersionedScriptExecuted = true;" }));

  return async () => {
    assert.equal(await page.evaluate(() => Boolean(window.previousVersionedScriptExecuted)), false, `${pathname}: predecessor executed`);
    const scripts = await page.locator("script[src]").evaluateAll((tags, path) =>
      tags.map(tag => new URL(tag.src)).filter(url => url.pathname === path).map(url => url.href), pathname);
    assert.equal(scripts.length, 1, `${pathname}: one script tag`);
    const url = new URL(scripts[0]);
    assert.equal(url.origin, new URL(page.url()).origin, `${pathname}: first-party script`);
    assert.deepEqual(url.searchParams.getAll("v"), [current], `${pathname}: current version`);
    assert.deepEqual(url.searchParams.getAll("rev"), [digest.slice(0, 12)], `${pathname}: revision of the current source`);
    assert.deepEqual(requests.map(request => request.url()), [url.href], `${pathname}: only the current URL was requested`);
    const response = await requests[0].response();
    assert.ok(response?.ok(), `${pathname}: script response succeeded`);
    assert.equal(sha256(await response.body()), digest, `${pathname}: served bytes match the current source`);
  };
}

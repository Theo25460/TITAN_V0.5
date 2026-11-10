import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/app/profil.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf("  const GARMIN_RESULTS ="), source.indexOf("  function start()"));

function harness(query, { linked = true, guest = false, hold = false } = {}) {
  const notices = [], requests = [], urls = [];
  let owner = "a", release, markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const context = {
    owner: "a",
    client: {
      rpc(name) {
        const request = { name };
        requests.push(request);
        const result = { data: { linked }, error: null };
        const task = hold ? new Promise(resolve => { release = () => resolve(result); }) : Promise.resolve(result);
        task.setHeader = (_, token) => { request.token = token; return task; };
        markStarted();
        return task;
      },
    },
  };
  const api = vm.runInNewContext(code + "\n({ garminReturn, linked: () => garminLinked })", {
    URLSearchParams, setTimeout, clearTimeout,
    location: { search: query, pathname: "/profile", hash: "#sources" },
    history: { replaceState: (_, __, url) => urls.push(url) },
    window: { titanShell: { toast: notice => notices.push(notice) } },
    guest: () => guest,
    bitsContext: context,
    bitsCurrent: job => job.context === context && owner === context.owner,
    readBitsSession: async () => ({ access_token: "token-a", user: { id: "a" } }),
    garminLinked: null,
    garminDailiesAuthorized: false,
    render() {},
  });
  return { ...api, notices, requests, urls, started, switchOwner: () => { owner = "b"; }, release: () => release() };
}

test("Garmin error stage gives a support code and removes the callback query", async () => {
  for (const reason of ["state", "code", "token", "identity", "permissions", "link", "storage"]) {
    const h = harness("?garmin=error&garmin_reason=" + reason);
    await h.garminReturn();
    assert.match(h.notices[0].message, new RegExp("GARMIN_" + reason.toUpperCase()));
    assert.deepEqual(h.urls, ["/profile#sources"]);
    assert.equal(h.requests.length, 0);
  }
  for (const reason of ["secret-value", "__proto__"]) {
    const h = harness("?garmin=error&garmin_reason=" + reason);
    await h.garminReturn();
    assert.equal(h.notices.length, 1);
    assert.doesNotMatch(h.notices[0].message, new RegExp(reason));
  }
});

test("Garmin success requires confirmation with the current account's session", async () => {
  const absent = harness("?garmin=ok", { linked: false });
  await absent.garminReturn();
  assert.equal(absent.linked(), false);
  assert.deepEqual(absent.requests, [{ name: "titan_garmin_status_v1", token: "Bearer token-a" }]);
  assert.notEqual(absent.notices[0].type, "ok");
  const linked = harness("?garmin=ok");
  await linked.garminReturn();
  assert.equal(linked.linked(), true);
  assert.equal(linked.notices[0].type, "ok");
  const discovery = harness("?garmin=ok", { guest: true });
  await discovery.garminReturn();
  assert.equal(discovery.requests.length, 0);
  assert.match(discovery.notices[0].title, /confirmation requise/);
});

test("late Garmin confirmation cannot cross an account change", { timeout: 2000 }, async () => {
  const h = harness("?garmin=ok", { hold: true });
  const pending = h.garminReturn();
  await h.started;
  h.switchOwner();
  h.release();
  await pending;
  assert.equal(h.linked(), null);
  assert.equal(h.notices.length, 0);
});

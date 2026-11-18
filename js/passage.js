/* TITAN — « le passage ». Read in the <head> of every page that opts in to cross-document view transitions (css/signature.css,
   css/public.css), so it is there before the page is first shown. A transition the browser gives up (the next page does not opt
   in, the page was already revealed by the back-forward cache, the tab is hidden) rejects its promises; nothing is wrong, so the
   rejection is answered here instead of being reported as an error of the page. */
(function () {
  "use strict";
  function quiet(transition) {
    if (!transition) return;
    ["ready", "finished", "updateCallbackDone"].forEach(function (name) {
      var promise = transition[name];
      if (promise && typeof promise.catch === "function") promise.catch(function () {});
    });
  }
  window.addEventListener("pagereveal", function (event) { quiet(event.viewTransition); });
  window.addEventListener("pageswap", function (event) { quiet(event.viewTransition); });
  // A transition given up before the page is revealed (the page changed its own address first, for instance) never reaches
  // « pagereveal »: its promises cannot be answered there. Only that exact rejection of the browser is answered here.
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    if (reason && (reason.name === "InvalidStateError" || reason.name === "AbortError" || reason.name === "TimeoutError") && /^Transition was (aborted|skipped)/.test(String(reason.message || ""))) event.preventDefault();
  });
})();

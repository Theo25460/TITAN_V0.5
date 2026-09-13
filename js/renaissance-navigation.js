(function () {
  "use strict";
  const ids = ["scout", "ranger", "keeper", "artisan", "navigator", "sentinel"];
  function character() {
    const id = window.state?.user?.id;
    if (!id) return null;
    if (window.TitanAdventure?.snapshot?.owner === id)
      return window.TitanAdventure.snapshot;
    try {
      const s = JSON.parse(
        localStorage.getItem("titan_adventure_v1:" + id) || "null",
      );
      return s?.owner === id ? s : null;
    } catch {
      return null;
    }
  }
  window.titanNavigationUser = function () {
    const u = window.state?.user || {},
      s = character();
    return {
      ...u,
      level: s?.level ?? u.level ?? 1,
      credits: s?.credits ?? u.credits ?? 0,
    };
  };
  window.titanNavigationAvatar = function () {
    const s = character(),
      id = ids.includes(s?.avatar) ? s.avatar : "scout";
    return `<img src="/assets/renaissance/${id}.webp" width="640" height="640" class="avatar-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="Personnage TITAN">`;
  };
  let signature = "";
  function refresh() {
    const u = window.titanNavigationUser(),
      s = character(),
      next = [u.id, u.level, s?.avatar, u.name].join("|");
    if (next === signature) return;
    signature = next;
    window.injectSidebar?.();
    if (!document.body.classList.contains("mobile-menu-open"))
      window.injectMobileHeader?.();
  }
  window.addEventListener("titan:adventure-updated", refresh);
  document.addEventListener("DOMContentLoaded", refresh);
  refresh();
})();

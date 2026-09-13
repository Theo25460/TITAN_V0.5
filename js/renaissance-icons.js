(function (root) {
  "use strict";
  const paths = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    phone:
      '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    weight: '<path d="M7 5v14M3 8v8m14-11v14m4-11v8M7 12h10"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    compass:
      '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chart: '<path d="M4 4v16h16M7 15l4-5 4 3 5-7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    journal:
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18m3-13h5m-5 4h5"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
    crown: '<path d="m3 6 4 5 5-8 5 8 4-5-2 13H5ZM6 22h12"/>',
    shield:
      '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    flag: '<path d="M5 22V3c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
    mountain: '<path d="m2 20 8-15 5 8 3-5 5 12Zm5-9 3 2 2-2"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
    star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    trophy:
      '<path d="M8 3h8v7a4 4 0 0 1-8 0Zm0 2H3v3a5 5 0 0 0 5 5m8-8h5v3a5 5 0 0 1-5 5m-4 1v5m-5 2h10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    leaf: '<path d="M20 3C7 2 2 8 5 15s15 3 15-12ZM3 22 15 9"/>',
    layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    filter: '<path d="M4 6h16M7 12h10m-6 6h2"/>',
    edit: '<path d="m15 3 6 6L8 22H2v-6ZM12 6l6 6"/>',
    close: '<path d="m5 5 14 14M19 5 5 19"/>',
    group:
      '<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m0-16a3 3 0 0 1 0 6m3 4a5 5 0 0 1 3 4v2"/>',
    target:
      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01"/>',
    route:
      '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h8"/>',
    heart:
      '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 1 10 8 16 7-6 13-11 8-16Z"/>',
    medal:
      '<circle cx="12" cy="15" r="6"/><path d="m6 3 4 7m8-7-4 7M9 3h6m-3 9v6m-3-3h6"/>',
  };
  const legacy = {
    "ri-home-5-line": "home",
    "ri-compass-3-line": "compass",
    "ri-add-circle-line": "plus",
    "ri-calendar-check-line": "journal",
    "ri-line-chart-line": "chart",
    "ri-user-3-line": "user",
    "ri-file-chart-line": "chart",
    "ri-team-line": "group",
    "ri-message-3-line": "journal",
    "ri-trophy-line": "trophy",
    "ri-heart-pulse-line": "heart",
    "ri-medal-2-line": "medal",
    "ri-route-line": "route",
    "ri-palette-line": "star",
    "ri-lifebuoy-line": "help",
    "ri-flag-line": "flag",
    "ri-book-open-line": "journal",
    "ri-shield-check-line": "shield",
    "ri-question-line": "help",
  };
  root.titanIcon = function (name, className = "") {
    const key = legacy[name] || name;
    return `<svg class="t-icon ${/^[a-z -]*$/.test(className) ? className : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key] || paths.compass}</svg>`;
  };
})(typeof window === "undefined" ? globalThis : window);

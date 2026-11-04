/* Preview only: the screen and data state come from the URL hash, e.g. #World?id=aube or #QG&state=empty. */
const hash = typeof window !== "undefined" ? decodeURIComponent(window.location.hash.slice(1)) : "";
const [route, query = ""] = hash.split("?");
const params = Object.fromEntries(new URLSearchParams(query.replace(/&state=[^&]*/, "")));
const state = (hash.match(/[?&]state=([a-z]+)/) || [])[1] || "full";

export const AUTH_SCREENS = ["Welcome", "Login", "Signup", "Forgot"];
export const previewState = {
  route: (route.split("&")[0] || "QG") as string,
  params: params as Record<string, string>,
  empty: state === "empty" || state === "new",
  fresh: state === "new", // account never onboarded
  loading: state === "loading",
  signedOut: AUTH_SCREENS.includes(route.split("&")[0]),
};

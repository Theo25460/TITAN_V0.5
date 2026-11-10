/* The website insight engine returns web paths ("/training?sport=running", "/journal"...): map them to native screens. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nav = { navigate: (...args: any[]) => void };

export function navigateHref(navigation: Nav, href: string) {
  const [pathname, fragment] = href.split("#", 2);
  const [path, query = ""] = pathname!.split("?", 2);
  const params = Object.fromEntries(new URLSearchParams(query));
  const clean = path?.replace(/\/+$/, "") || "/";
  switch (clean) {
    case "/training":
      if (params.sport) return navigation.navigate("SessionForm", { sport: params.sport });
      return navigation.navigate("Tabs", { screen: "Record" });
    case "/journal":
      if (fragment === "attente") return navigation.navigate("Pending");
      return navigation.navigate("Journal", params.sport ? { sport: params.sport } : undefined);
    case "/records":
      return navigation.navigate("Records");
    case "/objectifs":
      return navigation.navigate("Goals");
    case "/prevoir":
      return navigation.navigate("Plan");
    case "/stats":
      return navigation.navigate("Tabs", { screen: "Progress" });
    case "/adventure":
      if (fragment === "sentiers") return navigation.navigate("Sentiers");
      if (params.world) return navigation.navigate("World", { id: params.world });
      return navigation.navigate("Tabs", { screen: "Adventure" });
    case "/profile":
      return navigation.navigate("Tabs", { screen: "Profile" });
    case "/social":
      return navigation.navigate("Community");
    case "/boutique":
      return navigation.navigate("Atelier");
    case "/aujourdhui":
      return navigation.navigate("Tabs", { screen: "QG" });
    default:
      return navigation.navigate("Tabs", { screen: "QG" });
  }
}

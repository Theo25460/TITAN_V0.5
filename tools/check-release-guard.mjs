// Release guard (production incident of 4 November 2026): a Git-linked Netlify build of a branch that lacks the sign-in or the
// server functions replaced a healthy site. This script runs BEFORE every Netlify build (netlify.toml) and in the test suite.
// If it fails, the build fails and Netlify keeps serving the previous deploy: an incomplete branch can never be published.
// No network, no dependency: it only reads the repository.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");
const problems = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };

// Git integration may start a production build as soon as main moves. Approve an exact SHA only after release checks.
if (process.env.NETLIFY === "true" && process.env.CONTEXT === "production") {
  const commit = process.env.COMMIT_REF || "";
  need(/^[a-f0-9]{40}$/.test(commit) && process.env.TITAN_APPROVED_RELEASE_SHA === commit,
    "SHA de production non autorisé : TITAN_APPROVED_RELEASE_SHA doit correspondre au commit validé pour cette mise en ligne");
}

// 1. Server functions that must ship: each Netlify entry exists and re-exports an existing implementation.
const FUNCTIONS = ["assistance", "garmin", "play-billing", "play-notifications", "play-reconcile", "webhook"];
for (const name of FUNCTIONS) {
  const entry = read(`netlify/functions/${name}.mts`);
  need(!!entry, `fonction manquante : netlify/functions/${name}.mts`);
  const target = /from '\.\.\/\.\.\/functions\/([\w-]+\.mjs)'/.exec(entry)?.[1];
  need(!!target && existsSync(join(root, "functions", target)), `l'implémentation de ${name} est introuvable (functions/${target ?? "?"})`);
}
const toml = read("netlify.toml");
need(/\[functions\][^\[]*directory\s*=\s*"netlify\/functions"/s.test(toml), 'netlify.toml : [functions] directory = "netlify/functions" absent');
need(toml.includes("/auth/garmin/callback"), "netlify.toml : adresse de retour Garmin absente");
need(read("netlify/functions/play-reconcile.mts").includes("schedule"), "play-reconcile n'est plus planifiée");

// 2. Sign-in: Google button behind the server flag, the OAuth call, and the e-mail form.
const auth = read("js/app/auth.js");
need(auth.includes("data-google") && auth.includes("Continuer avec Google"), "js/app/auth.js : le bouton « Continuer avec Google » a disparu");
need(auth.includes('"auth.google"') && auth.includes("titan_feature_flags_v1"), "js/app/auth.js : la lecture du drapeau auth.google a disparu");
need(/signInWithOAuth\(\{\s*provider:\s*"google"/.test(auth), "js/app/auth.js : l'appel OAuth Google a disparu");
need(auth.includes("signInWithPassword"), "js/app/auth.js : la connexion par e-mail a disparu");

// 3. The Supabase SDK is shipped. Every page that creates the client loads it BEFORE config.js, except the sign-in page, which loads it
//    AFTER auth.js on purpose (the form paints first: measured mobile LCP 2.7 s -> 1.7 s) and whose actions wait for the client.
need(existsSync(join(root, "js/vendor/supabase-2.111.0.js")), "le SDK Supabase (js/vendor/supabase-2.111.0.js) est absent");
for (const f of readdirSync(root).filter((n) => n.endsWith(".html"))) {
  const html = read(f);
  const config = html.indexOf("/js/config.js");
  if (config < 0) continue;
  const sdk = html.indexOf("/js/vendor/supabase-");
  if (f === "login.html") { need(sdk >= 0, "login.html : le SDK Supabase n'est plus chargé"); continue; }
  need(sdk >= 0 && sdk < config, `${f} : le SDK Supabase doit être chargé avant js/config.js`);
}
need(read("login.html").includes("js/app/auth.js"), "login.html ne charge plus js/app/auth.js");
need(auth.includes("waitForTitanSupabase"), "js/app/auth.js n'attend plus le client Supabase (chargé après le formulaire)");

// 4. The build command runs this guard first.
need(/command\s*=\s*"node tools\/check-release-guard\.mjs && node tools\/build-public\.mjs"/.test(toml), "netlify.toml : la commande de build doit lancer tools/check-release-guard.mjs avant la construction");

if (problems.length) {
  console.error("GARDE DE PUBLICATION : build refusée, l'ancien déploiement reste en ligne.\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Garde de publication : ${FUNCTIONS.length} fonctions, connexion Google + e-mail, SDK avant config : OK`);

// Instagram carousels (1080x1350 PNG) of the launch batch. Usage: node carousels.mjs <outDir>
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const HERE = resolve(new URL(".", import.meta.url).pathname);
const A = "../../assets/renaissance/";
export const CAROUSELS = [
  { id: "C1-apres-ta-seance", slides: [
    { kind: "cover", bg: A + "valley.webp", kicker: "TITAN Ascent", title: "Ce qui se passe\naprès ta séance.", sub: "Dans une appli où l'XP\nse gagne vraiment." },
    { kind: "screen", img: "SessionForm_sport_running.png", off: -70, kicker: "Étape 1", title: "Tu notes\nl'essentiel.", size: "m", sub: "Sport, distance, durée. Ou un fichier GPX." },
    { kind: "screen", img: "SessionResult_eventId_record.png", off: -360, kicker: "Étape 2", title: "Le serveur\nconfirme.", size: "m", sub: "Pas de séance confirmée, pas d'XP." },
    { kind: "screen", img: "Records.png", off: -150, kicker: "Étape 3", title: "Tes records\nse datent.", size: "m", sub: "Avec la séance qui le prouve." },
    { kind: "screen", img: "World_id_aube.png", off: -140, kicker: "Étape 4", title: "Ton monde\navance.", size: "m", sub: "Tes jours actifs rallument des balises." },
    { kind: "cta", title: "Rallume le monde.\nPour de vrai.", size: "m", sub: "Gratuit · sans publicité.\nDans ton navigateur, Android ou iPhone.\n\nEnregistre ce post pour ta prochaine séance." },
  ] },
  { id: "C2-coche-ou-gagne", slides: [
    { kind: "cover", kicker: "Gamification sportive", title: "Ton appli\n« level up »\nte dit-elle\nla vérité ?" },
    { kind: "text", kicker: "La différence", title: "Coché\nou gagné ?", size: "m", extra: `<div class="vs"><div><b>Coché</b>Tu déclares « 100 pompes ». Tu gagnes l'XP. Personne ne vérifie.</div><div class="g"><b>Gagné</b>Ta séance est confirmée par le serveur, puis convertie en minutes d'effort.</div></div>` },
    { kind: "text", kicker: "Règle n° 1", title: "Tous les sports\nse valent.", size: "m", sub: "1 h d'escalade = 1 h de course,\nà intensité égale.\n\n260 sports, une seule règle :\ntes minutes d'effort." },
    { kind: "screen", img: "Plan.png", off: -120, kicker: "Règle n° 2", title: "Pas de série\nà casser.", size: "m", sub: "Une pause ne te fait rien perdre." },
    { kind: "screen", img: "Atelier.png", off: -60, kicker: "Règle n° 3", title: "Rien ne s'achète\npour progresser.", size: "m", sub: "Les crédits viennent de tes séances." },
    { kind: "cta", title: "L'XP ne se coche pas.\nElle se gagne.", size: "m", sub: "TITAN Ascent, gratuit et sans publicité.\n\nEt toi, tu choisis quoi ?\nDis-le en commentaire." },
  ] },
];
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto("file://" + join(HERE, "carousel.html"));
for (const c of CAROUSELS) {
  mkdirSync(join(out, c.id), { recursive: true });
  for (let i = 0; i < c.slides.length; i++) {
    await page.evaluate(([s, i, n]) => window.show(s, i, n), [c.slides[i], i, c.slides.length]);
    await page.screenshot({ path: join(out, c.id, `${String(i + 1).padStart(2, "0")}.png`) });
  }
  console.log("ok", c.id);
}
await browser.close();

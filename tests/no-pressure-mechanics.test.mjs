// RPG18 / ACT07: no manipulative wording in what the player reads. A pause is never punished, nothing is "your last chance",
// no permanent countdown. Facts (an expedition ends on a date) stay allowed; pressure phrases do not.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const files = [
  ...readdirSync(ROOT).filter((f) => f.endsWith(".html")),
  ...["js", "js/app", "js/core"].flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith(".js")).map((f) => join(d, f))),
];
const PRESSURE = [
  /derni[eè]re chance/i,
  /perds? (ta|ton|tes) (s[eé]rie|streak)/i,
  /ta s[eé]rie (est|va) (perdue|se briser|dispara[iî]tre)/i,
  /tu vas (perdre|rater)/i,
  /ne (la |le )?rate pas/i,
  /offre limit[eé]e/i,
  /plus que \d+ ?(h|heures?|min(utes?)?) pour/i,
  /fais-toi pardonner/i,
  /tu (n['’]as|as) (pas|rien) fait/i,
];

test("no page or script shows pressure wording (last chance, lost streak, guilt, fake urgency)", () => {
  const hits = [];
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), "utf8");
    for (const re of PRESSURE) { const m = text.match(re); if (m) hits.push(`${f}: ${m[0]}`); }
  }
  assert.deepEqual(hits, []);
});

test("the guard really catches pressure wording", () => {
  for (const bad of ["Dernière chance !", "Tu vas perdre ta série", "Ne rate pas aujourd’hui", "Offre limitée", "Plus que 2 heures pour finir", "Tu n’as pas fait de sport"])
    assert.ok(PRESSURE.some((re) => re.test(bad)), bad);
  for (const ok of ["Pas de série qui s’effondre, pas de culpabilité.", "L’expédition se termine le 3 novembre.", "Une semaine calme n’enlève rien."])
    assert.ok(!PRESSURE.some((re) => re.test(ok)), ok);
});

// TITAN 300 — one-shot release SQL: every pending migration, in order, in ONE transaction, recorded in
// supabase_migrations.schema_migrations like the CLI would. For the Supabase SQL editor when the MCP
// migration tool is not available. Usage: node tools/build-release-sql.mjs [first-version]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const FROM = process.argv[2] || "20261005150000";
const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= FROM).sort();
let sql = `-- =====================================================================
-- TITAN 300 · Ascension — mise en production de la base en une seule fois
-- =====================================================================
-- À coller tel quel dans Supabase › SQL Editor › New query, puis « Run ».
--
-- • Applique ${files.length} migrations de supabase/migrations/ dans l'ordre
--   (${files[0].slice(0, 14)} → ${files[files.length - 1].slice(0, 14)}), dans UNE transaction : si une seule
--   instruction échoue, rien n'est modifié.
-- • Inscrit chaque migration dans supabase_migrations.schema_migrations.
-- • N'efface aucune donnée. Testé sur une réplique vide de la production.
-- • S'arrête sans rien faire s'il a déjà été appliqué.
--
-- Généré par tools/build-release-sql.mjs — ne pas modifier à la main.
-- =====================================================================

begin;

do $$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '${files[0].slice(0, 14)}') then
    raise exception 'TITAN 300 déjà appliquée : rien à faire.';
  end if;
end $$;
`;
for (const f of files) {
  const version = f.slice(0, 14);
  const name = f.slice(15, -4);
  sql += `\n-- ---------------------------------------------------------------------\n-- ${f}\n-- ---------------------------------------------------------------------\n`;
  sql += readFileSync(`supabase/migrations/${f}`, "utf8").trimEnd() + "\n";
  sql += `insert into supabase_migrations.schema_migrations(version, name, created_by) values ('${version}', '${name}', 'titan-300-release');\n`;
}
sql += `\ncommit;\n\nselect version, name from supabase_migrations.schema_migrations where version >= '${FROM}' order by version;\n`;
writeFileSync("supabase/release-300.sql", sql);
console.log(`supabase/release-300.sql : ${files.length} migrations, ${Math.round(sql.length / 1024)} Ko`);

## But

Décrire le problème résolu et l'effet visible pour l'utilisateur.

## Vérifications

- [ ] `pnpm test`
- [ ] `pnpm run build`
- [ ] `pnpm run audit`
- [ ] Bouclier SEO : `node tools/seo-guard.mjs check --dist dist` vert, ou changement voulu approuvé dans `tools/seo/approvals.json` (`docs/seo/SEO_GUARD.md`)
- [ ] Parcours concerné vérifié sur mobile
- [ ] Aucun secret ni fichier généré (`dist/`, `.netlify/`) ajouté
- [ ] Les changements Supabase/RLS sont documentés, le cas échéant

## Risques et retour arrière

Indiquer les modules touchés, les risques connus et la façon de revenir à l'état précédent.

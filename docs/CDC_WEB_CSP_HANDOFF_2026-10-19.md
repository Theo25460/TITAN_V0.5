# Handoff — CSP resserrée (LEG40, LEG41, SEC03)

Chantier AUTRE — Claude Code, 19/10/2026, au-dessus de `4e9149f`. Aucune fusion, aucun déploiement : l'en-tête ne change en production qu'au prochain déploiement du site.

## Décision

Retirer de la Content-Security-Policy les quatre hôtes que rien ne charge : `cdn.jsdelivr.net`, `unpkg.com`, `fonts.googleapis.com`, `fonts.gstatic.com`. Politique résultante (une seule ligne dans `netlify.toml`) : `script-src 'self' 'unsafe-inline' https://cdn.paddle.com`, `style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`, le reste inchangé (`img-src` garde `https:`).

## Résultat

| Point | Statut proposé | Ce qui le justifie |
|---|---|---|
| LEG40 — inventaire des traceurs et tiers | reste `[~]` | L'inventaire (`docs/third-party-hosts.json`, `docs/PRIVACY_TECHNICAL_INVENTORY.md`) ne liste plus ces quatre hôtes ; le test d'inventaire compare la CSP au JSON. |
| LEG41 — pas de contact tiers superflu | reste `[ ]` | Une partie seulement (surface réseau) ; le CMP et les interfaces de consentement ne sont pas traités. |
| SEC03 — injection | reste `[~]` | La surface de scripts autorisés se réduit à `'self'`, `'unsafe-inline'` et Paddle. `'unsafe-inline'` demeure : il faudrait des nonces ou des empreintes pour les scripts en ligne des pages, travail distinct. |

## Revue

Revue de code unique : aucune casse de production trouvée (aucune ressource chargée depuis les hôtes retirés ; `tools/vendor-runtime.mjs` est un outil de construction non livré ; la CSP est unique dans `netlify.toml`). Traité : échantillon de pages remplacé par toutes les pages construites, sonde Paddle ajoutée, durée d'attente réduite. Non traité : parcours connectés et contenus venus de la base non rejoués ; un vieux paragraphe de `docs/AUDIT_REPRISE_2026-10.md` D7 (préconnexions, Leaflet) est périmé. À vérifier en sandbox : `Permissions-Policy: payment=(self)` (`netlify.toml`) peut empêcher Apple Pay / Payment Request dans le cadre Paddle si le cadre n'a pas la délégation `payment`.

## Preuve de sûreté

- Ces hôtes n'apparaissaient dans aucun fichier livré hors de la CSP (test d'inventaire existant), polices et icônes sont hébergées.
- `tests/e2e/csp-browser.e2e.mjs` (ajouté à `test:e2e`) attache la politique **exacte** de `netlify.toml` à chaque document dans Chromium (le serveur local ne rejoue pas les en-têtes de production) et exige zéro violation sur **toutes les pages construites** (`dist/*.html`, 44 pages ; une première version en listait 15 dont deux retombaient sur l'accueil, relevé par la revue) et que le script de paiement `https://cdn.paddle.com/paddle/v2/paddle.js`, injecté comme en production, ne soit pas bloqué (vérifié : retirer Paddle de `script-src` fait échouer le test). Il détecte bien un blocage : un script tiers injecté dans une page fait échouer le test (vérifié).
- Limites de cette preuve : parcours connectés non rejoués sous la CSP (Supabase autorisé inchangé), paiement Paddle non exercé (les hôtes Paddle sont inchangés), contenus venus de la base non couverts.

## BLOQUANT À CORRIGER MAINTENANT

Aucun Critical/Important connu ouvert.

## NON BLOQUANT / BACKLOG FINITION

- `img-src https:` à resserrer après audit des images de contenu ; `'unsafe-inline'` à retirer avec des nonces.
- Après déploiement : surveiller les violations dans la console des pages publiques et d'administration, et le paiement TITAN+ en sandbox.
- Retour arrière immédiat possible en remettant les quatre hôtes (aucune donnée).

## EXIGENCE OU MACRO-BLOC À ATTAQUER ENSUITE

Audit des images de contenu ; consentement (LEG41/CMP) ; nonces.

## Retour arrière

Remettre les quatre hôtes dans la ligne `Content-Security-Policy` de `netlify.toml` et leurs quatre entrées dans `docs/third-party-hosts.json`.

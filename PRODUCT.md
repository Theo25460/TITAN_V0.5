# Product

TITAN — a multisport tracking app whose RPG is fed only by real effort. Written on 16 November 2026 from the owner's written
briefs (« Opération Genesis », « Opération Masterpiece ») and `docs/TITAN_ONE.md`; no interview took place for this file (the
owner asked for autonomous execution and a tool question sent the same day got no answer). Correct anything that is wrong here.

## Platform

adaptive

## Stack

- Android: React Native 0.86 / Expo SDK 57, TypeScript, React Navigation (native stack + bottom tabs), react-native-svg,
  Reanimated. Source in `mobile/`.
- Web: static HTML, CSS and vanilla JS (`css/ascension*.css`, `js/app/*`), PWA, Netlify. No framework, no bundler.
- Backend: Supabase (PostgreSQL). XP, credits and ownership are written by server functions only.
- Business rules shared by both clients: `js/core/*.js`, copied unchanged to `mobile/src/core/web/`.

## Users

Amateur athletes of every level and of 260 sports (running, strength, climbing, team sports, yoga…), French-speaking first.
They open TITAN on a phone right after — or during — a session: one hand, tired, sometimes outdoors in daylight, sometimes in a
gym. They come back in the evening to look at their progress. Many have used Strava, Garmin Connect or Hevy.

## Product Purpose

« Tu fais du sport. TITAN transforme tes efforts en progression et en aventure. »
Three pillars: a sport companion that is useful without the game (log fast, measure right, understand progress); an RPG where
objective → effort → result → progression → a world that changes; a social layer built on real relationships and fairness.

## Positioning

A serious competitor to the large sport apps, recognisable without its logo. Not a feed of other people's performances and not
a casino: no pressure mechanics, nothing bought gives an advantage.

## Operating Context

Daily use on a smartphone is the priority. A session must be recordable in about a minute. TITAN LIVE runs while the athlete
moves: sport figures stay readable at arm's length before anything narrative. The website serves the same account on desktop
and must use wide screens.

## Capabilities and Constraints

- Real effort only: no XP, credit or reward without a session confirmed by the server; a success is never shown before it is confirmed.
- The RPG never delays logging a session.
- Offline first on Android: sessions queue on the phone.
- Existing approved art: four sculpted steel rank crests (Éclaireur, Explorateur, Sentinelle, Gardien), four painted worlds,
  four guardians, class portraits. Crests for Champion, Titan and Légende do not exist yet; the image generator available to
  the agent has no credit.
- Font shipped: Archivo only, in three widths (text, condensed titles, extra-condensed figures). Licence: OFL.
- Android back gesture, 48 dp targets, text scaling to 200 %, reduced motion are respected today and must stay so.

## Brand Commitments

- Sporty, sober, immersive. The owner rejects « dashboard sombre + rectangles + accent cyan », stacked bordered cards on every
  screen, generic icon-in-a-ring rewards, and five screens that look like variants of one.
- The ascent is TITAN's motif (mountain, trail, waypoints, summit); the mark is a double chevron.
- Each space has its own character: QG alive and action-led; Séance fast and plain; LIVE immersive but never hiding sport data;
  Aventure about exploring; Statistiques precise; Profil elegant and short; Communauté warm; Récompenses precious.
- One TITAN on Android and on the web.

## Evidence on Hand

- Screens before the redesign: browser simulation of the Android app (`mobile/scripts/preview-shots.mjs`), 16 November 2026.
- No user test, no real-device session, no analytics on comprehension. LCP measured on four web pages (2,7–3,1 s, emulated phone).

## Product Principles

1. Effort is the only currency.
2. The sport figure comes first; the story follows it.
3. Rest costs nothing.
4. Say what is true: unavailable is said as unavailable, pending as pending.

## Accessibility & Inclusion

French UI. TalkBack labels on every control, contrast 4.5:1 for text, system text size honoured up to 200 %, reduced motion
honoured, colour never the only carrier of a state. All sports and all levels are equal in the rules (effort minutes).

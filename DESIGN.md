# TITAN — « Programme », the visual system

One TITAN on Android and on the web. This file describes the system as it is built on 16 November 2026: the Android app
(`mobile/src/theme/tokens.ts`, commit `425047f`) and the website (`css/ascension.css`, `css/ascension-app.css`). When the two
differ, the difference is named here. Product intent lives in `PRODUCT.md`.

The idea in one sentence: **a night ground, one flat bright colour per space of the app, one type family in three widths, and
the practice drawn as the programme of a sports meeting**. Cards are not the structure of a page.

## 1. Colour

### Ground and text

| Token (web / Android) | Value | Use |
|---|---|---|
| `--bg` / `bg` | `#090C10` | The ground of every page |
| `--bg-1` / `bg1` | `#0D1116` | Fields one types in, the quietest tone |
| `--bg-2` / `bg2` | `#131920` | The default panel: one tone above the ground, no outline |
| `--bg-3` / `bg3` | `#1A222C` | A block inside a panel, chips |
| `--bg-4` / `bg4` | `#232D39` | Tracks of bars, toasts, the floating save bar |
| `--line`, `--line-2`, `--line-3` | chalk `rgb(226 234 236)` at 9 %, 17 %, 30 % | Hairlines. `--line-2` is the rule between rows |
| `--line-4` (web) | the same at 42 % | The edge of an input (3.4:1 on the ground) |
| `--tx` / `tx` | `#F1F3EF` | Text, and the 2 px rule that opens a section |
| `--tx-2` / `tx2` | `#AEB7BD` | Secondary text (9.6:1 on the ground) |
| `--tx-3` / `tx3` | `#838E97` | Faint text (5.9:1 on the ground, 4.8:1 on `bg-3`; not on `bg-4`) |
| `--tx-4` / `tx4` | `#525C66` | Marks and disabled states only, never a sentence |

### One colour per space

Each space has a flat colour and the ink that is written on it. The colour fills the header field of the space and is its
action colour: primary button, selected chip or tab, link, focus ring, current navigation item.

| Space | What it holds | Colour | Ink | Ink on colour |
|---|---|---|---|---|
| QG | home | cyan `#3DD9E8` | `#02181B` | 10.7:1 |
| Séance | record, session form, TITAN LIVE, planned week | lime `#D7F25A` | `#161C00` | 14.0:1 |
| Progrès | week, journal, records, career, goals | azure `#9CC3FF` | `#06142E` | 10.2:1 |
| Aventure | worlds, sentiers | moss `#7FE0B0` | `#032012` | 10.8:1 |
| Profil | profile, settings, Atelier, account, help | chalk `#E9EDE8` | `#0E1216` | 15.9:1 |
| Communauté | community, coaching, challenges | coral `#FF9B7A` | `#2A0B02` | 8.9:1 |

On the web a page takes its space from `<body data-territory="…">` (the attribute the shell already reads), which sets
`--space`, `--space-hi` (hover), `--space-ink`, `--space-soft`, `--space-line` and `--space-field`. A block can be set in
another space with `data-space="qg|seance|progres|aventure|profil|cercle"`. On Android a screen takes its space from its
route (`mobile/src/theme/space.tsx`).

Three colours mean the same thing everywhere, whatever the space:

- **Cyan `--cy` is progression**: XP, level bars, held weeks. A bar of progression is cyan on the lime Séance pages too.
- **Amber `--am` `#F4BB54` (ink `#1D1302`) is records** and rare moments.
- **Lime is « I record »**: the record action of the navigation is lime in every space.

Sport family colours (`--fam-endurance` `#3DD9E8`, `--fam-force` `#7C93FF`, `--fam-technique` `#B693FF`, `--fam-jeu`
`#57D39B`, `--fam-mobilite` `#8EA2B3`) are for data only: the cells of the programme, the icon of a session, a share bar.
States: `--ok` `#57D39B`, `--warn` `#F0A24A`, `--err` `#F2665F`.

Text on a colour is that colour's ink at two strengths (100 % and about 84 %), never grey. Secondary text on the ground is
`--tx-2`. Every pair above is at least 4.5:1.

## 2. Type

Archivo only (OFL), a variable font on the web (`css/fonts/archivo-latin-variable.woff2`, weight 100–900, width 62–125) and
static instances on Android (`tools/fonts/build-archivo-instances.py`). Three widths:

| Voice | Width | Weight | Use | Web | Android |
|---|---|---|---|---|---|
| Text | 100 | 400, 600, 700, 800 | everything that is read | `--font`, `--w-text` | `TitanText-*` |
| Title | 75 | 800 | headings, the name of a block | `--font-display`, `--w-title` | `TitanDisplay-Heavy` |
| Figure | 62 | 300 when large (48 px and more), 700 when small | times, distances, levels, counts | `--w-figure`, `.asc-num`, `.asc-figure` | `TitanFigure-Light` / `-Bold` |

Figures always use tabular numerals. Scale on the web: page title `clamp(36px, 9.5vw, 64px)`; section heading 21 px; block
heading 19 px; text 15.5 px / 1.5; small 13.5 px; large figure 48–104 px light; row figure 22 px bold. Android: display 38,
h1 30, h2 24, h3 19, body 15.5, figure 64 and 104.

There is no uppercase letter-spaced kicker above a heading. `.asc-eyebrow` (web) and the `eyebrow` variant (Android) are
kept for their call sites as plain small labels; the label that only repeated the name of the space above a page title is
removed.

## 3. Shapes and surfaces

Radii are 4, 8 and 12 px (`--r1`, `--r2`, `--r3`; `--r4` is 12 too). Only avatars, counters and progress bars are round.

| Surface | What it is | Web | Android |
|---|---|---|---|
| Ground | most content sits directly on it | — | `Card tone="plain"` |
| Ruled block | a block under a 1 px hairline, no box | `.asc-ruled`, `.asc-row`, most former cards | `Card tone="ruled"` |
| Section | a 2 px chalk rule, then a real heading | `.asc-section-head` | `Section` |
| Panel | one tone above the ground, no outline | `.asc-panel` | `Card` |
| Slab | a solid block of the space colour with ink text | `.asc-slab`, `.qg-hero`, `.av-mission` | the QG slab |

A slab is reserved for the one primary thing of a page (the action of the day on the QG, the mission in progress in
Aventure). It turns amber for a record and stays on the ground for an alert. An input keeps its edge (it is a control, not a
card). A row carries its icon as a mark in the family colour, not as a boxed tile. A chip is a small squared tag with a wash.

## 4. Header field

A main page opens with a full-width flat field of its space colour, the title set large in the field's ink
(`.asc-page-head` on the web, `SpaceField` on Android). On a phone the top row (page name, menu, profile) sits on the field
and scrolls away with it; the tab bar stays. On a wide screen the field spans the whole area at the right of the rail and
its content aligns with the content column. A field can carry figures (`.asc-field-figures`: the last thirty days in
Progrès) or the one action of the page (the search of Séance, a slab of ink).

Two exceptions open on the world's painting, edge to edge, dissolving into the ground (`.asc-art-head`, `QgBanner`): the
QG (the world in progress) and Aventure (the world being looked at). The profile's field holds the identity: on a wide
screen it is the left column of the page from top to bottom. TITAN LIVE has no field: nothing bright while moving.

## 5. « Le programme »

TITAN's signature figure: the practice laid out like the schedule of a sports meeting. One line per sport, one column per
day (a week) or per week (a period).

- Data: `js/core/program-grid.js` (`TitanProgram.week`, `.span`, `.describe`), shared unchanged by both clients. Minutes
  come from the journal's own function, family and label from the sports catalogue.
- Renderers: `js/app/program.js` (`TitanProgramView.week/span/html/legend`, an HTML string) and
  `mobile/src/components/ProgramGrid.tsx`.
- A cell is inked in the colour of the sport's family at four strengths (opacity 0.34, 0.56, 0.78, 1): for a day, under
  20 min, 45 min, 75 min, beyond; for a week, under 1 h, 2 h, 4 h, beyond.
- A day still to come in the usual week is a dashed frame. A past day without a session is a small dot. Today's column
  (or the current week) is marked in the space colour. Rest is never drawn as a fault.
- Beyond the maximum number of lines the rest folds into « n autres sports ».
- The figure is one accessible element (`role="img"`, Android `accessibilityRole="image"`) whose name is a sentence from
  `describe`. Colour is never the only carrier: each line is named, with its sessions and time.

Where it is shown: QG (this week, last week under it when the week is still empty), Progrès (the week of the recap; 12
weeks on a phone and 26 on a wide screen), Profil (« Mes sports », 8 weeks).

## 6. Layout

4 px grid (`--s1` 4 … `--s10` 72). On a phone: one column, 16 px gutters. On the web from 960 px: a 232 px rail, then a
content column of at most 1200 px (`--content`; 920 px for the session form, 640/1040 px for TITAN LIVE). From 1100 px the
main pages use the width: QG in two columns (action and week / chapter, doors, last sessions), Progrès with the week beside
its programme and the questions three across, Profil with the chalk field as the left column, the journal as a table with
aligned figure columns, Séance with « mine » beside « every sport ».

Navigation keeps its model: a rail on a wide screen, a tab bar on a phone. The current item takes its space colour; the
record action is lime.

## 7. Motion and browser surfaces

Short transitions (140 and 240 ms, `--ease`), no entrance replayed on a data refresh. `prefers-reduced-motion` and TITAN's
own « animations réduites » setting cut animations and transitions. Selection, caret, scrollbars and the focus ring come
from the palette (the focus ring is the space colour, the ink of the field on a field).

## 8. Accessibility floor

Text contrast at least 4.5:1 (the pairs are listed above; inputs keep a 3:1 edge), visible focus, 44 px targets (48 dp on
Android), headings in order (one `h1` per page, the title on the field), no information by colour alone, text scaling
respected.

## 9. Do / Don't

Do

- Give a page its space and let that one colour do the work: field, action, selection.
- Open a section with the chalk rule and a heading; let rows sit on the ground under hairlines.
- Set figures in the extra-condensed cut, light when large, and align them in columns.
- Use the programme whenever the question is « which sports, on which days ».
- Keep cyan for progression and amber for records in every space.

Don't

- No bordered card as the unit of a page, no card inside a card, no outline on a panel.
- No uppercase tracked kicker above a heading; no gradient text; no glow; no side stripe as an accent.
- No second accent colour on a page: sport family colours are data, not decoration.
- No grey text on a colour field; no slab for anything but the one primary thing.
- No radius above 12 px except what is truly round.

## 10. How it is checked, and what is still open (17 November 2026, evening)

A page is judged in the state people really get, not in the state a network-cut test sees. Three things made the first preview
look broken while every test was green, and each has a guard now:

- **Stale styles.** `/css` and `/js` are cached seven days and the pages addressed stylesheets by hand-written `?v=` keys; nine
  deployments changed two sheets under the same keys. The build stamps every stylesheet and script with a digest of its bytes
  (`tools/build-public.mjs`, `tests/asset-cache-keys.test.mjs`).
- **Production flags.** The server answers 21 flags on; journeys with the network cut see none. The capture bench answers the
  production set by default (`tools/visual/capture.mjs`, `tools/visual/flags-production.json`).
- **A signed-in account.** `--state connected` installs an established account whose server blocks are answered from fixtures
  (`tools/visual/fixture-connected.mjs`); `tests/e2e/real-account.e2e.mjs` holds thirteen pages at 320, 390 and 1440 px in that
  state.

What changed in the composition that day: the Séance page opens on the sport question whatever the flags, with import on a
switch in the field; optional blocks fold into one list of rows that say where they stand in a line (`.asc-fold`: « Autour de ta
pratique » on the QG, « Plus loin » on the Communauté); a row of actions is `.asc-actions` (it wraps), `.asc-row` is a list row
only; folding sections carry one chevron; public pages open on a flat field of the space colour like the application, with
panels one tone above the ground and no outline.

Reference captures: `docs/design/captures/titan-one/` (manifest with page, width, state, flags and commit; before/after pairs).
They are headless Chromium captures of the built site, not phones.

Still open:

- No screen has been seen on a physical phone, in Firefox or in Safari. A real signed-in account on the real server has not
  been looked at either: creating a test account in production was refused to the agent, so the signed-in state is simulated.
- Most of the app sets its type in px: a root font-size of 200 % enlarges the profile's rem text only, the rest follows the
  browser's zoom (checked at 200 % zoom: no page scrolls sideways).
- Public pages keep uppercase tracked labels above their titles and their own section rhythm; only their head and panels were
  brought to the system.
- The first-visit consent banner covers the lower fifth of a phone until answered.
- Crests for the three highest ranks and the background paintings of TITAN LIVE do not exist yet (see `docs/TITAN_ONE.md`).

## 11. Mission 1 « masterclass » — what was added on the web (17 November 2026, night)

Nothing here adds a token. These are compositions built from the system above; the Android side of each is listed in
`docs/MISSION_2_RELAIS_ANDROID.md`.

- **The status band of the QG** (`.qg-status`). Under the greeting, before the slab: the week on one line (`.qg-pulse`,
  `TitanProgramView.days`) — seven days in the grammar of the programme, each inked in the family that took most of that day,
  then « 2/4 jours actifs » as a figure — and the rank as one row. On a wide screen the two share a row aligned with the two
  columns. A new account has no pulse (« 0/3 » is an empty figure): the band holds the rank alone. The painting of the QG is
  shorter on a phone (236 px) so greeting, week, rank and the action of the day share the first screen.
- **What changed is a sentence** (`.qg-week-change`): under the three figures of the week, « 1 h 33 de plus que d'habitude à ce
  stade de la semaine. », the figure in cyan when it is a gain.
- **The moment after a session** (`.moment-sheet`). The sheet takes the Séance space wherever it opens. Its head and
  `.moment-field` are one flat lime field: the figure that says the session set large in the ink (`.moment-lead`: distance,
  else volume, else time), the other measures on one line under a hairline of ink. A record that fell leads instead and the
  field turns amber (`[data-record]`), with the mark it replaced. Under the field, on the panel tone and under hairlines: the
  confirmed gain as a light cyan figure that counts up over the level bar of the QG (`.moment-climb-bar`: a quieter tone where
  the level stood, the fill where it stands), the week, the mastery, the chapter, one sentence about what comes next. No ring,
  no particles, no box inside the sheet.
- **A beacon lit** (`.av-celebrate-sheet`). The painting of the world edge to edge at the top of the sheet (the guardian's
  portrait for the ninth), the trail of the nine beacons across its foot (`.av-celebrate-trail`: lit in moss, the one just lit
  in amber with its number, the ones ahead as outlines, the guardian as a diamond), the name of the badge in amber.
- **The mission in four lines** (`.av-mission`): what to do, how far, the action, the line of story. What the chapter brings
  and how it is counted opens on a labelled line (`.av-more`); « Détails du chapitre » stays a visible quiet button. The map of
  the world is drawn at nearly the light of its painting (brightness 0.86, a vignette at the edges only).
- **The circle** (`.cm-circle`): on the coral field of the Communauté, the faces of the friends who agreed, their count and
  how many moved today; the line's height is reserved from the first paint.
- **Journal on a phone**: the four totals share one line of row figures (bold, 23–30 px) so the list starts on the first screen.
- **Carrière**: a career figure is a fact and is set in the text colour; cyan and amber keep their meaning.

Motion added: one count-up and one bar on the moment, one beacon settling on the trail. Each has its final state at once under
`prefers-reduced-motion` and TITAN's own setting.

## 11. « Signature » (17 November 2026, web) — what makes TITAN recognisable without its logo

« Programme » gave TITAN a system; the owner asked for a signature: premium, immersive, with the RPG's character, never
overloaded. Four ideas, in `css/signature.css` (loaded after `ascension-app.css` by every application page), used everywhere
and for nothing else. Each space of the app adds its own sheet (`css/one-*.css`) built with them.

| Idea | What it is | Where | Rule |
|---|---|---|---|
| **La coupe** | One corner cut at 45°, the angle of the double chevron (`--cut` 18 px, 28 px wide; `--cut-sm`) | The header field, the slab, the record action of the navigation, a plate | Only on what is primary. Never on a row, an input or a chip. It replaces nothing of the 4 / 8 / 12 radii elsewhere |
| **Le relief** | Contour lines of a summit (`assets/ascension/contours.svg` as a mask) inked in the colour of what they sit on | Fields, slabs, plates, the empty state | Ink of the surface at low strength, never under a figure that must be read at a glance, never a second colour |
| **L'objet** | Ranks, relics, chests and seals are objects that stand on the ground with their own shadow (`.sig-object`), on a steel plate (`.sig-plate`) when they are the subject | QG rank plate, Records, Atelier, Aventure, Carrière | Never an icon in a ring. Locked is desaturated and said in words (`.sig-state`); nothing shown as owned before the server says so |
| **Le passage** | Page to page is one movement: the navigation is on the first frame (`js/app/shell-nav.js`) and stays, the content cross-fades (cross-document view transitions) | Every page of the site | 110 ms out, 260 ms in. The system setting and TITAN's « Animations réduites » cut it. No entrance replayed on a data refresh |

What changes in the rules above:

- § 3: a slab and a header field end with la coupe at their lower right corner; a panel that carries a precious thing is a
  steel plate (three tones, a highlight on its upper edge) instead of a flat tone.
- § 4: a field carries le relief. Onboarding and sign-in open on the valley like the QG opens on the world in progress.
- § 7: `@view-transition { navigation: auto }` is in both base sheets (`ascension.css`, `design-system.css`) so that no page
  disagrees with the next; the rail and the tab bar are named and do not move.
- § 9: « no uppercase tracked kicker » now holds on the public pages too (`.pub-eyebrow` is a plain small label).
- Navigation: the rail, the top row and the tab bar are drawn by `shell-nav.js`, the first script of the page, from what the
  device remembers of the account (`titan_shell_nav_v1`, read strictly, forgotten on sign-out). They used to arrive about
  80 ms after the first frame and blink at every navigation. The sub-navigation of Progrès and Séance is written in the page.
  The rank worn in the navigation is the approved sculpted crest, when the rank has one.

The sheets of the spaces, each linked after `signature.css` on its own pages only: `one-entree.css` (QG, onboarding, sign-in),
`one-seance-progres.css` (Séance, Prévoir, Journal, Progrès, Records, Carrière, Objectifs), `one-aventure-live.css` (Aventure,
TITAN LIVE), `one-communaute.css` (Communauté, défi, coaching, athlete page), `one-profil-atelier.css` (Atelier, Profil, TITAN+).

Illustrations (see `design/titan-visual-library/global-v2/registry/fusion-20261117.json` for each decision): the four approved
crests are untouched; three true-alpha objects from the owner's Drive are in use (`assets/objects/`: the chest is the reserve
of credits in the Atelier, the relic belongs to Records, the seal to the exploration notebook); the Champion, Titan and
Légende candidates of PR #147 are kept ready and inactive until approved (`BADGES` in `js/app/crest.js`).


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

## 10. Known gaps (17 November 2026)

Fixed by the finishing pass of 17 November (headless Chromium only): Aventure shows its painting once; the phone top row and
the ink tints have a safe default without `:has()` and `color-mix()`; widths between 960 and 1099 px, the wide Profil on a
short window and the programme's labels; the Recours page on a phone; a verification alert above a page header.

Still open:

- Most of the app sets its type in px: a root font-size of 200 % enlarges the profile's rem text only, the rest follows the
  browser's zoom.
- Records, Objectifs, Prévoir, Coaching, Atelier, Défi, onboarding and sign-in were not re-captured after the finishing pass
  (interrupted); they are covered functionally by the browser suite only.

- The public marketing pages (`css/public.css`, generated by `tools/build-public-site.mjs` and `-docs.mjs`) share the tokens
  and Archivo but keep their own composition, including uppercase labels.
- On the web, pages outside the main ones (Records, Objectifs, Prévoir, Coaching, Atelier, Recours, Défi, onboarding, sign-in)
  inherit the system (tokens, type, field, de-outlined surfaces) without a new composition.
- Crests for the three highest ranks and the background paintings of TITAN LIVE do not exist yet (see `docs/TITAN_ONE.md`).

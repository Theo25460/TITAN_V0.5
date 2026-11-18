# Signature — « Séances et progression sportive »

Before | after pairs of the lot, 18 November 2026. Headless Chromium captures of the built site (`tools/visual/capture.mjs`,
`--state connected --flags live`): a simulated signed-in, established account answered from fixtures, not a phone and not a real
account. « Before » is commit `c457471`.

| File | What it shows |
|---|---|
| `seance-choix-390.jpg` | Séance, phone, full page: the sports already practised as keys, families as tabs with their counts (the page is about a third shorter) |
| `journal-390.jpg` | Journal, phone, first screen: one bar and one line of filters, sessions on the first screen, one leading figure per row |
| `records-390.jpg` | Records, phone: the relic on its amber plate, each mark of the month with the one it replaced, filters on two lines |
| `carriere-390.jpg` | Carrière, phone, first screen: the rank on its plate with the way to the next level, the ladder of the seven crests |
| `objectifs-prevoir-390.jpg` | Objectifs and Prévoir, phone, first screens: the state of a goal in words, the week as a strip of seven days |
| `records-carriere-1440.jpg` | Records and Carrière on a wide screen |

Not in the pairs (no « before » exists for them): the search results with the match marked, the empty search, the draft found on
the device, the offline line next to the save button. They are played by `tests/e2e/one-seance-progres.e2e.mjs`.

On every page of Progrès and on Prévoir the first-visits note (« Compris ») now closes the page instead of opening it.

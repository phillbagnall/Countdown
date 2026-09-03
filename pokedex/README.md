# Pokedex Trainer

A flashcard study app and searchable database covering every Pokémon,
Generations 1–9 (National Dex #1–1025), with official artwork.

No build step, no dependencies, no server. Serve the folder as static files
and open `index.html`.

## Getting it on a phone

Same idea as the Millionaire app in the repo root: publish `pokedex/` as
static files behind whatever you already use to serve your domain (the
same reverse proxy fronting Home Assistant works fine — this is just
another static site), then on the phone:

- **iPhone (Safari)** — open the URL, Share button → *Add to Home Screen*.

It installs as its own home-screen icon, separate from the Millionaire app,
and launches full screen with no browser bars. A service worker caches the
app shell on first visit and caches each Pokémon's artwork the first time
it's viewed, so it keeps working with no signal — Pokémon you haven't
looked at yet just won't have images until you're back online.

### Running it on a computer

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/pokedex/
```

## What's in it

- **Browse** — search by name, filter by generation and type, and sort by
  dex number, name, type, evolutionary family (each evolution line stays
  grouped together, base → final), or weakest-first (your own accuracy).
  Tap a card for full details: stats, height/weight, abilities, evolution
  chain, and your study history for that Pokémon.
- **Study** — two flashcard modes:
  - **Picture → Name** — a silhouette of the artwork; type the name to
    reveal it. Answers are graded automatically (typos in punctuation are
    forgiven), with a manual "I got it right anyway" button for edge cases.
  - **Name/Type → Details** — multiple choice on a random fact: a base
    stat, what it evolves into, its other type, or one of its abilities.
- **Progress** — how many Pokémon you've studied, overall accuracy, how
  many are in each of the 5 study boxes, and which types/generations are
  weakest.

### How studying tracks progress

A simple 5-box [Leitner system](https://en.wikipedia.org/wiki/Leitner_system),
stored only in this browser's `localStorage` — no accounts, nothing sent
anywhere:

| Box | Comes back due |
|---|---|
| 1 (new or just missed) | next day |
| 2 | 2 days later |
| 3 | 4 days later |
| 4 | 7 days later |
| 5 (well known) | 14 days later |

Get one right → it moves up a box and comes back further out. Get one
wrong → it drops straight back to box 1. Opening **Study** always leads
with whatever's due today; Browse can filter to "due for review only" or
sort "weakest first" too.

## Updating the Pokémon data

`data/pokemon.json` is generated, not hand-written — see
[`../scripts/fetch-pokemon-data.mjs`](../scripts/fetch-pokemon-data.mjs).
To regenerate it (e.g. once a new generation exists), from the repo root:

```sh
node scripts/fetch-pokemon-data.mjs
```

It pulls PokéAPI's own CSV data dump from GitHub, joins it locally, and
writes `pokedex/data/pokemon.json` — no API keys, no npm install. Needs
Node 18+.

## Files

```
index.html                 markup for all three screens
css/styles.css              all styling
js/dataset.js                loads data/pokemon.json, filter/sort/lookup helpers
js/progress.js               Leitner-box localStorage store
js/browse.js                 search/filter/sort grid + detail overlay
js/flashcards.js             both study modes
js/app.js                    tab routing, progress screen
data/pokemon.json            generated dataset (~215 KB)
manifest.webmanifest         app name, icons and colours when installed
sw.js                        service worker — offline app shell + sprite caching
icons/                       home screen icons
```

### Updating it after a change

Same as the Millionaire app: the service worker serves the cached copy
first and refreshes in the background, so a change appears the *second*
time it's opened. To see it immediately, bump `CACHE` in `sw.js` to a new
version string.

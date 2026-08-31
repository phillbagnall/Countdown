# Millionaire Training

A practice app for *Who Wants To Be A Millionaire?* — the full 15-question
ladder, the three classic lifelines, and stats that work out which subjects
need the most work.

No build step, no dependencies, no server. Open `index.html` and play.

## Getting it on a phone

This is the main way it's meant to be played. Two steps:

**1. Publish it.** In this repo on GitHub: **Settings → Pages → Source:
Deploy from a branch → Branch: `main`, folder `/ (root)` → Save.** After a
minute GitHub gives you a URL like
`https://<username>.github.io/Countdown/`.

**2. Install it on the phone.** Open that URL on the phone, then:

- **iPhone (Safari)** — Share button → *Add to Home Screen*.
- **Android (Chrome)** — ⋮ menu → *Add to Home screen* / *Install app*.

It then launches full screen from the home icon, with no browser bars, like
a normal app. Portrait and landscape both work, and the lock-in button is
pinned to the bottom of the screen so it's always in reach.

**It works with no signal.** A service worker caches the app on first visit,
so it opens and plays on the Tube or anywhere with no reception — it just
falls back to the bundled question bank until the connection is back.

### Running it on a computer

Double-click `index.html`, or serve the folder if you want the service
worker and live API calls to behave exactly as they do when published:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## How it plays

- **The ladder** — £100 up to £1,000,000 over fifteen questions, with
  safety nets at £1,000 (Q5) and £32,000 (Q10). Get one wrong and you drop
  to the last net you passed.
- **Locking in** — pick an answer, then confirm it. The pause before the
  reveal gets longer as the money climbs, as it does on the show.
- **Walk away** — available at any point, and banks the amount for the last
  question answered correctly.
- **Difficulty** — questions 1–6 are easy, 7–11 medium, 12–15 hard. The show
  stays gentle for a good while, so the hard tier only starts where the real
  money does.

### Lifelines

| Lifeline | Behaviour |
|---|---|
| **50:50** | Removes two wrong answers. |
| **Ask the Audience** | Simulated vote. The crowd is reliable on easy questions and much less so on hard ones, and only votes on answers still on the board. |
| **Phone a Friend** | 30-second timer. The friend is right about 90% of the time on easy questions, 70% on medium, 45% on hard — and the confidence wording tells you roughly how much to trust it. |

### Keyboard

`A` `B` `C` `D` select an answer, `Enter` locks it in, `Esc` closes a
lifeline pop-up.

## Where the questions come from

Questions are pulled live so the range stays broad, with layered fallbacks
so a game never stalls:

1. **[Open Trivia DB](https://opentdb.com)** — the main source. Categorised
   and difficulty-tagged, which is what the ladder needs. A session token
   stops it repeating questions, and requests are rate-limited to one every
   five seconds as the API requires. Most requests ask for *no* category, so
   each one returns a broad mix; niche categories (video games, anime,
   comics, board games, gadgets) are filtered out as too far from the show.
2. **[The Trivia API](https://the-trivia-api.com)** — used automatically if
   Open Trivia DB errors or returns nothing.
3. **Bundled bank** (`js/fallback-questions.js`) — around 140 questions
   shipped with the app, so it works offline, on a flaky connection, or
   while the live pools are still filling.

Questions are held in per-difficulty pools that top themselves up in the
background, so pulling the next question is instant. Recently seen questions
are remembered (last 500) and skipped.

To add your own questions, append entries to `js/fallback-questions.js` —
`c` category, `d` difficulty, `q` question, `a` correct answer, `w` three
wrong answers.

## Stats and weak-spot targeting

Everything is stored in the browser's `localStorage` on that device only —
no accounts, nothing sent anywhere.

The stats screen shows games played, best winnings, best level reached,
overall accuracy, and a per-category breakdown with accuracy, questions
seen, and average answer time. Categories with at least four questions seen
and under 70% accuracy are marked as **drilling**.

With *"Target my weakest categories"* switched on (the default), about 40% of
background fetches ask for one of the four weakest categories, and the pool
is shuffled so those questions are spread through a game rather than arriving
in a block. That works on weak spots without narrowing the range, since the
real show can ask about anything.

**Reset all stats** on the stats screen clears the lot.

## Settings

| Setting | Default | Effect |
|---|---|---|
| Target my weakest categories | on | Biases question selection towards weak subjects |
| Question timer (45s) | off | Adds a countdown; running out counts as a wrong answer |
| Sound | on | Short synthesised cues for select, lock-in, correct and wrong |

## Files

```
index.html                 markup for all four screens
css/styles.css             all styling
js/questions.js            live sourcing, pools, fallbacks, weak-topic bias
js/fallback-questions.js   bundled offline question bank
js/stats.js                localStorage stats and settings
js/app.js                  game rules, lifelines, UI wiring
manifest.webmanifest       app name, icons and colours when installed
sw.js                      service worker — caches the app for offline play
icons/                     home screen icons
```

### Updating it after a change

The service worker serves the cached copy first and refreshes in the
background, so a change you push appears the *second* time the app is
opened. To see it immediately, close and reopen the app twice, or bump
`CACHE` in `sw.js` to a new version string.

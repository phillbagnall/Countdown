# Millionaire Training

A practice app for *Who Wants To Be A Millionaire?* — the full 15-question
ladder, the three classic lifelines, and stats that work out which subjects
need the most work.

No build step, no dependencies, no server. Open `index.html` and play.

## Running it

**Locally:** double-click `index.html`, or open it in any browser.

**On a phone or tablet:** publish the repo with GitHub Pages (Settings →
Pages → deploy from `main`, root folder) and open the URL it gives you. The
layout adapts to small screens.

**With a local server** (only needed if a browser blocks the live API calls
from a `file://` page):

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
- **Difficulty** — questions 1–5 are easy, 6–10 medium, 11–15 hard.

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
   five seconds as the API requires.
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

With *"Target my weakest categories"* switched on (the default), roughly 55%
of questions are drawn from those weak categories — enough to work on them
without narrowing the range, since the real show can ask about anything.

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
```

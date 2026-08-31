/*
 * Question sourcing.
 *
 * Order of preference:
 *   1. The Trivia API (the-trivia-api.com) — a British database, asked with
 *      region=GB so questions unsuitable for a UK audience are held back.
 *      This is the primary source because Open Trivia DB, being community
 *      written and largely American, skews heavily towards US general
 *      knowledge — US presidents, state capitals, American sports.
 *   2. Open Trivia DB (opentdb.com) — fallback if the first is unreachable.
 *   3. window.FALLBACK_QUESTIONS — bundled bank, so the game never stalls.
 *
 * Questions 1-3 always come from the bundled "starter" tier, whatever the
 * network is doing: no API's easy tier is as gentle as the show's opening.
 *
 * Questions are held in per-difficulty pools that top themselves up in the
 * background. Pulling a question is therefore synchronous and instant: if a
 * pool happens to be empty we serve from the bundled bank and refill behind
 * the scenes.
 */
window.Questions = (function () {
  'use strict';

  /* Open Trivia DB categories worth using for a general-knowledge quiz,
     mapped to the display names also used by the bundled bank. */
  var OTDB_CATEGORIES = [
    { id: 9,  name: 'General Knowledge' },
    { id: 10, name: 'Entertainment: Books' },
    { id: 11, name: 'Entertainment: Film' },
    { id: 12, name: 'Entertainment: Music' },
    { id: 13, name: 'Musicals & Theatre' },
    { id: 14, name: 'Entertainment: Television' },
    { id: 17, name: 'Science & Nature' },
    { id: 18, name: 'Computers' },
    { id: 19, name: 'Mathematics' },
    { id: 20, name: 'Mythology' },
    { id: 21, name: 'Sports' },
    { id: 22, name: 'Geography' },
    { id: 23, name: 'History' },
    { id: 24, name: 'Politics' },
    { id: 25, name: 'Art' },
    { id: 26, name: 'Celebrities' },
    { id: 27, name: 'Animals' },
    { id: 28, name: 'Vehicles' }
  ];

  /* Most requests ask for no category at all, which returns a broad mix in a
     single call. These are the categories to drop from such a mix — too
     niche for a general-knowledge quiz show. */
  var EXCLUDED_CATEGORIES = [
    'Entertainment: Video Games',
    'Entertainment: Board Games',
    'Entertainment: Comics',
    'Entertainment: Japanese Anime & Manga',
    'Entertainment: Cartoon & Animations',
    'Science: Gadgets'
  ];

  /* OTDB's own category names, tidied to match the bundled bank so the two
     sources aggregate into the same stats rows. */
  var CATEGORY_RENAMES = {
    'Science: Computers': 'Computers',
    'Science: Mathematics': 'Mathematics',
    'Entertainment: Musicals & Theatres': 'Musicals & Theatre'
  };

  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var POOL_TARGET = 12;          // top up a pool once it drops below this
  var OTDB_MIN_GAP_MS = 5200;    // OTDB allows ~1 request per 5s per IP
  var SEEN_KEY = 'wwtbam.seen.v1';
  var SEEN_LIMIT = 500;

  var pools = { easy: [], medium: [], hard: [] };
  var inFlight = { easy: false, medium: false, hard: false };
  var lastOtdbRequest = 0;
  var otdbToken = null;
  var otdbFailures = 0;
  var status = { source: 'offline bank', live: false };
  var preferredCategories = [];  // display names to bias towards

  /* ---------------- helpers ---------------- */

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* Base64 -> UTF-8 string. OTDB's encode=base64 keeps accents and quotes
     intact; some rows still carry HTML entities, so decode those too. */
  function decodeB64(str) {
    var binary = atob(str);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var text;
    try {
      text = new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      text = binary;
    }
    return decodeEntities(text);
  }

  function decodeEntities(str) {
    var el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
  }

  function normaliseKey(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 120);
  }

  function readSeen() {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function markSeen(key) {
    try {
      var seen = readSeen();
      seen.push(key);
      if (seen.length > SEEN_LIMIT) seen = seen.slice(seen.length - SEEN_LIMIT);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch (e) { /* ignore */ }
  }

  function isSeen(key) {
    return readSeen().indexOf(key) !== -1;
  }

  function makeQuestion(category, difficulty, text, correct, wrong) {
    var answers = shuffle([correct].concat(wrong));
    return {
      category: category,
      difficulty: difficulty,
      question: text,
      correct: correct,
      answers: answers,
      correctIndex: answers.indexOf(correct),
      key: normaliseKey(text)
    };
  }

  /* ---------------- category choice ---------------- */

  function setPreferredCategories(names) {
    preferredCategories = names || [];
  }

  /*
   * Which category to request, or null for "any".
   *
   * Null is the common case, and deliberately so: one category-less request
   * returns a broad mix, whereas a category-specific one returns ten
   * questions on a single subject — enough to fill a whole game with, say,
   * animals. Only a minority of refills target a weak category, so the pool
   * always holds a spread.
   */
  function chooseOtdbCategory() {
    if (preferredCategories.length && Math.random() < 0.4) {
      var matches = OTDB_CATEGORIES.filter(function (c) {
        return preferredCategories.indexOf(c.name) !== -1;
      });
      if (matches.length) return pick(matches);
    }
    return null;
  }

  function tidyCategory(name) {
    return CATEGORY_RENAMES[name] || name;
  }

  /* ---------------- Open Trivia DB ---------------- */

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function ensureToken() {
    if (otdbToken) return Promise.resolve(otdbToken);
    try {
      var stored = localStorage.getItem('wwtbam.otdbToken');
      if (stored) { otdbToken = stored; return Promise.resolve(otdbToken); }
    } catch (e) { /* ignore */ }

    return fetchJson('https://opentdb.com/api_token.php?command=request')
      .then(function (data) {
        otdbToken = data && data.token ? data.token : null;
        if (otdbToken) {
          try { localStorage.setItem('wwtbam.otdbToken', otdbToken); } catch (e) {}
        }
        return otdbToken;
      })
      .catch(function () { return null; });
  }

  function resetToken() {
    otdbToken = null;
    try { localStorage.removeItem('wwtbam.otdbToken'); } catch (e) {}
  }

  function waitForRateLimit() {
    var wait = Math.max(0, OTDB_MIN_GAP_MS - (Date.now() - lastOtdbRequest));
    return new Promise(function (resolve) { setTimeout(resolve, wait); });
  }

  function fetchFromOtdb(difficulty) {
    var cat = chooseOtdbCategory();
    return waitForRateLimit()
      .then(ensureToken)
      .then(function (token) {
        lastOtdbRequest = Date.now();
        var url = 'https://opentdb.com/api.php?amount=10&type=multiple&encode=base64' +
                  '&difficulty=' + difficulty +
                  (cat ? '&category=' + cat.id : '') +
                  (token ? '&token=' + token : '');
        return fetchJson(url);
      })
      .then(function (data) {
        // 3 = token not found, 4 = token exhausted. Either way, start over.
        if (data.response_code === 3 || data.response_code === 4) {
          resetToken();
          return [];
        }
        if (data.response_code !== 0 || !data.results) return [];

        return data.results.map(function (item) {
          // With no category requested, each row carries its own.
          var category = cat ? cat.name : tidyCategory(decodeB64(item.category));
          return makeQuestion(
            category,
            decodeB64(item.difficulty),
            decodeB64(item.question),
            decodeB64(item.correct_answer),
            item.incorrect_answers.map(decodeB64)
          );
        }).filter(function (q) {
          return EXCLUDED_CATEGORIES.indexOf(q.category) === -1;
        });
      });
  }

  /* ---------------- The Trivia API (secondary) ---------------- */

  /* Their category slugs, mapped onto the names the bundled bank uses so
     both sources aggregate into the same stats rows. */
  var TRIVIA_API_CATEGORIES = {
    film_and_tv: 'Entertainment: Film',
    music: 'Entertainment: Music',
    arts_and_literature: 'Entertainment: Books',
    history: 'History',
    geography: 'Geography',
    science: 'Science & Nature',
    sport_and_leisure: 'Sports',
    society_and_culture: 'General Knowledge',
    food_and_drink: 'Food & Drink',
    general_knowledge: 'General Knowledge'
  };

  /* The reverse, for asking them about a weak category directly. */
  var TRIVIA_API_SLUGS = (function () {
    var out = {};
    Object.keys(TRIVIA_API_CATEGORIES).forEach(function (slug) {
      var name = TRIVIA_API_CATEGORIES[slug];
      if (!out[name]) out[name] = slug;
    });
    return out;
  })();

  function prettifyTriviaApiCategory(raw) {
    if (!raw) return 'General Knowledge';
    if (TRIVIA_API_CATEGORIES[raw]) return TRIVIA_API_CATEGORIES[raw];
    return raw.replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function fetchFromTriviaApi(difficulty) {
    // region=GB filters out questions unsuitable for a British audience.
    var url = 'https://the-trivia-api.com/v2/questions?limit=20&region=GB&difficulties=' + difficulty;

    // As with OTDB, target a weak category only some of the time so the
    // spread stays broad.
    if (preferredCategories.length && Math.random() < 0.4) {
      var slugs = preferredCategories
        .map(function (name) { return TRIVIA_API_SLUGS[name]; })
        .filter(Boolean);
      if (slugs.length) url += '&categories=' + pick(slugs);
    }

    return fetchJson(url).then(function (list) {
      if (!Array.isArray(list)) return [];
      return list.map(function (item) {
        return makeQuestion(
          prettifyTriviaApiCategory(item.category),
          difficulty,
          decodeEntities(item.question && item.question.text ? item.question.text : ''),
          decodeEntities(item.correctAnswer),
          (item.incorrectAnswers || []).slice(0, 3).map(decodeEntities)
        );
      }).filter(function (q) {
        return q.question && q.answers.length === 4;
      });
    });
  }

  /* ---------------- pool management ---------------- */

  function addToPool(difficulty, questions) {
    var fresh = questions.filter(function (q) {
      if (!q.question || q.answers.length !== 4) return false;
      if (isSeen(q.key)) return false;
      return !pools[difficulty].some(function (p) { return p.key === q.key; });
    });
    // Shuffle the whole pool, not just the new rows: when a batch does come
    // from a single targeted category, this spreads it out instead of
    // serving ten questions on one subject back to back.
    pools[difficulty] = shuffle(pools[difficulty].concat(fresh));
    return fresh.length;
  }

  function refill(difficulty) {
    if (inFlight[difficulty]) return Promise.resolve(0);
    if (pools[difficulty].length >= POOL_TARGET) return Promise.resolve(0);
    inFlight[difficulty] = true;

    return fetchFromTriviaApi(difficulty)
      .then(function (list) {
        if (!list.length) throw new Error('empty');
        status = { source: 'The Trivia API (UK)', live: true };
        return addToPool(difficulty, list);
      })
      .catch(function () {
        // Fall back to OTDB, unless it has already failed repeatedly.
        if (otdbFailures >= 3) throw new Error('OTDB skipped');
        return fetchFromOtdb(difficulty).then(function (list) {
          if (!list.length) throw new Error('empty');
          otdbFailures = 0;
          status = { source: 'Open Trivia DB', live: true };
          return addToPool(difficulty, list);
        });
      })
      .catch(function () {
        otdbFailures++;
        if (!status.live) status = { source: 'offline bank', live: false };
        return 0;
      })
      .then(function (n) {
        inFlight[difficulty] = false;
        return n;
      });
  }

  /* ---------------- bundled bank ---------------- */

  function bankQuestion(difficulty) {
    var bank = window.FALLBACK_QUESTIONS || [];
    var candidates = bank.filter(function (item) { return item.d === difficulty; });
    if (!candidates.length) candidates = bank;

    var unseen = candidates.filter(function (item) {
      return !isSeen(normaliseKey(item.q));
    });
    var source = unseen.length ? unseen : candidates;

    // Prefer a weak category when we have one available in the bank.
    if (preferredCategories.length && Math.random() < 0.4) {
      var weak = source.filter(function (item) {
        return preferredCategories.indexOf(item.c) !== -1;
      });
      if (weak.length) source = weak;
    }

    var item = pick(source);
    return makeQuestion(item.c, item.d, item.q, item.a, item.w);
  }

  /* ---------------- public API ---------------- */

  /* Warm the pools. Easy first (needed within seconds of pressing play),
     then medium and hard, which the rate limiter naturally staggers. */
  function prefetch() {
    refill('easy');
    setTimeout(function () { refill('medium'); }, 300);
    setTimeout(function () { refill('hard'); }, 600);
  }

  /*
   * The show's first three questions are giveaways, and no API's "easy"
   * tier goes that low — so those come from the bundled starter bank. Easy
   * then runs to Q6, and the hard tier only starts at Q12, where the real
   * money begins.
   */
  function difficultyForLevel(level) {
    if (level <= 3) return 'starter';
    if (level <= 6) return 'easy';
    if (level <= 11) return 'medium';
    return 'hard';
  }

  /* What to show the player: "starter" is an implementation detail. */
  function difficultyLabel(level) {
    var d = difficultyForLevel(level);
    return d === 'starter' ? 'easy' : d;
  }

  function isFetchable(difficulty) {
    return DIFFICULTIES.indexOf(difficulty) !== -1;
  }

  function next(level) {
    var difficulty = difficultyForLevel(level);

    // The starter tier is bundled only — there is nothing to fetch.
    var q = isFetchable(difficulty)
      ? (pools[difficulty].shift() || bankQuestion(difficulty))
      : bankQuestion(difficulty);

    markSeen(q.key);
    if (isFetchable(difficulty)) refill(difficulty);

    // Warm the next tier a couple of questions before it is needed.
    var upcoming = difficultyForLevel(level + 2);
    if (upcoming !== difficulty && isFetchable(upcoming)) refill(upcoming);
    return q;
  }

  function getStatus() {
    return status;
  }

  return {
    prefetch: prefetch,
    next: next,
    difficultyForLevel: difficultyForLevel,
    difficultyLabel: difficultyLabel,
    setPreferredCategories: setPreferredCategories,
    getStatus: getStatus,
    DIFFICULTIES: DIFFICULTIES
  };
})();

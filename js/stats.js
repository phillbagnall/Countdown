/*
 * Stats: persistent performance tracking in localStorage.
 *
 * Everything stays on the device — no accounts, no network. The category
 * table is what drives weak-topic targeting in questions.js.
 */
window.Stats = (function () {
  'use strict';

  var KEY = 'wwtbam.stats.v2';
  var SETTINGS_KEY = 'wwtbam.settings.v1';
  var MAX_HISTORY = 20;

  function blank() {
    return {
      gamesPlayed: 0,
      bestWinnings: 0,
      bestLevel: 0,
      totalCorrect: 0,
      totalAnswered: 0,
      categories: {},   // name -> { seen, correct, timeMs }
      history: []       // newest first
    };
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var parsed = JSON.parse(raw);
      var base = blank();
      // Merge so a stored file from an older shape still loads.
      Object.keys(base).forEach(function (k) {
        if (parsed[k] === undefined) parsed[k] = base[k];
      });
      return parsed;
    } catch (e) {
      return blank();
    }
  }

  function write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      /* Private browsing or full storage — play on without persistence. */
    }
  }

  /* ---------------- recording ---------------- */

  function recordAnswer(category, wasCorrect, timeMs) {
    var data = read();
    var cat = data.categories[category] || { seen: 0, correct: 0, timeMs: 0 };
    cat.seen += 1;
    if (wasCorrect) cat.correct += 1;
    cat.timeMs += Math.max(0, timeMs || 0);
    data.categories[category] = cat;

    data.totalAnswered += 1;
    if (wasCorrect) data.totalCorrect += 1;
    write(data);
  }

  function recordGame(result) {
    // result: { winnings, level, outcome: 'won'|'lost'|'walked', date }
    var data = read();
    data.gamesPlayed += 1;
    if (result.winnings > data.bestWinnings) data.bestWinnings = result.winnings;
    if (result.level > data.bestLevel) data.bestLevel = result.level;
    data.history.unshift({
      winnings: result.winnings,
      level: result.level,
      outcome: result.outcome,
      // Practice runs carry on past a mistake; `level` still records where
      // the run officially ended, so best-level stays comparable.
      practice: !!result.practice,
      answeredCorrect: result.answeredCorrect,
      answeredTotal: result.answeredTotal,
      date: result.date || Date.now()
    });
    data.history = data.history.slice(0, MAX_HISTORY);
    write(data);
  }

  function reset() {
    write(blank());
  }

  /* ---------------- reading ---------------- */

  function accuracy(cat) {
    if (!cat || !cat.seen) return null;
    return cat.correct / cat.seen;
  }

  function categoryRows() {
    var data = read();
    return Object.keys(data.categories).map(function (name) {
      var c = data.categories[name];
      return {
        name: name,
        seen: c.seen,
        correct: c.correct,
        accuracy: accuracy(c),
        avgTimeMs: c.seen ? Math.round(c.timeMs / c.seen) : 0
      };
    }).sort(function (a, b) {
      return a.accuracy - b.accuracy || b.seen - a.seen;
    });
  }

  /*
   * Categories worth drilling: those with a meaningful sample and
   * below-par accuracy. Returns names weakest-first.
   */
  function weakCategories(minSeen, threshold) {
    minSeen = minSeen === undefined ? 4 : minSeen;
    threshold = threshold === undefined ? 0.7 : threshold;
    return categoryRows()
      .filter(function (r) { return r.seen >= minSeen && r.accuracy < threshold; })
      .map(function (r) { return r.name; });
  }

  /* ---------------- settings ---------------- */

  function readSettings() {
    var defaults = { adaptive: true, timer: false, sound: true, practice: false };
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      var parsed = JSON.parse(raw);
      Object.keys(defaults).forEach(function (k) {
        if (typeof parsed[k] !== 'boolean') parsed[k] = defaults[k];
      });
      return parsed;
    } catch (e) {
      return defaults;
    }
  }

  function writeSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) { /* ignore */ }
  }

  return {
    read: read,
    recordAnswer: recordAnswer,
    recordGame: recordGame,
    reset: reset,
    categoryRows: categoryRows,
    weakCategories: weakCategories,
    readSettings: readSettings,
    writeSettings: writeSettings
  };
})();

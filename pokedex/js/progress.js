/*
 * Progress: a 5-box Leitner system in localStorage, on-device only.
 *
 * Mirrors stats.js's KEY/blank()/read()/write() pattern from the
 * Millionaire app. Wrong answer resets straight to box 1 (due tomorrow);
 * right answer promotes one box and pushes the due date out further -
 * simple enough to explain to a kid ("get it wrong, it's back tomorrow").
 */
window.Progress = (function () {
  'use strict';

  var KEY = 'pokedex.progress.v1';
  var MAX_BOX = 5;
  var INTERVAL_DAYS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };

  function blank() {
    return {}; // id (string) -> { box, dueDate, seen, correct }
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : blank();
    } catch (e) {
      return blank();
    }
  }

  function write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      /* Private browsing or full storage - study on without persistence. */
    }
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function addDays(dateStr, days) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---------------- recording ---------------- */

  function recordResult(id, wasCorrect) {
    var data = read();
    var key = String(id);
    var entry = data[key] || { box: 1, dueDate: todayStr(), seen: 0, correct: 0 };

    entry.seen += 1;
    if (wasCorrect) {
      entry.correct += 1;
      entry.box = Math.min(entry.box + 1, MAX_BOX);
    } else {
      entry.box = 1;
    }
    entry.dueDate = addDays(todayStr(), INTERVAL_DAYS[entry.box]);

    data[key] = entry;
    write(data);
    return entry;
  }

  function reset() {
    write(blank());
  }

  /* ---------------- reading ---------------- */

  function boxOf(id) {
    var data = read();
    var entry = data[String(id)];
    return entry ? entry.box : 1;
  }

  function entryOf(id) {
    var data = read();
    return data[String(id)] || null;
  }

  /*
   * Which of the given ids are due today - either never reviewed, or their
   * stored dueDate has arrived.
   */
  function dueIds(allIds) {
    var data = read();
    var today = todayStr();
    return allIds.filter(function (id) {
      var entry = data[String(id)];
      return !entry || entry.dueDate <= today;
    });
  }

  function summary() {
    var data = read();
    var boxCounts = [0, 0, 0, 0, 0];
    var totalSeen = 0;
    var totalCorrect = 0;
    var tracked = 0;
    Object.keys(data).forEach(function (key) {
      var e = data[key];
      tracked += 1;
      boxCounts[e.box - 1] += 1;
      totalSeen += e.seen;
      totalCorrect += e.correct;
    });
    return {
      boxCounts: boxCounts,
      tracked: tracked,
      totalSeen: totalSeen,
      totalCorrect: totalCorrect,
      accuracy: totalSeen ? totalCorrect / totalSeen : null
    };
  }

  /*
   * Accuracy grouped by a key derived from each dataset record, e.g.
   * breakdownBy(Dataset.all(), function (p) { return p.gen; })
   * breakdownBy(Dataset.all(), function (p) { return p.types[0]; })
   * Only Pokemon with at least one recorded answer are included. Sorted
   * weakest (lowest accuracy) first.
   */
  function breakdownBy(records, keyFn) {
    var data = read();
    var groups = {}; // key -> { seen, correct }
    records.forEach(function (p) {
      var entry = data[String(p.id)];
      if (!entry || !entry.seen) return;
      var k = keyFn(p);
      var g = groups[k] || { key: k, seen: 0, correct: 0 };
      g.seen += entry.seen;
      g.correct += entry.correct;
      groups[k] = g;
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      return { key: g.key, seen: g.seen, correct: g.correct, accuracy: g.correct / g.seen };
    }).sort(function (a, b) { return a.accuracy - b.accuracy; });
  }

  return {
    recordResult: recordResult,
    reset: reset,
    boxOf: boxOf,
    entryOf: entryOf,
    dueIds: dueIds,
    summary: summary,
    breakdownBy: breakdownBy
  };
})();

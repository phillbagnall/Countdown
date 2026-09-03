/*
 * App: boot sequence and tab routing between the three screens. Owns the
 * Progress screen's rendering directly (it's just a summary view over
 * progress.js, not complex enough to need its own module).
 */
(function () {
  'use strict';

  var GEN_LABELS = {
    1: 'Gen 1', 2: 'Gen 2', 3: 'Gen 3', 4: 'Gen 4', 5: 'Gen 5',
    6: 'Gen 6', 7: 'Gen 7', 8: 'Gen 8', 9: 'Gen 9'
  };

  function switchTab(target) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.id === 'screen-' + target);
    });
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.target === target);
    });
    if (target === 'browse') window.Browse.refresh();
    if (target === 'study') window.Flashcards.refreshPicker();
    if (target === 'progress') renderProgress();
  }

  function renderProgress() {
    var summary = Progress.summary();
    var summaryEl = document.getElementById('progress-summary');
    summaryEl.innerHTML =
      '<p><strong>' + summary.tracked + '</strong> of ' + Dataset.all().length + ' Pokemon studied</p>' +
      '<p>Overall accuracy: <strong>' +
        (summary.accuracy === null ? '-' : Math.round(summary.accuracy * 100) + '%') +
      '</strong> (' + summary.totalCorrect + ' / ' + summary.totalSeen + ')</p>';

    var boxesEl = document.getElementById('progress-boxes');
    boxesEl.innerHTML = summary.boxCounts.map(function (count, i) {
      return '<div class="box-pill"><span class="box-num">Box ' + (i + 1) + '</span><span class="box-count">' + count + '</span></div>';
    }).join('');

    renderBreakdown('progress-by-type', Progress.breakdownBy(Dataset.all(), function (p) { return p.types[0]; }));
    renderBreakdown('progress-by-gen', Progress.breakdownBy(Dataset.all(), function (p) { return GEN_LABELS[p.gen]; }));
  }

  function renderBreakdown(elId, rows) {
    var el = document.getElementById(elId);
    if (!rows.length) {
      el.innerHTML = '<p class="muted">Not enough data yet - study a few rounds first.</p>';
      return;
    }
    el.innerHTML = rows.slice(0, 8).map(function (r) {
      return (
        '<div class="breakdown-row">' +
          '<span class="breakdown-key">' + r.key + '</span>' +
          '<span class="breakdown-bar"><span style="width:' + Math.round(r.accuracy * 100) + '%"></span></span>' +
          '<span class="breakdown-pct">' + Math.round(r.accuracy * 100) + '%</span>' +
        '</div>'
      );
    }).join('');
  }

  function init() {
    Dataset.load().then(function () {
      document.getElementById('app-loading').hidden = true;
      document.getElementById('app-main').hidden = false;
      document.getElementById('tabbar').hidden = false;

      window.Browse.init();
      window.Flashcards.init();

      document.querySelectorAll('.tab-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { switchTab(btn.dataset.target); });
      });

      document.getElementById('progress-reset').addEventListener('click', function () {
        if (window.confirm('Reset all study progress? This cannot be undone.')) {
          Progress.reset();
          renderProgress();
        }
      });
    }).catch(function (err) {
      document.getElementById('app-loading').textContent =
        'Could not load the Pokedex data. Check your connection and reload.';
      console.error(err);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

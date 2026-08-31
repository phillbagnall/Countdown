/*
 * Game logic and UI wiring.
 *
 * Classic 15-step ladder, two safety nets, three lifelines, walk away.
 */
(function () {
  'use strict';

  var LADDER = [
    100, 200, 300, 500, 1000,
    2000, 4000, 8000, 16000, 32000,
    64000, 125000, 250000, 500000, 1000000
  ];
  var SAFETY_NETS = [5, 10];        // levels that bank the money
  var QUESTION_SECONDS = 45;

  var state = null;
  var settings = Stats.readSettings();

  /* ---------------- tiny DOM helpers ---------------- */

  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function money(n) {
    return '£' + n.toLocaleString('en-GB');
  }

  function showScreen(id) {
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    $(id).classList.add('active');
    window.scrollTo(0, 0);
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* ---------------- sound ---------------- */

  var audioCtx = null;

  function tone(freq, durationMs, type, volume) {
    if (!settings.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume || 0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + durationMs / 1000);
    } catch (e) { /* audio is a nicety, never a blocker */ }
  }

  function soundSelect()  { tone(440, 90, 'triangle', 0.05); }
  function soundLockIn()  { tone(180, 500, 'sawtooth', 0.05); }
  function soundCorrect() { tone(660, 160, 'sine', 0.09); setTimeout(function () { tone(880, 320, 'sine', 0.09); }, 150); }
  function soundWrong()   { tone(200, 500, 'square', 0.07); }
  function soundTick()    { tone(1200, 40, 'sine', 0.03); }

  /* ---------------- ladder ---------------- */

  function buildLadder() {
    var ol = $('ladder');
    ol.innerHTML = '';
    for (var level = LADDER.length; level >= 1; level--) {
      var li = document.createElement('li');
      li.className = 'rung';
      li.dataset.level = String(level);
      if (SAFETY_NETS.indexOf(level) !== -1) li.classList.add('safety');
      if (level === LADDER.length) li.classList.add('top');
      li.innerHTML = '<span class="rung-num">' + level + '</span>' +
                     '<span class="rung-money">' + money(LADDER[level - 1]) + '</span>';
      ol.appendChild(li);
    }
  }

  function highlightLadder(level) {
    $$('#ladder .rung').forEach(function (li) {
      var n = Number(li.dataset.level);
      li.classList.toggle('current', n === level);
      li.classList.toggle('won', n < level);
    });
    var current = document.querySelector('#ladder .rung.current');
    if (current && current.scrollIntoView) {
      // `inline` keeps the current rung in view on the horizontal phone strip.
      current.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  /* ---------------- winnings rules ---------------- */

  function bankedAmount(levelReached) {
    // levelReached = number of questions answered correctly
    var banked = 0;
    SAFETY_NETS.forEach(function (net) {
      if (levelReached >= net) banked = LADDER[net - 1];
    });
    return banked;
  }

  function walkAwayAmount(levelReached) {
    return levelReached > 0 ? LADDER[levelReached - 1] : 0;
  }

  /* ---------------- game flow ---------------- */

  function startGame() {
    settings = Stats.readSettings();
    // Cap the targeting: without a limit, one badly-answered subject can
    // crowd out everything else.
    Questions.setPreferredCategories(
      settings.adaptive ? Stats.weakCategories().slice(0, 4) : []
    );

    state = {
      level: 1,
      question: null,
      selected: null,
      locked: false,
      removed: [],
      lifelines: { fifty: true, audience: true, phone: true },
      askedAt: 0,
      timerId: null,
      secondsLeft: QUESTION_SECONDS,
      review: []
    };

    $$('.lifeline').forEach(function (b) { b.classList.remove('used'); b.disabled = false; });
    showScreen('screen-game');
    loadQuestion();
  }

  function loadQuestion() {
    var q = Questions.next(state.level);
    state.question = q;
    state.selected = null;
    state.locked = false;
    state.removed = [];
    state.askedAt = Date.now();

    $('q-category').textContent = q.category;
    $('q-difficulty').textContent = Questions.difficultyForLevel(state.level) +
      ' · ' + money(LADDER[state.level - 1]);
    $('question-text').innerHTML = '';
    $('question-text').textContent = q.question;

    $$('.answer').forEach(function (btn, i) {
      btn.querySelector('.atext').textContent = q.answers[i];
      btn.className = 'answer';
      btn.disabled = false;
      btn.hidden = false;
    });

    $('confirm-bar').hidden = true;
    highlightLadder(state.level);
    startTimer();
  }

  function startTimer() {
    stopTimer();
    var el = $('timer');
    if (!settings.timer) { el.hidden = true; return; }

    state.secondsLeft = QUESTION_SECONDS;
    el.hidden = false;
    el.textContent = String(state.secondsLeft);
    el.classList.remove('urgent');

    state.timerId = setInterval(function () {
      state.secondsLeft--;
      el.textContent = String(Math.max(0, state.secondsLeft));
      if (state.secondsLeft <= 10) {
        el.classList.add('urgent');
        if (state.secondsLeft > 0) soundTick();
      }
      if (state.secondsLeft <= 0) {
        stopTimer();
        timeUp();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state && state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function selectAnswer(index) {
    if (!state || state.locked) return;
    if (state.removed.indexOf(index) !== -1) return;

    state.selected = index;
    $$('.answer').forEach(function (btn, i) {
      btn.classList.toggle('selected', i === index);
    });
    $('confirm-bar').hidden = false;
    soundSelect();
  }

  function changeAnswer() {
    state.selected = null;
    $$('.answer').forEach(function (btn) { btn.classList.remove('selected'); });
    $('confirm-bar').hidden = true;
  }

  function timeUp() {
    // Out of time counts as a wrong answer, as it would on the show.
    state.locked = true;
    $('confirm-bar').hidden = true;
    $$('.answer').forEach(function (b) { b.disabled = true; });
    var q = state.question;
    Stats.recordAnswer(q.category, false, QUESTION_SECONDS * 1000);
    state.review.push({
      level: state.level, category: q.category, question: q.question,
      correct: q.answers[q.correctIndex], given: '(ran out of time)', wasCorrect: false
    });
    $$('.answer')[q.correctIndex].classList.add('correct');
    soundWrong();
    delay(2000).then(function () { endGame('lost'); });
  }

  function lockIn() {
    if (state.selected === null || state.locked) return;
    state.locked = true;
    stopTimer();

    var chosen = state.selected;
    var q = state.question;
    var elapsed = Date.now() - state.askedAt;
    var wasCorrect = chosen === q.correctIndex;

    $('confirm-bar').hidden = true;
    $$('.answer').forEach(function (b) { b.disabled = true; });
    $$('.answer')[chosen].classList.add('locked');
    soundLockIn();

    // Suspense scales with the stakes, as on the show.
    var suspense = state.level <= 5 ? 900 : state.level <= 10 ? 1800 : 3000;

    delay(suspense).then(function () {
      Stats.recordAnswer(q.category, wasCorrect, elapsed);
      state.review.push({
        level: state.level,
        category: q.category,
        question: q.question,
        correct: q.answers[q.correctIndex],
        given: q.answers[chosen],
        wasCorrect: wasCorrect
      });

      if (wasCorrect) {
        $$('.answer')[chosen].classList.remove('locked');
        $$('.answer')[chosen].classList.add('correct');
        soundCorrect();
        return delay(1400).then(function () {
          if (state.level === LADDER.length) {
            endGame('won');
          } else {
            state.level++;
            loadQuestion();
          }
        });
      }

      $$('.answer')[chosen].classList.remove('locked');
      $$('.answer')[chosen].classList.add('wrong');
      $$('.answer')[q.correctIndex].classList.add('correct');
      soundWrong();
      return delay(2600).then(function () { endGame('lost'); });
    });
  }

  function walkAway() {
    if (!state || state.locked) return;
    stopTimer();
    state.locked = true;
    endGame('walked');
  }

  function endGame(outcome) {
    stopTimer();
    var answered = state.level - 1;                 // questions answered correctly
    if (outcome === 'won') answered = LADDER.length;

    var winnings;
    if (outcome === 'won') winnings = LADDER[LADDER.length - 1];
    else if (outcome === 'walked') winnings = walkAwayAmount(answered);
    else winnings = bankedAmount(answered);

    Stats.recordGame({
      winnings: winnings,
      level: answered,
      outcome: outcome,
      date: Date.now()
    });

    renderResult(outcome, winnings, answered);
    showScreen('screen-result');
  }

  /* ---------------- lifelines ---------------- */

  function useFiftyFifty() {
    if (!state || !state.lifelines.fifty || state.locked) return;
    state.lifelines.fifty = false;
    $('ll-5050').classList.add('used');
    $('ll-5050').disabled = true;

    var q = state.question;
    var wrongIndexes = [0, 1, 2, 3].filter(function (i) { return i !== q.correctIndex; });
    // Keep one wrong answer, drop the other two.
    var keep = wrongIndexes[Math.floor(Math.random() * wrongIndexes.length)];
    var drop = wrongIndexes.filter(function (i) { return i !== keep; });

    state.removed = drop;
    drop.forEach(function (i) {
      var btn = $$('.answer')[i];
      btn.classList.add('removed');
      btn.disabled = true;
      btn.querySelector('.atext').textContent = '';
      if (state.selected === i) changeAnswer();
    });
    tone(320, 300, 'triangle', 0.06);
  }

  /*
   * Simulated audience. The crowd is reliable on easy questions and much
   * less so as the money climbs — and, like the real thing, it only votes
   * on answers still on the board.
   */
  function askTheAudience() {
    if (!state || !state.lifelines.audience || state.locked) return;
    state.lifelines.audience = false;
    $('ll-audience').classList.add('used');
    $('ll-audience').disabled = true;

    var q = state.question;
    var difficulty = Questions.difficultyForLevel(state.level);
    var correctShare = difficulty === 'easy' ? 0.62 + Math.random() * 0.28
                     : difficulty === 'medium' ? 0.38 + Math.random() * 0.30
                     : 0.22 + Math.random() * 0.28;

    var live = [0, 1, 2, 3].filter(function (i) { return state.removed.indexOf(i) === -1; });
    var votes = {};
    votes[q.correctIndex] = correctShare;

    var others = live.filter(function (i) { return i !== q.correctIndex; });
    var remaining = 1 - correctShare;
    var weights = others.map(function () { return Math.random() + 0.15; });
    var weightTotal = weights.reduce(function (a, b) { return a + b; }, 0);
    others.forEach(function (i, n) {
      votes[i] = remaining * (weights[n] / weightTotal);
    });

    // Round to whole percentages that still add up to 100.
    var percents = {};
    var runningTotal = 0;
    live.forEach(function (i, n) {
      if (n === live.length - 1) {
        percents[i] = 100 - runningTotal;
      } else {
        percents[i] = Math.round(votes[i] * 100);
        runningTotal += percents[i];
      }
    });

    var letters = ['A', 'B', 'C', 'D'];
    var html = '<div class="audience-chart">';
    live.forEach(function (i) {
      html += '<div class="bar-col">' +
                '<div class="bar-value">' + percents[i] + '%</div>' +
                '<div class="bar" style="height:' + Math.max(2, percents[i] * 1.6) + 'px"></div>' +
                '<div class="bar-letter">' + letters[i] + '</div>' +
              '</div>';
    });
    html += '</div>';
    openModal('Ask the Audience', html);
    tone(520, 200, 'triangle', 0.05);
  }

  /*
   * Phone a Friend. The friend is usually right on easy questions and a
   * coin-flip on the hard ones, and says so — the confidence wording is
   * the useful part to practise reading.
   */
  function phoneAFriend() {
    if (!state || !state.lifelines.phone || state.locked) return;
    state.lifelines.phone = false;
    $('ll-phone').classList.add('used');
    $('ll-phone').disabled = true;

    var q = state.question;
    var difficulty = Questions.difficultyForLevel(state.level);
    var accuracy = difficulty === 'easy' ? 0.9 : difficulty === 'medium' ? 0.7 : 0.45;
    var confident = Math.random() < accuracy;

    var live = [0, 1, 2, 3].filter(function (i) { return state.removed.indexOf(i) === -1; });
    var answerIndex;
    if (confident) {
      answerIndex = q.correctIndex;
    } else {
      var wrong = live.filter(function (i) { return i !== q.correctIndex; });
      answerIndex = wrong.length ? wrong[Math.floor(Math.random() * wrong.length)] : q.correctIndex;
    }

    var letters = ['A', 'B', 'C', 'D'];
    var sure = [
      'I’m certain, it’s',
      'No question about it —',
      'I know this one. It’s'
    ];
    var unsure = [
      'I’m not certain, but I’d probably say',
      'Honestly I’m guessing here, maybe',
      'I think — and don’t hold me to this —'
    ];
    var pool = confident && Math.random() < 0.75 ? sure : unsure;
    var phrase = pool[Math.floor(Math.random() * pool.length)];

    var seconds = 30;
    var body = '<p class="phone-timer" id="phone-timer">' + seconds + 's</p>' +
               '<p class="phone-line">&ldquo;' + phrase + ' <strong>' +
               letters[answerIndex] + '</strong> &mdash; ' +
               escapeHtml(q.answers[answerIndex]) + '.&rdquo;</p>';
    openModal('Phone a Friend', body);

    var el = $('phone-timer');
    var id = setInterval(function () {
      seconds--;
      if (el) el.textContent = Math.max(0, seconds) + 's';
      if (seconds <= 0) {
        clearInterval(id);
        if (el) el.textContent = 'Time’s up';
      }
    }, 1000);
    modalOnClose = function () { clearInterval(id); };
    tone(880, 120, 'sine', 0.05);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- modal ---------------- */

  var modalOnClose = null;

  function openModal(title, bodyHtml) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = bodyHtml;
    $('modal').hidden = false;
  }

  function closeModal() {
    $('modal').hidden = true;
    if (modalOnClose) { modalOnClose(); modalOnClose = null; }
  }

  /* ---------------- result screen ---------------- */

  function renderResult(outcome, winnings, answered) {
    var title = outcome === 'won' ? 'You are a millionaire!'
              : outcome === 'walked' ? 'You walked away'
              : 'That’s the wrong answer';
    $('result-title').textContent = title;
    $('result-money').textContent = money(winnings);

    var detail;
    if (outcome === 'won') {
      detail = 'All fifteen questions. Nothing left to practise.';
    } else if (outcome === 'walked') {
      detail = 'Banked after ' + answered + ' correct ' +
               (answered === 1 ? 'answer' : 'answers') + '.';
    } else {
      detail = 'Out at question ' + (answered + 1) + '. ' +
               (winnings > 0 ? 'The safety net kept ' + money(winnings) + '.'
                             : 'No safety net reached.');
    }
    $('result-detail').textContent = detail;

    var rows = state.review.map(function (r) {
      var mark = r.wasCorrect ? '<span class="tick">✓</span>' : '<span class="cross">✗</span>';
      var extra = r.wasCorrect ? '' :
        '<div class="review-correction">Correct answer: <strong>' +
        escapeHtml(r.correct) + '</strong> (you said ' + escapeHtml(r.given) + ')</div>';
      return '<div class="review-row' + (r.wasCorrect ? '' : ' bad') + '">' +
               '<div class="review-head">' + mark +
                 '<span class="review-level">Q' + r.level + '</span>' +
                 '<span class="review-cat">' + escapeHtml(r.category) + '</span>' +
               '</div>' +
               '<div class="review-q">' + escapeHtml(r.question) + '</div>' + extra +
             '</div>';
    }).join('');
    $('result-review').innerHTML = '<h3>This game</h3>' + (rows || '<p>No questions answered.</p>');
  }

  /* ---------------- stats screen ---------------- */

  function renderStats() {
    var data = Stats.read();
    var overall = data.totalAnswered
      ? Math.round((data.totalCorrect / data.totalAnswered) * 100) + '%'
      : '—';

    $('stat-summary').innerHTML =
      statTile('Games played', data.gamesPlayed) +
      statTile('Best winnings', money(data.bestWinnings)) +
      statTile('Best level', data.bestLevel + ' / 15') +
      statTile('Overall accuracy', overall);

    var rows = Stats.categoryRows();
    if (!rows.length) {
      $('stat-categories').innerHTML = '<p class="muted">Play a game and this fills in.</p>';
    } else {
      var weak = Stats.weakCategories();
      $('stat-categories').innerHTML = rows.map(function (r) {
        var pct = Math.round(r.accuracy * 100);
        var isWeak = weak.indexOf(r.name) !== -1;
        return '<div class="cat-row' + (isWeak ? ' weak' : '') + '">' +
                 '<div class="cat-name">' + escapeHtml(r.name) +
                   (isWeak ? '<span class="weak-tag">drilling</span>' : '') + '</div>' +
                 '<div class="cat-bar"><span style="width:' + pct + '%"></span></div>' +
                 '<div class="cat-figures">' + pct + '% · ' + r.correct + '/' + r.seen +
                   ' · ' + (r.avgTimeMs / 1000).toFixed(1) + 's avg</div>' +
               '</div>';
      }).join('');
    }

    if (!data.history.length) {
      $('stat-history').innerHTML = '<p class="muted">No games yet.</p>';
    } else {
      $('stat-history').innerHTML = data.history.map(function (h) {
        var when = new Date(h.date).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });
        return '<div class="history-row">' +
                 '<span class="hist-money">' + money(h.winnings) + '</span>' +
                 '<span class="hist-detail">Q' + h.level + ' · ' + h.outcome + '</span>' +
                 '<span class="hist-date">' + when + '</span>' +
               '</div>';
      }).join('');
    }
  }

  function statTile(label, value) {
    return '<div class="stat-tile"><span class="stat-value">' + value +
           '</span><span class="stat-label">' + label + '</span></div>';
  }

  /* ---------------- settings ---------------- */

  function bindSetting(id, key) {
    var el = $(id);
    el.checked = settings[key];
    el.addEventListener('change', function () {
      settings[key] = el.checked;
      Stats.writeSettings(settings);
    });
  }

  /* ---------------- wiring ---------------- */

  function init() {
    buildLadder();

    bindSetting('opt-adaptive', 'adaptive');
    bindSetting('opt-timer', 'timer');
    bindSetting('opt-sound', 'sound');

    $('btn-play').addEventListener('click', startGame);
    $('btn-stats').addEventListener('click', function () {
      renderStats();
      showScreen('screen-stats');
    });
    $('btn-stats-back').addEventListener('click', function () { showScreen('screen-home'); });
    $('btn-stats-reset').addEventListener('click', function () {
      if (window.confirm('Delete all saved stats and history?')) {
        Stats.reset();
        renderStats();
      }
    });

    $$('.answer').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectAnswer(Number(btn.dataset.index));
      });
    });
    $('btn-final').addEventListener('click', lockIn);
    $('btn-change').addEventListener('click', changeAnswer);
    $('btn-walk').addEventListener('click', function () {
      if (window.confirm('Walk away with ' + money(walkAwayAmount(state.level - 1)) + '?')) {
        walkAway();
      }
    });

    $('ll-5050').addEventListener('click', useFiftyFifty);
    $('ll-audience').addEventListener('click', askTheAudience);
    $('ll-phone').addEventListener('click', phoneAFriend);

    $('modal-close').addEventListener('click', closeModal);
    $('modal').addEventListener('click', function (e) {
      if (e.target === $('modal')) closeModal();
    });

    $('btn-again').addEventListener('click', startGame);
    $('btn-result-stats').addEventListener('click', function () {
      renderStats();
      showScreen('screen-stats');
    });
    $('btn-home').addEventListener('click', function () { showScreen('screen-home'); });

    // Keyboard: A-D to pick, Enter to lock in, Escape to close a modal.
    document.addEventListener('keydown', function (e) {
      if (!$('modal').hidden) {
        if (e.key === 'Escape' || e.key === 'Enter') closeModal();
        return;
      }
      if (!$('screen-game').classList.contains('active')) return;
      var key = e.key.toLowerCase();
      var index = ['a', 'b', 'c', 'd'].indexOf(key);
      if (index !== -1) selectAnswer(index);
      if (e.key === 'Enter') lockIn();
    });

    Questions.prefetch();
    setTimeout(function () {
      var s = Questions.getStatus();
      $('source-note').textContent = s.live
        ? 'Questions loading live from ' + s.source + '.'
        : 'Using the offline question bank — live questions will be used as soon as they load.';
    }, 3000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

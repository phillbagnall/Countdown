/*
 * Browse: searchable/filterable/sortable Pokemon grid, plus a tap-to-open
 * detail overlay. Reads Dataset (data) and Progress (due/box state), never
 * writes to Progress itself.
 */
window.Browse = (function () {
  'use strict';

  var GEN_LABELS = {
    1: 'Gen 1 (Kanto)', 2: 'Gen 2 (Johto)', 3: 'Gen 3 (Hoenn)',
    4: 'Gen 4 (Sinnoh)', 5: 'Gen 5 (Unova)', 6: 'Gen 6 (Kalos)',
    7: 'Gen 7 (Alola)', 8: 'Gen 8 (Galar)', 9: 'Gen 9 (Paldea)'
  };
  var STAT_LABELS = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
  var STAT_MAX = 180; // rough ceiling for the stat-bar widths

  var els = {};
  var state = { gen: '', type: '', query: '', sort: 'dex', dueOnly: false };

  function init() {
    els.search = document.getElementById('browse-search');
    els.gen = document.getElementById('browse-gen');
    els.type = document.getElementById('browse-type');
    els.sort = document.getElementById('browse-sort');
    els.dueOnly = document.getElementById('browse-due-only');
    els.count = document.getElementById('browse-count');
    els.grid = document.getElementById('browse-grid');
    els.overlay = document.getElementById('detail-overlay');
    els.detailBody = document.getElementById('detail-body');
    els.detailClose = document.getElementById('detail-close');

    Dataset.generations().forEach(function (g) {
      var opt = document.createElement('option');
      opt.value = g;
      opt.textContent = GEN_LABELS[g] || ('Gen ' + g);
      els.gen.appendChild(opt);
    });
    Dataset.types().forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t[0].toUpperCase() + t.slice(1);
      els.type.appendChild(opt);
    });

    els.search.addEventListener('input', function () {
      state.query = els.search.value;
      render();
    });
    els.gen.addEventListener('change', function () { state.gen = els.gen.value; render(); });
    els.type.addEventListener('change', function () { state.type = els.type.value; render(); });
    els.sort.addEventListener('change', function () { state.sort = els.sort.value; render(); });
    els.dueOnly.addEventListener('change', function () { state.dueOnly = els.dueOnly.checked; render(); });

    els.grid.addEventListener('click', function (e) {
      var card = e.target.closest('.poke-card');
      if (card) openDetail(Number(card.dataset.id));
    });
    els.detailClose.addEventListener('click', closeDetail);
    els.overlay.addEventListener('click', function (e) {
      if (e.target === els.overlay) closeDetail();
    });

    render();
  }

  function computeList() {
    var list = Dataset.filter({ gen: state.gen, type: state.type, query: state.query });
    if (state.dueOnly) {
      var due = new Set(Progress.dueIds(Dataset.all().map(function (p) { return p.id; })));
      list = list.filter(function (p) { return due.has(p.id); });
    }
    return Dataset.sort(list, state.sort, { boxOf: Progress.boxOf });
  }

  function typeBadges(types) {
    return types.map(function (t) {
      return '<span class="type-badge type-' + t + '">' + t + '</span>';
    }).join('');
  }

  function render() {
    var list = computeList();
    els.count.textContent = list.length + (list.length === 1 ? ' Pokemon' : ' Pokemon');

    var frag = document.createDocumentFragment();
    list.forEach(function (p) {
      var card = document.createElement('button');
      card.className = 'poke-card';
      card.dataset.id = p.id;
      card.innerHTML =
        '<span class="poke-dex">#' + String(p.id).padStart(3, '0') + '</span>' +
        '<img loading="lazy" src="' + Dataset.imageUrl(p.id) + '" alt="' + p.name + '">' +
        '<span class="poke-name">' + p.name + '</span>' +
        '<span class="type-badges">' + typeBadges(p.types) + '</span>';
      frag.appendChild(card);
    });
    els.grid.innerHTML = '';
    els.grid.appendChild(frag);
  }

  function evoChainLine(p) {
    var parts = [];
    if (p.evoFrom) {
      var from = Dataset.byId(p.evoFrom);
      if (from) parts.push('Evolves from <strong>' + from.name + '</strong>');
    }
    if (p.evoTo.length) {
      var tos = p.evoTo.map(function (e) {
        var target = Dataset.byId(e.id);
        return (target ? target.name : '#' + e.id) + ' (' + e.m + ')';
      });
      parts.push('Evolves into ' + tos.map(function (t) { return '<strong>' + t + '</strong>'; }).join(', '));
    }
    if (!parts.length) parts.push('Does not evolve');
    return parts.join('<br>');
  }

  function statBars(stats) {
    return stats.map(function (v, i) {
      var pct = Math.min(100, Math.round((v / STAT_MAX) * 100));
      return (
        '<div class="stat-row">' +
          '<span class="stat-label">' + STAT_LABELS[i] + '</span>' +
          '<span class="stat-bar"><span style="width:' + pct + '%"></span></span>' +
          '<span class="stat-value">' + v + '</span>' +
        '</div>'
      );
    }).join('');
  }

  function openDetail(id) {
    var p = Dataset.byId(id);
    if (!p) return;
    var entry = Progress.entryOf(id);
    var boxLine = entry
      ? 'Leitner box ' + entry.box + '/5 &middot; seen ' + entry.seen + ' &middot; ' +
        Math.round((entry.correct / entry.seen) * 100) + '% correct'
      : 'Not studied yet';

    els.detailBody.innerHTML =
      '<img class="detail-img" src="' + Dataset.imageUrl(p.id) + '" alt="' + p.name + '">' +
      '<h2>' + p.name + ' <span class="muted">#' + String(p.id).padStart(3, '0') + '</span></h2>' +
      '<p class="type-badges">' + typeBadges(p.types) + '</p>' +
      '<p class="muted">' + (GEN_LABELS[p.gen] || ('Gen ' + p.gen)) + '</p>' +
      '<div class="stat-block">' + statBars(p.stats) + '</div>' +
      '<p>Height ' + (p.height / 10).toFixed(1) + ' m &middot; Weight ' + (p.weight / 10).toFixed(1) + ' kg</p>' +
      '<p>Abilities: ' + p.abilities.join(', ') + '</p>' +
      '<p class="evo-line">' + evoChainLine(p) + '</p>' +
      '<p class="muted">' + boxLine + '</p>';

    els.overlay.hidden = false;
  }

  function closeDetail() {
    els.overlay.hidden = true;
  }

  return { init: init, refresh: render };
})();

/*
 * Dataset: the Pokemon reference data, loaded once from data/pokemon.json.
 *
 * Read-only, no localStorage - mirrors questions.js's role as "the data
 * source module" in the Millionaire app. Every record looks like:
 *   { id, name, types, gen, stats, height, weight, abilities,
 *     evoFrom, evoTo, family, stage }
 * stats is [hp, attack, defense, special-attack, special-defense, speed].
 */
window.Dataset = (function () {
  'use strict';

  var SPRITE_BASE =
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';

  var all = [];
  var byId = new Map();
  var loaded = null;

  function load() {
    if (loaded) return loaded;
    loaded = fetch('data/pokemon.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load pokemon.json: ' + res.status);
        return res.json();
      })
      .then(function (records) {
        all = records;
        byId = new Map(records.map(function (r) { return [r.id, r]; }));
        return all;
      });
    return loaded;
  }

  function getAll() {
    return all;
  }

  function getById(id) {
    return byId.get(Number(id));
  }

  function imageUrl(id) {
    return SPRITE_BASE + id + '.png';
  }

  function normalise(s) {
    return (s || '').toLowerCase().trim();
  }

  function filter(opts) {
    opts = opts || {};
    var gen = opts.gen;
    var type = opts.type;
    var query = normalise(opts.query);
    return all.filter(function (p) {
      if (gen && p.gen !== Number(gen)) return false;
      if (type && p.types.indexOf(type) === -1) return false;
      if (query && p.name.toLowerCase().indexOf(query) === -1) return false;
      return true;
    });
  }

  /*
   * key: 'dex' | 'name' | 'type' | 'family' | 'weakest'
   * extra.boxOf(id) -> Leitner box number, required for 'weakest'.
   */
  function sortList(list, key, extra) {
    extra = extra || {};
    var copy = list.slice();
    switch (key) {
      case 'name':
        copy.sort(function (a, b) { return a.name.localeCompare(b.name); });
        break;
      case 'type':
        copy.sort(function (a, b) {
          return a.types[0].localeCompare(b.types[0]) || a.id - b.id;
        });
        break;
      case 'family':
        copy.sort(function (a, b) {
          return a.family - b.family || a.stage - b.stage || a.id - b.id;
        });
        break;
      case 'weakest':
        if (typeof extra.boxOf === 'function') {
          copy.sort(function (a, b) {
            return extra.boxOf(a.id) - extra.boxOf(b.id) || a.id - b.id;
          });
        }
        break;
      case 'dex':
      default:
        copy.sort(function (a, b) { return a.id - b.id; });
    }
    return copy;
  }

  function generations() {
    var set = new Set(all.map(function (p) { return p.gen; }));
    return Array.from(set).sort(function (a, b) { return a - b; });
  }

  function types() {
    var set = new Set();
    all.forEach(function (p) { p.types.forEach(function (t) { set.add(t); }); });
    return Array.from(set).sort();
  }

  return {
    load: load,
    all: getAll,
    byId: getById,
    imageUrl: imageUrl,
    filter: filter,
    sort: sortList,
    generations: generations,
    types: types
  };
})();

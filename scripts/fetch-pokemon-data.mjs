#!/usr/bin/env node
/*
 * Generates pokedex/data/pokemon.json for all National Dex species (Gen 1-9,
 * ids 1-1025) by joining PokeAPI's own CSV data dump, pulled straight from
 * its GitHub repo (raw.githubusercontent.com/PokeAPI/pokeapi). That dump is
 * the same source PokeAPI's REST API is generated from, but joining ~15
 * bulk CSV files locally is far more robust than ~2000+ individual REST
 * calls (no rate limiting, no pagination, works from anywhere that can
 * reach GitHub's raw content host).
 *
 * Maintainer-only. Never run by the deployed app. Requires Node 18+ (uses
 * the built-in fetch). No npm dependencies.
 *
 *   node scripts/fetch-pokemon-data.mjs
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(REPO_ROOT, 'pokedex', 'data', 'pokemon.json');
const CACHE_DIR = path.join(__dirname, '.pokeapi-cache');

const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const EN = '9'; // languages.csv: id 9 = English
const NATIONAL_DEX_MAX = 1025; // last species of Gen 9 (Scarlet/Violet)

const STAT_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }; // hp,atk,def,spa,spd,spe

/* ---------------- fetch + cache ---------------- */

async function fetchCsv(name) {
  const cachePath = path.join(CACHE_DIR, name);
  if (existsSync(cachePath)) {
    return readFile(cachePath, 'utf8');
  }
  const url = `${CSV_BASE}/${name}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const text = await res.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, text, 'utf8');
  return text;
}

/* ---------------- tiny RFC4180-ish CSV parser ---------------- */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const lines = text.split(/\r\n|\n/);
  for (const line of lines) {
    if (line === '' && !inQuotes) continue;
    let i = 0;
    if (!inQuotes) { row = []; field = ''; }
    while (i < line.length) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += c; i += 1; continue;
      }
      if (c === '"') { inQuotes = true; i += 1; continue; }
      if (c === ',') { row.push(field); field = ''; i += 1; continue; }
      field += c; i += 1;
    }
    if (inQuotes) { field += '\n'; continue; } // embedded newline, keep accumulating
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] === undefined ? '' : r[idx]; });
    return obj;
  });
}

function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

/* ---------------- evolution method labelling ---------------- */

function titleCase(identifier) {
  return identifier.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function evoLabel(row, triggerName, itemNameById) {
  const item = row.trigger_item_id ? itemNameById.get(row.trigger_item_id) : null;
  switch (triggerName) {
    case 'level-up':
      if (row.minimum_level) return `Level ${row.minimum_level}`;
      if (row.minimum_happiness) return 'High friendship';
      if (row.minimum_beauty) return 'High beauty';
      if (row.minimum_affection) return 'High affection';
      if (row.known_move_id || row.known_move_type_id) return 'Level up (knows a move)';
      if (row.time_of_day) return `Level up (${row.time_of_day})`;
      if (row.location_id) return 'Level up (at a location)';
      return 'Level up';
    case 'trade':
      return item ? `Trade holding ${item}` : 'Trade';
    case 'use-item':
      return item ? `Use ${item}` : 'Use item';
    case 'shed':
      return 'Empty Poke Ball + free party slot';
    case 'spin':
      return 'Spin holding item';
    default:
      return titleCase(triggerName || 'other');
  }
}

/* ---------------- main ---------------- */

async function main() {
  console.log('Fetching PokeAPI CSV data dump...');
  const [
    pokemonCsv, speciesCsv, speciesNamesCsv, typesCsv, pokemonTypesCsv,
    pokemonStatsCsv, pokemonAbilitiesCsv, abilityNamesCsv, evolutionCsv,
    evolutionTriggersCsv, itemNamesCsv
  ] = await Promise.all([
    fetchCsv('pokemon.csv'),
    fetchCsv('pokemon_species.csv'),
    fetchCsv('pokemon_species_names.csv'),
    fetchCsv('types.csv'),
    fetchCsv('pokemon_types.csv'),
    fetchCsv('pokemon_stats.csv'),
    fetchCsv('pokemon_abilities.csv'),
    fetchCsv('ability_names.csv'),
    fetchCsv('pokemon_evolution.csv'),
    fetchCsv('evolution_triggers.csv'),
    fetchCsv('item_names.csv')
  ]);

  const pokemon = parseCsv(pokemonCsv);
  const species = parseCsv(speciesCsv);
  const speciesNames = parseCsv(speciesNamesCsv);
  const types = parseCsv(typesCsv);
  const pokemonTypes = parseCsv(pokemonTypesCsv);
  const pokemonStats = parseCsv(pokemonStatsCsv);
  const pokemonAbilities = parseCsv(pokemonAbilitiesCsv);
  const abilityNames = parseCsv(abilityNamesCsv);
  const evolutions = parseCsv(evolutionCsv);
  const evolutionTriggers = parseCsv(evolutionTriggersCsv);
  const itemNames = parseCsv(itemNamesCsv);

  console.log('Joining...');

  const typeNameById = new Map(types.map((t) => [t.id, t.identifier]));
  const speciesNameById = new Map(
    speciesNames.filter((n) => n.local_language_id === EN).map((n) => [n.pokemon_species_id, n.name])
  );
  const abilityNameById = new Map(
    abilityNames.filter((n) => n.local_language_id === EN).map((n) => [n.ability_id, n.name])
  );
  const itemNameById = new Map(
    itemNames.filter((n) => n.local_language_id === EN).map((n) => [n.item_id, n.name])
  );
  const triggerNameById = new Map(evolutionTriggers.map((t) => [t.id, t.identifier]));
  // One representative evolution row per evolved species (method can vary
  // slightly by version group; any one of them is a fine flashcard fact).
  const evolutionByEvolvedSpeciesId = new Map();
  for (const row of evolutions) {
    if (!evolutionByEvolvedSpeciesId.has(row.evolved_species_id)) {
      evolutionByEvolvedSpeciesId.set(row.evolved_species_id, row);
    }
  }

  const defaultFormById = new Map(
    pokemon
      .filter((p) => p.is_default === '1' && Number(p.species_id) <= NATIONAL_DEX_MAX)
      .map((p) => [p.species_id, p])
  );
  const typesByPokemonId = groupBy(pokemonTypes, 'pokemon_id');
  const statsByPokemonId = groupBy(pokemonStats, 'pokemon_id');
  const abilitiesByPokemonId = groupBy(pokemonAbilities, 'pokemon_id');
  const speciesById = new Map(species.map((s) => [s.id, s]));
  const childrenByParentId = groupBy(
    species.filter((s) => s.evolves_from_species_id),
    'evolves_from_species_id'
  );

  // family/stage: walk each species up its evolves_from chain to the root,
  // memoised so repeated chain members don't get re-walked.
  const familyStageById = new Map();
  function resolveFamilyStage(id) {
    if (familyStageById.has(id)) return familyStageById.get(id);
    const s = speciesById.get(id);
    if (!s || !s.evolves_from_species_id) {
      const result = { family: Number(id), stage: 1 };
      familyStageById.set(id, result);
      return result;
    }
    const parent = resolveFamilyStage(s.evolves_from_species_id);
    const result = { family: parent.family, stage: parent.stage + 1 };
    familyStageById.set(id, result);
    return result;
  }

  const records = [];
  for (let id = 1; id <= NATIONAL_DEX_MAX; id += 1) {
    const idStr = String(id);
    const s = speciesById.get(idStr);
    const form = defaultFormById.get(idStr);
    if (!s || !form) {
      throw new Error(`Missing species or default form for dex id ${id}`);
    }

    const typeRows = (typesByPokemonId.get(idStr) || []).sort((a, b) => a.slot - b.slot);
    const typeNames = typeRows.map((t) => typeNameById.get(t.type_id));

    const statArr = [0, 0, 0, 0, 0, 0];
    for (const row of statsByPokemonId.get(idStr) || []) {
      const idx = STAT_INDEX[row.stat_id];
      if (idx !== undefined) statArr[idx] = Number(row.base_stat);
    }

    const abilityRows = (abilitiesByPokemonId.get(idStr) || []).sort((a, b) => a.slot - b.slot);
    const abilityNamesArr = abilityRows.map((a) => abilityNameById.get(a.ability_id)).filter(Boolean);

    const children = (childrenByParentId.get(idStr) || [])
      .map((c) => Number(c.id))
      .sort((a, b) => a - b)
      .map((childId) => {
        const evoRow = evolutionByEvolvedSpeciesId.get(String(childId));
        const triggerName = evoRow ? triggerNameById.get(evoRow.evolution_trigger_id) : null;
        const m = evoRow ? evoLabel(evoRow, triggerName, itemNameById) : 'Unknown';
        return { id: childId, m };
      });

    const { family, stage } = resolveFamilyStage(idStr);

    records.push({
      id,
      name: speciesNameById.get(idStr) || titleCase(s.identifier),
      types: typeNames,
      gen: Number(s.generation_id),
      stats: statArr,
      height: Number(form.height),
      weight: Number(form.weight),
      abilities: abilityNamesArr,
      evoFrom: s.evolves_from_species_id ? Number(s.evolves_from_species_id) : null,
      evoTo: children,
      family,
      stage
    });
  }

  if (records.length !== NATIONAL_DEX_MAX) {
    throw new Error(`Expected ${NATIONAL_DEX_MAX} records, got ${records.length}`);
  }
  records.forEach((r, i) => {
    if (r.id !== i + 1) throw new Error(`Dex id gap at index ${i}: got id ${r.id}`);
  });

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  const json = JSON.stringify(records);
  await writeFile(OUT_FILE, json, 'utf8');

  const kb = (json.length / 1024).toFixed(1);
  console.log(`Wrote ${records.length} records (${kb} KB) to ${path.relative(REPO_ROOT, OUT_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

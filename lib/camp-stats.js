const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'route-cache.json');
const map = new Map();
let saveTimer = null;

function loadFromDisk() {
  try {
    if (!fs.existsSync(DATA)) return;
    const raw = fs.readFileSync(DATA, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [signature, value] of Object.entries(parsed)) {
      map.set(signature, value);
    }
  } catch {
    // Read-only or corrupted cache file should not block live flow.
  }
}

function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    let disk = {};

    try {
      if (fs.existsSync(DATA)) {
        disk = JSON.parse(fs.readFileSync(DATA, 'utf8')) || {};
      }
    } catch {
      disk = {};
    }

    const merged = { ...disk, ...Object.fromEntries(map) };
    // keep in-memory map synced with fresh on-disk rows that we may not have seen
    for (const [signature, value] of Object.entries(disk)) {
      if (!map.has(signature)) map.set(signature, value);
    }

    try {
      fs.writeFileSync(DATA, JSON.stringify(merged));
    } catch {
      // serverless/read-only mode: keep memory only.
    }
  }, 4000);
}

function lookup(signature) {
  return map.get(signature) || null;
}

function learn(signature, route, amount) {
  if (!signature) return;
  if (route !== 'staking' && route !== 'summer') return;

  const a = Number(amount) || 0;
  const prev = map.get(signature);
  if (prev && prev.r === route && prev.a === a) return;

  map.set(signature, { r: route, a });
  persist();
}

function getCamps() {
  const camps = {
    summer: { count: 0, total: 0 },
    staking: { count: 0, total: 0 },
    unknown: { count: 0, total: 0 },
  };

  for (const value of map.values()) {
    const key = value?.r === 'staking' ? 'staking' : value?.r === 'summer' ? 'summer' : 'unknown';
    camps[key].count += 1;
    camps[key].total += Number(value?.a) || 0;
  }

  camps.classifiedClaims = camps.summer.count + camps.staking.count;
  camps.trackedClaims = map.size;

  return camps;
}

loadFromDisk();
module.exports = {
  lookup,
  learn,
  getCamps,
};

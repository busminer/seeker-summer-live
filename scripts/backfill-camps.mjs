// Full backfill: classify every claim signature (claim-only vs claim+stake).
// Writes persistent cache data/route-cache.json: { sig: { r: 'staking'|'summer'|'unknown', a: amount } }
// Usage: node scripts/backfill-camps.mjs
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(root, 'data', 'route-cache.json');
const STAKING_PROGRAM = 'SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ';
const UPSTREAM = 'https://skrclaims.th3ryks.dev/api/claims';
const RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana'
];
const CONCURRENCY = 8;

const cache = new Map();
if (existsSync(CACHE)) {
  try { for (const [k, v] of Object.entries(JSON.parse(readFileSync(CACHE, 'utf8')))) cache.set(k, v); } catch {}
}
console.log(`cache loaded: ${cache.size} entries`);
const save = () => {
  mkdirSync(dirname(CACHE), { recursive: true });
  let existing = {};
  try {
    if (existsSync(CACHE)) {
      existing = JSON.parse(readFileSync(CACHE, 'utf8')) || {};
    }
  } catch {
    existing = {};
  }
  const merged = { ...existing, ...Object.fromEntries(cache) };
  writeFileSync(CACHE, JSON.stringify(merged));
};

// 1) fetch all claims (paged)
const claims = [];
for (let offset = 0; ; offset += 200) {
  const r = await fetch(`${UPSTREAM}?limit=200&offset=${offset}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`claims page ${offset}: HTTP ${r.status}`);
  const j = await r.json();
  claims.push(...j.items);
  console.log(`fetched claims page @${offset}: +${j.items.length} (total ${claims.length}/${j.total})`);
  if (!j.hasMore || !j.items.length) break;
}
console.log(`total claims: ${claims.length}`);

// 2) classify unknown signatures
const todo = claims.filter(c => c.signature && cache.get(c.signature)?.r !== 'staking' && cache.get(c.signature)?.r !== 'summer');
console.log(`to classify: ${todo.length} (already known: ${claims.length - todo.length})`);

let rpcIdx = 0, done = 0, fails = 0;
async function fetchTx(signature, attempt = 0) {
  const rpc = RPCS[rpcIdx++ % RPCS.length];
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] }),
      signal: AbortSignal.timeout(9000)
    });
    if (r.status === 429 || r.status === 503) {
      await new Promise(res => setTimeout(res, 800 + Math.random() * 1200));
      return attempt < 3 ? fetchTx(signature, attempt + 1) : null;
    }
    if (!r.ok) return attempt < 2 ? fetchTx(signature, attempt + 1) : null;
    const j = await r.json();
    return j.result || null;
  } catch {
    return attempt < 2 ? fetchTx(signature, attempt + 1) : null;
  }
}

async function classifyOne(c) {
  const tx = await fetchTx(c.signature);
  if (!tx) { cache.set(c.signature, { r: 'unknown', a: c.amount }); fails++; return; }
  const ixs = tx.transaction?.message?.instructions || [];
  const logs = tx.meta?.logMessages || [];
  const staked = ixs.some(ix => ix.programId === STAKING_PROGRAM) ||
    logs.some(l => l.includes(`Program ${STAKING_PROGRAM} invoke`) || l.includes('Instruction: Stake'));
  cache.set(c.signature, { r: staked ? 'staking' : 'summer', a: c.amount });
}

let cursor = 0;
async function worker() {
  while (cursor < todo.length) {
    const c = todo[cursor++];
    await classifyOne(c);
    if (++done % 100 === 0) { save(); console.log(`classified ${done}/${todo.length} (fails ${fails})`); }
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();

// 3) aggregate
const camps = { summer: { count: 0, total: 0 }, staking: { count: 0, total: 0 }, unknown: { count: 0, total: 0 } };
for (const c of claims) {
  const e = cache.get(c.signature);
  const r = e?.r === 'staking' ? 'staking' : e?.r === 'summer' ? 'summer' : 'unknown';
  camps[r].count++; camps[r].total += c.amount || 0;
}
const stats = { classifiedAt: new Date().toISOString(), totalClaims: claims.length, ...camps };
writeFileSync(join(root, 'data', 'camp-stats.json'), JSON.stringify(stats, null, 2));
console.log(`DONE in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
console.log(JSON.stringify(stats, null, 2));

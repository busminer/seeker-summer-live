const STAKING_PROGRAM = 'SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ';
const RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com'
];

const cache = globalThis.__skrClaimRouteCache || new Map();
globalThis.__skrClaimRouteCache = cache;

async function fetchTransaction(signature) {
  const payload = {
    jsonrpc: '2.0', id: 1, method: 'getTransaction',
    params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]
  };
  for (const rpc of RPCS) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'SeekerSummerLive/2.0' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4500)
      });
      if (!response.ok) continue;
      const json = await response.json();
      if (json.result) return json.result;
    } catch (_) {
      // Try the next public RPC. Unknown is safer than a false route.
    }
  }
  return null;
}

async function classify(signature) {
  if (!signature) return { staked: null, route: 'unknown' };
  if (cache.has(signature)) return cache.get(signature);
  const tx = await fetchTransaction(signature);
  if (!tx) return { staked: null, route: 'unknown' };

  const instructions = tx.transaction?.message?.instructions || [];
  const logs = tx.meta?.logMessages || [];
  const staked = instructions.some(ix => ix.programId === STAKING_PROGRAM) ||
    logs.some(line => line.includes(`Program ${STAKING_PROGRAM} invoke`) || line.includes('Program log: Instruction: Stake'));
  const result = { staked, route: staked ? 'staking' : 'summer' };
  cache.set(signature, result);

  if (cache.size > 1200) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  return result;
}

async function enrichClaims(claims, limit = 32, concurrency = 5) {
  const output = claims.map(claim => ({ ...claim, staked: null, route: 'unknown' }));
  let cursor = 0;
  async function worker() {
    while (cursor < Math.min(limit, output.length)) {
      const index = cursor++;
      Object.assign(output[index], await classify(output[index].signature));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, limit, output.length) }, worker));
  return output;
}

module.exports = { STAKING_PROGRAM, classify, enrichClaims };

const UPSTREAM = 'https://skrclaims.th3ryks.dev/api/state';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const response = await fetch(UPSTREAM, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'SeekerSummerLive/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    const data = await response.json();
    const safe = {
      vault: String(data.vault || ''),
      mint: String(data.mint || ''),
      total: Number(data.total || 0),
      remaining: Number(data.remaining || 0),
      claimed: Number(data.claimed || 0),
      claimCount: Number(data.claimCount || 0),
      percent: Number(data.percent || 0),
      claims: Array.isArray(data.claims) ? data.claims.slice(0, 80).map(c => ({
        signature: String(c.signature || ''),
        claimer: String(c.claimer || ''),
        domain: c.domain ? String(c.domain) : null,
        amount: Number(c.amount || 0),
        blockTime: Number(c.blockTime || 0),
        solscan: /^https:\/\/solscan\.io\/tx\//.test(c.solscan || '') ? c.solscan : `https://solscan.io/tx/${encodeURIComponent(c.signature || '')}`
      })) : []
    };
    res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json(safe);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Live claim source unavailable', detail: error.message });
  }
};

const { getLiveState } = require('../lib/live-state');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const state = await getLiveState();
    res.setHeader('Cache-Control', 's-maxage=2, stale-while-revalidate=8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json(state);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Live claim source unavailable', detail: error.message });
  }
};

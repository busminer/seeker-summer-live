const crypto = require('crypto');

const PRESENCE_KEY = 'seeker-summer:online';
const VISITS_KEY = 'seeker-summer:visits';
const WINDOW_MS = 45_000;
const PRESENCE_COOKIE = 'seeker_presence';
const VISIT_COOKIE = 'seeker_visit';

function redisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
  };
}

function sessionFrom(req, name, maxAge, setCookies) {
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9-]{36})(?:;|$)`, 'i'));
  if (match) return match[1];

  const id = crypto.randomUUID();
  setCookies.push(`${name}=${id}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
  return id;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, token } = redisConfig();
  if (!url || !token) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Presence store is not configured' });
  }

  try {
    const now = Date.now();
    const setCookies = [];
    const session = sessionFrom(req, PRESENCE_COOKIE, 86400, setCookies);
    const visit = sessionFrom(req, VISIT_COOKIE, 1800, setCookies);
    if (setCookies.length) res.setHeader('Set-Cookie', setCookies);
    const script = `
      redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
      redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
      redis.call('EXPIRE', KEYS[1], 120)
      local visitKey = KEYS[2] .. ':session:' .. ARGV[4]
      if redis.call('SET', visitKey, '1', 'NX', 'EX', 1800) then
        redis.call('INCR', KEYS[2])
      end
      return {redis.call('ZCARD', KEYS[1]), tonumber(redis.call('GET', KEYS[2]) or '0')}
    `;
    const response = await fetch(url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(['EVAL', script, '2', PRESENCE_KEY, VISITS_KEY, now, session, now - WINDOW_MS, visit]),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`Presence store ${response.status}`);
    const result = await response.json();
    const online = Number(result?.result?.[0]);
    const totalVisits = Number(result?.result?.[1]);
    if (!Number.isFinite(online) || !Number.isFinite(totalVisits)) throw new Error('Invalid presence response');

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json({ online, totalVisits, windowSeconds: WINDOW_MS / 1000 });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Presence temporarily unavailable', detail: error.message });
  }
};

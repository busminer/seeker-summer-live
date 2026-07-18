const crypto = require('crypto');

const PRESENCE_KEY = 'seeker-summer:online';
const WINDOW_MS = 45_000;
const COOKIE = 'seeker_presence';

function redisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
  };
}

function sessionFrom(req, res) {
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9-]{36})(?:;|$)`, 'i'));
  if (match) return match[1];

  const id = crypto.randomUUID();
  res.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`);
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
    const session = sessionFrom(req, res);
    const script = `
      redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
      redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[3])
      redis.call('EXPIRE', KEYS[1], 120)
      return redis.call('ZCARD', KEYS[1])
    `;
    const response = await fetch(url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(['EVAL', script, '1', PRESENCE_KEY, now, session, now - WINDOW_MS]),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`Presence store ${response.status}`);
    const result = await response.json();
    const online = Number(result?.result);
    if (!Number.isFinite(online)) throw new Error('Invalid presence response');

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json({ online, windowSeconds: WINDOW_MS / 1000 });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Presence temporarily unavailable', detail: error.message });
  }
};

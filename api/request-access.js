// POST /api/request-access — issue a 6-char access code, store as pending in KV (7-day TTL).
const { kv } = require('@vercel/kv');
const crypto = require('crypto');

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L confusion

function genCode() {
  const b = crypto.randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += CHARS[b[i] % CHARS.length];
  return s;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    let code = genCode();
    for (let i = 0; i < 5; i++) {
      const taken = (await kv.get('access:' + code)) || (await kv.get('pending:' + code));
      if (!taken) break;
      code = genCode();
    }
    await kv.set('pending:' + code, { createdAt: Date.now() }, { ex: 60 * 60 * 24 * 7 });
    await kv.sadd('pending:set', code);
    return res.status(200).json({ code });
  } catch (e) {
    return res.status(500).json({ error: 'KV not configured. Create a KV database and connect it to this project.' });
  }
};

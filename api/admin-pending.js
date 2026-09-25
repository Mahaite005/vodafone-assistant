// GET /api/admin-pending — list codes awaiting approval. Requires x-admin-secret header.
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const secret = req.headers['x-admin-secret'] || (req.query && req.query.secret) || '';
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const codes = (await kv.smembers('pending:set')) || [];
    const items = [];
    for (const c of codes) {
      const rec = await kv.get('pending:' + c);
      if (!rec) { await kv.srem('pending:set', c); continue; } // expired
      items.push({ code: c, createdAt: rec.createdAt || null });
    }
    items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return res.status(200).json({ pending: items });
  } catch (e) {
    return res.status(500).json({ error: 'KV not configured' });
  }
};

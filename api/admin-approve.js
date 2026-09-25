// POST /api/admin-approve {code, action:"approve"|"reject", secret} — approve or reject a code.
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = req.body || {};
  const secret = req.headers['x-admin-secret'] || body.secret || '';
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code) return res.status(400).json({ error: 'code required' });
  const action = body.action === 'reject' ? 'reject' : 'approve';
  try {
    await kv.srem('pending:set', code);
    await kv.del('pending:' + code);
    if (action === 'approve') {
      await kv.set('access:' + code, { approvedAt: Date.now() }, { ex: 60 * 60 * 24 * 90 });
    } else {
      await kv.del('access:' + code);
    }
    return res.status(200).json({ ok: true, action, code });
  } catch (e) {
    return res.status(500).json({ error: 'KV not configured' });
  }
};

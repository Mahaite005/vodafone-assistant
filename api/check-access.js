// GET /api/check-access?token=ABC123 — returns {allowed:true/false, pending:true/false}.
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const raw = (req.query && req.query.token) || '';
  const token = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!token) return res.status(200).json({ allowed: false });
  try {
    const rec = await kv.get('access:' + token);
    if (rec) return res.status(200).json({ allowed: true });
    const pend = await kv.get('pending:' + token);
    return res.status(200).json({ allowed: false, pending: !!pend });
  } catch (e) {
    return res.status(200).json({ allowed: false, error: 'kv' });
  }
};

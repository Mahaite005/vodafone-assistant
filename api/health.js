// GET /api/health — diagnostics (no secrets). Shows whether KV is connected and working.
module.exports = async (req, res) => {
  const hasUrl = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  const hasToken = !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
  let kvOk = false;
  let kvError = null;
  if (hasUrl && hasToken) {
    try {
      const { kv } = require('@vercel/kv');
      await kv.set('health:ping', 'ok', { ex: 60 });
      const v = await kv.get('health:ping');
      kvOk = v === 'ok';
    } catch (e) {
      kvError = String((e && e.message) || e).slice(0, 200);
    }
  }
  return res.status(200).json({
    kvConfigured: hasUrl && hasToken,
    kvOk,
    kvError,
    hasAdminSecret: !!process.env.ADMIN_SECRET,
    time: new Date().toISOString()
  });
};

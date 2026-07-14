export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    service: 'prime-local-growth',
    status: 'ok',
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    deployment: process.env.VERCEL_ENV || 'local',
    integrations: {
      leadDatabase: Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL),
      auditGenerator: Boolean(process.env.MASTER_APPS_SCRIPT_WEBHOOK_URL),
      newsletter: Boolean(process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID),
      transactionalEmail: Boolean(process.env.RESEND_API_KEY),
      payments: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
    },
    checkedAt: new Date().toISOString()
  });
}

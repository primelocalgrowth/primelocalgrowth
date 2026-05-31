export default function handler(req, res) {
  return res.status(410).json({
    error: 'This endpoint is disabled for this site.'
  });
}

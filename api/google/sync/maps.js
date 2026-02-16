export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  res.statusCode = 501;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      error: 'Google Maps personal data sync is not available',
      details:
        'Google does not provide an official API to read or write personal saved places, timeline, or starred locations between accounts.'
    })
  );
}


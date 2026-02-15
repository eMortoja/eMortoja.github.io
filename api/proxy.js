export default async function handler(req, res) {
  const target = req.query?.url;
  if (!target || !/^https?:\/\//i.test(target)) {
    res.status(400).json({ error: 'Provide a valid ?url=https://example.com' });
    return;
  }
  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        'user-agent':
          req.headers['user-agent'] ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'accept': '*/*',
      },
    });
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.status(upstream.status);
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'public, max-age=300');
    res.setHeader('x-frame-options', '');
    res.setHeader('content-security-policy', '');
    if (contentType.includes('text/html')) {
      let html = await upstream.text();
      const hasBase = /<base\s+/i.test(html);
      if (!hasBase) {
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${target}">`);
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      const ab = await upstream.arrayBuffer();
      res.setHeader('content-type', contentType);
      res.send(Buffer.from(ab));
    }
  } catch (e) {
    res.status(502).json({ error: 'Upstream fetch failed' });
  }
}

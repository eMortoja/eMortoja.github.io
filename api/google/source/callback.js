export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = 'https://emortoja.vercel.app/api/google/source/callback';
  if (!clientId || !clientSecret) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Missing Google OAuth env vars');
    return;
  }
  const url = new URL(req.url || '', 'https://emortoja.vercel.app');
  const error = url.searchParams.get('error');
  if (error) {
    res.statusCode = 400;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Google returned error: ' + error);
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    res.statusCode = 400;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Missing code parameter');
    return;
  }
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!tokenResp.ok) {
    res.statusCode = 502;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Token exchange failed');
    return;
  }
  const tokenJson = await tokenResp.json();
  const accessToken = tokenJson.access_token;
  let email = '';
  if (accessToken) {
    const userResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: 'Bearer ' + accessToken }
    });
    if (userResp.ok) {
      const userJson = await userResp.json();
      email = userJson.email || '';
    }
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(
    '<!doctype html><html><head><meta charset="utf-8"><title>Google source connected</title></head><body class="bg-gray-900" style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; padding: 2rem; background:#020617; color:#e5e7eb;"><h1 style="font-size:1.5rem; font-weight:600;">Source account connected</h1><p style="margin-top:0.5rem;">' +
      (email ? 'Signed in as ' + email : 'Sign-in completed.') +
      '</p><p style="margin-top:1rem;">You can close this window and return to the Tools page.</p></body></html>'
  );
}

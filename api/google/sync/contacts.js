export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Missing Google OAuth env vars' }));
    return;
  }
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};
  cookieHeader.split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i === -1) return;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (!key) return;
    cookies[key] = decodeURIComponent(val);
  });
  const srcRaw = cookies.g_src || '';
  const destRaw = cookies.g_dest || '';
  if (!srcRaw || !destRaw) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Both source and destination must be connected' }));
    return;
  }
  let srcData;
  let destData;
  try {
    srcData = JSON.parse(Buffer.from(srcRaw, 'base64url').toString('utf8'));
    destData = JSON.parse(Buffer.from(destRaw, 'base64url').toString('utf8'));
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Invalid stored credentials' }));
    return;
  }
  if (!srcData.refresh_token || !destData.refresh_token) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Missing refresh tokens' }));
    return;
  }
  async function getAccessToken(refreshToken) {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });
    if (!tokenResp.ok) {
      throw new Error('token');
    }
    const json = await tokenResp.json();
    return json.access_token;
  }
  let srcAccess;
  let destAccess;
  try {
    srcAccess = await getAccessToken(srcData.refresh_token);
    destAccess = await getAccessToken(destData.refresh_token);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Failed to refresh access tokens' }));
    return;
  }
  async function listConnections(accessToken) {
    const out = [];
    let pageToken = '';
    let guard = 0;
    while (guard < 5) {
      guard += 1;
      const url = new URL(
        'https://people.googleapis.com/v1/people/me/connections'
      );
      url.searchParams.set('personFields', 'names,emailAddresses');
      url.searchParams.set('pageSize', '500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const resp = await fetch(url.toString(), {
        headers: { authorization: 'Bearer ' + accessToken }
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error('people_connections ' + resp.status + ' ' + text);
      }
      const json = await resp.json();
      const people = json.connections || [];
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        const emails = (p.emailAddresses || []).map(function (e) {
          return (e.value || '').toLowerCase();
        });
        const names = (p.names || []).map(function (n) {
          return n.displayName || '';
        });
        if (!emails.length) continue;
        out.push({ emails: emails, names: names });
        if (out.length >= 1000) break;
      }
      if (out.length >= 1000) break;
      pageToken = json.nextPageToken || '';
      if (!pageToken) break;
    }
    return out;
  }
  async function listOtherContacts(accessToken) {
    const out = [];
    let pageToken = '';
    let guard = 0;
    while (guard < 5) {
      guard += 1;
      const url = new URL('https://people.googleapis.com/v1/otherContacts');
      url.searchParams.set('readMask', 'names,emailAddresses');
      url.searchParams.set('pageSize', '500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const resp = await fetch(url.toString(), {
        headers: { authorization: 'Bearer ' + accessToken }
      });
      if (!resp.ok) break;
      const json = await resp.json();
      const people = json.otherContacts || [];
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        const emails = (p.emailAddresses || []).map(function (e) {
          return (e.value || '').toLowerCase();
        });
        const names = (p.names || []).map(function (n) {
          return n.displayName || '';
        });
        if (!emails.length) continue;
        out.push({ emails: emails, names: names });
        if (out.length >= 2000) break;
      }
      if (out.length >= 2000) break;
      pageToken = json.nextPageToken || '';
      if (!pageToken) break;
    }
    return out;
  }
  async function listAllContacts(accessToken) {
    const base = await listConnections(accessToken);
    let extra = [];
    try {
      extra = await listOtherContacts(accessToken);
    } catch (e) {
      extra = [];
    }
    if (!extra.length) return base;
    const seen = new Set();
    const out = [];
    for (let i = 0; i < base.length; i++) {
      const c = base[i];
      const key = (c.emails && c.emails[0]) || '';
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    for (let j = 0; j < extra.length; j++) {
      const c2 = extra[j];
      const key2 = (c2.emails && c2.emails[0]) || '';
      if (!key2) continue;
      if (seen.has(key2)) continue;
      seen.add(key2);
      out.push(c2);
      if (out.length >= 2000) break;
    }
    return out;
  }
  let srcContacts;
  let destContacts;
  try {
    srcContacts = await listAllContacts(srcAccess);
    destContacts = await listAllContacts(destAccess);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'Failed to list contacts',
        detail: e && e.message ? e.message : String(e)
      })
    );
    return;
  }
  const destEmailSet = new Set();
  for (let i = 0; i < destContacts.length; i++) {
    const c = destContacts[i];
    (c.emails || []).forEach(function (em) {
      if (em) destEmailSet.add(em);
    });
  }
  let created = 0;
  let skipped = 0;
  for (let i = 0; i < srcContacts.length; i++) {
    const c = srcContacts[i];
    const firstEmail = (c.emails && c.emails[0]) || '';
    if (!firstEmail) {
      skipped += 1;
      continue;
    }
    if (destEmailSet.has(firstEmail)) {
      skipped += 1;
      continue;
    }
    const body = {
      names: (c.names || []).length ? [{ displayName: c.names[0] }] : [],
      emailAddresses: [{ value: firstEmail }]
    };
    const resp = await fetch(
      'https://people.googleapis.com/v1/people:createContact',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + destAccess,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );
    if (resp.ok) {
      created += 1;
      destEmailSet.add(firstEmail);
    } else {
      skipped += 1;
    }
    if (created >= 200) break;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      status: 'ok',
      created: created,
      skipped: skipped,
      sourceCount: srcContacts.length,
      destinationCount: destContacts.length
    })
  );
}

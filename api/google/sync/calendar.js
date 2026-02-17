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
  const now = Date.now();
  const timeMinIso = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
  const timeMaxIso = new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString();
  async function listCalendarIds(accessToken) {
    const url = new URL(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList'
    );
    const resp = await fetch(url.toString(), {
      headers: { authorization: 'Bearer ' + accessToken }
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error('calendar_list ' + resp.status + ' ' + text);
    }
    const json = await resp.json();
    const items = json.items || [];
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const cal = items[i];
      if (!cal || !cal.id) continue;
      const role = cal.accessRole || '';
      if (role === 'owner' || role === 'writer') {
        out.push(cal.id);
      }
    }
    if (!out.length) out.push('primary');
    return out;
  }
  async function listEventsForCalendar(accessToken, calendarId) {
    const events = [];
    let pageToken = '';
    let guard = 0;
    while (guard < 5) {
      guard += 1;
      const url = new URL(
        'https://www.googleapis.com/calendar/v3/calendars/' +
          encodeURIComponent(calendarId) +
          '/events'
      );
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('timeMin', timeMinIso);
      url.searchParams.set('timeMax', timeMaxIso);
      url.searchParams.set('maxResults', '500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const resp = await fetch(url.toString(), {
        headers: { authorization: 'Bearer ' + accessToken }
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(
          'calendar_events ' + calendarId + ' ' + resp.status + ' ' + text
        );
      }
      const json = await resp.json();
      const items = json.items || [];
      for (let i = 0; i < items.length; i++) {
        const ev = items[i];
        events.push(ev);
        if (events.length >= 2000) break;
      }
      if (events.length >= 2000) break;
      pageToken = json.nextPageToken || '';
      if (!pageToken) break;
    }
    return events;
  }
  async function listAllEvents(accessToken) {
    const calendars = await listCalendarIds(accessToken);
    const all = [];
    for (let i = 0; i < calendars.length; i++) {
      const id = calendars[i];
      const evs = await listEventsForCalendar(accessToken, id);
      for (let j = 0; j < evs.length; j++) {
        all.push(evs[j]);
        if (all.length >= 4000) break;
      }
      if (all.length >= 4000) break;
    }
    return all;
  }
  let srcEvents;
  let destEvents;
  try {
    srcEvents = await listAllEvents(srcAccess);
    destEvents = await listAllEvents(destAccess);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'Failed to list calendar events',
        detail: e && e.message ? e.message : String(e)
      })
    );
    return;
  }
  function eventKey(ev) {
    const start = (ev.start && (ev.start.dateTime || ev.start.date)) || '';
    const summary = ev.summary || '';
    return summary + '|' + start;
  }
  const destKeys = new Set();
  for (let i = 0; i < destEvents.length; i++) {
    destKeys.add(eventKey(destEvents[i]));
  }
  let created = 0;
  let skipped = 0;
  for (let i = 0; i < srcEvents.length; i++) {
    const ev = srcEvents[i];
    const key = eventKey(ev);
    if (!key) {
      skipped += 1;
      continue;
    }
    if (destKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const body = {
      summary: ev.summary,
      description: ev.description,
      start: ev.start,
      end: ev.end,
      location: ev.location
    };
    const resp = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
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
      destKeys.add(key);
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
      sourceCount: srcEvents.length,
      destinationCount: destEvents.length
    })
  );
}

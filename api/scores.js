export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.DATAGOLF_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    // Try Masters-specific endpoint first (DataGolf uses 'pga' tour for majors)
    // The Masters event_id on DataGolf is 14
    const response = await fetch(
      `https://feeds.datagolf.com/preds/live-tournament-stats?tour=pga&stat=total&round=event_avg&display=value&key=${API_KEY}`
    );

    if (!response.ok) throw new Error(`DataGolf error: ${response.status}`);
    const data = await response.json();

    // Check if we're getting Masters data
    if (data.event_name && data.event_name.toLowerCase().includes('master')) {
      // DataGolf is serving Masters — use it directly
      return res.status(200).json(data);
    }

    // DataGolf not yet serving Masters — fall back to ESPN
    // ESPN golf leaderboard for Masters 2026 (event ID 401703520)
    const espnRes = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!espnRes.ok) throw new Error(`ESPN error: ${espnRes.status}`);
    const espnData = await espnRes.json();

    // Parse ESPN golf leaderboard format
    // ESPN golf returns competitors with scoreToPar field (integer, e.g. -5, 0, +3)
    const live_stats = [];
    const competition = espnData?.events?.[0]?.competitions?.[0];
    const eventName = espnData?.events?.[0]?.name || 'Masters Tournament';

    if (competition) {
      for (const comp of (competition.competitors || [])) {
        const athlete = comp.athlete || {};
        const lastName = athlete.lastName || '';
        const firstName = athlete.firstName || '';
        const player_name = lastName && firstName ? `${lastName}, ${firstName}` : (athlete.displayName || '');

        // ESPN golf scoreToPar is the key field — integer relative to par
        let total = null;
        if (comp.scoreToPar !== undefined && comp.scoreToPar !== null) {
          total = parseInt(comp.scoreToPar);
          if (isNaN(total)) total = null;
        } else if (comp.score !== undefined) {
          // score field is total strokes — less useful but fallback
          const s = String(comp.score || '').trim();
          if (s === 'E') total = 0;
          else { total = parseInt(s); if (isNaN(total)) total = null; }
        }

        const status = comp.status?.type?.name || '';
        const thru = comp.status?.thru ?? null;
        let position = comp.status?.position?.displayName || comp.status?.type?.shortDetail || '';
        if (status === 'cut') position = 'CUT';
        if (status === 'wd' || status === 'withdrawn') position = 'WD';

        if (player_name) {
          live_stats.push({ player_name, total, position, thru, _source: 'espn' });
        }
      }
    }

    return res.status(200).json({
      event_name: eventName,
      course_name: 'Augusta National Golf Club',
      last_updated: new Date().toUTCString(),
      live_stats,
      _source: 'espn_fallback'
    });

  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch scores', detail: error.message });
  }
}

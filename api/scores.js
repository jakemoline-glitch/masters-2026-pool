export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.DATAGOLF_API_KEY;

  try {
    // Try DataGolf first — if it switches to Masters, use it
    if (API_KEY) {
      const dgRes = await fetch(
        `https://feeds.datagolf.com/preds/live-tournament-stats?tour=pga&stat=total&round=event_avg&display=value&key=${API_KEY}`
      );
      if (dgRes.ok) {
        const dgData = await dgRes.json();
        if (dgData.event_name && dgData.event_name.toLowerCase().includes('master')) {
          return res.status(200).json(dgData);
        }
      }
    }

    // Fall back to ESPN
    const espnRes = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!espnRes.ok) throw new Error(`ESPN error: ${espnRes.status}`);
    const espnData = await espnRes.json();

    const live_stats = [];
    const competition = espnData?.events?.[0]?.competitions?.[0];
    const eventName = espnData?.events?.[0]?.name || 'Masters Tournament';

    if (competition) {
      for (const comp of (competition.competitors || [])) {
        const athlete = comp.athlete || {};
        const displayName = athlete.displayName || '';
        const player_name = displayName;

        // ESPN returns scoreToPar as a string like "-3", "E", "+2", or null
        let total = null;
        const stp = comp.scoreToPar;
        if (stp !== null && stp !== undefined) {
          const s = String(stp).trim();
          if (s === 'E' || s === '0') total = 0;
          else {
            const parsed = parseInt(s);
            if (!isNaN(parsed)) total = parsed;
          }
        }

        // Also check linescores for cumulative score if scoreToPar not available
        if (total === null && comp.linescores && comp.linescores.length > 0) {
          let cumulative = 0;
          for (const ls of comp.linescores) {
            const val = ls.value !== undefined ? String(ls.value).trim() : '';
            if (val === 'E' || val === '0') { /* 0 */ }
            else if (val !== '' && val !== '--') {
              const n = parseInt(val);
              if (!isNaN(n)) cumulative += n;
            }
          }
          // Only use if we have actual scores
          if (comp.linescores.some(ls => ls.value !== undefined && ls.value !== '--')) {
            total = cumulative;
          }
        }

        const status = comp.status?.type?.name || '';
        const thru = comp.status?.thru ?? null;
        let position = comp.status?.position?.displayName || '';
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.DATAGOLF_API_KEY;

  // Augusta National hole pars (holes 1-18)
  const augustaPars = [4,5,4,3,4,3,4,5,4,4,4,3,5,4,5,3,4,4];

  try {
    // Try DataGolf first
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

    // ESPN fallback
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
        const player_name = athlete.displayName || '';

        // First try scoreToPar — ESPN's explicit relative-to-par field
        let total = null;
        const stp = comp.scoreToPar;
        if (stp !== null && stp !== undefined && stp !== '') {
          const s = String(stp).trim();
          if (s === 'E') total = 0;
          else {
            const parsed = parseInt(s);
            if (!isNaN(parsed)) total = parsed;
          }
        }

        // If scoreToPar not available, calculate from linescores using Augusta pars
        if (total === null && comp.linescores && comp.linescores.length > 0) {
          let scoreRelativeToPar = 0;
          let hasValidScores = false;

          comp.linescores.forEach((ls, idx) => {
            const holeStrokes = ls.value !== undefined ? String(ls.value).trim() : '';
            if (holeStrokes !== '' && holeStrokes !== '--' && !isNaN(parseInt(holeStrokes))) {
              const strokes = parseInt(holeStrokes);
              const holePar = augustaPars[idx] || 4; // fallback to par 4
              scoreRelativeToPar += (strokes - holePar);
              hasValidScores = true;
            }
          });

          if (hasValidScores) total = scoreRelativeToPar;
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.DATAGOLF_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'DataGolf API key not configured' });

  try {
    const response = await fetch(
      `https://feeds.datagolf.com/preds/live-tournament-stats?tour=pga&stat=total&round=event_avg&display=value&key=${API_KEY}`
    );
    if (!response.ok) throw new Error(`DataGolf API error: ${response.status}`);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch live scores', detail: error.message });
  }
}

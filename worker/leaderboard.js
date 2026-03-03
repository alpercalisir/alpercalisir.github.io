/**
 * Leaderboard Worker - Cloudflare KV backed
 * 
 * Endpoints:
 *   GET  /scores/:game     - Get top 50 scores for a game
 *   POST /scores/:game     - Submit a score { name, score }
 *   GET  /health           - Health check
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_GAMES = ['space-invaders', 'snake', 'tetris'];
const MAX_SCORES = 50;
const MAX_NAME_LENGTH = 20;
const MAX_SCORE = 999999;

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === '/health') {
        return json({ ok: true });
      }

      // Route: /scores/:game
      const match = path.match(/^\/scores\/([a-z-]+)$/);
      if (!match) {
        return json({ error: 'Not found' }, 404);
      }

      const game = match[1];
      if (!VALID_GAMES.includes(game)) {
        return json({ error: 'Invalid game' }, 400);
      }

      const key = `leaderboard:${game}`;

      // GET - Retrieve scores
      if (request.method === 'GET') {
        const data = await env.LEADERBOARD.get(key, 'json');
        return json({ scores: data || [] });
      }

      // POST - Submit score
      if (request.method === 'POST') {
        const body = await request.json();
        const { name, score } = body;

        // Validation
        if (!name || typeof name !== 'string') {
          return json({ error: 'Name required' }, 400);
        }
        if (typeof score !== 'number' || score < 0 || score > MAX_SCORE) {
          return json({ error: 'Invalid score' }, 400);
        }

        const cleanName = name.trim().slice(0, MAX_NAME_LENGTH);
        if (cleanName.length === 0) {
          return json({ error: 'Name required' }, 400);
        }

        // Get existing scores
        const existing = await env.LEADERBOARD.get(key, 'json') || [];

        // Add new score
        const newEntry = {
          name: cleanName,
          score,
          date: new Date().toISOString(),
        };
        existing.push(newEntry);

        // Sort and trim
        existing.sort((a, b) => b.score - a.score);
        const updated = existing.slice(0, MAX_SCORES);

        // Save
        await env.LEADERBOARD.put(key, JSON.stringify(updated));

        // Find rank of submitted score
        const rank = updated.findIndex(e => e.date === newEntry.date) + 1;

        return json({ ok: true, rank, scores: updated.slice(0, 10) });
      }

      return json({ error: 'Method not allowed' }, 405);
    } catch (err) {
      console.error(err);
      return json({ error: 'Internal error' }, 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

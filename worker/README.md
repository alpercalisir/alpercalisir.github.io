# Leaderboard Worker

Cloudflare Worker + KV for persistent game scores.

## Setup

1. Create KV namespace:
```bash
wrangler kv:namespace create LEADERBOARD
```

2. Copy the ID from output and update `wrangler.toml`

3. Deploy:
```bash
cd worker
wrangler deploy
```

## Endpoints

- `GET /scores/:game` - Get top 50 scores
- `POST /scores/:game` - Submit score `{ name, score }`
- `GET /health` - Health check

Games: `space-invaders`, `snake`, `tetris`

## Example

```bash
# Get scores
curl https://bentossell-leaderboard.bentossell.workers.dev/scores/snake

# Submit score
curl -X POST https://bentossell-leaderboard.bentossell.workers.dev/scores/snake \
  -H "Content-Type: application/json" \
  -d '{"name":"Ben","score":420}'
```

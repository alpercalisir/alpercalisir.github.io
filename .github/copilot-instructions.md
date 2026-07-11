# Copilot Instructions for alpercalisir.github.io

## Project Overview

**Personal portfolio website** with an interactive terminal interface and game leaderboard system.

- **Frontend**: GitHub Pages static site (HTML/CSS/JS)
- **Backend**: Cloudflare Worker + KV for persistent game scores
- **Games**: Tetris, Snake, Space Invaders (with online leaderboards)

## Architecture

### Frontend Layer (`/`)
- `index.html` - Terminal UI wrapper with theme system
- `assets/js/terminal.js` - Main CLI engine (1477 lines), handles command parsing & execution
- `assets/css/styles.css` - Design system with 5 themes (midnight/phosphor/amber/matrix/contrast)
- `standings.js` - External API integration (fetches Fenerbahçe standings from football-standings-api)
- `blog/posts.json` - Blog metadata index (slug, title, date, excerpt)
- `blog/posts/*.md` - Individual blog posts in markdown format

### Backend Layer (`/worker`)
- **Cloudflare Worker** (`leaderboard.js`) - REST API for game scores
  - Uses KV namespace `LEADERBOARD` for persistent storage
  - Endpoints: `GET/POST /scores/:game`, `GET /health`
  - Validates games: `space-invaders`, `snake`, `tetris`
  - Max 50 scores per game, max score: 999,999, max name: 20 chars

## Command Architecture (terminal.js)

**Command registry pattern**: `commands = { cmdName: { desc, fn } }`

Key commands:
- **Info**: `whoami`, `now`, `prev` (career timeline)
- **Content**: `search [term]`, `blog [slug]` (markdown posts), `tetris` (game launcher)
- **Contact**: `contact`, `newsletter`
- **Terminal**: `theme`, `clear`, `music`

**Status bar**: Rotates funny vibes every 8s + on each command (26 options defined in `vibes` array)

## Developer Workflows

### Local Development
No build step - serve `index.html` directly. For development:
```bash
python -m http.server 8000  # or any local server
```

### Worker Deployment
```bash
cd worker
wrangler kv:namespace create LEADERBOARD  # One-time setup
# Update wrangler.toml with the returned ID
wrangler deploy
```

### Testing Leaderboard API
```bash
# Get scores
curl https://bentossell-leaderboard.bentossell.workers.dev/scores/snake

# Submit
curl -X POST https://bentossell-leaderboard.bentossell.workers.dev/scores/snake \
  -H "Content-Type: application/json" \
  -d '{"name":"YourName","score":420}'
```

## Key Patterns & Conventions

### Terminal Command System
- Commands return HTML strings (supports inline `<span>` styling)
- CSS classes: `.cmd` (command highlighting), `.muted` (secondary text), `.bold.white` (headers)
- Aliases map to same function: `about` → `whoami`, `social` → `contact`

### Theme System
- CSS custom properties: `--bg-primary`, `--text-primary`, `--accent`, etc.
- Themes apply via `class="theme-{name}"` on body
- Stored in localStorage: `terminal-theme`
- Shortcut: Shift+Tab cycles themes

### External API Patterns
- **standings.js**: Fetch from third-party, parse nested data structure, handle missing teams
- **Leaderboard Worker**: CORS-enabled, JSON validation, numeric constraints

### Blog System
- Markdown posts stored as `.md` files in `blog/posts/` directory
- Post metadata in `blog/posts.json` (slug, title, date, excerpt)
- Uses `marked.js` library (CDN) for markdown-to-HTML parsing
- Blog command: `blog` lists posts, `blog [slug]` displays specific post
- HTML output converted to terminal-friendly format with CSS classes (bold, muted, cmd)
- Supports markdown: h1-h3 headings, bold, emphasis, code blocks, lists

### Game Integration
- Games added as terminal commands that execute embedded game logic
- Leaderboard submission via `fetch()` POST to worker endpoint
- Score rank calculated server-side

## File Structure at a Glance

```
.
├── .github/copilot-instructions.md   (this file)
├── index.html                         (terminal UI shell)
├── standings.js                       (external API call)
├── assets/
│   ├── css/styles.css                (709 lines, all themes)
│   └── js/terminal.js                (1477 lines, command engine)
├── blog/
│   ├── posts.json                    (blog metadata index)
│   └── posts/                        (individual .md files)
└── worker/
    ├── leaderboard.js                (REST API, KV storage)
    ├── wrangler.toml                 (CF Worker config)
    └── README.md                     (deployment guide)
```

## Critical Context

### Things That Aren't Obvious
- Terminal status bar ("building things" etc) is **intentionally random** - don't "fix" it
- `standings.js` is a **separate script** loaded in HTML, not module-imported
- Worker namespace ID in `wrangler.toml` is environment-specific; must match `wrangler kv:namespace create` output
- Game commands likely inject iframes or canvas - check terminal.js for implementation details
- Newsletter command probably has custom form handling; search for form element IDs

### Performance Notes
- CSS is single file (709 lines) - keep organized by section comments (`/* === SECTION === */`)
- JS files are large but unsplit - games and terminal share single namespace (state object)
- No build tools - direct browser execution

### Testing Assumptions
- **No test files**: Verify changes in browser directly
- **No CI/CD**: Manual `wrangler deploy` for worker updates
- **localStorage**: Used for theme preference; test incognito mode for fresh state

## When Adding Features

- **New commands**: Add to `commands` object in terminal.js, return HTML string
- **New blog posts**: Create `.md` file in `blog/posts/` and add entry to `blog/posts.json`
- **New games**: Add command entry + game logic, add game name to `VALID_GAMES` in leaderboard.js
- **New themes**: Add CSS vars to `:root`, add name to `themes` array in terminal.js
- **API changes**: Update both leaderboard.js and any fetch calls in terminal.js

# Codex MCP Server

[![npm version](https://img.shields.io/npm/v/codex-mcp-server.svg)](https://www.npmjs.com/package/codex-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/codex-mcp-server.svg)](https://www.npmjs.com/package/codex-mcp-server)
[![license](https://img.shields.io/npm/l/codex-mcp-server.svg)](https://www.npmjs.com/package/codex-mcp-server)

Bridge between Claude and OpenAI's Codex CLI — get AI-powered code analysis, generation, and review right in your editor.

**MCP Endpoint:** `https://mcp.techmavie.digital/codex/mcp`

**Analytics Dashboard:** [`https://mcp.techmavie.digital/codex/analytics/dashboard`](https://mcp.techmavie.digital/codex/analytics/dashboard)

## Architecture

```
Client (Claude, Cursor, Windsurf, etc.)
    ↓ HTTPS
https://mcp.techmavie.digital/codex/mcp
    ↓
Nginx (SSL termination + reverse proxy)
    ↓ HTTP
Docker Container (port 8087 → 8080)
    ↓
Codex MCP Server (Streamable HTTP Transport)
    ↓
OpenAI Codex CLI → OpenAI API
```

## Features

- **Dual Transport**: Supports both stdio (local) and Streamable HTTP (VPS) transport
- **AI Coding Assistant**: Code analysis, generation, and review via Codex CLI
- **Session Support**: Multi-turn conversations with session management
- **Code Review**: AI-powered review for uncommitted changes, branches, or commits
- **Analytics Dashboard**: Built-in visual analytics at `/analytics/dashboard`
- **VPS Deployment Ready**: Docker, Nginx, and GitHub Actions auto-deployment
- **Model Selection**: Choose from multiple OpenAI models

## Quick Start

### Method 1: Hosted Server (Recommended)

Connect to the hosted MCP endpoint — no installation required.

```json
{
  "mcpServers": {
    "codex-cli": {
      "transport": "streamable-http",
      "url": "https://mcp.techmavie.digital/codex/mcp"
    }
  }
}
```

### Method 2: NPM Package (Local stdio)

```bash
npm i -g @openai/codex
codex login --api-key "your-openai-api-key"
```

Add to your MCP client config:

```json
{
  "mcpServers": {
    "codex-cli": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "codex-mcp-server"],
      "env": {}
    }
  }
}
```

### Method 3: Self-Hosted VPS

See [Deployment](#deployment) section below.

## One-Click Install

[![VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=codex-cli&config=%7B%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22codex-mcp-server%22%5D%7D)
[![VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=codex-cli&config=%7B%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22codex-mcp-server%22%5D%7D)
[![Cursor](https://img.shields.io/badge/Cursor-Install-00D8FF?style=flat-square&logo=cursor&logoColor=white)](https://cursor.com/en/install-mcp?name=codex&config=eyJ0eXBlIjoic3RkaW8iLCJjb21tYW5kIjoibnB4IC15IGNvZGV4LW1jcC1zZXJ2ZXIiLCJlbnYiOnt9fQ%3D%3D)

## Tools

| Tool | Description |
|------|-------------|
| `codex` | AI coding assistant with session support, model selection, and structured output metadata |
| `review` | AI-powered code review for uncommitted changes, branches, or commits |
| `listSessions` | View active conversation sessions |
| `ping` | Test server connection |
| `help` | Get Codex CLI help |
| `hello` | Test tool to verify MCP server connectivity (HTTP transport only) |

## Examples

**Code analysis:**
```
Use codex to analyze this authentication logic for security issues
```

**Multi-turn conversations:**
```
Use codex with sessionId "refactor" to analyze this module
Use codex with sessionId "refactor" to implement your suggestions
```
Passing a sessionId creates the session on first use, so listSessions will show
it (for this server instance) and subsequent calls can resume context.

**Code review:**
```
Use review with base "main" to check my PR changes
Use review with uncommitted true to review my local changes
```

**Advanced options:**
```
Use codex with model "o3" and reasoningEffort "high" for complex analysis
Use codex with fullAuto true and sandbox "workspace-write" for automated tasks
Use codex with callbackUri "http://localhost:1234/callback" for static callbacks
Use codex to return structuredContent with threadId metadata when available
```

## Requirements

- **Codex CLI v0.75.0+** — Install with `npm i -g @openai/codex` or `brew install codex`
- **OpenAI API key** — Run `codex login --api-key "your-key"` to authenticate
- **Node.js 18+** — Required for both local and VPS deployment

## Codex 0.87 Compatibility
- **Thread ID + structured output**: When Codex CLI emits `threadId`, this server returns it in content metadata and `structuredContent`, and advertises an `outputSchema` for structured responses.

## Documentation

- **[API Reference](docs/api-reference.md)** — Full tool parameters and response formats
- **[Session Management](docs/session-management.md)** — How conversations work
- **[Codex CLI Integration](docs/codex-cli-integration.md)** — Version compatibility and CLI details

## Analytics Dashboard

The server includes a built-in analytics dashboard that tracks:

- **Total requests and tool calls**
- **Tool usage distribution** (doughnut chart)
- **Hourly request trends** (last 24 hours)
- **Requests by endpoint** (bar chart)
- **Top clients by user agent**
- **Recent tool calls feed**

### Analytics Endpoints

| Endpoint | Description |
|----------|-------------|
| `/analytics` | Full analytics summary (JSON) |
| `/analytics/tools` | Detailed tool usage stats (JSON) |
| `/analytics/dashboard` | Visual dashboard with charts (HTML) |
| `/analytics/import` | Import backup data (POST) |

The dashboard auto-refreshes every 30 seconds.

## Deployment

### VPS Self-Hosting

This repository includes full support for self-hosted VPS deployment with Docker, Nginx, and GitHub Actions auto-deployment.

#### Deployment Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Container configuration with Node.js 20-alpine |
| `docker-compose.yml` | Docker orchestration with analytics volume |
| `deploy/nginx-mcp.conf` | Nginx reverse proxy configuration |
| `.github/workflows/deploy-vps.yml` | GitHub Actions auto-deployment |

#### Quick Deploy

```bash
# On your VPS
mkdir -p /opt/mcp-servers/codex
cd /opt/mcp-servers/codex

# Clone repository
git clone https://github.com/hithereiamaliff/mcp-codex.git .

# Build and start
docker compose up -d --build

# Check logs
docker compose logs -f
```

#### GitHub Actions Auto-Deployment

Add these secrets to your GitHub repository:
- `VPS_HOST` — Your VPS IP address
- `VPS_USERNAME` — SSH username (e.g., `root`)
- `VPS_SSH_KEY` — Private SSH key
- `VPS_PORT` — SSH port (usually `22`)

Pushing to `main` triggers automatic deployment.

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Server info |
| `/health` | Health check |
| `/mcp` | MCP endpoint (Streamable HTTP) |
| `/analytics` | Analytics JSON data |
| `/analytics/dashboard` | Visual analytics dashboard |

## Project Structure

```
mcp-codex/
├── src/
│   ├── index.ts              # Main stdio entry point
│   ├── http-server.ts        # Streamable HTTP server with analytics
│   ├── server.ts             # MCP server class (stdio transport)
│   ├── types.ts              # Type definitions and schemas
│   ├── errors.ts             # Error handling
│   ├── tools/
│   │   ├── definitions.ts    # Tool definitions
│   │   └── handlers.ts       # Tool handler implementations
│   ├── session/
│   │   └── storage.ts        # Session management
│   └── utils/
│       └── command.ts        # Command execution utilities
├── deploy/
│   └── nginx-mcp.conf        # Nginx reverse proxy config
├── .github/
│   └── workflows/
│       ├── ci.yml             # CI pipeline
│       ├── release.yml        # Release workflow
│       └── deploy-vps.yml     # VPS auto-deployment
├── docker-compose.yml         # Docker deployment config
├── Dockerfile                 # Container build config
├── package.json               # Project dependencies
├── tsconfig.json              # TypeScript configuration
├── .env.sample                # Environment variables template
└── README.md                  # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `8080` |
| `HOST` | HTTP server host | `0.0.0.0` |
| `CODEX_DEFAULT_MODEL` | Default Codex model | `gpt-5.3-codex` |
| `CODEX_MCP_CALLBACK_URI` | Static MCP callback URI | — |
| `ANALYTICS_DATA_DIR` | Analytics data directory | `./data` |
| `STRUCTURED_CONTENT_ENABLED` | Enable structured content output | `false` |

## Development

```bash
npm install        # Install dependencies
npm run dev        # Development mode (stdio)
npm run dev:http   # Development mode (HTTP)
npm run build      # Build for production
npm run start:http # Start HTTP server
npm test           # Run tests
```

### Test MCP Connection

```bash
# Health check
curl https://mcp.techmavie.digital/codex/health

# List tools
curl -X POST https://mcp.techmavie.digital/codex/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test with MCP Inspector
npx @modelcontextprotocol/inspector
# Select "Streamable HTTP" and enter: https://mcp.techmavie.digital/codex/mcp
```

## Troubleshooting

### Container Issues

```bash
# Check container status
docker compose ps

# View logs
docker compose logs -f

# Restart container
docker compose restart

# Rebuild and restart
docker compose up -d --build
```

### 502 Bad Gateway
- Container not running: `docker compose up -d --build`
- Check container logs: `docker compose logs -f`
- Verify port mapping: `docker ps`

### Health Check Failing
- Container might still be starting (wait 10-40 seconds)
- Check if health endpoint returns valid JSON
- Verify port 8080 is exposed in Dockerfile

## Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Create pull request

## License

ISC

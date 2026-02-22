/**
 * Codex MCP Server - Streamable HTTP Transport with Analytics
 * 
 * This file provides an HTTP server for self-hosting the MCP server on a VPS.
 * It uses the Streamable HTTP transport for MCP communication.
 * 
 * Usage:
 *   npm run build
 *   node dist/http-server.js
 * 
 * Or with environment variables:
 *   PORT=8080 node dist/http-server.js
 */

import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// Import tool definitions and handlers from existing codebase
import { toolDefinitions } from './tools/definitions.js';
import { toolHandlers } from './tools/handlers.js';
import { TOOLS, type ToolName } from './types.js';

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ANALYTICS_DATA_DIR = process.env.ANALYTICS_DATA_DIR || './data';
const ANALYTICS_FILE = path.join(ANALYTICS_DATA_DIR, 'analytics.json');
const SAVE_INTERVAL_MS = 60000; // Save every 60 seconds
const MAX_RECENT_CALLS = 100;

// ============================================================================
// Analytics Tracking
// ============================================================================
interface ToolCallRecord {
  tool: string;
  timestamp: string;
  clientIp: string;
  userAgent: string;
}

interface Analytics {
  serverStartTime: string;
  totalRequests: number;
  totalToolCalls: number;
  requestsByMethod: Record<string, number>;
  requestsByEndpoint: Record<string, number>;
  toolCalls: Record<string, number>;
  recentToolCalls: ToolCallRecord[];
  clientsByIp: Record<string, number>;
  clientsByUserAgent: Record<string, number>;
  hourlyRequests: Record<string, number>;
}

// Initialize with defaults
let analytics: Analytics = {
  serverStartTime: new Date().toISOString(),
  totalRequests: 0,
  totalToolCalls: 0,
  requestsByMethod: {},
  requestsByEndpoint: {},
  toolCalls: {},
  recentToolCalls: [],
  clientsByIp: {},
  clientsByUserAgent: {},
  hourlyRequests: {},
};

// ============================================================================
// Analytics Persistence (Local File)
// ============================================================================
function ensureDataDir(): void {
  if (!fs.existsSync(ANALYTICS_DATA_DIR)) {
    fs.mkdirSync(ANALYTICS_DATA_DIR, { recursive: true });
    console.log(`📁 Created analytics data directory: ${ANALYTICS_DATA_DIR}`);
  }
}

function loadAnalytics(): void {
  try {
    ensureDataDir();
    if (fs.existsSync(ANALYTICS_FILE)) {
      const data = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
      const loaded = JSON.parse(data) as Analytics;
      analytics = {
        ...loaded,
        requestsByMethod: loaded.requestsByMethod || {},
        requestsByEndpoint: loaded.requestsByEndpoint || {},
        toolCalls: loaded.toolCalls || {},
        recentToolCalls: loaded.recentToolCalls || [],
        clientsByIp: loaded.clientsByIp || {},
        clientsByUserAgent: loaded.clientsByUserAgent || {},
        hourlyRequests: loaded.hourlyRequests || {},
        serverStartTime: loaded.serverStartTime || new Date().toISOString(),
      };
      console.log(`📊 Loaded analytics from ${ANALYTICS_FILE}`);
      console.log(`   Total requests: ${analytics.totalRequests.toLocaleString()}, Tool calls: ${analytics.totalToolCalls}`);
    } else {
      console.log(`📊 No existing analytics file, starting fresh`);
    }
  } catch (error) {
    console.error(`⚠️ Failed to load analytics:`, error);
    console.log(`📊 Starting with fresh analytics`);
  }
}

function saveAnalytics(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
    console.log(`💾 Saved analytics to ${ANALYTICS_FILE}`);
  } catch (error) {
    console.error(`⚠️ Failed to save analytics:`, error);
  }
}

// Load analytics on startup
loadAnalytics();

// Periodic save
const saveInterval = setInterval(() => {
  saveAnalytics();
}, SAVE_INTERVAL_MS);

function trackRequest(req: Request, endpoint: string): void {
  analytics.totalRequests++;

  // Track by method
  const method = req.method;
  analytics.requestsByMethod[method] = (analytics.requestsByMethod[method] || 0) + 1;

  // Track by endpoint
  analytics.requestsByEndpoint[endpoint] = (analytics.requestsByEndpoint[endpoint] || 0) + 1;

  // Track by client IP
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  analytics.clientsByIp[clientIp] = (analytics.clientsByIp[clientIp] || 0) + 1;

  // Track by user agent
  const userAgent = req.headers['user-agent'] || 'unknown';
  const shortAgent = userAgent.substring(0, 50);
  analytics.clientsByUserAgent[shortAgent] = (analytics.clientsByUserAgent[shortAgent] || 0) + 1;

  // Track hourly
  const hour = new Date().toISOString().substring(0, 13); // YYYY-MM-DDTHH
  analytics.hourlyRequests[hour] = (analytics.hourlyRequests[hour] || 0) + 1;
}

function trackToolCall(toolName: string, req: Request): void {
  analytics.totalToolCalls++;
  analytics.toolCalls[toolName] = (analytics.toolCalls[toolName] || 0) + 1;

  const toolCall: ToolCallRecord = {
    tool: toolName,
    timestamp: new Date().toISOString(),
    clientIp: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown',
    userAgent: (req.headers['user-agent'] || 'unknown').substring(0, 50),
  };

  analytics.recentToolCalls.unshift(toolCall);
  if (analytics.recentToolCalls.length > MAX_RECENT_CALLS) {
    analytics.recentToolCalls.pop();
  }
}

function getUptime(): string {
  const start = new Date(analytics.serverStartTime).getTime();
  const now = Date.now();
  const diff = now - start;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ============================================================================
// MCP Server Setup
// ============================================================================

function isValidToolName(name: string): name is ToolName {
  return Object.values(TOOLS).includes(name as ToolName);
}

// Create MCP server using McpServer (high-level API) for Streamable HTTP
const mcpServer = new McpServer({
  name: 'Codex MCP Server',
  version: '1.4.0',
});

// Register all tools from existing definitions onto the McpServer
for (const def of toolDefinitions) {
  // Build a Zod schema from the tool's inputSchema properties
  const schemaShape: Record<string, z.ZodTypeAny> = {};
  const props = def.inputSchema.properties;
  const required = def.inputSchema.required || [];

  for (const [key, propDef] of Object.entries(props)) {
    const prop = propDef as { type?: string; enum?: string[]; description?: string };
    let zodType: z.ZodTypeAny;

    if (prop.enum) {
      zodType = z.enum(prop.enum as [string, ...string[]]);
    } else if (prop.type === 'boolean') {
      zodType = z.boolean();
    } else {
      zodType = z.string();
    }

    if (prop.description) {
      zodType = zodType.describe(prop.description);
    }

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    schemaShape[key] = zodType;
  }

  const toolName = def.name;

  mcpServer.tool(
    toolName,
    def.description,
    schemaShape,
    async (args: Record<string, unknown>) => {
      if (!isValidToolName(toolName)) {
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
      }
      try {
        const handler = toolHandlers[toolName];
        const result = await handler.execute(args);
        return {
          content: result.content.map((c) => ({
            type: 'text' as const,
            text: c.text,
          })),
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// Register hello tool for testing
mcpServer.tool(
  'hello',
  'A simple test tool to verify that the MCP server is working correctly',
  {},
  async () => {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Hello from Codex MCP Server!',
            timestamp: new Date().toISOString(),
            transport: 'streamable-http',
          }, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// Express App
// ============================================================================
const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'Mcp-Session-Id'],
  exposedHeaders: ['Mcp-Session-Id'],
}));

app.use(express.json());

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  trackRequest(req, '/');
  res.json({
    name: 'Codex MCP Server',
    version: '1.4.0',
    description: 'MCP server wrapper for OpenAI Codex CLI',
    transport: 'streamable-http',
    endpoints: {
      mcp: '/mcp',
      health: '/health',
      analytics: '/analytics',
      analyticsDashboard: '/analytics/dashboard',
    },
    documentation: 'https://github.com/hithereiamaliff/mcp-codex',
  });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  trackRequest(req, '/health');
  res.json({
    status: 'healthy',
    server: 'Codex MCP Server',
    version: '1.4.0',
    transport: 'streamable-http',
    timestamp: new Date().toISOString(),
  });
});

// Analytics endpoint - JSON summary
app.get('/analytics', (req: Request, res: Response) => {
  trackRequest(req, '/analytics');

  // Sort tool calls by count
  const sortedTools = Object.entries(analytics.toolCalls)
    .sort(([, a], [, b]) => b - a)
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, number>);

  // Sort clients by count
  const sortedClients = Object.entries(analytics.clientsByIp)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, number>);

  // Get last 24 hours of hourly data
  const last24Hours = Object.entries(analytics.hourlyRequests)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 24)
    .reverse()
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, number>);

  res.json({
    server: 'Codex MCP Server',
    uptime: getUptime(),
    serverStartTime: analytics.serverStartTime,
    summary: {
      totalRequests: analytics.totalRequests,
      totalToolCalls: analytics.totalToolCalls,
      uniqueClients: Object.keys(analytics.clientsByIp).length,
    },
    breakdown: {
      byMethod: analytics.requestsByMethod,
      byEndpoint: analytics.requestsByEndpoint,
      byTool: sortedTools,
    },
    clients: {
      byIp: sortedClients,
      byUserAgent: analytics.clientsByUserAgent,
    },
    hourlyRequests: last24Hours,
    recentToolCalls: analytics.recentToolCalls.slice(0, 20),
  });
});

// Analytics endpoint - tool usage detail
app.get('/analytics/tools', (req: Request, res: Response) => {
  trackRequest(req, '/analytics/tools');

  const sortedTools = Object.entries(analytics.toolCalls)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));

  res.json({
    totalToolCalls: analytics.totalToolCalls,
    tools: sortedTools,
    recentCalls: analytics.recentToolCalls.slice(0, 50),
  });
});

// Analytics dashboard - HTML with Chart.js
app.get('/analytics/dashboard', (req: Request, res: Response) => {
  trackRequest(req, '/analytics/dashboard');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codex MCP - Analytics Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e4e4e7; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { font-size: 24px; color: #f4f4f5; margin-bottom: 4px; }
    .header p { color: #71717a; font-size: 14px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 30px; }
    .stat-card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: 700; color: #f4f4f5; }
    .stat-label { color: #71717a; font-size: 13px; margin-top: 4px; }
    .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .chart-card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; }
    .chart-card h3 { color: #a1a1aa; font-size: 14px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .chart-container { position: relative; height: 250px; }
    .recent-calls { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; }
    .recent-calls h3 { color: #a1a1aa; font-size: 14px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .call-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #27272a; }
    .call-item:last-child { border-bottom: none; }
    .call-tool { color: #3b82f6; font-weight: 600; font-size: 13px; }
    .call-time { color: #71717a; font-size: 12px; }
    .call-client { color: #52525b; font-size: 11px; }
    .refresh-btn { position: fixed; bottom: 20px; right: 20px; background: #3b82f6; color: white; border: none; border-radius: 50%; width: 48px; height: 48px; font-size: 20px; cursor: pointer; box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
    .refresh-btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Codex MCP Server</h1>
    <p id="uptime">Loading...</p>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value" id="totalRequests">-</div>
      <div class="stat-label">Total Requests</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="totalToolCalls">-</div>
      <div class="stat-label">Tool Calls</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="uniqueClients">-</div>
      <div class="stat-label">Unique Clients</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="topTool">-</div>
      <div class="stat-label">Top Tool</div>
    </div>
  </div>

  <div class="charts-grid">
    <div class="chart-card">
      <h3>Tool Usage</h3>
      <div class="chart-container"><canvas id="toolsChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Hourly Requests (Last 24h)</h3>
      <div class="chart-container"><canvas id="hourlyChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Requests by Endpoint</h3>
      <div class="chart-container"><canvas id="endpointChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h3>Top Clients</h3>
      <div class="chart-container"><canvas id="clientsChart"></canvas></div>
    </div>
  </div>

  <div class="recent-calls">
    <h3>Recent Tool Calls</h3>
    <div id="recentCalls">
      <p style="color: #71717a;">Loading...</p>
    </div>
  </div>

  <button class="refresh-btn" onclick="loadData()">&#x1f504;</button>

  <script>
    let toolsChart, hourlyChart, endpointChart, clientsChart;

    const chartColors = [
      '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
      '#06b6d4', '#f43f5e', '#84cc16', '#6366f1', '#14b8a6'
    ];

    async function loadData() {
      try {
        const basePath = window.location.pathname.replace(/\\/analytics\\/dashboard\\/?$/, '');
        const res = await fetch(basePath + '/analytics');
        const data = await res.json();
        updateDashboard(data);
      } catch (err) {
        console.error('Failed to load analytics:', err);
      }
    }

    function updateDashboard(data) {
      document.getElementById('totalRequests').textContent = data.summary.totalRequests.toLocaleString();
      document.getElementById('totalToolCalls').textContent = data.summary.totalToolCalls.toLocaleString();
      document.getElementById('uniqueClients').textContent = data.summary.uniqueClients.toLocaleString();
      document.getElementById('uptime').textContent = 'Uptime: ' + data.uptime;

      const tools = Object.entries(data.breakdown.byTool);
      if (tools.length > 0) {
        const topTool = tools.sort((a, b) => b[1] - a[1])[0][0];
        document.getElementById('topTool').textContent = topTool.substring(0, 12);
      }

      updateToolsChart(data.breakdown.byTool);
      updateHourlyChart(data.hourlyRequests);
      updateEndpointChart(data.breakdown.byEndpoint);
      updateClientsChart(data.clients.byUserAgent);
      updateRecentCalls(data.recentToolCalls);
    }

    function updateToolsChart(toolData) {
      const labels = Object.keys(toolData).slice(0, 10);
      const values = Object.values(toolData).slice(0, 10);
      if (toolsChart) toolsChart.destroy();
      toolsChart = new Chart(document.getElementById('toolsChart'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: chartColors, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#a1a1aa', font: { size: 11 } } } } }
      });
    }

    function updateHourlyChart(hourlyData) {
      const labels = Object.keys(hourlyData).map(h => h.split('T')[1] + ':00');
      const values = Object.values(hourlyData);
      if (hourlyChart) hourlyChart.destroy();
      hourlyChart = new Chart(document.getElementById('hourlyChart'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Requests', data: values, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true } } }
      });
    }

    function updateEndpointChart(endpointData) {
      const labels = Object.keys(endpointData);
      const values = Object.values(endpointData);
      if (endpointChart) endpointChart.destroy();
      endpointChart = new Chart(document.getElementById('endpointChart'), {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: chartColors, borderRadius: 8 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#71717a' }, grid: { display: false } }, y: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true } } }
      });
    }

    function updateClientsChart(clientData) {
      const entries = Object.entries(clientData).slice(0, 5);
      const labels = entries.map(([k]) => k.substring(0, 30) + (k.length > 30 ? '...' : ''));
      const values = entries.map(([, v]) => v);
      if (clientsChart) clientsChart.destroy();
      clientsChart = new Chart(document.getElementById('clientsChart'), {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: chartColors.slice(0, 5), borderRadius: 8 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#71717a' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }, y: { ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } } } }
      });
    }

    function updateRecentCalls(calls) {
      const container = document.getElementById('recentCalls');
      if (!calls || calls.length === 0) {
        container.innerHTML = '<p style="color: #71717a;">No tool calls yet</p>';
        return;
      }
      container.innerHTML = calls.slice(0, 20).map(call =>
        '<div class="call-item">' +
        '  <div>' +
        '    <span class="call-tool">' + call.tool + '</span>' +
        '    <div class="call-client">' + call.userAgent + '</div>' +
        '  </div>' +
        '  <span class="call-time">' + new Date(call.timestamp).toLocaleTimeString() + '</span>' +
        '</div>'
      ).join('');
    }

    loadData();
    setInterval(loadData, 30000);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Analytics import endpoint
app.post('/analytics/import', (req: Request, res: Response) => {
  trackRequest(req, '/analytics/import');
  try {
    const importData = req.body;
    if (importData.totalRequests) {
      analytics.totalRequests += importData.totalRequests;
    }
    if (importData.totalToolCalls) {
      analytics.totalToolCalls += importData.totalToolCalls;
    }
    saveAnalytics();
    res.json({
      message: 'Analytics imported successfully',
      currentStats: {
        totalRequests: analytics.totalRequests,
        totalToolCalls: analytics.totalToolCalls,
      },
    });
  } catch (error) {
    res.status(400).json({ error: 'Failed to import analytics', details: String(error) });
  }
});

// ============================================================================
// MCP Endpoint - Streamable HTTP Transport
// ============================================================================

// Create Streamable HTTP transport (stateless)
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

// MCP endpoint - handles POST (requests), GET (SSE), DELETE (session close)
app.all('/mcp', async (req: Request, res: Response) => {
  trackRequest(req, '/mcp');

  // Track tool calls from request body
  if (req.method === 'POST' && req.body) {
    const body = req.body;
    if (body.method === 'tools/call' && body.params?.name) {
      trackToolCall(body.params.name, req);
    }
  }

  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// ============================================================================
// Start Server
// ============================================================================

mcpServer.connect(transport)
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log('='.repeat(60));
      console.log('🚀 Codex MCP Server (Streamable HTTP)');
      console.log('='.repeat(60));
      console.log(`📍 Server running on http://${HOST}:${PORT}`);
      console.log(`📡 MCP endpoint: http://${HOST}:${PORT}/mcp`);
      console.log(`❤️  Health check: http://${HOST}:${PORT}/health`);
      console.log(`📊 Analytics: http://${HOST}:${PORT}/analytics/dashboard`);
      console.log('='.repeat(60));
      console.log('');
      console.log('Test with MCP Inspector:');
      console.log(`  npx @modelcontextprotocol/inspector`);
      console.log(`  Select "Streamable HTTP" and enter: http://localhost:${PORT}/mcp`);
      console.log('');
    });
  })
  .catch((error: unknown) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });

// ============================================================================
// Graceful Shutdown
// ============================================================================
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  clearInterval(saveInterval);
  saveAnalytics();
  console.log('Analytics saved. Goodbye!');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

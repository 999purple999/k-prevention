#!/usr/bin/env node
/**
 * Server MCP per k-prevention. Espone a un LLM (Claude Desktop, o qualsiasi client MCP)
 * i dati DECIFRATI e l'ottimizzazione degli scenari, delegando al CLI `kprev` che tiene
 * la chiave in locale (E2E intatto). Richiede KPREV_EMAIL e KPREV_PASSWORD nell'ambiente
 * del server (vedi README) e una sessione (`kprev login`) — creata automaticamente se manca.
 *
 * Config Claude Desktop (claude_desktop_config.json):
 *   "mcpServers": {
 *     "kprev": {
 *       "command": "node",
 *       "args": ["ASSOLUTO/mcp/kprev-mcp.js"],
 *       "env": { "KPREV_BASE": "https://...run.app", "KPREV_EMAIL": "...", "KPREV_PASSWORD": "..." }
 *     }
 *   }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const execFileP = promisify(execFile);
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli', 'kprev.js');
const env = { ...process.env };

async function runCli(args) {
  const { stdout } = await execFileP('node', [CLI, ...args], { env, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function ensureLogin() {
  if (existsSync(join(homedir(), '.kprev', 'session.json'))) return;
  if (!env.KPREV_EMAIL || !env.KPREV_PASSWORD) throw new Error('Imposta KPREV_EMAIL e KPREV_PASSWORD nell\'ambiente del server MCP.');
  await runCli(['login']);
}

const asText = (s) => ({ content: [{ type: 'text', text: s }] });

const server = new McpServer({ name: 'kprev', version: '1.0.0' });

server.tool('kprev_pull', 'Legge i dati finanziari DECIFRATI dell\'utente (tutto o un tipo: incomeStreams, expenses, organicParameters, taxModel, simulationConfig, monteCarlo, ledger).', { type: z.string().optional() }, async ({ type }) => {
  await ensureLogin();
  return asText(await runCli(['pull', ...(type ? [type] : [])]));
});

server.tool('kprev_simulate', 'Esegue la simulazione Monte Carlo sul modello corrente (o su uno scenario) e restituisce probabilità di rovina, capitale ai vari orizzonti, autonomia e flag di rischio.', { scenario: z.string().optional(), iters: z.number().optional() }, async ({ scenario, iters }) => {
  await ensureLogin();
  const args = ['simulate'];
  if (scenario) args.push('--scenario', scenario);
  if (iters) args.push('--iters', String(iters));
  return asText(await runCli(args));
});

server.tool('kprev_optimize', 'Cerca lo scenario che soddisfa un obiettivo (es. "ruin<0.1" o "capital@36>20000") applicando leve (taglia spese, rinvia lo studio, più turni da barista) e spiega perché il migliore funziona. save=true lo salva come scenario.', { goal: z.string(), save: z.boolean().optional() }, async ({ goal, save }) => {
  await ensureLogin();
  const args = ['optimize', '--goal', goal];
  if (save) args.push('--save');
  return asText(await runCli(args));
});

server.tool('kprev_list_scenarios', 'Elenca gli scenari salvati (metadati: nome, principale, date).', {}, async () => {
  await ensureLogin();
  return asText(await runCli(['sims', 'list']));
});

server.tool('kprev_get_scenario', 'Restituisce un singolo scenario decifrato (modello completo) dato il suo id.', { id: z.string() }, async ({ id }) => {
  await ensureLogin();
  return asText(await runCli(['sims', 'get', id]));
});

server.tool('kprev_create_scenario', 'Salva lo stato attuale come nuovo scenario con il nome dato.', { name: z.string() }, async ({ name }) => {
  await ensureLogin();
  return asText(await runCli(['sims', 'create', name]));
});

server.tool('kprev_promote_scenario', 'Promuove uno scenario a principale (lo carica come modello di lavoro).', { id: z.string() }, async ({ id }) => {
  await ensureLogin();
  return asText(await runCli(['sims', 'promote', id]));
});

await server.connect(new StdioServerTransport());
process.stderr.write('kprev MCP server attivo (stdio).\n');

#!/usr/bin/env node
/**
 * kprev — ponte locale AI/CLI per k-prevention. Fa login, decifra IN LOCALE con la tua
 * chiave (E2E intatto: la chiave non lascia il dispositivo) ed espone i dati e
 * l'ottimizzazione degli scenari a te o a un LLM (via MCP o direttamente da una chat).
 *
 * Uso:
 *   node cli/kprev.js login                 # KPREV_EMAIL / KPREV_PASSWORD o prompt
 *   node cli/kprev.js pull [tipo]           # dati decifrati (JSON) su stdout
 *   node cli/kprev.js push <tipo> <file|->  # cifra e salva
 *   node cli/kprev.js sims [list|get <id>|export [--all]|create <nome>|promote <id>|delete <id>]
 *   node cli/kprev.js simulate [--scenario <id>] [--iters N]
 *   node cli/kprev.js optimize --goal "ruin<0.1" | "capital@36>20000" [--save]
 *
 * Env: KPREV_BASE (default http://localhost:8080), KPREV_EMAIL, KPREV_PASSWORD.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { deriveAuthProof, deriveKEK, unwrapDEK, encryptData, decryptData, aadFor } from '../src/lib/crypto.ts';
import { simulate } from '../src/engine/simulate.ts';
import { anchorInput } from '../src/lib/ledger.ts';

const BASE = process.env.KPREV_BASE || 'http://localhost:8080';
const CFG_DIR = join(homedir(), '.kprev');
const SESSION_FILE = join(CFG_DIR, 'session.json');
const SCENARIO_TYPES = ['incomeStreams', 'expenses', 'organicParameters', 'taxModel', 'simulationConfig', 'monteCarlo', 'ledger'];

// ---------------- sessione & auth ----------------
function loadSession() {
  if (!existsSync(SESSION_FILE)) throw new Error('Non autenticato. Esegui: kprev login');
  return JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
}
function saveSession(s) {
  mkdirSync(CFG_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2));
}
async function ask(q, { hide = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (hide) process.stdout.write(q);
  const answer = hide ? await new Promise((res) => { rl.question('', res); rl.output.write('\n'); }) : await rl.question(q);
  rl.close();
  return answer.trim();
}

async function apiFetch(cookie, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function login() {
  const email = process.env.KPREV_EMAIL || (await ask('Email: '));
  const password = process.env.KPREV_PASSWORD || (await ask('Password: ', { hide: true }));
  const { authSalt, kekSalt } = await apiFetch(null, 'POST', '/api/auth/salts', { email });
  const authProof = await deriveAuthProof(password, authSalt);
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, authProof }),
  });
  if (!res.ok) throw new Error('Login fallito: credenziali non valide.');
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const { userId, wrappedDek, dekIv } = await res.json();
  saveSession({ base: BASE, email, userId, cookie, kekSalt, wrappedDek, dekIv });
  process.stderr.write(`✓ Autenticato come ${email} (userId ${userId.slice(0, 8)}…). Sessione in ${SESSION_FILE}\n`);
}

/** Sblocca la DEK dalla password (env o prompt): la chiave resta locale. */
async function unlock() {
  const s = loadSession();
  const password = process.env.KPREV_PASSWORD || (await ask('Password (per decifrare): ', { hide: true }));
  const kek = await deriveKEK(password, s.kekSalt);
  const dek = await unwrapDEK(s.wrappedDek, s.dekIv, kek);
  return { ...s, dek };
}

// ---------------- comandi dati ----------------
async function pullAll(s) {
  const blobs = await apiFetch(s.cookie, 'GET', '/api/data');
  const out = {};
  for (const b of blobs) out[b.dataType] = await decryptData(b.encryptedBlob, b.iv, s.dek, aadFor(s.userId, b.dataType));
  return out;
}

async function cmdPull(type) {
  const s = await unlock();
  const all = await pullAll(s);
  process.stdout.write(JSON.stringify(type ? all[type] : all, null, 2) + '\n');
}

async function cmdPush(type, file) {
  const s = await unlock();
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  const obj = JSON.parse(raw);
  const { ciphertext, iv } = await encryptData(obj, s.dek, aadFor(s.userId, type));
  const r = await apiFetch(s.cookie, 'PUT', `/api/data/${type}`, { encryptedBlob: ciphertext, iv });
  process.stderr.write(`✓ ${type} salvato (v${r.lastModified}).\n`);
}

function modelFromData(d) {
  const m = {};
  for (const t of SCENARIO_TYPES) m[t] = d[t];
  return m;
}
function inputFromModel(m) {
  return anchorInput(
    { simulationConfig: m.simulationConfig, incomeStreams: m.incomeStreams, expenses: m.expenses, organicParameters: m.organicParameters, taxModel: m.taxModel, monteCarlo: m.monteCarlo },
    m.ledger,
  );
}

async function cmdSims(sub, arg) {
  const s = await unlock();
  if (!sub || sub === 'list') {
    const list = await apiFetch(s.cookie, 'GET', '/api/simulations');
    process.stdout.write(JSON.stringify(list, null, 2) + '\n');
  } else if (sub === 'get') {
    const sim = await apiFetch(s.cookie, 'GET', `/api/simulations/${arg}`);
    const model = await decryptData(sim.encryptedBlob, sim.iv, s.dek, aadFor(s.userId, 'simulations'));
    process.stdout.write(JSON.stringify({ ...sim, model, encryptedBlob: undefined, iv: undefined }, null, 2) + '\n');
  } else if (sub === 'export') {
    const list = await apiFetch(s.cookie, 'GET', '/api/simulations');
    const all = [];
    for (const meta of list) {
      const sim = await apiFetch(s.cookie, 'GET', `/api/simulations/${meta.id}`);
      all.push({ name: meta.name, isMain: meta.isMain, model: await decryptData(sim.encryptedBlob, sim.iv, s.dek, aadFor(s.userId, 'simulations')) });
    }
    process.stdout.write(JSON.stringify({ _meta: { schemaVersion: '1.0.0' }, scenarios: all }, null, 2) + '\n');
  } else if (sub === 'create') {
    const all = await pullAll(s);
    const { ciphertext, iv } = await encryptData(modelFromData(all), s.dek, aadFor(s.userId, 'simulations'));
    const r = await apiFetch(s.cookie, 'POST', '/api/simulations', { name: arg || 'Scenario CLI', encryptedBlob: ciphertext, iv });
    process.stderr.write(`✓ scenario creato: ${r.id}\n`);
  } else if (sub === 'promote') {
    await apiFetch(s.cookie, 'POST', `/api/simulations/${arg}/promote`);
    process.stderr.write('✓ promosso a principale\n');
  } else if (sub === 'delete') {
    await apiFetch(s.cookie, 'DELETE', `/api/simulations/${arg}`);
    process.stderr.write('✓ eliminato\n');
  }
}

async function cmdSimulate(flags) {
  const s = await unlock();
  let model;
  if (flags.scenario) {
    const sim = await apiFetch(s.cookie, 'GET', `/api/simulations/${flags.scenario}`);
    model = await decryptData(sim.encryptedBlob, sim.iv, s.dek, aadFor(s.userId, 'simulations'));
  } else {
    model = modelFromData(await pullAll(s));
  }
  const out = simulate(inputFromModel(model), { iterationsOverride: Number(flags.iters) || undefined });
  process.stdout.write(JSON.stringify(summary(out), null, 2) + '\n');
}

function summary(out) {
  const a = out.aggregateResult;
  return {
    probabilityOfRuin: a.probabilityOfRuin,
    capitalAtHorizon: Object.fromEntries(Object.entries(a.capitalAtHorizon).map(([k, v]) => [k, { p10: Math.round(v.p10), p50: Math.round(v.p50), p90: Math.round(v.p90) }])),
    expectedRunwayMonths: a.expectedRunwayMonths,
    activeFlags: a.activeFlags,
    converged: a.convergence.converged,
  };
}

// ---------------- ottimizzatore ----------------
function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
function shiftMonths(dateIso, months) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const idx = (y * 12 + (m - 1)) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}`;
}

/** Genera scenari candidati applicando "leve" al modello, con spiegazione. */
function candidates(model) {
  const list = [{ name: 'Baseline (attuale)', changes: ['nessuna modifica'], model: clone(model) }];

  // 1) taglia le spese discrezionali (non essenziali)
  const cutDisc = clone(model);
  const disabled = [];
  for (const e of cutDisc.expenses) {
    if (e.essential === false && e.enabled !== false && e.type !== 'one-time') {
      e.enabled = false;
      disabled.push(e.name);
    }
  }
  if (disabled.length) list.push({ name: 'Taglia le spese discrezionali', changes: [`disabilita: ${disabled.join(', ')}`], model: cutDisc });

  // 2) rinvia gli acquisti studio (one-time non essenziali) di 3 e 6 mesi
  for (const shift of [3, 6]) {
    const m = clone(model);
    const moved = [];
    for (const e of m.expenses) {
      if (e.type === 'one-time' && e.enabled !== false && /studio|strument|software|plugin|arturia|waves|serum|neumann|rme|apollo|audeze|isovox|budget/i.test(`${e.category} ${e.name}`)) {
        e.startDate = shiftMonths(e.startDate, shift);
        moved.push(e.name);
      }
    }
    if (moved.length) list.push({ name: `Rinvia lo studio di ${shift} mesi`, changes: [`sposta ${moved.length} acquisti di +${shift} mesi`], model: m });
  }

  // 3) solo l'essenziale dello studio (disabilita gli acquisti one-time non essenziali)
  const essOnly = clone(model);
  const off = [];
  for (const e of essOnly.expenses) {
    if (e.type === 'one-time' && e.essential === false && e.enabled !== false) {
      e.enabled = false;
      off.push(e.name);
    }
  }
  if (off.length) list.push({ name: 'Solo lo studio essenziale', changes: [`rinuncia a ${off.length} acquisti non essenziali`], model: essOnly });

  // 4) più turni da barista (+200€/mese)
  const barista = clone(model);
  let bumped = false;
  for (const s of barista.incomeStreams) {
    if (/barista|commotion/i.test(s.name) && s.amount?.dist === 'triangular') {
      s.amount = { ...s.amount, min: s.amount.min + 150, mode: s.amount.mode + 200, max: s.amount.max + 250 };
      bumped = true;
    }
  }
  if (bumped) list.push({ name: 'Più turni da barista (+~200€/mese)', changes: ['aumenta il reddito da barista'], model: barista });

  // 5) combo: essenziale studio + taglia discrezionali
  const combo = clone(essOnly);
  const comboOff = [];
  for (const e of combo.expenses) {
    if (e.essential === false && e.enabled !== false && e.type !== 'one-time') { e.enabled = false; comboOff.push(e.name); }
  }
  list.push({ name: 'Combo: studio essenziale + niente spese superflue', changes: ['studio minimo + taglio discrezionali'], model: combo });

  return list;
}

function metricFor(out, goal) {
  if (goal.kind === 'ruin') return out.aggregateResult.probabilityOfRuin;
  return out.aggregateResult.capitalAtHorizon[String(goal.horizon)]?.p50 ?? 0;
}
function parseGoal(str) {
  let m = /^ruin\s*<\s*([\d.]+)$/i.exec(str);
  if (m) return { kind: 'ruin', target: Number(m[1]), better: 'lower', label: `probabilità di rovina < ${(Number(m[1]) * 100).toFixed(0)}%` };
  m = /^capital@(\d+)\s*>\s*([\d.]+)$/i.exec(str);
  if (m) return { kind: 'capital', horizon: Number(m[1]), target: Number(m[2]), better: 'higher', label: `capitale a ${m[1]} mesi > €${Number(m[2]).toLocaleString('it-IT')}` };
  throw new Error('Goal non riconosciuto. Usa "ruin<0.1" oppure "capital@36>20000".');
}

async function cmdOptimize(flags) {
  const s = await unlock();
  const goal = parseGoal(flags.goal);
  const model = modelFromData(await pullAll(s));
  const iters = Number(flags.iters) || 2000;
  const results = candidates(model).map((c) => {
    const out = simulate(inputFromModel(c.model), { iterationsOverride: iters });
    return { ...c, metric: metricFor(out, goal), out };
  });
  results.sort((a, b) => (goal.better === 'lower' ? a.metric - b.metric : b.metric - a.metric));
  const fmtMetric = (v) => (goal.kind === 'ruin' ? `${(v * 100).toFixed(1)}% rovina` : `€${Math.round(v).toLocaleString('it-IT')} @${goal.horizon}m`);

  const winner = results[0];
  const meets = goal.better === 'lower' ? winner.metric < goal.target : winner.metric > goal.target;

  const report = {
    goal: goal.label,
    obiettivoRaggiunto: meets,
    classifica: results.map((r) => ({ scenario: r.name, risultato: fmtMetric(r.metric), modifiche: r.changes })),
    migliore: {
      scenario: winner.name,
      risultato: fmtMetric(winner.metric),
      capitale36: summary(winner.out).capitalAtHorizon['36'],
      spiegazione: `${winner.name}: ${winner.changes.join('; ')}. Risultato: ${fmtMetric(winner.metric)} contro ${fmtMetric(results.find((r) => r.name.startsWith('Baseline')).metric)} del baseline. ${meets ? 'Obiettivo raggiunto ✓' : 'Obiettivo NON raggiunto: serve una leva più forte.'}`,
    },
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');

  if (flags.save && winner.name !== 'Baseline (attuale)') {
    const { ciphertext, iv } = await encryptData(winner.model, s.dek, aadFor(s.userId, 'simulations'));
    const r = await apiFetch(s.cookie, 'POST', '/api/simulations', { name: `AI: ${winner.name}`, encryptedBlob: ciphertext, iv });
    process.stderr.write(`✓ scenario migliore salvato: ${r.id}\n`);
  }
}

// ---------------- dispatch ----------------
function parseFlags(args) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const k = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) flags[k] = args[++i];
      else flags[k] = true;
    } else pos.push(args[i]);
  }
  return { flags, pos };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, pos } = parseFlags(rest);
  switch (cmd) {
    case 'login': return login();
    case 'pull': return cmdPull(pos[0]);
    case 'push': return cmdPush(pos[0], pos[1]);
    case 'sims': return cmdSims(pos[0], pos[1]);
    case 'simulate': return cmdSimulate(flags);
    case 'optimize': return cmdOptimize(flags);
    default:
      process.stderr.write('Comandi: login | pull [tipo] | push <tipo> <file|-> | sims [...] | simulate | optimize --goal "ruin<0.1"\n');
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  process.stderr.write(`Errore: ${e.message}\n`);
  process.exit(1);
});

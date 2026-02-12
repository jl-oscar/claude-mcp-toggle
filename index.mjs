#!/usr/bin/env node
/**
 * MCP Toggle - Interactive TUI to toggle MCP servers on/off for Claude Code
 *
 * Reads servers from:
 *   ~/.claude.json  -> mcpServers  (user-scoped, active)
 *   ~/.claude.json  -> _disabledMcpServers  (user-scoped, disabled)
 *   ~/.claude.json  -> projects.<cwd>.mcpServers  (local-scoped, active)
 *   ~/.claude.json  -> projects.<cwd>._disabledMcpServers  (local-scoped, disabled)
 *
 * Toggles by moving servers between mcpServers and _disabledMcpServers
 * directly in ~/.claude.json so Claude Code picks up the changes on restart.
 *
 * Usage: mcp
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ── Paths ──────────────────────────────────────────────────────────
const CLAUDE_JSON = join(homedir(), '.claude.json');

// ── ANSI helpers ───────────────────────────────────────────────────
const ESC = '\x1b';
const CSI = `${ESC}[`;
const c = {
  reset:  `${CSI}0m`,
  bold:   `${CSI}1m`,
  dim:    `${CSI}2m`,
  green:  `${CSI}32m`,
  red:    `${CSI}31m`,
  cyan:   `${CSI}36m`,
  white:  `${CSI}37m`,
};
const hide = () => process.stdout.write(`${CSI}?25l`);
const show = () => process.stdout.write(`${CSI}?25h`);
const clear = () => process.stdout.write(`${CSI}2J${CSI}H`);

// ── Load config ────────────────────────────────────────────────────
function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function loadServers() {
  const claudeJson = readJSON(CLAUDE_JSON);
  if (!claudeJson) {
    console.error(`Could not read ${CLAUDE_JSON}`);
    process.exit(1);
  }

  const servers = [];
  const seen = new Set();

  // User-scoped active servers
  if (claudeJson.mcpServers) {
    for (const name of Object.keys(claudeJson.mcpServers)) {
      servers.push({ name, source: 'user', enabled: true, config: claudeJson.mcpServers[name] });
      seen.add(name);
    }
  }

  // User-scoped disabled servers
  if (claudeJson._disabledMcpServers) {
    for (const name of Object.keys(claudeJson._disabledMcpServers)) {
      if (!seen.has(name)) {
        servers.push({ name, source: 'user', enabled: false, config: claudeJson._disabledMcpServers[name] });
        seen.add(name);
      }
    }
  }

  // Local-scoped (per-project) active servers
  const cwd = process.cwd().replace(/\\/g, '/');
  const projectEntry = claudeJson.projects?.[cwd];
  if (projectEntry?.mcpServers) {
    for (const name of Object.keys(projectEntry.mcpServers)) {
      if (!seen.has(name)) {
        servers.push({ name, source: 'local', enabled: true, config: projectEntry.mcpServers[name] });
        seen.add(name);
      }
    }
  }

  // Local-scoped disabled servers
  if (projectEntry?._disabledMcpServers) {
    for (const name of Object.keys(projectEntry._disabledMcpServers)) {
      if (!seen.has(name)) {
        servers.push({ name, source: 'local', enabled: false, config: projectEntry._disabledMcpServers[name] });
        seen.add(name);
      }
    }
  }

  return servers;
}

function saveState(servers) {
  const claudeJson = readJSON(CLAUDE_JSON);
  if (!claudeJson) return;

  const cwd = process.cwd().replace(/\\/g, '/');

  // Rebuild user-scoped
  const userActive = {};
  const userDisabled = {};
  for (const s of servers.filter(s => s.source === 'user')) {
    if (s.enabled) {
      userActive[s.name] = s.config;
    } else {
      userDisabled[s.name] = s.config;
    }
  }
  claudeJson.mcpServers = userActive;
  if (Object.keys(userDisabled).length > 0) {
    claudeJson._disabledMcpServers = userDisabled;
  } else {
    delete claudeJson._disabledMcpServers;
  }

  // Rebuild local-scoped
  const projectEntry = claudeJson.projects?.[cwd];
  if (projectEntry) {
    const localActive = {};
    const localDisabled = {};
    for (const s of servers.filter(s => s.source === 'local')) {
      if (s.enabled) {
        localActive[s.name] = s.config;
      } else {
        localDisabled[s.name] = s.config;
      }
    }
    projectEntry.mcpServers = localActive;
    if (Object.keys(localDisabled).length > 0) {
      projectEntry._disabledMcpServers = localDisabled;
    } else {
      delete projectEntry._disabledMcpServers;
    }
  }

  writeFileSync(CLAUDE_JSON, JSON.stringify(claudeJson, null, 2) + '\n', 'utf-8');
}

// ── UI ─────────────────────────────────────────────────────────────
const servers = loadServers();
if (servers.length === 0) {
  console.log(`${c.red}No MCP servers found.${c.reset}`);
  console.log(`${c.dim}Checked: ${CLAUDE_JSON}${c.reset}`);
  process.exit(1);
}

let cursor = 0;

function render() {
  clear();

  console.log(`${c.bold}${c.cyan}  MCP Server Toggle${c.reset}`);
  console.log(`${c.dim}  ─────────────────────────────────────${c.reset}`);
  console.log(`${c.dim}  SPACE toggle  |  ENTER save  |  ESC cancel${c.reset}`);
  console.log(`${c.dim}  a = all on    |  n = all off${c.reset}`);
  console.log();

  for (let i = 0; i < servers.length; i++) {
    const { name, source, enabled } = servers[i];
    const isCursor = i === cursor;

    const prefix = isCursor ? `${c.cyan}  > ` : '    ';
    const icon = enabled
      ? `${c.green}[ON] ${c.reset}`
      : `${c.red}[OFF]${c.reset}`;
    const label = isCursor ? `${c.bold}${c.white}${name}${c.reset}` : `${name}`;
    const tag = source !== 'user' ? ` ${c.dim}(${source})${c.reset}` : '';

    console.log(`${prefix}${icon} ${label}${tag}${c.reset}`);
  }

  console.log();
  const onCount = servers.filter(s => s.enabled).length;
  const offCount = servers.length - onCount;
  console.log(`${c.dim}  ${c.green}${onCount} enabled${c.reset}${c.dim}  ${c.red}${offCount} disabled${c.reset}`);
}

// ── Input handling ─────────────────────────────────────────────────
function start() {
  if (!process.stdin.isTTY) {
    console.error('This tool requires an interactive terminal.');
    process.exit(1);
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');
  hide();
  render();

  process.stdin.on('data', (key) => {
    if (key === '\x03') { cleanup(false); return; }
    if (key === '\x1b' && key.length === 1) { cleanup(false); return; }
    if (key === '\r' || key === '\n') { cleanup(true); return; }

    if (key === `${ESC}[A` || key === 'k') {
      cursor = (cursor - 1 + servers.length) % servers.length;
      render();
      return;
    }
    if (key === `${ESC}[B` || key === 'j') {
      cursor = (cursor + 1) % servers.length;
      render();
      return;
    }

    if (key === ' ') {
      servers[cursor].enabled = !servers[cursor].enabled;
      render();
      return;
    }

    if (key === 'a') {
      for (const s of servers) s.enabled = true;
      render();
      return;
    }

    if (key === 'n') {
      for (const s of servers) s.enabled = false;
      render();
      return;
    }
  });
}

function cleanup(save) {
  show();
  clear();

  if (save) {
    saveState(servers);

    console.log(`${c.bold}${c.green}  Saved!${c.reset}\n`);

    for (const s of servers) {
      const icon = s.enabled ? `${c.green}ON ${c.reset}` : `${c.red}OFF${c.reset}`;
      console.log(`  ${icon}  ${s.name}`);
    }

    console.log(`\n${c.dim}  Written to: ${CLAUDE_JSON}${c.reset}`);
    console.log(`${c.dim}  Restart Claude Code to apply changes.${c.reset}\n`);
  } else {
    console.log(`${c.dim}  Cancelled - no changes made.${c.reset}\n`);
  }

  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

// ── Go ─────────────────────────────────────────────────────────────
start();

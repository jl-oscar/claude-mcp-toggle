# mcp-toggle

Interactive TUI to toggle MCP servers on/off for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Saves context tokens by disabling MCP servers you don't need for the current session.

## Install

```bash
npm install -g mcp-toggle
```

Or install from GitHub:

```bash
npm install -g github:jl-oscar/claude-mcp-toggle
```

## Usage

```
mcp
```

Controls:

- **Arrow keys** / **j/k** — Navigate
- **Space** — Toggle selected server
- **a** — All on
- **n** — All off
- **Enter** — Save
- **Esc** — Cancel

After saving, restart Claude Code for changes to take effect.

## How it works

Reads MCP servers from `~/.claude.json` and shows them in an interactive list. Disabled servers are moved to a `_disabledMcpServers` key in the same file — Claude Code only reads `mcpServers`, so disabled servers are invisible to it.

Supports both user-scoped and project-scoped (local) servers.

## Requirements

- Node.js >= 18
- Claude Code with MCP servers configured in `~/.claude.json`

## License

MIT

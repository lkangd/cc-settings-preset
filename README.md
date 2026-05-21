<p align="center">
  <a href="https://github.com/lkangd/cc-settings-preset">
    <img
      src="https://raw.githubusercontent.com/lkangd/cc-settings-preset/main/assets/ccsp-logo.png"
      alt="CCSP — Claude Code Settings Preset"
      width="420"
    />
  </a>
</p>

<p align="center">
  <strong>A switchable, reusable runtime settings preset selector for Claude Code.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lkangd/cc-settings-preset"><img src="https://img.shields.io/npm/v/@lkangd/cc-settings-preset?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/lkangd/cc-settings-preset/blob/main/LICENSE"><img src="https://img.shields.io/github/license/lkangd/cc-settings-preset?style=flat-square" alt="license" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/@lkangd/cc-settings-preset?style=flat-square" alt="node version" /></a>
  <a href="https://github.com/lkangd/cc-settings-preset"><img src="https://img.shields.io/github/stars/lkangd/cc-settings-preset?style=flat-square" alt="stars" /></a>
  <a href="https://github.com/lkangd/cc-settings-preset/issues"><img src="https://img.shields.io/github/issues/lkangd/cc-settings-preset?style=flat-square" alt="issues" /></a>
</p>

<p align="center">
  <img
    src="https://raw.githubusercontent.com/lkangd/cc-settings-preset/main/assets/screen-shot.png"
    alt="CCSP TUI: base preset selection and project launch toggles"
    width="900"
  />
</p>

<p align="center">
  <em>Interactive flow: pick a global base preset (left), preview its JSON (right), then tune plugins / skills / MCP per launch before starting Claude Code.</em>
</p>

**English** | [简体中文](README.zh-hans.md)

---

## Quick Start

**Prerequisites:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed (`claude` available on your `PATH`).

### Install

**macOS (Homebrew, recommended)** — via the personal tap [lkangd/homebrew-tap](https://github.com/lkangd/homebrew-tap); Node.js 20 is installed as a dependency:

```bash
brew tap lkangd/tap
brew install cc-settings-preset
```

**npm / pnpm** — requires Node.js ≥ 20.19.2 on your machine:

```bash
npm install -g @lkangd/cc-settings-preset
# or
pnpm add -g @lkangd/cc-settings-preset
```

After install, use either `ccsp` or `cc-settings-preset`.

### Usage

```bash
# Start from a project directory (recommended entry)
ccsp

# Forward Claude Code args (ccsp owns --settings)
ccsp claude --help
ccsp claude -p "review this PR"
```

**First-time workflow:**

```bash
# 1. Import a global base preset from existing settings
ccsp create

# 2. In a project: pick a preset, tune plugins / skills / MCP for this launch, then start Claude
ccsp

# 3. Manage global or project launch presets
ccsp manage
ccsp manage --project
```

---

## Use Cases

CCSP (**C**laude **C**ode **S**ettings **P**reset) helps when you need to switch Claude Code configuration across contexts without hand-editing JSON every time.

### 1. Multiple models / API backends

Different projects use different API keys, `ANTHROPIC_BASE_URL`, or default models (Opus, Sonnet, custom gateway). Editing `~/.claude/settings.json` by hand is error-prone.

**Approach:** Run `ccsp create` to save a **global base preset** per environment (including `env` and model fields). In each project, run `ccsp` and pick the preset—no repeated edits to your main settings file.

### 2. Per-project plugins, skills, and MCP

Under one global baseline, project A disables an official plugin, project B blocks Chrome DevTools MCP, project C turns off certain skills.

**Approach:** Use a **launch preset** in the project to override only `enabledPlugins`, `skillOverrides`, and `deniedMcpServers`. CCSP merges that with the base preset into a temp settings file, then starts `claude`.

### 3. Team baseline, personal launch tweaks

The team can commit `.claude/settings.json` as the project baseline. Individuals keep global presets locally and store launch combinations under `.claude/.ccsp/` (gitignored by default to avoid leaking secrets).

### 4. Replace long `claude` one-liners

Instead of:

```bash
claude --settings ~/.claude/my-api-1.json -- ...
```

use `ccsp` or `ccsp claude -- ...` to pick presets and toggles in the TUI; CCSP generates the settings path and runs `claude --settings <generated>`.

### 5. Config management and preview

- `ccsp manage` — browse, rename, delete global base presets, preview JSON, launch from the UI.
- `ccsp manage --project` — manage launch presets for the current repo (create / save / rename / delete / launch).

---

## How It Works

### Two-layer preset model

| Layer | Location | Role |
|-------|----------|------|
| **Base preset** | `~/.ccsp/settings/*.json` | Full settings snapshot (import from user / project / project-local or any JSON) |
| **Launch preset** | `<project>/.claude/.ccsp/launch-presets/*.json` | **Delta** only: plugin toggles, skill overrides, MCP deny list |

On launch, CCSP does **not** overwrite `~/.claude/settings.json` or the project’s `.claude/settings.json`. It writes a **temporary merged file** (`.claude/.ccsp/tmp/<timestamp>-settings.json`) and runs:

```text
claude --settings <temp-file> [your other args]
```

### ASCII flow

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    User runs ccsp / ccsp claude                         │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ① Discover settings sources (collect if present; no runtime merge yet) │
│    · .claude/settings.local.json  (project-local)                       │
│    · .claude/settings.json        (project)                             │
│    · ~/.claude/settings.json      (user)                                │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
      Base presets exist in ~/.ccsp?              No base presets yet
                    │                                   │
                    ▼                                   ▼
    ┌───────────────────────────┐          Use empty base {} or
    │ TUI: pick global base      │          run ccsp create first
    │ (remember last per cwd)    │
    └───────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ ② Resolve effective baseline                                             │
│    · Plugins: user < project < project-local < selected base preset      │
│    · Skills: scan ~/.claude/skills, project skills/commands, plugin cache│
│    · MCP: merge .mcp.json, ~/.claude.json, plugin manifests, etc.        │
└──────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ③ TUI: project launch layer (Launch Preset)                             │
│    · Left: launch presets  Right: plugin | skill | MCP toggles           │
│    · Save as preset / overwrite / launch without saving                  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ④ finalizeSettings(base, launch)                                        │
│    · Copy full base preset                                               │
│    · Strip enabledPlugins / skillOverrides / deniedMcpServers from base  │
│    · Apply launch-layer values for those three fields (if any)           │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ⑤ Write .claude/.ccsp/tmp/*.json (gitignored; keep at most 20 files)   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ⑥ spawn: claude --settings <tmp> [sanitized args]                      │
│    · Strip user --settings / --settings=... (managed by ccsp)           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pain points with Claude Code settings alone

| Pain point | Why it hurts |
|------------|--------------|
| **Multiple files and scopes** | user / project / project-local settings make it hard to see what actually applies. |
| **High switching cost** | Changing API, model, or plugin mix means editing JSON or memorizing `--settings` paths. |
| **Easy to break main config** | Editing `~/.claude/settings.json` can mix secrets and global defaults. |
| **Scattered toggles** | `enabledPlugins`, `skillOverrides`, `deniedMcpServers` sit beside `env` with no “this launch only” view. |
| **Commit risk** | Project settings with keys in `env` can be committed by mistake. |

### What CCSP adds

- **Non-destructive launch** — inject config via temp files; does not force-overwrite your main settings.
- **Two-layer split** — global “base environment” vs project “launch delta” for multi-repo work.
- **Visual toggles** — terminal TUI to browse JSON and flip plugins / skills / MCP.
- **Remembers last choice** — per project directory for base and launch presets.
- **Safer defaults** — `.claude/.ccsp/` gets a `.gitignore` that ignores everything on init.

### Limitations (read before assuming)

| Cannot / caveat | Explanation |
|-----------------|-------------|
| **Not a Claude Code replacement** | Wraps the `claude` subprocess only; exits if CLI is missing. |
| **Does not write back main settings** | Merged output is not saved to `~/.claude/settings.json`; sync manually or update base presets via `ccsp create`. |
| **Owns `--settings`** | Your `--settings` is ignored with a warning; path is generated by CCSP. |
| **Limited launch fields** | Launch presets only override `enabledPlugins`, `skillOverrides`, `deniedMcpServers`; other fields (e.g. `env`) come from the base preset. |
| **No “add MCP server” in UI** | Can **deny** discovered MCPs via `deniedMcpServers`; cannot create new server entries. |
| **No headless / CI mode** | Main flow is Ink TUI; `create` / `manage` are interactive unless you edit JSON yourself. |
| **Derived presets** | Schema supports `derived` type; CLI does not expose full create/manage flow yet. |
| **Project store is local by default** | `launch-presets` and `tmp` under `.claude/.ccsp/` are not in Git unless you opt in. |
| **Temp file cap** | Oldest files in `tmp` are pruned when count exceeds 20. |

---

## Command Reference

| Command | Description |
|---------|-------------|
| `ccsp` | Default: pick base preset → configure launch layer → start `claude` |
| `ccsp claude [args...]` | Same, forwarding `args` to `claude` (without `--settings`) |
| `ccsp create` | Interactively create a global base preset |
| `ccsp manage` | Manage global base presets (preview / rename / delete / create / launch) |
| `ccsp manage --project` | Manage launch presets for the current project |

### TUI shortcuts

**Base preset selection:** `j`/`k` or arrows to move, `Enter` to confirm, `q` to quit.

**Global manage (`ccsp manage`):** `l` launch, `r` rename, `d` delete, `c` create, `o` reveal in Finder, `q` quit.

**Project launch layer:** switch between presets and plugin / skill / MCP columns; save as launch preset. `Ctrl+L` refreshes the UI.

---

## Directory Layout

```text
~/.ccsp/
├── index.json                 # global base preset index
├── settings/
│   └── <name>-settings.json   # base preset body
└── last-settings.json         # last base preset name per project cwd

<project>/.claude/.ccsp/       # entire dir gitignored by default
├── launch-presets/
│   ├── index.json
│   └── <name>-launch.json     # launch-layer overrides only
├── tmp/
│   └── <timestamp>-settings.json
└── last-used.json             # last launch preset used
```

---

## Development

```bash
git clone https://github.com/lkangd/cc-settings-preset.git
cd cc-settings-preset
pnpm install
pnpm run dev          # run tsx src/cli.ts directly
pnpm run check        # typecheck + build + test
```

---

## Contributing

Issues and pull requests are welcome. Before you contribute:

1. **Search existing issues** to avoid duplicates; open an issue for new features with motivation and proposed usage.
2. **Verify locally:** `pnpm run check` must pass; CLI changes should include or update tests under `tests/`.
3. **Style:** Match the codebase (ESM, strict TypeScript, Ink + `flows/` state machines); avoid unrelated refactors.
4. **Scope:** CCSP focuses on settings presets and launch orchestration—avoid heavy unrelated dependencies.
5. **Docs:** Update both `README.md` and `README.zh-hans.md` for user-visible behavior changes.
6. **Commits:** Concise English or Chinese is fine; explain *why*, not only *what*.

**Bug reports should include:** OS, Node version, how you invoked `ccsp`, relevant `~/.ccsp` or `.claude/.ccsp` layout (redact secrets), and full terminal output.

---

## License

[ISC](./LICENSE) © lkangd

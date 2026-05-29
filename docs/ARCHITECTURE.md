# Architecture

This document describes the high-level architecture of `cc-settings-preset`
(`ccsp`). If you are about to dive into the code base, this is the right
place to start.

For the product pitch, install instructions, and CLI surface, see
[`README.md`](README.md). This document focuses purely on *how* the system
is built.

## Bird's Eye View

```
                            user invocation
                                  │
                                  ▼
                        ┌────────────────────┐
                        │   src/cli.ts       │   commander + bespoke
                        │   (entry point)    │   argv parsing
                        └────────┬───────────┘
                                 │
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
            ┌─────────┐    ┌─────────┐    ┌──────────┐
            │  ink/   │    │ flows/  │    │ services/│
            │ React   │◄──►│ pure    │◄──►│ file IO, │
            │ TUI     │    │ reducers│    │ discovery│
            └─────────┘    └─────────┘    └────┬─────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │   core/       │
                                       │ paths, schema,│
                                       │ json, spawn   │
                                       └───────┬───────┘
                                               │
                       finalized settings.json │
                       + injected statusline   ▼
                                       ┌───────────────┐
                                       │  claude CLI   │
                                       │  (cross-spawn)│
                                       └───────────────┘
```

`ccsp` is a launcher that picks a Claude Code `settings.json` for the next
`claude` invocation. It selects a global "base" preset, layers a per-project
"launch" preset on top, injects a CCSP-aware statusline so the running
session shows which preset it was launched with, writes the result to a
temp file, and `spawn`s `claude --settings <temp>` with stdio inherited.

`src/cli.ts` is the single entry point. It owns argv parsing (including
the passthrough modes `ccsp claude …`, `--continue`, `--resume <uuid>`),
the top-level interactive loop, and the orchestration that wires every
service together. Subcommands (`create`, `manage`, `manage --project`)
are layered on via `commander` only when the first positional argument
doesn't match one of the implicit modes.

`src/ink/` holds the React/`ink` TUI: a `Create` flow, two `Manage` flows
(global presets, per-project launch presets), a `SettingsSelect` flow,
and the largest screen — `ProjectLaunchApp`, a four-column toggle grid
(presets / plugins / skills / MCPs). All keyboard state and selection
logic lives in `src/flows/`, which exports pure reducer functions that
the ink components call from `useReducer`-style hooks. This split keeps
every TUI state transition unit-testable without rendering React.

`src/services/` is the side-effect layer: each file is a small factory
that closes over a `PathContext` (a `{ homeDir, cwd }` pair) and exposes
async operations over JSON stores under `~/.ccsp/` (global presets and
`last-settings.json`), `<cwd>/.claude/.ccsp/` (per-project launch presets,
session bindings, temp settings, statusline wrapper scripts), and the
host's Claude Code state (`~/.claude/settings.json`, `~/.claude.json`,
`/Library/Application Support/ClaudeCode/`).

`src/core/` is the pure leaf: path computation, JSON read/write,
Zod schemas for every on-disk format, argv sanitization, and the
`cross-spawn` wrapper that hands control to the real `claude` binary.

**Deliberate non-goal:** `ccsp` does not parse, validate, or alter the
semantic content of a settings file beyond the three keys it cares about
(`enabledPlugins`, `skillOverrides`, `deniedMcpServers`). Everything else
is passed through verbatim. The Zod schemas use `z.looseObject` precisely
so Claude Code can add new settings keys without breaking `ccsp`.

## Code Map

The walk is leaves-first: `core/` and `services/` underlie everything;
`flows/` and `ink/` consume them; `cli.ts` is the entry point.

### `src/core/`

Pure helpers with no `ccsp`-specific business logic. Every file here is
safe to import from any layer and has no side effects on import.

- [`src/core/paths.ts`](src/core/paths.ts) — every filesystem path the
  app touches, computed from a `PathContext`. The canonical list of
  storage locations: `~/.ccsp/{index.json, settings/…}` (global presets),
  `<cwd>/.claude/.ccsp/{launch-presets/, sessions.json, last-used.json,
  tmp/}` (per-project state), and read-only paths into Claude Code's
  own state (`~/.claude/`, `~/.claude.json`,
  `/Library/Application Support/ClaudeCode/`).
- [`src/core/schema.ts`](src/core/schema.ts) — Zod schemas for every
  persisted JSON file: `settings` (global preset), `launchPresetSettings`
  (per-project overlay), the two index files, the `lastSettings` map,
  and the `sessionBinding` record. All inferred TypeScript types are
  exported from here; nothing else defines a settings shape.
- [`src/core/json.ts`](src/core/json.ts) — `readJsonFile` / `writeJsonFile`
  / `pathExists`. Atomic writes go through a temp-file + rename.
- [`src/core/args.ts`](src/core/args.ts) — argv classification:
  `resolveSessionLaunch` detects whether the user passed `--continue`,
  `--resume <uuid>`, or `--session-id <uuid>`, and `sanitizeClaudeArgs`
  strips any user-supplied `--settings` flag because `ccsp` owns that one.
- [`src/core/name.ts`](src/core/name.ts) — preset name normalization,
  file-name derivation, and the index-lookup key resolver used to make
  preset names case-insensitive on read but case-preserving on write.
- [`src/core/spawn.ts`](src/core/spawn.ts) — the only place that calls
  `cross-spawn`. Translates `ENOENT` and non-zero exit codes into
  `CliError`s.
- [`src/core/errors.ts`](src/core/errors.ts) — `CliError`, carrying an
  optional `exitCode` so `cli.ts` can propagate the child's exit status.

**Architecture Invariant:** Settings schemas are intentionally loose
(`z.looseObject`). `ccsp` parses only the three keys it manipulates and
preserves every unknown field. Claude Code can ship new settings keys
without requiring a `ccsp` release.

**Architecture Invariant:** `core/` files never import from `services/`,
`flows/`, or `ink/`. The dependency graph fans inward only, which lets
the entire `core/` layer be exercised by table-driven unit tests with no
fixtures on disk.

### `src/services/`

Side-effecting modules, each a `createXxxService(deps)` factory or a set
of stateless async functions. Services accept `homeDir` / `cwd` /
`globalRoot` as explicit arguments rather than reading `process.env`
themselves; that injection point is what `cli.ts` sets up once at startup.

#### Preset stores

- [`src/services/preset-service.ts`](src/services/preset-service.ts) —
  CRUD over the **global** preset store at `~/.ccsp/`. Maintains
  `index.json` (id → metadata) and one settings JSON file per preset
  under `settings/`. Also synthesizes the `*Claude Official*` virtual
  preset that reads `~/.claude/settings.json` directly when the user is
  logged in.
- [`src/services/launch-preset-service.ts`](src/services/launch-preset-service.ts)
  — CRUD over the **per-project** launch preset store at
  `<cwd>/.claude/.ccsp/launch-presets/`, plus the temp-settings writer
  (`writeTempSettings` → `<cwd>/.claude/.ccsp/tmp/<stem>-settings.json`),
  the session-binding store (`sessions.json`), and the temp-artifact
  pruner (`MAX_TEMP_SETTINGS_FILES = 50`).
- [`src/services/project-store-service.ts`](src/services/project-store-service.ts)
  — `ensureProjectCcspStore`: lazily creates `<cwd>/.claude/.ccsp/` plus
  its `launch-presets/` and `tmp/` subdirs and writes a `.gitignore`
  containing `*` so a checkout never accidentally commits preset state.
- [`src/services/global-last-settings-service.ts`](src/services/global-last-settings-service.ts)
  — remembers which **global** preset was last used in each `cwd`, so
  the SettingsSelect screen can re-highlight it on the next launch.

**Architecture Invariant:** Preset names are case-insensitive on lookup
(`resolvePresetIndexKey`) but case-preserving on write. This is so users
who type `ccsp manage` and rename `prod` → `Prod` get the rename they
expect, while a programmatic `readPreset('PROD')` still works.

**Architecture Invariant:** Every directory write under `<cwd>/.claude/.ccsp/`
goes through `ensureProjectCcspStore`, which always (re)writes
`.gitignore: *`. The repo is therefore safe to commit even if a user
accidentally `git add`s the `.claude/` folder.

**Architecture Invariant:** Temp settings files live under the project,
not in `os.tmpdir()`. Reason: a user reading their shell history needs
to be able to inspect "what settings did `ccsp` actually launch Claude
with?" — having the file co-located with the project makes that
discoverable. Pruning keeps the directory from growing unbounded.

#### Discovery (Claude Code state → typed records)

- [`src/services/settings-source-service.ts`](src/services/settings-source-service.ts)
  — enumerates the three Claude Code settings sources that exist on disk:
  `project-local` (`<cwd>/.claude/settings.local.json`), `project`
  (`<cwd>/.claude/settings.json`), `user` (`~/.claude/settings.json`).
- [`src/services/managed-settings-service.ts`](src/services/managed-settings-service.ts)
  — reads the macOS managed-settings drop-in directory
  (`/Library/Application Support/ClaudeCode/managed-settings.d/*.json`)
  and deep-merges the fragments. Used only for statusline resolution.
- [`src/services/plugin-service.ts`](src/services/plugin-service.ts) —
  given a list of `{ scope, settings }` sources, resolves each plugin's
  effective enabled state. The precedence is documented in code as
  `ownershipPrecedence`: `user < project < project-local`, with the
  `preset` source treated as a separate, lower-priority origin.
- [`src/services/skill-service.ts`](src/services/skill-service.ts) —
  walks four skill sources: project (`<cwd>/.claude/skills/`, plus
  every ancestor directory), command-style skills
  (`<cwd>/.claude/commands/*.md`), user skills (`~/.claude/skills/`),
  and plugin skills (every plugin under
  `~/.claude/plugins/cache/*/plugin.json` whose owning plugin is enabled).
  Plugin-controlled skills are reported as `toggleable: false`.
- [`src/services/mcp-service.ts`](src/services/mcp-service.ts) —
  discovers MCP servers from four origins: plugin manifests, the user's
  `~/.claude.json` (top-level and per-project), and `<cwd>/.mcp.json`.
  Then `applyPluginMcpAvailability` and `applyDeniedMcpServers` layer
  the enabled state on top.
- [`src/services/claude-session-service.ts`](src/services/claude-session-service.ts)
  — discovers Claude Code session IDs by listing
  `~/.claude/projects/<encoded-cwd>/*.jsonl`. Used to (a) detect the
  session id Claude created during a launch by diffing a pre-spawn
  snapshot, and (b) check whether a stored session binding still has a
  live transcript on disk.
- [`src/services/claude-login-service.ts`](src/services/claude-login-service.ts)
  — answers "is the user logged in to Claude?" by checking for
  `~/.claude/.credentials.json` and, on macOS, the
  `Claude Code-credentials` keychain entry (read via metadata-only
  `security find-generic-password`, which does not prompt).

**Architecture Invariant:** Discovery services never throw on `ENOENT`.
The Claude Code state directories are all optional — a user can run
`ccsp` on a fresh machine with no `~/.claude/` at all. Every `readdir` /
`stat` site checks for `ENOENT` and returns an empty result rather than
propagating.

**Architecture Invariant:** `claude-session-service` derives the session
id by **diffing** the jsonl directory across the lifetime of one
`spawnClaude` call, not by injecting `--session-id`. Claude ignores
`--session-id` in interactive mode, and concurrent `ccsp` launches in
the same `cwd` would otherwise steal each other's ids. The earliest
`birthtimeMs` wins.

#### Composition

- [`src/services/disable-lock-service.ts`](src/services/disable-lock-service.ts)
  — given a list of settings sources, finds the *file* that currently
  "owns" a disabled item (a `false` plugin entry, an `'off'` skill
  override, or a `serverName` entry in `deniedMcpServers`). The UI uses
  this to show the user where a disable is locked in, and
  `applyDisableRemovals` mutates the right file when the user confirms
  re-enabling.
- [`src/services/statusline-resolver-service.ts`](src/services/statusline-resolver-service.ts)
  — resolves which statusline command would be effective for this launch
  by walking the standard Claude Code precedence:
  `managed → project-local → project → user → base preset`.
- [`src/services/statusline-injector-service.ts`](src/services/statusline-injector-service.ts)
  — wraps the resolved statusline command inside a CCSP wrapper shell
  script that runs the underlying command first, then appends the CCSP
  status line (`CCSP: <global>/<launch> | plugins(n/N) | skills(n/N) | MCPs(n/N)`)
  in cyan. The wrapper script lives in `<cwd>/.claude/.ccsp/tmp/` and is
  referenced by the finalized `settings.json`.
- [`src/services/settings-finalizer-service.ts`](src/services/settings-finalizer-service.ts)
  — the composer: takes a `base` preset and a `launch` preset, strips
  the three `ccsp`-managed keys from the base, layers the launch values
  on top, then asks `injectCcspStatusLine` to attach a `statusLine`
  config pointing at the wrapper script. The returned `Settings` object
  is what eventually gets written to the temp file passed to
  `claude --settings`.

**Architecture Invariant:** `finalizeSettings` always
deletes `enabledPlugins`, `skillOverrides`, and `deniedMcpServers` from
the base before merging the launch overlay. Reason: launch state is
fully reified by the UI (every toggle that should be off is recorded),
so partial merging would re-introduce stale enables from the base.

**Architecture Invariant:** The statusline wrapper runs the underlying
command inside `set -euo pipefail` but ignores its exit status
(`if underlying_out=$(… 2>/dev/null); then`). The CCSP line is appended
regardless. Reason: a broken user statusline must never hide the CCSP
marker, because that marker is the only in-session signal of which
preset is active.

### `src/flows/`

Pure reducers for the TUI. No imports from `ink/` or `react`. Every
exported function takes `(state, event)` and returns a new state, or
takes pre-state plus inputs and returns derived display state. The ink
components are thin shells that pipe `useInput` events into these
reducers.

- [`src/flows/project-launch-flow.ts`](src/flows/project-launch-flow.ts)
  — by far the largest flow. Owns the four-column selector state
  (presets, plugins, skills, MCPs), focus traversal, sort modes,
  per-preset draft state (so flipping between presets in the column
  doesn't lose unsaved changes), the "enable-unlock" confirmation when
  a user tries to enable an item that is currently disabled by a
  higher-precedence settings file, and the pending `DisableRemovalMark`
  list used by `applyDisableRemovals`.
- [`src/flows/run-flow.ts`](src/flows/run-flow.ts) — orchestrates the
  classic `ccsp` interactive run (pick base preset → optionally pick
  launch preset → spawn).
- [`src/flows/manage-flow.ts`](src/flows/manage-flow.ts) — reducer for
  the global preset manager (`ccsp manage`).
- [`src/flows/create-flow.ts`](src/flows/create-flow.ts) — reducer for
  the `ccsp create` settings-source picker.
- [`src/flows/settings-select-flow.ts`](src/flows/settings-select-flow.ts)
  — reducer for the small "pick a base preset" screen used by the run
  flow.

**Architecture Invariant:** Reducers in this folder are synchronous and
deterministic. Any async I/O is performed by the calling ink component
or by `cli.ts` before/after the reducer runs. This is what makes
[`tests/flows/`](tests/flows/) feasible without mocking React.

**Architecture Invariant:** `project-launch-flow` carries
`draftsByPreset` separately from `statesByPreset`. The latter is the
saved-on-disk state per preset; the former is the in-memory edit buffer.
The UI shows the draft, but only the explicit Save/Save-as actions
promote a draft to disk. Reason: users routinely flip between launch
presets while comparing toggles, and losing edits on focus change would
be infuriating.

### `src/ink/`

React components rendered with `ink`. Each `*-app.tsx` is a top-level
screen; `components/` holds reusable widgets.

- [`src/ink/create-app.tsx`](src/ink/create-app.tsx) — pick a settings
  source to import as a new base preset.
- [`src/ink/manage-app.tsx`](src/ink/manage-app.tsx) — list / rename /
  delete global presets, or jump into a launch flow with one selected.
- [`src/ink/settings-select-app.tsx`](src/ink/settings-select-app.tsx) —
  pick a base preset, with the last-used one preselected.
- [`src/ink/project-launch-app.tsx`](src/ink/project-launch-app.tsx) —
  the four-column launch screen. Hosts `ConfirmEnableUnlock` for the
  disable-lock prompt and a `TextInput` for the "save as" affordance.
- [`src/ink/project-manage-app.tsx`](src/ink/project-manage-app.tsx) —
  variant of `project-launch-app` for `ccsp manage --project`, with
  rename / delete / save in place.
- [`src/ink/components/toggle-column.tsx`](src/ink/components/toggle-column.tsx),
  [`src/ink/components/text-input.tsx`](src/ink/components/text-input.tsx),
  [`src/ink/components/use-text-input.ts`](src/ink/components/use-text-input.ts),
  [`src/ink/components/use-text-input-state.ts`](src/ink/components/use-text-input-state.ts),
  [`src/ink/components/json-tree-view.tsx`](src/ink/components/json-tree-view.tsx),
  [`src/ink/components/two-column-settings-view.tsx`](src/ink/components/two-column-settings-view.tsx),
  [`src/ink/components/confirm-enable-unlock.tsx`](src/ink/components/confirm-enable-unlock.tsx),
  [`src/ink/components/truncate-text.tsx`](src/ink/components/truncate-text.tsx)
  — reusable building blocks. The text-input pair implements ink's
  missing cursor-aware editor as a typed reducer so it can be unit
  tested.
- [`src/ink/components/resize-context.tsx`](src/ink/components/resize-context.tsx),
  [`src/ink/components/global-shortcut-handler.tsx`](src/ink/components/global-shortcut-handler.tsx)
  — terminal-resize plumbing. `cli.ts` listens for `stdout.resize`,
  bumps a version counter, and re-renders the tree wrapped in
  `InkResizeProvider` so deeply nested components can read the latest
  `process.stdout.columns` without prop drilling.

**Architecture Invariant:** Ink components never own preset I/O. They
receive plain data via props and call `onSubmit` / `onCreateSubmit` /
`onSaveSubmit` callbacks that the surrounding `renderXxxApp` function
in `cli.ts` translates into service calls. This keeps the React layer
free of `await fs.…` and lets `react-test-renderer` drive the components
in tests with synthetic props.

### `src/cli.ts`

The entry point and the top-level orchestrator. Notable shapes:

- [`createProgram`](src/cli.ts) — declares the two explicit subcommands
  (`create`, `manage`) via `commander`.
- [`main`](src/cli.ts) — the bespoke argv router that handles the
  implicit modes (`ccsp` with no args → run flow,
  `ccsp --continue|-c`, `ccsp --resume <uuid>`, `ccsp claude …`) before
  falling back to `createProgram().parseAsync`.
- [`runInteractive`](src/cli.ts), [`launchWithSelectedSettings`](src/cli.ts),
  [`launchClaudeWithFinalizedSettings`](src/cli.ts) — the three-step
  pipeline: base-preset pick → launch-preset pick → finalize + spawn.
- [`buildBannerLines`](src/cli.ts) — terminal-width-adaptive `figlet`
  banner, with progressive fallbacks (`ANSI Shadow` → `Small` → text)
  so narrow terminals still get a logo.
- [`waitForInkAppExit`](src/cli.ts) and [`createGlobalShortcutHandler`](src/cli.ts)
  — the resize/`ctrl-l` redraw plumbing each ink screen wires into.
- [`runResume`](src/cli.ts), [`runContinue`](src/cli.ts),
  [`launchFromBinding`](src/cli.ts) — re-launch using a stored
  `SessionBinding`, walking the newest-exited session first and pruning
  stale bindings whose Claude jsonl no longer exists.

**Architecture Invariant:** `cli.ts` is the only file that wires
services together. Services do not import each other except for narrow
shared dependencies (`project-store-service` is the obvious one).
Reason: this gives a single, grep-able file from which to understand
what runs when the user types `ccsp`.

**Architecture Invariant:** Implicit argv modes are detected *before*
`commander` parses, because `commander` would otherwise treat
`ccsp --resume <uuid>` as an unknown flag. The router in `main` does the
detection by hand and only falls through to `commander` for the explicit
subcommands.

## Cross-Cutting Concerns

### Ownership and Precedence of Settings Keys

Three settings keys are jointly owned by `ccsp` and Claude Code's own
settings files: `enabledPlugins`, `skillOverrides`, `deniedMcpServers`.
Both `plugin-service`, `skill-service`, and `disable-lock-service`
implement the same precedence (`user < project < project-local`,
`preset` treated as a separate origin), and the resolution is used in
two directions: forward, to derive the *effective* state shown in the
TUI, and backward, to figure out which file to mutate when the user
flips a toggle.

**Architecture Invariant:** The same precedence table is duplicated
across `plugin-service.ts`, `skill-service.ts`, and
`disable-lock-service.ts` rather than extracted into a shared helper.
Reason: each kind has slightly different ownership semantics (skills
use a string-enum override, MCPs a typed entry array, plugins a boolean
record), and a premature abstraction would obscure them. The duplication
is intentional.

### Statusline Injection as the Only Side Effect on Claude

`ccsp` writes exactly one settings file per launch (the temp file under
`<cwd>/.claude/.ccsp/tmp/`) and never edits the user's
`~/.claude/settings.json`. Everything Claude observes — including the
CCSP marker on the statusline — comes through the finalized temp file
plus the wrapper scripts it points at.

**Architecture Invariant:** `ccsp` does not mutate any file under
`~/.claude/` or `<cwd>/.claude/settings*.json`, except for the
opt-in `applyDisableRemovals` path triggered by the user confirming
"re-enable" in the TUI. Reason: those files are the user's source of
truth; `ccsp` is a *layer over* them, not an editor of them.

### Session Continuity

`--continue` and `--resume <uuid>` are first-class: each successful
launch writes a `SessionBinding` (preset names + toggle state +
resolved settings) keyed by Claude's session id, and later `ccsp
--resume` re-runs the same composition without going through the TUI.
Session ids are discovered by diffing `~/.claude/projects/<cwd>/*.jsonl`
across the spawn rather than injected (Claude ignores `--session-id` in
interactive mode).

**Architecture Invariant:** A `SessionBinding` is recorded both pre-spawn
(if the caller pinned `--session-id`) and post-spawn (otherwise). Stale
bindings — whose jsonl no longer exists — are pruned lazily by
`resolveLiveBinding` whenever `--continue` walks the list. Reason: the
binding store must survive `kill -9` of either `ccsp` or `claude`
without leaking entries indefinitely.

### Build-Time vs. Runtime

The package is plain TypeScript compiled with `tsc` (see
[`tsconfig.build.json`](tsconfig.build.json)). The published artifact is
`dist/cli.js` plus its emitted siblings; everything in `src/` is the
authoring tree. `pnpm run generate-version` regenerates
[`src/version.ts`](src/version.ts) from `package.json` so the compiled
binary embeds the version string at build time without a runtime
`package.json` read.

**Architecture Invariant:** `dist/` is the only thing shipped to npm
(see `"files": ["dist", "package.json", "README.md", "LICENSE"]` in
[`package.json`](package.json)). Test files, fixtures, and the
TypeScript source are not published.

### Testing Strategy

Tests mirror `src/` one-to-one under [`tests/`](tests/). Three rough
tiers:

1. **Unit:** every `core/` and `services/` file has a matching
   `tests/{core,services}/*.test.ts` exercising it against either pure
   inputs or temp directories.
2. **Reducer:** [`tests/flows/*.test.ts`](tests/flows/) drive the pure
   flow reducers through synthesized event sequences — no React, no
   ink rendering.
3. **Component / CLI:** [`tests/ink/*.interaction.test.tsx`](tests/ink/)
   uses `react-test-renderer` to drive ink components; the top-level
   [`tests/cli.test.ts`](tests/cli.test.ts) and friends use a TTY
   helper ([`tests/helpers/tty.ts`](tests/helpers/tty.ts), backed by a
   Python `pty` runner [`tests/helpers/tty_runner.py`](tests/helpers/tty_runner.py))
   to exercise the compiled CLI in a real PTY.

**Architecture Invariant:** Flow reducers are tested **without** mounting
ink. The split between `flows/` (pure) and `ink/` (rendering) exists
specifically so test files in `tests/flows/` can do
`reduce(state, event)` directly. If you find yourself rendering an ink
component just to test a state transition, the logic belongs in
`flows/`.

### Error Handling

`CliError` (from [`src/core/errors.ts`](src/core/errors.ts)) is the only
domain-specific error type. It carries an optional `exitCode` so a
non-zero Claude exit propagates verbatim. The top-level `main` in
`cli.ts` catches `CliError` and prints `Error: <message>`; anything else
re-throws so unexpected bugs produce stack traces.

**Architecture Invariant:** Services throw `CliError` only for conditions
the user can act on (preset not found, name collision, Claude binary
missing). Internal invariant violations are left as plain `Error` so
they surface as crashes during development instead of being swallowed.

### Cross-Platform Footnotes

The statusline wrapper is a bash script (`#!/usr/bin/env bash`,
`set -euo pipefail`). On Windows the wrapper path is still emitted and
ccsp relies on Git Bash / WSL providing `bash`; the `claude-login`
keychain check is gated on `process.platform === 'darwin'`.

**Architecture Invariant:** `ccsp` makes no attempt to support Windows
PowerShell as the statusline interpreter. Reason: Claude Code on Windows
already expects bash-compatible statusline commands.

## Out of Scope

- **The shape of Claude Code's own settings schema** — `ccsp` treats
  unknown keys as opaque payloads. The authoritative description lives
  in the Claude Code documentation, mirrored under
  [`docs/references/claude-code-key-docs-directory.md`](docs/references/claude-code-key-docs-directory.md).
- **Distribution and release** — see
  [`.github/workflows/release.yml`](.github/workflows/release.yml) and
  [`scripts/brew-publish.sh`](scripts/brew-publish.sh) for the npm +
  Homebrew tap pipeline.
- **Product motivation and CLI usage** — see [`README.md`](README.md)
  and [`README.zh-hans.md`](README.zh-hans.md).
- **Per-feature design notes** — the design specs that drove individual
  features live under [`docs/superpowers/plans/`](docs/superpowers/plans/)
  and [`docs/superpowers/specs/`](docs/superpowers/specs/). Those are
  history, not architecture.

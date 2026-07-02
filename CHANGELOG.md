# Changelog

## 1.2.6 (2026-07-02)

### Features
* **launch**: persist all modified presets before launching

## 1.2.5 (2026-07-02)

### Features
* **update**: add background update availability check and notices

## 1.2.4 (2026-07-01)

### Bug Fixes
* **statusline**: kill child process group on cancel to avoid orphaned underlying commands
* **update**: make brew self-update noninteractive

## 1.2.3 (2026-07-01)

### Features
* **config**: add banner visibility toggle

## 1.2.2 (2026-06-30)

### Bug Fixes
* **ink**: improve text input interactions

## 1.2.1 (2026-06-30)

### Features
* **update**: add self-update command

## 1.2.0 (2026-06-26)

### Performance Improvements
* **launch**: parallelize and cache settings discovery for faster launches

## 1.1.5 (2026-06-25)

### Features
* **ui**: add bordered title box with aligned column heights

## 1.1.4 (2026-06-21)

### Code Refactoring
* extract project launch browser controller into reusable hook

## 1.1.3 (2026-06-18)

### Code Refactoring
* update testing and preset management functionality

## 1.1.2 (2026-06-12)

### Features
* implement graceful termination handling for child processes

## 1.1.1 (2026-06-07)

### Features
* enhance settings and project launch flows with sorting and navigation improvements

## 1.1.0 (2026-06-05)

### Features
* add headless direct run mode with --global-preset/--project-preset CLI flags

## 1.0.10 (2026-06-04)

### Bug Fixes
* remove postinstall that breaks published installs

### Code Refactoring
* add structured error codes and async inline validation to create flow

## 1.0.9 (2026-06-01)

### Features
* add run mode config option to control preset launch stages

## 1.0.8 (2026-05-29)

### Features
* add ccsp config command with global preferences
* add YAML preview format for settings and previewFormat config option

### Documentation
* add ARCHITECTURE.md and Chinese translation
* move architecture docs to docs/ directory

## 1.0.7 (2026-05-28)

### Features
* add session binding and --continue/--resume support

## 1.0.6 (2026-05-27)

### Features
* add Claude Official preset option when logged in

## 1.0.5 (2026-05-23)

### Features
* clean up temp launch artifacts after Claude exits

## 1.0.4 (2026-05-22)

### Features
* add managed settings and statusline injection

### Code Refactoring
* **cli**: remove unused functions and apply formatting

## 1.0.3 (2026-05-22)

### Code Refactoring
* generate version from package.json instead of hardcoding

## 1.0.2 (2026-05-22)

### Features
* add disable-lock service and MCP availability sync with plugins

## 1.0.1 (2026-05-21)

### Features
* resolve symlinks in direct execution check and add homebrew publish script

## 1.0.0 (2026-05-21)

### Features
* add CLI banner and preserve plugin ownership on preset overrides
* add core settings primitives
* add create and run terminal flows
* add interactive text editing, Ctrl+L refresh, back navigation, and preset case preservation
* add open folder keybinding in preset manager
* add preset management ui
* add project launch preset schemas
* add project launch preset service
* add project launch selection flow
* add settings selection UI
* add shared terminal components
* add sort mode, column navigation and source badges to TUI
* apply launch toggle overrides
* discover claude skills
* discover project MCP server states
* display derived presets as tree under base preset
* enhance plugin and skill management with new resolution logic
* enhance project launch flow with toggle item management and sorting
* finalize settings from launch toggles
* group derived presets under parent and preserve prefix on rename
* implement pruning of old temporary settings files in launch preset service
* initialize project launch preset storage
* launch claude with selected settings
* loop manage flow with async rename and add TTY test helpers
* loop manage UI after rename and delete operations
* make banner and ink layout terminal-adaptive
* manage project launch presets
* model preset management flow
* model preset run flow
* remember last used global preset
* resolve settings sources and plugins
* route manage launch through project launch selection and colorize JSON tree
* run two-stage project launch flow
* show banner on all subcommands and polish derived preset display
* split settings and project manage modes
* store and sync settings presets
* update cli banner wordmark

### Bug Fixes
* add spacing before preset selection UI
* center ccsp banner with subtitle
* discover skills from symlinked directories
* ensure case preservation in launch preset creation and renaming
* enter project manage directly
* improve error handling in spawnClaude function
* keep manage rename prompt open on conflicts
* keep preset drafts isolated in run mode
* only show derived-preset hint for base presets with active drafts
* reject empty preset name and accept Enter in save confirmation
* resolve preset-specific plugin and skill states
* skip global presets in project manage
* streamline preset management save and rename flows
* use hyphenated CC-Settings-Preset in banner subtitle

### Code Refactoring
* skip settings select when no presets exist
* use dynamic column widths based on terminal size
* write store-local gitignore instead of modifying project gitignore

### Documentation
* add ccsp design spec
* describe two-stage launch presets

### Other Changes
* merge: resolve worktree preset management conflicts
* merge: resolve centered banner subtitle layout
* merge branch 'worktree-cli-logo-wordmark'
* merge: integrate project manage preset filtering
* merge branch 'worktree-ccsp-implementation'
* first commit

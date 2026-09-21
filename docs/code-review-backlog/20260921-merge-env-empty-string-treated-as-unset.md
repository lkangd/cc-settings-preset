---
id: merge-env-empty-string-treated-as-unset
status: open
severity: nit
found: 2026-09-21
source: /code-review, round 1
target: model-aware effort quick setting (working-tree change adding the model row, per-model effort and the unconditional --effort launch arg)
---

# mergeEnv treats an explicitly empty env value as unset, so a nearer scope cannot blank a variable

## Problem

`src/flows/settings-select-flow.ts`, in `mergeEnv`:

```ts
if (merged[key] === undefined && typeof value === 'string' && value.trim().length > 0) {
  merged[key] = value
}
```

A nearer scope that writes `"ANTHROPIC_BASE_URL": ""` (or a whitespace-only value) is skipped,
and a farther scope's value wins the variable instead — which contradicts the function's own
comment, "the scope chain merged variable by variable, the nearest scope that sets one winning".

Everything the quick settings column derives from env rides on this: official-vs-gateway mode
(`isOfficialApi`), whether the model and effort rows are read-only (`spec.envVar`), and the
model ring's members.

## Why deferred

The code-side inconsistency is real, but the user-visible consequence depends on Claude Code
treating an empty-string variable as *set* — unverified, and not something this repo can
settle. The trigger also needs an unusual config: a nearer scope deliberately blanking a
variable that a farther scope sets. No user has hit it.

## Suggested fix approach

Separate "the key exists" from "the value is non-empty": let any string value (including `""`)
claim the key so a nearer scope can blank it, and keep only `undefined` falling through to the
farther scope. Then audit the three consumers for what an empty value should mean:

- `isOfficialApi`: `new URL('')` throws, which currently means *gateway* — an empty base URL
  almost certainly should mean the official API, i.e. treat `''` like an absent URL.
- `spec.envVar` (read-only rows): an empty `ANTHROPIC_MODEL` / `CLAUDE_CODE_EFFORT_LEVEL`
  should probably not lock the row, since it names no model and no level.
- `GATEWAY_MODEL_ENV_VARS`: an empty redirect target must not enter the ring.

Done looks like: a test in `tests/flows/settings-select-flow.test.ts` pinning what a blanked
variable does to each of the three, and a comment saying which reading of Claude Code's env
handling it follows.

## Recommended tools

- First settle the premise: `~/.claude-code-docs/claude-docs-helper.sh env-vars` — does Claude
  Code honor an empty-string variable as set?
- `codegraph explore "mergeEnv isOfficialApi resolveModelCandidates resolveQuickSettingValue"`
  for the consumers and their call paths.
- `npx vitest run tests/flows/settings-select-flow.test.ts` to iterate.

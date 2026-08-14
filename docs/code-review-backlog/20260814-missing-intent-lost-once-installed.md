---
id: missing-intent-lost-once-installed
status: open
severity: minor
found: 2026-08-14
source: /code-review, round 1 (correctness angle)
target: portable launch preset templates feature, working tree vs HEAD d554f42 (40 files, +3032/-164)
---

# missing 条目补装之后，预设里的原始意图会在下次保存时被抹掉

## Problem

missing 条目只在「探测不到」时才被原样保留；一旦对应的 plugin / skill 真的装上，
它就变成普通的已探测条目，而普通分支只记录「关掉的」：

- `src/services/plugin-service.ts:83-87`
  ```ts
  if (state.source === 'missing') { enabledPlugins[state.name] = state.enabled; continue }
  if (!state.enabled) enabledPlugins[state.name] = false
  ```
  预设里的 `ghost: true` 在 `ghost` 装上后变成 `source: 'user' | 'project' | …`，
  下次保存时该键被整条删除。

- `src/services/skill-service.ts:203-208` 同构，但后果更重：普通分支只会写 `'off'`，
  而 `skillOverrides` 的取值域是四个（`on` / `off` / `name-only` / `user-invocable-only`）。
  `applySkillOverrides`（`:177-181`）把 override 折算成 `enabled: value !== 'off'` 就丢弃了
  `overrideValue`，因此一个 `name-only` 的 skill 装上之后，随手一次保存就被降级成「无 override」。

这与 spec 的 User Story 23「作为后来补装了插件的用户，我想让之前导入的预设自动开始包含它」
方向相反：装上反而丢意图。

## Why deferred

**当前触发不了**，属于潜伏问题：

代码里唯一会往 `enabledPlugins` / `skillOverrides` 写值的地方就是上面两个函数，
它们对非 missing 条目只写 `false` / `'off'`，对 missing 条目原样回写。所以取值域
是自封闭的 —— 预设文件里实际只可能出现 `false` 和 `'off'`。`plugin: true` 或
`skill: 'name-only'` 只能来自手工编辑预设文件，或从一个被手工编辑过的项目导入。

而真实路径（`X: false` → 装上 X → 仍写回 `X: false`）是能正确往返的，US 23 在实际场景中成立。

修它需要给状态条目引入「预设声明的原始值」这一维度，并决定它与用户当场 toggle 的优先级，
是一次语义扩展而非 bug 修复，不适合在审查轮里顺手做。

## Suggested fix approach

若将来预设的取值域真的放开（例如支持从 Claude settings 直接导入 `name-only`），
最小可行方向：

- 给 `SkillState` 增加 `presetOverrideValue?: SkillOverrideValue`，由
  `applySkillOverrides` 在命中 override 时一并带上（而不是只折算 `enabled`）。
- `skillStatesToOverrides` 的普通分支改为：用户没动过 → 回写 `presetOverrideValue`；
  用户动过 → 按 `enabled` 写 `'off'` 或省略。「用户动过」需要 flow 层提供信号，
  参考 `getChangedProjectLaunchPresets` 的 dirty 判定。
- plugin 侧同构但简单（布尔），加 `presetEnabled?: boolean` 即可。

**Done 的标准**：`tests/services/skill-service.test.ts` 有一条用例断言
「预设含 `foo: 'name-only'` → foo 被探测到 → 未经用户修改的保存仍写回 `'name-only'`」；
`tests/services/plugin-service.test.ts` 有对应的 `true` 版本；`npm run check` 全绿。

## Recommended tools

```bash
grep -rn "source === 'missing'" src/services/
grep -n "applySkillOverrides\|applyPluginOverrides\|skillStatesToOverrides\|pluginStatesToEnabledPlugins" src/services/*.ts src/cli.ts
npx vitest run tests/services/skill-service.test.ts tests/services/plugin-service.test.ts tests/flows/project-launch-flow.test.ts
```

先跑一遍「取值域是否仍自封闭」的确认：`grep -rn "enabledPlugins\[" src/` 与
`grep -rn "overrides\[" src/services/skill-service.ts` —— 只要写入端仍只产出
`false` / `'off'`，这条就还没到需要修的时候。

## Resolution (2026-08-14) — 复核后维持 open

按本条自己给出的判据重跑了确认，**取值域仍然自封闭，所以还没到需要修的时候**：

```
grep -rn "enabledPlugins\[" src/          → plugin-service.ts:84 / :87（missing 原样回写 / 普通分支只写 false）
                                             disable-lock-service.ts:120-123（只读与 delete，不产出新值）
grep -rn "overrides\[" src/services/skill-service.ts
                                          → :180（读）、:206（missing 原样回写）、:209（普通分支只写 'off'）
```

写入端仍然只产出 `false` / `'off'`，`plugin: true` 或 `skill: 'name-only'` 只能来自手工编辑
预设文件、或从一个被手工编辑过的项目导入。真实路径（`X: false` → 装上 X → 仍写回 `X: false`）
能正确往返，US 23 在实际场景中成立。

修它需要给状态条目引入"预设声明的原始值"这一维度，并决定它与用户当场 toggle 的优先级 ——
是一次语义扩展。触发条件仍是本条 `Suggested fix approach` 写的那个：预设取值域真的放开
（例如支持从 Claude settings 直接导入 `name-only`）。

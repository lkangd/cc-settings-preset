---
id: import-panel-single-candidate-only
status: wontfix
severity: major
found: 2026-08-14
source: /code-review, round 1 (spec angle)
target: portable launch preset templates feature, working tree vs HEAD d554f42 (40 files, +3032/-164)
---

# 导入面板只能一次导入一个，User Story 13 的批量汇报未落地

## Problem

spec `docs/superpowers/specs/2026-08-13-portable-launch-preset-templates-design.md` 的
User Story 13：

> 作为一次导入多个预设的用户，当其中某个失败时，我想让其余的照常完成并看到一份
> 「成功几个、跳过哪个、为什么」的汇报，这样重试一次就能补齐。

以及「失败处理」一节：

> 导入与 worktree seed 均为**尽力而为**：逐个复制、失败跳过，结束时汇报
> 「导入 2 / 3，跳过：web-dev（原因）」。

当前实现只覆盖了 worktree seed 这一半：`copyPresetsInto` + `formatSeedReport`
（`src/services/preset-import-service.ts:85` / `:110`）确实逐个复制并汇报。

导入面板一侧没有：`ImportPanelProps.onImport` 的签名是
`(id: string, targetName: string, overwrite: boolean)`（`src/ink/components/import-panel.tsx:26`），
回车只导入当前 active 候选（`:138`），成功后立刻 `onClose(true)` 退出面板。没有多选、
没有批量提交、没有汇总行。

## Why deferred

spec 内部有张力，需要人拍板。同一份文档的「交互」一节（第 90 行）把面板描述为
**单列表分组 + 选一个**：

> 「最近项目」组把各项目的预设**平铺**为两段式标签……不做展开或两阶段选择

而 User Story 13 谈的是「一次导入多个」。两种读法：

- **A**：US 13 描述的就是 worktree seed（它天然一次复制多个），面板保持单选 —— 那么
  当前实现已完整，此条应关为 wontfix。
- **B**：面板也该支持多选（如空格勾选 + 回车批量提交），US 13 是独立需求 —— 那么
  需要新增多选状态、批量结果面板和汇总行。

## Suggested fix approach

先定 A 还是 B。若选 B：

- `import-panel.tsx`：新增 `selected: Set<string>` 状态，空格切换，回车提交
  `selected.size > 0 ? [...selected] : [active.id]`；`onImport` 签名改为接受 id 数组。
- `src/cli.ts` 的 `onImportSubmit`：改为循环调用，收集 `{name, ok, error}`，复用
  `preset-import-service.ts` 里已有的 `SeedReport` 形状与 `formatSeedReport` 文案格式。
- 冲突（`launch_preset_already_exists`）在批量场景下的语义要单独定：逐个弹窗，还是
  整批跳过并计入 skipped。建议后者，否则一次批量导入可能弹出 N 个窗口。
- 面板成功后不再直接 `onClose(true)`，先展示汇总行，按任意键再关闭。

**Done 的标准**：`tests/ink/import-panel.interaction.test.tsx` 有一条用例断言
「3 个候选、中间那个失败 → 另外 2 个仍落盘 + 面板显示成功 2 / 3 与跳过原因」；
`npm run check` 全绿。

## Recommended tools

```bash
grep -n "onImport\|runImport\|copyPresetsInto\|formatSeedReport" src/ink/components/import-panel.tsx src/cli.ts src/services/preset-import-service.ts
npx vitest run tests/ink/import-panel.interaction.test.tsx tests/services/preset-import-service.test.ts
```

`copyPresetsInto` / `formatSeedReport` 已经是「尽力而为 + 汇报」的现成实现，B 方向
应当复用它们而不是再写一份。

## Resolution (2026-08-14) — wontfix

**采纳读法 A。** US 13 描述的就是 worktree 继承：它天然一次复制主仓库的全部预设，
而 `copyPresetsInto` + `formatSeedReport`（"逐个复制、失败跳过、结束汇报"）正是它的完整实现，
本轮还给它补了 `tests/services/worktree-seed-service.test.ts` 里的
「keeps going past a preset it cannot copy and says which」一条来钉住这个语义。

导入面板保持单选。理由是同一份 spec 的「交互」一节（第 90 行）明确说了面板
「不做展开或两阶段选择」，且候选池实测仅约 9 个项目 / 14 个预设 —— 加多选状态、批量结果面板
和汇总行，是为一个没有证据的用法付三份复杂度。

已在 spec 里补了澄清，让这处张力不再需要下一个人重新判一遍：

- User Story 13 后面加了括注，点明"一次导入多个"指的是 worktree 继承；
- 「失败处理」一节点明逐个复制 + 汇报这套语义只有 worktree seed 用得上，面板一次只导入一个、
  失败就地显示在面板里。

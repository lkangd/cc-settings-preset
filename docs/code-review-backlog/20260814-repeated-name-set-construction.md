---
id: repeated-name-set-construction
status: partially-resolved
severity: nit
found: 2026-08-14
source: /code-review, round 1 (efficiency + reuse angles)
target: portable launch preset templates feature, working tree vs HEAD d554f42 (40 files, +3032/-164)
---

# 每次合并 missing 都重建一遍相同的「已探测名字」集合

## Problem

同一个 `Set<string>` 在几个热点里被反复构造。四条 nit 级意见收在一起：

1. `src/cli.ts:584` —— `buildProjectLaunchInput` 在**每个项目预设的循环内**调用
   `mergeMissingPluginStates` / `mergeMissingSkillStates` / `mergeMissingMcpStates`，
   而三个函数各自 `new Set(states.map(s => s.name))`。同一项目的探测结果是固定的，
   于是产生 O(预设数 × 探测条目数) 的重复遍历与分配。

2. `src/services/missing-toggle-service.ts:16` —— `collectMissingToggleNames` 对
   **每个导入候选**分别重建三类 detected 名称集合。候选越多，面板打开前重复得越多。

3. `src/services/preset-import-service.ts:152` —— 每个最近项目先 `isDirectory()`（一次
   `stat`），随后 `readProjectPresets()` 又会打开该项目的索引；后者的 catch 本就把
   「不存在 / 不是目录 / 没索引」都归为空候选。

4. `src/services/launch-preset-store.ts:148` —— `writePresetSettings` / `renamePreset`
   先 `await readIndex()`，随后 `requireMeta()` 内部再 `await readIndex()` 一次。
   （这条与
   [`20260814-launch-preset-store-small-gaps.md`](20260814-launch-preset-store-small-gaps.md)
   第 3 节是同一处，在那边一并处理。）

## Why deferred

全是常数级浪费，没有用户可感知的延迟。spec 实测：候选池约 9 个项目 / 14 个预设，
全量扫描约 20ms。规模没变之前，改这些是负收益。

spec 的 Further Notes 已经标了触发重新评估的门槛：

> 若未来候选池显著增长（比如数百项目），底部概览行的即时计算与同步全量扫描需要重新评估。

**3 明确不建议改**：`isDirectory()` 是 spec 候选过滤三条规则里「剔除已不存在的目录」的
显式落点，删掉它会把这条规则变成 `readProjectPresets` catch 块里的隐式副作用。
省一次 `stat` 换掉一条可读的规则，不划算。除非同时做
[`20260814-import-candidate-path-aliasing.md`](20260814-import-candidate-path-aliasing.md)
——那条本来就要引入 `realpath`，成功即证明存在，两次调用可以合成一次。

## Suggested fix approach

只在候选池规模真的变大时做，届时：

- 让三个 `mergeMissing*` 接受一个可选的预构造 `known: Set<string>` 参数；
  `buildProjectLaunchInput` 在循环外算一次三个集合传进去。
- `collectMissingToggleNames` 同理，改为接受已建好的集合，由
  `renderProjectManageApp` 在扫描开始时构造一次。
- 这与
  [`20260813-missing-state-merge-skeleton.md`](20260813-missing-state-merge-skeleton.md)
  的方向 A（抽公共尾巴）天然合流 —— 一起做，别分两次。

**Done 的标准**：`tests/services/{plugin,skill,mcp}-service.test.ts` 与
`tests/services/missing-toggle-service.test.ts` 一字不改仍通过（它们断言的是外部行为）；
`npm run check` 全绿。

## Recommended tools

```bash
grep -n "new Set(" src/services/plugin-service.ts src/services/skill-service.ts src/services/mcp-service.ts src/services/missing-toggle-service.ts
grep -n "mergeMissing\|collectMissingToggleNames" src/cli.ts
npx vitest run tests/services/plugin-service.test.ts tests/services/skill-service.test.ts \
  tests/services/mcp-service.test.ts tests/services/missing-toggle-service.test.ts
```

## Resolution (2026-08-14)

分三种处置：

- **1、2（结构层面）已合并处理**：三处 `new Set(states.map(...))` 的**定义**收进了
  [`20260813-missing-state-merge-skeleton.md`](20260813-missing-state-merge-skeleton.md)
  新增的 `appendMissing`，不再各写一遍。
- **1、2（性能层面）维持 deferred**：仍是每个预设 / 每个候选构造一次集合。本条自己给出的门槛
  （「候选池显著增长，比如数百项目」）没有触发，加一个「必须与 states 保持一致」的可选
  `known` 参数是纯风险、零收益。规模真的变大时再加，那时 `appendMissing` 的签名正好是唯一改点。
- **3 明确不改（wontfix）**：`isDirectory()` 是 spec 候选过滤规则「剔除已不存在的目录」的显式落点。
  [`20260814-import-candidate-path-aliasing.md`](20260814-import-candidate-path-aliasing.md)
  这轮虽然引入了 `realpath`，但两者职责不同 —— `canonicalPath` 只负责「同一个目录的两个名字」，
  `isDirectory` 负责「这个目录还在不在」。合成一次调用能省一次 `stat`，代价是把一条可读的规则
  变成 `realpath` 的隐式副作用，不划算。
- **4 已随
  [`20260814-launch-preset-store-small-gaps.md`](20260814-launch-preset-store-small-gaps.md)
  第 3 节修掉**：`requireMeta` 增加可选 `index` 参数，两个调用点传入自己已读到的那份。

---
id: launch-preset-store-small-gaps
status: partially-resolved
severity: minor
found: 2026-08-14
source: /code-review, round 1 (removed-behavior + correctness + simplification + efficiency angles)
target: portable launch preset templates feature, working tree vs HEAD d554f42 (40 files, +3032/-164)
---

# 共享 store 抽取后遗留的三个小口子

一次性收在同一条目里：三处都在 `src/services/launch-preset-store.ts` 与它上面那层
`src/services/launch-preset-service.ts`，改动时会互相碰到。

## Problem

### 1. 同名重命名不再先于 last-used 读取而短路（removed-behavior）

旧 `renamePreset` 在读 last-used **之前**短路同名情况：

```ts
if (newName === name) return { ...existing, updatedAt: nowIso() }
...
const lastUsed = await readLastUsed()
```

新版（`src/services/launch-preset-service.ts:369`）把 `readLastUsed()` 提到
`store.renamePreset()` **之前**（这是刻意的 —— 见该处注释，原先在写索引之后读，指针
从来没迁移过）。副作用是 store 内部第 169 行的同名短路发生得太晚：

`readLastUsed` 会 `lastUsedLaunchPresetSchema.parse(raw)`，畸形的 `last-used.json`
会直接抛。于是「把预设重命名为它规范化后的同名值」这个本该与 last-used 无关的 no-op，
现在会在 last-used 损坏时报错。

（注意：不同名的重命名在新旧两版下都会抛，只是新版抛在改名之前 —— 那反而更好。）

### 2. 文件操作成功、索引写入失败 → 悬空条目（correctness）

`renamePreset` 先 `fs.rename(...)` 再 `writeIndex(index)`（`launch-preset-store.ts:186` 附近），
`deletePreset` 先 `fs.unlink(...)` 再写索引。中间失败（磁盘满、权限变更）会留下
指向已移动 / 已删除文件的索引条目。

### 3. `requireMeta` 重复 await 已缓存的索引（efficiency / simplification）

`writePresetSettings` 与 `renamePreset` 都先 `await readIndex()` 拿到 `index`，
随后 `await requireMeta(nameInput)` 内部又 `await readIndex()` 一次。命中
`indexPromise` 缓存不会重复读盘，但每次保存 / 重命名仍多一次异步跳转。

同一角度还指出 store 的公开返回值暴露了 `invalidateIndex` / `getPresetPath` / `readMeta`
这些内部 plumbing，而 `readLastUsed` 其实可以只用现成的 `resolveName`。

## Why deferred

1 的触发需要 `last-used.json` 已经损坏，且用户恰好在做同名重命名 —— 极窄；而两种修法
（service 层恢复提前返回 / 把 `readLastUsed()` 改成 `.catch(() => undefined)`）都会动
错误语义，值得单独想清楚而不是顺手改。

2 是 spec 明确排除的范围：

> 不做事务回滚。这是纯文件复制、天然幂等，用户重试即可；而回滚本身也会失败。

所以这里要的不是回滚，而是「悬空条目不要毒害整个列表」—— 本轮已经修了那一半
（`listPresetsWithSettings` 改为逐项容错，一个坏条目不再拖垮其余）。剩下的自愈
（启动时清理悬空索引条目）是独立的小特性。

3 是纯清理，没有用户可见影响。

## Suggested fix approach

- **1**：倾向把 `readLastUsed()` 改成 `readLastUsed().catch(() => undefined)`。
  理由：重命名是用户的明确意图，一个坏掉的 last-used 指针不该阻塞它；代价是坏指针
  不会被迁移，但它本来就已经指不到东西了。改完在
  `tests/services/launch-preset-service.test.ts` 补一条「last-used.json 是畸形 JSON 时
  重命名仍成功」。
- **2**：不做回滚。改为在 `readIndex` 之后加一次惰性一致性检查，或者干脆只在
  `deletePreset` / `renamePreset` 的 catch 里把索引写回原状。也可以什么都不做 ——
  逐项容错已经把最坏后果从「整个列表消失」降到「少一行」。
- **3**：给 `requireMeta` 加一个可选的 `index` 参数，两个调用点传入自己已读到的那份；
  把 `invalidateIndex` / `getPresetPath` / `readMeta` 收回闭包，只导出真正被外部用到的
  API（先 `grep -rn "store\.\(readMeta\|getPresetPath\|invalidateIndex\)" src/` 确认调用点）。

**Done 的标准**：三项各自的用例通过；`npm run check` 全绿；
`tests/services/launch-preset-service.test.ts`（27 个既有用例）一字不改仍通过。

## Recommended tools

```bash
grep -n "requireMeta\|readIndex\|invalidateIndex\|getPresetPath" src/services/launch-preset-store.ts
grep -rn "store\." src/services/launch-preset-service.ts src/services/launch-template-service.ts
npx vitest run tests/services/launch-preset-service.test.ts tests/services/launch-template-service.test.ts
```

## Resolution (2026-08-14)

**1（同名重命名被坏掉的 last-used 阻塞）—— 已修**：按建议把
`launch-preset-service.ts` 的 `readLastUsed()` 改为 `readLastUsed().catch(() => undefined)`。
重命名是用户的明确意图，一个连解析都过不去的指针本来就已经指不到东西，不该挡在前面。
`tests/services/launch-preset-service.test.ts` 补了
「renames past a last-used pointer too broken to read」。

**2（悬空索引条目）—— wontfix**：spec 明确排除事务回滚，而"坏条目毒害整个列表"那一半
本轮之前已经修掉（`listPresetsWithSettings` 逐项容错）。最坏后果已经从"整个列表消失"
降到"少一行"，再加一层启动时的惰性一致性检查属于独立的小特性，不在本条范围内。

**3（重复 await 索引 + 过宽的公开面）—— 已修**：
- `requireMeta(nameInput, index?)` 增加可选 `index` 参数，`writePresetSettings` 与
  `renamePreset` 传入自己刚读到的那份，各省一次异步跳转；`readMeta` 因此并入 `requireMeta`。
- 收窄 store 的返回值：`invalidateIndex` / `getPresetPath` / `readMeta` 收回闭包。
  先 grep 确认过外部只用到 `readIndex` / `resolveName` / `requireMeta` 与 CRUD 方法。
  这三个正是 store 用来兑现"缓存"和"不越出自己目录"这两个承诺的手段，不该拿在外面。

`tests/services/launch-preset-service.test.ts` 既有 27 条一字未改仍通过；`npm run check` 全绿。

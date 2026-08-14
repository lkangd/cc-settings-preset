---
id: progress-line-terminal-resize-residue
status: open
severity: nit
found: 2026-08-14
source: /code-review, round 1
target: 未提交改动 — 启动时自动安装 Claude plugin 的进度提示（src/core/progress-line.ts 等 6 个文件）
---

# 安装期间缩窄终端后，进度行可能留下清不掉的多行残留

## Problem

`src/core/progress-line.ts:66` 的 `render()` 每帧只做两件事：把光标拉回行首清掉**当前这一行**
（`CLEAR_LINE = '\r\x1b[2K'`），再按当下的 `stream.columns` 截断后重画。

```ts
write(CLEAR_LINE + truncateToDisplayWidth(line, Math.max((stream.columns ?? 80) - 1, 0)))
```

它不记录上一帧实际占了几行，也不监听终端 resize。若安装过程中（一个插件可能静默 20 秒以上）
用户把终端拖窄，终端可能把已经画出去的长行重排成两行；随后的帧和 `stop()`
（`src/core/progress-line.ts:88`）都只清除光标所在的最后一行，上面那截会残留在屏幕上，
之后 Claude Code 就在这片残留下面启动。

审查判定为 PLAUSIBLE：机制真实，但触发需要「恰好在安装的这十几秒里缩窄终端」，
且各终端对已输出内容的重排行为并不一致。

## Why deferred

代价与收益不成比例。要真正修好，得记录上一帧占用的行数、订阅 `stream.on('resize')`、
在重绘前用光标上移逐行清除——这会把一个目前 79 行、无状态到几乎可以一眼看完的模块，
变成需要维护「我上次画了几行」这类状态的东西。而症状只是罕见时序下的一次性视觉残留：
不影响安装结果、不影响启动、也不影响任何持久化数据，下一屏输出就冲掉了。

## Suggested fix approach

只改 `src/core/progress-line.ts`（TTY 分支）：

1. `render()` 计算截断后文本的显示宽度，除以当时的 `columns` 得到本帧占用行数，存进闭包。
2. 重绘前若上一帧行数 > 1，先 `\x1b[<n>A`（上移）逐行 `\x1b[2K`，再回到起始行绘制；
   `stop()` 走同一条清除路径。
3. 可选：`stream.on('resize', render)`，让缩窄后立刻按新宽度重画，缩短残留的存在时间；
   注意 `stop()` 里要 `removeListener`，否则会在长生命周期进程里泄漏监听器。

Done 的标准：在 80 列下渲染一条接近满宽的行，把 `columns` 改成 40 后再 `update()`/`stop()`，
写入序列里能看到覆盖两行的清除指令，且最终屏幕只剩空行。

## Recommended tools

- 现有测试：`npx vitest run tests/core/progress-line.test.ts`，里面的 `createStream()`
  已经支持自定义 `columns`，改成可变的 getter 就能模拟 resize，无需真实终端。
- 手工复现：起一个装大插件的启动（`chrome-devtools-mcp` 实测静默约 22 秒），
  在 spinner 转的时候拖窄终端窗口。
- 调用方只有一个：`grep -rn "createProgressLine" src/`（`src/cli.ts` 的
  `withPluginInstallProgress`），改动的影响面仅限这一条路径。

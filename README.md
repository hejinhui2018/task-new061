# CaptionFlow · 字幕时间轴校对台

面向字幕制作团队的带时间码多语言校对工具：导入带时间码与发言人的采访片段，按语言查看/编辑文本，
在时间轴上拖动、裁剪、拆分片段；系统实时检测**时间重叠、空白间隙、发言人冲突、翻译超时**，
并在每次调整后给出**前后影响对比**。内置一段双人采访示例，支持插入延迟、批量平移、撤销重做、
版本对比与浏览器刷新恢复。

技术栈：React 18 + TypeScript（strict）+ Vite 5 + Vitest。所有时间码/操作/历史逻辑均为
**纯函数**，不依赖 React 与时钟，可直接注入假时钟做确定性测试。

## 快速开始

```bash
npm install
npm run dev       # 本地开发
npm test          # 运行全部测试（73 个，含 jsdom 集成测试）
npm run build     # 类型检查 + 生产构建
```

## 功能

| 区域 | 能力 |
| --- | --- |
| 时间轴 | 缩放刻度尺；拖动整段（10ms 吸附、可选"防重叠拖动"钳制）；拖左右边缘裁剪入/出点；✂ 拆分模式点击即拆；空白段斜纹标记；重叠红框、翻译超时黄框 |
| 片段表 | 按 EN/中文/Español 切换查看与就地编辑译文；下拉更换发言人（修正跟错的标签）；行内拆分/裁切修复/右推修复；问题徽章 |
| 问题面板 | 重叠（error）/ 空白（warning，默认 >1200ms）/ 相邻同发言人冲突 / 译文朗读超时（按语言阅读速度估算），点击跳转片段 |
| 调整影响 | 每次操作列出每个受影响片段的调整前后时间码与平移量；四类问题数量 调整前 → 调整后 |
| 批量工具 | 插入延迟（从某时刻起连锁平移，间距保持不变）；批量平移（全部/某条及其后/仅选中，负值前移并钳制不早于 0）；一键裁切修复全部重叠 |
| 版本 | 撤销/重做（Ctrl+Z / Ctrl+Shift+Z）；版本历史弹窗可恢复任意旧版本（以新版本线性提交，可再撤销）；任意版本与当前版本对比时间码/发言人/文本差异 |
| 数据 | 项目 JSON 导入（数字毫秒或 `HH:MM:SS,mmm` 时间码字符串，严格校验）、SRT 导入（识别 `Name: ` 发言人前缀）、导出全语言 JSON 与按语言 SRT；历史自动写入 localStorage，刷新恢复，损坏数据自动回退示例 |

## 内置示例

`src/domain/sample.ts` 是主持人 Alex 与海洋生物学家 Dr. Maya Chen 的双人采访，预置了四类待校对问题：

- `c7/c8` 时间重叠 150ms（跨发言人抢话）
- `c9 → c10` 之间 2.8s 空白
- `c6` 的中文译文朗读时长超过片段预算
- `c7` 的发言人标签被故意跟错（与 `c8` 同标签，触发发言人冲突）

## 架构

```
src/
├─ domain/            # 框架无关的纯函数核心（全部可独立单测）
│  ├─ types.ts        # Cue/Transcript/Issue 模型、阈值与阅读速度
│  ├─ time.ts         # parseTimecode/formatTimecode/overlapAmount/snap/时长输入解析
│  ├─ analyze.ts      # 重叠/空白/发言人冲突/翻译超时检测
│  ├─ ops.ts          # move/trim/split/insertDelay/batchShift/repairOverlap，返回 impacted 影响表
│  ├─ history.ts      # 可注入时钟的撤销重做、版本快照、diffVersions、序列化恢复
│  ├─ codec.ts        # JSON/SRT 导入导出与校验
│  └─ sample.ts       # 内置双人采访
├─ state/store.tsx    # useReducer + Context；编辑前后各跑一次 analyze 生成影响报告；localStorage 持久化
└─ components/        # Toolbar / Timeline / CueTable / IssuesPanel / ImpactPanel / Modals
```

### 纯函数与可注入时钟

- 时间计算一律以毫秒为单位；`parseTimecode` 兼容 SRT（逗号）与 VTT（点号），相邻边界
  （`end == start`）严格不算重叠。
- 每个操作返回 `{ cues, impacted, summary }`，`impacted` 精确给出每条片段调整前后的
  `{start,end}`，UI 据此渲染影响面板。
- 历史的时间戳通过 `Clock = () => number` 注入（`createHistory(t, { clock/now })`、
  `commit(h, t, label, clock)`），测试用手动递增的假时钟保证确定性。

### 测试覆盖（73 个）

- `time.test.ts`：时间码解析/格式化往返、相邻边界 0ms/1ms、包含与分离
- `analyze.test.ts`：相邻边界不报、空白阈值严格大于、嵌套重叠、发言人冲突、翻译超时预算边界
- `ops.test.ts`：拖动钳制与不可变性、边缘最短时长、拆分相邻边界与中英文切词、
  **insertDelay 连锁平移**、batchShift 负值钳制、**repairOverlap 裁切/ripple 连锁推开**
- `history.test.ts`：**注入时钟**、撤销重做、redo 分支失效、版本上限、
  **restoreVersion 版本恢复**、版本 diff、序列化/**刷新恢复**与损坏数据回退
- `codec.test.ts`：JSON/SRT 校验与往返
- `app.test.tsx`（jsdom）：加载示例显示四类问题、修复重叠→撤销→刷新恢复闭环、语言切换

# 问渠课堂视频下载体验升级（复用 WQXT 项目 v2.1 方案）

## 1. 摘要

将 WQXT 项目 `studentVideoDownloader.js` 的下载体验设计（左下角非模态进度卡片、透明进度、完成峰值反馈）复用到 CDUT Studio 内嵌的问渠课堂页面。

与参考项目的关键差异：本项目是 Electron 应用，MP4 下载已由主进程 `webContents.downloadURL()` 接管，因此**不改用页面内流式 fetch**，而是保持 Electron 原生下载，由主进程通过 `will-download` 回传实时进度。这既复用了参考项目的交互与视觉语言，又避免了跨域（CORS）、大文件驻留渲染进程内存、以及 `showSaveFilePicker` 在 Electron 中支持不确定的问题。Chromium 原生下载本身就写入 `.crdownload` 临时文件并在完成后原子改名，磁盘上不会出现可打开的残缺 `.mp4`，与文档“原子落盘”目标等价。

用户已确认的决策：
1. **下载方式**：Electron 原生下载 + 主进程进度回传。
2. **立即播放**：调用系统默认播放器（主进程 `shell.openPath`）。
3. **完成提醒**：仅「视觉 + 提示音」，**不做**标签标题闪烁、**不做**系统桌面通知。

## 2. 现状分析

| 位置 | 现状 |
| :--- | :--- |
| [wqxt-livingroom-upgrader.ts](file:///c:/Users/Belie/Desktop/Origin-Academy/apps/electron/src/main/lib/cdut/yanhu/wqxt-livingroom-upgrader.ts#L4383-L4475) `downloadClassroomVideo` | MP4 通过 `window.postMessage({type:'__profer_wqxt_download'})` 交给主进程原生下载，仅显示一行状态文字，**无进度**；HLS 在页面内拉取切片，仅用状态栏文字显示百分比；无通知卡片、无完成音效、无取消二次确认。 |
| [wqxt-livingroom-upgrader.ts](file:///c:/Users/Belie/Desktop/Origin-Academy/apps/electron/src/main/lib/cdut/yanhu/wqxt-livingroom-upgrader.ts#L3714-L3724) `triggerDownload` | HLS 合并后以 Blob + `<a download>` 交给 Chromium 下载（会弹出保存对话框），页面无法感知落盘完成时刻。 |
| [wqxt-livingroom-upgrader.ts](file:///c:/Users/Belie/Desktop/Origin-Academy/apps/electron/src/main/lib/cdut/yanhu/wqxt-livingroom-upgrader.ts#L5026-L5095) `destroy` | 清理注入节点与计时器；新增的通知栈也需纳入清理。 |
| [yanhu-express-manager.ts](file:///c:/Users/Belie/Desktop/Origin-Academy/apps/electron/src/main/lib/cdut/yanhu/yanhu-express-manager.ts#L434-L467) `will-download` | 只设置保存对话框默认文件名，**未监听 `updated` / `done`**，也未回传任何事件。 |
| [yanhu-express-manager.ts](file:///c:/Users/Belie/Desktop/Origin-Academy/apps/electron/src/main/lib/cdut/yanhu/yanhu-express-manager.ts#L1098-L1120) `triggerVideoDownload` | 8 秒内同 URL 去重；只带 url/filename，无任务标识。 |
| [yanhu-express-manager.ts](file:///c:/Users/Belie/Desktop/Origin-Academy/apps/electron/src/main/lib/cdut/yanhu/yanhu-express-manager.ts#L332-L338) 构造函数 | 已注册 `ipcMain.on('yanhu-download-video')`，可在此扩展动作通道。 |
| [yanhu-preload.ts](file:///c:/Users/Belie/Desktop/Origin-Academy/apps/electron/src/main/lib/cdut/yanhu/yanhu-preload.ts#L42-L70) 下载桥 | 仅处理页面 → 主进程的 `__profer_wqxt_download`，无主进程 → 页面的回传通道。 |
| 底栏 / AI Dock | 底栏为文档内通栏（非 fixed）；AI Dock 固定在右下角 `right:24px; bottom:24px`。**左下角空闲**，通知栈放这里不会与现有控件冲突。 |
| 标签标题 | 标签栏标题来自 `page-title-updated` → `wc.getTitle()`（[recomputeNavigation](file:///c:/Users/Belie/Desktop/Origin-Academy/apps/electron/src/main/lib/cdut/yanhu/yanhu-express-manager.ts#L1137-L1159)），但本次决定不做标题闪烁。 |
| MutationObserver | 净化器/升级器在 `document` 上挂 `MutationObserver`（childList/subtree/characterData），任何文本改写都会触发 `sync()`。通知卡片的 DOM 更新**必须节流**（参考项目浏览器环境无此约束），否则会形成高频重扫描。 |

## 3. 数据契约

### 3.1 页面 → preload → 主进程

复用现有 `window.postMessage` 桥，新增两个消息类型（`event.source === window` 校验保持）。

1) 发起下载（扩展既有消息，字段向后兼容）：

```ts
// window.postMessage
{ type: '__profer_wqxt_download', url: string, filename: string, clientId?: string }
```
preload 转发 `ipcRenderer.send('yanhu-download-video', { url, filename, clientId })`。

2) 下载动作（新增）：

```ts
// window.postMessage
{ type: '__profer_wqxt_download_action',
  action: 'cancel' | 'open' | 'reveal' | 'blob',
  clientId: string,
  filename?: string }   // 仅 action==='blob' 需要
```
preload 转发 `ipcRenderer.send('yanhu-download-action', payload)`。

> 安全约束：`open` / `reveal` **不接受页面传入的任意路径**；主进程只使用自己登记过的 `clientId → savePath`，杜绝页面伪造路径调用 `shell.openPath`。

### 3.2 主进程 → preload → 页面

新增主进程通道 `yanhu-download-progress`，preload 转为 `window.postMessage`：

```ts
// window.postMessage
{ type: '__profer_wqxt_download_progress', payload: {
    clientId: string,
    filename: string,
    phase: 'start' | 'progress' | 'done' | 'cancelled' | 'error',
    received?: number,
    total?: number,
    savePath?: string,     // 仅 done 且成功时
    message?: string       // 仅 error
} }
```

主进程只在**带 `clientId` 的下载**上回传（页面主动发起的下载），站点自身其它下载不受影响。

## 4. 改动清单

### 4.1 `apps/electron/src/main/lib/cdut/yanhu/yanhu-express-manager.ts`

**新增字段**（放在现有 `pendingDownloads` 附近，约 L330）：

```ts
/** 视频下载任务登记：clientId -> 任务 */
private readonly videoDownloadJobs = new Map<string, {
  item: Electron.DownloadItem
  tabId: string | null
  filename: string
}>()
/** URL -> clientId（原生下载发起前登记，will-download 时反查） */
private readonly pendingDownloadClients = new Map<string, string>()
/** blob 下载（HLS 合并结果）预登记：filename.toLowerCase() -> { clientId, at } */
private readonly pendingBlobClients = new Map<string, { clientId: string; at: number }>()
/** 已完成的保存路径（供「立即播放 / 在文件夹中显示」）：clientId -> { path, at } */
private readonly recentDownloadPaths = new Map<string, { path: string; at: number }>()
```

**构造函数**（L332-338）：保留 `yanhu-download-video`，其 payload 类型扩展 `clientId?: string`；新增：

```ts
ipcMain.on('yanhu-download-action', (_event, payload?: {
  action?: string; clientId?: string; filename?: string
}) => { this.handleDownloadAction(payload) })
```

**`triggerVideoDownload`**（L1098-1120）：
- 签名增加可选 `clientId`；
- 有 `clientId` 时把 URL 与 clean URL 写入 `pendingDownloadClients`，并把去重 key 改为 `cleanUrl + '|' + clientId`（保证卡片「重试」在 8 秒内不被误杀）；无 `clientId` 时维持原 `cleanUrl` 去重。

**`installSessionGuards` 的 `will-download`**（L434-467）：接收第三参 `webContents`，在原有文件名逻辑之后追加：

1. `const clientId = this.resolveDownloadClientId(item, webContents)`：
   - 非 blob URL：查 `pendingDownloadClients`（URL 与 `getURLChain()` 中的每个 URL）；
   - blob URL（`item.getURL().startsWith('blob:')`）：按 `item.getFilename().toLowerCase()` 查 `pendingBlobClients`（命中后删除，TTL 15s）；
   - 未命中 → `undefined`，直接跳过（保持旧行为）。
2. 仅当 `clientId && webContents && !webContents.isDestroyed()` 时：
   - `tabId` 用现有 `findTabByWebContentsId(webContents.id)?.id ?? null`；
   - 登记 `videoDownloadJobs`，发送 `phase:'start'`；
   - `item.on('updated', ...)`：节流（距上次 ≥350ms 或已下载百分比整数位变化 ≥1）发送 `phase:'progress'` + `received/total`；
   - `item.once('done', (_e, state) => ...)`：`completed` → 记录 `recentDownloadPaths.set(clientId,{path:item.getSavePath(),at:Date.now()})` 并发送 `phase:'done'`；`cancelled` → `phase:'cancelled'`；`interrupted` → `phase:'error'`（含简短 message）；最终从 `videoDownloadJobs` 删除。
3. 保底清理：`done` 后对 `pendingDownloadClients` 中原 URL / clean URL 的登记做删除（沿用现有 `pendingDownloads` 清理位置）。

**新增私有方法** `handleDownloadAction(payload)`：
- `cancel`：`videoDownloadJobs.get(clientId)?.item.cancel()`；
- `open`：查 `recentDownloadPaths`（10 分钟 TTL，过期丢弃）；`existsSync(path)` 后 `void shell.openPath(path)`；
- `reveal`：同上，改调 `shell.showItemInFolder(path)`；
- `blob`：校验 `clientId` 与 `filename` 为字符串，写入 `pendingBlobClients`（小写 filename，15 秒 TTL），供 blob 下载的 `will-download` 关联。
- 所有分支 try/catch 兜底，失败只 `console.warn`，不影响页面。

**imports**：`electron` import 增加 `type DownloadItem`（或在字段处直接写 `Electron.DownloadItem`，实现时按文件现有风格二选一并统一）；新增 `import { existsSync } from 'node:fs'`。

### 4.2 `apps/electron/src/main/lib/cdut/yanhu/yanhu-preload.ts`

在 `applyWqxtDownloadBridge()`（L42-70）内追加（仍受 `window.top !== window` 与 `__profer_wqxt_download_bridge_installed` 保护）：

1. 扩展既有 `__profer_wqxt_download` 分支：透传 `event.data.clientId`（仅当为字符串）。
2. 新增分支 `__profer_wqxt_download_action`：校验 `action ∈ ['cancel','open','reveal','blob']`、`clientId` 为字符串，`filename` 可选，`ipcRenderer.send('yanhu-download-action', {...})`。
3. 新增主进程回传监听：

```ts
ipcRenderer.on('yanhu-download-progress', (_event, payload) => {
  try {
    if (!payload || typeof payload !== 'object') return
    window.postMessage({ type: '__profer_wqxt_download_progress', payload }, '*')
  } catch {}
})
```

> 注意：现有 `window.addEventListener('message')` 是页面 → preload 方向；`window.postMessage` 用于 preload → 页面方向，两方向互不干扰。

### 4.3 `apps/electron/src/main/lib/cdut/yanhu/wqxt-livingroom-upgrader.ts`

#### 4.3.1 CSS（`WQXT_UPGRADE_CSS`，插入在「3.9 页面底部通栏」之前，约 L1559）

新增 `#__profer-svd-stack` 作用域样式，逐项从参考项目迁移，去掉临时 `injectStyles()`（复用现有 `ensureStyle()` 注入）：

- 容器：`position:fixed; left:24px; bottom:24px; z-index:100005; display:flex; flex-direction:column-reverse; gap:12px; pointer-events:none;`
- 卡片：348px、白底、12px 圆角、双层阴影、左侧 4px 强调色边条（`--svd-accent` 默认 `#1677ff`）、`animation: svd-in .38s ...`。
- 状态色：`.svd-success`（`#16a34a` + `svd-pop` 弹跳）、`.svd-error`（`#e5484d`）、`.svd-info`（`#f59e0b`）、`.svd-muted`（`#9aa4b2`）。
- 进度条：6px 高、`linear-gradient` 45° 斜纹 + `svd-stripes .9s linear infinite`；未知总量时 `.svd-indeterminate` 用 `svd-slide` 滑动。
- 文本行：`svd-meta` 左右两栏等宽数字（`font-variant-numeric: tabular-nums`）。
- 按钮：`svd-btn` / `svd-btn-primary`；取消态 `svd-confirm` 红底。
- 底部自动收起剩余时间细线 `svd-timer`（`scaleX` 过渡）。
- 图标 SVG 由运行时写入（`svd-check path` 描线动画 `svd-draw`）。
- `@media (prefers-reduced-motion: reduce)` 关闭动画。

所有规则限定在 `#__profer-svd-stack` 之下，避免与站点样式冲突；沿用资源卡片「不加 `!important`」的既有风格。

#### 4.3.2 运行时新增模块（插入在 `triggerDownload` 之后、`// ---------- 课堂教学视频下载 ----------` 之前，约 L3724-3758）

按参考项目 ES5 风格实现（`var`、`function`、不使用反引号/`${`），命名加 `svd` 前缀：

1. `CONFIG`：
```js
var SVD_CONFIG = { completionSound: true, successAutoDismissMs: 20000 };
```
2. `formatBytes(n)` / `formatDuration(sec, rough)`：用于已下载量、网速、剩余时间。
3. `DownloadNotifier`：
   - `ensureContainer()`：幂等创建 `<div id="__profer-svd-stack">`（不重复注入样式，CSS 已随 `STYLE_ID` 注入）。
   - `create(opts)` 返回句柄，内部持有 `state / confirmTimer / dismissTimer / startTs / speedEma / fracRateEma / shownFraction`。
   - 结构：图标 + 标题 + 文件名 + 关闭按钮、进度条、`meta-l`/`meta-r`、提示文案、动作区。
   - 关闭按钮：`running` 态首次点击变为「确认取消？」红色，3 秒内再次点击才触发 `opts.onCancel`；非 running 态直接关闭。
   - `setPhase(text)`、`setProgress({fraction, loaded, total, detail})`：
     - 进度条单调不回退；
     - `loaded` 采样间隔 ≥0.5s 计算 EMA 网速；`fraction` 计算剩余时间，2 秒内显示「正在估算剩余时间…」；
     - **文本刷新节流 ≥500ms**（MutationObserver 约束），进度条宽度每次事件更新即可。
   - `success({size, exact, name, onPreview, onDismiss})`：切绿色、对勾描线、标题「下载完成，现在可以打开了」、`meta-l` 显示 100% 与体积、`meta-r` 显示用时；动作区「▶ 立即播放」（primary）与「知道了」；启动 `autoDismiss(CONFIG.successAutoDismissMs)`。
   - `handedOff()`：橙色 info 卡片，隐藏进度条，提示「已交给系统下载，请在下载对话框确认位置；完成后即可播放」。
   - `error(message, onRetry, onDismiss)`：红色，保留已下载百分比，提供「重试」与「关闭」。
   - `cancelled()`：灰色「已取消下载」，2.5 秒后自动关闭。
   - `nudge()`：重复点击同一视频时轻晃卡片。
   - `dismiss(skipCallback)`：300ms 离场动画后移除；触发 `onDismiss`。
   - `autoDismiss(ms)`：`setInterval(100ms)`，仅页面可见且未悬停时倒计时，底部细线 `scaleX` 可视化。
4. `CompletionAlert`（仅视觉 + 提示音）：
   - `prime()`：在点击手势内创建/恢复 `AudioContext`（`window.AudioContext || window.webkitAudioContext`）；
   - `playChime()`：A5(880Hz) → E6(1318.5Hz) 双正弦音，`gain 0.0001 → 0.07 → 0.0001`，间隔 0.13s；
   - `fire()`：仅 `playChime()`（**不实现** `flashTitle` / 系统通知）。
5. 任务登记与消息处理：
   - `var svdJobs = {}`（clientId → { card, panel, filename, retry, blobTimer }）；
   - `var svdActiveByUrl = {}`（url → clientId，用于重复点击 nudge）；
   - `function sendDownloadAction(clientId, action)` → `window.postMessage({type:'__profer_wqxt_download_action', action, clientId}, '*')`；
   - `window.addEventListener('message', ...)`：校验 `event.source === window`、`data.type === '__profer_wqxt_download_progress'`、`isLivingRoom()`，按 `payload.clientId` 分发：
     - `start`：若无卡片则 `create`（支持从主进程自建）；
     - `progress`：`card.setProgress({fraction: total ? received/total : null, loaded: received, total: total})`；
     - `done`：`card.success({size: total || received, exact:true, name: filename, onPreview:function(){ sendDownloadAction(id,'open'); }, onDismiss: cleanup})` + `CompletionAlert.fire()`；同时 `setResourceStatus(statusEl, '✅ 视频已保存：' + filename)`；
     - `cancelled`：`card.cancelled()`；
     - `error`：`card.error(message, retry, function(){ sendDownloadAction(id,'reveal'); })`。`retry` 由任务登记时写入（重新执行 `downloadClassroomVideo(panel)`）。
   - 事件到达但当前不在 `livingroom` 时直接忽略（避免离开页面后凭空创建卡片）。

#### 4.3.3 改写 `downloadClassroomVideo`（L4383-4475）

1. 函数入口先 `CompletionAlert.prime()`（同步于点击手势）。
2. 鉴权/签名阶段保持原有状态文字与按钮禁用。
3. **MP4 分支**（`chosenUrl.indexOf('.m3u8') === -1`）：
   - 生成 `clientId = newUuid()`；
   - 若 `svdActiveByUrl[chosenUrl]` 存在 → `svdJobs[旧id].card.nudge()` 并返回（不重复建任务）；
   - 创建通知卡片：`DownloadNotifier.create({ filename: filename, onCancel: function(){ sendDownloadAction(clientId, 'cancel'); } })`；
   - 登记 `svdJobs[clientId] = { card, panel, filename, retry: function(){ downloadClassroomVideo(panel); } }`、`svdActiveByUrl[chosenUrl] = clientId`，卡片 `onDismiss` 时清理登记；
   - `window.postMessage({ type:'__profer_wqxt_download', url: downloadLink, filename: filename, clientId: clientId }, '*')`；
   - 状态栏仅保留一行「已转入左下角下载卡片，可继续看课」；
   - 立即 `restoreControls()` 释放按钮（支持连续下载多个清晰度，卡片堆叠）；**删除**旧的 8 秒 `setTimeout` 恢复逻辑与「🚀 已调起系统下载」文案。
4. **HLS 分支**：
   - 同样创建卡片并登记（`clientId`）；
   - 切片进度回调改为 `card.setProgress({ fraction: cur/tot, detail: '切片 '+cur+' / '+tot })`（保留现有 1 秒/2% 节流）；
   - 合并前 `card.setPhase('正在合并并写入文件…')`；
   - 调 `exportMergedFile` 前先 `sendDownloadAction(clientId, 'blob')`，并额外传 `filename`（注册到主进程，供 blob 下载关联）；
   - 启动 6 秒兜底定时器：若未收到 `done/cancelled/error`，则 `card.handedOff()`（诚实告知“已交给系统下载”）；收到事件即清除定时器。
   - 取消/异常路径改为 `card.cancelled()` / `card.error(...)`，同步清理 `svdJobs`、`svdActiveByUrl`、兜底定时器。
5. `finally` 中补齐 MP4 分支的 `videoAbort`/`videoDownloadKey` 复位（现有仅 HLS 复位），避免残留 AbortController 引用。
6. 保持 `setResourceStatus` 用于鉴权与错误提示，不再承担进度展示。

#### 4.3.4 `exportMergedFile` 保持现状

仍为 Blob + `triggerDownload`（Electron 会走原生保存对话框）；仅由调用方在调用前完成 `blob` 登记与卡片状态切换。

#### 4.3.5 `destroy()`（L5026-5095）与调试命名空间（L5112）

- `destroy()` 追加：清除所有 `svdJobs` 的兜底定时器与登记、移除 `#__profer-svd-stack` 节点；不主动取消仍在进行的主进程原生下载（下载继续，磁盘结果不受影响）。
- 末尾对外暴露调试入口（与参考文档第 4 节对齐）：
```js
window.__proferWqxtDownloader = {
  CONFIG: SVD_CONFIG,
  DownloadNotifier: DownloadNotifier,
  CompletionAlert: CompletionAlert
};
```

## 5. 状态机与交互细节（验收口径）

| 事件 | 卡片表现 |
| :--- | :--- |
| 点击下载 | 立即出现左下角卡片（running，indeterminate「准备中…」），按钮恢复可点击 |
| 主进程 `progress` | 百分比 + 已下载/总量 + EMA 网速 + 剩余约时间；斜纹持续流动 |
| 保存对话框被取消 | `cancelled` 灰卡「已取消下载」，2.5s 自动关闭 |
| 下载完成 | `success` 绿卡、对勾描线、A5→E6 双音；「▶ 立即播放」调用系统播放器；20s 自动收起（悬停暂停、页面隐藏暂停） |
| 中断/失败 | `error` 红卡保留百分比，提供「重试」；重试重新鉴权并重新签名 |
| 重复点击同一清晰度 | 不新建任务，轻晃已有卡片 |
| 多个清晰度并行 | 卡片纵向堆叠（`column-reverse`） |
| HLS | 切片进度 → 合并 → 交给系统下载；6 秒内无主进程回执则降级为 info 卡 |

## 6. 假设与边界

1. Electron `will-download` 的第三参 `webContents` 可用于回投；若为空则跳过进度回传（仅影响体验，不影响下载）。
2. Electron 原生下载本身已保证「完成前不产生可打开的 `.mp4`」（`.crdownload` 临时文件 + 完成后改名），因此**不引入** `showSaveFilePicker` / 页面内流式下载。
3. HLS 的 Blob 下载是否触发 `will-download` 存在平台差异；已设计 6 秒兜底为 `handedOff`，不会谎报成功。
4. 不实现标签标题闪烁与系统桌面通知（用户明确选择「仅视觉 + 提示音」）。
5. 不在 `destroy()` 中取消进行中的原生下载；离开课堂页后下载可继续，用户返回时不会自动重建卡片（可接受）。
6. 卡片 DOM 更新节流（文本 ≥500ms、主进程事件 ≥350ms）以适配页面级 `MutationObserver`。
7. `shell.openPath` 只接受主进程自登记的 `savePath`，不信任页面输入。

## 7. 验证步骤

1. 静态检查：仓库根目录 `npm run typecheck`。
2. 打包注入脚本：`npm run build:yanhu-preload -w @profer/electron`（确认 `dist/yanhu-preload.cjs` 生成、无 esbuild 报错）。
3. 全量构建：`npm run build`。
4. 手动回归（`npm run dev`，进入问渠课堂 `/livingroom?course_id=...`）：
   - MP4：点击「开始下载视频」→ 系统保存对话框 → 选择路径 → 卡片实时百分比/速度/剩余时间；完成后绿卡 + 双音；点「▶ 立即播放」系统播放器打开刚保存的 mp4；磁盘在完成前只有 `.crdownload`，无残缺 mp4。
   - 取消：卡片关闭按钮第一次变「确认取消？」，3 秒内二次点击 → 取消成功、卡片灰态、无残留文件。
   - 失败重试：断网或取消保存框后重试路径可达；`error` 卡「重试」可重新开始。
   - HLS：切片进度递增 → 合并 → 保存对话框 → 完成绿卡或 6 秒后 info 卡。
   - 并发：先后下载两个清晰度，卡片纵向堆叠，互不覆盖。
   - 重复点击：同一视频下载中再次点击，仅轻晃卡片，不产生第二个任务。
   - 离开课堂页：卡片与样式被清理，无 DOM 残留；页面其它功能（PPT/摘要/转录、AI Dock）不受影响。
5. 检查主进程控制台无 `will-download` 相关异常，页面控制台无重复事件或内存泄漏警告。

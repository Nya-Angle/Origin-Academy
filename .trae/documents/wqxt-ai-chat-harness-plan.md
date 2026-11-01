# AI 问渠助手 · LLM Chat Harness 接入实现计划

## 一、目标

把课堂页右下角现有的静态毛玻璃「AI 问渠助手」升级为可用工作台：多轮会话、SSE 流式打字机、课堂上下文实时注入、按课程隔离的历史、图形化 LLM 参数配置。网络请求与密钥只留在主进程，页面与 Preload 只做 UI 与消息桥接。

## 二、现有架构勘查结论（已核实）

1. **页面注入链路**
   - `yanhu-preload.ts` 在 document-start 通过 `webFrame.executeJavaScript(buildWqxtLivingRoomCleanerScript())` 注入主世界；`wqxt-livingroom-cleaner.ts` 的脚本头部再拼接 `buildWqxtUpgradeRuntimeScript()`。
   - `yanhu-express-manager.ts` 在 `dom-ready` 时通过 `applyWqxtCleanerIfNeeded()`（约 1316-1329 行）补偿注入。
   - `WebContentsView` 使用 `contextIsolation: false` + `sandbox: true`（约 826-839 行），Preload 与页面主世界共享 `window`；现有下载桥已用 `window.postMessage` ↔ `ipcRenderer` 双向通信（`yanhu-preload.ts` 51-82 行），AI 桥可照此实现。

2. **现有 AI 面板占位**
   - 样式：`wqxt-livingroom-upgrader.ts` 1873-2199 行。
   - HTML：`buildAiDockHtml()` 2337-2346 行、`buildAiPanelHtml()` 2348-2406 行（当前仅"对齐测试中"占位）。
   - 绑定：`ensureAiAssistant()` / `openAiPanel()` / `closeAiPanel()` 3249-3290 行。
   - 生命周期：`sync()` 5993-6006 行调用 `ensureAiAssistant()`；`destroy()` 5978-5981 行移除两个节点。

3. **运行时字符串硬约束**
   - 升级器运行时被塞进模板字符串并最终进入 `buildWqxtLivingRoomCleanerScript()`，**注入脚本内部不得出现反引号与 `${`**。新增的 AI 运行时必须用普通字符串拼接。

4. **可复用的上下文数据源（已存在，无需新增抓取逻辑）**
   - 课程标题：`getCourseTitle(vm)`（4006-4017 行，`vm.courseName + vm.subTitle`）。
   - 课堂 VM：`findVideoRoomVm()`（4824-4837 行，含 `course_id` / `subTitle` / `liveInfo`）。
   - 教师：`syncHeader()` 读取 `.teacher_span`（3142 行）。
   - 播放进度：`videoEl.currentTime` / `videoEl.duration`。
   - 实时字幕：`findOriginalSubtitleText()`（2994 行起）。
   - `course_id`：URL query 或 `roomVm.course_id`（`VideoAuthManager.getContext()` 4841-4860 行同款解析）。

5. **配置与持久化现状**
   - `apps/electron/src/main/lib/app-settings.ts` 的 `normalize()` 是字段白名单（28-42 行），新增 `llmConfig` 必须在此收敛，否则写入即丢失。
   - 配置根由 `config-paths.ts` 管理（开发模式 `~/.cdutai-dev`，打包 `~/.cdutai`），已有 `getSettingsPath()`，需新增会话历史路径函数。
   - 原子读写工具 `safe-file.ts` 提供 `readJsonFileSafe` / `writeJsonFileAtomic`。

6. **类型与 IPC 现状**
   - 共享类型统一在 `packages/shared/src/types/cdut.ts`（末尾已有 `YANHU_EXPRESS_IPC_CHANNELS`、`CDUT_ZONE_IPC_CHANNELS` 常量，可直接追加）。
   - 主进程 IPC 既可在 `YanhuExpressManager` 构造器注册（349-357 行），也可在 `yanhu-ipc.ts`；AI 相关全部放在 harness 自身的 `attach()` 中集中注册。
   - `AppSettings` 定义在 `apps/electron/src/types/index.ts`，渲染层通过 `settings:get/update` 读取；`llmConfig` 放这里便于后续在应用设置页复用。
   - 代码库中**不存在**任何现成的 OpenAI/SSE 客户端；`PET_CHAT_*` 通道仅有常量声明、无实现，仅作命名参考，不复用。

## 三、关键设计决策（执行时不再二次选择）

| # | 决策 | 理由 |
|---|---|---|
| D1 | 所有 HTTPS/HTTP 请求、SSE 解析、AbortController 都在主进程 `WqxtAiHarness` 内 | 规避 CORS；API Key 不进页面 |
| D2 | 页面 ↔ Preload 复制下载桥的 `window.postMessage` + `ipcRenderer` 模式；配置/历史用 `ipcRenderer.invoke`，消息流用 `send` + `on` | 与现有代码一致，`contextIsolation:false` 下实测可用 |
| D3 | `GET_CONFIG` 返回 `apiKey: ''` + `hasApiKey: boolean`；`SAVE_CONFIG` 中 `apiKey` 为空串/缺省 = 保留原值 | 满足"密钥不泄露到页面"的要求，同时设置抽屉可正常编辑 |
| D4 | "保存并测试" = 保存后执行一次 **Dry-Run 最小 Chat 补全**（`stream:false`、`max_tokens:1`、`messages:[{role:'user',content:'hi'}]`），返回 `{ ok, error }`，不额外增加 IPC 通道 | `/models` 在国内多家兼容网关被单独限权/404，会误报；Dry-Run 同时校验连通性、Base URL、Key、Model 是否存在 |
| D5 | 历史由主进程持有；页面发送只带「课程 ID + 新用户消息 + 上下文开关 + 上下文快照」，不携带全量历史 | 页面更薄、历史一致性由单一写者保证 |
| D6 | 流式期间正文用 `textContent` 快速追加；收到 `done/error/abort` 后再做一次性轻量 Markdown 渲染；推理内容单独折叠块 | 避免每 chunk 全量解析导致中文长文卡顿 |
| D7 | 上下文开关状态存 `localStorage`（`__profer_ai_ctx_enabled`），默认开启 | 与现有字幕偏好同风格 |
| D8 | AI 面板的 CSS / HTML / 运行时抽到新文件 `wqxt-ai-panel.ts`，升级器只负责拼接 | 6017 行的升级器不再继续膨胀，且 Preload 可复用消息类型常量 |
| D9 | 面板使用固定右下角尺寸（沿用 560px / 75vh），不引入拖拽缩放 | 本次范围只做可用工作台，不做窗口管理 |
| D10 | 预设 6 家：DeepSeek / OpenAI / 通义千问 / 硅基流动 / Moonshot / Ollama | 覆盖国内外主流 OpenAI-Compatible 服务 |

## 四、改动清单

### 4.1 `packages/shared/src/types/cdut.ts`（修改，追加到文件末尾）

新增常量与接口：

```ts
export const WQXT_AI_IPC_CHANNELS = {
  SEND_MESSAGE: 'yanhu-express:wqxt-ai-send',
  ABORT_MESSAGE: 'yanhu-express:wqxt-ai-abort',
  GET_CONFIG: 'yanhu-express:wqxt-ai-get-config',
  SAVE_CONFIG: 'yanhu-express:wqxt-ai-save-config',
  GET_HISTORY: 'yanhu-express:wqxt-ai-get-history',
  CLEAR_HISTORY: 'yanhu-express:wqxt-ai-clear-history',
  STREAM_CHUNK: 'yanhu-express:wqxt-ai-stream-chunk',
} as const

export type WqxtAiRole = 'system' | 'user' | 'assistant'

/** 主进程暴露给页面的配置（不含 apiKey 明文） */
export interface WqxtAiPublicConfig {
  baseUrl: string
  apiKey: string          // 恒为空串；仅用于表单占位
  hasApiKey: boolean
  modelName: string
  temperature: number
  maxTokens: number
  stream: boolean
}

/** 保存配置时页面提交的补丁；apiKey 为空表示保持不变 */
export interface WqxtAiConfigPatch {
  baseUrl?: string
  apiKey?: string
  modelName?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface WqxtLivingRoomContext {
  courseId: string
  courseTitle: string
  chapterName: string
  teacherName: string
  currentTime: number
  duration: number
  currentSubtitle: string
}

export interface WqxtAiContextSnapshot {
  courseTitle: string
  chapterName: string
  teacherName: string
  currentTimeLabel: string
  currentSubtitle: string
}

export interface WqxtAiMessage {
  id: string
  role: WqxtAiRole
  content: string
  reasoningContent?: string
  timestamp: number
  contextSnapshot?: WqxtAiContextSnapshot
}

export interface WqxtAiSendPayload {
  requestId: string
  courseId: string
  text: string
  includeContext: boolean
  context?: WqxtLivingRoomContext
}

export interface WqxtAiStreamPayload {
  requestId: string
  type: 'delta' | 'reasoning' | 'done' | 'error'
  text?: string
  error?: string
  aborted?: boolean
}

export interface WqxtAiSaveConfigResult {
  ok: boolean
  error?: string
  config?: WqxtAiPublicConfig
}
```

同时导出桥接消息类型常量（供页面运行时与 Preload 共用，避免字符串漂移）：

```ts
export const WQXT_AI_BRIDGE_TYPES = {
  REQUEST_SEND: '__profer_wqxt_ai_send',
  REQUEST_ABORT: '__profer_wqxt_ai_abort',
  REQUEST_GET_CONFIG: '__profer_wqxt_ai_get_config',
  REQUEST_SAVE_CONFIG: '__profer_wqxt_ai_save_config',
  REQUEST_GET_HISTORY: '__profer_wqxt_ai_get_history',
  REQUEST_CLEAR_HISTORY: '__profer_wqxt_ai_clear_history',
  RESPONSE_STREAM: '__profer_wqxt_ai_stream',
  RESPONSE_CONFIG: '__profer_wqxt_ai_config',
  RESPONSE_SAVE_RESULT: '__profer_wqxt_ai_save_result',
  RESPONSE_HISTORY: '__profer_wqxt_ai_history',
} as const
```

> 注：Preload 的构建约束是"零外部依赖"，`packages/shared` 不能直接 import 进 `yanhu-preload.ts`。因此桥接类型常量**实际落点**放在 `wqxt-ai-panel.ts`（同目录、零依赖模块），`cdut.ts` 只保留主进程侧渠道与会话类型；两侧字符串保持一致，以 `wqxt-ai-panel.ts` 为唯一权威。

### 4.2 `apps/electron/src/main/lib/config-paths.ts`（修改）

在 `getSettingsPath()` 附近追加：

```ts
/** 问渠课堂 AI 会话历史（按课程隔离） */
export function getWqxtChatSessionsPath(): string {
  return join(getConfigDir(), 'wqxt-chat-sessions.json')
}
```

### 4.3 `apps/electron/src/main/lib/app-settings.ts`（修改）

- `DEFAULT_SETTINGS` 增加：

```ts
llmConfig: {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  modelName: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
  stream: true,
}
```

- `normalize()` 增加 `llmConfig` 分支：逐字段类型校验；`temperature` 夹取 `[0, 2]`；`maxTokens` 夹取 `[1, 8192]`；`baseUrl` 去尾斜杠；空串沿用默认；`apiKey` 仅接受字符串。
- 返回对象改为展开式 `{ ...DEFAULT_SETTINGS, ...validated }`，保持向后兼容（旧 settings.json 无该字段时自动补默认）。

### 4.4 `apps/electron/src/types/index.ts`（修改）

```ts
import type { WqxtAiConfig } from '@profer/shared'  // 若命名为 WqxtAiConfig 则在 cdut.ts 中同时导出
export interface AppSettings {
  themeMode: ThemeMode
  themeStyle: ThemeStyle
  interfaceVariant: InterfaceVariant
  llmConfig?: WqxtAiConfig
}
```

`WqxtAiConfig`（主进程存储用，含真实 `apiKey`）在 `cdut.ts` 中定义为 `Omit<WqxtAiPublicConfig, 'hasApiKey'>` 的等价结构：

```ts
export interface WqxtAiConfig {
  baseUrl: string
  apiKey: string
  modelName: string
  temperature: number
  maxTokens: number
  stream: boolean
}
```

### 4.5 `apps/electron/src/main/lib/cdut/yanhu/wqxt-ai-prompts.ts`（新建）

```ts
import type { WqxtLivingRoomContext } from '@profer/shared'

export const DEFAULT_WQXT_SYSTEM_PROMPT = `你是「CDUT Studio · 问渠学堂 AI 助教」…（引导词）`

export function formatClassroomContextPrompt(ctx?: WqxtLivingRoomContext): string

export function buildSystemPrompt(ctx?: WqxtLivingRoomContext): string
```

- `DEFAULT_WQXT_SYSTEM_PROMPT` 写明：仅围绕本节课答疑；不确定时明确说不知道；鼓励引导式讲解；不编造课程信息。
- `formatClassroomContextPrompt` 用「【当前课堂上下文】」分节列出课程、章节、教师、播放位置 `mm:ss / mm:ss`、当前字幕；上下文缺失时逐项省略，不输出空字段。
- `buildSystemPrompt` = 默认提示词 + 可选上下文段。**该文件是后续定制提示词唯一替换点**。

### 4.6 `apps/electron/src/main/lib/cdut/yanhu/wqxt-ai-harness.ts`（新建，核心）

单例 `export const wqxtAiHarness = new WqxtAiHarness()`。结构：

```ts
interface ActiveRequest {
  controller: AbortController
  sender: WebContents
  courseId: string
  assistantId: string
}
class WqxtAiHarness {
  private readonly active = new Map<string, ActiveRequest>()   // requestId -> ...
  private cache: WqxtChatSessionsStore | null = null           // 单写者内存缓存
  private readonly writeQueue: Promise<void> = Promise.resolve() // 串行落盘
  attach(): void        // 注册全部 ipcMain.on / ipcMain.handle
  abortBySender(webContentsId: number): void
  private send(webContents: WebContents, payload: WqxtAiStreamPayload): void
  private getConfig(): WqxtAiConfig
  private saveConfig(patch: WqxtAiConfigPatch): Promise<WqxtAiSaveConfigResult>
  /** Dry-Run 最小 Chat 补全探测；非 2xx / 网络错误抛出可读错误 */
  private probe(config: WqxtAiConfig): Promise<void>
  private loadStore(): WqxtChatSessionsStore
  private readHistory(courseId: string): WqxtAiMessage[]
  /** 仅在 done / aborted 时调用；内存缓存同步更新，随后串行原子落盘 */
  private commitTurn(courseId: string, user: WqxtAiMessage, assistant: WqxtAiMessage): void
  private clearHistory(courseId: string): void
  private async streamChat(requestId: string, sender: WebContents, payload: WqxtAiSendPayload): Promise<void>
}
```

**端点规整（必须按此实现，规避 `/v1/v1` 404）**：

```ts
function resolveChatEndpoint(rawUrl: string): string {
  const clean = rawUrl.trim().replace(/\/+$/, '')
  if (clean.endsWith('/chat/completions')) return clean
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`
  return `${clean}/v1/chat/completions`
}
```

- `https://api.deepseek.com/v1` → `https://api.deepseek.com/v1/chat/completions`
- `https://api.deepseek.com` → `https://api.deepseek.com/v1/chat/completions`
- `https://dashscope.aliyuncs.com/compatible-mode/v1` → `.../compatible-mode/v1/chat/completions`
- `http://localhost:11434` → `http://localhost:11434/v1/chat/completions`
- 已带 `/chat/completions` 的完整地址 → 原样返回

**连通性探测（`probe`）**：`POST resolveChatEndpoint(baseUrl)`，body `{ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false }`，超时 `AbortSignal.timeout(20000)`。`!res.ok` 读取前 300 字符拼错误信息抛出；`res.ok` 即视为通过（无论返回体内容）。

实现要点：

- **attach()**：
  - `ipcMain.on(WQXT_AI_IPC_CHANNELS.SEND_MESSAGE, ...)`：校验 payload 基本形状（`requestId` / `courseId` / `text`），同 sender 存在进行中的请求时先 abort（单流）；直接开始流。
  - `ipcMain.on(ABORT_MESSAGE, (event, { requestId }) => ...)`：只允许发起者本人中断（比对 `controller` 所属 `sender.id`）。
  - `ipcMain.handle(GET_CONFIG, () => publicConfig)`：始终不带明文 Key。
  - `ipcMain.handle(SAVE_CONFIG, (_event, patch) => saveConfig(patch))`：合并 → 持久化 `updateSettings({ llmConfig })` → `probe()` → 返回 `{ ok, error?, config }`；探测失败也保留已保存配置，错误回传 UI。
  - `ipcMain.handle(GET_HISTORY, (_e, { courseId }) => readHistory(courseId))`
  - `ipcMain.handle(CLEAR_HISTORY, (_e, { courseId }) => clearHistory(courseId))`
- **streamChat** 流程：
  1. **不落盘**：从内存缓存 `readHistory(courseId)` 取历史，在内存中构造本轮 `userMessage`（带 `contextSnapshot`）；请求数组 = 历史 + 本轮用户消息。
  2. 组装请求：`[{ role:'system', content: buildSystemPrompt(includeContext ? context : undefined) }, ...trimmedHistory, userMessage]`；过滤 `system` 角色与空 content。
  3. **上下文安全闸**：先按 `slice(-22)` 取最近 22 条，再从最新向前累计字符数，累计不超过 **16,000 字符**（约 8k-10k tokens 安全水位），超出部分静默丢弃更早历史。
  4. `endpoint = resolveChatEndpoint(config.baseUrl)`；`fetch(endpoint, { method:'POST', signal, headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) }, body: JSON.stringify({ model: config.modelName, messages, temperature: config.temperature, max_tokens: config.maxTokens, stream: true }) })`；`!res.ok` → 读取文本、截断 300 字、发 `{type:'error'}`、**不写历史**、直接结束。
  5. 无 `res.body` → `error`。有则 `getReader()` 读取；**必须复用同一个 `TextDecoder('utf-8')` 实例并传 `{ stream: true }`**，维护 `lineBuffer`：
     ```ts
     const decoder = new TextDecoder('utf-8')
     let lineBuffer = ''
     while (true) {
       const { done, value } = await reader.read()
       if (done) break
       lineBuffer += decoder.decode(value, { stream: true })
       const lines = lineBuffer.split('\n')
       lineBuffer = lines.pop() ?? ''   // 未闭合的半行留到下一次
       for (const rawLine of lines) {
         const line = rawLine.replace(/\r$/, '')
         if (!line.startsWith('data:')) continue
         const data = line.slice(5).trim()
         if (!data || data === '[DONE]') continue
         try { handleChunk(JSON.parse(data)) } catch { /* 单行坏包跳过，不中断整条流 */ }
       }
     }
     lineBuffer += decoder.decode()   // flush 残余多字节
     if (lineBuffer.trim()) { /* 同样尝试解析最后一行 */ }
     ```
     禁止 `new TextDecoder()` 每 chunk 重建、禁止直接对 chunk 调 `split('\n')`。
  6. 每个 JSON 解析：`delta.reasoning_content || delta.reasoning || choices[0].message.reasoning_content` → `type:'reasoning'`；`delta.content || choices[0].message.content` → `type:'delta'`；同时兼容 `choices[0].text`（部分兼容层）。
  7. **正常结束**：把完整 `assistant` 消息（含 `reasoningContent`）与本轮用户消息一起 `commitTurn()`（内存缓存追加 → 串行原子落盘，单课程上限 80 条）；发 `{type:'done'}`。
  8. `catch`：
     - `AbortError`：若已生成非空内容 → `commitTurn()` 后发 `{type:'done', aborted:true}`；若空内容 → 仅发 `{type:'done', aborted:true}`，不写盘。
     - 其他异常 → 发 `{type:'error', error}`，**不写历史**（避免"写盘-回滚-再写"脏逻辑）。
  9. 无论成功失败 `finally` 删除 `active` 映射。
- **历史文件结构**：

```json
{ "version": 1, "sessions": { "12345": [ { "id": "...", "role": "user", "content": "...", "timestamp": 123 } ] } }
```

  - **单写者**：首次访问时 `readJsonFileSafe` 载入到 `this.cache`（损坏回退 `{version:1,sessions:{}}`），之后所有读写只操作内存缓存；`commitTurn` / `clearHistory` 更新缓存后，通过内部串行队列（`this.writeQueue = this.writeQueue.then(() => writeJsonFileAtomic(...))`）原子落盘。多个标签页并发结束请求时不会互相覆盖。
  - `courseId` 为空时统一落到 `'unknown'` 桶，避免丢消息。
- **并发**：`requestId` 由页面生成；主进程以 `Map<requestId, ActiveRequest>` 管理；同 WebContents 只允许 1 个活动请求。
- 所有对外发送统一走 `ActiveRequest.sender.send(WQXT_AI_IPC_CHANNELS.STREAM_CHUNK, payload)`，避免向错误的标签广播。

### 4.7 `apps/electron/src/main/lib/cdut/yanhu/wqxt-ai-panel.ts`（新建）

**内置预设（`data-preset` 与表单填充值，硬编码在运行时）**：

| preset | baseUrl | model |
|---|---|---|
| `deepseek` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `openai` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| `siliconflow` | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V3` |
| `moonshot` | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| `ollama` | `http://localhost:11434/v1` | `llama3.1` |

导出三块内容，**全部零外部依赖**：

1. `WQXT_AI_BRIDGE_TYPES`（与 4.1 中的定义逐字一致，作为 Preload 与页面共用的唯一权威）。
2. `WQXT_AI_PANEL_CSS`：新增/替换以下规则（沿用现有视觉 token：`#4F46E5 / #7C3AED`、毛玻璃、20px 圆角）：
   - Dock 胶囊保持现有样式（`#__profer-ai-dock-btn`）。
   - 面板：`display:none` → `.is-open{display:flex}`；`flex-direction:column`。
   - Header：logo + 标题 + 模型胶囊 `.ai-model-pill` + 状态点 + 4 个动作按钮（设置/新对话/最小化/关闭）。
   - `.ai-messages`：`flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; scroll-behavior:smooth`。
   - `.ai-msg` 两态（user 右对齐紫蓝渐变白字 / assistant 左对齐半透明白底）；`.ai-msg-reasoning` 折叠块（`details/summary` 风格）；`.ai-msg pre` 代码块 + `.ai-copy-btn`。
   - 欢迎卡 `.ai-welcome`（首次进入显示，含 4 个快捷问题胶囊）。
   - 设置抽屉 `.ai-settings`：`position:absolute; inset:0; background:rgba(15,23,42,.42); backdrop-filter:blur(6px); display:none`，打开后内部 `.ai-settings-card` 上滑。
   - 表单控件：`.ai-field`、`.ai-input`、`.ai-eye`、`.ai-range`、预设胶囊 `.ai-preset`。
   - 底栏 `.ai-composer`：上下文胶囊 `.ai-ctx-pill`（`is-on` 高亮）+ 自动增高 `textarea#__profer-ai-input`（`min-height:44px; max-height:132px`）+ 发送/停止按钮（流式中切换为红色停止图标）。
   - `@media (prefers-color-scheme: dark)` 与 `max-width:640px` 补齐。
   - 注意：CSS 是 TS 模板字符串，可正常使用反引号；但**不得包含 `${`**。
3. `buildAiDockHtml()` / `buildAiPanelHtml()` / `buildWqxtAiPanelRuntimeScript()`。

**HTML 结构（`buildAiPanelHtml()`）**：

```
#__profer-ai-panel
├─ .ai-panel-header
│  ├─ logo(img) + .ai-panel-title-col(title / .ai-model-pill[#__profer-ai-model-pill])
│  └─ .ai-panel-actions: #__profer-ai-settings-btn / #__profer-ai-new / #__profer-ai-min / #__profer-ai-close
├─ .ai-messages#__profer-ai-messages
│  └─ .ai-welcome#__profer-ai-welcome（4 个快捷提问按钮）
├─ .ai-settings#__profer-ai-settings
│  └─ .ai-settings-card
│     ├─ 预设行（6 个 .ai-preset，data-preset=deepseek/openai/qwen/siliconflow/moonshot/ollama）
│     ├─ baseUrl 输入 #__profer-ai-base-url
│     ├─ apiKey 输入(#__profer-ai-api-key, type=password) + 眼睛按钮 #__profer-ai-key-eye + 提示"留空保持不变"
│     ├─ model 输入 #__profer-ai-model
│     ├─ temperature range #__profer-ai-temp + 数值 #__profer-ai-temp-value
│     ├─ 保存并测试 #__profer-ai-save + 状态 #__profer-ai-save-status
│     └─ 关闭 #__profer-ai-settings-close
└─ .ai-composer
   ├─ .ai-ctx-pill#__profer-ai-ctx-pill（"携带本节课上下文 · 00:00/00:00"）
   ├─ textarea#__profer-ai-input（placeholder：向问渠助教提问…）
   └─ #__profer-ai-send（发送/停止）
```

**运行时（`buildWqxtAiPanelRuntimeScript()`）**——定义在升级器 IIFE 内，供 `sync()` 调用；不使用反引号与 `${`，全部 ES5 风格（与现有代码一致）：

- 状态：
  ```js
  var aiState = {
    open: false, streaming: false, requestId: '', ctxEnabled: true,
    history: [], config: null, messages: [], activeEl: null,
    reasoningText: '', answerText: ''
  };
  ```
- `aiSend(type, payload)` → `window.postMessage({ type: type, payload: payload || {} }, '*')`（请求统一为 `{type, payload}` 信封；回投统一为 `{type, requestId, ...fields}` 扁平信封）。
- `aiNewRequestId()` → `String(Date.now()) + Math.random().toString(16).slice(2)`；**所有请求 payload 都必须带 `requestId`**（含 GET_CONFIG / GET_HISTORY / CLEAR_HISTORY）。
- `collectClassroomContext()`：返回 `{courseId, courseTitle, chapterName, teacherName, currentTime, duration, currentSubtitle}`；`courseId` 解析顺序：`location.search` → hash → `findVideoRoomVm().course_id`；`chapterName` 取 `roomVm.subTitle`；`teacherName` 取 `.teacher_span`；`currentSubtitle` 取 `findOriginalSubtitleText()`。
- `formatClock(sec)`（复用现有 `formatTime`）。
- `renderMarkdown(text)`：先 `escapeHtml`，再处理围栏代码（占位符 token 防二次转义）→ `<pre><code>` + 复制按钮，最后处理行内代码、`**bold**`、行首 `- / 1.` 列表、`###` 标题、空行折段。不引入外部库。
  **硬约束**：运行时代码整体处于外层模板字符串内，`wqxt-ai-panel.ts` 中**严禁出现任何字面量反引号**。匹配围栏与行内代码一律用十六进制转义：
  ```js
  var fenceRegex = /\x60\x60\x60([a-zA-Z0-9_-]*)\n([\s\S]*?)\x60\x60\x60/g;
  var inlineCodeRegex = /\x60([^\x60]+)\x60/g;
  ```
  复制按钮的图标/文案也用普通引号字符串，绝不使用反引号拼接。
- `appendMessage(role, content, opts)`：创建气泡；assistant 带 `reasoningContent` 时先建折叠块；返回正文元素引用。
- `ensureAiAssistant()`：幂等挂载 dock/panel；绑定：
  - dock 点击 toggle；panel 点击 `stopPropagation`。
  - `#__profer-ai-min` / `#__profer-ai-close` → `closeAiPanel()`。
  - `#__profer-ai-new` → `confirm('清空本节课对话历史？')` 后清空 UI + `aiSend(REQUEST_CLEAR_HISTORY, { requestId: aiNewRequestId(), courseId })`。
  - `#__profer-ai-settings-btn` → `openAiSettings()`（先 `aiSend(REQUEST_GET_CONFIG, { requestId: aiNewRequestId() })` 回填表单）。
  - 预设胶囊点击 → 填表；`#__profer-ai-save` → 先取表单值组装 `patch` → `aiSend(REQUEST_SAVE_CONFIG, { requestId, patch })`，状态文本"测试中…/已保存，连接正常/失败：xxx"；**发送后立即把 Key 输入框 `value = ''`、`placeholder = '已保存，留空保持不变'`**（无论成功与否都先清空，失败时提示重新填写），避免 Key 明文驻留 DOM。
  - `#__profer-ai-key-eye` → 切换 `type`。
  - `#__profer-ai-temp` → 实时写 `#__profer-ai-temp-value`。
  - `#__profer-ai-ctx-pill` → 切换 `aiState.ctxEnabled`，写 `localStorage`，刷新胶囊文案。
  - 输入框 `input` 自适应高度；`keydown`：Enter 且非 Shift → 发送（中文输入法 `isComposing` 时忽略）。
  - `#__profer-ai-send` → 流式中执行 `aiSend(REQUEST_ABORT, { requestId })`；否则发送。
- `sendAiMessage()`：
  1. 取 `text` 去空；构造 `requestId = String(Date.now()) + Math.random().toString(16).slice(2)`。
  2. 渲染用户气泡，清空输入，隐藏欢迎卡。
  3. 创建 assistant 气泡占位（含"思考中…"骨架点），`aiState.streaming = true`，切发送按钮为停止。
  4. `aiSend(REQUEST_SEND, { requestId, courseId, text, includeContext: aiState.ctxEnabled, context: collectClassroomContext() })`。
- `window.addEventListener('message')` 分发（仅接受 `event.source === window` 且 `data.type` 以 `__profer_wqxt_ai_` 开头）：
  - `RESPONSE_STREAM`：
    - `delta`：`answerText += text`；`activeEl.textContent = answerText`；若视口距底 < 60px 则自动滚底。
    - `reasoning`：`reasoningText += text`，推理块实时更新；无推理块时动态创建。
    - `done`：`finalizeMessage(false)`。
    - `error`：`finalizeMessage(true, error)`。
  - `RESPONSE_CONFIG`：`aiState.config` 赋值，回填表单（Key 输入框永远留空，仅更新 placeholder 为"已保存，留空保持不变"），更新模型胶囊。
  - `RESPONSE_SAVE_RESULT`：`ok` 时更新占位文案、刷新胶囊并关闭抽屉；失败时保留抽屉并显示错误，同时再次清空 Key 输入框。
  - `RESPONSE_HISTORY`：`renderHistory(list)`（清空消息区 → 欢迎卡（空历史时）→ 逐条渲染；assistant 消息带 reasoning 时渲染折叠块）。
- `finalizeMessage(isError, errorText)`：`streaming=false`、恢复发送按钮、`activeEl.innerHTML = renderMarkdown(answerText)`（失败时追加错误横条）、追加复制按钮、滚底。
- `openAiPanel()`：面板 `is-open`；首次打开依次 `aiSend(REQUEST_GET_CONFIG, { requestId: aiNewRequestId() })` 与 `aiSend(REQUEST_GET_HISTORY, { requestId: aiNewRequestId(), courseId: collectClassroomContext().courseId })`；启动 `aiCtxTimer`（1 秒）刷新上下文胶囊。
- `closeAiPanel()`：移除 `is-open`；若正在流式则 `aiSend(REQUEST_ABORT, { requestId: aiState.requestId })`；清除 `aiCtxTimer`。
- 对外暴露 `window.__proferWqxtAiPanel = { open, close, destroy }`，供升级器 `destroy()` 显式中断。

### 4.8 `apps/electron/src/main/lib/cdut/yanhu/wqxt-livingroom-upgrader.ts`（修改）

1. 顶部新增 import：
   ```ts
   import { WQXT_AI_PANEL_CSS, buildAiDockHtml, buildAiPanelHtml, buildWqxtAiPanelRuntimeScript } from './wqxt-ai-panel'
   ```
2. **删除**现有 AI 面板样式段落 1873-2199（保留 dock 段 1874-1926，把 panel 相关规则移入 `WQXT_AI_PANEL_CSS`）。
3. **删除**旧 `buildAiDockHtml()` 与 `buildAiPanelHtml()`（2337-2406 行），改由新模块提供。
4. `buildWqxtUpgradeRuntimeScript()` 中：
   - `const cssJson = JSON.stringify(WQXT_UPGRADE_CSS + '\n' + WQXT_AI_PANEL_CSS)`。
   - 保持 `aiDockHtmlJson` / `aiPanelHtmlJson` 变量，来源改为新模块。
   - 删除旧 `ensureAiAssistant/openAiPanel/closeAiPanel`（3249-3290 行）以及 `appendToBody` 保留（新运行时复用）。
   - 在 `return` 的模板串中，于 `function sync()` 之前拼接运行时：
     ```ts
     return `;(function () { ...原有前文...` + buildWqxtAiPanelRuntimeScript() + `
     function sync() { ... }
     ...`
     ```
     （即把单一模板字面量拆成两段 + 中间纯字符串拼接；运行时内部不含反引号，安全。）
   - `sync()` 继续调用 `ensureAiAssistant()`；`destroy()` 中在移除节点前先 `try { window.__proferWqxtAiPanel && window.__proferWqxtAiPanel.destroy() } catch (e) {}`。
5. 保留 `WQXT_AI_DOCK_ID` / `WQXT_AI_PANEL_ID` 导出，供新模块复用（新模块从升级器 import 会形成循环依赖——**改为**把两个 ID 常量搬到 `wqxt-ai-panel.ts` 并从升级器 re-export，或让新模块自行定义同值常量。执行时选择：常量定义在 `wqxt-ai-panel.ts`，升级器 `export { WQXT_AI_DOCK_ID, WQXT_AI_PANEL_ID } from './wqxt-ai-panel'` 保持外部引用不变）。

### 4.9 `apps/electron/src/main/lib/cdut/yanhu/yanhu-preload.ts`（修改）

新增 `applyWqxtAiBridge()`，完全照抄下载桥的安全模型：

```ts
function applyWqxtAiBridge(): void {
  if (typeof window === 'undefined') return
  if (window.top !== window) return
  const w = window as any
  if (w.__profer_wqxt_ai_bridge_installed) return
  w.__profer_wqxt_ai_bridge_installed = true

  const reply = (type: string, requestId: string, data: Record<string, unknown>): void => {
    window.postMessage({ type, requestId, ...data }, '*')
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!event.data || typeof event.data !== 'object') return
    const type = event.data.type
    const payload = (event.data.payload && typeof event.data.payload === 'object') ? event.data.payload : {}
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''

    if (type === T.REQUEST_SEND) { ipcRenderer.send(CH.SEND_MESSAGE, payload); return }
    if (type === T.REQUEST_ABORT) { ipcRenderer.send(CH.ABORT_MESSAGE, payload); return }
    if (type === T.REQUEST_GET_CONFIG) {
      void ipcRenderer.invoke(CH.GET_CONFIG).then((cfg) => reply(T.RESPONSE_CONFIG, requestId, { config: cfg }))
      return
    }
    if (type === T.REQUEST_SAVE_CONFIG) {
      void ipcRenderer.invoke(CH.SAVE_CONFIG, payload).then((res) => reply(T.RESPONSE_SAVE_RESULT, requestId, { result: res }))
      return
    }
    if (type === T.REQUEST_GET_HISTORY) {
      void ipcRenderer.invoke(CH.GET_HISTORY, payload).then((list) => reply(T.RESPONSE_HISTORY, requestId, { messages: list }))
      return
    }
    if (type === T.REQUEST_CLEAR_HISTORY) {
      void ipcRenderer.invoke(CH.CLEAR_HISTORY, payload).then(() => reply(T.RESPONSE_HISTORY, requestId, { messages: [] }))
    }
  })

  ipcRenderer.on(CH.STREAM_CHUNK, (_e, payload) => window.postMessage({ type: T.RESPONSE_STREAM, payload }, '*'))
}
```

- `CH` 从共享常量取值不可用（零依赖约束）→ 在 Preload 内以字面量写死同一组渠道字符串，并在注释里标注"与 packages/shared/src/types/cdut.ts 的 WQXT_AI_IPC_CHANNELS 保持一致"；`T` 从 `./wqxt-ai-panel` import。
- 页面 → Preload 统一用 `{ type, payload }` 信封，`payload` 内必须带 `requestId`；Preload 回投统一为 `{ type: <response>, requestId, ...data }`（Stream 事件例外：回投 `{ type: RESPONSE_STREAM, payload }`），与 4.7 运行时约定一致。
- 在文件末尾追加 `applyWqxtAiBridge()` 调用。

### 4.10 `apps/electron/src/main/lib/cdut/yanhu/yanhu-express-manager.ts`（修改）

1. import：`import { wqxtAiHarness } from './wqxt-ai-harness'`。
2. 构造器（348-357 行）末尾调用 `wqxtAiHarness.attach()`。
3. `disposeTabView(tabId)`（877-902 行）中，在 `view.webContents.close()` **之前**：
   ```ts
   wqxtAiHarness.abortBySender(view.webContents.id)
   ```
   避免标签销毁后 SSE 仍在跑并回调已销毁 WebContents。
4. **页面刷新 / 跨文档跳转**：`attachTabListeners` 已有的 `did-start-navigation` 监听（910-912 行，签名 `(_event, url, isInPlace, isMainFrame)`）内追加：
   ```ts
   if (isMainFrame && !isInPlace) wqxtAiHarness.abortBySender(wc.id)
   ```
   `isInPlace === false` 即跨文档导航（F5 / Ctrl+R / 跳转新课），此时旧页面 DOM 监听全部失效但 WebContents 未销毁，必须立刻中断其所有在途 SSE，避免向新页面投递过时 `STREAM_CHUNK`。
5. `dispose()`（749 行起）遍历销毁标签时同样由 `disposeTabView` 覆盖，无需额外处理。

## 五、数据流与契约（执行时照此实现）

**页面 → Preload → 主进程**

| 页面 postMessage | IPC | 主进程行为 |
|---|---|---|
| `{type: REQUEST_SEND, requestId, payload: WqxtAiSendPayload}` | `send(SEND_MESSAGE)` | 开启 SSE，回多条 STREAM |
| `{type: REQUEST_ABORT, requestId, payload:{requestId}}` | `send(ABORT_MESSAGE)` | abort 对应 controller |
| `{type: REQUEST_GET_CONFIG, requestId}` | `invoke(GET_CONFIG)` | 回 `WqxtAiPublicConfig` |
| `{type: REQUEST_SAVE_CONFIG, requestId, payload: patch}` | `invoke(SAVE_CONFIG)` | 保存+探测，回 `WqxtAiSaveConfigResult` |
| `{type: REQUEST_GET_HISTORY, requestId, payload:{courseId}}` | `invoke(GET_HISTORY)` | 回 `WqxtAiMessage[]` |
| `{type: REQUEST_CLEAR_HISTORY, requestId, payload:{courseId}}` | `invoke(CLEAR_HISTORY)` | 清空并回 `[]` |

**主进程 → Preload → 页面**

| IPC 事件 | 回投消息 |
|---|---|
| `STREAM_CHUNK` | `{type: RESPONSE_STREAM, payload: WqxtAiStreamPayload}` |
| invoke 结果 | `{type: RESPONSE_CONFIG / RESPONSE_SAVE_RESULT / RESPONSE_HISTORY, requestId, ...}` |

## 六、UI 交互细则

- 欢迎卡文案：介绍"可结合当前课程、章节、播放进度与字幕作答"，并给 4 个快捷提问：「总结本节重点」「解释当前这句话」「老师刚才提到的概念是什么」「出一道自测题」。点击即填入并发送。
- 上下文胶囊关闭时文案变灰并显示"未携带本节课上下文"；开启时显示 `课程名 · 08:45 / 45:20`。
- 流式中发送按钮切换为停止（`is-stop`，红色 `#EF4444`），点击即中断；输入框禁用发送但可继续编辑。
- 错误展示：气泡内追加一条红色细横条（`error` 文本），不弹原生 alert。
- 设置抽屉的 API Key 输入 `type=password`，占位文案：已保存时"已保存，留空保持不变"，未保存时"请输入 API Key（本地 Ollama 可留空）"。
- 关闭面板不中断已完成的会话；关闭时若仍在流式则中断。

## 七、假设与边界

1. `contextIsolation:false` 保持不变；若未来改为 `true`，preload 的 `window.postMessage` 回投需改为 `webFrame.executeJavaScript` 或 contentBridge，本次不做。
2. 页面主世界可以读取 `__vue__`（现有代码已依赖），上下文采集沿用同一手段；读不到时字段降级为空串/0，不阻塞发送。
3. Ollama 本地默认 `http://localhost:11434/v1`，允许无 Key；请求头仅在 `apiKey` 非空时附带 `Authorization`。
4. 主进程 `fetch` 在 Electron 43（Node 22）自带，可直接使用；SSE 解析不依赖第三方库。
5. 历史仅存文本，不存图片/附件；单课程上限 80 条，超出按时间裁剪最旧。
6. 系统提示词后续替换只改 `wqxt-ai-prompts.ts`，不改其他文件。

## 八、验证步骤

1. `npm run typecheck` 通过（`strict: true`，注意 `exactOptionalPropertyTypes` 未开启）。
2. `npm run build` 通过（重点确认 `build:yanhu-preload` 能把新模块打进 `dist/yanhu-preload.cjs`，且注入字符串无语法错误）。
3. `npm run dev` 启动，进入带 `course_id` 的问渠课堂播放页：
   - 右下角出现 Dock，点击展开新面板，无占位文案。
   - 齿轮打开设置抽屉，选择 DeepSeek 预设，填入 Key，保存并测试 → 显示"连接正常"（Dry-Run 探测，无需服务器开放 `/models`）。
   - 保存后立即在控制台执行 `document.getElementById('__profer-ai-api-key').value`，结果必须为空串（Key 不驻留 DOM）。
   - 开启上下文开关，提问"请总结老师目前讲到的重点"：回答以流式逐字出现，中文无 `` 乱码，推理模型先出现可折叠"思考过程"。
   - 中途点停止 → 立即中断，已生成内容保留；若已生成内容为空则历史不新增记录。
   - 切换另一门课程 → 历史为空；切回原课程 → 历史恢复。
   - 「新对话」清空当前课程历史，其他课程不受影响。
4. 在流式进行中按 F5 / Ctrl+R 刷新页面 → 主进程日志应立刻出现 abort，刷新后的新页面不再收到旧 `STREAM_CHUNK`。
5. 关闭标签页 → 主进程无残留请求（观察日志无 `fetch` 未结束告警）。
6. 断网 / 错误 Key / Model 不存在时发送 → 气泡内出现明确错误，不写历史，不崩溃、页面不冻结。
7. 长会话（连续提问 20+ 轮）→ 请求历史自动收敛到 16,000 字符以内，不出现 `context_length_exceeded`。

## 九、执行顺序

1. shared 类型与配置路径、`app-settings` 归一化、`AppSettings` 扩展。
2. `wqxt-ai-prompts.ts` + `wqxt-ai-harness.ts` + manager 挂载与销毁中断。
3. `wqxt-ai-panel.ts`（CSS/HTML/运行时/桥接常量）。
4. 升级器改造（拼接 CSS/HTML/运行时，删除旧占位实现）。
5. `yanhu-preload.ts` 桥接。
6. `npm run typecheck` → `npm run build` 修正类型/打包问题。
7. 按第八节手工验证。

## 十、审阅修正对照（已并入上文，执行时逐条核对）

| 维度 | 修正前 | 最终落地 |
|---|---|---|
| 端点拼接 | 无 `/chat/completions` 一律补 `/v1/chat/completions`，默认 `.../v1` 会拼成 `/v1/v1` | `resolveChatEndpoint` 三层判定：完整路径原样 → `/v1` 结尾直接接 `/chat/completions` → 其余补 `/v1/chat/completions` |
| SSE 解析 | 每 chunk 新建 `TextDecoder` + 直接 `split('\n')` | 单实例 `TextDecoder('utf-8')` + `{stream:true}` + `lineBuffer` 保留半行 + 行尾 `\r` 清理 + 单行坏包跳过 |
| 连通测试 | `GET /models` | Dry-Run `POST /chat/completions`（`max_tokens:1`, `stream:false`），覆盖 Base URL / Key / Model |
| 生命周期 | 仅标签销毁中断 | 追加 `did-start-navigation`（`isMainFrame && !isInPlace`）中断，覆盖 F5 / 跳课 |
| 历史落盘 | 先写用户提问，失败回滚 | 仅 `done` / 有内容的 `aborted` 时一次性写 `[user, assistant]`；错误不写盘 |
| 并发写 | 每次直接读文件 | 单例内存缓存 + 串行写队列，杜绝多标签覆盖 |
| 上下文长度 | 固定 `slice(-22)` | `slice(-22)` + 16,000 字符倒序累加安全闸 |
| 反引号 | Markdown 正则直接写字面量反引号 | 全部改用 `\x60`；运行时字符串内零字面量反引号 |
| API Key DOM | 保存后仍留在 input.value | 保存即清空 `value` 并改为占位文案；`GET_CONFIG` 永不回填明文 |

**编码红线（写代码时必须遵守）**：
- `wqxt-ai-panel.ts` 中 `buildWqxtAiPanelRuntimeScript()` 返回的字符串内**不得出现任何反引号字符与 `${` 序列**（含正则、注释、模板拼接）。
- `buildWqxtAiPanelHtml()` 属于 TS 侧 HTML 模板，可正常使用反引号与 `${CDUT_STUDIO_LOGO_DATA_URL}` 构建期插值；但不得把任何需要注入页面的运行时代码写进 HTML 字符串。
- `TextDecoder`、`lineBuffer`、`resolveChatEndpoint`、`commitTurn` 四个实现点必须在 PR 中可见并被第八节验证覆盖。

## 十一、执行现状与收尾清单（本轮唯一剩余工作）

### 11.1 已完成，禁止重复修改

| 文件 | 状态 |
|---|---|
| `packages/shared/src/types/cdut.ts` | 已追加 `WQXT_AI_IPC_CHANNELS` 与 10 个 AI 契约（978-1073 行） |
| `apps/electron/src/types/index.ts` | `AppSettings.llmConfig?: WqxtAiConfig` |
| `apps/electron/src/main/lib/config-paths.ts` | `getWqxtChatSessionsPath()` |
| `apps/electron/src/main/lib/app-settings.ts` | `DEFAULT_LLM_CONFIG` / `normalizeLlmConfig` / `updateSettings` 深合并 |
| `.../cdut/yanhu/wqxt-ai-prompts.ts` | 新建，`buildSystemPrompt` / `DEFAULT_WQXT_SYSTEM_PROMPT` |
| `.../cdut/yanhu/wqxt-ai-harness.ts` | 新建，`wqxtAiHarness` 单例（`attach` / `abortBySender` / `probe` / `streamChat` / `commitTurn`） |
| `.../cdut/yanhu/yanhu-express-manager.ts` | 构造器 `attach()`、`disposeTabView` 中断、`did-start-navigation` 中断 |
| `.../cdut/yanhu/wqxt-ai-panel.ts` | 新建（1410 行），CSS / HTML / 运行时 / `WQXT_AI_BRIDGE_TYPES` 全部就绪 |

### 11.2 `wqxt-livingroom-upgrader.ts` 剩余 6 处编辑

当前该文件只有顶部 import（1-18 行）已改；以下 6 处会导致**编译失败或面板不可用**，必须全部完成：

**① 删除第 18 行 re-export 与第 40-43 行重复常量**（`import` 已引入同名绑定，保留任一 `export const` 都会报 TS2440 / TS2300）
```ts
// 删除
export { WQXT_AI_DOCK_ID, WQXT_AI_PANEL_ID }
// 删除
/** AI 问渠助手 Dock 胶囊 ID */
export const WQXT_AI_DOCK_ID = '__profer-ai-dock-btn'
/** AI 问渠助手留白窗体 ID */
export const WQXT_AI_PANEL_ID = '__profer-ai-panel'
```
> 全仓已确认无其他文件从升级器导入这两个 ID（`wqxt-livingroom-cleaner.ts` 只导入 `buildWqxtUpgradeRuntimeScript`），删除安全。

**② 第 2670 行拼接面板 CSS**
```ts
const cssJson = JSON.stringify(WQXT_UPGRADE_CSS + '\n' + WQXT_AI_PANEL_CSS)
```

**③ 删除第 2347-2416 行旧 TS 构建器** `buildAiDockHtml()` 与 `buildAiPanelHtml()`（含注释，到 `}` 为止），改由 import 的新实现提供（`AI_DOCK_HTML` / `AI_PANEL_HTML` 变量名不变）。

**④ 删除模板字符串内（第 3259-3300 行）旧的运行时三函数** `ensureAiAssistant()` / `openAiPanel()` / `closeAiPanel()`。它们与新注入的运行时同名重复；删除后，第 3867 行 `closeAiPanel()`（Esc 收起）与第 6008 行 `ensureAiAssistant()`（`sync()` 内）自动解析到新函数，无需改动调用点。

**⑤ 在第 6003 行 `    function sync() {` 之前拆分模板字面量并注入运行时**
```ts
    ` + buildWqxtAiPanelRuntimeScript() + `
    function sync() {
```
> 注入点必须在 `sync()` 调用（第 6024 行）之前，保证 `var AI_BRIDGE` / `var AI_WELCOME_INNER` 已赋值。

**⑥ 在 `destroy()` 第 5988 行删除 Dock 节点之前回收运行时状态**
```ts
      if (window.__proferWqxtAiPanel && typeof window.__proferWqxtAiPanel.destroy === 'function') {
        try { window.__proferWqxtAiPanel.destroy(); } catch (e) {}
      }
```

### 11.3 `yanhu-preload.ts` 新增 `applyWqxtAiBridge()`

在文件顶部补 `import { WQXT_AI_BRIDGE_TYPES as T } from './wqxt-ai-panel'`（同目录零依赖模块，不引入 `@profer/shared`），然后按下载桥范式实现：

```ts
// IPC 渠道名必须与 packages/shared 的 WQXT_AI_IPC_CHANNELS 逐字一致
const WQXT_AI_IPC = {
  SEND_MESSAGE: 'yanhu-express:wqxt-ai-send',
  ABORT_MESSAGE: 'yanhu-express:wqxt-ai-abort',
  GET_CONFIG: 'yanhu-express:wqxt-ai-get-config',
  SAVE_CONFIG: 'yanhu-express:wqxt-ai-save-config',
  GET_HISTORY: 'yanhu-express:wqxt-ai-get-history',
  CLEAR_HISTORY: 'yanhu-express:wqxt-ai-clear-history',
  STREAM_CHUNK: 'yanhu-express:wqxt-ai-stream-chunk',
} as const

function reply(type: string, requestId: unknown, extra: Record<string, unknown>): void {
  const id = typeof requestId === 'string' ? requestId : ''
  window.postMessage(Object.assign({ type, requestId: id }, extra), '*')
}

function applyWqxtAiBridge(): void {
  if (window.top !== window) return
  const w = window as any
  if (w.__profer_wqxt_ai_bridge_installed) return
  w.__profer_wqxt_ai_bridge_installed = true

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || typeof data !== 'object') return
    const type = data.type
    if (typeof type !== 'string' || type.indexOf('__profer_wqxt_ai_') !== 0) return
    const payload = data.payload || {}
    const requestId = payload.requestId

    if (type === T.REQUEST_SEND) { ipcRenderer.send(WQXT_AI_IPC.SEND_MESSAGE, payload); return }
    if (type === T.REQUEST_ABORT) { ipcRenderer.send(WQXT_AI_IPC.ABORT_MESSAGE, payload); return }
    if (type === T.REQUEST_GET_CONFIG) {
      void ipcRenderer.invoke(WQXT_AI_IPC.GET_CONFIG).then((cfg) => reply(T.RESPONSE_CONFIG, requestId, cfg || {}))
      return
    }
    if (type === T.REQUEST_SAVE_CONFIG) {
      // 页面提交扁平补丁 { requestId, ...patch }，直接整体下发；结果扁平回投
      void ipcRenderer.invoke(WQXT_AI_IPC.SAVE_CONFIG, payload).then((res) => reply(T.RESPONSE_SAVE_RESULT, requestId, res || {}))
      return
    }
    if (type === T.REQUEST_GET_HISTORY) {
      void ipcRenderer.invoke(WQXT_AI_IPC.GET_HISTORY, payload).then((list) => reply(T.RESPONSE_HISTORY, requestId, { messages: Array.isArray(list) ? list : [] }))
      return
    }
    if (type === T.REQUEST_CLEAR_HISTORY) {
      void ipcRenderer.invoke(WQXT_AI_IPC.CLEAR_HISTORY, payload).then(() => reply(T.RESPONSE_HISTORY, requestId, { messages: [] }))
    }
  })

  ipcRenderer.on(WQXT_AI_IPC.STREAM_CHUNK, (_event, payload) => {
    try {
      if (!payload || typeof payload !== 'object') return
      window.postMessage({ type: T.RESPONSE_STREAM, payload }, '*')
    } catch (err) {
      console.warn('[AI 问渠助手·Preload] 流事件回投失败:', err)
    }
  })
}
```

落地要点（与页面运行时契约必须逐字对齐）：
- `RESPONSE_CONFIG` / `RESPONSE_SAVE_RESULT` **扁平回投**（页面直接读 `msg.baseUrl` / `msg.ok` / `msg.error` / `msg.config`），禁止再包一层 `result`。
- `RESPONSE_HISTORY` 回投 `{ messages }`（页面读 `msg.messages`）。
- `RESPONSE_STREAM` 保持 `{ type, payload }` 嵌套（页面读 `msg.payload`）。
- 末尾追加 `applyWqxtAiBridge()` 调用（顺序在 `applyWqxtDownloadBridge()` 之后）。

### 11.4 验证

```bash
cd apps/electron
npm run typecheck
npm run build
```
- `typecheck` 重点消错：`TS2440 (import 冲突)`、`TS2300 (重复标识符)`、`TS2339 (未导出成员)`。
- `build` 重点确认 `build:yanhu-preload` 成功后，`dist/yanhu-preload.cjs` 内同时含 `__profer_wqxt_ai_send` 与 `__profer-ai-panel`（说明面板资源与桥接已进入 preload 包）。
- 若 typecheck 通过但运行期面板不出现，按第 11.2-⑤ 核对注入点是否在 `sync()` 调用之前。

### 11.5 明确不做

- 不新增依赖、不改 `vite`/`esbuild` 配置、不改 `electron-builder.yml`。
- 不改动 `wqxt-livingroom-cleaner.ts`（其仅透传运行时脚本）。
- 不实现计划外的多会话列表 UI、导出对话、联网搜索等扩展功能。

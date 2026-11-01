/**
 * AI 问渠助手 · LLM Chat Harness（主进程单例）
 *
 * 职责：
 *   - 统一持有 LLM 配置（读写 app-settings 的 llmConfig），API Key 只留在主进程；
 *   - 按 courseId 隔离的多轮会话历史，单写者内存缓存 + 串行原子落盘；
 *   - OpenAI-Compatible `/v1/chat/completions` SSE 流式请求与解析；
 *   - 活动请求管理与中断（标签销毁 / 页面刷新 / 用户手动停止）；
 *   - 通过 `WQXT_AI_IPC_CHANNELS.STREAM_CHUNK` 向发起请求的 WebContents 回投流式数据。
 *
 * 安全边界：本模块不向页面暴露任何特权对象，页面只能通过 Preload 桥接发送消息。
 */

import { ipcMain, type WebContents } from 'electron'
import {
  WQXT_AI_IPC_CHANNELS,
  type WqxtAiConfig,
  type WqxtAiConfigPatch,
  type WqxtAiContextSnapshot,
  type WqxtAiMessage,
  type WqxtAiPublicConfig,
  type WqxtAiSaveConfigResult,
  type WqxtAiSendPayload,
  type WqxtAiStreamPayload,
  type WqxtLivingRoomContext,
} from '@profer/shared'
import { getSettings, updateSettings } from '../../app-settings'
import { getWqxtChatSessionsPath } from '../../config-paths'
import { readJsonFileSafe, writeJsonFileAtomic } from '../../safe-file'
import { buildSystemPrompt } from './wqxt-ai-prompts'

/** 会话历史文件结构 */
interface WqxtChatSessionsStore {
  version: number
  sessions: Record<string, WqxtAiMessage[]>
}

interface ActiveRequest {
  controller: AbortController
  sender: WebContents
  courseId: string
  assistantId: string
}

/** 单课程历史最多保留的消息条数 */
const MAX_MESSAGES_PER_COURSE = 80
/** 最多回溯的近期消息条数 */
const MAX_HISTORY_MESSAGES = 22
/** 历史正文累计字符上限（约 8k-10k tokens 安全水位） */
const MAX_HISTORY_CHARS = 16000
/** 连通性探测超时 */
const PROBE_TIMEOUT_MS = 20000

const FALLBACK_CONFIG: WqxtAiConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  modelName: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
  stream: true,
}

/**
 * 端点规整：规避 `https://api.deepseek.com/v1` 被拼成 `/v1/v1/chat/completions` 的 404。
 * 三层判定：完整 completions 路径原样返回 → 以 `/v1` 结尾直接接 `/chat/completions` → 其余补 `/v1/chat/completions`。
 */
function resolveChatEndpoint(rawUrl: string): string {
  const clean = rawUrl.trim().replace(/\/+$/, '')
  // 兼容带 query 的完整端点（如中转代理 ?token=xxx）
  if (clean.includes('/chat/completions')) return clean
  if (clean.endsWith('/v1')) return `${clean}/chat/completions`
  return `${clean}/v1/chat/completions`
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function isMessage(value: unknown): value is WqxtAiMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<WqxtAiMessage>
  return (
    typeof message.id === 'string' &&
    typeof message.content === 'string' &&
    typeof message.timestamp === 'number' &&
    (message.role === 'system' || message.role === 'user' || message.role === 'assistant')
  )
}

function buildContextSnapshot(ctx?: WqxtLivingRoomContext): WqxtAiContextSnapshot | undefined {
  if (!ctx) return undefined
  const snapshot: WqxtAiContextSnapshot = {
    courseTitle: ctx.courseTitle || '',
    chapterName: ctx.chapterName || '',
    teacherName: ctx.teacherName || '',
    currentTimeLabel:
      ctx.duration > 0 ? `${formatClock(ctx.currentTime)} / ${formatClock(ctx.duration)}` : '',
    currentSubtitle: ctx.currentSubtitle || '',
  }
  const hasAny = Object.values(snapshot).some((item) => item.length > 0)
  return hasAny ? snapshot : undefined
}

function toPublicConfig(config: WqxtAiConfig): WqxtAiPublicConfig {
  return {
    baseUrl: config.baseUrl,
    // 明文 apiKey 永不下发；页面输入框恒为空
    apiKey: '',
    hasApiKey: config.apiKey.length > 0,
    modelName: config.modelName,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    stream: config.stream,
  }
}

class WqxtAiHarness {
  /** requestId -> 活动请求 */
  private readonly active = new Map<string, ActiveRequest>()
  /** 历史会话单写者内存缓存 */
  private cache: WqxtChatSessionsStore | null = null
  /** 串行落盘队列（不可 readonly：每次落盘都要链式追加） */
  private writeQueue: Promise<void> = Promise.resolve()
  private attached = false

  /** 注册全部 IPC 监听（幂等） */
  attach(): void {
    if (this.attached) return
    this.attached = true

    ipcMain.on(WQXT_AI_IPC_CHANNELS.SEND_MESSAGE, (event, payload: unknown) => {
      this.onSend(event.sender, payload)
    })
    ipcMain.on(WQXT_AI_IPC_CHANNELS.ABORT_MESSAGE, (event, payload: unknown) => {
      this.onAbort(event.sender, payload)
    })
    ipcMain.handle(WQXT_AI_IPC_CHANNELS.GET_CONFIG, () => toPublicConfig(this.getConfig()))
    ipcMain.handle(WQXT_AI_IPC_CHANNELS.SAVE_CONFIG, (_event, payload: unknown) => {
      // 页面提交扁平补丁 { requestId, ...patch }，此处剥离 requestId 后合并
      const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      const patch: WqxtAiConfigPatch = {
        baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : undefined,
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : undefined,
        modelName: typeof raw.modelName === 'string' ? raw.modelName : undefined,
        temperature: typeof raw.temperature === 'number' ? raw.temperature : undefined,
        maxTokens: typeof raw.maxTokens === 'number' ? raw.maxTokens : undefined,
        stream: typeof raw.stream === 'boolean' ? raw.stream : undefined,
      }
      return this.saveConfig(patch)
    })
    ipcMain.handle(WQXT_AI_IPC_CHANNELS.GET_HISTORY, (_event, payload: unknown) => {
      const courseId = this.readCourseId(payload)
      return this.readHistory(courseId)
    })
    ipcMain.handle(WQXT_AI_IPC_CHANNELS.CLEAR_HISTORY, (_event, payload: unknown) => {
      this.clearHistory(this.readCourseId(payload))
    })
  }

  /** 中断某个 WebContents 名下所有在途请求（标签销毁 / 页面刷新 / 导航跳转） */
  abortBySender(webContentsId: number): void {
    for (const [requestId, request] of this.active) {
      if (request.sender.id !== webContentsId) continue
      try {
        request.controller.abort()
      } catch {
        // 已结束
      }
      this.active.delete(requestId)
    }
  }

  private readCourseId(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown'
    const value = (payload as { courseId?: unknown }).courseId
    return typeof value === 'string' && value ? value : 'unknown'
  }

  private onSend(sender: WebContents, raw: unknown): void {
    const payload = raw as Partial<WqxtAiSendPayload> | undefined
    if (!payload || typeof payload !== 'object') return
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!requestId || !text) return
    if (this.active.has(requestId)) return
    const courseId = typeof payload.courseId === 'string' && payload.courseId ? payload.courseId : 'unknown'
    const includeContext = payload.includeContext === true
    const context =
      payload.context && typeof payload.context === 'object' ? payload.context : undefined

    // 同一 WebContents 单流：新请求先中断旧请求，避免并行 SSE 互相串流
    this.abortBySender(sender.id)

    const controller = new AbortController()
    const assistantId = createId('assistant')
    this.active.set(requestId, { controller, sender, courseId, assistantId })

    const sendPayload: WqxtAiSendPayload = { requestId, courseId, text, includeContext, context }
    void this.streamChat(requestId, sender, sendPayload).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.send(sender, { requestId, type: 'error', error: message })
      this.active.delete(requestId)
    })
  }

  private onAbort(sender: WebContents, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return
    const requestId = (raw as { requestId?: unknown }).requestId
    if (typeof requestId !== 'string' || !requestId) return
    const request = this.active.get(requestId)
    if (!request) return
    // 仅允许发起者本人中断
    if (request.sender.id !== sender.id) return
    try {
      request.controller.abort()
    } catch {
      // 已结束
    }
  }

  private getConfig(): WqxtAiConfig {
    const settings = getSettings()
    return settings.llmConfig ?? { ...FALLBACK_CONFIG }
  }

  private async saveConfig(patch: WqxtAiConfigPatch): Promise<WqxtAiSaveConfigResult> {
    const current = this.getConfig()
    const next: WqxtAiConfig = {
      baseUrl:
        typeof patch.baseUrl === 'string' && patch.baseUrl.trim()
          ? patch.baseUrl.trim()
          : current.baseUrl,
      // 空串 / 缺省 = 保留原 Key
      apiKey: typeof patch.apiKey === 'string' && patch.apiKey ? patch.apiKey : current.apiKey,
      modelName:
        typeof patch.modelName === 'string' && patch.modelName.trim()
          ? patch.modelName.trim()
          : current.modelName,
      temperature:
        typeof patch.temperature === 'number' && Number.isFinite(patch.temperature)
          ? patch.temperature
          : current.temperature,
      maxTokens:
        typeof patch.maxTokens === 'number' && Number.isFinite(patch.maxTokens)
          ? patch.maxTokens
          : current.maxTokens,
      stream: typeof patch.stream === 'boolean' ? patch.stream : current.stream,
    }
    updateSettings({ llmConfig: next })
    const persisted = this.getConfig()
    try {
      await this.probe(persisted)
      return { ok: true, config: toPublicConfig(persisted) }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        config: toPublicConfig(persisted),
      }
    }
  }

  private buildHeaders(config: WqxtAiConfig): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
    return headers
  }

  /**
   * Dry-Run 最小 Chat 补全探测：同时校验网络、Base URL、API Key 与 Model。
   * 不使用 `GET /models`（国内多家兼容网关会单独限权或 404，导致误报）。
   */
  private async probe(config: WqxtAiConfig): Promise<void> {
    const endpoint = resolveChatEndpoint(config.baseUrl)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.buildHeaders(config),
      body: JSON.stringify({
        model: config.modelName,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300).trim()
      throw new Error(`HTTP ${response.status}${detail ? ` · ${detail}` : ''}`)
    }
    // 消费响应体，避免连接悬挂
    await response.text().catch(() => '')
  }

  private loadStore(): WqxtChatSessionsStore {
    if (this.cache) return this.cache
    const raw = readJsonFileSafe<unknown>(getWqxtChatSessionsPath())
    const store: WqxtChatSessionsStore = { version: 1, sessions: {} }
    if (raw && typeof raw === 'object') {
      const candidate = raw as Partial<WqxtChatSessionsStore>
      if (candidate.sessions && typeof candidate.sessions === 'object') {
        for (const [courseId, list] of Object.entries(candidate.sessions)) {
          if (!Array.isArray(list)) continue
          const valid = list.filter(isMessage)
          if (valid.length) store.sessions[courseId] = valid
        }
      }
    }
    this.cache = store
    return store
  }

  private schedulePersist(): void {
    if (!this.cache) return
    // 快照化：后续内存变更不影响本次待写入内容
    const snapshot = JSON.parse(JSON.stringify(this.cache)) as WqxtChatSessionsStore
    this.writeQueue = this.writeQueue.then(() => {
      try {
        writeJsonFileAtomic(getWqxtChatSessionsPath(), snapshot)
      } catch (err) {
        console.warn('[AI 问渠助手] 会话历史落盘失败:', err)
      }
    })
  }

  private readHistory(courseId: string): WqxtAiMessage[] {
    const store = this.loadStore()
    const list = store.sessions[courseId] ?? []
    return list.map((message) => ({ ...message }))
  }

  /**
   * 一轮问答正常结束或用户主动打断后调用：一次性原子落盘 [用户, 助手]。
   * 网络错误不写盘，彻底移除「写盘 - 回滚 - 再写盘」脏逻辑。
   */
  private commitTurn(courseId: string, user: WqxtAiMessage, assistant: WqxtAiMessage): void {
    const store = this.loadStore()
    const list = store.sessions[courseId] ?? []
    list.push(user, assistant)
    if (list.length > MAX_MESSAGES_PER_COURSE) {
      list.splice(0, list.length - MAX_MESSAGES_PER_COURSE)
    }
    store.sessions[courseId] = list
    this.schedulePersist()
  }

  private clearHistory(courseId: string): void {
    const store = this.loadStore()
    if (!store.sessions[courseId]) return
    delete store.sessions[courseId]
    this.schedulePersist()
  }

  /** 组装请求消息：system + 近期历史（22 条 + 16,000 字符安全闸）+ 本轮提问 */
  private buildRequestMessages(
    history: WqxtAiMessage[],
    userMessage: WqxtAiMessage,
    context?: WqxtLivingRoomContext,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: buildSystemPrompt(context) },
    ]
    const recent = history
      .filter(
        (message) =>
          message.role !== 'system' &&
          typeof message.content === 'string' &&
          message.content.trim().length > 0,
      )
      .slice(-MAX_HISTORY_MESSAGES)
    const kept: WqxtAiMessage[] = []
    let chars = 0
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const message = recent[i]
      const length = message.content.length
      // 至少保留最近一条，避免全部丢弃
      if (kept.length > 0 && chars + length > MAX_HISTORY_CHARS) break
      kept.push(message)
      chars += length
    }
    kept.reverse()
    for (const message of kept) {
      messages.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content })
    }
    messages.push({ role: 'user', content: userMessage.content })
    return messages
  }

  private send(target: WebContents, payload: WqxtAiStreamPayload): void {
    try {
      if (!target.isDestroyed()) target.send(WQXT_AI_IPC_CHANNELS.STREAM_CHUNK, payload)
    } catch {
      // 目标视口已销毁
    }
  }

  private async streamChat(
    requestId: string,
    sender: WebContents,
    payload: WqxtAiSendPayload,
  ): Promise<void> {
    const request = this.active.get(requestId)
    if (!request) return
    const config = this.getConfig()
    const courseId = payload.courseId || 'unknown'
    const context = payload.includeContext ? payload.context : undefined
    const contextSnapshot = buildContextSnapshot(context)
    const userMessage: WqxtAiMessage = {
      id: createId('user'),
      role: 'user',
      content: payload.text,
      timestamp: Date.now(),
      ...(contextSnapshot ? { contextSnapshot } : {}),
    }

    let answer = ''
    let reasoning = ''

    const fail = (err: unknown): void => {
      const error = err instanceof Error ? err : new Error(String(err))
      const aborted = error.name === 'AbortError' || (err as { code?: unknown })?.code === 'ABORT_ERR'
      if (aborted) {
        if (answer || reasoning) {
          this.commitTurn(courseId, userMessage, {
            id: request.assistantId,
            role: 'assistant',
            content: answer,
            timestamp: Date.now(),
            ...(reasoning ? { reasoningContent: reasoning } : {}),
          })
        }
        this.send(sender, { requestId, type: 'done', aborted: true })
        return
      }
      this.send(sender, { requestId, type: 'error', error: error.message })
    }

    try {
      const messages = this.buildRequestMessages(this.readHistory(courseId), userMessage, context)
      const endpoint = resolveChatEndpoint(config.baseUrl)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify({
          model: config.modelName,
          messages,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          stream: true,
        }),
        signal: request.controller.signal,
      })

      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 300).trim()
        throw new Error(`HTTP ${response.status}${detail ? ` · ${detail}` : ''}`)
      }
      if (!response.body) throw new Error('模型服务未返回可读流')

      const reader = response.body.getReader()
      // 单实例 decoder + stream:true，避免多字节中文跨包截断乱码
      const decoder = new TextDecoder('utf-8')
      let lineBuffer = ''

      const handleData = (data: string): void => {
        if (!data || data === '[DONE]') return
        let parsed: unknown
        try {
          parsed = JSON.parse(data)
        } catch {
          // 单行坏包跳过，不中断整条流
          return
        }
        const choice = (parsed as {
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string; reasoning?: string }
            message?: { content?: string; reasoning_content?: string }
            text?: string
          }>
        }).choices?.[0]
        if (!choice) return
        const reasoningText =
          choice.delta?.reasoning_content ?? choice.delta?.reasoning ?? choice.message?.reasoning_content ?? ''
        if (reasoningText) {
          reasoning += reasoningText
          this.send(sender, { requestId, type: 'reasoning', text: reasoningText })
        }
        const contentText = choice.delta?.content ?? choice.message?.content ?? choice.text ?? ''
        if (contentText) {
          answer += contentText
          this.send(sender, { requestId, type: 'delta', text: contentText })
        }
      }

      const handleLine = (rawLine: string): void => {
        const line = rawLine.replace(/\r$/, '')
        if (!line.startsWith('data:')) return
        const data = line.slice(5).trim()
        handleData(data)
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        // 未闭合的半行留在缓冲区，等待下一次 chunk 拼接
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) handleLine(line)
      }
      // flush 残余多字节字符
      lineBuffer += decoder.decode()
      if (lineBuffer.trim()) handleLine(lineBuffer)

      this.commitTurn(courseId, userMessage, {
        id: request.assistantId,
        role: 'assistant',
        content: answer,
        timestamp: Date.now(),
        ...(reasoning ? { reasoningContent: reasoning } : {}),
      })
      this.send(sender, { requestId, type: 'done' })
    } catch (err) {
      fail(err)
    } finally {
      this.active.delete(requestId)
    }
  }
}

export const wqxtAiHarness = new WqxtAiHarness()

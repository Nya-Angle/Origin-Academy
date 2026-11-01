/**
 * CDUT 专区特区账户与认证类型定义
 */

export interface BrowserViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export type YanhuViewBounds = BrowserViewBounds

export interface CdutSavedAccountItem {
  username: string
  password?: string
  lastLoginAt: number
}

export const CDUT_AUTH_IPC_CHANNELS = {
  GET_SAVED_ACCOUNTS: 'cdut-auth:get-saved-accounts',
  SAVE_ACCOUNT: 'cdut-auth:save-account',
  REMOVE_ACCOUNT: 'cdut-auth:remove-account',
} as const

// ===== 智联万站与问渠学堂 URL 与入口 =====

/** 智联万站默认入口（办事大厅升级版） */
export const YANHU_DEFAULT_HOME_URL = 'https://bsdt.cdut.edu.cn/EIP/onewebsitehande/toPersonalCenterPage.htm'

/**
 * AI 问渠学堂默认入口：CAS 统一认证（换票后回调问渠课堂 tenant 21）。
 *
 * 这里的 `service` 必须是**已在校统一身份认证注册**的 `yjapi.wqxt.cdut.edu.cn/casapi`
 * 回调地址——CAS 会用它换票并跳转 classroom。切不可改为 `service=https://wqxt.cdut.edu.cn/`：
 * 该 service 未注册，CAS 只会返回「未认证授权的服务」错误页，导致所有问渠标签报错。
 */
export const WQXT_DEFAULT_HOME_URL =
  'https://cas.paas.cdut.edu.cn/cas/login?service=https%3A%2F%2Fyjapi.wqxt.cdut.edu.cn%2Fcasapi%2Findex.php%3Fforward%3Dhttps%253A%252F%252Fclassroom.wqxt.cdut.edu.cn%252F%253Ftenant_code%253D21%26r%3Dauth%252Flogin%26tenant_code%3D21'

/** AI 问渠学堂课堂域名 */
export const WQXT_CLASSROOM_HOSTNAME = 'classroom.wqxt.cdut.edu.cn'

/** 内置安全拦截页哨兵前缀 */
export const YANHU_BLOCKED_URL_PREFIX = 'yanhu://blocked'

/** 判定 URL 是否为智联万站内置拦截页哨兵 */
export function isYanhuBlockedUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  return rawUrl.startsWith(YANHU_BLOCKED_URL_PREFIX)
}

/** 构建内置拦截页哨兵 URL（将原始外链放入 target query 参数中） */
export function buildYanhuBlockedUrl(targetUrl: string): string {
  return `${YANHU_BLOCKED_URL_PREFIX}?target=${encodeURIComponent(targetUrl)}`
}

/** 从内置拦截页哨兵 URL 中提取原始外链地址；非拦截页返回 null */
export function parseYanhuBlockedTarget(rawUrl: string): string | null {
  if (!isYanhuBlockedUrl(rawUrl)) return null
  try {
    const parsed = new URL(rawUrl)
    return parsed.searchParams.get('target')
  } catch {
    return null
  }
}

// ===== 浏览器拓扑与视图契约 =====

export type YanhuBrowserScope = 'yanhu-express' | 'wqxt'

export interface YanhuTabError {
  errorCode: number
  errorDescription: string
  failedUrl: string
}

export interface YanhuTabItem {
  id: string
  title: string
  url: string
  favicon?: string
  createdAt: number
  lastActiveAt: number
  zoomFactor: number
  isDormant: boolean
  loading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  error?: YanhuTabError | null
}

export interface YanhuTabsState {
  tabs: YanhuTabItem[]
  activeTabId: string
}

export interface YanhuViewLayout {
  rendererInstanceId: string
  layoutSourceRevision: number
  revision: number
  visible: boolean
  viewportBounds: BrowserViewBounds
  pageBounds: BrowserViewBounds
}

export interface YanhuCreateTabInput {
  url?: string
  activate?: boolean
}

export interface YanhuTabRefInput {
  tabId: string
}

export interface YanhuNavigateInput {
  tabId?: string
  url: string
}

export interface YanhuScopeInput {
  scope?: YanhuBrowserScope
}

export interface YanhuLoadingChangedEvent {
  tabId: string
  loading: boolean
}

export interface YanhuUrlChangedEvent {
  tabId: string
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
}

export interface YanhuNetworkEntry {
  requestId: string
  url: string
  method: string
  status?: number
  resourceType?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  timestamp?: number
  timing?: {
    start: number
    end?: number
    durationMs?: number
  }
  mimeType?: string
  postData?: string
  error?: string
}

export interface YanhuConsoleEntry {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug'
  text: string
  timestamp: number
  source?: string
  line?: number
  stackTrace?: string
}

export interface YanhuLoadedResource {
  url: string
  type: string
  size?: number
}

/** 智联万站 IPC 通道契约 */
export const YANHU_EXPRESS_IPC_CHANNELS = {
  // 视图与生命周期管理
  INIT_OR_RESTORE: 'yanhu:init-or-restore',
  UPDATE_BOUNDS: 'yanhu:update-bounds',
  HIDE_VIEW: 'yanhu:hide-view',
  SHOW_VIEW: 'yanhu:show-view',
  SYNC_THEME: 'yanhu:sync-theme',

  // 标签页操作
  GET_TABS_STATE: 'yanhu:get-tabs-state',
  CREATE_TAB: 'yanhu:create-tab',
  ACTIVATE_TAB: 'yanhu:activate-tab',
  CLOSE_TAB: 'yanhu:close-tab',
  CLOSE_OTHER_TABS: 'yanhu:close-other-tabs',
  CLOSE_RIGHT_TABS: 'yanhu:close-right-tabs',
  REORDER_TABS: 'yanhu:reorder-tabs',

  // 导航与页面交互
  NAVIGATE: 'yanhu:navigate',
  GO_BACK: 'yanhu:go-back',
  GO_FORWARD: 'yanhu:go-forward',
  RELOAD: 'yanhu:reload',
  OPEN_EXTERNAL: 'yanhu:open-external',
  RETRY_WITH_CLEAN: 'yanhu:retry-with-clean',
  SHOW_TAB_MENU: 'yanhu:show-tab-menu',

  // 状态广播（主进程 -> 渲染端）
  ON_TABS_CHANGED: 'yanhu:on-tabs-changed',
  ON_LOADING_CHANGED: 'yanhu:on-loading-changed',
  ON_URL_CHANGED: 'yanhu:on-url-changed',

  // 底层静默 CDP 能力标准接口
  CDP_GET_DOM: 'yanhu:cdp-get-dom',
  CDP_GET_SOURCE: 'yanhu:cdp-get-source',
  CDP_GET_NETWORK_LOGS: 'yanhu:cdp-get-network-logs',
  CDP_GET_CONSOLE_LOGS: 'yanhu:cdp-get-console-logs',
  CDP_EXECUTE_SCRIPT: 'yanhu:cdp-execute-script',

  // 特权诊断控制台
  OPEN_DIAGNOSTIC_CONSOLE: 'yanhu-express:open-diagnostic-console',
} as const

// ===== AI 问渠助手（课堂页 LLM 对话）=====

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

export interface WqxtAiConfig {
  baseUrl: string
  apiKey: string
  modelName: string
  temperature: number
  maxTokens: number
  stream: boolean
}

export interface WqxtAiPublicConfig {
  baseUrl: string
  apiKey: string
  hasApiKey: boolean
  modelName: string
  temperature: number
  maxTokens: number
  stream: boolean
}

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
  fullSubtitle?: string
  subtitleLanguage?: 'zh' | 'en'
  aiSummary?: string
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

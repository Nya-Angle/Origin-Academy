/**
 * 智联万站独立 Preload —— 最早时序防侦测加固
 *
 * 该脚本被 `WebContentsView` 以 `preload` 选项加载，在页面任何脚本执行前运行，
 * 将指纹伪装脚本注入**主世界**（`webFrame.executeJavaScript` 作用于页面主世界）。
 *
 * 与主进程 CDP `Page.addScriptToEvaluateOnNewDocument` 互为兜底：
 *   - CDP 注入是权威的 document-start 时序（先于任何内联/外链脚本）；
 *   - 本 Preload 注入保证即使 CDP 不可用（调试器被占用等）也不留指纹破绽。
 *
 * 安全边界：本 Preload **不向页面暴露任何特权 API**，只做单向环境伪装与内部事件监听。
 */

import { ipcRenderer, webFrame } from 'electron'
import { buildYanhuFingerprintScript } from './yanhu-fingerprint-script'
import { buildWqxtLivingRoomCleanerScript } from './wqxt-livingroom-cleaner'
import { WQXT_AI_BRIDGE_TYPES as T } from './wqxt-ai-panel'
import { applyCdutCasLoginHelper } from './cdut-cas-login-helper'

/**
 * AI 问渠助手 IPC 渠道名。
 * 必须与 `packages/shared/src/types/cdut.ts` 的 `WQXT_AI_IPC_CHANNELS` 逐字一致；
 * Preload 为独立打包（零外部依赖），不能 import `@profer/shared`，故此处字面量写死。
 */
const WQXT_AI_IPC = {
  SEND_MESSAGE: 'yanhu-express:wqxt-ai-send',
  ABORT_MESSAGE: 'yanhu-express:wqxt-ai-abort',
  GET_CONFIG: 'yanhu-express:wqxt-ai-get-config',
  SAVE_CONFIG: 'yanhu-express:wqxt-ai-save-config',
  GET_HISTORY: 'yanhu-express:wqxt-ai-get-history',
  CLEAR_HISTORY: 'yanhu-express:wqxt-ai-clear-history',
  STREAM_CHUNK: 'yanhu-express:wqxt-ai-stream-chunk',
} as const

function applyYanhuFingerprint(): void {
  try {
    // 注入到页面主世界（非隔离世界），确保 navigator / window.chrome 等被真实覆盖
    void webFrame.executeJavaScript(buildYanhuFingerprintScript()).catch(() => {
      // 页面可能尚未就绪或已销毁，忽略
    })
  } catch (err) {
    // 绝不能因注入异常影响页面加载
    console.warn('[智联万站·Preload] 指纹注入失败:', err)
  }
}

function applyWqxtCleaner(): void {
  try {
    // 脚本自检 hostname：非问渠课堂页面直接返回，对智联万站零影响
    void webFrame.executeJavaScript(buildWqxtLivingRoomCleanerScript()).catch(() => {
      // 页面可能尚未就绪或已销毁，忽略
    })
  } catch (err) {
    // 绝不能因注入异常影响页面加载
    console.warn('[AI 问渠学堂·Preload] 页面净化脚本注入失败:', err)
  }
}

function applyWqxtDownloadBridge(): void {
  try {
    if (typeof window === 'undefined') return
    // 仅在顶层窗口挂载桥接，避免子 iframe 重复监听并向主进程同时发送多个相同下载请求
    if (window.top !== window) return
    const w = window as any
    if (w.__profer_wqxt_download_bridge_installed) return
    w.__profer_wqxt_download_bridge_installed = true

    window.addEventListener('message', (event) => {
      // 仅接收来自当前主窗口自身的合法下载指令，过滤跨帧或非本窗干扰
      if (event.source !== window) return
      if (!event || !event.data || typeof event.data !== 'object') return
      if (event.data.type === '__profer_wqxt_download') {
        const url = typeof event.data.url === 'string' ? event.data.url : ''
        const filename = typeof event.data.filename === 'string' ? event.data.filename : undefined
        const clientId = typeof event.data.clientId === 'string' ? event.data.clientId : undefined
        if (url) {
          ipcRenderer.send('yanhu-download-video', { url, filename, clientId })
        }
        return
      }
      if (event.data.type === '__profer_wqxt_download_action') {
        const action = typeof event.data.action === 'string' ? event.data.action : ''
        const clientId = typeof event.data.clientId === 'string' ? event.data.clientId : ''
        const filename = typeof event.data.filename === 'string' ? event.data.filename : undefined
        if (!clientId) return
        if (action !== 'cancel' && action !== 'open' && action !== 'reveal' && action !== 'blob') return
        ipcRenderer.send('yanhu-download-action', { action, clientId, filename })
      }
    })

    // 主进程 -> 页面：接管反向桥（预加载位于隔离世界，需再投递到主世界供注入脚本消费）
    ipcRenderer.on('yanhu-download-progress', (_event, payload) => {
      try {
        if (!payload || typeof payload !== 'object') return
        window.postMessage({ type: '__profer_wqxt_download_progress', payload }, '*')
      } catch (err) {
        console.warn('[AI 问渠学堂·Preload] 下载进度回投失败:', err)
      }
    })
  } catch (err) {
    console.warn('[AI 问渠学堂·Preload] 下载桥接监听失败:', err)
  }
}

/** 页面 <-> 主进程 AI 消息回投（扁平展开，页面直接读取数据字段） */
function replyWqxtAi(type: string, requestId: unknown, extra: Record<string, unknown>): void {
  try {
    const id = typeof requestId === 'string' ? requestId : ''
    window.postMessage(Object.assign({ type, requestId: id }, extra), '*')
  } catch (err) {
    console.warn('[AI 问渠助手·Preload] 回投失败:', err)
  }
}

function applyWqxtAiBridge(): void {
  try {
    if (typeof window === 'undefined') return
    // 仅在顶层窗口挂载桥接，避免子 iframe 重复监听
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
      const payload = data.payload && typeof data.payload === 'object' ? data.payload : {}

      if (type === T.REQUEST_SEND) {
        ipcRenderer.send(WQXT_AI_IPC.SEND_MESSAGE, payload)
        return
      }
      if (type === T.REQUEST_ABORT) {
        ipcRenderer.send(WQXT_AI_IPC.ABORT_MESSAGE, payload)
        return
      }
      if (type === T.REQUEST_GET_CONFIG) {
        void ipcRenderer
          .invoke(WQXT_AI_IPC.GET_CONFIG)
          .then((cfg) => replyWqxtAi(T.RESPONSE_CONFIG, (payload as any).requestId, cfg || {}))
        return
      }
      if (type === T.REQUEST_SAVE_CONFIG) {
        // 页面提交扁平补丁 { requestId, ...patch }，整体下发；结果扁平回投
        void ipcRenderer
          .invoke(WQXT_AI_IPC.SAVE_CONFIG, payload)
          .then((res) => replyWqxtAi(T.RESPONSE_SAVE_RESULT, (payload as any).requestId, res || {}))
        return
      }
      if (type === T.REQUEST_GET_HISTORY) {
        void ipcRenderer.invoke(WQXT_AI_IPC.GET_HISTORY, payload).then((list) =>
          replyWqxtAi(T.RESPONSE_HISTORY, (payload as any).requestId, {
            messages: Array.isArray(list) ? list : [],
          }),
        )
        return
      }
      if (type === T.REQUEST_CLEAR_HISTORY) {
        void ipcRenderer
          .invoke(WQXT_AI_IPC.CLEAR_HISTORY, payload)
          .then(() => replyWqxtAi(T.RESPONSE_HISTORY, (payload as any).requestId, { messages: [] }))
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
  } catch (err) {
    console.warn('[AI 问渠助手·Preload] AI 桥接监听失败:', err)
  }
}

applyYanhuFingerprint()
applyWqxtCleaner()
applyWqxtDownloadBridge()
applyWqxtAiBridge()
applyCdutCasLoginHelper()

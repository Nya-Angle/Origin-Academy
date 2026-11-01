/**
 * AI 问渠助手 · 面板资源（CSS / HTML / 页面运行时 / 桥接常量）
 *
 * 零外部依赖：仅引用同目录 Base64 图标常量，可被 `build:yanhu-preload` 独立打包。
 * 本模块同时被：
 *   - `wqxt-livingroom-upgrader.ts`：拼接 CSS / HTML / 运行时到注入脚本；
 *   - `yanhu-preload.ts`：复用 `WQXT_AI_BRIDGE_TYPES` 作为消息类型唯一权威。
 *
 * 编码红线：
 *   - `buildWqxtAiPanelRuntimeScript()` 返回的字符串会被拼接进外层模板，
 *     内部**不得出现任何字面量反引号与 `${` 序列**；代码块匹配统一用 `\x60`。
 *   - 运行时通过 `String.raw` 保持正则转义原样（如 `\r?\n` / `\s` / `\d`）。
 */

import { CDUT_STUDIO_LOGO_DATA_URL } from './wqxt-logo-data-url'

/** AI 问渠助手 Dock 胶囊 ID */
export const WQXT_AI_DOCK_ID = '__profer-ai-dock-btn'
/** AI 问渠助手面板 ID */
export const WQXT_AI_PANEL_ID = '__profer-ai-panel'

/** 页面 <-> Preload 桥接消息类型（页面运行时与 Preload 共用的唯一权威） */
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

/** 欢迎卡内部结构（HTML 与运行时重建共用，避免两处文案漂移） */
const AI_WELCOME_INNER_HTML = `
      <div class="ai-welcome-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2.5l1.9 5.2 5.2 1.9-5.2 1.9-1.9 5.2-1.9-5.2L5 9.6l5.2-1.9z"></path>
          <path d="M18.8 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"></path>
        </svg>
      </div>
      <h4 class="ai-welcome-title">AI 问渠助手</h4>
      <p class="ai-welcome-desc">可以结合当前课程、章节、播放进度与字幕为你答疑。试试下面的问题：</p>
      <div class="ai-welcome-chips">
        <button class="ai-chip" type="button">总结本节重点</button>
        <button class="ai-chip" type="button">解释当前这句话</button>
        <button class="ai-chip" type="button">老师刚才提到的概念是什么</button>
        <button class="ai-chip" type="button">出一道自测题</button>
      </div>`

/**
 * 面板增量 CSS。复用升级器已存在的 `.ai-panel-header / .ai-panel-logo / .ai-panel-status`
 * 等 shell 规则，这里只补齐工作台新增的类。
 */
export const WQXT_AI_PANEL_CSS = `
/* ===== 4.1 AI 对话工作台 ===== */
#__profer-ai-panel .ai-panel-btn {
  width: 30px !important;
  height: 30px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: #64748B !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
}
#__profer-ai-panel .ai-panel-btn:hover {
  background: rgba(15, 23, 42, 0.06) !important;
  color: #0F172A !important;
}
#__profer-ai-panel .ai-panel-btn svg {
  width: 15px !important;
  height: 15px !important;
}
#__profer-ai-panel .ai-model-pill-text {
  max-width: 168px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
#__profer-ai-panel .ai-messages {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 14px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
  scroll-behavior: smooth !important;
}
#__profer-ai-panel .ai-welcome {
  margin: auto 0 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 14px 8px !important;
  text-align: center !important;
}
#__profer-ai-panel .ai-welcome-badge {
  width: 58px !important;
  height: 58px !important;
  border-radius: 18px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: #4F46E5 !important;
  background: linear-gradient(135deg, #EEF2FF 0%, #EDE9FE 100%) !important;
  box-shadow: inset 0 0 0 1px rgba(199, 210, 254, 0.9), 0 10px 24px -10px rgba(79, 70, 229, 0.4) !important;
}
#__profer-ai-panel .ai-welcome-badge svg {
  width: 30px !important;
  height: 30px !important;
}
#__profer-ai-panel .ai-welcome-title {
  margin: 0 !important;
  font-size: 16px !important;
  font-weight: 800 !important;
  color: #0F172A !important;
}
#__profer-ai-panel .ai-welcome-desc {
  margin: 0 !important;
  max-width: 380px !important;
  font-size: 12.5px !important;
  line-height: 1.7 !important;
  color: #64748B !important;
}
#__profer-ai-panel .ai-welcome-chips {
  display: flex !important;
  flex-wrap: wrap !important;
  justify-content: center !important;
  gap: 8px !important;
  margin-top: 4px !important;
}
#__profer-ai-panel .ai-chip {
  padding: 7px 12px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(79, 70, 229, 0.22) !important;
  background: rgba(79, 70, 229, 0.08) !important;
  color: #4F46E5 !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: all 0.18s ease !important;
}
#__profer-ai-panel .ai-chip:hover {
  background: rgba(79, 70, 229, 0.16) !important;
  transform: translateY(-1px) !important;
}
#__profer-ai-panel .ai-msg {
  display: flex !important;
  flex-direction: column !important;
  gap: 5px !important;
  max-width: 92% !important;
  align-self: flex-start !important;
}
#__profer-ai-panel .ai-msg.user {
  align-self: flex-end !important;
  align-items: flex-end !important;
  max-width: 86% !important;
}
#__profer-ai-panel .ai-msg-role {
  font-size: 11px !important;
  color: #94A3B8 !important;
  padding: 0 2px !important;
}
#__profer-ai-panel .ai-msg-body {
  padding: 10px 12px !important;
  border-radius: 12px !important;
  background: rgba(255, 255, 255, 0.78) !important;
  border: 1px solid rgba(226, 232, 240, 0.85) !important;
  color: #0F172A !important;
  font-size: 13px !important;
  line-height: 1.7 !important;
  white-space: pre-wrap !important;
  word-break: break-word !important;
  box-sizing: border-box !important;
  width: fit-content !important;
  max-width: 100% !important;
}
#__profer-ai-panel .ai-msg.user .ai-msg-body {
  background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%) !important;
  border: none !important;
  color: #FFFFFF !important;
}
#__profer-ai-panel .ai-msg-body.is-typing {
  color: #64748B !important;
  animation: __profer-ai-pulse 1.4s ease-in-out infinite !important;
}
#__profer-ai-panel .ai-msg-error {
  margin-top: 8px !important;
  padding: 6px 9px !important;
  border-radius: 8px !important;
  background: rgba(239, 68, 68, 0.12) !important;
  color: #DC2626 !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}
#__profer-ai-panel .ai-msg-reasoning {
  border-left: 2px solid rgba(124, 58, 237, 0.45) !important;
  background: rgba(124, 58, 237, 0.06) !important;
  border-radius: 8px !important;
  padding: 6px 10px !important;
  font-size: 12px !important;
  color: #64748B !important;
  max-width: 100% !important;
}
#__profer-ai-panel .ai-msg-reasoning summary {
  cursor: pointer !important;
  font-weight: 600 !important;
  color: #7C3AED !important;
  outline: none !important;
}
#__profer-ai-panel .ai-msg-reasoning-body {
  margin-top: 6px !important;
  white-space: pre-wrap !important;
  word-break: break-word !important;
  line-height: 1.65 !important;
}
#__profer-ai-panel .ai-md-p {
  margin: 0 0 8px 0 !important;
}
#__profer-ai-panel .ai-md-h {
  margin: 10px 0 6px 0 !important;
  font-size: 13.5px !important;
  font-weight: 700 !important;
  color: #1E293B !important;
}
#__profer-ai-panel .ai-md-li {
  margin: 2px 0 !important;
  padding-left: 4px !important;
  line-height: 1.7 !important;
}
#__profer-ai-panel .ai-md-inline {
  padding: 1px 5px !important;
  border-radius: 5px !important;
  background: rgba(79, 70, 229, 0.1) !important;
  color: #4F46E5 !important;
  font-family: Consolas, "SFMono-Regular", Menlo, monospace !important;
  font-size: 12px !important;
}
#__profer-ai-panel .ai-md-h1 {
  font-size: 16px !important;
}
#__profer-ai-panel .ai-md-h2 {
  font-size: 15px !important;
}
#__profer-ai-panel .ai-md-h3 {
  font-size: 14px !important;
}
#__profer-ai-panel .ai-md-em {
  font-style: italic !important;
}
#__profer-ai-panel .ai-md-link {
  color: #4F46E5 !important;
  text-decoration: underline !important;
  text-underline-offset: 2px !important;
  word-break: break-all !important;
}
#__profer-ai-panel .ai-md-quote {
  margin: 8px 0 !important;
  padding: 6px 10px !important;
  border-left: 3px solid #C7D2FE !important;
  border-radius: 0 8px 8px 0 !important;
  background: rgba(79, 70, 229, 0.05) !important;
  color: #475569 !important;
  line-height: 1.7 !important;
}
#__profer-ai-panel .ai-md-hr {
  margin: 10px 0 !important;
  border: none !important;
  border-top: 1px solid rgba(148, 163, 184, 0.35) !important;
}
#__profer-ai-panel .ai-md-li-d1 {
  padding-left: 22px !important;
}
#__profer-ai-panel .ai-md-li-d2 {
  padding-left: 40px !important;
}
#__profer-ai-panel .ai-md-li-d3 {
  padding-left: 58px !important;
}
#__profer-ai-panel .ai-md-table-wrap {
  margin: 8px 0 !important;
  max-width: 100% !important;
  overflow-x: auto !important;
}
#__profer-ai-panel .ai-md-table {
  border-collapse: collapse !important;
  width: 100% !important;
  font-size: 12.5px !important;
  line-height: 1.55 !important;
}
#__profer-ai-panel .ai-md-table th,
#__profer-ai-panel .ai-md-table td {
  padding: 6px 10px !important;
  border: 1px solid rgba(203, 213, 225, 0.7) !important;
  text-align: left !important;
  vertical-align: top !important;
}
#__profer-ai-panel .ai-md-table th {
  background: #F8FAFC !important;
  font-weight: 700 !important;
  color: #0F172A !important;
}
#__profer-ai-panel .ai-math-inline {
  font-family: "Cambria Math", "Times New Roman", "Songti SC", serif !important;
}
#__profer-ai-panel .ai-math-block {
  display: block !important;
  margin: 8px 0 !important;
  text-align: center !important;
  overflow-x: auto !important;
  font-family: "Cambria Math", "Times New Roman", "Songti SC", serif !important;
}
#__profer-ai-panel .ai-math-frac {
  display: inline-flex !important;
  flex-direction: column !important;
  vertical-align: middle !important;
  text-align: center !important;
  margin: 0 2px !important;
  font-size: 0.95em !important;
}
#__profer-ai-panel .ai-math-num {
  padding: 0 3px !important;
  border-bottom: 1px solid currentColor !important;
}
#__profer-ai-panel .ai-math-den {
  padding: 0 3px !important;
}
#__profer-ai-panel .ai-math-sqrt {
  display: inline-flex !important;
  align-items: flex-start !important;
}
#__profer-ai-panel .ai-math-rad {
  border-top: 1px solid currentColor !important;
  padding: 0 2px !important;
  margin-left: 1px !important;
}
#__profer-ai-panel .ai-math-text {
  font-style: normal !important;
  font-family: inherit !important;
}
#__profer-ai-panel .ai-code-wrap {
  position: relative !important;
  margin: 8px 0 !important;
  border-radius: 10px !important;
  overflow: hidden !important;
  background: #0F172A !important;
  max-width: 100% !important;
}
#__profer-ai-panel .ai-code-lang {
  padding: 5px 10px !important;
  font-size: 11px !important;
  color: #94A3B8 !important;
  background: rgba(255, 255, 255, 0.06) !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18) !important;
}
#__profer-ai-panel .ai-code-pre {
  margin: 0 !important;
  padding: 10px 12px !important;
  overflow-x: auto !important;
  font-family: Consolas, "SFMono-Regular", Menlo, monospace !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
  color: #E2E8F0 !important;
  white-space: pre !important;
}
#__profer-ai-panel .ai-code-pre code {
  background: transparent !important;
  color: inherit !important;
  font-family: inherit !important;
  font-size: inherit !important;
}
#__profer-ai-panel .ai-copy-btn {
  position: absolute !important;
  top: 5px !important;
  right: 6px !important;
  padding: 3px 8px !important;
  border-radius: 6px !important;
  border: 1px solid rgba(148, 163, 184, 0.35) !important;
  background: rgba(30, 41, 59, 0.85) !important;
  color: #CBD5E1 !important;
  font-size: 11px !important;
  cursor: pointer !important;
  opacity: 0.85 !important;
}
#__profer-ai-panel .ai-copy-btn:hover {
  opacity: 1 !important;
  color: #FFFFFF !important;
}
#__profer-ai-panel .ai-composer {
  flex-shrink: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  padding: 10px 12px 12px !important;
  border-top: 1px solid rgba(226, 232, 240, 0.7) !important;
  background: rgba(255, 255, 255, 0.52) !important;
}
#__profer-ai-panel .ai-ctx-pill {
  align-self: flex-start !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 4px 10px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(148, 163, 184, 0.35) !important;
  background: rgba(148, 163, 184, 0.12) !important;
  color: #64748B !important;
  font-size: 11px !important;
  cursor: pointer !important;
  max-width: 100% !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
#__profer-ai-panel .ai-ctx-pill.is-on {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(124, 58, 237, 0.14)) !important;
  border-color: rgba(79, 70, 229, 0.42) !important;
  color: #4F46E5 !important;
  font-weight: 600 !important;
}
#__profer-ai-panel .ai-composer-row {
  display: flex !important;
  align-items: flex-end !important;
  gap: 8px !important;
}
#__profer-ai-panel .ai-input-area {
  flex: 1 1 auto !important;
  min-height: 44px !important;
  max-height: 132px !important;
  resize: none !important;
  padding: 10px 12px !important;
  border-radius: 12px !important;
  border: 1px solid #E2E8F0 !important;
  background: rgba(248, 250, 252, 0.94) !important;
  color: #0F172A !important;
  font-size: 13px !important;
  line-height: 1.5 !important;
  font-family: inherit !important;
  outline: none !important;
  box-sizing: border-box !important;
}
#__profer-ai-panel .ai-input-area:focus {
  border-color: #7C3AED !important;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.14) !important;
}
#__profer-ai-panel .ai-send {
  width: 44px !important;
  height: 44px !important;
  flex-shrink: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border: none !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%) !important;
  color: #FFFFFF !important;
  cursor: pointer !important;
  transition: filter 0.18s ease !important;
}
#__profer-ai-panel .ai-send:hover {
  filter: brightness(1.06) !important;
}
#__profer-ai-panel .ai-send svg {
  width: 18px !important;
  height: 18px !important;
}
#__profer-ai-panel .ai-send.is-stop {
  background: #EF4444 !important;
}
#__profer-ai-panel .ai-settings {
  position: absolute !important;
  inset: 0 !important;
  z-index: 20 !important;
  display: none !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 18px !important;
  background: rgba(15, 23, 42, 0.42) !important;
  backdrop-filter: blur(6px) !important;
  -webkit-backdrop-filter: blur(6px) !important;
}
#__profer-ai-panel .ai-settings.is-open {
  display: flex !important;
  animation: __profer-ai-in 0.22s ease both !important;
}
#__profer-ai-panel .ai-settings-card {
  width: 100% !important;
  max-height: 100% !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  padding: 16px !important;
  border-radius: 16px !important;
  background: rgba(255, 255, 255, 0.97) !important;
  box-shadow: 0 24px 60px -20px rgba(15, 23, 42, 0.5) !important;
}
#__profer-ai-panel .ai-settings-head {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}
#__profer-ai-panel .ai-settings-head h4 {
  margin: 0 !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  color: #0F172A !important;
}
#__profer-ai-panel .ai-settings-close {
  width: 26px !important;
  height: 26px !important;
  border: none !important;
  border-radius: 7px !important;
  background: transparent !important;
  color: #64748B !important;
  font-size: 18px !important;
  line-height: 1 !important;
  cursor: pointer !important;
}
#__profer-ai-panel .ai-settings-close:hover {
  background: rgba(15, 23, 42, 0.06) !important;
}
#__profer-ai-panel .ai-presets {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
}
#__profer-ai-panel .ai-preset {
  padding: 5px 10px !important;
  border-radius: 999px !important;
  border: 1px solid rgba(79, 70, 229, 0.2) !important;
  background: rgba(79, 70, 229, 0.06) !important;
  color: #4F46E5 !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
}
#__profer-ai-panel .ai-preset:hover {
  background: rgba(79, 70, 229, 0.14) !important;
}
#__profer-ai-panel .ai-field {
  display: flex !important;
  flex-direction: column !important;
  gap: 5px !important;
  font-size: 11.5px !important;
  color: #64748B !important;
}
#__profer-ai-panel .ai-input {
  width: 100% !important;
  height: 34px !important;
  padding: 0 10px !important;
  border-radius: 9px !important;
  border: 1px solid #E2E8F0 !important;
  background: #F8FAFC !important;
  color: #0F172A !important;
  font-size: 12.5px !important;
  font-family: inherit !important;
  outline: none !important;
  box-sizing: border-box !important;
}
#__profer-ai-panel .ai-input:focus {
  border-color: #7C3AED !important;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12) !important;
}
#__profer-ai-panel .ai-input-row {
  display: flex !important;
  gap: 6px !important;
  align-items: center !important;
}
#__profer-ai-panel .ai-eye {
  flex-shrink: 0 !important;
  height: 34px !important;
  padding: 0 10px !important;
  border-radius: 9px !important;
  border: 1px solid #E2E8F0 !important;
  background: #F8FAFC !important;
  color: #64748B !important;
  font-size: 12px !important;
  cursor: pointer !important;
}
#__profer-ai-panel .ai-range {
  width: 100% !important;
  accent-color: #7C3AED !important;
}
#__profer-ai-panel .ai-settings-foot {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  margin-top: 2px !important;
}
#__profer-ai-panel .ai-save {
  height: 34px !important;
  padding: 0 14px !important;
  border: none !important;
  border-radius: 9px !important;
  background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%) !important;
  color: #FFFFFF !important;
  font-size: 12.5px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  flex-shrink: 0 !important;
}
#__profer-ai-panel .ai-save-status {
  font-size: 11.5px !important;
  color: #64748B !important;
  line-height: 1.5 !important;
  word-break: break-word !important;
}
#__profer-ai-panel .ai-save-status.is-ok {
  color: #16A34A !important;
}
#__profer-ai-panel .ai-save-status.is-error {
  color: #DC2626 !important;
}
@media (prefers-color-scheme: dark) {
  #__profer-ai-panel .ai-msg-body {
    background: rgba(30, 41, 59, 0.78) !important;
    border-color: rgba(148, 163, 184, 0.28) !important;
    color: #E2E8F0 !important;
  }
  #__profer-ai-panel .ai-welcome-title,
  #__profer-ai-panel .ai-settings-head h4,
  #__profer-ai-panel .ai-md-h {
    color: #F8FAFC !important;
  }
  #__profer-ai-panel .ai-welcome-desc,
  #__profer-ai-panel .ai-msg-role,
  #__profer-ai-panel .ai-save-status {
    color: #94A3B8 !important;
  }
  #__profer-ai-panel .ai-composer {
    background: rgba(15, 23, 42, 0.6) !important;
    border-top-color: rgba(148, 163, 184, 0.22) !important;
  }
  #__profer-ai-panel .ai-input-area,
  #__profer-ai-panel .ai-input,
  #__profer-ai-panel .ai-eye {
    background: rgba(30, 41, 59, 0.72) !important;
    border-color: rgba(148, 163, 184, 0.3) !important;
    color: #E2E8F0 !important;
  }
  #__profer-ai-panel .ai-settings-card {
    background: rgba(15, 23, 42, 0.94) !important;
  }
}
/* ===== 拖拽调整大小（仿 Windows 边框 / 四角拖拽） ===== */
#__profer-ai-panel .ai-resize-handle {
  position: absolute !important;
  z-index: 30 !important;
  background: transparent !important;
  touch-action: none !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-n,
#__profer-ai-panel .ai-resize-handle.ai-rz-s {
  left: 16px !important;
  right: 16px !important;
  height: 6px !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-n {
  top: 0 !important;
  cursor: ns-resize !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-s {
  bottom: 0 !important;
  cursor: ns-resize !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-e,
#__profer-ai-panel .ai-resize-handle.ai-rz-w {
  top: 16px !important;
  bottom: 16px !important;
  width: 6px !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-e {
  right: 0 !important;
  cursor: ew-resize !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-w {
  left: 0 !important;
  cursor: ew-resize !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-ne,
#__profer-ai-panel .ai-resize-handle.ai-rz-nw,
#__profer-ai-panel .ai-resize-handle.ai-rz-se,
#__profer-ai-panel .ai-resize-handle.ai-rz-sw {
  width: 14px !important;
  height: 14px !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-ne {
  top: 0 !important;
  right: 0 !important;
  cursor: nesw-resize !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-nw {
  top: 0 !important;
  left: 0 !important;
  cursor: nwse-resize !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-se {
  bottom: 0 !important;
  right: 0 !important;
  cursor: nwse-resize !important;
}
#__profer-ai-panel .ai-resize-handle.ai-rz-sw {
  bottom: 0 !important;
  left: 0 !important;
  cursor: nesw-resize !important;
}
#__profer-ai-panel.is-resizing {
  user-select: none !important;
  -webkit-user-select: none !important;
  transition: none !important;
}
`

/** AI 问渠助手悬浮 Dock 胶囊 HTML */
export function buildAiDockHtml(): string {
  return `<button class="ai-dock-btn" id="${WQXT_AI_DOCK_ID}" type="button" aria-label="打开 AI 问渠助手">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"></path>
    <path d="M18.5 14l.9 2.4 2.6.9-2.6.9-.9 2.4-.9-2.4-2.6-.9 2.6-.9z"></path>
  </svg>
  <span>AI 问渠助手</span>
</button>`
}

/** AI 问渠助手对话工作台 HTML */
export function buildAiPanelHtml(): string {
  return `<div class="ai-panel" id="${WQXT_AI_PANEL_ID}" aria-hidden="true">
  <div class="ai-panel-header">
    <span class="ai-panel-logo">
      <img src="${CDUT_STUDIO_LOGO_DATA_URL}" alt="CDUT Studio" draggable="false" />
    </span>
    <div class="ai-panel-title-col">
      <h3 class="ai-panel-title">CDUT Studio AI 助手</h3>
      <span class="ai-panel-status ai-model-pill" id="__profer-ai-model-pill">
        <span class="ai-panel-status-dot"></span>
        <span class="ai-model-pill-text">deepseek-chat</span>
      </span>
    </div>
    <div class="ai-panel-actions">
      <button class="ai-panel-btn" id="__profer-ai-settings-btn" type="button" aria-label="模型设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      <button class="ai-panel-btn" id="__profer-ai-new" type="button" aria-label="开启新对话">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14"></path>
          <path d="M5 12h14"></path>
        </svg>
      </button>
      <button class="ai-panel-min" id="__profer-ai-min" type="button" aria-label="最小化">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
      <button class="ai-panel-close" id="__profer-ai-close" type="button" aria-label="关闭">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="6" y1="6" x2="18" y2="18"></line>
          <line x1="18" y1="6" x2="6" y2="18"></line>
        </svg>
      </button>
    </div>
  </div>
  <div class="ai-messages" id="__profer-ai-messages">
    <div class="ai-welcome" id="__profer-ai-welcome">${AI_WELCOME_INNER_HTML}
    </div>
  </div>
  <div class="ai-settings" id="__profer-ai-settings">
    <div class="ai-settings-card">
      <div class="ai-settings-head">
        <h4>模型设置</h4>
        <button class="ai-settings-close" id="__profer-ai-settings-close" type="button" aria-label="关闭设置">&times;</button>
      </div>
      <div class="ai-presets">
        <button class="ai-preset" data-preset="deepseek" type="button">DeepSeek</button>
        <button class="ai-preset" data-preset="openai" type="button">OpenAI</button>
        <button class="ai-preset" data-preset="qwen" type="button">通义千问</button>
        <button class="ai-preset" data-preset="siliconflow" type="button">硅基流动</button>
        <button class="ai-preset" data-preset="moonshot" type="button">Moonshot</button>
        <button class="ai-preset" data-preset="ollama" type="button">Ollama</button>
      </div>
      <label class="ai-field">
        <span>API Base URL</span>
        <input class="ai-input" id="__profer-ai-base-url" type="text" spellcheck="false" placeholder="https://api.deepseek.com/v1" />
      </label>
      <label class="ai-field">
        <span>API Key</span>
        <div class="ai-input-row">
          <input class="ai-input" id="__profer-ai-api-key" type="password" spellcheck="false" autocomplete="off" placeholder="请输入 API Key（本地 Ollama 可留空）" />
          <button class="ai-eye" id="__profer-ai-key-eye" type="button">显示</button>
        </div>
      </label>
      <label class="ai-field">
        <span>Model Name</span>
        <input class="ai-input" id="__profer-ai-model" type="text" spellcheck="false" placeholder="deepseek-chat" />
      </label>
      <label class="ai-field">
        <span>Temperature：<b id="__profer-ai-temp-value">0.7</b></span>
        <input class="ai-range" id="__profer-ai-temp" type="range" min="0" max="2" step="0.1" value="0.7" />
      </label>
      <div class="ai-settings-foot">
        <button class="ai-save" id="__profer-ai-save" type="button">保存并测试</button>
        <span class="ai-save-status" id="__profer-ai-save-status"></span>
      </div>
    </div>
  </div>
  <div class="ai-composer">
    <button class="ai-ctx-pill is-on" id="__profer-ai-ctx-pill" type="button">携带本节课上下文</button>
    <div class="ai-composer-row">
      <textarea class="ai-input-area" id="__profer-ai-input" rows="1" placeholder="向问渠助教提问…（Enter 发送 / Shift+Enter 换行）"></textarea>
      <button class="ai-send" id="__profer-ai-send" type="button" aria-label="发送">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9"></polygon>
        </svg>
      </button>
    </div>
  </div>
  <div class="ai-resize-handle ai-rz-n" data-ai-resize="n" aria-hidden="true"></div>
  <div class="ai-resize-handle ai-rz-s" data-ai-resize="s" aria-hidden="true"></div>
  <div class="ai-resize-handle ai-rz-e" data-ai-resize="e" aria-hidden="true"></div>
  <div class="ai-resize-handle ai-rz-w" data-ai-resize="w" aria-hidden="true"></div>
  <div class="ai-resize-handle ai-rz-ne" data-ai-resize="ne" aria-hidden="true"></div>
  <div class="ai-resize-handle ai-rz-nw" data-ai-resize="nw" aria-hidden="true"></div>
  <div class="ai-resize-handle ai-rz-se" data-ai-resize="se" aria-hidden="true"></div>
  <div class="ai-resize-handle ai-rz-sw" data-ai-resize="sw" aria-hidden="true"></div>
</div>`
}

/**
 * 生成页面主世界运行时（挂载于升级器 IIFE 内部，可直接复用 byId / appendToBody /
 * findVideoRoomVm / findOriginalSubtitleText / formatTime 等既有函数）。
 */
export function buildWqxtAiPanelRuntimeScript(): string {
  return (
    'var AI_BRIDGE = ' +
    JSON.stringify(WQXT_AI_BRIDGE_TYPES) +
    ';\n' +
    'var AI_WELCOME_INNER = ' +
    JSON.stringify(AI_WELCOME_INNER_HTML) +
    ';\n' +
    String.raw`    // ---------- AI 问渠助手工作台 ----------
    var AI_CTX_KEY = '__profer_ai_ctx_enabled';
    var AI_MESSAGES_ID = '__profer-ai-messages';
    var AI_WELCOME_ID = '__profer-ai-welcome';
    var AI_SETTINGS_ID = '__profer-ai-settings';
    var AI_SETTINGS_BTN_ID = '__profer-ai-settings-btn';
    var AI_SETTINGS_CLOSE_ID = '__profer-ai-settings-close';
    var AI_NEW_ID = '__profer-ai-new';
    var AI_MIN_ID = '__profer-ai-min';
    var AI_CLOSE_ID = '__profer-ai-close';
    var AI_MODEL_PILL_ID = '__profer-ai-model-pill';
    var AI_BASE_URL_ID = '__profer-ai-base-url';
    var AI_API_KEY_ID = '__profer-ai-api-key';
    var AI_KEY_EYE_ID = '__profer-ai-key-eye';
    var AI_MODEL_ID = '__profer-ai-model';
    var AI_TEMP_ID = '__profer-ai-temp';
    var AI_TEMP_VALUE_ID = '__profer-ai-temp-value';
    var AI_SAVE_ID = '__profer-ai-save';
    var AI_SAVE_STATUS_ID = '__profer-ai-save-status';
    var AI_CTX_PILL_ID = '__profer-ai-ctx-pill';
    var AI_INPUT_ID = '__profer-ai-input';
    var AI_SEND_ID = '__profer-ai-send';

    var AI_PRESETS = {
      deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
      siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
      moonshot: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
      ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' }
    };

    var aiState = {
      open: false,
      streaming: false,
      requestId: '',
      ctxEnabled: true,
      ctxTimer: null,
      configLoaded: false,
      historyCourseId: '',
      answerText: '',
      reasoningText: '',
      activeEl: null,
      activeReasoningEl: null,
      activeReasoningWrap: null
    };

    var aiRenderBlocks = [];

    function aiSend(type, payload) {
      try {
        window.postMessage({ type: type, payload: payload || {} }, '*');
      } catch (e) {}
    }

    function aiNewRequestId() {
      return String(Date.now()) + Math.random().toString(16).slice(2);
    }

    function aiLoadCtxPref() {
      try {
        var raw = localStorage.getItem(AI_CTX_KEY);
        aiState.ctxEnabled = raw === null ? true : raw === '1';
      } catch (e) {
        aiState.ctxEnabled = true;
      }
    }

    var cachedAbstractVm = null;
    var cachedTransVm = null;

    function findClassroomDataVms() {
      if (cachedAbstractVm && cachedAbstractVm.$data && cachedTransVm && cachedTransVm.$data) {
        return { abstractVm: cachedAbstractVm, transVm: cachedTransVm };
      }
      try {
        var allEls = document.querySelectorAll('*');
        for (var i = 0; i < allEls.length; i++) {
          var vm = allEls[i].__vue__;
          if (!vm || !vm.$data) continue;
          if (!cachedAbstractVm && 'contentSummary' in vm.$data && 'keyReview' in vm.$data) cachedAbstractVm = vm;
          if (!cachedTransVm && ('originTransContent' in vm.$data || '_asr' in vm.$data)) cachedTransVm = vm;
          if (cachedAbstractVm && cachedTransVm) break;
        }
      } catch (e) {}
      return { abstractVm: cachedAbstractVm, transVm: cachedTransVm };
    }

    function collectClassroomContext(full) {
      var roomVm = findVideoRoomVm();
      var params;
      try {
        params = new URLSearchParams(location.search.indexOf('?') >= 0 ? location.search : (location.hash.split('?')[1] || ''));
      } catch (e) {
        params = null;
      }
      var courseId = (roomVm && roomVm.course_id) || (params ? params.get('course_id') : '') || (params ? params.get('id') : '') || '';
      if (!courseId) {
        var m = location.hash.match(/[?&]course_id=([^&]+)/);
        if (m) courseId = m[1];
      }
      var courseTitle = getCourseTitle(roomVm);
      var chapterName = (roomVm && roomVm.subTitle) || '';
      var teacherName = readText('.teacher_span');
      var currentTime = 0;
      var duration = 0;
      if (videoEl) {
        currentTime = videoEl.currentTime || 0;
        duration = isFinite(videoEl.duration) ? (videoEl.duration || 0) : 0;
      }
      var currentSubtitle = '';
      try {
        currentSubtitle = findOriginalSubtitleText() || '';
      } catch (e) {
        currentSubtitle = '';
      }

      var aiSummary = '';
      var fullSubtitle = '';

      if (full) {
        try {
          var vms = findClassroomDataVms();
          var abstractVm = vms.abstractVm;
          var transVm = vms.transVm;

          if (abstractVm && abstractVm.contentSummary) {
            aiSummary = String(abstractVm.contentSummary).trim();
          }

          var isEnglishCourse = (courseTitle || '').indexOf('英语') >= 0;
          var transList = (transVm && transVm.originTransContent) || (abstractVm && abstractVm._asr) || [];
          if (Array.isArray(transList) && transList.length > 0) {
            var subLines = [];
            for (var tIdx = 0; tIdx < transList.length; tIdx++) {
              var item = transList[tIdx];
              if (!item) continue;
              var timeTag = item.markTime || (item.start != null ? formatTime(item.start) : '');
              var lineText = '';
              if (isEnglishCourse) {
                lineText = (item.entext || item.statement || item.zhtext || '').trim();
              } else {
                lineText = (item.zhtext || item.statement || item.entext || '').trim();
              }
              if (lineText) {
                subLines.push(timeTag ? '[' + timeTag + '] ' + lineText : lineText);
              }
            }
            if (subLines.length > 0) {
              fullSubtitle = subLines.join('\n');
            }
          }
        } catch (e) {}
      }

      return {
        courseId: String(courseId || ''),
        courseTitle: courseTitle || '',
        chapterName: chapterName,
        teacherName: teacherName || '',
        currentTime: currentTime,
        duration: duration,
        currentSubtitle: currentSubtitle,
        aiSummary: aiSummary || undefined,
        fullSubtitle: fullSubtitle || undefined
      };
    }

    function refreshAiCtxPill() {
      var pill = byId(AI_CTX_PILL_ID);
      if (!pill) return;
      var ctx = collectClassroomContext();
      var label;
      if (aiState.ctxEnabled) {
        var time = formatTime(ctx.currentTime);
        var total = ctx.duration > 0 ? formatTime(ctx.duration) : '--:--';
        label = '携带本节课上下文 · ' + time + ' / ' + total;
      } else {
        label = '未携带本节课上下文';
      }
      if (pill.textContent !== label) pill.textContent = label;
      if (aiState.ctxEnabled) pill.classList.add('is-on');
      else pill.classList.remove('is-on');
    }

    function syncAiHistoryForCourse() {
      var courseId = collectClassroomContext().courseId;
      if (aiState.historyCourseId === courseId) return;
      aiState.historyCourseId = courseId;
      aiSend(AI_BRIDGE.REQUEST_GET_HISTORY, { requestId: aiNewRequestId(), courseId: courseId });
    }

    function aiEscapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    var aiRenderMathBlocks = [];

    var AI_MATH_SYMBOLS = {
      alpha: '\u03b1', beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4',
      epsilon: '\u03b5', varepsilon: '\u03b5', zeta: '\u03b6', eta: '\u03b7',
      theta: '\u03b8', vartheta: '\u03b8', iota: '\u03b9', kappa: '\u03ba',
      lambda: '\u03bb', mu: '\u03bc', nu: '\u03bd', xi: '\u03be', pi: '\u03c0',
      rho: '\u03c1', sigma: '\u03c3', tau: '\u03c4', upsilon: '\u03c5',
      phi: '\u03c6', varphi: '\u03c6', chi: '\u03c7', psi: '\u03c8', omega: '\u03c9',
      Gamma: '\u0393', Delta: '\u0394', Theta: '\u0398', Lambda: '\u039b',
      Xi: '\u039e', Pi: '\u03a0', Sigma: '\u03a3', Phi: '\u03a6',
      Psi: '\u03a8', Omega: '\u03a9',
      times: '\u00d7', cdot: '\u00b7', pm: '\u00b1', mp: '\u2213', div: '\u00f7',
      le: '\u2264', leq: '\u2264', ge: '\u2265', geq: '\u2265',
      ne: '\u2260', neq: '\u2260', approx: '\u2248', equiv: '\u2261',
      sim: '\u223c', propto: '\u221d', ll: '\u226a', gg: '\u226b',
      infty: '\u221e', partial: '\u2202', nabla: '\u2207',
      sum: '\u2211', prod: '\u220f', int: '\u222b', oint: '\u222e',
      forall: '\u2200', exists: '\u2203', emptyset: '\u2205',
      in: '\u2208', notin: '\u2209', subset: '\u2282', supset: '\u2283',
      subseteq: '\u2286', supseteq: '\u2287', cup: '\u222a', cap: '\u2229',
      land: '\u2227', lor: '\u2228', neg: '\u00ac', lnot: '\u00ac',
      to: '\u2192', rightarrow: '\u2192', leftarrow: '\u2190',
      leftrightarrow: '\u2194', Rightarrow: '\u21d2', Leftarrow: '\u21d0',
      mapsto: '\u21a6', uparrow: '\u2191', downarrow: '\u2193',
      perp: '\u22a5', parallel: '\u2225', angle: '\u2220',
      triangle: '\u25b3', circ: '\u2218', degree: '\u00b0', prime: '\u2032',
      ldots: '\u2026', dots: '\u2026', cdots: '\u22ef',
      therefore: '\u2234', because: '\u2235', ell: '\u2113',
      langle: '\u27e8', rangle: '\u27e9', hbar: '\u210f',
      sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
      log: 'log', ln: 'ln', lg: 'lg', exp: 'exp', lim: 'lim',
      max: 'max', min: 'min', det: 'det', gcd: 'gcd'
    };

    function aiMathUnescape(value) {
      return String(value == null ? '' : value)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
    }

    // 轻量 LaTeX 渲染：分数 / 根号 / 上下标 / 常用符号（不引入 KaTeX）
    function aiMathHtml(raw) {
      var s = aiMathUnescape(raw).replace(/\r?\n/g, ' ');
      s = s.replace(/\\left/g, '').replace(/\\right/g, '');
      s = s.replace(/\\\\/g, '<br>');
      s = s.replace(/\\dfrac|\\tfrac/g, '\\frac');
      for (var pass = 0; pass < 6; pass++) {
        var before = s;
        // 先消解最内层花括号，保证嵌套的 \frac{a}{\sqrt{b}} 也能逐层命中
        s = s.replace(/\\(?:text|mathrm|operatorname|mathbf|textbf|mathit)\s*\{([^{}]*)\}/g, '<span class="ai-math-text">$1</span>');
        s = s.replace(/\\vec\s*\{([^{}]*)\}/g, function (_m, a) { return a + '\u20d7'; });
        s = s.replace(/\\(?:hat|bar|overline)\s*\{([^{}]*)\}/g, '$1');
        s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>');
        s = s.replace(/_{([^{}]*)}/g, '<sub>$1</sub>');
        s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, function (_m, a) {
          return '<span class="ai-math-sqrt">\u221a<span class="ai-math-rad">' + a + '</span></span>';
        });
        s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function (_m, a, b) {
          return '<span class="ai-math-frac"><span class="ai-math-num">' + a + '</span><span class="ai-math-den">' + b + '</span></span>';
        });
        if (s === before) break;
      }
      s = s.replace(/\^([A-Za-z0-9+\-])/g, '<sup>$1</sup>');
      s = s.replace(/_([A-Za-z0-9+\-])/g, '<sub>$1</sub>');
      s = s.replace(/\\([a-zA-Z]+)/g, function (_m, name) {
        var hit = AI_MATH_SYMBOLS[name];
        return typeof hit === 'string' ? hit : name;
      });
      s = s.replace(/\\,|\\;|\\:|\\!/g, ' ');
      s = s.replace(/\\ /g, ' ');
      s = s.replace(/[{}]/g, '');
      s = s.replace(/&/g, '');
      return s;
    }

    function aiSafeHref(href) {
      var url = String(href == null ? '' : href).replace(/&amp;/g, '&');
      if (!/^(?:https?:\/\/|mailto:)/i.test(url)) return '';
      return aiEscapeHtml(url);
    }

    function aiInline(text) {
      var s = String(text == null ? '' : text);
      var spans = [];
      var stash = function (kind, value) {
        spans.push({ kind: kind, value: value });
        return '@@AI_IN_' + (spans.length - 1) + '@@';
      };
      s = s.replace(/\x60([^\x60\n]+)\x60/g, function (_m, code) { return stash('code', code); });
      s = s.replace(/\$([^$\n]+)\$/g, function (_m, math) { return stash('math', math); });
      s = s.replace(/\\\(([^\n]*?)\\\)/g, function (_m, math) { return stash('math', math); });
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em class="ai-md-em">$2</em>');
      s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em class="ai-md-em">$2</em>');
      s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (_m, label, href) {
        var safe = aiSafeHref(href);
        // 非白名单协议（javascript/file 等）不做链接化，原样保留整段文本
        if (!safe) return _m;
        return '<a class="ai-md-link" href="' + safe + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      });
      s = s.replace(/@@AI_MATH_([0-9]+)@@/g, function (_m, idx) {
        return '<div class="ai-math-block">' + aiMathHtml(aiRenderMathBlocks[parseInt(idx, 10)] || '') + '</div>';
      });
      s = s.replace(/@@AI_IN_([0-9]+)@@/g, function (_m, idx) {
        var item = spans[parseInt(idx, 10)];
        if (!item) return '';
        if (item.kind === 'code') return '<code class="ai-md-inline">' + item.value + '</code>';
        return '<span class="ai-math-inline">' + aiMathHtml(item.value) + '</span>';
      });
      return s;
    }

    function aiSplitRow(line) {
      var t = String(line == null ? '' : line).trim();
      if (t.charAt(0) === '|') t = t.slice(1);
      if (t.charAt(t.length - 1) === '|') t = t.slice(0, t.length - 1);
      return t.split('|');
    }

    // 轻量 Markdown：围栏代码 / 公式 / 表格 / 标题 / 引用 / 分隔线 / 列表 / 段内行内格式
    function renderMarkdown(raw) {
      var text = String(raw == null ? '' : raw).replace(/\r\n/g, '\n');
      var fenceToken = '\x60\x60\x60';
      var fenceCount = text.split(fenceToken).length - 1;
      // 流式中途被中止时可能出现奇数围栏，末尾自动补齐，保证代码块 UI 完整
      if (fenceCount % 2 === 1) text += '\n' + fenceToken;

      var blocks = [];
      var mathBlocks = [];
      aiRenderMathBlocks = mathBlocks;

      // 先保护代码块，避免其中的 $ 被误判为公式
      text = text.replace(/\x60\x60\x60([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)\x60\x60\x60/g, function (_m, lang, code) {
        var idx = blocks.length;
        blocks.push({ lang: lang || '', code: code.replace(/^\n+|\n+$/g, '') });
        return '\n@@AI_CODE_' + idx + '@@\n';
      });

      // 流式被中断时可能留下未闭合的 $$，补齐后仍能渲染为完整公式块
      if ((text.split('$$').length - 1) % 2 === 1) text += '\n$$';

      text = text.replace(/\$\$([\s\S]*?)\$\$/g, function (_m, body) {
        var idx = mathBlocks.length;
        mathBlocks.push(body.replace(/^\s+|\s+$/g, ''));
        return '\n@@AI_MATH_' + idx + '@@\n';
      });
      text = text.replace(/\\\[([\s\S]*?)\\\]/g, function (_m, body) {
        var idx = mathBlocks.length;
        mathBlocks.push(body.replace(/^\s+|\s+$/g, ''));
        return '\n@@AI_MATH_' + idx + '@@\n';
      });

      var escaped = aiEscapeHtml(text);
      var lines = escaped.split('\n');
      var html = [];
      var buffer = [];
      var flush = function () {
        if (!buffer.length) return;
        html.push('<p class="ai-md-p">' + aiInline(buffer.join('\n').replace(/\n/g, '<br>')) + '</p>');
        buffer = [];
      };
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var codeMatch = line.match(/^@@AI_CODE_([0-9]+)@@$/);
        if (codeMatch) {
          flush();
          var bi = parseInt(codeMatch[1], 10);
          var block = blocks[bi] || { lang: '', code: '' };
          html.push(
            '<div class="ai-code-wrap">' +
              (block.lang ? '<div class="ai-code-lang">' + aiEscapeHtml(block.lang) + '</div>' : '') +
              '<button class="ai-copy-btn" data-ai-copy="' + bi + '" type="button">复制</button>' +
              '<pre class="ai-code-pre"><code>' + aiEscapeHtml(block.code) + '</code></pre>' +
            '</div>'
          );
          continue;
        }
        var mathMatch = line.match(/^@@AI_MATH_([0-9]+)@@$/);
        if (mathMatch) {
          flush();
          html.push('<div class="ai-math-block">' + aiMathHtml(mathBlocks[parseInt(mathMatch[1], 10)] || '') + '</div>');
          continue;
        }
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
          flush();
          html.push('<hr class="ai-md-hr">');
          continue;
        }
        var nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        var sepProbe = nextLine.trim();
        if (
          line.indexOf('|') >= 0 &&
          sepProbe !== '' &&
          sepProbe.replace(/[|:\- ]/g, '') === '' &&
          sepProbe.indexOf('-') >= 0
        ) {
          flush();
          var headerCells = aiSplitRow(line);
          var alignCells = aiSplitRow(sepProbe);
          var aligns = [];
          for (var c = 0; c < headerCells.length; c++) {
            var rawAlign = String(alignCells[c] || '').trim();
            var leftColon = rawAlign.charAt(0) === ':';
            var rightColon = rawAlign.charAt(rawAlign.length - 1) === ':';
            aligns.push(leftColon && rightColon ? 'center' : rightColon ? 'right' : 'left');
          }
          var theadHtml = '<tr>';
          for (var hc = 0; hc < headerCells.length; hc++) {
            theadHtml += '<th style="text-align:' + (aligns[hc] || 'left') + ' !important">' + aiInline(headerCells[hc].trim()) + '</th>';
          }
          theadHtml += '</tr>';
          var tbodyHtml = '';
          var rj = i + 2;
          while (rj < lines.length && lines[rj].indexOf('|') >= 0 && lines[rj].trim() !== '') {
            var rowCells = aiSplitRow(lines[rj]);
            tbodyHtml += '<tr>';
            for (var rc = 0; rc < headerCells.length; rc++) {
              tbodyHtml += '<td style="text-align:' + (aligns[rc] || 'left') + ' !important">' + aiInline(String(rowCells[rc] || '').trim()) + '</td>';
            }
            tbodyHtml += '</tr>';
            rj++;
          }
          html.push('<div class="ai-md-table-wrap"><table class="ai-md-table"><thead>' + theadHtml + '</thead><tbody>' + tbodyHtml + '</tbody></table></div>');
          i = rj - 1;
          continue;
        }
        var heading = line.match(/^(#{1,4})\s+(.+)$/);
        if (heading) {
          flush();
          html.push('<h4 class="ai-md-h ai-md-h' + heading[1].length + '">' + aiInline(heading[2]) + '</h4>');
          continue;
        }
        var quoteMatch = line.match(/^&gt;\s?(.*)$/);
        if (quoteMatch) {
          flush();
          var quoteLines = [quoteMatch[1]];
          while (i + 1 < lines.length) {
            var qm = lines[i + 1].match(/^&gt;\s?(.*)$/);
            if (!qm) break;
            quoteLines.push(qm[1]);
            i++;
          }
          html.push('<blockquote class="ai-md-quote">' + aiInline(quoteLines.join('\n').replace(/\n/g, '<br>')) + '</blockquote>');
          continue;
        }
        var listMatch = line.match(/^(\s*)([-*+]|[0-9]+\.)\s+(.+)$/);
        if (listMatch) {
          flush();
          var indentWidth = listMatch[1].replace(/\t/g, '   ').length;
          var level = Math.min(3, Math.floor(indentWidth / 2));
          var ordered = /^[0-9]/.test(listMatch[2]);
          var marker = '\u2022';
          if (ordered) marker = listMatch[2];
          else if (level === 1) marker = '\u25e6';
          else if (level >= 2) marker = '\u25aa';
          html.push('<div class="ai-md-li ai-md-li-d' + level + '">' + marker + ' ' + aiInline(listMatch[3]) + '</div>');
          continue;
        }
        if (!line.trim()) {
          flush();
          continue;
        }
        buffer.push(line);
      }
      flush();
      aiRenderBlocks = blocks;
      return html.join('');
    }

    function wireAiCopyButtons(root) {
      if (!root) return;
      var buttons = root.querySelectorAll('.ai-copy-btn');
      for (var i = 0; i < buttons.length; i++) {
        (function (btn) {
          var idx = parseInt(btn.getAttribute('data-ai-copy') || '-1', 10);
          var block = aiRenderBlocks[idx];
          if (!block) return;
          btn.addEventListener('click', function (event) {
            event.stopPropagation();
            try {
              var plain = String(block.code == null ? '' : block.code);
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(plain);
              } else {
                var temp = document.createElement('textarea');
                temp.value = plain;
                temp.select();
                document.execCommand('copy');
              }
              btn.textContent = '已复制';
              setTimeout(function () { btn.textContent = '复制'; }, 1600);
            } catch (e) {}
          });
        })(buttons[i]);
      }
    }

    function aiScrollToBottom(force) {
      var box = byId(AI_MESSAGES_ID);
      if (!box) return;
      var nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      if (force || nearBottom) box.scrollTop = box.scrollHeight;
    }

    function appendAiMessage(role, content) {
      var box = byId(AI_MESSAGES_ID);
      if (!box) return null;
      var wrap = document.createElement('div');
      wrap.className = 'ai-msg ' + (role === 'user' ? 'user' : 'assistant');
      var roleTag = document.createElement('div');
      roleTag.className = 'ai-msg-role';
      roleTag.textContent = role === 'user' ? '我' : '问渠助教';
      wrap.appendChild(roleTag);
      var reasoningWrap = null;
      var reasoningBody = null;
      if (role !== 'user') {
        reasoningWrap = document.createElement('details');
        reasoningWrap.className = 'ai-msg-reasoning';
        reasoningWrap.style.display = 'none';
        var summary = document.createElement('summary');
        summary.textContent = '思考过程';
        reasoningBody = document.createElement('div');
        reasoningBody.className = 'ai-msg-reasoning-body';
        reasoningWrap.appendChild(summary);
        reasoningWrap.appendChild(reasoningBody);
        wrap.appendChild(reasoningWrap);
      }
      var body = document.createElement('div');
      body.className = 'ai-msg-body';
      body.textContent = content || '';
      wrap.appendChild(body);
      box.appendChild(wrap);
      return { wrap: wrap, body: body, reasoningWrap: reasoningWrap, reasoningBody: reasoningBody };
    }

    function buildAiWelcomeNode() {
      var welcome = document.createElement('div');
      welcome.id = AI_WELCOME_ID;
      welcome.className = 'ai-welcome';
      welcome.innerHTML = AI_WELCOME_INNER;
      bindAiWelcome(welcome);
      return welcome;
    }

    function bindAiWelcome(root) {
      if (!root || root.__proferAiWelcomeBound) return;
      root.__proferAiWelcomeBound = true;
      var chips = root.querySelectorAll('.ai-chip');
      for (var i = 0; i < chips.length; i++) {
        (function (chip) {
          chip.addEventListener('click', function (event) {
            event.stopPropagation();
            sendAiMessage(chip.textContent || '');
          });
        })(chips[i]);
      }
    }

    function renderAiHistory(list) {
      var box = byId(AI_MESSAGES_ID);
      if (!box) return;
      box.innerHTML = '';
      var messages = list && list.length ? list : [];
      if (!messages.length) {
        box.appendChild(buildAiWelcomeNode());
        return;
      }
      for (var i = 0; i < messages.length; i++) {
        var message = messages[i];
        var role = message.role === 'user' ? 'user' : 'assistant';
        var node = appendAiMessage(role, message.content || '');
        if (!node) continue;
        if (role === 'assistant') {
          if (message.reasoningContent) {
            node.reasoningWrap.style.display = '';
            node.reasoningBody.textContent = message.reasoningContent;
          }
          node.body.innerHTML = renderMarkdown(message.content || '');
          wireAiCopyButtons(node.body);
        }
      }
      aiScrollToBottom(true);
    }

    function updateAiSendButton() {
      var btn = byId(AI_SEND_ID);
      if (!btn) return;
      if (aiState.streaming) {
        btn.classList.add('is-stop');
        btn.setAttribute('aria-label', '停止生成');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"></rect></svg>';
      } else {
        btn.classList.remove('is-stop');
        btn.setAttribute('aria-label', '发送');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9"></polygon></svg>';
      }
    }

    function finalizeAiMessage(isError, errorText) {
      var body = aiState.activeEl;
      aiState.streaming = false;
      aiState.requestId = '';
      updateAiSendButton();
      if (body) {
        body.classList.remove('is-typing');
        if (aiState.answerText) {
          body.innerHTML = renderMarkdown(aiState.answerText);
          wireAiCopyButtons(body);
        } else if (!isError) {
          body.textContent = '（无内容）';
        } else {
          body.textContent = '生成失败';
        }
        if (isError && errorText) {
          var errorNode = document.createElement('div');
          errorNode.className = 'ai-msg-error';
          errorNode.textContent = errorText;
          body.appendChild(errorNode);
        }
      }
      aiScrollToBottom(true);
      aiState.activeEl = null;
      aiState.activeReasoningEl = null;
      aiState.activeReasoningWrap = null;
      aiState.answerText = '';
      aiState.reasoningText = '';
    }

    function handleAiStream(payload) {
      if (!payload || typeof payload !== 'object') return;
      if (payload.requestId !== aiState.requestId) return;
      if (payload.type === 'delta') {
        aiState.answerText += payload.text || '';
        if (aiState.activeEl) {
          aiState.activeEl.classList.remove('is-typing');
          aiState.activeEl.textContent = aiState.answerText;
          aiScrollToBottom(false);
        }
        return;
      }
      if (payload.type === 'reasoning') {
        aiState.reasoningText += payload.text || '';
        if (aiState.activeReasoningWrap) aiState.activeReasoningWrap.style.display = '';
        if (aiState.activeReasoningEl) aiState.activeReasoningEl.textContent = aiState.reasoningText;
        return;
      }
      if (payload.type === 'done') {
        finalizeAiMessage(false, '');
        return;
      }
      if (payload.type === 'error') {
        finalizeAiMessage(true, payload.error || '请求失败');
      }
    }

    function sendAiMessage(prefill) {
      if (aiState.streaming) return;
      var input = byId(AI_INPUT_ID);
      var text = typeof prefill === 'string' && prefill ? prefill : (input ? input.value : '');
      text = String(text || '').trim();
      if (!text) return;
      if (input) {
        input.value = '';
        input.style.height = '';
      }
      var welcome = byId(AI_WELCOME_ID);
      if (welcome && welcome.parentNode) welcome.parentNode.removeChild(welcome);
      appendAiMessage('user', text);
      var assistant = appendAiMessage('assistant', '');
      if (assistant) {
        assistant.body.classList.add('is-typing');
        assistant.body.textContent = '正在思考…';
      }
      aiState.streaming = true;
      aiState.answerText = '';
      aiState.reasoningText = '';
      aiState.activeEl = assistant ? assistant.body : null;
      aiState.activeReasoningEl = assistant ? assistant.reasoningBody : null;
      aiState.activeReasoningWrap = assistant ? assistant.reasoningWrap : null;
      var requestId = aiNewRequestId();
      aiState.requestId = requestId;
      updateAiSendButton();
      aiScrollToBottom(true);
      var ctx = collectClassroomContext(true);
      aiSend(AI_BRIDGE.REQUEST_SEND, {
        requestId: requestId,
        courseId: ctx.courseId,
        text: text,
        includeContext: aiState.ctxEnabled,
        context: ctx
      });
    }

    function stopAiStreaming() {
      if (!aiState.streaming || !aiState.requestId) return;
      aiSend(AI_BRIDGE.REQUEST_ABORT, { requestId: aiState.requestId });
    }

    function applyAiConfigToForm(config) {
      if (!config || typeof config !== 'object') return;
      var base = byId(AI_BASE_URL_ID);
      if (base && typeof config.baseUrl === 'string') base.value = config.baseUrl;
      var model = byId(AI_MODEL_ID);
      if (model && typeof config.modelName === 'string') model.value = config.modelName;
      var temp = byId(AI_TEMP_ID);
      if (temp && typeof config.temperature === 'number') temp.value = String(config.temperature);
      var tempValue = byId(AI_TEMP_VALUE_ID);
      if (tempValue && typeof config.temperature === 'number') tempValue.textContent = String(config.temperature);
      var key = byId(AI_API_KEY_ID);
      if (key) {
        // 明文 Key 永不回填；保存后由主进程安全持有
        key.value = '';
        key.placeholder = config.hasApiKey ? '已保存，留空保持不变' : '请输入 API Key（本地 Ollama 可留空）';
      }
      var pill = byId(AI_MODEL_PILL_ID);
      if (pill && typeof config.modelName === 'string') {
        var pillText = pill.querySelector('.ai-model-pill-text');
        if (pillText) pillText.textContent = config.modelName || '未配置模型';
      }
    }

    function handleAiSaveResult(msg) {
      var status = byId(AI_SAVE_STATUS_ID);
      var key = byId(AI_API_KEY_ID);
      if (key) {
        key.value = '';
        key.placeholder = '已保存，留空保持不变';
      }
      if (msg.ok) {
        if (status) {
          status.textContent = '已保存，连接正常';
          status.className = 'ai-save-status is-ok';
        }
        applyAiConfigToForm(msg.config || {});
        closeAiSettings();
      } else if (status) {
        status.textContent = '测试失败：' + (msg.error || '未知错误');
        status.className = 'ai-save-status is-error';
      }
    }

    function openAiSettings() {
      var drawer = byId(AI_SETTINGS_ID);
      if (drawer) drawer.classList.add('is-open');
      var status = byId(AI_SAVE_STATUS_ID);
      if (status) {
        status.textContent = '';
        status.className = 'ai-save-status';
      }
      aiSend(AI_BRIDGE.REQUEST_GET_CONFIG, { requestId: aiNewRequestId() });
    }

    function closeAiSettings() {
      var drawer = byId(AI_SETTINGS_ID);
      if (drawer) drawer.classList.remove('is-open');
    }

    function saveAiConfig() {
      var base = byId(AI_BASE_URL_ID);
      var key = byId(AI_API_KEY_ID);
      var model = byId(AI_MODEL_ID);
      var temp = byId(AI_TEMP_ID);
      var status = byId(AI_SAVE_STATUS_ID);
      var patch = {
        requestId: aiNewRequestId(),
        baseUrl: base ? base.value.trim() : '',
        apiKey: key ? key.value.trim() : '',
        modelName: model ? model.value.trim() : '',
        temperature: temp ? parseFloat(temp.value) : 0.7,
        stream: true
      };
      if (status) {
        status.textContent = '测试中…';
        status.className = 'ai-save-status';
      }
      // 保存请求发出后立即清空 DOM 中的明文 Key，避免被主世界其他脚本读取
      if (key) {
        key.value = '';
        key.placeholder = '已保存，留空保持不变';
      }
      aiSend(AI_BRIDGE.REQUEST_SAVE_CONFIG, patch);
    }

    function startNewAiConversation() {
      try {
        if (!window.confirm('清空本节课对话历史？')) return;
      } catch (e) {}
      var box = byId(AI_MESSAGES_ID);
      if (box) {
        box.innerHTML = '';
        box.appendChild(buildAiWelcomeNode());
      }
      aiSend(AI_BRIDGE.REQUEST_CLEAR_HISTORY, {
        requestId: aiNewRequestId(),
        courseId: collectClassroomContext().courseId
      });
    }

    function bindAiPanelControls(panel) {
      var settingsBtn = panel.querySelector('#' + AI_SETTINGS_BTN_ID);
      if (settingsBtn) settingsBtn.addEventListener('click', function (event) { event.stopPropagation(); openAiSettings(); });
      var newBtn = panel.querySelector('#' + AI_NEW_ID);
      if (newBtn) newBtn.addEventListener('click', function (event) { event.stopPropagation(); startNewAiConversation(); });
      var minBtn = panel.querySelector('#' + AI_MIN_ID);
      if (minBtn) minBtn.addEventListener('click', function (event) { event.stopPropagation(); closeAiPanel(); });
      var closeBtn = panel.querySelector('#' + AI_CLOSE_ID);
      if (closeBtn) closeBtn.addEventListener('click', function (event) { event.stopPropagation(); closeAiPanel(); });
      var settingsClose = panel.querySelector('#' + AI_SETTINGS_CLOSE_ID);
      if (settingsClose) settingsClose.addEventListener('click', function (event) { event.stopPropagation(); closeAiSettings(); });
      var eye = panel.querySelector('#' + AI_KEY_EYE_ID);
      if (eye) {
        eye.addEventListener('click', function (event) {
          event.stopPropagation();
          var key = byId(AI_API_KEY_ID);
          if (!key) return;
          var showing = key.type === 'text';
          key.type = showing ? 'password' : 'text';
          eye.textContent = showing ? '显示' : '隐藏';
        });
      }
      var temp = panel.querySelector('#' + AI_TEMP_ID);
      if (temp) {
        temp.addEventListener('input', function () {
          var value = parseFloat(temp.value);
          if (!isFinite(value)) value = 0.7;
          var out = byId(AI_TEMP_VALUE_ID);
          if (out) out.textContent = String(value);
        });
      }
      var saveBtn = panel.querySelector('#' + AI_SAVE_ID);
      if (saveBtn) saveBtn.addEventListener('click', function (event) { event.stopPropagation(); saveAiConfig(); });
      var presets = panel.querySelectorAll('.ai-preset');
      for (var i = 0; i < presets.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function (event) {
            event.stopPropagation();
            var preset = AI_PRESETS[btn.getAttribute('data-preset') || ''];
            if (!preset) return;
            var base = byId(AI_BASE_URL_ID);
            var model = byId(AI_MODEL_ID);
            if (base) base.value = preset.baseUrl;
            if (model) model.value = preset.model;
          });
        })(presets[i]);
      }
      var ctxPill = panel.querySelector('#' + AI_CTX_PILL_ID);
      if (ctxPill) {
        ctxPill.addEventListener('click', function (event) {
          event.stopPropagation();
          aiState.ctxEnabled = !aiState.ctxEnabled;
          try {
            localStorage.setItem(AI_CTX_KEY, aiState.ctxEnabled ? '1' : '0');
          } catch (e) {}
          refreshAiCtxPill();
        });
      }
      var input = panel.querySelector('#' + AI_INPUT_ID);
      if (input) {
        input.addEventListener('input', function () {
          input.style.height = 'auto';
          input.style.height = Math.min(132, input.scrollHeight) + 'px';
        });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' && !event.shiftKey) {
            if (event.isComposing) return;
            event.preventDefault();
            sendAiMessage();
          }
        });
      }
      var sendBtn = panel.querySelector('#' + AI_SEND_ID);
      if (sendBtn) {
        sendBtn.addEventListener('click', function (event) {
          event.stopPropagation();
          if (aiState.streaming) stopAiStreaming();
          else sendAiMessage();
        });
      }
      bindAiWelcome(byId(AI_WELCOME_ID));
    }

    // ---------- 面板拖拽调整大小（Windows 风格：四边 + 四角） ----------
    var AI_RESIZE_MIN_W = 380;
    var AI_RESIZE_MIN_H = 360;
    var AI_RESIZE_MARGIN = 12;

    function aiResizeClamp(value, min, max) {
      if (max < min) max = min;
      if (value < min) return min;
      if (value > max) return max;
      return value;
    }

    function aiResizeCursor(dir) {
      if (dir === 'n' || dir === 's') return 'ns-resize';
      if (dir === 'e' || dir === 'w') return 'ew-resize';
      if (dir === 'ne' || dir === 'sw') return 'nesw-resize';
      return 'nwse-resize';
    }

    function aiApplyPanelBox(panel, width, height, right, bottom) {
      panel.style.setProperty('width', width + 'px', 'important');
      panel.style.setProperty('height', height + 'px', 'important');
      panel.style.setProperty('right', right + 'px', 'important');
      panel.style.setProperty('bottom', bottom + 'px', 'important');
      // 解除初始 CSS 的 max-width / max-height 上限，改由拖拽逻辑统一约束
      panel.style.setProperty('max-width', 'none', 'important');
      panel.style.setProperty('max-height', 'none', 'important');
    }

    function aiClampPanelIntoViewport() {
      var panel = byId(AI_PANEL_ID);
      if (!panel || !panel.__proferAiResized) return;
      var rect = panel.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var maxW = Math.max(AI_RESIZE_MIN_W, window.innerWidth - AI_RESIZE_MARGIN * 2);
      var maxH = Math.max(AI_RESIZE_MIN_H, window.innerHeight - AI_RESIZE_MARGIN * 2);
      var width = aiResizeClamp(rect.width, AI_RESIZE_MIN_W, maxW);
      var height = aiResizeClamp(rect.height, AI_RESIZE_MIN_H, maxH);
      var right = aiResizeClamp(window.innerWidth - rect.right, AI_RESIZE_MARGIN, Math.max(AI_RESIZE_MARGIN, window.innerWidth - width - AI_RESIZE_MARGIN));
      var bottom = aiResizeClamp(window.innerHeight - rect.bottom, AI_RESIZE_MARGIN, Math.max(AI_RESIZE_MARGIN, window.innerHeight - height - AI_RESIZE_MARGIN));
      aiApplyPanelBox(panel, width, height, right, bottom);
    }

    function bindAiPanelResize(panel) {
      if (!panel || panel.__proferAiResizeBound) return;
      panel.__proferAiResizeBound = true;
      var handles = panel.querySelectorAll('[data-ai-resize]');
      for (var i = 0; i < handles.length; i++) {
        (function (handle) {
          handle.addEventListener('pointerdown', function (event) {
            if (event.button !== 0) return;
            var dir = handle.getAttribute('data-ai-resize') || '';
            if (!dir) return;
            event.preventDefault();
            event.stopPropagation();
            var rect = panel.getBoundingClientRect();
            var startX = event.clientX;
            var startY = event.clientY;
            var startLeft = rect.left;
            var startTop = rect.top;
            var startRightEdge = rect.right;
            var startBottomEdge = rect.bottom;
            var startRight = Math.max(0, window.innerWidth - rect.right);
            var startBottom = Math.max(0, window.innerHeight - rect.bottom);
            var maxW = Math.max(AI_RESIZE_MIN_W, window.innerWidth - AI_RESIZE_MARGIN * 2);
            var maxH = Math.max(AI_RESIZE_MIN_H, window.innerHeight - AI_RESIZE_MARGIN * 2);
            var cursor = aiResizeCursor(dir);
            panel.classList.add('is-resizing');
            try { handle.setPointerCapture(event.pointerId); } catch (e) {}
            try {
              document.documentElement.style.cursor = cursor;
              document.documentElement.style.userSelect = 'none';
            } catch (e) {}

            function onMove(moveEvent) {
              moveEvent.preventDefault();
              panel.__proferAiResized = true;
              var dx = moveEvent.clientX - startX;
              var dy = moveEvent.clientY - startY;
              var width = startRightEdge - startLeft;
              var height = startBottomEdge - startTop;
              var right = startRight;
              var bottom = startBottom;
              if (dir.indexOf('e') >= 0) {
                var rightEdge = aiResizeClamp(
                  startRightEdge + dx,
                  startLeft + AI_RESIZE_MIN_W,
                  Math.min(window.innerWidth - AI_RESIZE_MARGIN, startLeft + maxW)
                );
                width = rightEdge - startLeft;
                right = window.innerWidth - rightEdge;
              } else if (dir.indexOf('w') >= 0) {
                var leftEdge = aiResizeClamp(
                  startLeft + dx,
                  Math.max(AI_RESIZE_MARGIN, startRightEdge - maxW),
                  startRightEdge - AI_RESIZE_MIN_W
                );
                width = startRightEdge - leftEdge;
                right = startRight;
              }
              if (dir.indexOf('s') >= 0) {
                var bottomEdge = aiResizeClamp(
                  startBottomEdge + dy,
                  startTop + AI_RESIZE_MIN_H,
                  Math.min(window.innerHeight - AI_RESIZE_MARGIN, startTop + maxH)
                );
                height = bottomEdge - startTop;
                bottom = window.innerHeight - bottomEdge;
              } else if (dir.indexOf('n') >= 0) {
                var topEdge = aiResizeClamp(
                  startTop + dy,
                  Math.max(AI_RESIZE_MARGIN, startBottomEdge - maxH),
                  startBottomEdge - AI_RESIZE_MIN_H
                );
                height = startBottomEdge - topEdge;
                bottom = startBottom;
              }
              aiApplyPanelBox(panel, width, height, right, bottom);
            }

            function onEnd(upEvent) {
              panel.classList.remove('is-resizing');
              window.removeEventListener('pointermove', onMove, true);
              window.removeEventListener('pointerup', onEnd, true);
              window.removeEventListener('pointercancel', onEnd, true);
              try { handle.releasePointerCapture(upEvent.pointerId); } catch (e) {}
              try {
                document.documentElement.style.cursor = '';
                document.documentElement.style.userSelect = '';
              } catch (e) {}
            }

            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onEnd, true);
            window.addEventListener('pointercancel', onEnd, true);
          });
        })(handles[i]);
      }
      if (!window.__proferAiResizeViewportBound) {
        window.__proferAiResizeViewportBound = true;
        window.addEventListener('resize', function () {
          // 延迟到布局完成后再夹取，避免窗口缩放后面板越界
          setTimeout(aiClampPanelIntoViewport, 0);
        });
      }
    }

    function ensureAiAssistant() {
      var dock = appendToBody(AI_DOCK_HTML, AI_DOCK_ID);
      var panel = appendToBody(AI_PANEL_HTML, AI_PANEL_ID);
      if (dock && !dock.__proferAiBound) {
        dock.__proferAiBound = true;
        dock.addEventListener('click', function (event) {
          event.stopPropagation();
          var current = byId(AI_PANEL_ID);
          if (current && current.classList.contains('is-open')) closeAiPanel();
          else openAiPanel();
        });
      }
      if (panel && !panel.__proferAiBound) {
        panel.__proferAiBound = true;
        panel.addEventListener('click', function (event) { event.stopPropagation(); });
        bindAiPanelControls(panel);
        bindAiPanelResize(panel);
      }
    }

    function openAiPanel() {
      var panel = byId(AI_PANEL_ID);
      if (!panel) panel = appendToBody(AI_PANEL_HTML, AI_PANEL_ID);
      var dock = byId(AI_DOCK_ID);
      if (panel) {
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
      }
      if (dock) dock.classList.add('is-active');
      aiState.open = true;
      if (!aiState.configLoaded) {
        aiState.configLoaded = true;
        aiSend(AI_BRIDGE.REQUEST_GET_CONFIG, { requestId: aiNewRequestId() });
      }
      syncAiHistoryForCourse();
      refreshAiCtxPill();
      if (aiState.ctxTimer) clearInterval(aiState.ctxTimer);
      aiState.ctxTimer = setInterval(function () {
        refreshAiCtxPill();
        if (!aiState.streaming) syncAiHistoryForCourse();
      }, 1000);
    }

    function closeAiPanel() {
      var panel = byId(AI_PANEL_ID);
      var dock = byId(AI_DOCK_ID);
      if (panel) {
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
      }
      if (dock) dock.classList.remove('is-active');
      aiState.open = false;
      if (aiState.streaming) stopAiStreaming();
      if (aiState.ctxTimer) {
        clearInterval(aiState.ctxTimer);
        aiState.ctxTimer = null;
      }
    }

    function destroyAiPanel() {
      closeAiPanel();
      aiState.messages = [];
      aiState.config = null;
      aiState.configLoaded = false;
      aiState.historyCourseId = '';
      aiState.streaming = false;
      aiState.requestId = '';
      aiState.activeEl = null;
      aiState.activeReasoningEl = null;
      aiState.activeReasoningWrap = null;
      aiState.answerText = '';
      aiState.reasoningText = '';
    }

    function onAiWindowMessage(event) {
      if (event.source !== window) return;
      var msg = event.data;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      if (msg.type.indexOf('__profer_wqxt_ai_') !== 0) return;
      if (msg.type === AI_BRIDGE.RESPONSE_STREAM) {
        handleAiStream(msg.payload);
        return;
      }
      if (msg.type === AI_BRIDGE.RESPONSE_CONFIG) {
        applyAiConfigToForm(msg);
        return;
      }
      if (msg.type === AI_BRIDGE.RESPONSE_SAVE_RESULT) {
        handleAiSaveResult(msg);
        return;
      }
      if (msg.type === AI_BRIDGE.RESPONSE_HISTORY) {
        renderAiHistory(msg.messages || []);
      }
    }

    if (!window.__proferWqxtAiListenerInstalled) {
      window.__proferWqxtAiListenerInstalled = true;
      aiLoadCtxPref();
      window.addEventListener('message', onAiWindowMessage);
    }
    window.__proferWqxtAiPanel = {
      open: openAiPanel,
      close: closeAiPanel,
      destroy: destroyAiPanel
    };
`
  )
}

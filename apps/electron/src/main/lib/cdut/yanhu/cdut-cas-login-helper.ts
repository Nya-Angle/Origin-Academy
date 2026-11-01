/**
 * CDUT CAS 统一身份认证页面快速登录与凭据捕获助手
 *
 * 职责：
 * 1. 运行于 WebContentsView 页面环境中，精准匹配 cas.paas.cdut.edu.cn/cas/login；
 * 2. 在登录页面右侧注入现代化「快捷登录」浮动卡片；
 * 3. 动态展示已保存的账号列表，支持一键填表登录；若遇验证码则自动聚焦验证码框；
 * 4. 每个账号右侧提供「×」按钮，支持单独移除指定账号并实时刷新；
 * 5. 监听原生登录表单提交行为，在用户手动输入新账号或新密码登录时，暂存凭据供主进程校验后落盘。
 */

import { ipcRenderer } from 'electron'
import type { CdutSavedAccountItem } from '@profer/shared'

const CDUT_AUTH_IPC = {
  GET_SAVED_ACCOUNTS: 'cdut-auth:get-saved-accounts',
  SAVE_ACCOUNT: 'cdut-auth:save-account',
  REMOVE_ACCOUNT: 'cdut-auth:remove-account',
  SUBMIT_ATTEMPT: 'cdut-auth:submit-attempt',
} as const

export function applyCdutCasLoginHelper(): void {
  try {
    if (typeof window === 'undefined') return
    // 仅在顶层窗口运行，避免嵌套 iframe 重复注入
    if (window.top !== window) return

    const host = (window.location.hostname || '').toLowerCase()
    const path = (window.location.pathname || '').toLowerCase()
    if (host !== 'cas.paas.cdut.edu.cn' || !path.includes('/cas/login')) {
      return
    }

    const win = window as any
    if (win.__profer_cdut_cas_helper_installed) return
    win.__profer_cdut_cas_helper_installed = true

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initCasHelper())
    } else {
      initCasHelper()
    }
  } catch (err) {
    console.warn('[CDUT 快捷登录] 初始化检查失败:', err)
  }
}

function initCasHelper(): void {
  injectStyles()
  setupSubmitCapture()
  void renderQuickLoginCard()
}

function getFormInputs(): {
  usernameInput: HTMLInputElement | null
  passwordInput: HTMLInputElement | null
  captchaInput: HTMLInputElement | null
  submitButton: HTMLElement | null
} {
  const usernameInput = document.querySelector<HTMLInputElement>(
    'input#username, input[name="username"], input#un, input[name="un"], input[type="text"]',
  )
  const passwordInput = document.querySelector<HTMLInputElement>(
    'input#password, input[name="password"], input#pd, input[name="pd"], input[type="password"]',
  )
  const captchaInput = document.querySelector<HTMLInputElement>(
    'input#captcha, input[name="captcha"], input#validateCode, input[name="validateCode"], input#code',
  )
  const submitButton = document.querySelector<HTMLElement>(
    '#login_submit, button[type="submit"], input[type="submit"], .btn-login, .login-btn, .btn_login, .btn-submit, a#login_submit',
  )

  return { usernameInput, passwordInput, captchaInput, submitButton }
}

/** 拦截捕获用户手动填写的登录凭证 */
function setupSubmitCapture(): void {
  const tryCapture = (): void => {
    try {
      const { usernameInput, passwordInput } = getFormInputs()
      const username = (usernameInput?.value || '').trim()
      const password = passwordInput?.value || ''
      if (username && password) {
        ipcRenderer.send(CDUT_AUTH_IPC.SUBMIT_ATTEMPT, { username, password })
      }
    } catch {
      // 忽略提取异常
    }
  }

  // 1. 监听表单 submit 事件
  document.addEventListener('submit', () => tryCapture(), true)

  // 2. 监听提交按钮点击
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.matches(
          '#login_submit, button[type="submit"], input[type="submit"], .btn-login, .login-btn, .btn-submit',
        ) ||
          target.closest('#login_submit, .btn-login, .login-btn, .btn-submit'))
      ) {
        tryCapture()
      }
    },
    true,
  )

  // 3. 监听回车键提交
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter') {
        tryCapture()
      }
    },
    true,
  )
}

const CARD_ID = '__cdut_quick_login_card'
const STYLE_ID = '__cdut_quick_login_styles'

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${CARD_ID} {
      position: fixed;
      top: 100px;
      right: 42px;
      width: 320px;
      max-width: calc(100vw - 80px);
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(153, 0, 0, 0.18);
      border-radius: 14px;
      box-shadow: 0 12px 32px -4px rgba(153, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      z-index: 2147483640;
      color: #1f2937;
      overflow: hidden;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
    }
    #${CARD_ID}.minimized {
      width: auto;
      min-width: 150px;
    }
    #${CARD_ID} .ql-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: linear-gradient(135deg, rgba(153, 0, 0, 0.07) 0%, rgba(153, 0, 0, 0.02) 100%);
      border-bottom: 1px solid rgba(153, 0, 0, 0.08);
      cursor: pointer;
    }
    #${CARD_ID} .ql-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #${CARD_ID} .ql-icon {
      width: 20px;
      height: 20px;
      color: #990000;
      flex-shrink: 0;
    }
    #${CARD_ID} .ql-title {
      font-size: 13.5px;
      font-weight: 600;
      color: #7a0000;
      letter-spacing: -0.2px;
    }
    #${CARD_ID} .ql-badge {
      font-size: 11px;
      background: rgba(153, 0, 0, 0.12);
      color: #990000;
      padding: 1px 6px;
      border-radius: 10px;
      font-weight: 500;
    }
    #${CARD_ID} .ql-toggle-btn {
      background: transparent;
      border: none;
      color: #6b7280;
      font-size: 14px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: background 0.15s;
    }
    #${CARD_ID} .ql-toggle-btn:hover {
      background: rgba(0, 0, 0, 0.06);
      color: #111827;
    }
    #${CARD_ID} .ql-body {
      padding: 10px 12px;
      max-height: 280px;
      overflow-y: auto;
    }
    #${CARD_ID}.minimized .ql-body {
      display: none;
    }
    #${CARD_ID} .ql-empty {
      font-size: 12px;
      color: #6b7280;
      text-align: center;
      padding: 16px 8px;
      line-height: 1.5;
    }
    #${CARD_ID} .ql-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    #${CARD_ID} .ql-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      transition: all 0.18s ease;
    }
    #${CARD_ID} .ql-item:hover {
      background: #ffffff;
      border-color: rgba(153, 0, 0, 0.35);
      box-shadow: 0 2px 8px rgba(153, 0, 0, 0.08);
      transform: translateY(-1px);
    }
    #${CARD_ID} .ql-account-info {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }
    #${CARD_ID} .ql-user-icon {
      width: 14px;
      height: 14px;
      color: #990000;
      opacity: 0.8;
      flex-shrink: 0;
    }
    #${CARD_ID} .ql-username {
      font-size: 13px;
      font-weight: 500;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${CARD_ID} .ql-actions {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }
    #${CARD_ID} .ql-login-btn {
      background: #990000;
      color: #ffffff;
      border: none;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      outline: none;
    }
    #${CARD_ID} .ql-login-btn:hover {
      background: #7a0000;
    }
    #${CARD_ID} .ql-login-btn:active {
      transform: scale(0.96);
    }
    #${CARD_ID} .ql-remove-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: #9ca3af;
      font-size: 15px;
      line-height: 1;
      cursor: pointer;
      transition: all 0.15s;
    }
    #${CARD_ID} .ql-remove-btn:hover {
      background: #fee2e2;
      color: #dc2626;
    }
    #${CARD_ID} .ql-tip {
      margin-top: 8px;
      font-size: 11px;
      color: #990000;
      background: rgba(153, 0, 0, 0.06);
      padding: 6px 8px;
      border-radius: 6px;
      text-align: center;
      line-height: 1.4;
    }
  `
  document.head.appendChild(style)
}

async function renderQuickLoginCard(): Promise<void> {
  let accounts: CdutSavedAccountItem[] = []
  try {
    accounts = (await ipcRenderer.invoke(CDUT_AUTH_IPC.GET_SAVED_ACCOUNTS)) || []
  } catch (err) {
    console.warn('[CDUT 快捷登录] 拉取已保存账号失败:', err)
  }

  let card = document.getElementById(CARD_ID)
  if (!card) {
    card = document.createElement('div')
    card.id = CARD_ID
    document.body.appendChild(card)
  }

  const isMinimized = card.classList.contains('minimized')

  card.innerHTML = `
    <div class="ql-header" id="${CARD_ID}_header" title="点击展开/折叠快捷登录面板">
      <div class="ql-title-group">
        <svg class="ql-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span class="ql-title">快捷登录</span>
        ${accounts.length > 0 ? `<span class="ql-badge">${accounts.length}</span>` : ''}
      </div>
      <button class="ql-toggle-btn" id="${CARD_ID}_toggle" type="button" title="${isMinimized ? '展开' : '折叠'}">
        ${isMinimized ? '▼' : '▲'}
      </button>
    </div>
    <div class="ql-body">
      ${
        accounts.length === 0
          ? `<div class="ql-empty">
              暂无保存的账号<br/>
              在左侧正常登录后将自动记住
            </div>`
          : `<ul class="ql-list">
              ${accounts
                .map(
                  (acc) => `
                <li class="ql-item" data-username="${escapeHtml(acc.username)}">
                  <div class="ql-account-info" title="学号/工号: ${escapeHtml(acc.username)}">
                    <svg class="ql-user-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span class="ql-username">${escapeHtml(acc.username)}</span>
                  </div>
                  <div class="ql-actions">
                    <button class="ql-login-btn" type="button" data-action="login" data-username="${escapeHtml(acc.username)}">
                      一键登录
                    </button>
                    <button class="ql-remove-btn" type="button" data-action="remove" data-username="${escapeHtml(acc.username)}" title="移除此账号">
                      ×
                    </button>
                  </div>
                </li>
              `,
                )
                .join('')}
            </ul>`
      }
      <div id="${CARD_ID}_tip" class="ql-tip" style="display: none;"></div>
    </div>
  `

  // 绑定折叠切换
  const header = card.querySelector(`#${CARD_ID}_header`)
  const toggleBtn = card.querySelector<HTMLButtonElement>(`#${CARD_ID}_toggle`)
  const handleToggle = (e: Event): void => {
    e.stopPropagation()
    card?.classList.toggle('minimized')
    const nowMin = card?.classList.contains('minimized')
    if (toggleBtn) {
      toggleBtn.textContent = nowMin ? '▼' : '▲'
      toggleBtn.title = nowMin ? '展开' : '折叠'
    }
  }
  header?.addEventListener('click', handleToggle)
  toggleBtn?.addEventListener('click', handleToggle)

  // 绑定账号项按钮事件
  const body = card.querySelector('.ql-body')
  body?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement | null
    if (!target) return

    const action = target.getAttribute('data-action')
    const username = target.getAttribute('data-username')
    if (!action || !username) return

    if (action === 'remove') {
      e.stopPropagation()
      try {
        await ipcRenderer.invoke(CDUT_AUTH_IPC.REMOVE_ACCOUNT, { username })
        void renderQuickLoginCard()
      } catch (err) {
        console.error('[CDUT 快捷登录] 移除账号失败:', err)
      }
      return
    }

    if (action === 'login') {
      e.stopPropagation()
      const account = accounts.find((a) => a.username === username)
      if (account) {
        performOneClickLogin(account)
      }
    }
  })
}

function showTip(msg: string): void {
  const tipEl = document.getElementById(`${CARD_ID}_tip`)
  if (!tipEl) return
  tipEl.textContent = msg
  tipEl.style.display = 'block'
}

function performOneClickLogin(account: CdutSavedAccountItem): void {
  const { usernameInput, passwordInput, captchaInput, submitButton } = getFormInputs()

  if (!usernameInput || !passwordInput) {
    showTip('未检测到登录输入框，请稍后重试或手动输入')
    return
  }

  // 1. 自动填入学号与密码
  usernameInput.focus()
  usernameInput.value = account.username
  usernameInput.dispatchEvent(new Event('input', { bubbles: true }))
  usernameInput.dispatchEvent(new Event('change', { bubbles: true }))

  passwordInput.focus()
  passwordInput.value = account.password || ''
  passwordInput.dispatchEvent(new Event('input', { bubbles: true }))
  passwordInput.dispatchEvent(new Event('change', { bubbles: true }))

  // 2. 提前向主进程记录暂存凭据
  ipcRenderer.send(CDUT_AUTH_IPC.SUBMIT_ATTEMPT, {
    username: account.username,
    password: account.password || '',
  })

  // 3. 检查是否有可见的验证码
  const isCaptchaVisible = !!(
    captchaInput &&
    captchaInput.offsetParent !== null &&
    window.getComputedStyle(captchaInput).display !== 'none'
  )

  if (isCaptchaVisible) {
    captchaInput.focus()
    showTip('账号密码已填充，请在此输入验证码后点击登录')
    return
  }

  // 4. 若无验证码，自动触发提交
  showTip(`正在登录账号 ${account.username}...`)
  setTimeout(() => {
    if (submitButton) {
      submitButton.click()
    } else {
      const form = usernameInput.closest('form')
      if (form) form.submit()
    }
  }, 120)
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

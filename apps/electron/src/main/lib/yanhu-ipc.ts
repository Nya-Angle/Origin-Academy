/**
 * 主进程 IPC 注册
 *
 * 把渲染层通过 preload 暴露的通道统一转发到对应服务：
 * - 智联万站全部标签 / 导航 / 诊断能力 → YanhuExpressManager 单例；
 * - CDUT CAS 多账号持久化与快速登录 → cdutAccountManager 单例；
 * - 主题 / 设置 / 皮肤 → app-settings 与 skin-service。
 *
 * 桌宠相关通道不在应用范围内：PET_SYNC_VIEWPORT 仅做接收即丢弃，
 * 保证渲染层几何上报不会因 handler 缺失而中断。
 */

import { ipcMain } from 'electron'
import {
  CDUT_AUTH_IPC_CHANNELS,
  YANHU_EXPRESS_IPC_CHANNELS as CH,
  type YanhuCreateTabInput,
  type YanhuNavigateInput,
  type YanhuScopeInput,
  type YanhuViewLayout,
} from '@profer/shared'
import { yanhuExpressManager } from './cdut/yanhu/yanhu-express-manager'
import { cdutAccountManager } from './cdut/cdut-account-manager'
import { yanhuThemeService } from './cdut/yanhu/yanhu-theme-service'
import { getSettings, updateSettings } from './app-settings'
import type { AppSettings } from '../../types'

interface TabInput {
  tabId?: string
}

interface ReorderInput {
  orderedTabIds: string[]
}

interface CdpInput {
  tabId?: string
  depth?: number
  filterRegex?: string
  expression?: string
}

let registered = false

export function registerIpcHandlers(): void {
  if (registered) return
  registered = true

  const manager = yanhuExpressManager

  // ===== CDUT CAS 多账号管理与凭证 =====
  ipcMain.handle(CDUT_AUTH_IPC_CHANNELS.GET_SAVED_ACCOUNTS, () => cdutAccountManager.getSavedAccounts())
  ipcMain.handle(
    CDUT_AUTH_IPC_CHANNELS.SAVE_ACCOUNT,
    (_event, payload?: { username?: string; password?: string }) => {
      return cdutAccountManager.saveAccount(payload?.username ?? '', payload?.password ?? '')
    },
  )
  ipcMain.handle(CDUT_AUTH_IPC_CHANNELS.REMOVE_ACCOUNT, (_event, payload?: { username?: string }) => {
    return cdutAccountManager.removeAccount(payload?.username ?? '')
  })
  ipcMain.on('cdut-auth:submit-attempt', (event, payload?: { username?: string; password?: string }) => {
    if (payload?.username && payload?.password) {
      cdutAccountManager.recordPendingSubmit(event.sender.id, payload.username, payload.password)
    }
  })

  // ===== 智联万站：视图与生命周期 =====
  ipcMain.handle(CH.INIT_OR_RESTORE, (_event, input?: YanhuScopeInput) => manager.initOrRestore(input))
  ipcMain.handle(CH.UPDATE_BOUNDS, (_event, layout: YanhuViewLayout) => {
    manager.updateBounds(layout)
  })
  ipcMain.handle(CH.HIDE_VIEW, () => {
    manager.hideView()
  })
  ipcMain.handle(CH.SHOW_VIEW, (_event, input?: YanhuScopeInput) => manager.showView(input))
  ipcMain.handle(CH.SYNC_THEME, (_event, payload?: { isDark?: boolean }) => manager.syncTheme(!!payload?.isDark))

  // ===== 智联万站：标签页操作 =====
  ipcMain.handle(CH.GET_TABS_STATE, () => manager.getTabsState())
  ipcMain.handle(CH.CREATE_TAB, (_event, input?: YanhuCreateTabInput) => manager.createTab(input ?? {}))
  ipcMain.handle(CH.ACTIVATE_TAB, (_event, input: TabInput) => manager.activateTab(input?.tabId ?? ''))
  ipcMain.handle(CH.CLOSE_TAB, (_event, input: TabInput) => manager.closeTab(input?.tabId ?? ''))
  ipcMain.handle(CH.CLOSE_OTHER_TABS, (_event, input: TabInput) =>
    manager.closeOtherTabs(input?.tabId ?? manager.getActiveTabId()),
  )
  ipcMain.handle(CH.CLOSE_RIGHT_TABS, (_event, input: TabInput) =>
    manager.closeRightTabs(input?.tabId ?? manager.getActiveTabId()),
  )
  ipcMain.handle(CH.REORDER_TABS, (_event, input: ReorderInput) => manager.reorderTabs(input?.orderedTabIds ?? []))

  // ===== 智联万站：导航 =====
  ipcMain.handle(CH.NAVIGATE, (_event, input: YanhuNavigateInput) => manager.navigate(input))
  ipcMain.handle(CH.GO_BACK, () => manager.goBack())
  ipcMain.handle(CH.GO_FORWARD, () => manager.goForward())
  ipcMain.handle(CH.RELOAD, () => manager.reload())
  ipcMain.handle(CH.RETRY_WITH_CLEAN, (_event, input?: TabInput) => manager.retryTabWithClean(input?.tabId))
  ipcMain.handle(CH.OPEN_EXTERNAL, (_event, url: string) => manager.openExternal(url))
  ipcMain.handle(CH.SHOW_TAB_MENU, (_event, input?: TabInput) => manager.showTabContextMenu(input?.tabId))

  // ===== 智联万站：底层 CDP 能力 =====
  ipcMain.handle(CH.CDP_GET_DOM, (_event, input?: CdpInput) => manager.cdpGetDom(input?.tabId, input?.depth))
  ipcMain.handle(CH.CDP_GET_SOURCE, (_event, input?: CdpInput) => manager.cdpGetSource(input?.tabId))
  ipcMain.handle(CH.CDP_GET_NETWORK_LOGS, (_event, input?: CdpInput) =>
    manager.cdpGetNetworkLogs(input?.tabId, input?.filterRegex),
  )
  ipcMain.handle(CH.CDP_GET_CONSOLE_LOGS, (_event, input?: CdpInput) => manager.cdpGetConsoleLogs(input?.tabId))
  ipcMain.handle(CH.CDP_EXECUTE_SCRIPT, (_event, input: CdpInput) =>
    manager.cdpExecuteScript(input?.tabId, input?.expression ?? ''),
  )
  ipcMain.handle(CH.OPEN_DIAGNOSTIC_CONSOLE, () => manager.openDiagnosticConsole())

  // ===== 设置 =====
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
    const next = updateSettings(patch ?? {})
    void yanhuThemeService.syncAll()
    return next
  })
}

/**
 * 应用级类型契约（主进程 / preload / 渲染层共用）
 */

import type {
  YanhuCreateTabInput,
  YanhuNavigateInput,
  YanhuScopeInput,
  YanhuTabsState,
  YanhuViewLayout,
} from '@profer/shared'

export type ThemeMode = 'light' | 'dark' | 'system' | 'special'
export type ThemeStyle = string
export type InterfaceVariant = 'classic' | 'modern'

export const DEFAULT_INTERFACE_VARIANT: InterfaceVariant = 'classic'

/** 皮肤注册表条目（resources/skins 或 ~/.cdutai/skins 下的 manifest.json） */
export interface SkinInfo {
  id: string
  name: string
  tone: 'light' | 'dark'
  preview?: string
}

/** 持久化设置（~/.cdutai/settings.json 的子集） */
export interface AppSettings {
  themeMode: ThemeMode
  themeStyle: ThemeStyle
  interfaceVariant: InterfaceVariant
}

export interface YanhuViewportRect {
  x: number
  y: number
  width: number
  height: number
}

/** 智联万站渲染层 IPC 桥 */
export interface YanhuExpressApi {
  onTabsChanged(cb: (state: YanhuTabsState) => void): () => void
  onLoadingChanged(cb: (event: { tabId: string; loading: boolean }) => void): () => void
  onUrlChanged(cb: (event: {
    tabId: string
    url: string
    title: string
    canGoBack: boolean
    canGoForward: boolean
  }) => void): () => void
  initOrRestore(input?: YanhuScopeInput): Promise<YanhuTabsState>
  showView(input?: YanhuScopeInput): Promise<YanhuTabsState>
  hideView(): Promise<void>
  updateBounds(layout: YanhuViewLayout): Promise<void>
  syncTheme(input: { isDark: boolean }): Promise<void>
  createTab(input: YanhuCreateTabInput): Promise<YanhuTabsState>
  activateTab(input: { tabId: string }): Promise<YanhuTabsState>
  closeTab(input: { tabId: string }): Promise<YanhuTabsState>
  reorderTabs(input: { orderedTabIds: string[] }): Promise<YanhuTabsState>
  navigate(input: YanhuNavigateInput): Promise<YanhuTabsState>
  goBack(): Promise<YanhuTabsState>
  goForward(): Promise<YanhuTabsState>
  reload(): Promise<YanhuTabsState>
  retryWithClean(input: { tabId?: string }): Promise<YanhuTabsState>
  showTabMenu(input: { tabId?: string }): Promise<void>
  openExternal(url: string): Promise<void>
  openDiagnosticConsole(): Promise<void>
  petSyncViewport(rect: YanhuViewportRect): Promise<void>
}

/** window.electronAPI 完整契约 */
export interface ElectronAPI {
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getSystemTheme(): Promise<boolean>
  onSystemThemeChanged(cb: (isDark: boolean) => void): () => void
  onThemeSettingsChanged(cb: (settings: AppSettings) => void): () => void
  getSkins(): Promise<SkinInfo[]>
  refreshSkins(): Promise<SkinInfo[]>
  getSkinCss(id: string): Promise<string | null>
  yanhuExpress: YanhuExpressApi
}

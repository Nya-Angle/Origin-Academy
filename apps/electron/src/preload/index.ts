/**
 * 应用 preload：通过 contextBridge 暴露最小可控的 IPC 能力
 *
 * 与渲染层契约见 src/types/index.ts；与主进程通道见 @profer/shared。
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  YANHU_EXPRESS_IPC_CHANNELS as CH,
  type YanhuCreateTabInput,
  type YanhuLoadingChangedEvent,
  type YanhuNavigateInput,
  type YanhuScopeInput,
  type YanhuTabsState,
  type YanhuUrlChangedEvent,
  type YanhuViewLayout,
} from '@profer/shared'
import type { AppSettings, ElectronAPI, YanhuViewportRect } from '../types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const electronAPI: ElectronAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke('settings:update', patch) as Promise<AppSettings>,

  yanhuExpress: {
    onTabsChanged: (cb: (state: YanhuTabsState) => void) => subscribe(CH.ON_TABS_CHANGED, cb),
    onLoadingChanged: (cb: (event: YanhuLoadingChangedEvent) => void) =>
      subscribe(CH.ON_LOADING_CHANGED, cb),
    onUrlChanged: (cb: (event: YanhuUrlChangedEvent) => void) => subscribe(CH.ON_URL_CHANGED, cb),

    initOrRestore: (input?: YanhuScopeInput) =>
      ipcRenderer.invoke(CH.INIT_OR_RESTORE, input) as Promise<YanhuTabsState>,
    showView: (input?: YanhuScopeInput) => ipcRenderer.invoke(CH.SHOW_VIEW, input) as Promise<YanhuTabsState>,
    hideView: () => ipcRenderer.invoke(CH.HIDE_VIEW) as Promise<void>,
    updateBounds: (layout: YanhuViewLayout) => ipcRenderer.invoke(CH.UPDATE_BOUNDS, layout) as Promise<void>,
    syncTheme: (input: { isDark: boolean }) => ipcRenderer.invoke(CH.SYNC_THEME, input) as Promise<void>,

    createTab: (input: YanhuCreateTabInput) =>
      ipcRenderer.invoke(CH.CREATE_TAB, input) as Promise<YanhuTabsState>,
    activateTab: (input: { tabId: string }) =>
      ipcRenderer.invoke(CH.ACTIVATE_TAB, input) as Promise<YanhuTabsState>,
    closeTab: (input: { tabId: string }) => ipcRenderer.invoke(CH.CLOSE_TAB, input) as Promise<YanhuTabsState>,
    closeOtherTabs: (input: { tabId?: string }) =>
      ipcRenderer.invoke(CH.CLOSE_OTHER_TABS, input) as Promise<YanhuTabsState>,
    closeRightTabs: (input: { tabId?: string }) =>
      ipcRenderer.invoke(CH.CLOSE_RIGHT_TABS, input) as Promise<YanhuTabsState>,
    reorderTabs: (input: { orderedTabIds: string[] }) =>
      ipcRenderer.invoke(CH.REORDER_TABS, input) as Promise<YanhuTabsState>,

    navigate: (input: YanhuNavigateInput) => ipcRenderer.invoke(CH.NAVIGATE, input) as Promise<YanhuTabsState>,
    goBack: () => ipcRenderer.invoke(CH.GO_BACK) as Promise<YanhuTabsState>,
    goForward: () => ipcRenderer.invoke(CH.GO_FORWARD) as Promise<YanhuTabsState>,
    reload: () => ipcRenderer.invoke(CH.RELOAD) as Promise<YanhuTabsState>,
    retryWithClean: (input: { tabId?: string }) =>
      ipcRenderer.invoke(CH.RETRY_WITH_CLEAN, input) as Promise<YanhuTabsState>,
    showTabMenu: (input: { tabId?: string }) => ipcRenderer.invoke(CH.SHOW_TAB_MENU, input) as Promise<void>,
    openExternal: (url: string) => ipcRenderer.invoke(CH.OPEN_EXTERNAL, url) as Promise<void>,
    openDiagnosticConsole: () => ipcRenderer.invoke(CH.OPEN_DIAGNOSTIC_CONSOLE) as Promise<void>,

    // 桌宠功能不在应用中：本地消化几何上报，不产生无效 IPC
    petSyncViewport: (_rect: YanhuViewportRect) => Promise.resolve(),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

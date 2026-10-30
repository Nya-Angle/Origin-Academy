/**
 * 应用设置存储（~/.cdutai/settings.json）
 *
 * 仅承载当前应用实际使用的外观字段；读写均为原子写入，文件损坏时回退默认值。
 */

import { BrowserWindow } from 'electron'
import { getSettingsPath } from './config-paths'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file'
import {
  DEFAULT_INTERFACE_VARIANT,
  type AppSettings,
  type InterfaceVariant,
  type ThemeMode,
} from '../../types'

const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  themeStyle: 'default',
  interfaceVariant: DEFAULT_INTERFACE_VARIANT,
}

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system', 'special']
const INTERFACE_VARIANTS: readonly InterfaceVariant[] = ['classic', 'modern']

let cache: AppSettings | null = null

function normalize(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const value = raw as Partial<AppSettings>
  const themeMode = THEME_MODES.includes(value.themeMode as ThemeMode)
    ? (value.themeMode as ThemeMode)
    : DEFAULT_SETTINGS.themeMode
  const themeStyle =
    typeof value.themeStyle === 'string' && value.themeStyle.trim()
      ? value.themeStyle.trim()
      : DEFAULT_SETTINGS.themeStyle
  const interfaceVariant = INTERFACE_VARIANTS.includes(value.interfaceVariant as InterfaceVariant)
    ? (value.interfaceVariant as InterfaceVariant)
    : DEFAULT_SETTINGS.interfaceVariant
  return { themeMode, themeStyle, interfaceVariant }
}

export function getSettings(): AppSettings {
  if (cache) return { ...cache }
  cache = normalize(readJsonFileSafe<unknown>(getSettingsPath()))
  return { ...cache }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = normalize({ ...getSettings(), ...patch })
  cache = next
  writeJsonFileAtomic(getSettingsPath(), next)
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('theme:settings-changed', next)
  }
  return { ...next }
}

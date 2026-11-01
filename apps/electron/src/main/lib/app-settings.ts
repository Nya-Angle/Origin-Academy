/**
 * 应用设置存储（~/.cdutai/settings.json）
 *
 * 仅承载当前应用实际使用的外观字段；读写均为原子写入，文件损坏时回退默认值。
 */

import { BrowserWindow } from 'electron'
import type { WqxtAiConfig } from '@profer/shared'
import { getSettingsPath } from './config-paths'
import { readJsonFileSafe, writeJsonFileAtomic } from './safe-file'
import {
  DEFAULT_INTERFACE_VARIANT,
  type AppSettings,
  type InterfaceVariant,
  type ThemeMode,
} from '../../types'

const DEFAULT_LLM_CONFIG: WqxtAiConfig = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  modelName: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
  stream: true,
}

const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  themeStyle: 'default',
  interfaceVariant: DEFAULT_INTERFACE_VARIANT,
  llmConfig: DEFAULT_LLM_CONFIG,
}

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']
const INTERFACE_VARIANTS: readonly InterfaceVariant[] = ['classic', 'modern']

let cache: AppSettings | null = null

/** 归一化 LLM 配置：逐字段类型校验 + 夹取范围 + baseUrl 去尾斜杠 */
function normalizeLlmConfig(raw: unknown, fallback: WqxtAiConfig): WqxtAiConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const value = raw as Partial<WqxtAiConfig>
  const baseUrl =
    typeof value.baseUrl === 'string' && value.baseUrl.trim()
      ? value.baseUrl.trim().replace(/\/+$/, '')
      : fallback.baseUrl
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey : fallback.apiKey
  const modelName =
    typeof value.modelName === 'string' && value.modelName.trim()
      ? value.modelName.trim()
      : fallback.modelName
  const temperature =
    typeof value.temperature === 'number' && Number.isFinite(value.temperature)
      ? Math.max(0, Math.min(2, value.temperature))
      : fallback.temperature
  const maxTokens =
    typeof value.maxTokens === 'number' && Number.isFinite(value.maxTokens)
      ? Math.max(1, Math.min(8192, Math.round(value.maxTokens)))
      : fallback.maxTokens
  const stream = typeof value.stream === 'boolean' ? value.stream : fallback.stream
  return { baseUrl, apiKey, modelName, temperature, maxTokens, stream }
}

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
  return {
    themeMode,
    themeStyle,
    interfaceVariant,
    llmConfig: normalizeLlmConfig(value.llmConfig, DEFAULT_LLM_CONFIG),
  }
}

export function getSettings(): AppSettings {
  if (cache) return { ...cache }
  cache = normalize(readJsonFileSafe<unknown>(getSettingsPath()))
  return { ...cache }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next = normalize({
    ...current,
    ...patch,
    // llmConfig 始终按字段合并，避免局部补丁覆盖掉其余字段
    llmConfig: { ...(current.llmConfig ?? DEFAULT_LLM_CONFIG), ...(patch.llmConfig ?? {}) },
  })
  cache = next
  writeJsonFileAtomic(getSettingsPath(), next)
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('theme:settings-changed', next)
  }
  return { ...next }
}

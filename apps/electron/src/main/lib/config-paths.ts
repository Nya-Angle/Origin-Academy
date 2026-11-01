/**
 * 配置路径工具
 *
 * 管理 CDUT Studio 应用的本地配置文件路径。
 * 所有用户配置存储在 ~/.cdutai/ 目录下。
 */

import { join, resolve, sep } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolveDevVitePort } from './dev-instance'

/** Vite 开发服务器端口，可由隔离开发实例覆盖 */
export const VITE_DEV_SERVER_PORT = resolveDevVitePort()
/** Vite 开发服务器 URL */
export const VITE_DEV_SERVER_URL = `http://localhost:${VITE_DEV_SERVER_PORT}`

let _configDirName: string | undefined

/**
 * 获取默认配置目录名称
 * 开发模式下返回 '.cdutai-dev'，正式版本返回 '.cdutai'。
 */
export function getConfigDirName(): string {
  if (_configDirName === undefined) {
    if (process.env.PROFER_DEV === '1') {
      _configDirName = '.cdutai-dev'
    } else {
      try {
        const { app } = require('electron')
        _configDirName = app.isPackaged ? '.cdutai' : '.cdutai-dev'
      } catch {
        _configDirName = '.cdutai'
      }
    }
    const mode = _configDirName === '.cdutai-dev' ? '开发模式' : '正式版本'
    console.log(`[配置] 默认配置目录名: ~/${_configDirName}/（${mode}）`)
  }
  return _configDirName
}

/**
 * 解析配置目录路径（纯解析，不创建目录）
 */
export function resolveConfigDir(): string {
  const override = process.env.PROFER_CONFIG_DIR?.trim()
  return override ? resolve(override) : join(homedir(), getConfigDirName())
}

/** 把绝对路径折叠为 ~/ 前缀的展示形式；不在用户主目录下则原样返回。 */
export function toDisplayPath(absolutePath: string): string {
  const home = homedir()
  const prefix = `${home}${sep}`
  return absolutePath.startsWith(prefix) ? `~/${absolutePath.slice(prefix.length).replace(/\\/g, '/')}` : absolutePath
}

/**
 * 获取配置目录路径，如果目录不存在则自动创建。
 */
export function getConfigDir(): string {
  const configDir = resolveConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
    console.log(`[配置] 已创建配置目录: ${configDir}`)
  }
  return configDir
}

/**
 * 获取 CAS 统一身份认证多账号凭证文件路径
 * @returns ~/.cdutai/cdut-account.json
 */
export function getCdutAccountPath(): string {
  return join(getConfigDir(), 'cdut-account.json')
}

/**
 * 获取应用设置文件路径
 * @returns ~/.cdutai/settings.json
 */
export function getSettingsPath(): string {
  return join(getConfigDir(), 'settings.json')
}

/**
 * 获取 AI 问渠学堂课堂会话历史文件路径
 * @returns ~/.cdutai/wqxt-chat-sessions.json
 */
export function getWqxtChatSessionsPath(): string {
  return join(getConfigDir(), 'wqxt-chat-sessions.json')
}

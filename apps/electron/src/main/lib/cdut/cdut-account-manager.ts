/**
 * CDUT CAS 多账号密码安全凭据管理器
 *
 * 职责：
 * - 安全持久化用户的多账号密码列表于本地 (~/.cdutai/cdut-account.json)；
 * - 密码字段使用 Electron 原生 safeStorage (Windows DPAPI / macOS Keychain) 进行系统级高强度加密；
 * - 兼容历史版本的单账号旧结构，平滑升级为多账号存储；
 * - 提供多账号的读取、保存/更新、一键移除操作；
 * - 暂存登录提交行为，仅在 CAS 成功重定向离开登录页时确认落盘，杜绝错误密码被保存；
 * - 支持按最近登录时间排序返回，供 CAS 登录页一键登录卡片消费。
 */

import { safeStorage } from 'electron'
import type { CdutSavedAccountItem } from '@profer/shared'
import { getCdutAccountPath } from '../config-paths'
import { readJsonFileSafe, writeJsonFileAtomic } from '../safe-file'

interface SavedAccountRecord {
  username: string
  encryptedPassword: string
  lastLoginAt: number
}

interface SavedAccountsData {
  version: number
  accounts: SavedAccountRecord[]
}

const STORAGE_VERSION = 1

function encryptPassword(password: string): string {
  if (!password) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(password).toString('base64')
    }
  } catch (err) {
    console.warn('[CDUT 账号管理] safeStorage 加密失败，使用回退方式:', err)
  }
  // 回退机制（若系统环境不支持 safeStorage）
  return Buffer.from(password, 'utf-8').toString('base64')
}

function decryptPassword(encrypted: string): string {
  if (!encrypted) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    }
  } catch {
    // 可能是回退格式或不同机器环境，尝试直接 base64 解码
    try {
      return Buffer.from(encrypted, 'base64').toString('utf-8')
    } catch {
      return ''
    }
  }
  try {
    return Buffer.from(encrypted, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function normalizeAccountsData(raw: unknown): SavedAccountsData {
  if (!raw || typeof raw !== 'object') {
    return { version: STORAGE_VERSION, accounts: [] }
  }

  const obj = raw as Record<string, any>

  // 若已经是多账号结构
  if (Array.isArray(obj.accounts)) {
    return {
      version: typeof obj.version === 'number' ? obj.version : STORAGE_VERSION,
      accounts: obj.accounts.filter(
        (acc) => acc && typeof acc.username === 'string' && typeof acc.encryptedPassword === 'string',
      ),
    }
  }

  // 兼容旧版单个账户文件结构
  if (obj.studentId || obj.username) {
    const legacyUser = String(obj.studentId || obj.username || '').trim()
    const legacyEncrypted = String(obj.encryptedPassword || '')
    const legacyTime = typeof obj.lastLoginAt === 'number' ? obj.lastLoginAt : Date.now()
    if (legacyUser) {
      return {
        version: STORAGE_VERSION,
        accounts: [
          {
            username: legacyUser,
            encryptedPassword: legacyEncrypted,
            lastLoginAt: legacyTime,
          },
        ],
      }
    }
  }

  return { version: STORAGE_VERSION, accounts: [] }
}

class CdutAccountManager {
  private filePath = getCdutAccountPath()
  /** 暂存表单提交中的凭证：webContentsId -> { username, password, timestamp } */
  private pendingSubmits = new Map<number, { username: string; password: string; timestamp: number }>()

  /** 暂存一次登录提交行为（待页面导航成功确认后再持久化） */
  public recordPendingSubmit(webContentsId: number, username: string, password: string): void {
    const trimmedUser = (username || '').trim()
    if (!trimmedUser || !password) return
    this.pendingSubmits.set(webContentsId, {
      username: trimmedUser,
      password,
      timestamp: Date.now(),
    })
  }

  /** 页面成功跳转脱离 CAS 登录页，固化已暂存的凭据 */
  public commitPendingSubmit(webContentsId: number): void {
    const pending = this.pendingSubmits.get(webContentsId)
    if (!pending) return
    this.pendingSubmits.delete(webContentsId)
    // 60秒以内的提交视为本次登录有效
    if (Date.now() - pending.timestamp < 60000) {
      this.saveAccount(pending.username, pending.password)
      console.log(`[CDUT 账号管理] 登录成功，已自动安全持久化账号: ${pending.username}`)
    }
  }

  /** 丢弃暂存凭据（如页面报错或用户取消） */
  public clearPendingSubmit(webContentsId: number): void {
    this.pendingSubmits.delete(webContentsId)
  }

  /** 读取所有已保存的账号列表（按最近登录时间降序排序） */
  public getSavedAccounts(): CdutSavedAccountItem[] {
    const raw = readJsonFileSafe<unknown>(this.filePath)
    const data = normalizeAccountsData(raw)

    const items: CdutSavedAccountItem[] = []
    for (const record of data.accounts) {
      if (!record || typeof record.username !== 'string') continue
      const password = decryptPassword(record.encryptedPassword)
      items.push({
        username: record.username,
        password,
        lastLoginAt: typeof record.lastLoginAt === 'number' ? record.lastLoginAt : 0,
      })
    }

    items.sort((a, b) => b.lastLoginAt - a.lastLoginAt)
    return items
  }

  /** 保存或更新账号密码 */
  public saveAccount(username: string, password: string): CdutSavedAccountItem[] {
    const trimmedUser = (username || '').trim()
    if (!trimmedUser || !password) {
      return this.getSavedAccounts()
    }

    const raw = readJsonFileSafe<unknown>(this.filePath)
    const data = normalizeAccountsData(raw)

    const encrypted = encryptPassword(password)
    const existingIndex = data.accounts.findIndex((acc) => acc.username === trimmedUser)
    const now = Date.now()

    if (existingIndex >= 0) {
      data.accounts[existingIndex] = {
        username: trimmedUser,
        encryptedPassword: encrypted,
        lastLoginAt: now,
      }
    } else {
      data.accounts.unshift({
        username: trimmedUser,
        encryptedPassword: encrypted,
        lastLoginAt: now,
      })
    }

    // 按最近时间降序排序
    data.accounts.sort((a, b) => b.lastLoginAt - a.lastLoginAt)

    try {
      writeJsonFileAtomic(this.filePath, data)
    } catch (err) {
      console.error('[CDUT 账号管理] 保存账号凭证失败:', err)
    }

    return this.getSavedAccounts()
  }

  /** 移除单个账号 */
  public removeAccount(username: string): CdutSavedAccountItem[] {
    const trimmedUser = (username || '').trim()
    if (!trimmedUser) {
      return this.getSavedAccounts()
    }

    const raw = readJsonFileSafe<unknown>(this.filePath)
    const data = normalizeAccountsData(raw)

    data.accounts = data.accounts.filter((acc) => acc.username !== trimmedUser)

    try {
      writeJsonFileAtomic(this.filePath, data)
    } catch (err) {
      console.error('[CDUT 账号管理] 移除账号失败:', err)
    }

    return this.getSavedAccounts()
  }
}

export const cdutAccountManager = new CdutAccountManager()

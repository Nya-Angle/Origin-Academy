/**
 * 皮肤注册表（最小实现）
 *
 * 扫描内置资源目录（打包后 process.resourcesPath/skins）与用户目录（~/.cdutai/skins），
 * 每个皮肤为一个子目录，包含 manifest.json（id/name/tone/preview）与 skin.css。
 * 目录不存在或数据损坏时静默返回空列表，主题回退默认配色。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SkinInfo } from '../../types'

let cache: SkinInfo[] | null = null

function candidateRoots(): string[] {
  const roots = [join(process.resourcesPath, 'skins'), join(homedir(), '.cdutai', 'skins')]
  return roots.filter((root) => existsSync(root))
}

function readManifest(dir: string): SkinInfo | null {
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Partial<SkinInfo>
    const id = typeof raw.id === 'string' ? raw.id : ''
    const name = typeof raw.name === 'string' && raw.name ? raw.name : id
    const tone = raw.tone === 'light' || raw.tone === 'dark' ? raw.tone : null
    if (!id || !tone) return null
    return {
      id,
      name,
      tone,
      ...(typeof raw.preview === 'string' && raw.preview ? { preview: raw.preview } : {}),
    }
  } catch {
    return null
  }
}

function scan(): SkinInfo[] {
  const skins = new Map<string, SkinInfo>()
  for (const root of candidateRoots()) {
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      const skin = readManifest(join(root, entry))
      if (skin && !skins.has(skin.id)) skins.set(skin.id, skin)
    }
  }
  return [...skins.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export function listSkins(): SkinInfo[] {
  if (!cache) cache = scan()
  return cache.map((skin) => ({ ...skin }))
}

export function refreshSkins(): SkinInfo[] {
  cache = scan()
  return listSkins()
}

export function getSkinCss(id: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return null
  for (const root of candidateRoots()) {
    const cssPath = join(root, id, 'skin.css')
    if (!existsSync(cssPath)) continue
    try {
      return readFileSync(cssPath, 'utf-8')
    } catch {
      return null
    }
  }
  return null
}

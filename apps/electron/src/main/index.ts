/**
 * CDUT Studio 主进程入口
 *
 * 职责：单实例约束、开发/生产数据目录隔离、主窗口创建、智联万站原生视图宿主绑定、
 * IPC 注册、系统主题广播与应用生命周期清理。
 */

import { app, BrowserWindow, shell } from 'electron'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { VITE_DEV_SERVER_URL } from './lib/config-paths'
import { resolveDevAppName, resolveDevUserDataPath } from './lib/dev-instance'
import { yanhuExpressManager } from './lib/cdut/yanhu/yanhu-express-manager'
import { registerIpcHandlers } from './lib/yanhu-ipc'

// 开发态判定：`electron .` 以非 asar 方式启动时 isPackaged 可能为 true，
// 因此同时接受 `--dev` 显式参数（见 package.json 的 dev:electron）。
const IS_DEV = !app.isPackaged || process.argv.includes('--dev')
if (IS_DEV) process.env.PROFER_DEV = '1'

app.setName(IS_DEV ? resolveDevAppName() : 'CDUT Studio')
app.setPath('userData', resolveDevUserDataPath(app.getPath('appData'), !IS_DEV))

// 移除历史版本持久化保存的账户 / 身份信息（登录 Cookie、分区缓存）
try {
  rmSync(join(app.getPath('userData'), 'Partitions', 'cdut-auth-zone'), {
    recursive: true,
    force: true,
  })
} catch {
  // 运行中被占用时忽略，下次启动再清理
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 960,
      minHeight: 640,
      show: false,
      title: 'CDUT Studio',
      backgroundColor: '#f6f7fb',
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    window.once('ready-to-show', () => window.show())

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    void loadRenderer(window)

    return window
  }

  async function loadRenderer(window: BrowserWindow): Promise<void> {
    if (!IS_DEV) {
      await window.loadFile(join(__dirname, 'renderer', 'index.html'))
      return
    }
    // 开发态 Vite 可能尚未就绪：短间隔重试，避免窗口空白
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await window.loadURL(VITE_DEV_SERVER_URL)
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    console.error(`[启动] 无法连接开发服务器 ${VITE_DEV_SERVER_URL}，回落本地构建产物`)
    await window.loadFile(join(__dirname, 'renderer', 'index.html'))
  }

  app.whenReady().then(() => {
    registerIpcHandlers()

    mainWindow = createWindow()
    yanhuExpressManager.setOwnerWindow(mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length > 0) return
      mainWindow = createWindow()
      yanhuExpressManager.setOwnerWindow(mainWindow)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    yanhuExpressManager.dispose()
  })
}

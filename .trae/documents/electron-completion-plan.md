# CDUT Studio：补全为完整可运行 Electron 程序

## 1. 目标与范围

把当前只有「核心功能源码」的仓库补全为一个**可 `npm install` → `npm run dev` → `npm run dist:win` 的完整 Electron 应用**。

- 功能范围：仅保留仓库中已存在的代码——智联万站 / AI 问渠学堂内嵌浏览器（多标签、地址栏、书签、主题同步、证书安全插页、CDP 诊断控制台）。
- 不在代码中出现的模块（CDUT 账号登录、AI 对话、速课堂、桌宠、Office/PDF 预览、CLI、皮肤市场等）**一律不造占位实现**，并从 `package.json` / 配置中删除对应依赖与脚本。
- 外壳：轻量完整外壳（自绘标题栏区域 + 作用域切换 + 主题切换），窗口内承载 `YanhuExpressView`。
- 构建链：npm workspaces + Vite（渲染层）+ esbuild（主进程 / 两个 preload）+ electron-builder（发布产物），不依赖缺失的 `scripts/*`。

### 已确认的现状（Phase 1 结论）

已实现的源码：

- `apps/electron/src/main/lib/cdut/yanhu/*`：`YanhuExpressManager`（WebContentsView 多标签/作用域/证书插页/CDP 总线）、标签持久化、主题跟随、指纹伪装、Preload、诊断控制台、DOM 蒸馏、问渠课堂净化器。
- `apps/electron/src/main/lib/security/cert-blacklist.ts`、`apps/electron/src/main/lib/config-paths.ts`、`safe-file.ts`、`dev-instance.ts`、`default-skill-slugs.ts`。
- `apps/electron/src/renderer/atoms/*`、`components/cdut-zone/yanhu/*`、`styles/globals.css`、`styles/skin-base.css`。
- `packages/shared/src/types/browser.ts`、`types/cdut.ts`。

缺失但被现有代码 import 的关键点：

| 缺失项 | 被谁引用 |
| --- | --- |
| `@profer/shared` 包入口 `packages/shared/src/index.ts` + `package.json` | 主进程/渲染层多处 |
| `BROWSER_CERT_INTERSTITIAL_ALLOW_URL`、`..._BACK_URL`、`parseCertInterstitialSentinel` | `cert-blacklist.ts`、`yanhu-express-manager.ts` |
| `src/main/lib/cdut/cdut-auth-manager.ts`（`CDUT_AUTH_PARTITION`、`CDUT_AUTH_CERT_SESSION_ID`） | `yanhu-express-manager.ts` |
| `src/main/lib/app-theme-service.ts`（`resolveAppThemeIsDark`） | `yanhu-theme-service.ts` |
| `src/types/*`（`ThemeMode`、`ThemeStyle`、`InterfaceVariant`、`SkinInfo`、`DEFAULT_INTERFACE_VARIANT`） | `atoms/theme.ts` |
| `src/main/index.ts`、`src/preload/index.ts`、`src/renderer/index.html`、`index.tsx/App` | 无（入口整体缺失） |
| 根 `package.json` / `tsconfig.json`、`packages/shared/package.json` | workspace 与类型解析 |
| `jotai` 依赖 | `atoms/*` |
| `scripts/*`、`resources/*`、`viewer.html`、`lib/node-canvas-stub.ts`、`assets/*` | 原配置引用，全部不存在 |

已知系统环境：Node 26.7.0 / npm 11.19.0 / Bun 1.4.2；`electron@43.2.0`、`jotai@3.0.1` 在 npm registry 中均存在；当前无 `node_modules`。

## 2. 方案总览（目录结构）

```
package.json                     # 新增：npm workspaces 根
tsconfig.json                    # 新增：基础 TS 配置
packages/shared/
  package.json                   # 新增：@profer/shared，exports 指向源码
  src/index.ts                   # 新增：统一导出
  src/types/cert-interstitial.ts # 新增：证书插页哨兵常量与解析
  src/types/{browser,cdut}.ts    # 已有，不改
apps/electron/
  package.json                   # 重写：精简依赖与 npm 脚本
  vite.config.ts                 # 精简：去掉 viewer / 缺失 stub / assets
  tailwind.config.js             # 精简：只扫 renderer
  tsconfig.json                  # 精简：只保留 @ 与 types 别名
  electron-builder.yml           # 精简：去掉缺失资源与钩子
  src/types/index.ts             # 新增：主题/皮肤/设置类型
  src/types/global.d.ts          # 新增：window.electronAPI 声明
  src/main/index.ts              # 新增：应用入口
  src/main/lib/app-settings.ts   # 新增：设置读写 + 广播
  src/main/lib/app-theme-service.ts   # 新增：resolveAppThemeIsDark
  src/main/lib/skin-service.ts   # 新增：皮肤注册表最小实现
  src/main/lib/cdut/cdut-auth-manager.ts # 新增：认证分区常量
  src/main/lib/yanhu-ipc.ts      # 新增：全部 IPC 注册
  src/preload/index.ts           # 新增：contextBridge API
  src/renderer/index.html        # 新增：首帧防闪烁 + 挂载点
  src/renderer/main.tsx          # 新增：React 入口 + 主题引导
  src/renderer/App.tsx           # 新增：轻量外壳
```

`apps/electron/src/main/lib/...` 下已有核心文件**不改动**，只补依赖与装配。

## 3. 具体改动

### 3.1 根 workspace

**新增 `package.json`**（根）

- `"private": true`，`"workspaces": ["apps/*", "packages/*"]`。
- scripts：`dev` / `build` / `typecheck` / `pack` / `dist:win` 全部用 `npm run -w @profer/electron ...` 转发。

**新增 `tsconfig.json`（根）**

- `target/module: ESNext`、`moduleResolution: Bundler`、`strict: true`、`jsx: react-jsx`、`skipLibCheck: true`、`resolveJsonModule: true`、`noEmit: true`、`types: ["node"]`。

### 3.2 `packages/shared`

**新增 `packages/shared/package.json`**

```json
{
  "name": "@profer/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

源码直出（source-as-entry），由 Vite 与 esbuild 直接打包，无构建步骤；npm workspaces 用 `"*"` 引用（npm 不支持 `workspace:*` 协议，这与原 `package.json` 的写法必须调整）。

**新增 `packages/shared/src/types/cert-interstitial.ts`**

补上现有代码已引用的契约：

- `BROWSER_CERT_INTERSTITIAL_ALLOW_URL`、`BROWSER_CERT_INTERSTITIAL_BACK_URL`：使用固定 https 伪哨兵（例如 `https://cdutai.local/cert-interstitial/allow|back`），保证 `will-navigate` 可拦截、不触网。
- `parseCertInterstitialSentinel(url): 'allow' | 'back' | null`：严格按 origin + pathname 匹配，供主进程在 `will-navigate` / `will-redirect` / `setWindowOpenHandler` 三处使用。

**新增 `packages/shared/src/index.ts`**：`export * from './types/browser'`、`'./types/cdut'`、`'./types/cert-interstitial'`。

### 3.3 `apps/electron/package.json` 重写

保留：`name: "@profer/electron"`、`"type": "module"`、`"main": "dist/main.cjs"`。

**scripts（全部 npm，无 bun，无 scripts/\*.ts）**

```json
"dev": "concurrently -k -n vite,electron -c blue,green \"npm:dev:vite\" \"npm:dev:electron\"",
"dev:vite": "vite dev",
"dev:electron": "npm run build:main && npm run build:app-preload && npm run build:yanhu-preload && electron .",
"build:main": "esbuild src/main/index.ts --bundle --platform=node --format=cjs --outfile=dist/main.cjs --external:electron",
"build:app-preload": "esbuild src/preload/index.ts --bundle --platform=node --format=cjs --outfile=dist/preload.cjs --external:electron",
"build:yanhu-preload": "esbuild src/main/lib/cdut/yanhu/yanhu-preload.ts --bundle --platform=node --format=cjs --outfile=dist/yanhu-preload.cjs --external:electron",
"build:renderer": "vite build",
"build": "npm run build:main && npm run build:app-preload && npm run build:yanhu-preload && npm run build:renderer",
"start": "npm run build && electron .",
"typecheck": "tsc --noEmit",
"pack": "npm run build && electron-builder --dir",
"dist:win": "npm run build && electron-builder --win nsis --x64",
"dist:mac": "npm run build && electron-builder --mac dmg"
```

**依赖裁剪**（只留实际被现有代码 import 或构建必需的）：

- `dependencies`：`@profer/shared: "*"`。
- `devDependencies`：`react`、`react-dom`、`jotai`、`lucide-react`、`@fontsource-variable/inter`、`@vitejs/plugin-react`、`vite`、`esbuild`、`electron@43.2.0`、`electron-builder`、`concurrently`、`tailwindcss`、`postcss`、`autoprefixer`、`typescript`、`@types/node`、`@types/react`、`@types/react-dom`。
- 删除全部 `@earendil-works/*`、`@profer/{ui,core,project-core,session-core,agent-fabric}`、`@silurus/ooxml`、`molstar`、`pdfjs-dist`、tipTap、radix、xlsx、pptxgenjs、ssh2、three 等未使用依赖。
- 保留 `"build": { "extends": "electron-builder.yml" }`。

### 3.4 构建配置精简

**`apps/electron/vite.config.ts`**

- 保留 `root: src/renderer`、`base: './'`、`__APP_VERSION__`、`build.outDir = dist/renderer`、`server.port = resolveDevVitePort()`。
- 删除 `viewer` input、`manualChunks(molstar)`、`optimizeDeps.include(molstar)`、`@napi-rs/canvas` / `node:zlib` / `@assets` 别名（对应文件不存在）。
- 保留别名 `@` → `src/renderer`、`@/types` → `src/types`。

**`tailwind.config.js`**

- `content.files` 删除 `../../packages/ui/...` 与 `!./src/renderer/public/**`，仅保留 `./src/renderer/**/*.{js,ts,jsx,tsx}`。其余 tokens 配置保留。

**`tsconfig.json`**

- 删除 `@assets/*`、`@hufe921/*` 路径；保留 `@/*`、`@/types/*`；`include: ["src/**/*"]`。

**`electron-builder.yml`**

- 删除 `afterPack`、`afterSign`、`extraResources`、`fileAssociations`、mac/linux/win 的 `extraResources` 与签名项、`publish`、`nsis.include`（`scripts/*` 与 `resources/*` 均不存在）。
- 保留：`appId`、`productName`、`electronVersion: 43.2.0`、`directories.output: out`、`asar: true`、`files: ["dist/**/*", "package.json"]`、`npmRebuild: false`、win `nsis x64`、mac `dmg arm64`、nsis 基础项（oneClick false / 允许改目录 / 桌面与开始菜单快捷方式）。

### 3.5 主进程补全

**`src/main/lib/cdut/cdut-auth-manager.ts`**（最小常量模块，无登录逻辑）

- `CDUT_AUTH_PARTITION = 'persist:cdut-auth-zone'`
- `CDUT_AUTH_CERT_SESSION_ID = 'cdut-auth-zone'`（证书阻断登记表的键）

**`src/main/lib/app-settings.ts`**

- 类型 `AppSettings { themeMode: ThemeMode; themeStyle: ThemeStyle; interfaceVariant: InterfaceVariant }`。
- 默认值：`system` / `default` / `classic`。
- 用 `getSettingsPath()` + `readJsonFileSafe` / `writeJsonFileAtomic`（已有）读写；内存缓存。
- `updateSettings(patch)`：合并 → 落盘 → `BrowserWindow.getAllWindows().forEach(w => w.webContents.send('theme:settings-changed', settings))`。
- 兼容设置文件不存在 / 损坏（回退默认）。

**`src/main/lib/app-theme-service.ts`**

- `resolveAppThemeIsDark(): boolean`：`themeMode` 为 `dark/light` 直接判定；`system` 用 `nativeTheme.shouldUseDarkColors`；`special` 用 `skin-service` 返回的 tone，读不到时按 `-light` 后缀启发（与 `atoms/theme.ts` 同一规则）。

**`src/main/lib/skin-service.ts`**（最小可用）

- `listSkins()`：扫描 `process.resourcesPath/skins` 与 `~/.cdutai/skins` 下的 `manifest.json`（字段 `id/name/tone/preview`），不存在目录时返回 `[]`（不报错）。
- `refreshSkins()` = 重新扫描并清缓存。
- `getSkinCss(id)`：读取该皮肤 `skin.css` 文本，失败返回 `null`。
- 目的：让 `atoms/theme.ts` 的 `getSkins/refreshSkins/getSkinCss` 契约真实可用，而不是写死空实现。

**`src/main/lib/yanhu-ipc.ts`**

`registerYanhuIpc()`：用 `ipcMain.handle` 绑定 `YANHU_EXPRESS_IPC_CHANNELS` 中渲染层实际调用的通道，全部转发到 `yanhuExpressManager` 单例：

`INIT_OR_RESTORE / UPDATE_BOUNDS / HIDE_VIEW / SHOW_VIEW / SYNC_THEME / GET_TABS_STATE / CREATE_TAB / ACTIVATE_TAB / CLOSE_TAB / CLOSE_OTHER_TABS / CLOSE_RIGHT_TABS / REORDER_TABS / NAVIGATE / GO_BACK / GO_FORWARD / RELOAD / OPEN_EXTERNAL / RETRY_WITH_CLEAN / SHOW_TAB_MENU / OPEN_DIAGNOSTIC_CONSOLE / CDP_GET_DOM / CDP_GET_SOURCE / CDP_GET_NETWORK_LOGS / CDP_GET_CONSOLE_LOGS / CDP_EXECUTE_SCRIPT`。

- `PET_SYNC_VIEWPORT`：现渲染层会调用，但桌宠功能源码不存在 → 注册为**接收即丢弃**的 no-op（保持渲染层几何上报不中断）。
- `IPCLoadingChanged/URLChanged/TabsChanged` 广播由 manager 自身 `send()` 完成，无需重复注册。
- `settings:*`、`skins:*`、`theme:get-system` 一并在此模块注册。

**`src/main/index.ts`**

1. 模块顶层：`app.setName('CDUT Studio')`；`app.setPath('userData', resolveDevUserDataPath(app.getPath('appData'), app.isPackaged))`。
2. `requestSingleInstanceLock()`，第二实例直接 `quit()` 并聚焦已有窗口。
3. `app.whenReady()`：
   - `createWindow()`：1280×800、min 900×600、`backgroundColor` 按 `resolveAppThemeIsDark()` 取值、`webPreferences { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }`。
   - 开发态（`!app.isPackaged`）加载 `VITE_DEV_SERVER_URL`（来自 `config-paths.ts`），失败按 500ms 重试至多 20 次；成功前不阻塞窗口创建。打包态 `loadFile(join(__dirname, 'renderer/index.html'))`。
   - `yanhuExpressManager.setOwnerWindow(win)`、`registerYanhuIpc()`。
   - `nativeTheme.on('updated')` → 广播 `theme:system-changed` 并 `yanhuThemeService.syncAll()`。
4. 生命周期：`window-all-closed`（非 mac 退出）、`activate`（重建窗口）、`before-quit` → `yanhuExpressManager.dispose()`。

### 3.6 Preload 桥

**`src/preload/index.ts`**：`contextBridge.exposeInMainWorld('electronAPI', {...})`，与 `atoms/theme.ts`、`YanhuExpressView.tsx`、`YanhuNavBar.tsx` 的调用逐一对齐：

- 主题/设置/皮肤：`getSettings`、`updateSettings`、`getSystemTheme`、`onSystemThemeChanged(cb) => unsub`、`onThemeSettingsChanged(cb) => unsub`、`getSkins`、`refreshSkins`、`getSkinCss`。
- `yanhuExpress`：`onTabsChanged`、`onLoadingChanged`、`onUrlChanged`（返回取消订阅函数，内部 `ipcRenderer.on` + `removeListener`）、`initOrRestore`、`showView`、`hideView`、`updateBounds`、`syncTheme`、`createTab`、`activateTab`、`closeTab`、`reorderTabs`、`navigate`、`goBack`、`goForward`、`reload`、`retryWithClean`、`showTabMenu`、`openExternal`、`openDiagnosticConsole`、`petSyncViewport`（本地 `Promise.resolve()`，不跨进程）。

**`src/types/index.ts`**

- `ThemeMode = 'light' | 'dark' | 'system' | 'special'`
- `ThemeStyle = string`（`'default'` 为默认）
- `InterfaceVariant = 'classic' | 'modern'`，`DEFAULT_INTERFACE_VARIANT = 'classic'`
- `SkinInfo { id: string; name: string; tone: 'light' | 'dark'; preview?: string }`
- `AppSettings`
- 导出 `ElectronAPI` 接口（preload 与 renderer 共用）。

**`src/types/global.d.ts`**：`declare global { interface Window { electronAPI: ElectronAPI } }`。

> 注意 `atoms/theme.ts` 从 `'../../types'` 引入，即 `src/types/index.ts`，无需改动该文件。

### 3.7 渲染层补全

**`src/renderer/index.html`**

- `<div id="root">` + `script type=module src="./main.tsx"`。
- 首帧防闪烁内联脚本：读 `localStorage['profer-theme-mode']`、`localStorage['cdut-skin-tone']`，据此设置 `dark` / `skin-*` 类（与 `atoms/theme.ts` 的缓存键完全一致）。

**`src/renderer/main.tsx`**

- `import '@fontsource-variable/inter'`、`import './styles/globals.css'`、`import './styles/skin-base.css'`。
- `ReactDOM.createRoot(...).render(<App />)`。

**`src/renderer/App.tsx`**（轻量外壳，单文件，不新增组件目录）

- 顶部条（`titlebar-drag-region` + 控件 `titlebar-no-drag`）：左侧「CDUT Studio · 智联万站」，中间作用域分段按钮（智联万站 / 问渠学堂），右侧主题切换按钮（浅/深）。
- 作用域切换：`<YanhuExpressView key={scope} scope={scope} />`（key 保证切作用域时重新 init/hide，符合 manager 的作用域语义）。
- 初始化：`useEffect` 调用 `initializeTheme`，用 `getDefaultStore().set(...)` 写入 `themeModeAtom/themeStyleAtom/interfaceVariantAtom/systemIsDarkAtom`，并订阅这些 atom → `applyThemeToDOM`；组件卸载时调用清理函数。
- 主题按钮：`updateThemeMode(resolved === 'dark' ? 'light' : 'dark')`。

## 4. 假设与决策

1. **npm 而非 Bun**：npm workspaces + npm scripts 最贴近 electron-builder 的发布流程；根 `package.json` 统一入口，CI/本机只需 Node+npm。
2. **共享包源码直出**：不引入 `tsc` 构建 `packages/shared`，避免产物同步问题；`exports` 指向 `.ts`，Vite/esbuild 都能直接消费。
3. **不实现桌宠/AI**：`PET_SYNC_VIEWPORT` 仅作 no-op；其余 `PET_*` 通道不注册、不暴露（渲染层未调用）。
4. **皮肤按目录约定实现**：目录不存在即返回空列表，主题回退默认；不新建皮肤资源包。
5. **窗口使用系统原生边框**：不自绘窗口按钮，避免额外窗口控制 IPC；顶部条仅作视觉与拖动区域（`titleBarStyle` 保持默认）。
6. **开发态识别**：以 `app.isPackaged` 判定，不额外注入环境变量；Vite 端口沿用 `resolveDevVitePort()`（默认 5174，可由 `PROFER_VITE_PORT` 覆盖）。
7. **核心业务文件零改写**：`yanhu-*`、`cert-blacklist`、`config-paths`、renderer 组件/原子均保持原样，降低回归风险。

## 5. 实施顺序

1. 根 workspace + `tsconfig.json` + `packages/shared`（含证书哨兵）。
2. 重写 `apps/electron/package.json`、`vite.config.ts`、`tailwind.config.js`、`tsconfig.json`、`electron-builder.yml`。
3. 主进程装配：`cdut-auth-manager`、`app-settings`、`app-theme-service`、`skin-service`、`yanhu-ipc`、`index.ts`。
4. Preload + `src/types`。
5. 渲染层：`index.html`、`main.tsx`、`App.tsx`。
6. `npm install`，逐步 `npm run typecheck` 修类型，`npm run build` 修打包。

## 6. 验证步骤

1. `npm install`（根目录）成功，无 `workspace:*` 解析错误。
2. `npm run typecheck` 通过（重点盯 `config-paths.ts`、`yanhu-express-manager.ts` 的类型引用）。
3. `npm run build` 产出：`dist/main.cjs`、`dist/preload.cjs`、`dist/yanhu-preload.cjs`、`dist/renderer/index.html`。
4. `npm run dev`：窗口出现 → 智联万站首页可加载/可切换标签 → 地址栏导航任意 https → 诊断控制台按钮可打开独立窗口 → 主题按钮切换后原生网页底色与 `prefers-color-scheme` 跟随（无白闪）。
5. 关闭窗口后进程退出；重启后标签拓扑从 `~/.cdutai-dev/yanhu-express/tabs.json` 恢复。
6. `npm run pack` 生成 `out/win-unpacked`，运行该 exe 做一次冒烟；`npm run dist:win` 生成 NSIS 安装包。

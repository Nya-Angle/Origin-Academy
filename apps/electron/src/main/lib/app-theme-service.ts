/**
 * 应用级主题解析（主进程侧）
 *
 * 深色 / 夜间模式已移除：应用固定为浅色外观，
 * 智联万站视图与问渠学堂网页均不再跟随系统主题。
 */

export function resolveAppThemeIsDark(): boolean {
  return false
}

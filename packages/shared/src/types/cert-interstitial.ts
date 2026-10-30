/**
 * 证书安全插页按钮哨兵协议
 *
 * 插页由主进程以 `data:text/html` 渲染，页面内无法直接调用主进程逻辑，
 * 只能通过跳转到哨兵 URL 回投用户意图；主进程在 will-navigate /
 * will-redirect / setWindowOpenHandler 三处统一拦截解析。
 *
 * 使用固定伪域名保证不会误触真实站点，也不会产生网络请求。
 */

const SENTINEL_ORIGIN = 'https://cdutai.local'

/** 「仍要继续」哨兵地址 */
export const BROWSER_CERT_INTERSTITIAL_ALLOW_URL = `${SENTINEL_ORIGIN}/cert-interstitial/allow`

/** 「返回安全页面」哨兵地址 */
export const BROWSER_CERT_INTERSTITIAL_BACK_URL = `${SENTINEL_ORIGIN}/cert-interstitial/back`

export type CertInterstitialAction = 'allow' | 'back'

/**
 * 解析证书插页哨兵 URL。
 *
 * 严格按 origin + pathname 匹配；query / hash 差异不影响判定。
 * 非哨兵地址一律返回 null。
 */
export function parseCertInterstitialSentinel(rawUrl: string): CertInterstitialAction | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.origin !== SENTINEL_ORIGIN) return null
    const path = parsed.pathname.replace(/\/+$/, '')
    if (path === '/cert-interstitial/allow') return 'allow'
    if (path === '/cert-interstitial/back') return 'back'
    return null
  } catch {
    return null
  }
}

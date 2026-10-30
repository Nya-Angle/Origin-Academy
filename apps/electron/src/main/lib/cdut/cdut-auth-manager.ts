/**
 * CDUT 特区账户认证分区契约
 *
 * 已按隐私要求移除持久化登录态：分区名不带 `persist:` 前缀，
 * Cookie / 登录凭证仅存在于本次进程内存中，退出后自动失效。
 */

/** 特区账户内存分区（进程退出即清空） */
export const CDUT_AUTH_PARTITION = 'cdut-auth-zone'

/** 证书临时放行登记表的会话键 */
export const CDUT_AUTH_CERT_SESSION_ID = 'cdut-auth-zone'

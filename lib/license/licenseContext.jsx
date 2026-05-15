'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useCurrentOrg } from '../orgContext'

// ─────────────────────────────────────────────────────────────────────────────
// LicenseProvider (SaaS化 Phase 5)
//
// 現在のアクティブ組織に紐付く myAI ライセンスの状態をクライアントに配布する。
// OrgProvider 配下に置く前提 (currentOrg を購読)。
//
//   const { status, loading, refresh } = useLicense()
//   status: {
//     active: boolean,
//     grandfathered: boolean,  // 既存組織免除フラグ
//     reason: string | null,   // inactive 理由 (not_found / canceled / expired / verify_failed 等)
//     has_key: boolean,        // キー未登録なら false
//     billing_type: string | null,
//     expires_at: string | null,
//     last_verified_at: string | null,
//   } | null
//
// バナー表示判定:
//   inactive かつ grandfathered=false のとき表示。
//   キー未登録 (has_key=false) もこの条件に含まれる (reason="not_set")。
//
// 再検証戦略:
//   1. currentOrg が変わるたびに /api/license/status を 1 回取得
//   2. last_verified_at が 60 秒以上前ならサーバーが裏で再検証する
//   3. クライアント側でも 5 分ごとに refresh をキック (タブ放置時のため)
// ─────────────────────────────────────────────────────────────────────────────

const LicenseContext = createContext({
  status: null,
  loading: true,
  refresh: () => {},
})

export function useLicense() {
  return useContext(LicenseContext)
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000  // 5 分

export function LicenseProvider({ userEmail, children }) {
  const { currentOrg } = useCurrentOrg()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const orgIdRef = useRef(null)

  const fetchStatus = useCallback(async (orgId, email) => {
    if (!orgId || !email) return null
    try {
      const r = await fetch(
        `/api/license/status?organization_id=${encodeURIComponent(orgId)}&requester_email=${encodeURIComponent(email)}`,
        { cache: 'no-store' }
      )
      if (!r.ok) return null
      return await r.json()
    } catch {
      return null
    }
  }, [])

  const refresh = useCallback(async () => {
    const id = currentOrg?.id
    if (!id || !userEmail) {
      setStatus(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const s = await fetchStatus(id, userEmail)
    if (orgIdRef.current === id) {
      setStatus(s)
      setLoading(false)
    }
  }, [currentOrg?.id, userEmail, fetchStatus])

  useEffect(() => {
    orgIdRef.current = currentOrg?.id || null
    refresh()
  }, [currentOrg?.id, refresh])

  useEffect(() => {
    if (!currentOrg?.id) return
    const t = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(t)
  }, [currentOrg?.id, refresh])

  return (
    <LicenseContext.Provider value={{ status, loading, refresh }}>
      {children}
    </LicenseContext.Provider>
  )
}

// バナー表示判定ヘルパー
export function shouldShowLicenseBanner(status) {
  if (!status) return false
  if (status.grandfathered) return false
  return status.active === false
}

// reason → ユーザー向け短文
export function describeLicenseReason(reason) {
  switch (reason) {
    case 'not_set':       return 'ライセンスキーが未登録です'
    case 'not_found':     return 'ライセンスキーが見つかりません'
    case 'canceled':      return 'ライセンスが解約されています'
    case 'expired':       return 'ライセンスの有効期限が切れています'
    case 'wrong_product': return 'このライセンスはこのアプリ用ではありません'
    case 'verify_failed': return 'ライセンス検証サーバーに接続できません'
    case 'verify_timeout':return 'ライセンス検証がタイムアウトしました'
    default:              return 'ライセンスが無効です'
  }
}

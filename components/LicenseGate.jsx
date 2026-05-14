'use client'
import { useState, useEffect, useCallback } from 'react'
import { useLicense } from '../lib/license/licenseContext'
import { useCurrentOrg } from '../lib/orgContext'
import { TYPO, SPACING, RADIUS } from '../lib/themeTokens'
import { btnPrimary, btnGhost, inputStyle, accentRingStyle } from '../lib/iosStyles'

// ─────────────────────────────────────────────────────────────────────────────
// LicenseGate (SaaS化 Phase 5)
//
// 「初回ログイン時だけフルスクリーンでキー入力を促す」UX。
// ソフトロック前提なので「あとで設定する」を押せば閉じられる。
//
// 表示条件 (4つ全て満たすとき):
//   1. ライセンス状態取得済み
//   2. status.grandfathered === false
//   3. status.has_key === false  (= まだ一度もキー登録していない)
//   4. その組織で「あとで」を押した形跡が localStorage に無い
//
// キー登録に成功 → has_key=true になり自動的に閉じる。
// 「あとで」→ localStorage('license_gate_dismissed_v1_<orgId>')='1' → 以降はバナーのみ。
//
// inactive (登録済みだが解約/期限切れ) はこのゲートの対象外 = バナーで通知のみ。
// ─────────────────────────────────────────────────────────────────────────────

const MYAI_MARKET_URL = 'https://my-ai.community/market'
const DISMISS_KEY_PREFIX = 'license_gate_dismissed_v1_'

function dismissedKeyFor(orgId) {
  return `${DISMISS_KEY_PREFIX}${orgId}`
}

export default function LicenseGate({ T, myEmail }) {
  const { status, loading, refresh } = useLicense()
  const { currentOrg } = useCurrentOrg()

  const [dismissed, setDismissed] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const orgId = currentOrg?.id
  const role = currentOrg?.role
  const canManage = role === 'owner' || role === 'admin'

  // 組織が切り替わるたびに dismiss フラグを読み直す
  useEffect(() => {
    if (!orgId) { setDismissed(false); return }
    if (typeof window === 'undefined') return
    try {
      setDismissed(localStorage.getItem(dismissedKeyFor(orgId)) === '1')
    } catch {
      setDismissed(false)
    }
  }, [orgId])

  const shouldShow =
    !loading && status && !status.grandfathered && status.has_key === false && !dismissed

  const handleSave = useCallback(async () => {
    if (!keyInput.trim() || !orgId) return
    setBusy(true); setErrorMsg('')
    try {
      const r = await fetch('/api/license/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: orgId,
          license_key: keyInput.trim(),
          requester_email: myEmail,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErrorMsg(j.error || `保存失敗 (${r.status})`)
        return
      }
      setKeyInput('')
      await refresh()
      // has_key=true 反映でゲート自動クローズ。キー無効なら入力残し
      if (j?.status && j.status.active === false && j.status.reason && j.status.reason !== 'not_set') {
        setErrorMsg(`キーは保存されましたが myAI 側で無効でした (${j.status.reason})`)
      }
    } catch (e) {
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [keyInput, orgId, myEmail, refresh])

  const handleDismiss = useCallback(() => {
    if (orgId && typeof window !== 'undefined') {
      try { localStorage.setItem(dismissedKeyFor(orgId), '1') } catch {}
    }
    setDismissed(true)
  }, [orgId])

  if (!shouldShow) return null

  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: SPACING.lg,
    }}>
      <div style={{
        background: T.bgCard,
        border: `1px solid ${T.borderMid || T.border}`,
        borderRadius: RADIUS.xl,
        width: '100%',
        maxWidth: 480,
        padding: SPACING['2xl'],
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        color: T.text,
        fontFamily: 'inherit',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg }}>
          <div style={accentRingStyle({ color: T.accent, size: 44 })}>
            <span style={{ fontSize: 20 }}>🔑</span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...TYPO.title2, color: T.text }}>
              myAI ライセンスキーが必要です
            </div>
            <div style={{ ...TYPO.caption, color: T.textMuted, letterSpacing: 0, marginTop: 2 }}>
              組織: {currentOrg?.name || ''}
            </div>
          </div>
        </div>

        <div style={{ ...TYPO.body, color: T.textSub, marginBottom: SPACING.lg, lineHeight: 1.7 }}>
          このダッシュボードは myAI 経由でサブスクリプション販売されています。
          {canManage
            ? ' myAI で発行されたキーを入力してください。'
            : ' オーナーまたは admin にキーの登録を依頼してください。'}
        </div>

        {canManage ? (
          <>
            <input
              type="text"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !busy && keyInput.trim()) handleSave() }}
              placeholder="myai_xxxxxxxxxxxxxxxxxx"
              disabled={busy}
              autoFocus
              style={{
                ...inputStyle({ T }),
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 13,
              }}
            />
            {errorMsg && (
              <div style={{ ...TYPO.footnote, color: T.danger, marginTop: SPACING.sm }}>
                ⚠ {errorMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.lg, flexWrap: 'wrap' }}>
              <button onClick={handleSave} disabled={busy || !keyInput.trim()} style={{
                ...btnPrimary({ T, size: 'md' }),
                flex: 1,
                minWidth: 160,
                opacity: !keyInput.trim() || busy ? 0.55 : 1,
                cursor: !keyInput.trim() || busy ? 'not-allowed' : 'pointer',
              }}>
                {busy ? '保存中…' : 'ライセンスを保存'}
              </button>
              <a href={MYAI_MARKET_URL} target="_blank" rel="noopener noreferrer" style={{
                ...btnGhost({ T, size: 'md' }),
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                myAI で購入 ↗
              </a>
            </div>
          </>
        ) : (
          <a href={MYAI_MARKET_URL} target="_blank" rel="noopener noreferrer" style={{
            ...btnGhost({ T, size: 'md' }),
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            marginBottom: SPACING.sm,
          }}>
            myAI を見る ↗
          </a>
        )}

        <div style={{ marginTop: SPACING.lg, textAlign: 'center' }}>
          <button onClick={handleDismiss} style={{
            background: 'transparent',
            border: 'none',
            color: T.textMuted,
            ...TYPO.footnote,
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'inherit',
            padding: SPACING.sm,
          }}>
            あとで設定する (バナーのみ表示)
          </button>
        </div>
      </div>
    </div>
  )
}

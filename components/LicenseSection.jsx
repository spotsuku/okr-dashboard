'use client'
import { useState, useEffect, useCallback } from 'react'
import { useLicense, describeLicenseReason } from '../lib/license/licenseContext'
import { cardStyle, btnPrimary, btnSecondary, inputStyle, pillStyle, accentRingStyle } from '../lib/iosStyles'
import { TYPO, SPACING, RADIUS } from '../lib/themeTokens'

// ─────────────────────────────────────────────────────────────────────────────
// 組織設定モーダル内に差し込むライセンスセクション (SaaS化 Phase 5)
//
// - 未登録: キー入力欄 + 「保存して検証」 + myAI 商品ページへのリンク
// - 登録済: マスク表示 (XXXX-XXXX-1234) + 状態ピル + 「再検証」
// - grandfathered: 免除バッジのみ表示し、入力欄は出さない
//
// props:
//   T          : テーマトークン (OrgSettingsPanel から伝搬)
//   orgId      : 現在の組織 ID
//   myEmail    : 自分の email (requester_email として API へ渡す)
//   canManage  : owner/admin か (false なら閲覧のみ)
// ─────────────────────────────────────────────────────────────────────────────

const MYAI_PRODUCT_URL = 'https://my-ai.community/market'

function StatusPill({ T, status }) {
  if (!status) return null
  if (status.grandfathered) {
    return <span style={pillStyle({ color: T.success, size: 'sm' })}>免除中</span>
  }
  if (status.active) {
    return <span style={pillStyle({ color: T.success, size: 'sm' })}>有効</span>
  }
  if (status.reason === 'not_set') {
    return <span style={pillStyle({ color: T.textMuted, size: 'sm' })}>未登録</span>
  }
  return <span style={pillStyle({ color: T.danger, size: 'sm' })}>無効</span>
}

export default function LicenseSection({ T, orgId, myEmail, canManage }) {
  const { status, loading, refresh } = useLicense()

  const [editing, setEditing] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // 未登録 (has_key=false) かつ grandfathered ではない場合は最初から編集モード
  useEffect(() => {
    if (!loading && status && !status.grandfathered && !status.has_key) {
      setEditing(true)
    }
  }, [loading, status])

  const handleSave = useCallback(async () => {
    if (!keyInput.trim()) return
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
      setEditing(false)
      await refresh()
    } catch (e) {
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [keyInput, orgId, myEmail, refresh])

  const handleReverify = useCallback(async () => {
    setBusy(true); setErrorMsg('')
    try {
      const r = await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: orgId, requester_email: myEmail }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErrorMsg(j.error || `検証失敗 (${r.status})`)
        return
      }
      await refresh()
    } catch (e) {
      setErrorMsg(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }, [orgId, myEmail, refresh])

  const accent = status?.grandfathered
    ? T.success
    : status?.active
      ? T.success
      : T.danger

  return (
    <div style={{
      ...cardStyle({ T, accent, padding: SPACING.lg, raised: false }),
      marginBottom: SPACING.md,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md }}>
        <div style={accentRingStyle({ color: accent, size: 32 })}>
          <span style={{ fontSize: 14 }}>🔑</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TYPO.headline, color: T.text }}>myAI ライセンス</div>
          <div style={{ ...TYPO.caption, color: T.textMuted, letterSpacing: 0 }}>
            組織単位の月額サブスクリプション
          </div>
        </div>
        <StatusPill T={T} status={status} />
      </div>

      {loading && (
        <div style={{ ...TYPO.footnote, color: T.textMuted }}>読み込み中…</div>
      )}

      {!loading && status?.grandfathered && (
        <div style={{ ...TYPO.footnote, color: T.textSub, lineHeight: 1.6 }}>
          この組織はリリース前から利用中のため、ライセンスキーは不要です。
        </div>
      )}

      {!loading && !status?.grandfathered && status?.has_key && !editing && (
        <div>
          <div style={{
            padding: '8px 12px',
            background: T.sectionBg,
            border: `1px solid ${T.border}`,
            borderRadius: RADIUS.md,
            fontSize: 12,
            color: T.textSub,
            marginBottom: SPACING.md,
            display: 'flex',
            alignItems: 'center',
            gap: SPACING.sm,
          }}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: T.textMuted }}>
              ••••••••••••••••
            </span>
            <span style={{ ...TYPO.caption, color: T.textMuted, letterSpacing: 0 }}>
              {status.product_id ? `product: ${status.product_id.slice(0, 8)}…` : 'キー登録済み'}
            </span>
          </div>
          {status.reason && (
            <div style={{ ...TYPO.footnote, color: T.danger, marginBottom: SPACING.sm }}>
              ⚠ {describeLicenseReason(status.reason)}
            </div>
          )}
          {status.last_verified_at && (
            <div style={{ ...TYPO.caption, color: T.textMuted, marginBottom: SPACING.md, letterSpacing: 0 }}>
              最終検証: {new Date(status.last_verified_at).toLocaleString('ja-JP')}
            </div>
          )}
          {canManage && (
            <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
              <button onClick={handleReverify} disabled={busy} style={btnSecondary({ T, size: 'sm' })}>
                {busy ? '検証中…' : '再検証'}
              </button>
              <button onClick={() => { setEditing(true); setKeyInput('') }} disabled={busy} style={btnSecondary({ T, size: 'sm' })}>
                キーを変更
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && !status?.grandfathered && (editing || !status?.has_key) && (
        <div>
          {canManage ? (
            <>
              <div style={{ ...TYPO.footnote, color: T.textSub, lineHeight: 1.6, marginBottom: SPACING.sm }}>
                myAI で発行されたライセンスキーを入力してください。保存と同時に検証が走ります。
              </div>
              <input
                type="text"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="例: myai_xxxxxxxxxxxxxxxxxx"
                disabled={busy}
                style={{ ...inputStyle({ T }), fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}
              />
              {errorMsg && (
                <div style={{ ...TYPO.footnote, color: T.danger, marginTop: SPACING.sm }}>
                  ⚠ {errorMsg}
                </div>
              )}
              <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.md, flexWrap: 'wrap' }}>
                <button onClick={handleSave} disabled={busy || !keyInput.trim()} style={btnPrimary({ T, size: 'sm' })}>
                  {busy ? '保存中…' : '保存して検証'}
                </button>
                {status?.has_key && (
                  <button onClick={() => { setEditing(false); setKeyInput(''); setErrorMsg('') }} disabled={busy} style={btnSecondary({ T, size: 'sm' })}>
                    キャンセル
                  </button>
                )}
                <a href={MYAI_PRODUCT_URL} target="_blank" rel="noopener noreferrer" style={{
                  ...btnSecondary({ T, size: 'sm' }),
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}>
                  myAI で購入 ↗
                </a>
              </div>
            </>
          ) : (
            <div style={{ ...TYPO.footnote, color: T.textMuted, lineHeight: 1.6 }}>
              ライセンスキーが未登録です。owner / admin に登録を依頼してください。
            </div>
          )}
        </div>
      )}
    </div>
  )
}

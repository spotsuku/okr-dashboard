'use client'
import { useLicense, describeLicenseReason } from '../lib/license/licenseContext'
import { SPACING, TYPO, RADIUS } from '../lib/themeTokens'
import Icon from './Icon'

// ─────────────────────────────────────────────────────────────────────────────
// LicenseBanner (SaaS化 Phase 5 + Trial Phase 1)
//
// アクティブ組織のライセンス状態に応じてアプリ最上部にバナー表示。
// 3 つのケースを扱う:
//   1) grandfathered=true  → 何も表示しない (NEO福岡など)
//   2) trial_active=true   → 「無料体験中 · 残り N 日 · ライセンスキー登録 / myAI で購入」
//   3) inactive            → 「ライセンスが無効です」(従来通り)
// ─────────────────────────────────────────────────────────────────────────────

const MYAI_MARKET_URL = 'https://my-ai.community/market'

export default function LicenseBanner({ T, onRegisterKey }) {
  const { status } = useLicense()
  if (!status) return null
  if (status.grandfathered) return null

  // 一時障害は誤検知を避けるため非表示
  if (status.reason === 'verify_failed' || status.reason === 'verify_timeout') return null

  // 1) 無料体験中 (= trial_active=true) → 残日数バナー
  if (status.trial_active && status.has_key === false) {
    const days = status.trial_days_left ?? 0
    const tone = days <= 3 ? T.danger : days <= 7 ? T.warn : T.info || T.accent
    return (
      <div role="status" style={{
        background: `${tone}15`,
        borderBottom: `1px solid ${tone}40`,
        color: T.text,
        padding: `${SPACING.sm}px ${SPACING.lg}px`,
        display: 'flex', alignItems: 'center', gap: SPACING.md,
        flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{
          ...TYPO.footnote, fontWeight: 700,
          padding: `2px ${SPACING.sm}px`, borderRadius: RADIUS.pill,
          background: tone, color: '#fff',
          letterSpacing: '0.04em',
        }}>無料体験中</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...TYPO.callout, color: T.text }}>
            残り <b style={{ color: tone }}>{days}日</b> でフル機能を利用できます
          </div>
          <div style={{ ...TYPO.footnote, color: T.textSub, marginTop: 2 }}>
            30日間の無料体験期間です。{days <= 7 ? '期間終了後はライセンスキーが必要になります。' : '引き続きご利用いただくにはライセンスキーをご登録ください。'}
          </div>
        </div>
        {onRegisterKey && (
          <button onClick={onRegisterKey} style={{
            padding: `6px 14px`, borderRadius: RADIUS.pill,
            background: 'transparent', border: `1px solid ${tone}`,
            color: tone, cursor: 'pointer', fontFamily: 'inherit',
            ...TYPO.footnote, fontWeight: 700, whiteSpace: 'nowrap',
          }}>ライセンスキーを登録</button>
        )}
        <a href={MYAI_MARKET_URL} target="_blank" rel="noopener noreferrer" style={{
          padding: `6px 14px`, borderRadius: RADIUS.pill,
          background: tone, color: '#fff',
          ...TYPO.footnote, textDecoration: 'none',
          fontWeight: 800, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}>myAI で購入 <Icon name="external" size={12} /></a>
      </div>
    )
  }

  // 2) ライセンス inactive → 既存の警告バナー
  if (status.active === false) {
    const isNotSet = status.reason === 'not_set' || status.reason === 'trial_expired'
    const isTrialExpired = status.reason === 'trial_expired'
    const message = isTrialExpired
      ? '無料体験期間が終了しました。引き続きご利用いただくにはライセンスキーが必要です。'
      : describeLicenseReason(status.reason)
    const cta = isNotSet ? 'myAI で購入' : '再契約する'
    return (
      <div role="status" style={{
        background: `${T.danger}15`,
        borderBottom: `1px solid ${T.danger}40`,
        color: T.text,
        padding: `${SPACING.sm}px ${SPACING.lg}px`,
        display: 'flex', alignItems: 'center', gap: SPACING.md,
        flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ color: T.danger, display: 'inline-flex' }} aria-hidden><Icon name="alert" size={16} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ ...TYPO.callout, color: T.text }}>
            {isTrialExpired ? '無料体験が終了しました'
             : isNotSet ? 'myAI ライセンスキーが未登録です'
             : 'ライセンスが無効です'}
          </div>
          <div style={{ ...TYPO.footnote, color: T.textSub, marginTop: 2 }}>
            {message}
          </div>
        </div>
        {onRegisterKey && (
          <button onClick={onRegisterKey} style={{
            padding: `6px 14px`, borderRadius: RADIUS.pill,
            background: 'transparent', border: `1px solid ${T.danger}`,
            color: T.danger, cursor: 'pointer', fontFamily: 'inherit',
            ...TYPO.footnote, fontWeight: 700, whiteSpace: 'nowrap',
          }}>キーを登録</button>
        )}
        <a href={MYAI_MARKET_URL} target="_blank" rel="noopener noreferrer" style={{
          padding: `6px 14px`, borderRadius: RADIUS.pill,
          background: T.danger, color: '#fff',
          ...TYPO.footnote, textDecoration: 'none',
          fontWeight: 800, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}>{cta} <Icon name="external" size={12} /></a>
      </div>
    )
  }

  return null
}

'use client'
import { useLicense, shouldShowLicenseBanner, describeLicenseReason } from '../lib/license/licenseContext'
import { SPACING, TYPO, RADIUS } from '../lib/themeTokens'

// ─────────────────────────────────────────────────────────────────────────────
// LicenseBanner (SaaS化 Phase 5)
//
// アクティブ組織のライセンスが inactive のときだけ、アプリ最上部に
// 「再契約してください」バナーを表示する (ソフトロック)。
//
// - grandfathered=true の組織には出ない
// - キー未登録 (reason='not_set') の場合は「キーを登録してください」
// - 一時的な検証失敗 (verify_failed) は出さない (誤検知防止)
// - 閉じるボタンは出さない (常時警告)
// ─────────────────────────────────────────────────────────────────────────────

const MYAI_MARKET_URL = 'https://my-ai.community/market'

export default function LicenseBanner({ T }) {
  const { status } = useLicense()
  if (!shouldShowLicenseBanner(status)) return null

  // 一時障害は誤検知を避けるため非表示にする
  if (status.reason === 'verify_failed' || status.reason === 'verify_timeout') return null

  const isNotSet = status.reason === 'not_set'
  const message = describeLicenseReason(status.reason)
  const cta = isNotSet ? 'myAI で購入' : '再契約する'

  return (
    <div role="status" style={{
      background: `${T.danger}15`,
      borderBottom: `1px solid ${T.danger}40`,
      color: T.text,
      padding: `${SPACING.sm}px ${SPACING.lg}px`,
      display: 'flex',
      alignItems: 'center',
      gap: SPACING.md,
      flexWrap: 'wrap',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 16 }} aria-hidden>⚠</span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ ...TYPO.callout, color: T.text }}>
          {isNotSet ? 'myAI ライセンスキーが未登録です' : 'ライセンスが無効です'}
        </div>
        <div style={{ ...TYPO.footnote, color: T.textSub, marginTop: 2 }}>
          {message}・組織設定からキーを登録してください
        </div>
      </div>
      <a href={MYAI_MARKET_URL} target="_blank" rel="noopener noreferrer" style={{
        padding: '6px 14px',
        borderRadius: RADIUS.pill,
        background: T.danger,
        color: '#FFFFFF',
        ...TYPO.footnote,
        textDecoration: 'none',
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}>
        {cta} ↗
      </a>
    </div>
  )
}

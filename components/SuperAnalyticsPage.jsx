'use client'
// ─────────────────────────────────────────────────────────────────────────────
// 組織横断 利用分析 (運営=スーパー管理者のみ)
//
// 全組織の利用状況を一覧する。アクセス可否は環境変数 SUPER_ADMIN_EMAILS で
// サーバー側(/api/analytics/super)が判定する。
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { authedFetch } from '../lib/authedFetch'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS } from '../lib/themeTokens'
import { cardStyle, sectionHeaderStyle, pillStyle, accentRingStyle, kpiNumber } from '../lib/iosStyles'
import { LargeTitle, SegmentedControl } from './iosUI'

const PLAN_LABELS = { standard: '標準', demo: 'デモ', trial: 'トライアル', free: '無料' }
const planLabel = (p) => PLAN_LABELS[p] || p || '—'

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
function fmtRelative(iso) {
  if (!iso) return '未利用'
  const diff = Date.now() - new Date(iso).getTime()
  const day = 24 * 60 * 60 * 1000
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 1000)))}分前`
  if (diff < day) return `${Math.floor(diff / (60 * 60 * 1000))}時間前`
  if (diff < 30 * day) return `${Math.floor(diff / day)}日前`
  return fmtDate(iso)
}
// 30日無料トライアルの残日数 (admin_first_login_at 基準)
function trialState(adminFirstLoginAt) {
  if (!adminFirstLoginAt) return { label: '未開始', color: '#94a3b8' }
  const elapsed = Date.now() - new Date(adminFirstLoginAt).getTime()
  const remain = 30 - Math.floor(elapsed / (24 * 60 * 60 * 1000))
  if (remain <= 0) return { label: '期限切れ', color: '#e11d48' }
  if (remain <= 7) return { label: `残${remain}日`, color: '#d97706' }
  return { label: `残${remain}日`, color: '#059669' }
}

export default function SuperAnalyticsPage({ T: TProp, themeKey = 'light' }) {
  const T = TProp || COMMON_TOKENS[themeKey] || COMMON_TOKENS.light
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await authedFetch(`/api/analytics/super?days=${days}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `エラー (${res.status})`)
      setData(json)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: SPACING.xl }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <LargeTitle
          T={T}
          title="全体分析（運営）"
          subtitle="全組織の利用状況を横断で確認します"
          right={
            <SegmentedControl
              T={T}
              value={String(days)}
              onChange={(k) => setDays(Number(k))}
              items={[{ key: '7', label: '7日' }, { key: '30', label: '30日' }, { key: '90', label: '90日' }]}
            />
          }
        />

        {loading && (
          <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, textAlign: 'center', color: T.textMuted, ...TYPO.body }}>読み込み中…</div>
        )}

        {!loading && error && (
          <div style={{ ...cardStyle({ T, accent: T.danger }), marginTop: SPACING.lg, color: T.danger, ...TYPO.body }}>
            読み込みに失敗しました: {error}
          </div>
        )}

        {!loading && !error && data && !data.ready && (
          <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, color: T.textSub, ...TYPO.body, lineHeight: 1.7 }}>
            <div style={{ ...TYPO.headline, color: T.text, marginBottom: SPACING.sm }}>計測の準備ができていません</div>
            利用ログ用テーブル <code style={{ background: T.sectionBg, padding: '1px 6px', borderRadius: RADIUS.xs }}>analytics_events</code> がまだ作成されていません。Supabase で <code style={{ background: T.sectionBg, padding: '1px 6px', borderRadius: RADIUS.xs }}>supabase_analytics_events.sql</code> を実行してください。
          </div>
        )}

        {!loading && !error && data?.ready && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: SPACING.md, marginTop: SPACING.lg }}>
              <KpiCard T={T} color={T.accent} icon="🏢" label="アクティブ組織"
                value={`${data.totals.activeOrgCount}`} sub={`/ ${data.totals.orgCount} 組織中`} />
              <KpiCard T={T} color={T.success} icon="👥" label="アクティブユーザー"
                value={`${data.totals.activeUsers.toLocaleString()}`} sub={`直近 ${data.range.days} 日`} />
              <KpiCard T={T} color={T.warn} icon="📈" label="総アクセス数"
                value={`${data.totals.totalEvents.toLocaleString()}`} sub={`直近 ${data.range.days} 日`} />
              <KpiCard T={T} color={'#a855f7'} icon="⭐" label="最も活発な組織"
                value={data.organizations[0]?.events > 0 ? data.organizations[0].name : '—'}
                sub={data.organizations[0]?.events > 0 ? `${data.organizations[0].events.toLocaleString()} 回` : ''} />
            </div>

            <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, padding: 0 }}>
              <div style={sectionHeaderStyle({ T })}>🏢 組織別の利用状況</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', ...TYPO.subhead }}>
                  <thead>
                    <tr style={{ color: T.textMuted, textAlign: 'left' }}>
                      <th style={thStyle}>組織</th>
                      <th style={thStyle}>プラン</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>メンバー</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>アクティブ</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>アクセス</th>
                      <th style={thStyle}>トライアル</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>最終利用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.organizations.length === 0 && (
                      <tr><td colSpan={7} style={{ ...tdStyle, color: T.textMuted, textAlign: 'center' }}>組織がありません</td></tr>
                    )}
                    {data.organizations.map((o) => {
                      const trial = trialState(o.adminFirstLoginAt)
                      const adoption = o.memberCount > 0 ? Math.round((o.activeUsers / o.memberCount) * 100) : 0
                      return (
                        <tr key={o.id} style={{ borderTop: `1px solid ${T.border}`, opacity: o.events > 0 ? 1 : 0.6 }}>
                          <td style={tdStyle}>
                            <div style={{ color: T.text, fontWeight: 700 }}>{o.name}</div>
                            <div style={{ ...TYPO.caption, color: T.textMuted }}>{o.slug} ・ 開設 {fmtDate(o.createdAt)}</div>
                          </td>
                          <td style={tdStyle}><span style={pillStyle({ color: T.textSub, size: 'sm' })}>{planLabel(o.plan)}</span></td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: T.textSub }}>{o.memberCount}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: T.text, fontWeight: 700 }}>
                            {o.activeUsers}
                            <span style={{ ...TYPO.caption, color: T.textMuted, marginLeft: 4 }}>({adoption}%)</span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: T.text }}>{o.events.toLocaleString()}</td>
                          <td style={tdStyle}><span style={pillStyle({ color: trial.color, size: 'sm' })}>{trial.label}</span></td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: T.textSub }}>{fmtRelative(o.lastActive)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ ...TYPO.caption, color: T.textMuted, marginTop: SPACING.md, textAlign: 'center' }}>
              ※ 運営 (SUPER_ADMIN_EMAILS) のみがこの画面を閲覧できます。アクティブ% = アクティブユーザー ÷ メンバー数。
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const thStyle = { padding: `${SPACING.sm}px ${SPACING.md}px`, fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }
const tdStyle = { padding: `${SPACING.sm + 2}px ${SPACING.md}px`, verticalAlign: 'middle' }

function KpiCard({ T, color, icon, label, value, sub }) {
  return (
    <div style={cardStyle({ T })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <div style={accentRingStyle({ color, size: 30 })}>{icon}</div>
        <span style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={kpiNumber({ color: T.text, size: 26 })}>{value}</span>
        {sub && <span style={{ ...TYPO.caption, color: T.textMuted }}>{sub}</span>}
      </div>
    </div>
  )
}

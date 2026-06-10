'use client'
// ─────────────────────────────────────────────────────────────────────────────
// 組織内 利用分析 (owner / admin のみ)
//
// 「どのメンバーが・どれくらい・どの機能を使っているか」を可視化する。
// データ源: GET /api/analytics/summary (analytics_events を service role で集計)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { useCurrentOrg } from '../lib/orgContext'
import { authedFetch } from '../lib/authedFetch'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS } from '../lib/themeTokens'
import { cardStyle, sectionHeaderStyle, pillStyle, accentRingStyle, kpiNumber, progressBarStyle, progressFillStyle } from '../lib/iosStyles'
import { LargeTitle, SegmentedControl } from './iosUI'

// 画面/機能キー → 日本語ラベル
const PAGE_LABELS = {
  portal: 'ホーム',
  okr: 'OKR',
  weekly: '週次MTG',
  morning: '朝会',
  myokr: 'マイOKR',
  mytasks: 'タスク',
  mycoach: 'マイページ',
  summary: '全社サマリー',
  milestone: 'マイルストーン',
  orgjd: '組織図',
  bulk: '一括登録',
  csv: 'CSV登録',
  analytics: '利用分析',
  superanalytics: '全体分析（運営）',
  mycoo_orb: 'MyCOOオーブ',
  '(none)': '(その他)',
}
const pageLabel = (p) => PAGE_LABELS[p] || p || '(その他)'

// サブ機能 (feature) キー → 日本語ラベル
const FEATURE_LABELS = {
  // MyPageShell タブ
  tab_dashboard:    'ダッシュボード',
  tab_confirm:      '確認',
  tab_wbs:          'タスク (WBS)',
  tab_okr_edit:     'OKR編集',
  tab_mail:         'メール (Gmail)',
  tab_calendar:     'カレンダー',
  tab_drive:        'ドライブ',
  tab_coo:          'MyCOOチャット',
  tab_retrospect:   '振り返り',
  tab_integrations: '連携設定',
  // MyCOO オーブ
  chat_send:        'AIにメッセージ送信',
}
const featureLabel = (f) => FEATURE_LABELS[f] || f || '(その他)'

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const day = 24 * 60 * 60 * 1000
  if (diff < 60 * 1000) return 'たった今'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分前`
  if (diff < day) return `${Math.floor(diff / (60 * 60 * 1000))}時間前`
  if (diff < 7 * day) return `${Math.floor(diff / day)}日前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function AnalyticsPage({ T: TProp, themeKey = 'light' }) {
  const T = TProp || COMMON_TOKENS[themeKey] || COMMON_TOKENS.light
  const { currentOrg } = useCurrentOrg()
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!currentOrg?.id) return
    setLoading(true); setError(null)
    try {
      const res = await authedFetch(`/api/analytics/summary?org=${currentOrg.id}&days=${days}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `エラー (${res.status})`)
      setData(json)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [currentOrg?.id, days])

  useEffect(() => { load() }, [load])

  const maxFeature = Math.max(1, ...((data?.features || []).map(f => f.count)))
  const maxSubFeature = Math.max(1, ...((data?.subFeatures || []).map(f => f.count)))
  const maxDaily = Math.max(1, ...((data?.daily || []).map(d => d.activeUsers)))

  return (
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: SPACING.xl }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <LargeTitle
          T={T}
          title="利用分析"
          subtitle={`${currentOrg?.name || ''} のメンバーがどの機能をどれくらい使っているか`}
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
          <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, textAlign: 'center', color: T.textMuted, ...TYPO.body }}>
            読み込み中…
          </div>
        )}

        {!loading && error && (
          <div style={{ ...cardStyle({ T, accent: T.danger }), marginTop: SPACING.lg, color: T.danger, ...TYPO.body }}>
            読み込みに失敗しました: {error}
          </div>
        )}

        {!loading && !error && data && !data.ready && (
          <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, color: T.textSub, ...TYPO.body, lineHeight: 1.7 }}>
            <div style={{ ...TYPO.headline, color: T.text, marginBottom: SPACING.sm }}>計測の準備ができていません</div>
            利用ログ用テーブル <code style={{ background: T.sectionBg, padding: '1px 6px', borderRadius: RADIUS.xs }}>analytics_events</code> がまだ作成されていません。<br />
            Supabase で <code style={{ background: T.sectionBg, padding: '1px 6px', borderRadius: RADIUS.xs }}>supabase_analytics_events.sql</code> を実行すると計測が始まり、以後この画面に利用状況が表示されます。
          </div>
        )}

        {!loading && !error && data?.ready && (
          <>
            {/* KPI カード */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: SPACING.md, marginTop: SPACING.lg }}>
              <KpiCard T={T} color={T.accent} icon="👥" label="アクティブユーザー"
                value={`${data.totals.activeUsers}`} sub={`/ ${data.totals.memberCount} 名中`} />
              <KpiCard T={T} color={T.success} icon="📈" label="総アクセス数"
                value={`${data.totals.totalEvents.toLocaleString()}`} sub={`直近 ${data.range.days} 日`} />
              <KpiCard T={T} color={T.warn} icon="🔑" label="ログイン回数"
                value={`${data.totals.logins.toLocaleString()}`} sub={`直近 ${data.range.days} 日`} />
              <KpiCard T={T} color={'#a855f7'} icon="⭐" label="最も使われた機能"
                value={data.features[0] ? pageLabel(data.features[0].page) : '—'}
                sub={data.features[0] ? `${data.features[0].count.toLocaleString()} 回` : ''} />
            </div>

            {/* 日次アクティブユーザー トレンド */}
            <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, padding: 0 }}>
              <div style={sectionHeaderStyle({ T })}>📅 日次アクティブユーザー</div>
              <div style={{ padding: SPACING.lg }}>
                {data.daily.every(d => d.activeUsers === 0) ? (
                  <div style={{ color: T.textMuted, ...TYPO.subhead, textAlign: 'center', padding: SPACING.lg }}>
                    この期間の記録はまだありません
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
                    {data.daily.map((d) => (
                      <div key={d.date} title={`${d.date}: ${d.activeUsers}人 / ${d.events}回`}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>
                        <div style={{
                          width: '100%', maxWidth: 18, borderRadius: `${RADIUS.xs}px ${RADIUS.xs}px 0 0`,
                          height: `${Math.round((d.activeUsers / maxDaily) * 100)}%`, minHeight: d.activeUsers > 0 ? 3 : 0,
                          background: `linear-gradient(180deg, ${T.accent} 0%, ${T.accent}99 100%)`,
                        }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 機能別利用 */}
            <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, padding: 0 }}>
              <div style={sectionHeaderStyle({ T })}>🧩 機能別の利用状況</div>
              <div style={{ padding: SPACING.lg, display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
                {data.features.length === 0 && (
                  <div style={{ color: T.textMuted, ...TYPO.subhead }}>まだ記録がありません</div>
                )}
                {data.features.map((f) => (
                  <div key={f.page}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ ...TYPO.subhead, color: T.text, fontWeight: 700 }}>{pageLabel(f.page)}</span>
                      <span style={{ ...TYPO.footnote, color: T.textMuted }}>{f.count.toLocaleString()} 回 ・ {f.users} 人</span>
                    </div>
                    <div style={progressBarStyle({ T, height: 8 })}>
                      <div style={progressFillStyle({ color: T.accent, value: f.count, max: maxFeature })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* サブ機能の利用 (タブ切替・特定アクション) */}
            <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, padding: 0 }}>
              <div style={sectionHeaderStyle({ T })}>🧷 サブ機能の利用（タブ・アクション別）</div>
              <div style={{ padding: SPACING.lg, display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
                {(!data.subFeatures || data.subFeatures.length === 0) && (
                  <div style={{ color: T.textMuted, ...TYPO.subhead, lineHeight: 1.7 }}>
                    {data.hasFeatureCol === false
                      ? <>サブ機能列が未作成です。Supabase で <code style={{ background: T.sectionBg, padding: '1px 6px', borderRadius: RADIUS.xs }}>supabase_analytics_events_add_feature.sql</code> を実行してください。</>
                      : 'まだ記録がありません。マイページのタブ切替や MyCOO チャット送信などを行うと蓄積されます。'}
                  </div>
                )}
                {(data.subFeatures || []).map((f) => (
                  <div key={`${f.page}::${f.feature}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ ...TYPO.subhead, color: T.text, fontWeight: 700 }}>
                        {featureLabel(f.feature)}
                        <span style={{ ...TYPO.caption, color: T.textMuted, fontWeight: 500, marginLeft: 6 }}>
                          ／ {pageLabel(f.page)}
                        </span>
                      </span>
                      <span style={{ ...TYPO.footnote, color: T.textMuted }}>{f.count.toLocaleString()} 回 ・ {f.users} 人</span>
                    </div>
                    <div style={progressBarStyle({ T, height: 8 })}>
                      <div style={progressFillStyle({ color: '#a855f7', value: f.count, max: maxSubFeature })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ユーザー別利用 */}
            <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, padding: 0 }}>
              <div style={sectionHeaderStyle({ T })}>👤 ユーザー別の利用状況</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', ...TYPO.subhead }}>
                  <thead>
                    <tr style={{ color: T.textMuted, textAlign: 'left' }}>
                      <th style={thStyle}>メンバー</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>アクセス</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>ログイン</th>
                      <th style={thStyle}>よく使う機能</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>最終利用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.length === 0 && (
                      <tr><td colSpan={5} style={{ ...tdStyle, color: T.textMuted, textAlign: 'center' }}>まだ記録がありません</td></tr>
                    )}
                    {data.users.map((u) => (
                      <tr key={u.email} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={tdStyle}>
                          <div style={{ color: T.text, fontWeight: 700 }}>{u.name}</div>
                          <div style={{ ...TYPO.caption, color: T.textMuted }}>{u.email}</div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: T.text, fontWeight: 700 }}>{u.events.toLocaleString()}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: T.textSub }}>{u.logins.toLocaleString()}</td>
                        <td style={tdStyle}>
                          {u.topPage ? <span style={pillStyle({ color: T.accent, size: 'sm' })}>{pageLabel(u.topPage)}</span> : <span style={{ color: T.textMuted }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: T.textSub }}>{fmtDateTime(u.lastActive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 未利用メンバー */}
            {data.inactiveMembers?.length > 0 && (
              <div style={{ ...cardStyle({ T }), marginTop: SPACING.lg, padding: 0 }}>
                <div style={sectionHeaderStyle({ T })}>💤 この期間に未利用のメンバー（{data.inactiveMembers.length}名）</div>
                <div style={{ padding: SPACING.lg, display: 'flex', flexWrap: 'wrap', gap: SPACING.sm }}>
                  {data.inactiveMembers.map((m) => (
                    <span key={m.email} style={pillStyle({ color: T.textMuted, size: 'md' })} title={m.email}>{m.name}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ ...TYPO.caption, color: T.textMuted, marginTop: SPACING.md, textAlign: 'center' }}>
              ※ 利用ログは導入後から蓄積されます。導入前の利用状況は記録されていません。
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

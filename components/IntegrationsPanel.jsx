'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useCurrentOrg } from '../lib/orgContext'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS, BRAND_GRADIENT } from '../lib/themeTokens'
import { cardStyle, accentRingStyle, btnSecondary } from '../lib/iosStyles'

// 必要スコープのチェック
const REQUIRED_SCOPES = [
  { url: 'https://www.googleapis.com/auth/calendar.events',   label: 'Calendar 予定の作成・編集' },
  { url: 'https://www.googleapis.com/auth/calendar.readonly', label: 'Calendar 読み取り'    },
  { url: 'https://www.googleapis.com/auth/gmail.readonly',    label: 'Gmail 読み取り'       },
  { url: 'https://www.googleapis.com/auth/gmail.compose',     label: 'Gmail 下書き作成'      },
  { url: 'https://www.googleapis.com/auth/drive.readonly',    label: 'Drive 読み取り'        },
]

function formatRelative(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${mins}分前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}時間前`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}日前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const IS_DEMO = (typeof process !== 'undefined') && process.env?.NEXT_PUBLIC_DEMO_MODE === 'true'

export default function IntegrationsPanel({ T, myName, isViewingSelf }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [integ, setInteg] = useState(null)        // { access_token, scope, expires_at, metadata, connected_at }
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const load = useCallback(async () => {
    if (!myName || !orgId) { setLoading(false); return }
    setLoading(true)
    // .maybeSingle() は 1 行存在しても null を返すことがあるため使わない。
    // 連携は組織ごとに分離 (organization_id で絞る)。
    let { data: rows, error } = await supabase
      .from('user_integrations')
      .select('service, scope, expires_at, metadata, connected_at')
      .eq('owner', myName)
      .eq('service', 'google')
      .eq('organization_id', orgId)
      .limit(1)
    // マイグレーション未適用 (organization_id 列が無い) 環境フォールバック
    if (error && (error.code === '42703' || /organization_id|column/i.test(error.message || ''))) {
      ;({ data: rows, error } = await supabase
        .from('user_integrations')
        .select('service, scope, expires_at, metadata, connected_at')
        .eq('owner', myName)
        .eq('service', 'google')
        .limit(1))
    }
    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      setErrorMsg(`読み込みエラー: ${error.message}`)
    }
    setInteg((rows && rows[0]) || null)
    setLoading(false)
  }, [myName, orgId])

  useEffect(() => { load() }, [load])

  // OAuth コールバック後の URL パラメータ処理
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const result = url.searchParams.get('integ_result')
    const service = url.searchParams.get('integ_service')
    const err = url.searchParams.get('integ_error')
    let changed = false
    if (result === 'ok' && service) {
      setSuccessMsg(`${decodeURIComponent(service)} の連携が完了しました`)
      url.searchParams.delete('integ_result')
      url.searchParams.delete('integ_service')
      changed = true
      load()
      setTimeout(() => setSuccessMsg(''), 5000)
    } else if (err) {
      setErrorMsg(`連携エラー: ${decodeURIComponent(err)}`)
      url.searchParams.delete('integ_error')
      changed = true
    }
    if (changed) window.history.replaceState({}, '', url.toString())
  }, [load])

  function handleConnect() {
    // デモ環境では Google 連携を完全に禁止 (複数ゲストが同じ owner を共有するため
    // トークンが上書きされ、他人にメール内容が漏れるリスクがある)
    if (IS_DEMO) {
      setErrorMsg('デモ環境では Google 連携は無効化されています。Gmail / Calendar / Drive はサンプルデータで動作確認してください。')
      return
    }
    if (!myName) { setErrorMsg('ユーザー情報が取得できません'); return }
    if (!orgId) { setErrorMsg('組織が選択されていません'); return }
    setBusy(true)
    const u = new URL('/api/integrations/google/start', window.location.origin)
    u.searchParams.set('owner', myName)
    u.searchParams.set('organization_id', orgId)
    u.searchParams.set('return_to', window.location.pathname + window.location.search)
    window.location.href = u.toString()
  }

  async function handleDisconnect() {
    if (!window.confirm('Google との連携を解除しますか？')) return
    setBusy(true)
    setErrorMsg('')
    try {
      const r = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: myName, organization_id: orgId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setSuccessMsg('Google 連携を解除しました')
      await load()
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (e) {
      setErrorMsg(`解除エラー: ${e.message || e}`)
    }
    setBusy(false)
  }

  const isConnected = !!integ
  const scopeString = integ?.scope || ''
  const hasScope = (scopeUrl) => scopeString.includes(scopeUrl)
  const missingScopes = REQUIRED_SCOPES.filter(s => !hasScope(s.url))
  const isExpired = integ?.expires_at && new Date(integ.expires_at) < new Date()

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${SPACING.xl}px ${SPACING['2xl']}px`, background: T.bg }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: 22 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: T.accentBg, color: T.accentText,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}><Icon name="link" size={16} /></div>
          <div>
            <h2 style={{ ...TYPO.title2, fontSize: 18, color: T.text, margin: 0 }}>
              外部サービス連携
            </h2>
            <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted, marginTop: 2, lineHeight: 1.5 }}>
              {IS_DEMO
                ? 'デモ環境では外部サービスとの連携は無効化されています。Gmail / Calendar / Drive タブではサンプルデータが表示されます。'
                : 'Google アカウントを連携すると、Gmail の重要メールと Google カレンダーの予定がダッシュボードに表示され、AI返信や共有ドライブの AI 検索も使えるようになります。'}
              {!IS_DEMO && !isViewingSelf && ' (自分を選択中のみ操作可能)'}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div style={{
            padding: '10px 14px', marginBottom: SPACING.md + 2,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: RADIUS.sm, ...TYPO.subhead, color: T.danger,
            display: 'flex', alignItems: 'center', gap: SPACING.sm,
          }}>
            <Icon name="alert" size={14} />
            <span style={{ flex: 1 }}>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} style={{
              background: 'transparent', border: 'none', color: T.danger,
              cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
            }}>×</button>
          </div>
        )}

        {successMsg && (
          <div style={{
            padding: '10px 14px', marginBottom: SPACING.md + 2,
            background: T.successBg, border: `1px solid ${T.success}40`,
            borderRadius: RADIUS.sm, ...TYPO.subhead, color: T.success,
            display: 'flex', alignItems: 'center', gap: SPACING.sm,
          }}>
            <Icon name="check" size={14} />
            <span style={{ flex: 1 }}>{successMsg}</span>
          </div>
        )}

        {IS_DEMO ? (
          <div style={{
            ...cardStyle({ T, padding: '18px 20px' }),
            display: 'flex', flexDirection: 'column', gap: SPACING.sm + 2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
              <div style={accentRingStyle({ color: T.warn, size: 44 })}><Icon name="alert" size={22} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ ...TYPO.headline, fontSize: 15, color: T.text }}>
                  デモ環境では Google 連携は無効です
                </div>
                <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted, marginTop: 2 }}>
                  複数の見学者が同じアカウントを共有しているため、安全のため連携機能を停止しています。
                </div>
              </div>
            </div>
            <div style={{ ...TYPO.subhead, color: T.textSub, lineHeight: 1.7, padding: '4px 2px' }}>
              ・Gmail / Calendar / Drive タブはサンプルデータで動作します<br />
              ・本番環境にデプロイされた際は実際の Google アカウントと連携可能になります<br />
              ・ご自身の Google アカウントを試したい場合は、本番デプロイ後にご利用ください
            </div>
          </div>
        ) : loading ? (
          <div style={{ padding: SPACING['3xl'] - 2, textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>
            読み込み中...
          </div>
        ) : (
          <div style={{
            ...cardStyle({ T, padding: '18px 20px' }),
            display: 'flex', flexDirection: 'column',
          }}>
            {/* ヘッダ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg - 2 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: 'linear-gradient(135deg, #ffffff, #f1f5f9)',
                border: `1px solid ${T.border}`, boxShadow: SHADOWS.sm,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M21.8 10.2H12v3.6h5.6c-.3 1.6-1.7 3.4-4 4.4l-.06.4 3.2 2.5h.22c2.04-1.9 3.2-4.7 3.2-8.1 0-.8-.06-1.5-.2-2.2z" fill="#4285f4" />
                  <path d="M12 22c2.8 0 5.2-.9 7-2.5l-3.4-2.6c-.9.6-2.1 1-3.6 1-2.7 0-5-1.8-5.9-4.3l-.4.04-3.3 2.6-.1.4C4.1 19.6 7.8 22 12 22z" fill="#34a853" />
                  <path d="M6.1 13.6c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L6.06 8.6 2.7 6c-.9 1.7-1.4 3.6-1.4 5.6s.5 4 1.4 5.6l3.4-2.6z" fill="#fbbc05" />
                  <path d="M12 4.4c1.9 0 3.2.8 4 1.5l3-2.9c-1.8-1.7-4.2-2.7-7-2.7-4.2 0-7.9 2.4-9.7 5.9L6.1 9c.9-2.6 3.2-4.6 5.9-4.6z" fill="#ea4335" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...TYPO.headline, color: T.text }}>
                  Google (Gmail + カレンダー + ドライブ)
                </div>
                <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted, marginTop: 1 }}>
                  メール・予定・資料をダッシュボードに集約 + AI返信 + ドライブAI検索
                </div>
              </div>
              {isConnected && (() => {
                const warnState = isExpired || missingScopes.length
                const c = warnState ? T.warn : T.success
                const cBg = warnState ? T.warnBg : T.successBg
                return (
                  <span style={{
                    padding: '5px 11px', borderRadius: RADIUS.pill,
                    background: cBg, color: c, border: `1px solid ${c}40`,
                    ...TYPO.footnote, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: RADIUS.pill,
                      background: c, boxShadow: `0 0 0 3px ${c}30`,
                    }} />
                    {isExpired ? '要再認証' : (missingScopes.length ? 'スコープ不足' : '連携中')}
                  </span>
                )
              })()}
            </div>

            {/* 機能リスト */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 7,
              padding: '12px 14px', background: 'rgba(15,23,42,.02)',
              borderRadius: RADIUS.sm, marginBottom: SPACING.lg - 2,
            }}>
              {[
                ['ダッシュボード', '直近8時間の予定 + To/Cc の重要メール5件'],
                ['メールタブ', 'To/Cc/通知 を整理して表示'],
                ['AI返信', '返信草稿を自動生成して Gmail の下書きに保存'],
                ['ドライブAI', '共有ドライブを横断検索・Docs/Sheets/Slidesの本文をAIが要約'],
              ].map(([lbl, ds]) => (
                <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
                  <span style={{ ...TYPO.footnote, fontWeight: 700, color: T.text, minWidth: 90 }}>{lbl}</span>
                  <span style={{ ...TYPO.footnote, fontWeight: 600, color: T.textSub, lineHeight: 1.55 }}>{ds}</span>
                </div>
              ))}
            </div>

            {/* 連携済みの詳細 (アカウント情報) */}
            {isConnected && (
              <div style={{
                padding: '12px 14px', border: `1px solid ${T.border}`,
                borderRadius: RADIUS.sm, background: T.sectionBg, marginBottom: SPACING.md,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, marginBottom: SPACING.sm - 2 }}>
                  <Icon name="mail" size={13} style={{ color: T.textMuted, flexShrink: 0 }} />
                  {integ.metadata?.email && (
                    <span style={{ ...TYPO.subhead, fontWeight: 600, color: T.text, fontFamily: 'ui-monospace, monospace' }}>{integ.metadata.email}</span>
                  )}
                  <span style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 0, color: T.textMuted, marginLeft: 'auto' }}>接続: {formatRelative(integ.connected_at)}</span>
                </div>
                <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textSub, marginBottom: 5 }}>権限:</div>
                <ul style={{
                  listStyle: 'none', padding: 0, margin: 0,
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px',
                }}>
                  {REQUIRED_SCOPES.map(s => {
                    const ok = hasScope(s.url)
                    return (
                      <li key={s.url} style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, ...TYPO.footnote, fontWeight: 600, color: ok ? T.textSub : T.danger }}>
                        <span style={{
                          width: 14, height: 14, borderRadius: RADIUS.pill, flexShrink: 0,
                          background: ok ? T.successBg : T.dangerBg, color: ok ? T.success : T.danger,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}><Icon name={ok ? 'check' : 'cross'} size={9} stroke={3} /></span>
                        {s.label}
                      </li>
                    )
                  })}
                </ul>
                {missingScopes.length > 0 && (
                  <div style={{
                    marginTop: SPACING.sm, padding: SPACING.sm, background: T.warnBg,
                    color: T.warn, borderRadius: RADIUS.xs, ...TYPO.footnote, fontWeight: 600,
                    display: 'flex', alignItems: 'flex-start', gap: SPACING.xs,
                  }}>
                    <Icon name="alert" size={12} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{missingScopes.map(s => s.label).join(' / ')} が付与されていません。同意画面で全てチェックして再連携してください。</span>
                  </div>
                )}
              </div>
            )}

            {/* アクション */}
            {!isConnected ? (
              <button
                onClick={handleConnect}
                disabled={busy || !isViewingSelf}
                style={{
                  background: BRAND_GRADIENT.cta, color: '#fff',
                  border: 'none', borderRadius: RADIUS.sm, padding: '10px 16px',
                  ...TYPO.callout, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
                  boxShadow: '0 2px 8px rgba(37,99,235,.28)',
                  cursor: busy || !isViewingSelf ? 'not-allowed' : 'pointer',
                  opacity: busy || !isViewingSelf ? 0.5 : 1,
                }}
              >{busy ? '接続中...' : <><Icon name="link" size={14} /> Google と連携</>}</button>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                marginTop: SPACING.xs, paddingTop: SPACING.lg - 2,
                borderTop: `1px solid ${T.border}`,
              }}>
                <button
                  onClick={handleConnect}
                  disabled={busy || !isViewingSelf}
                  style={(isExpired || missingScopes.length) ? {
                    background: T.warn, color: '#fff', border: 'none',
                    borderRadius: RADIUS.sm, padding: '9px 14px',
                    ...TYPO.subhead, fontWeight: 700, fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    cursor: busy || !isViewingSelf ? 'not-allowed' : 'pointer',
                    opacity: busy || !isViewingSelf ? 0.5 : 1,
                  } : {
                    ...btnSecondary({ T }),
                    background: T.bgCard, color: T.text, padding: '9px 14px',
                    borderRadius: RADIUS.sm, ...TYPO.subhead, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    cursor: busy || !isViewingSelf ? 'not-allowed' : 'pointer',
                    opacity: busy || !isViewingSelf ? 0.5 : 1,
                  }}
                ><Icon name="refresh" size={11} /> {(isExpired || missingScopes.length) ? '再認証が必要' : '再連携'}</button>
                <button
                  onClick={handleDisconnect}
                  disabled={busy || !isViewingSelf}
                  style={{
                    background: 'transparent', color: T.danger,
                    border: `1px solid ${T.danger}40`, borderRadius: RADIUS.sm,
                    padding: '9px 14px', ...TYPO.subhead, fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: busy || !isViewingSelf ? 'not-allowed' : 'pointer',
                    opacity: busy || !isViewingSelf ? 0.5 : 1,
                  }}
                >連携解除</button>
              </div>
            )}
          </div>
        )}

        {/* セットアップメモ (ヒント) */}
        {!IS_DEMO && (
          <div style={{
            marginTop: SPACING.lg - 2, padding: '12px 14px',
            background: 'linear-gradient(135deg, rgba(37,99,235,.04), rgba(34,211,238,.04))',
            border: '1px solid rgba(37,99,235,.15)',
            borderRadius: RADIUS.md,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: RADIUS.xs, flexShrink: 0,
              background: BRAND_GRADIENT.cta, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(37,99,235,.28)',
            }}><Icon name="sparkle" size={12} /></div>
            <div>
              <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.accentText, marginBottom: 3 }}>ヒント</div>
              <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textSub, lineHeight: 1.6 }}>
                同意画面で「メールメッセージの表示」「下書きの管理とメール送信」「予定の表示」「ファイルの表示・ダウンロード」すべてにチェックを入れて「許可」してください。
                1つでも外すと一部機能が動作しません。
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

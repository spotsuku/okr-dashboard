'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

export default function IntegrationsPanel({ T, myName, isViewingSelf }) {
  const [integ, setInteg] = useState(null)        // { access_token, scope, expires_at, metadata, connected_at }
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const load = useCallback(async () => {
    if (!myName) { setLoading(false); return }
    setLoading(true)
    // .maybeSingle() は 1 行存在しても null を返すことがあるため使わない
    const { data: rows, error } = await supabase
      .from('user_integrations')
      .select('service, scope, expires_at, metadata, connected_at')
      .eq('owner', myName)
      .eq('service', 'google')
      .limit(1)
    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      setErrorMsg(`読み込みエラー: ${error.message}`)
    }
    setInteg((rows && rows[0]) || null)
    setLoading(false)
  }, [myName])

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
    if (!myName) { setErrorMsg('ユーザー情報が取得できません'); return }
    setBusy(true)
    const u = new URL('/api/integrations/google/start', window.location.origin)
    u.searchParams.set('owner', myName)
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
        body: JSON.stringify({ owner: myName }),
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
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: T.bg }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0, marginBottom: 4 }}>
          🔌 外部サービス連携
        </h2>
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20 }}>
          Google アカウントを連携すると、Gmail の重要メールと Google カレンダーの予定がダッシュボードに表示され、AI返信も使えるようになります。
          {!isViewingSelf && ' (自分を選択中のみ操作可能)'}
        </div>

        {errorMsg && (
          <div style={{
            padding: '10px 14px', marginBottom: 14,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: 8, fontSize: 12, color: T.danger,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>⚠️</span>
            <span style={{ flex: 1 }}>{errorMsg}</span>
            <button onClick={() => setErrorMsg('')} style={{
              background: 'transparent', border: 'none', color: T.danger,
              cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
            }}>×</button>
          </div>
        )}

        {successMsg && (
          <div style={{
            padding: '10px 14px', marginBottom: 14,
            background: T.successBg, border: `1px solid ${T.success}40`,
            borderRadius: 8, fontSize: 12, color: T.success,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>✅</span>
            <span style={{ flex: 1 }}>{successMsg}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
            読み込み中...
          </div>
        ) : (
          <div style={{
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderLeft: '4px solid #4285F4',
            borderRadius: 12, padding: 18,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {/* ヘッダ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                fontSize: 24, width: 44, height: 44, borderRadius: 10,
                background: '#4285F418', color: '#4285F4',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>🔗</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
                  Google (Gmail + カレンダー)
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                  メール・予定をダッシュボードに集約 + AI返信
                </div>
              </div>
              {isConnected && (
                <div style={{
                  padding: '4px 10px', borderRadius: 99,
                  background: isExpired ? T.warnBg : (missingScopes.length ? T.warnBg : T.successBg),
                  color: isExpired ? T.warn : (missingScopes.length ? T.warn : T.success),
                  fontSize: 11, fontWeight: 700,
                }}>
                  {isExpired ? '要再認証' : (missingScopes.length ? 'スコープ不足' : '連携中')}
                </div>
              )}
            </div>

            {/* 機能リスト */}
            <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.7 }}>
              <div>・ダッシュボード: 直近8時間の予定 + To/Cc の重要メール5件</div>
              <div>・メールタブ: To/Cc/通知 を整理して表示</div>
              <div>・AI返信: 返信草稿を自動生成して Gmail の下書きに保存</div>
            </div>

            {/* 連携済みの詳細 */}
            {isConnected && (
              <div style={{
                padding: '10px 12px', background: T.sectionBg,
                borderRadius: 8, fontSize: 11, color: T.textMuted, lineHeight: 1.7,
              }}>
                {integ.metadata?.email && <div>📮 {integ.metadata.email}</div>}
                <div>接続: {formatRelative(integ.connected_at)}</div>
                <div style={{ marginTop: 6, color: T.textSub, fontWeight: 600 }}>権限:</div>
                {REQUIRED_SCOPES.map(s => (
                  <div key={s.url} style={{ color: hasScope(s.url) ? T.success : T.danger }}>
                    {hasScope(s.url) ? '✓' : '✗'} {s.label}
                  </div>
                ))}
                {missingScopes.length > 0 && (
                  <div style={{
                    marginTop: 8, padding: 8, background: T.warnBg,
                    color: T.warn, borderRadius: 6, fontSize: 11,
                  }}>
                    ⚠️ {missingScopes.map(s => s.label).join(' / ')} が付与されていません。同意画面で全てチェックして再連携してください。
                  </div>
                )}
              </div>
            )}

            {/* アクション */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  disabled={busy || !isViewingSelf}
                  style={{
                    flex: 1, background: '#4285F4', color: '#fff',
                    border: 'none', borderRadius: 8, padding: '10px 16px',
                    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                    cursor: busy || !isViewingSelf ? 'not-allowed' : 'pointer',
                    opacity: busy || !isViewingSelf ? 0.5 : 1,
                  }}
                >{busy ? '接続中...' : '🔌 Google と連携'}</button>
              ) : (
                <>
                  <button
                    onClick={handleConnect}
                    disabled={busy || !isViewingSelf}
                    style={{
                      flex: 1,
                      background: (isExpired || missingScopes.length) ? T.warn : 'transparent',
                      color: (isExpired || missingScopes.length) ? '#fff' : T.accent,
                      border: (isExpired || missingScopes.length) ? 'none' : `1px solid ${T.accent}40`,
                      borderRadius: 8, padding: '8px 14px',
                      fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                      cursor: busy || !isViewingSelf ? 'not-allowed' : 'pointer',
                      opacity: busy || !isViewingSelf ? 0.5 : 1,
                    }}
                  >🔄 {(isExpired || missingScopes.length) ? '再認証が必要' : '再連携'}</button>
                  <button
                    onClick={handleDisconnect}
                    disabled={busy || !isViewingSelf}
                    style={{
                      flex: 1, background: 'transparent', color: T.danger,
                      border: `1px solid ${T.danger}40`, borderRadius: 8,
                      padding: '8px 14px', fontSize: 12, fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: busy || !isViewingSelf ? 'not-allowed' : 'pointer',
                      opacity: busy || !isViewingSelf ? 0.5 : 1,
                    }}
                  >連携解除</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* セットアップメモ */}
        <div style={{
          marginTop: 20, padding: 12,
          background: T.sectionBg, border: `1px dashed ${T.border}`,
          borderRadius: 8, fontSize: 11, color: T.textMuted, lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: T.textSub, marginBottom: 4 }}>💡 ヒント</div>
          同意画面で「メールメッセージの表示」「下書きの管理とメール送信」「予定の表示」すべてにチェックを入れて「許可」してください。
          1つでも外すと一部機能が動作しません。
        </div>
      </div>
    </div>
  )
}

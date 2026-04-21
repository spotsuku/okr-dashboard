'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// requiredScopes: 保存済みトークンのスコープ文字列に対して「最低限この機能を含んでいること」を検査する matcher。
// match(scope) が全て true にならないと「権限不足」と判断して再認証を促す。
// label は UI 表示用の分かりやすい名前。
const INTEGRATIONS = [
  {
    key: 'google_calendar',
    icon: '📅',
    brandColor: '#4285F4',
    title: 'Google Calendar',
    desc: '今日の予定をダッシュボードに表示',
    benefits: [
      '本日のミーティング一覧',
      '次の予定までの残り時間',
      '競合スケジュールの検出',
    ],
    provider: 'google',
    requiredScopes: [
      {
        label: '予定の閲覧 (calendar.readonly)',
        match: s => /calendar\.readonly|calendar\.events|\/auth\/calendar(\s|$)/.test(s),
      },
    ],
  },
  {
    key: 'google_gmail',
    icon: '📧',
    brandColor: '#EA4335',
    title: 'Gmail',
    desc: '未返信・重要メールのリマインド',
    benefits: [
      '3日以上未返信メールの通知',
      '重要度高のメールを抽出',
      'AI返信草稿の自動生成',
    ],
    provider: 'google',
    requiredScopes: [
      {
        label: 'メールの閲覧 (gmail.readonly)',
        match: s => /gmail\.readonly|gmail\.modify|mail\.google\.com\//.test(s),
      },
      {
        label: '下書きの管理・送信 (gmail.compose)',
        match: s => /gmail\.compose|gmail\.modify|mail\.google\.com\//.test(s),
      },
    ],
  },
  {
    key: 'slack',
    icon: '💬',
    brandColor: '#4A154B',
    title: 'Slack',
    desc: '未読メンション・DMの集約',
    benefits: [
      '未返信メンション一覧',
      'DMのサマリ',
      '重要チャンネルのピックアップ',
    ],
    provider: 'slack',
    oauthUrl: '/api/integrations/slack/start',
  },
  {
    key: 'line',
    icon: '🟢',
    brandColor: '#06C755',
    title: 'LINE',
    desc: '通知の受信 (LINE Login)',
    benefits: [
      'LINEアカウントで認証',
      '重要リマインダーのLINE送信',
      '取引先とのやりとり集約',
    ],
    provider: 'line',
    oauthUrl: '/api/integrations/line/start',
  },
]

// 保存済みの scope 文字列を検査し、不足しているスコープ定義 (requiredScopes の要素) を返す。
// scope 列が未設定 (DB に null) の場合は「判定不能」として空配列を返す — 誤検知で既存ユーザーを驚かせない。
function findMissingScopes(integ, storedScope) {
  if (!integ.requiredScopes) return []
  if (!storedScope) return []  // 旧データで scope 列が空なら検知しない
  return integ.requiredScopes.filter(rs => !rs.match(storedScope))
}

function formatRelative(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}分前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}時間前`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}日前`
  return `${d.getMonth()+1}/${d.getDate()}`
}

export default function IntegrationsPanel({ myName, T, isViewingSelf }) {
  const [integrations, setIntegrations] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const load = useCallback(async () => {
    if (!myName) { setLoading(false); return }
    setLoading(true)
    // 公開ビュー user_integrations_status は環境によっては metadata / scope 列が無い。
    // ビューからは必ず存在する列だけ取得し、必要な列 (scope, metadata) は
    // 自分の行のみ user_integrations テーブルから取得してマージ。
    const viewRes = await supabase
      .from('user_integrations_status')
      .select('service, connected_at, expires_at')
      .eq('owner', myName)
    let data = viewRes.data
    let error = viewRes.error
    if (error && (error.code === '42P01' || error.message?.includes('not find'))) {
      // ビュー未作成 → テーブルへフォールバック
      const tblRes = await supabase
        .from('user_integrations')
        .select('service, metadata, connected_at, expires_at, scope')
        .eq('owner', myName)
      data = tblRes.data; error = tblRes.error
    }
    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      setErrorMsg(`読み込みエラー: ${error.message}`)
    }
    const map = {}
    ;(data || []).forEach(row => { map[row.service] = row })

    // 自分が閲覧対象なら scope / metadata を取得して付加 (email 等の表示用)
    if (isViewingSelf && Object.keys(map).length > 0) {
      const metaRes = await supabase
        .from('user_integrations')
        .select('service, metadata, scope')
        .eq('owner', myName)
      ;(metaRes.data || []).forEach(row => {
        if (map[row.service]) {
          map[row.service].metadata = row.metadata
          map[row.service].scope = row.scope
        }
      })
    }

    setIntegrations(map)
    setLoading(false)
  }, [myName, isViewingSelf])
  useEffect(() => { load() }, [load])

  // URLパラメータで OAuth 結果を受け取る
  // Google / Slack / LINE 全てサーバーサイドで保存済み、ここは表示のみ
  useEffect(() => {
    if (typeof window === 'undefined' || !myName) return
    const url = new URL(window.location.href)
    const integResult = url.searchParams.get('integ_result')
    const integService = url.searchParams.get('integ_service')
    const integError = url.searchParams.get('integ_error')

    if (integError) {
      setErrorMsg(`連携エラー: ${decodeURIComponent(integError)}`)
      url.searchParams.delete('integ_error')
      window.history.replaceState({}, '', url.toString())
      return
    }

    if (integResult === 'ok' && integService) {
      setSuccessMsg(`${integService} の連携が完了しました`)
      load()
      url.searchParams.delete('integ_result')
      url.searchParams.delete('integ_service')
      url.searchParams.delete('integ_service_key')
      window.history.replaceState({}, '', url.toString())
      setTimeout(() => setSuccessMsg(''), 5000)
    }
  }, [load, myName])

  async function disconnect(service, title) {
    if (!window.confirm(`${title} の連携を解除しますか？`)) return
    setBusyKey(service)
    const { error } = await supabase
      .from('user_integrations')
      .delete()
      .eq('owner', myName).eq('service', service)
    setBusyKey(null)
    if (error) { setErrorMsg(`解除エラー: ${error.message}`); return }
    setSuccessMsg(`${title} の連携を解除しました`)
    await load()
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  async function connect(integ) {
    if (!myName) { setErrorMsg('ユーザー情報が取得できません'); return }
    setBusyKey(integ.key)
    setErrorMsg('')
    try {
      if (integ.provider === 'google') {
        // 独自サーバー経由で Google OAuth (Supabase Auth の race condition を回避)
        const u = new URL('/api/integrations/google/start', window.location.origin)
        u.searchParams.set('owner', myName)
        u.searchParams.set('service', integ.key)  // 'google_gmail' or 'google_calendar'
        u.searchParams.set('return_to', window.location.pathname + window.location.search)
        window.location.href = u.toString()
      } else if (integ.oauthUrl) {
        // Slack / LINE も同様のサーバーサイド OAuth
        const u = new URL(integ.oauthUrl, window.location.origin)
        u.searchParams.set('owner', myName)
        u.searchParams.set('return_to', window.location.pathname + window.location.search)
        window.location.href = u.toString()
      }
    } catch (e) {
      setBusyKey(null)
      setErrorMsg(`連携開始エラー: ${e.message || e}`)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: T.bg }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0, marginBottom: 4 }}>
          🔌 外部サービス連携
        </h2>
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20 }}>
          Gmail・Googleカレンダー・Slack・LINE を接続してダッシュボードに情報を集約できます。
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {INTEGRATIONS.map(integ => {
              const conn = integrations[integ.key]
              const isConnected = !!conn
              const isBusy = busyKey === integ.key
              const isExpired = conn?.expires_at && new Date(conn.expires_at) < new Date()
              const missingScopes = isConnected ? findMissingScopes(integ, conn?.scope) : []
              const hasMissingScope = missingScopes.length > 0
              const needsReauth = isExpired || hasMissingScope
              return (
                <div key={integ.key} style={{
                  background: T.bgCard, border: `1px solid ${T.border}`,
                  borderLeft: `4px solid ${integ.brandColor}`,
                  borderRadius: 12, padding: 16,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      fontSize: 24, width: 40, height: 40, borderRadius: 10,
                      background: `${integ.brandColor}18`, color: integ.brandColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{integ.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{integ.title}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{integ.desc}</div>
                    </div>
                    {isConnected && (
                      <div style={{
                        padding: '3px 8px', borderRadius: 99,
                        background: needsReauth ? T.warnBg : T.successBg,
                        color: needsReauth ? T.warn : T.success,
                        fontSize: 10, fontWeight: 700,
                      }}>{
                        isExpired ? '要再認証' :
                        hasMissingScope ? '権限不足' : '連携中'
                      }</div>
                    )}
                  </div>

                  {/* 機能一覧 */}
                  <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.6 }}>
                    {integ.benefits.map((b, i) => (
                      <div key={i}>・{b}</div>
                    ))}
                  </div>

                  {/* 接続状態の詳細 */}
                  {isConnected && (
                    <div style={{
                      padding: '6px 8px', background: T.sectionBg, borderRadius: 6,
                      fontSize: 10, color: T.textMuted, lineHeight: 1.5,
                    }}>
                      {conn.metadata?.email && <div>📮 {conn.metadata.email}</div>}
                      {conn.metadata?.team_name && <div>🏢 {conn.metadata.team_name}</div>}
                      {conn.metadata?.display_name && <div>👤 {conn.metadata.display_name}</div>}
                      <div>接続: {formatRelative(conn.connected_at)}</div>
                    </div>
                  )}

                  {/* スコープ不足警告 */}
                  {hasMissingScope && (
                    <div style={{
                      padding: '8px 10px',
                      background: T.warnBg, border: `1px solid ${T.warn}40`,
                      borderRadius: 6, fontSize: 11, color: T.warn, lineHeight: 1.5,
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        ⚠️ 以下の権限が不足しています
                      </div>
                      {missingScopes.map((rs, i) => (
                        <div key={i}>・{rs.label}</div>
                      ))}
                      <div style={{ marginTop: 6, fontSize: 10, color: T.textMuted }}>
                        「連携解除 → 再認証」を行って、Google 同意画面で新しい権限にチェックを入れてください。
                      </div>
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                    {!isConnected ? (
                      <button
                        onClick={() => connect(integ)}
                        disabled={isBusy || !isViewingSelf}
                        style={{
                          flex: 1,
                          background: integ.brandColor,
                          color: '#fff', border: 'none', borderRadius: 8,
                          padding: '8px 14px', fontSize: 12, fontWeight: 700,
                          cursor: isBusy || !isViewingSelf ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                          opacity: isBusy || !isViewingSelf ? 0.5 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >{isBusy ? '接続中...' : `🔌 ${integ.title}と連携`}</button>
                    ) : (
                      <>
                        {needsReauth && (
                          <button
                            onClick={() => connect(integ)}
                            disabled={isBusy || !isViewingSelf}
                            style={{
                              flex: 1, background: T.warn,
                              color: '#fff', border: 'none', borderRadius: 8,
                              padding: '7px 12px', fontSize: 11, fontWeight: 700,
                              cursor: isBusy || !isViewingSelf ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                              opacity: isBusy || !isViewingSelf ? 0.5 : 1,
                            }}
                          >🔄 再認証</button>
                        )}
                        <button
                          onClick={() => disconnect(integ.key, integ.title)}
                          disabled={isBusy || !isViewingSelf}
                          style={{
                            flex: 1, background: 'transparent',
                            color: T.danger, border: `1px solid ${T.danger}40`,
                            borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 600,
                            cursor: isBusy || !isViewingSelf ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            opacity: isBusy || !isViewingSelf ? 0.5 : 1,
                          }}
                        >{isBusy ? '処理中...' : '連携解除'}</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* セットアップ情報 */}
        <div style={{
          marginTop: 24, padding: 14, background: T.sectionBg,
          border: `1px dashed ${T.border}`, borderRadius: 8,
          fontSize: 11, color: T.textMuted, lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: T.textSub, marginBottom: 6 }}>⚙️ 管理者向けセットアップ</div>
          連携を有効化するには、各サービスの OAuth 設定が必要です。詳細は <code style={{ padding: '1px 6px', background: T.bgCard, borderRadius: 4 }}>INTEGRATIONS_SETUP.md</code> を参照してください。
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            <li>Google (Gmail/Calendar): Google Cloud Console で Gmail API / Calendar API を有効化 + Supabase Auth にスコープ追加</li>
            <li>Slack: api.slack.com で App を作成し <code>SLACK_CLIENT_ID</code> / <code>SLACK_CLIENT_SECRET</code> を Vercel に設定</li>
            <li>LINE: LINE Developers Console で Channel を作成し <code>LINE_CHANNEL_ID</code> / <code>LINE_CHANNEL_SECRET</code> を Vercel に設定</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

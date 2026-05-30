'use client'
// 開発者専用: ユーザー完全削除 UI
// /admin/purge にアクセス → SUPER_ADMIN_EMAILS のユーザーのみ操作可能
// API: POST /api/admin/purge-user
import { useState } from 'react'
import { authedFetch } from '../../../lib/authedFetch'

export default function PurgeAdminPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function run() {
    if (!email.trim()) { setError('email を入力してください'); return }
    if (!window.confirm(
      `本当に ${email} を完全削除しますか?\n\n` +
      `以下が削除されます:\n` +
      `・auth.users\n` +
      `・このユーザーが owner の organizations + 配下の全データ\n` +
      `・organization_members / members の email レコード\n` +
      `・coaching_logs / coaching_chats / coaching_profiles のこのメンバー名のレコード\n` +
      `・analytics_events / custom_links (個人) のこの email のレコード\n\n` +
      `この操作は取り消せません。`
    )) return
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await authedFetch('/api/admin/purge-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return }
      setResult(j)
    } catch (e) {
      setError(e.message || 'エラー')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a', color: '#e2e8f0',
      fontFamily: '"Inter","Noto Sans JP",system-ui,sans-serif',
      padding: 40,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, marginTop: 0, color: '#f87171' }}>⚠️ ユーザー完全削除 (開発者専用)</h1>
        <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7, marginBottom: 24 }}>
          指定 email のユーザーと関連データを Supabase から完全削除します。<br />
          SUPER_ADMIN_EMAILS に登録されたユーザーのみ実行可能。<br />
          <strong style={{ color: '#f87171' }}>取り消し不可</strong> の操作です。
        </div>

        <div style={{ background: '#1e293b', borderRadius: 10, padding: 20, border: '1px solid #334155' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>削除する email</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com" disabled={busy}
            style={{
              width: '100%', padding: '10px 14px', boxSizing: 'border-box',
              background: '#0f172a', color: '#fff', border: '1px solid #475569',
              borderRadius: 8, fontSize: 14, fontFamily: 'monospace', outline: 'none',
            }}
          />
          <button
            onClick={run} disabled={busy || !email.trim()}
            style={{
              marginTop: 14, padding: '10px 22px', borderRadius: 8,
              background: busy ? '#475569' : '#dc2626', color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >{busy ? '削除中...' : '完全削除する'}</button>
        </div>

        {error && (
          <div style={{
            marginTop: 16, padding: 14, background: '#7f1d1d', color: '#fca5a5',
            borderRadius: 8, fontSize: 13,
          }}>エラー: {error}</div>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: 14,
              background: result.ok ? '#064e3b' : '#7f1d1d',
              color: result.ok ? '#6ee7b7' : '#fca5a5',
              borderRadius: 8, fontSize: 13, marginBottom: 12,
            }}>{result.ok ? '✅ 削除完了' : '⚠️ 一部失敗あり (下記詳細を確認)'}</div>
            <pre style={{
              background: '#1e293b', color: '#cbd5e1', padding: 14, borderRadius: 8,
              fontSize: 11, overflow: 'auto', maxHeight: 400,
            }}>{JSON.stringify(result.report, null, 2)}</pre>
          </div>
        )}

        <div style={{ marginTop: 28, fontSize: 11, color: '#64748b' }}>
          ※ このページは本番にも残るため、SUPER_ADMIN_EMAILS の管理を厳格に。
        </div>
      </div>
    </div>
  )
}

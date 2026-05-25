'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

// ★ 本番URLを固定（これ以外のURLに飛ばない）
const PRODUCTION_URL = 'https://aiworkspace.jp'

// orgName を渡すと「{orgName} にサインイン」と組織名入りの見出しになる (SaaS化 Plan B)
export default function LoginPage({ orgName = null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleAuth = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // 確認メールのリンクをクリック後、本番URLへ着地させる
        options: { emailRedirectTo: PRODUCTION_URL },
      })
      if (error) {
        // レート制限など Supabase の英語メッセージをそのまま出すと不親切なので翻訳
        if (/after \d+ seconds/i.test(error.message)) {
          setError('短時間に複数回試行されました。少し時間をおいて再度お試しください。')
        } else if (/already registered|already exists/i.test(error.message)) {
          setError('このメールアドレスは既に登録されています。ログインしてください。')
          setIsSignUp(false)
        } else {
          setError(error.message)
        }
      } else if (data?.user && (data.user.identities?.length ?? 0) === 0) {
        // 確認メール有効時、既存ユーザーで signUp すると user は返るが identities が空
        setError('このメールアドレスは既に登録されています。ログインしてください。')
        setIsSignUp(false)
      } else if (data?.session) {
        // 確認メール無効 → 即セッション発行。onAuthStateChange がログイン状態へ遷移させる
        setMessage('アカウントを作成しました。')
      } else {
        // 確認メール有効 → セッション無し。メール認証が必要
        setMessage('確認メールを送信しました。メール内のリンクをクリックして認証を完了してください。')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('メールアドレスまたはパスワードが正しくありません')
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: PRODUCTION_URL,
      },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      fontFamily: '"Inter", "Noto Sans JP", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      fontFeatureSettings: '"palt" 1',
      color: '#0f172a',
      background:
        'radial-gradient(1200px 800px at 8% 0%, rgba(186,230,253,.55), transparent 60%),' +
        'radial-gradient(1100px 900px at 100% 22%, rgba(187,247,208,.45), transparent 60%),' +
        'radial-gradient(900px 700px at 80% 100%, rgba(224,242,254,.6), transparent 60%),' +
        'linear-gradient(180deg, #f6fafd 0%, #eef4f9 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, padding: '40px 36px',
        background: 'rgba(255,255,255,.74)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(15,23,42,.06)',
        borderRadius: 22,
        boxShadow:
          '0 1px 0 rgba(255,255,255,.7) inset,' +
          '0 12px 36px rgba(15,23,42,.08),' +
          '0 24px 64px rgba(15,23,42,.06)',
      }}>
        {/* Logo + Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <a href="/lp" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, textDecoration: 'none', marginBottom: 16 }}>
            <img src="/icon.png" alt="AI WorkSpace" width={40} height={40} style={{ borderRadius: 9, boxShadow: '0 2px 6px rgba(37,99,235,.18)' }} />
            <span style={{
              fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em',
              color: '#0f172a',
            }}>AI WorkSpace</span>
          </a>
          <h1 style={{
            fontSize: 26, fontWeight: 700, margin: '8px 0 0 0',
            letterSpacing: '-0.02em', color: '#0f172a', lineHeight: 1.3,
          }}>
            {isSignUp ? 'アカウント作成' : 'おかえりなさい'}
          </h1>
          {orgName ? (
            <div style={{ marginTop: 8, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{orgName}</span> にサインイン
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
              {isSignUp ? '無料でアカウントを作成して、はじめましょう' : 'ログインして続ける'}
            </div>
          )}
        </div>

        {/* Google ログインボタン */}
        <button
          onClick={handleGoogle} disabled={googleLoading}
          style={{
            width: '100%',
            background: '#fff',
            border: '1px solid rgba(15,23,42,.12)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 14, fontWeight: 600,
            cursor: googleLoading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            color: '#0f172a',
            marginBottom: 18,
            opacity: googleLoading ? 0.6 : 1,
            boxShadow: '0 1px 2px rgba(15,23,42,.04)',
            transition: 'all .15s',
          }}
          onMouseEnter={e => { if (!googleLoading) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'none' }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {googleLoading ? '処理中...' : 'Googleでログイン'}
        </button>

        {/* 区切り線 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(15,23,42,.08)' }} />
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>または</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(15,23,42,.08)' }} />
        </div>

        {/* メール */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>メールアドレス</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="your@company.com"
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,.6)',
              border: '1px solid rgba(15,23,42,.12)',
              borderRadius: 10, padding: '11px 14px',
              color: '#0f172a', fontSize: 14, outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
              transition: 'border-color .15s, box-shadow .15s',
            }}
            onFocus={e => { e.target.style.borderColor = '#0ea5e9'; e.target.style.boxShadow = '0 0 0 3px rgba(14,165,233,.15)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(15,23,42,.12)'; e.target.style.boxShadow = 'none' }}
          />
        </div>

        {/* パスワード */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>パスワード</label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,.6)',
              border: '1px solid rgba(15,23,42,.12)',
              borderRadius: 10, padding: '11px 14px',
              color: '#0f172a', fontSize: 14, outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
              transition: 'border-color .15s, box-shadow .15s',
            }}
            onFocus={e => { e.target.style.borderColor = '#0ea5e9'; e.target.style.boxShadow = '0 0 0 3px rgba(14,165,233,.15)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(15,23,42,.12)'; e.target.style.boxShadow = 'none' }}
          />
        </div>

        {error && (
          <div style={{
            color: '#e11d48', fontSize: 13, fontWeight: 500, marginBottom: 14,
            padding: '10px 14px', background: 'rgba(225,29,72,.08)',
            border: '1px solid rgba(225,29,72,.18)', borderRadius: 10,
          }}>{error}</div>
        )}
        {message && (
          <div style={{
            color: '#059669', fontSize: 13, fontWeight: 500, marginBottom: 14,
            padding: '10px 14px', background: 'rgba(5,150,105,.1)',
            border: '1px solid rgba(5,150,105,.22)', borderRadius: 10,
          }}>{message}</div>
        )}

        {/* メインCTA: ブランドグラデーション */}
        <button
          onClick={handleAuth} disabled={loading || !email || !password}
          style={{
            width: '100%',
            background: (loading || !email || !password)
              ? 'rgba(37,99,235,.4)'
              : 'linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)',
            border: '1px solid #2563eb',
            color: '#fff', borderRadius: 999,
            padding: '12px 22px',
            fontSize: 14, fontWeight: 600,
            letterSpacing: '0.01em',
            cursor: (loading || !email || !password) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: (loading || !email || !password)
              ? 'none'
              : '0 4px 14px rgba(37,99,235,.32), inset 0 1px 0 rgba(255,255,255,.3)',
            transition: 'transform .12s, box-shadow .12s',
          }}
          onMouseEnter={e => { if (!(loading || !email || !password)) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 22px rgba(37,99,235,.4)' } }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = (loading || !email || !password) ? 'none' : '0 4px 14px rgba(37,99,235,.32), inset 0 1px 0 rgba(255,255,255,.3)' }}
        >
          {loading ? '処理中...' : (isSignUp ? 'アカウントを作成' : 'ログイン')}
        </button>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button
            onClick={() => { setIsSignUp(p => !p); setError(''); setMessage('') }}
            style={{
              background: 'none', border: 'none',
              color: '#0369a1', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            {isSignUp ? '既にアカウントをお持ちの方はこちら' : '新規アカウントを作成'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: '#94a3b8' }}>
          <a href="/privacy" style={{ color: '#94a3b8', textDecoration: 'none' }}>プライバシーポリシー</a>
          <span style={{ margin: '0 8px' }}>·</span>
          <a href="/terms" style={{ color: '#94a3b8', textDecoration: 'none' }}>利用規約</a>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
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
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('アカウントを作成しました。ログインしてください。')
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
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : 'https://okr-dashboard-taupe.vercel.app' },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#090d18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');`}</style>
      <div style={{
        width: '100%', maxWidth: 400, padding: '40px 36px',
        background: '#111828', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4d9fff', boxShadow: '0 0 12px #4d9fff' }} />
            <span style={{ fontSize: 11, color: '#4d9fff', letterSpacing: '0.18em', textTransform: 'uppercase' }}>OKR Management</span>
          </div>
          <h1 style={{ color: '#e8eaf0', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            {isSignUp ? 'アカウント作成' : 'ログイン'}
          </h1>
        </div>

        {/* Google ログインボタン */}
        <button
          onClick={handleGoogle} disabled={googleLoading}
          style={{
            width: '100%', background: '#fff', border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 10, padding: '11px 14px', fontSize: 14, fontWeight: 600,
            cursor: googleLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            color: '#333', marginBottom: 18, opacity: googleLoading ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {/* Google SVG icon */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {googleLoading ? '処理中...' : 'Googleでログイン'}
        </button>

        {/* 区切り線 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 11, color: '#404660' }}>または</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* メール/パスワード */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>メールアドレス</div>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="your@company.com"
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '10px 14px', color: '#e8eaf0', fontSize: 14, outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>パスワード</div>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '10px 14px', color: '#e8eaf0', fontSize: 14, outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>

        {error && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 14, padding: '8px 12px', background: 'rgba(255,107,107,0.1)', borderRadius: 8 }}>{error}</div>}
        {message && <div style={{ color: '#00d68f', fontSize: 12, marginBottom: 14, padding: '8px 12px', background: 'rgba(0,214,143,0.1)', borderRadius: 8 }}>{message}</div>}

        <button
          onClick={handleAuth} disabled={loading || !email || !password}
          style={{
            width: '100%', background: loading ? 'rgba(77,159,255,0.4)' : '#4d9fff',
            border: 'none', color: '#fff', borderRadius: 10, padding: '12px',
            fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', transition: 'background 0.15s',
          }}
        >
          {loading ? '処理中...' : (isSignUp ? 'アカウントを作成' : 'ログイン')}
        </button>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button
            onClick={() => { setIsSignUp(p => !p); setError(''); setMessage('') }}
            style={{ background: 'none', border: 'none', color: '#4d9fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {isSignUp ? '既にアカウントをお持ちの方はこちら' : '新規アカウントを作成'}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
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

        {/* Form */}
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

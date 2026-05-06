'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { OrgProvider } from '../lib/orgContext'
import LoginPage from '../components/LoginPage'
import Dashboard from '../components/Dashboard'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const DEMO_GUEST_EMAIL    = process.env.NEXT_PUBLIC_DEMO_GUEST_EMAIL    || 'guest@demo.local'
const DEMO_GUEST_PASSWORD = process.env.NEXT_PUBLIC_DEMO_GUEST_PASSWORD || ''

export default function Page() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [demoError, setDemoError] = useState('')

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user); setLoading(false); return
      }
      // DEMO_MODE: 自動的にゲストとしてログインを試みる
      if (DEMO_MODE && DEMO_GUEST_EMAIL && DEMO_GUEST_PASSWORD) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: DEMO_GUEST_EMAIL, password: DEMO_GUEST_PASSWORD,
          })
          if (error) {
            setDemoError(`ゲスト自動ログインに失敗: ${error.message}`)
          } else if (data?.user) {
            setUser(data.user)
          }
        } catch (e) {
          setDemoError(`ゲスト自動ログイン例外: ${e.message || e}`)
        }
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    if (DEMO_MODE) {
      // デモではログアウトも自動再ログインさせる
      await supabase.auth.signOut()
      window.location.reload()
      return
    }
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#090d18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ color: '#4d9fff', fontSize: 14, fontFamily: 'sans-serif' }}>
        {DEMO_MODE ? 'デモ環境を準備中...' : '読み込み中...'}
      </div>
    </div>
  )

  if (!user) {
    if (DEMO_MODE) {
      return (
        <div style={{ minHeight:'100vh', background:'#090d18', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif', padding:24 }}>
          <div style={{ maxWidth: 480, textAlign:'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎭</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>デモ環境の準備に失敗しました</div>
            <div style={{ fontSize: 13, color:'#9ca3af', marginBottom: 16, lineHeight: 1.6 }}>
              {demoError || 'NEXT_PUBLIC_DEMO_GUEST_EMAIL / PASSWORD 環境変数を確認してください。'}
            </div>
            <button onClick={() => window.location.reload()}
              style={{ padding:'8px 18px', borderRadius: 8, background:'#4d9fff', color:'#fff', border:'none', cursor:'pointer', fontSize: 13, fontWeight: 700 }}>
              再試行
            </button>
          </div>
        </div>
      )
    }
    return <LoginPage />
  }

  return (
    <OrgProvider user={user}>
      <Dashboard user={user} onSignOut={handleSignOut} />
    </OrgProvider>
  )
}

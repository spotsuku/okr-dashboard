'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import LoginPage from '../components/LoginPage'
import Dashboard from '../components/Dashboard'

export default function Page() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#090d18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ color: '#4d9fff', fontSize: 14, fontFamily: 'sans-serif' }}>読み込み中...</div>
    </div>
  )

  if (!user) return <LoginPage />

  return <Dashboard user={user} onSignOut={handleSignOut} />
}

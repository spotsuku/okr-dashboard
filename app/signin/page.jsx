'use client'
// /signin: 専用サインインルート (LPからリンク)
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import LoginPage from '../../components/LoginPage'

export default function SignInPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.replace('/')
      } else {
        setChecking(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) router.replace('/')
    })
    return () => subscription.unsubscribe()
  }, [router])

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#090d18', color: '#4d9fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontFamily: 'sans-serif' }}>
        確認中...
      </div>
    )
  }
  return <LoginPage />
}

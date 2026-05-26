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
      <div style={{
        minHeight: '100vh',
        background:
          'radial-gradient(1200px 800px at 8% 0%, rgba(186,230,253,.55), transparent 60%),' +
          'radial-gradient(1100px 900px at 100% 22%, rgba(187,247,208,.45), transparent 60%),' +
          'linear-gradient(180deg, #f6fafd 0%, #eef4f9 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Inter", "Noto Sans JP", -apple-system, system-ui, sans-serif',
      }}>
        <style>{`@keyframes aiwsSpin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <img src="/icon.png" alt="AI WorkSpace" width={46} height={46} style={{ borderRadius: 11, boxShadow: '0 2px 8px rgba(37,99,235,.18)' }} />
          <div style={{ width: 26, height: 26, border: '3px solid rgba(37,99,235,.2)', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'aiwsSpin .8s linear infinite' }} />
          <div style={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>確認中...</div>
        </div>
      </div>
    )
  }
  return <LoginPage />
}

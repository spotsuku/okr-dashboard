'use client'
// ──────────────────────────────────────────────────────────────
// AppRoot
// SaaS化 Phase 1: ルート "/" と "/[orgSlug]" の両方で使う共通エントリ。
// 認証 → 組織解決 → リダイレクト or ダッシュボード描画 を一手に処理する。
//
// 使い方:
//   /            : <AppRoot />                       (urlSlug 無し)
//   /[orgSlug]/  : <AppRoot urlSlug={params.orgSlug} />
//
// urlSlug 無しモード = ログイン+組織解決後に router.replace(`/${slug}`) する。
// urlSlug 指定モード = 指定 slug を OrgProvider に initialSlug として渡し、
//                      その組織のダッシュボードを描画。所属していなければ "/" へ戻す。
// ──────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { OrgProvider, useCurrentOrg } from '../lib/orgContext'
import LoginPage from './LoginPage'
import Dashboard from './Dashboard'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const DEMO_GUEST_EMAIL    = process.env.NEXT_PUBLIC_DEMO_GUEST_EMAIL    || 'guest@demo.local'
const DEMO_GUEST_PASSWORD = process.env.NEXT_PUBLIC_DEMO_GUEST_PASSWORD || ''

export default function AppRoot({ urlSlug = null }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [demoError, setDemoError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) { setUser(session.user); setLoading(false); return }
      if (DEMO_MODE && DEMO_GUEST_EMAIL && DEMO_GUEST_PASSWORD) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: DEMO_GUEST_EMAIL, password: DEMO_GUEST_PASSWORD,
          })
          if (error) setDemoError(`ゲスト自動ログインに失敗: ${error.message}`)
          else if (data?.user) setUser(data.user)
        } catch (e) {
          setDemoError(`ゲスト自動ログイン例外: ${e.message || e}`)
        }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    if (DEMO_MODE) { await supabase.auth.signOut(); window.location.reload(); return }
    await supabase.auth.signOut()
  }

  if (loading) return <FullPageLoader text={DEMO_MODE ? 'デモ環境を準備中...' : '読み込み中...'} />

  if (!user) {
    if (DEMO_MODE) return <DemoErrorScreen demoError={demoError} />
    return <LoginPage />
  }

  return (
    <OrgProvider user={user} initialSlug={urlSlug || undefined}>
      <PostAuthRouter user={user} onSignOut={handleSignOut} urlSlug={urlSlug} />
    </OrgProvider>
  )
}

// ─── 認証後の動線制御 ───────────────────────────────────────
// urlSlug 無し ("/") → currentOrg 確定後に /{slug}?... へ replace
// urlSlug あり ("/{orgSlug}") → 所属チェック失敗時のみ "/" へ replace
function PostAuthRouter({ user, onSignOut, urlSlug }) {
  const { currentOrg, orgs, loading, error } = useCurrentOrg()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (urlSlug) return  // /[orgSlug] 配下なのでリダイレクト不要
    if (currentOrg?.slug) {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      router.replace(`/${currentOrg.slug}${search}`)
    }
  }, [loading, urlSlug, currentOrg?.slug, router])

  useEffect(() => {
    if (loading) return
    if (!urlSlug) return
    if (orgs.length === 0) return
    const found = orgs.find(o => o.slug === urlSlug)
    if (!found) router.replace('/')
  }, [loading, urlSlug, orgs, router])

  // currentOrg が URL slug と乖離したら URL を自動同期 (Dashboard の switchOrg や
  // 外部からの setCurrentOrg をトリガに /{slug} へ navigate する)。
  // OrgSwitcher 側で URL 操作する必要がなくなり、責務が orgContext+AppRoot に集約される。
  useEffect(() => {
    if (loading) return
    if (!urlSlug) return  // "/" 側は別 useEffect が担当
    if (!currentOrg?.slug) return
    if (currentOrg.slug === urlSlug) return
    const search = typeof window !== 'undefined' ? window.location.search : ''
    router.replace(`/${currentOrg.slug}${search}`)
  }, [loading, urlSlug, currentOrg?.slug, router])

  if (loading) return <FullPageLoader text="組織情報を取得中..." />
  if (error)   return <FullPageError text={error} />
  if (!currentOrg) return <NoOrgScreen email={user.email} />
  // /[orgSlug] 配下で current が URL と未同期 (切替直後のフレーム) → ローダー
  if (urlSlug && currentOrg.slug !== urlSlug) return <FullPageLoader text="切り替え中..." />
  // "/" 配下で currentOrg 確定済み → 直後に上の useEffect が router.replace するので一瞬ローダー
  if (!urlSlug) return <FullPageLoader text={`${currentOrg.name} を開いています...`} />

  return <Dashboard user={user} onSignOut={onSignOut} />
}

// ─── プレースホルダ画面群 ────────────────────────────────────────
function FullPageLoader({ text }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#090d18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ color: '#4d9fff', fontSize: 14, fontFamily: 'sans-serif' }}>{text}</div>
    </div>
  )
}

function FullPageError({ text }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#090d18', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>エラー</div>
        <div style={{ fontSize: 13, color: '#9ca3af' }}>{text}</div>
      </div>
    </div>
  )
}

function NoOrgScreen({ email }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#090d18', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>所属組織がありません</div>
        <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.7, marginBottom: 16 }}>
          {email} は現在どの組織にも所属していません。<br />
          管理者から招待を受けてください。<br />
          <span style={{ color: '#666' }}>(近日: 自分で組織を作成する機能を追加予定)</span>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }} style={{
          padding: '8px 18px', borderRadius: 8, background: '#374151', color: '#fff',
          border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
        }}>ログアウト</button>
      </div>
    </div>
  )
}

function DemoErrorScreen({ demoError }) {
  return (
    <div style={{ minHeight: '100vh', background: '#090d18', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🎭</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>デモ環境の準備に失敗しました</div>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16, lineHeight: 1.6 }}>
          {demoError || 'NEXT_PUBLIC_DEMO_GUEST_EMAIL / PASSWORD 環境変数を確認してください。'}
        </div>
        <button onClick={() => window.location.reload()}
          style={{ padding: '8px 18px', borderRadius: 8, background: '#4d9fff', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          再試行
        </button>
      </div>
    </div>
  )
}

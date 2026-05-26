'use client'
// ─────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { authedFetch } from '../lib/authedFetch'
import { OrgProvider, useCurrentOrg } from '../lib/orgContext'
import { LicenseProvider } from '../lib/license/licenseContext'
import LoginPage from './LoginPage'
import LandingPage from './LandingPage'
import Dashboard from './Dashboard'
import CreateOrgModal from './CreateOrgModal'
import OrgIconBar from './OrgIconBar'
import Icon from './Icon'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const DEMO_GUEST_EMAIL    = process.env.NEXT_PUBLIC_DEMO_GUEST_EMAIL    || 'guest@demo.local'
const DEMO_GUEST_PASSWORD = process.env.NEXT_PUBLIC_DEMO_GUEST_PASSWORD || ''

// ログイン画面と統一した明るいトンマナ (ダーク基調の旧プレースホルダを刷新)
const AIWS_FONT = '"Inter", "Noto Sans JP", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
const AIWS_PAGE_BG =
  'radial-gradient(1200px 800px at 8% 0%, rgba(186,230,253,.55), transparent 60%),' +
  'radial-gradient(1100px 900px at 100% 22%, rgba(187,247,208,.45), transparent 60%),' +
  'radial-gradient(900px 700px at 80% 100%, rgba(224,242,254,.6), transparent 60%),' +
  'linear-gradient(180deg, #f6fafd 0%, #eef4f9 100%)'
const AIWS_CARD = {
  width: '100%', maxWidth: 460, padding: '36px 32px',
  background: 'rgba(255,255,255,.78)',
  backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)',
  border: '1px solid rgba(15,23,42,.06)', borderRadius: 22,
  boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 12px 36px rgba(15,23,42,.08), 0 24px 64px rgba(15,23,42,.06)',
}
const AIWS_CTA = {
  padding: '11px 22px', borderRadius: 999,
  background: 'linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)',
  border: '1px solid #2563eb', color: '#fff', fontSize: 14, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
  boxShadow: '0 4px 14px rgba(37,99,235,.32), inset 0 1px 0 rgba(255,255,255,.3)',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}
const AIWS_GHOST = {
  padding: '11px 18px', borderRadius: 999, background: '#fff',
  border: '1px solid rgba(15,23,42,.12)', color: '#475569',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

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
    // SaaS化 Plan B: URL に slug が入っている = 招待リンク経由などで特定組織への
    // サインインを意図している。組織名を fetch してログイン画面に表示する。
    if (urlSlug) return <OrgBrandedLogin slug={urlSlug} />
    // ルート "/" 未ログイン → LPを表示 (ログインは /signin で別ルート)
    return <LandingPage />
  }

  return (
    <OrgProvider user={user} initialSlug={urlSlug || undefined}>
      <LicenseProvider userEmail={user.email}>
        <PostAuthRouter user={user} onSignOut={handleSignOut} urlSlug={urlSlug} />
      </LicenseProvider>
    </OrgProvider>
  )
}

// ─── 認証後の動線制御 ──────────────────────────────────────
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

  // Slack 風: 左端に組織アイコン列 + 右に既存 Dashboard
  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 0 }}>
      <OrgIconBar userEmail={user.email} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Dashboard user={user} onSignOut={onSignOut} />
      </div>
    </div>
  )
}

// ─── プレースホルダ画面群 ────────────────────────────────────────
function FullPageLoader({ text }) {
  return (
    <div style={{
      minHeight: '100vh', background: AIWS_PAGE_BG, fontFamily: AIWS_FONT,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <style>{`@keyframes aiwsSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <img src="/icon.png" alt="AI WorkSpace" width={46} height={46} style={{ borderRadius: 11, boxShadow: '0 2px 8px rgba(37,99,235,.18)' }} />
        <div style={{ width: 26, height: 26, border: '3px solid rgba(37,99,235,.2)', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'aiwsSpin .8s linear infinite' }} />
        <div style={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>{text}</div>
      </div>
    </div>
  )
}

function FullPageError({ text }) {
  return (
    <div style={{
      minHeight: '100vh', background: AIWS_PAGE_BG, fontFamily: AIWS_FONT, color: '#0f172a',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ ...AIWS_CARD, textAlign: 'center' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
          background: 'rgba(225,29,72,.1)', color: '#e11d48',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="alert" size={26} /></div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#0f172a' }}>エラー</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>{text}</div>
      </div>
    </div>
  )
}

function NoOrgScreen({ email }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [invites, setInvites] = useState(null)   // null=取得中 / [] / [{...}]
  const [joining, setJoining] = useState(null)    // 参加処理中の organization_id
  const [joinError, setJoinError] = useState('')
  const router = useRouter()

  // 参加可能な招待 (= email が名簿に居るが未リンクの組織) を取得
  useEffect(() => {
    let alive = true
    authedFetch('/api/org/my-invites')
      .then(r => (r.ok ? r.json() : { invites: [] }))
      .then(d => { if (alive) setInvites(d.invites || []) })
      .catch(() => { if (alive) setInvites([]) })
    return () => { alive = false }
  }, [])

  const join = async (org) => {
    setJoining(org.organization_id); setJoinError('')
    try {
      const r = await authedFetch('/api/org/my-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: org.organization_id }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setJoinError(d.error || '参加に失敗しました'); setJoining(null); return }
      if (d.slug) router.replace(`/${d.slug}`)
      else window.location.reload()
    } catch {
      setJoinError('参加に失敗しました'); setJoining(null)
    }
  }

  const hasInvites = Array.isArray(invites) && invites.length > 0

  return (
    <div style={{
      minHeight: '100vh', background: AIWS_PAGE_BG, fontFamily: AIWS_FONT, color: '#0f172a',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ ...AIWS_CARD, textAlign: 'center' }}>
        {/* ブランド */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <img src="/icon.png" alt="AI WorkSpace" width={28} height={28} style={{ borderRadius: 7 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>AI WorkSpace</span>
        </div>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
          background: 'rgba(37,99,235,.1)', color: '#2563eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="building" size={28} /></div>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8, color: '#0f172a', letterSpacing: '-0.01em' }}>
          {hasInvites ? '組織に参加' : '所属組織がありません'}
        </div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 22 }}>
          {hasInvites ? (
            <><span style={{ fontWeight: 600, color: '#334155' }}>{email}</span> は以下の組織に招待されています。<br />参加するか、新しい組織を作成できます。</>
          ) : (
            <><span style={{ fontWeight: 600, color: '#334155' }}>{email}</span> はまだどの組織にも所属していません。<br />新しい組織を作成するか、管理者から招待を受けてください。</>
          )}
        </div>

        {/* 招待されている組織への参加導線 */}
        {hasInvites && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {invites.map(org => (
              <button key={org.organization_id} onClick={() => join(org)} disabled={joining != null} style={{
                padding: '12px 14px', borderRadius: 14, background: '#fff',
                border: '1px solid rgba(15,23,42,.10)', color: '#0f172a',
                cursor: joining != null ? 'not-allowed' : 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit',
                boxShadow: '0 1px 2px rgba(15,23,42,.04)',
                opacity: joining != null && joining !== org.organization_id ? 0.5 : 1,
                transition: 'transform .12s, box-shadow .12s, border-color .12s',
              }}
                onMouseEnter={e => { if (joining == null) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(15,23,42,.08)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,.4)' } }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,.04)'; e.currentTarget.style.borderColor = 'rgba(15,23,42,.10)' }}
              >
                <span style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(37,99,235,.1)', color: '#2563eb',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16,
                }}>{(org.name || '?').slice(0, 1)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org.name || org.slug}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#64748b' }}>
                    {joining === org.organization_id ? '参加中…' : `${org.is_admin ? '管理者' : 'メンバー'}として参加`}
                  </span>
                </span>
                <span style={{ color: '#94a3b8', display: 'inline-flex' }}><Icon name="chevronR" size={16} /></span>
              </button>
            ))}
          </div>
        )}

        {joinError && (
          <div style={{ fontSize: 12, color: '#e11d48', marginBottom: 12, padding: '8px 12px', background: 'rgba(225,29,72,.08)', border: '1px solid rgba(225,29,72,.18)', borderRadius: 10 }}>{joinError}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setCreateOpen(true)} style={AIWS_CTA}>
            <Icon name="plus" size={15} /> 新しい組織を作成
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }} style={AIWS_GHOST}>
            ログアウト
          </button>
        </div>
      </div>
      <CreateOrgModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(org) => {
          // 作成成功 → 新組織の URL へ
          setCreateOpen(false)
          if (org?.slug) router.replace(`/${org.slug}`)
          else window.location.reload()
        }}
        userEmail={email}
      />
    </div>
  )
}

// URL に slug がある状態で未ログイン → 組織名入りログイン画面 (Plan B)
function OrgBrandedLogin({ slug }) {
  const [orgName, setOrgName] = useState(null)
  const [resolved, setResolved] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/org/public?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (alive) { setOrgName(j?.organization?.name || null); setResolved(true) } })
      .catch(() => { if (alive) setResolved(true) })
    return () => { alive = false }
  }, [slug])
  // 解決前は通常ログインを出す (UI の点滅を最小化)
  if (!resolved) return <LoginPage />
  return <LoginPage orgName={orgName} />
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

'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

// ──────────────────────────────────────────────────────────────
// 組織コンテキスト (Phase 2.1 / Phase 3 SaaS化)
//
// 現在ログイン中ユーザーが所属する組織のうち「アクティブ組織」を保持。
// 1ユーザー = 複数組織 (Slack風) に対応。
//
// アクティブ組織の優先順位 (高 → 低):
//   1. initialSlug (URL の /[orgSlug] から渡される、Phase 1 SaaS化で導入)
//   2. localStorage('current_org_slug')
//   3. is_default フラグ
//   4. リストの先頭
//
// Provider 配下のコンポーネントは useCurrentOrg() で
//   { id, slug, name, role, plan } を取得できる。
// ──────────────────────────────────────────────────────────────

const OrgContext = createContext({
  currentOrg: null,
  loading: true,
  error: null,
  orgs: [],
  switchOrg: () => {},
  reload: () => {},
})

export function useCurrentOrg() {
  return useContext(OrgContext)
}

export function OrgProvider({ user, initialSlug, children }) {
  const [currentOrg, setCurrentOrg] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!user?.email) { setCurrentOrg(null); setLoading(false); return }
    setLoading(true)
    try {
      // 1) email → members.id を解決
      const { data: m, error: mErr } = await supabase.from('members')
        .select('id, name, email, is_admin').eq('email', user.email).maybeSingle()
      if (mErr) throw new Error(mErr.message)
      if (!m) {
        setError('このメールアドレスは登録されていません')
        setCurrentOrg(null); setOrgs([]); setLoading(false); return
      }

      // 2) organization_members を経由して所属org一覧を取得
      const { data: rows, error: oErr } = await supabase.from('organization_members')
        .select('organization_id, role, is_default, organizations(id, slug, name, plan, fiscal_year_default)')
        .eq('member_id', m.id)
      if (oErr) throw new Error(oErr.message)

      const list = (rows || []).map(r => ({
        id: r.organization_id,
        slug: r.organizations?.slug,
        name: r.organizations?.name,
        plan: r.organizations?.plan,
        fiscal_year_default: r.organizations?.fiscal_year_default,
        role: r.role,
        is_default: r.is_default,
      })).filter(o => o.id)

      setOrgs(list)

      // 3) アクティブ組織を決定 (initialSlug > localStorage > is_default > 先頭)
      let active = null
      if (initialSlug) active = list.find(o => o.slug === initialSlug) || null
      if (!active && typeof window !== 'undefined') {
        const savedSlug = localStorage.getItem('current_org_slug')
        if (savedSlug) active = list.find(o => o.slug === savedSlug)
      }
      if (!active) active = list.find(o => o.is_default) || list[0] || null

      setCurrentOrg(active)
      // URL に渡された slug が active になったら localStorage も更新しておく
      if (active && typeof window !== 'undefined') {
        try { localStorage.setItem('current_org_slug', active.slug) } catch {}
      }
      setError(null)
    } catch (e) {
      setError(e.message || String(e))
      setCurrentOrg(null)
    } finally {
      setLoading(false)
    }
  }, [user?.email, initialSlug])

  useEffect(() => { reload() }, [reload])

  // URL の orgSlug が後から変わったとき (例: ブラウザ戻る) に追従
  useEffect(() => {
    if (!initialSlug || orgs.length === 0) return
    if (currentOrg?.slug === initialSlug) return
    const next = orgs.find(o => o.slug === initialSlug)
    if (next) {
      setCurrentOrg(next)
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('current_org_slug', initialSlug) } catch {}
      }
    }
  }, [initialSlug, orgs, currentOrg?.slug])

  const switchOrg = useCallback((slug) => {
    const next = orgs.find(o => o.slug === slug)
    if (!next) return
    setCurrentOrg(next)
    if (typeof window !== 'undefined') localStorage.setItem('current_org_slug', slug)
  }, [orgs])

  return (
    <OrgContext.Provider value={{ currentOrg, loading, error, orgs, switchOrg, reload }}>
      {children}
    </OrgContext.Provider>
  )
}

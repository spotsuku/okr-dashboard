'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────

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
      //    per-org 化 (members_email_org_lower_uniq) により、1ユーザーは
      //    所属組織ごとに別々の members 行を持つ。よって email では複数行が
      //    返りうる → maybeSingle ではなく全件取得し、その id 群で所属orgを引く。
      const { data: memRows, error: mErr } = await supabase.from('members')
        .select('id, name, email, is_admin').eq('email', user.email)
      if (mErr) throw new Error(mErr.message)
      if (!memRows || memRows.length === 0) {
        // 未登録ユーザー (Supabase Auth は通ったが members 行が無い): エラーではなく
        // 「所属組織なし」状態として扱い、NoOrgScreen の組織作成ボタンに誘導する。
        // (Phase 4 SaaS化で新規ユーザーが自分で組織を作れるようになったため)
        setCurrentOrg(null); setOrgs([]); setLoading(false); return
      }
      const memberIds = memRows.map(r => r.id)

      // 2) organization_members を経由して所属org一覧を取得 (複数 member_id 対応)
      // SaaS化 Phase C: enabled_modules / level_labels を取得するが、
      // 本番 DB にカラムが未適用の場合はフォールバックで取得して落ちないようにする
      let rows = null
      let oErr = null
      const fullRes = await supabase.from('organization_members')
        .select('organization_id, role, is_default, organizations(id, slug, name, plan, fiscal_year_default, enabled_modules, level_labels)')
        .in('member_id', memberIds)
      if (fullRes.error && /enabled_modules|level_labels|column.*does not exist/i.test(fullRes.error.message || '')) {
        // 本番 DB に supabase_organization_modules.sql が未適用 → enabled_modules / level_labels を外して再取得
        console.warn('[orgContext] enabled_modules / level_labels column not found, falling back')
        const fallbackRes = await supabase.from('organization_members')
          .select('organization_id, role, is_default, organizations(id, slug, name, plan, fiscal_year_default)')
          .in('member_id', memberIds)
        rows = fallbackRes.data
        oErr = fallbackRes.error
      } else {
        rows = fullRes.data
        oErr = fullRes.error
      }
      if (oErr) throw new Error(oErr.message)

      const seen = new Set()
      const list = (rows || []).map(r => ({
        id: r.organization_id,
        slug: r.organizations?.slug,
        name: r.organizations?.name,
        plan: r.organizations?.plan,
        fiscal_year_default: r.organizations?.fiscal_year_default,
        enabled_modules: r.organizations?.enabled_modules || {},
        level_labels: r.organizations?.level_labels || null,
        role: r.role,
        is_default: r.is_default,
      })).filter(o => {
        if (!o.id || seen.has(o.id)) return false
        seen.add(o.id); return true
      })

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
      // 30日無料トライアルの基準日: 管理者 (role=owner/admin) が初めて組織にアクセスしたら
      // organizations.admin_first_login_at に NOW() を一度だけ書き込む (NULL のみ更新)
      if (active && (active.role === 'owner' || active.role === 'admin')) {
        supabase
          .from('organizations')
          .update({ admin_first_login_at: new Date().toISOString() })
          .eq('id', active.id)
          .is('admin_first_login_at', null)
          .then(() => {}, () => {})
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

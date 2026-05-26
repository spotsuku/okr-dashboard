'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { avatarColor } from '../lib/avatarColor'
import { supabase } from '../lib/supabase'
import { useCurrentOrg } from '../lib/orgContext'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS, GLASS, BRAND_GRADIENT } from '../lib/themeTokens'
import { cardStyle, btnGhost, btnBrand, btnSecondary } from '../lib/iosStyles'
import Icon from './Icon'

// ─── 日付ユーティリティ (CompanyDashboardSummary と同じ JST 基準) ───
function getMondayJSTStr(d = new Date()) {
  const j = new Date(d.getTime() + 9 * 3600 * 1000)
  const day = j.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + diff))
  return m.toISOString().slice(0, 10)
}
function todayJSTStr() {
  const j = new Date(Date.now() + 9 * 3600 * 1000)
  return j.toISOString().slice(0, 10)
}
// due_date 等の日付列を 'YYYY-MM-DD' 文字列に正規化
function dateStr(v) {
  if (!v) return ''
  return String(v).slice(0, 10)
}
// KR が逆指標 (低いほど良い) か判定
function isInvertedKR(title) {
  if (!title) return false
  return /以下|以内|削減|短縮|抑え|減らす|低減/.test(String(title))
}
// KR の達成率を 0〜150% で計算 (CompanyDashboardSummary と同じ計算)
function calcKRPct(kr) {
  const target = Number(kr.target) || 0
  const current = Number(kr.current) || 0
  if (!target) return 0
  if (isInvertedKR(kr.title)) {
    if (current <= 0) return 150
    return Math.max(0, Math.min(150, (target / current) * 100))
  }
  return Math.min(150, (current / target) * 100)
}
// timestamp → 相対時間 ("3分前" / "2時間前" / "3日前" / "M/D")
function relativeTime(ts) {
  if (!ts) return ''
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}日前`
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// メンバー名から決定的に色を割り当て (アバター用)
const AVATAR_HUES = ['#f59e0b', '#3b82f6', '#10b981', '#a855f7', '#ec4899', '#06b6d4', '#ef6b6b', '#84cc16', '#f97316', '#8b5cf6']

// ─── テーマは lib/themeTokens.js で一元管理 ─────────────────────
const THEMES = {
  dark:  { ...COMMON_TOKENS.dark,  cardHover: 'rgba(255,255,255,0.04)' },
  light: { ...COMMON_TOKENS.light, cardHover: 'rgba(0,0,0,0.02)' },
}

// ─── カスタムリンク (localStorage 永続化) ─────────────────────────
// カスタムリンクは「アイコン色」で見分ける。色トークンキーで保存し描画時に T から解決する。
const LINK_COLOR_KEYS = ['accent', 'success', 'warn', 'danger', 'purple', 'indigo']
const CUSTOM_LINKS_KEY = (email) => `portal_custom_links_v1_${email || 'guest'}`

// 色キーから { bg, fg } を解決 (アイコンタイルの淡色背景 + 前景色)。purple/indigo は固定 hex (トークン未定義のため)
function linkColorTokens(T, key) {
  switch (key) {
    case 'success': return { bg: T.successSoft, fg: T.success }
    case 'warn':    return { bg: T.warnSoft,    fg: T.warn }
    case 'danger':  return { bg: T.dangerSoft,  fg: T.danger }
    case 'purple':  return { bg: 'rgba(168,85,247,.14)', fg: '#7c3aed' }
    case 'indigo':  return { bg: 'rgba(99,102,241,.14)', fg: '#4f46e5' }
    case 'accent':
    default:        return { bg: T.accentSoft, fg: T.accentText }
  }
}

function loadCustomLinks(email) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_LINKS_KEY(email))
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function saveCustomLinks(email, links) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(CUSTOM_LINKS_KEY(email), JSON.stringify(links)) } catch { /* noop */ }
}
// ─── オンボーディング (7ステップ) ──────────────────────────────
const ONB_DISMISS_KEY = (email) => `home_onboarding_dismissed_${email || 'guest'}`
const ONB_SEEN_OKR_KEY = 'home_onb_seen_okr'
// 7ステップ定義 (順序厳守: プロフ→MyCOO→Google→リンク→タスク→振り返り→目標)
const ONB_STEPS = [
  { key: 'profile',    icon: 'user',    title: 'プロフィールを設定',     desc: '名前・役職・アバターを設定し、チームから認識されやすくする' },
  { key: 'mycoo',      icon: 'sparkle', title: 'MyCOO に話しかける',     desc: '右下のオーブが AI コーチであることを早期に知ってもらう' },
  { key: 'google',     icon: 'link',    title: 'Google 連携',           desc: 'カレンダー・Gmail と連携して AI が予定とタスクを自動整理' },
  { key: 'links',      icon: 'link',    title: 'カスタムリンクを登録',   desc: 'よく使うツール（Slack / Notion / freee 等）を登録、ホームを作業拠点化' },
  { key: 'task',       icon: 'bolt',    title: '明日のタスクを追加',     desc: '自然文で書くだけ。AI が日付と担当を解析' },
  { key: 'reflection', icon: 'refresh', title: '振り返りを書く',         desc: 'Keep / Problem / Try を 1 行から。継続でバッジ' },
  { key: 'goal',       icon: 'target',  title: '今期の目標を見る',       desc: 'チームの OKR / KR を確認、自分の作業との繋がりを意識' },
]
function loadOnbDismissed(email) {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(ONB_DISMISS_KEY(email)) === '1' } catch { return false }
}
function saveOnbDismissed(email) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(ONB_DISMISS_KEY(email), '1') } catch { /* noop */ }
}
function loadOnbSeenOkr() {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(ONB_SEEN_OKR_KEY) === '1' } catch { return false }
}
function saveOnbSeenOkr() {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(ONB_SEEN_OKR_KEY, '1') } catch { /* noop */ }
}

function normalizeUrl(input) {
  const t = (input || '').trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}
// URL からホスト部分を取り出して mono 表示する (https:// やパスを削る)
function displayUrl(url) {
  try { return new URL(url).host } catch { return (url || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '') }
}

export default function PortalPage({ user, onNavigate, themeKey = 'dark', members = [], T: passedT }) {
  const T = passedT || THEMES[themeKey] || THEMES.dark

  // 組織コンテキスト (org-scope クエリ用) と自分のメンバー名
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id
  const myName = members.find(m => m.email === user?.email)?.name || ''

  // 実データ state (Supabase から org-scope で取得)
  const [stats, setStats] = useState({
    todayTasks: null,   // 今日のタスク (未完了)
    overdue: null,      // 期限切れ (未完了)
    krPct: null,        // KR達成率 %
    taskDonePct: null,  // タスク完了率 %
    openConfirms: null, // 未対応確認事項
  })
  const [recentItems, setRecentItems] = useState([])  // 最近の動き
  const [notices, setNotices] = useState([])          // お知らせ

  // オンボーディング state (done 検出は実データのみ。検出不能は未完了扱い・捏造しない)
  const [onbDismissed, setOnbDismissed] = useState(true) // SSR/初期は非表示、マウント後に判定
  const [onbSeenOkr, setOnbSeenOkr] = useState(false)
  const [onbDone, setOnbDone] = useState({
    profile: false, mycoo: false, google: false, links: false,
    task: false, reflection: false, goal: false,
  })

  // カスタムリンク state
  const [customLinks, setCustomLinks] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formTitle, setFormTitle] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formColor, setFormColor] = useState('accent')
  const [formError, setFormError] = useState('')

  // localStorage から読み込み (ユーザーごと)
  useEffect(() => {
    setCustomLinks(loadCustomLinks(user?.email))
    setOnbDismissed(loadOnbDismissed(user?.email))
    setOnbSeenOkr(loadOnbSeenOkr())
  }, [user?.email])

  // step4 (リンク) / step7 (目標) はクライアント状態から判定
  useEffect(() => {
    setOnbDone(prev => ({ ...prev, links: customLinks.length > 0, goal: onbSeenOkr }))
  }, [customLinks.length, onbSeenOkr])

  const persistLinks = useCallback((next) => {
    setCustomLinks(next)
    saveCustomLinks(user?.email, next)
  }, [user?.email])

  // ─── 実データ読み込み (全て org-scope: .eq('organization_id', orgId)) ───
  useEffect(() => {
    if (!orgId) return
    let alive = true
    const today = todayJSTStr()
    const monday = getMondayJSTStr()
    ;(async () => {
      // 各クエリは個別に成否判定 (1つ失敗しても他は処理する)
      const queries = [
        // 1. マイページ: 自分の今日期限タスク (未完了)
        ['todayTasks', supabase.from('ka_tasks')
          .select('id, due_date, done, status')
          .eq('organization_id', orgId).eq('assignee', myName)
          .eq('due_date', today).eq('done', false).range(0, 999)],
        // 1. マイページ: 自分の期限切れタスク (未完了)
        ['overdue', supabase.from('ka_tasks')
          .select('id, due_date, done, status')
          .eq('organization_id', orgId).eq('assignee', myName)
          .lt('due_date', today).eq('done', false).range(0, 999)],
        // 2. 全社: KR (達成率の平均)
        ['krs', supabase.from('key_results')
          .select('id, title, owner, current, target')
          .eq('organization_id', orgId).range(0, 999)],
        // 2. 全社: 全社タスク (完了率) — 期限切れ未完了 + 今日期限ぶんを母数に
        ['orgOverdue', supabase.from('ka_tasks')
          .select('id, done, status')
          .eq('organization_id', orgId).lt('due_date', today).eq('done', false).range(0, 999)],
        ['orgToday', supabase.from('ka_tasks')
          .select('id, done, status')
          .eq('organization_id', orgId).eq('due_date', today).range(0, 999)],
        // 2. 全社: 未対応 (status='open') 確認事項
        ['openConfirms', supabase.from('member_confirmations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'open')],
        // 3. 最近の動き: 直近 KR レビュー
        ['recentKrRevs', supabase.from('kr_weekly_reviews')
          .select('kr_id, good, more, focus, updated_at')
          .eq('organization_id', orgId)
          .order('updated_at', { ascending: false }).limit(8)],
        // 3. 最近の動き: 直近 KPT ログ
        ['recentKpt', supabase.from('coaching_logs')
          .select('owner, content, created_at')
          .eq('organization_id', orgId).eq('log_type', 'kpt')
          .order('created_at', { ascending: false }).limit(8)],
        // 3. 最近の動き: 直近で解決された確認事項
        ['recentResolved', supabase.from('member_confirmations')
          .select('to_name, from_name, content, resolved_at, created_at, status')
          .eq('organization_id', orgId).eq('status', 'resolved')
          .order('resolved_at', { ascending: false }).limit(8)],
        // 4. お知らせ: 自分宛の未対応確認事項
        ['myConfirms', supabase.from('member_confirmations')
          .select('id, from_name, content, created_at')
          .eq('organization_id', orgId).eq('to_name', myName).eq('status', 'open')
          .order('created_at', { ascending: false }).limit(5)],
        // 4. お知らせ: 今週レビュー判定用の今週分 KRレビュー
        ['weekRevs', supabase.from('kr_weekly_reviews')
          .select('kr_id, good, more, focus')
          .eq('organization_id', orgId).eq('week_start', monday).range(0, 999)],
      ]
      const settled = await Promise.allSettled(queries.map(([, p]) => p))
      if (!alive) return

      const r = {}
      settled.forEach((s, i) => {
        const key = queries[i][0]
        if (s.status !== 'fulfilled' || s.value?.error) {
          const msg = s.status !== 'fulfilled' ? (s.reason?.message || String(s.reason)) : (s.value.error.message || '')
          console.warn(`[PortalPage] ${key} クエリ失敗: ${msg}`)
          r[key] = { data: [], count: 0 }
          return
        }
        r[key] = s.value
      })

      // ── マイページ stats ──
      const todayTaskCount = (r.todayTasks?.data || []).filter(t => t.status !== 'done').length
      const overdueCount = (r.overdue?.data || []).filter(t => t.status !== 'done').length

      // ── 全社 stats ──
      const krList = (r.krs?.data || []).filter(kr => Number(kr.target) > 0)
      const krPct = krList.length
        ? Math.round(krList.reduce((sum, kr) => sum + Math.min(100, calcKRPct(kr)), 0) / krList.length)
        : null
      const orgTasks = [...(r.orgOverdue?.data || []), ...(r.orgToday?.data || [])]
      const orgTotal = orgTasks.length
      const orgDone = orgTasks.filter(t => t.done || t.status === 'done').length
      const taskDonePct = orgTotal ? Math.round((orgDone / orgTotal) * 100) : null
      const openConfirms = r.openConfirms?.count || 0

      setStats({
        todayTasks: todayTaskCount,
        overdue: overdueCount,
        krPct,
        taskDonePct,
        openConfirms,
      })

      // ── 最近の動き (KRレビュー / KPT / 解決された確認事項を時系列で統合) ──
      const krOwnerMap = {}
      const krTitleMap = {}
      ;(r.krs?.data || []).forEach(kr => { krOwnerMap[kr.id] = kr.owner; krTitleMap[kr.id] = kr.title })
      const recent = []
      ;(r.recentKrRevs?.data || []).forEach(rv => {
        if (!((rv.good || '').trim() || (rv.more || '').trim() || (rv.focus || '').trim())) return
        const name = krOwnerMap[rv.kr_id]
        if (!name) return
        recent.push({ name, action: 'KR の週次レビューを記入しました', detail: krTitleMap[rv.kr_id] || '', ts: rv.updated_at })
      })
      ;(r.recentKpt?.data || []).forEach(row => {
        if (!row.owner) return
        let c
        try { c = typeof row.content === 'string' ? JSON.parse(row.content) : row.content } catch { c = {} }
        if (!((c?.keep || '').trim() || (c?.problem || '').trim() || (c?.try || '').trim())) return
        recent.push({ name: row.owner, action: '振り返り (KPT) を記入しました', detail: '', ts: row.created_at })
      })
      ;(r.recentResolved?.data || []).forEach(row => {
        if (!row.to_name) return
        recent.push({ name: row.to_name, action: '確認事項を解決しました', detail: row.content || '', ts: row.resolved_at || row.created_at })
      })
      recent.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
      setRecentItems(recent.slice(0, 5))

      // ── お知らせ (自分宛の未対応確認事項 + 今週レビュー未記入の自分の KR) ──
      const reviewedKrIds = new Set()
      ;(r.weekRevs?.data || []).forEach(rv => {
        if ((rv.good || '').trim() || (rv.more || '').trim() || (rv.focus || '').trim()) reviewedKrIds.add(rv.kr_id)
      })
      const notice = []
      ;(r.myConfirms?.data || []).forEach(row => {
        notice.push({
          kind: 'warn',
          body: `${row.from_name || '誰か'} さんから確認依頼があります`,
          date: dateStr(row.created_at),
        })
      })
      const myUnreviewedKRs = (r.krs?.data || []).filter(kr =>
        kr.owner === myName && Number(kr.target) > 0 && !reviewedKrIds.has(kr.id))
      if (myUnreviewedKRs.length > 0) {
        notice.push({
          kind: 'info',
          body: `今週レビュー未記入の KR が ${myUnreviewedKRs.length} 件あります`,
          date: today,
        })
      }
      setNotices(notice.slice(0, 5))
    })()
    return () => { alive = false }
  }, [orgId, myName])

  // ─── オンボーディング done 検出 (org-scope, best-effort) ───
  // 1 プロフィール: members から自分の avatar_url / role を判定 (同期)
  useEffect(() => {
    const me = members.find(m => m.email === user?.email)
    const profileDone = !!(me && (me.avatar_url || me.role))
    setOnbDone(prev => ({ ...prev, profile: profileDone }))
  }, [members, user?.email])

  // 2 MyCOO / 3 Google / 5 タスク / 6 振り返り: Supabase を個別に問い合わせ。
  // テーブル/列が無い等のエラーは catch して未完了扱い (捏造しない)。
  useEffect(() => {
    if (!orgId || !myName) return
    let alive = true
    const today = todayJSTStr()
    ;(async () => {
      const probes = [
        // 2 MyCOO: coaching_chats (owner=myName, kind='coo')
        ['mycoo', supabase.from('coaching_chats')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('owner', myName).eq('kind', 'coo')],
        // 3 Google連携: user_integrations (owner=myName, service='google')
        ['google', supabase.from('user_integrations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('owner', myName).eq('service', 'google')],
        // 5 明日のタスク: 自分の ka_tasks で due_date >= today
        ['task', supabase.from('ka_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('assignee', myName).gte('due_date', today)],
        // 6 振り返り: 自分の coaching_logs (log_type='kpt')
        ['reflection', supabase.from('coaching_logs')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('owner', myName).eq('log_type', 'kpt')],
      ]
      const settled = await Promise.allSettled(probes.map(([, p]) => p))
      if (!alive) return
      const next = {}
      settled.forEach((s, i) => {
        const key = probes[i][0]
        if (s.status !== 'fulfilled' || s.value?.error) {
          const msg = s.status !== 'fulfilled' ? (s.reason?.message || String(s.reason)) : (s.value.error.message || '')
          console.warn(`[PortalPage] オンボード ${key} 検出失敗 (未完了扱い): ${msg}`)
          next[key] = false
          return
        }
        next[key] = (s.value.count || 0) > 0
      })
      setOnbDone(prev => ({ ...prev, ...next }))
    })()
    return () => { alive = false }
  }, [orgId, myName])

  // ステップごとのクリック動作 (有効な activePage id のみ使用)
  const onbStepAction = useCallback((key) => {
    switch (key) {
      case 'profile':    onNavigate('mycoach'); break
      case 'mycoo':
        // MyCOO オーブがあれば開くイベントを送出。無ければ何もしない。
        try { window.dispatchEvent(new CustomEvent('okr:open-mycoo')) } catch { /* noop */ }
        break
      case 'google':     onNavigate('mycoach'); break // 専用の連携ページが無いため MyCOO へ
      case 'links':
        // カスタムリンク追加ダイアログを開く
        openAddDialog()
        break
      case 'task':       onNavigate('mytasks'); break
      case 'reflection': onNavigate('mycoach'); break
      case 'goal':
        saveOnbSeenOkr(); setOnbSeenOkr(true); onNavigate('okr'); break
      default: break
    }
  }, [onNavigate])

  function dismissOnboarding() {
    saveOnbDismissed(user?.email)
    setOnbDismissed(true)
  }

  function openAddDialog() {
    setEditingId(null); setFormTitle(''); setFormUrl(''); setFormColor('accent'); setFormError(''); setShowAdd(true)
  }
  function openEditDialog(link) {
    setEditingId(link.id); setFormTitle(link.title); setFormUrl(link.url)
    setFormColor(link.color && LINK_COLOR_KEYS.includes(link.color) ? link.color : 'accent')
    setFormError(''); setShowManage(false); setShowAdd(true)
  }
  function submitForm() {
    const title = formTitle.trim()
    const url = normalizeUrl(formUrl)
    if (!title) { setFormError('表示名を入力してください'); return }
    if (!url)   { setFormError('URLを入力してください'); return }
    try { new URL(url) } catch { setFormError('URLの形式が正しくありません'); return }
    if (editingId) {
      persistLinks(customLinks.map(l => l.id === editingId ? { ...l, title, url, color: formColor } : l))
    } else {
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      persistLinks([...customLinks, { id, title, url, color: formColor }])
    }
    setShowAdd(false)
  }
  function deleteLink(id) {
    persistLinks(customLinks.filter(l => l.id !== id))
  }

  // 表示名 (members から解決、無ければ email)
  const displayName = useMemo(() => {
    const m = members.find(mm => mm.email === user?.email)
    return m?.name || user?.email || 'ゲスト'
  }, [members, user?.email])
  const avatarUrl = useMemo(() => {
    const m = members.find(mm => mm.email === user?.email)
    return user?.avatarUrl || m?.avatar_url || null
  }, [members, user?.email, user?.avatarUrl])
  const initial = (displayName || 'U').trim().charAt(0)

  // 日付 "M/D(曜)"
  const dateLabel = (() => {
    const d = new Date()
    const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
    return `${d.getMonth() + 1}/${d.getDate()}(${wd})`
  })()

  // 統計値は Supabase の実データで表示。未取得 (null) は "—" を出す (捏造しない)。
  // 未読メールは DB に手頃な集計元が無いため常に "—" (Gmail 等の外部 API は呼ばない)。
  const fmt = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`)
  const myStats = [
    { lbl: '今日のタスク', val: fmt(stats.todayTasks), color: T.warn },
    { lbl: '期限切れ',     val: fmt(stats.overdue),    color: T.danger },
    { lbl: '未読メール',   val: '—', color: T.accentText },
  ]
  const companyStats = [
    { lbl: 'KR達成率',       val: fmt(stats.krPct, '%'),      color: T.success },
    { lbl: 'タスク完了率',   val: fmt(stats.taskDonePct, '%'), color: T.accentText },
    { lbl: '未対応確認事項', val: fmt(stats.openConfirms),    color: T.warn },
  ]

  // ─── オンボーディング 派生値 (完了数 / 次ステップ / 自動 dismiss) ───
  const onbDoneCount = ONB_STEPS.filter(s => onbDone[s.key]).length
  const onbAllDone = onbDoneCount === ONB_STEPS.length
  // 次に取り組むべき (= 最初の未完了) ステップ
  const onbNextStep = ONB_STEPS.find(s => !onbDone[s.key]) || null
  // 全完了したら自動で dismiss を永続化
  useEffect(() => {
    if (!onbDismissed && onbAllDone) dismissOnboarding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onbAllDone, onbDismissed])

  // ─── 共通スタイル断片 ──────────────────────────────
  const destCard = {
    ...cardStyle({ T, padding: 24 }),
    borderRadius: RADIUS.xl,
    display: 'flex', flexDirection: 'column', gap: 14,
    cursor: 'pointer',
  }
  const openPill = {
    position: 'absolute', top: 24, right: 24,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 11px', fontSize: 11.5, fontWeight: 600,
    background: GLASS.light, border: `1px solid ${T.border}`,
    borderRadius: RADIUS.pill, color: T.textSub,
  }
  const statRow = {
    display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10,
    paddingTop: 14, borderTop: `1px solid ${T.border}`, marginTop: 'auto',
  }
  const statLbl = {
    fontSize: 10.5, color: T.textMuted, fontWeight: 600,
    letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 2,
  }

  function DestCard({ kind, icon, title, desc, stats, onClick }) {
    const tileBg = kind === 'company'
      ? 'linear-gradient(135deg,#10b981,#059669)'
      : BRAND_GRADIENT.cta
    const tileShadow = kind === 'company'
      ? '0 4px 12px rgba(5,150,105,.28)'
      : '0 4px 12px rgba(37,99,235,.28)'
    return (
      <div role="button" tabIndex={0} onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
        style={destCard}>
        <span style={openPill}>開く <Icon name="arrowRight" size={11} /></span>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: tileBg,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: tileShadow,
          }}>
            <Icon name={icon} size={22} stroke={1.8} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.005em', margin: '0 0 4px', color: T.text }}>{title}</h2>
            <div style={{ fontSize: 12.5, color: T.textSub, lineHeight: 1.6 }}>{desc}</div>
          </div>
        </div>
        <div style={statRow}>
          {stats.map(s => (
            <div key={s.lbl}>
              <div style={statLbl}>{s.lbl}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.01em', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── インフォカード (最近の動き / お知らせ) ────────────
  // items が空なら emptyText を表示。それ以外は children (実データ行) を描画。
  function InfoCard({ icon, iconColor, title, emptyText, isEmpty, children }) {
    return (
      <div style={{ ...cardStyle({ T, padding: 0 }), borderRadius: RADIUS.lg }}>
        <div style={{ padding: '11px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <h4 style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name={icon} size={13} style={{ color: iconColor }} /> {title}
          </h4>
        </div>
        {isEmpty ? (
          <div style={{ padding: '22px 14px', textAlign: 'center', color: T.textMuted, fontSize: 12, lineHeight: 1.7 }}>
            {emptyText}
          </div>
        ) : (
          <div style={{ padding: '4px 0' }}>{children}</div>
        )}
      </div>
    )
  }

  // 最近の動き 1行: [丸アバター] {name} が {action} —「{detail}」  + 相対時刻
  function ActivityRow({ item, last }) {
    const mem = members.find(m => m.name === item.name)
    const c = avatarColor(item.name)
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px',
        borderBottom: last ? 'none' : `1px solid ${T.border}`,
        fontSize: 12,
      }}>
        {mem?.avatar_url
          ? <img src={mem.avatar_url} alt={item.name} style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          : <span style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg, ${c}, ${c}aa)`, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.name ? item.name[0] : '?'}</span>}
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600, color: T.text }}>{item.name}</span>
          <span style={{ color: T.textSub }}> が {item.action}{item.detail ? ` —「${item.detail}」` : ''}</span>
        </div>
        <span style={{ fontSize: 10.5, color: T.textMuted, fontFamily: 'ui-monospace, monospace', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {relativeTime(item.ts)}
        </span>
      </div>
    )
  }

  // お知らせ 1行: info/warn アイコン + 本文 + 日付
  function NoticeRow({ item, last }) {
    const color = item.kind === 'warn' ? T.warn : T.accent
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        padding: '9px 14px',
        borderBottom: last ? 'none' : `1px solid ${T.border}`,
      }}>
        <span style={{ color, flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>
          <Icon name={item.kind === 'warn' ? 'alert' : 'bell'} size={13} stroke={1.8} />
        </span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.5, color: T.text }}>
          {item.body}
        </div>
        <span style={{ fontSize: 10.5, color: T.textMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {item.date ? `${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8, 10))}` : ''}
        </span>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg, position: 'relative' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 28px 80px', position: 'relative' }}>

        {/* ─── Welcome strip ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{
              width: 48, height: 48, borderRadius: 14, objectFit: 'cover', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(30,58,138,.28)',
            }} />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg,#3b82f6,#1e3a8a)',
              color: '#fff', fontSize: 18, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(30,58,138,.28)',
            }}>{initial}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 2px', color: T.text }}>
              おかえりなさい、{displayName}さん
            </h1>
            <div style={{ fontSize: 12.5, color: T.textSub, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>{dateLabel}</span>
            </div>
          </div>
        </div>

        {/* ─── オンボーディング (7ステップ) ─── */}
        {!onbDismissed && (
          <div style={{
            background: T.bgCard,
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${T.border}`,
            borderRadius: RADIUS.xl,
            boxShadow: SHADOWS.md,
            overflow: 'hidden',
            marginBottom: 22,
          }}>
            {/* ヘッダ */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 18px',
              background: 'linear-gradient(120deg, rgba(37,99,235,.08), rgba(34,211,238,.06))',
              borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9, background: BRAND_GRADIENT.cta,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 4px 12px rgba(37,99,235,.28)',
              }}>
                <Icon name="rocket" size={17} stroke={1.8} />
              </div>
              <div style={{ minWidth: 0, flexShrink: 0, width: 220 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>AI WorkSpace を使いはじめる</div>
                <div style={{ fontSize: 11.5, color: T.textSub, marginTop: 1 }}>{onbDoneCount} / {ONB_STEPS.length} 完了 · 所要 約 10 分</div>
                <div style={{ height: 5, borderRadius: 99, background: 'rgba(15,23,42,.06)', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(onbDoneCount / ONB_STEPS.length) * 100}%`, background: BRAND_GRADIENT.cta, borderRadius: 99, transition: 'width .3s' }} />
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {onbNextStep && (
                  <button onClick={() => onbStepAction(onbNextStep.key)}
                    style={{ ...btnBrand({ size: 'sm' }), display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                    次は「{onbNextStep.title}」へ <Icon name="arrowRight" size={11} stroke={2} />
                  </button>
                )}
                <button onClick={dismissOnboarding} aria-label="閉じる"
                  style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: GLASS.light, color: T.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="cross" size={12} stroke={2} />
                </button>
              </div>
            </div>

            {/* 7ステップグリッド */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, background: T.border }}>
              {ONB_STEPS.map((s, i) => {
                const done = !!onbDone[s.key]
                const active = !done && onbNextStep && onbNextStep.key === s.key
                return (
                  <div key={s.key} role="button" tabIndex={0}
                    onClick={() => onbStepAction(s.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onbStepAction(s.key) } }}
                    style={{
                      background: active ? T.accentSoft : T.bgCard,
                      padding: '14px 14px 12px', cursor: 'pointer',
                      boxShadow: active ? `inset 0 0 0 1.5px ${T.accent}` : 'none',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: done ? T.success : 'transparent',
                        border: done ? 'none' : `1.5px dashed ${T.borderMid}`,
                        color: '#fff',
                      }}>
                        {done && <Icon name="check" size={12} stroke={2.4} />}
                      </span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                        color: done ? T.success : (active ? T.accentText : T.textMuted),
                      }}>
                        STEP {i + 1}{active ? ' · 今ここ' : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <Icon name={s.icon} size={13} stroke={1.8} style={{ color: T.textSub, flexShrink: 0 }} /> {s.title}
                    </div>
                    <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.55 }}>{s.desc}</div>
                  </div>
                )
              })}
            </div>

            {/* MyCOO ヒント */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              margin: '14px 16px 16px', padding: '12px 14px',
              background: 'linear-gradient(135deg, rgba(37,99,235,.06), rgba(34,211,238,.06))',
              border: '1px solid rgba(37,99,235,.18)', borderRadius: RADIUS.md,
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                background: 'linear-gradient(135deg,#3b82f6,#1e3a8a)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="sparkle" size={14} stroke={1.8} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.accentText, marginBottom: 2 }}>MyCOO からのヒント</div>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: T.text }}>
                  セットアップは今日中に終わらせると、明日の朝からスムーズに使いはじめられます。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Destination grid (2 cards) ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
          <DestCard
            kind="me"
            icon="user"
            title="マイページ"
            desc="今日のタスク・自分の目標・振り返り。業務を一括で見渡せる、毎日の起点になる画面。"
            stats={myStats}
            onClick={() => { try { window.__okrOpenMyDashboard = true } catch {} ; onNavigate('mycoach') }}
          />
          <DestCard
            kind="company"
            icon="chart"
            title="全社サマリー"
            desc="事業部の進捗・KR の達成状況・タスク完了率を一目で。経営層・マネージャー向けのサマリー画面。"
            stats={companyStats}
            onClick={() => onNavigate('mycoach')}
          />
        </div>

        {/* ─── カスタムリンク ─── */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 14px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="link" size={13} style={{ color: T.accent }} /> カスタムリンク
          </h3>
          <span style={{ fontSize: 11.5, color: T.textMuted }}>
            よく使うツール・社内ドキュメント・外部サービスをここに追加できます
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => setShowManage(true)}
              style={{ ...btnGhost({ T, size: 'sm' }), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="settings" size={12} /> 管理
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {customLinks.map(l => {
            const c = linkColorTokens(T, l.color)
            return (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                style={{
                  ...cardStyle({ T, padding: 14 }), borderRadius: RADIUS.md,
                  display: 'flex', alignItems: 'center', gap: 10,
                  textDecoration: 'none', color: 'inherit', cursor: 'pointer',
                }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, background: c.bg, color: c.fg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name="link" size={16} stroke={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                  <div style={{ fontSize: 10.5, color: T.textMuted, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl(l.url)}</div>
                </div>
                <span style={{ color: T.textMuted, flexShrink: 0 }}><Icon name="external" size={11} stroke={1.8} /></span>
              </a>
            )
          })}

          {/* 追加カード (点線) */}
          <button onClick={openAddDialog}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: 14, background: T.sectionBg,
              border: `1.5px dashed ${T.borderMid}`, borderRadius: RADIUS.md,
              color: T.textSub, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            <Icon name="plus" size={13} stroke={2.2} /> リンクを追加
          </button>
        </div>

        {/* ─── 情報グリッド ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
          <InfoCard icon="clock" iconColor={T.accent} title="最近の動き"
            emptyText="最近の動きはありません" isEmpty={recentItems.length === 0}>
            {recentItems.map((item, i) => (
              <ActivityRow key={i} item={item} last={i === recentItems.length - 1} />
            ))}
          </InfoCard>
          <InfoCard icon="bell" iconColor={T.warn} title="お知らせ"
            emptyText="新しいお知らせはありません" isEmpty={notices.length === 0}>
            {notices.map((item, i) => (
              <NoticeRow key={i} item={item} last={i === notices.length - 1} />
            ))}
          </InfoCard>
        </div>
      </div>

      {/* ─── 追加 / 編集モーダル ─── */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
          }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: 'calc(100vw - 40px)',
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
              boxShadow: SHADOWS.xl, overflow: 'hidden',
            }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1, color: T.text }}>
                {editingId ? 'カスタムリンクを編集' : 'カスタムリンクを追加'}
              </h4>
              <button onClick={() => setShowAdd(false)} aria-label="閉じる"
                style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.border}`, background: T.sectionBg, color: T.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cross" size={13} stroke={2} />
              </button>
            </div>

            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, marginBottom: 4, display: 'block' }}>表示名</label>
                <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="例: 経費精算"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: 'inherit', color: T.text, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, marginBottom: 4, display: 'block' }}>URL</label>
                <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: 'inherit', color: T.text, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, marginBottom: 4, display: 'block' }}>アイコン色</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {LINK_COLOR_KEYS.slice(0, 5).map(key => {
                    const c = linkColorTokens(T, key)
                    const active = formColor === key
                    return (
                      <span key={key} onClick={() => setFormColor(key)} role="button" aria-label={key}
                        style={{ width: 24, height: 24, borderRadius: 6, background: c.bg, cursor: 'pointer', border: active ? `2px solid ${c.fg}` : '2px solid transparent' }} />
                    )
                  })}
                </div>
              </div>
              {formError && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: T.dangerSoft, color: T.danger, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="alert" size={14} /> {formError}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: T.sectionBg }}>
              <button onClick={() => setShowAdd(false)} style={btnSecondary({ T, size: 'md' })}>キャンセル</button>
              <button onClick={submitForm} style={btnBrand({ size: 'md' })}>{editingId ? '保存する' : '追加する'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 管理モーダル (編集 / 削除) ─── */}
      {showManage && (
        <div onClick={() => setShowManage(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
          }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: 'calc(100vw - 40px)',
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
              boxShadow: SHADOWS.xl, overflow: 'hidden',
            }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1, color: T.text }}>カスタムリンクを管理</h4>
              <button onClick={() => setShowManage(false)} aria-label="閉じる"
                style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.border}`, background: T.sectionBg, color: T.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cross" size={13} stroke={2} />
              </button>
            </div>
            <div style={{ padding: '8px 0', maxHeight: '60vh', overflowY: 'auto' }}>
              {customLinks.length === 0 ? (
                <div style={{ padding: '24px 18px', textAlign: 'center', color: T.textMuted, fontSize: 12, lineHeight: 1.7 }}>
                  登録済みのリンクはありません。<br />「リンクを追加」から登録してください。
                </div>
              ) : customLinks.map(l => {
                const c = linkColorTokens(T, l.color)
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="link" size={14} stroke={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                      <div style={{ fontSize: 10.5, color: T.textMuted, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl(l.url)}</div>
                    </div>
                    <button onClick={() => openEditDialog(l)} title="編集"
                      style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: T.sectionBg, color: T.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="pencil" size={13} />
                    </button>
                    <button onClick={() => deleteLink(l.id)} title="削除"
                      style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.danger}40`, background: T.sectionBg, color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: T.sectionBg }}>
              <button onClick={() => { setShowManage(false); openAddDialog() }} style={{ ...btnBrand({ size: 'md' }), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="plus" size={13} stroke={2.2} /> リンクを追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

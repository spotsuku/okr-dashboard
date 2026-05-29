'use client'
import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useCurrentOrg } from '../lib/orgContext'
import { COMMON_TOKENS, RADIUS, SPACING, TYPO, SHADOWS, GLASS, TRANSITION } from '../lib/themeTokens'
import { cardStyle, sectionHeaderStyle, btnBrand, btnPrimary, btnSecondary, pillStyle, progressBarStyle, progressFillStyle } from '../lib/iosStyles'
import Icon, { DataIcon } from './Icon'
import { SegmentedControl, EmptyState } from './iosUI'
import MyOKRPageNew from './MyOKRPage'
import MyTasksPage, { TaskCreateModal } from './MyTasksPage'
import { avatarColor } from '../lib/avatarColor'
import QuickTaskPalette from './QuickTaskPalette'
import FocusFillModal from './FocusFillModal'
import IntegrationsPanel from './IntegrationsPanel'
import CalendarTab from './CalendarTab'
import { trackFeature } from '../lib/track'
import DriveTab from './DriveTab'
import COOTab from './COOTab'
import COOKnowledgePanel from './COOKnowledgePanel'
import ConfirmationsTab, { ComposeModal } from './ConfirmationsTab'
import CompanySummaryPage from './CompanySummaryPage'
import CompanyDashboardSummary from './CompanyDashboardSummary'
import CompanyStrategyTab from './CompanyStrategyTab'
import MilestonePage from './MilestonePage'
import { isJpNonBusinessDay } from '../lib/jpHolidays'
import { useFeatureFlags } from '../lib/featureFlags'

// ─── Themes ────────────────────────────────────────────────────────────────
// テーマは lib/themeTokens.js で一元管理。固有フィールドだけここで上書き
const THEMES = {
  dark: {
    ...COMMON_TOKENS.dark,
    navActiveBg: 'rgba(10,132,255,0.18)', navActiveText: '#5EB3FF',
  },
  light: {
    ...COMMON_TOKENS.light,
    navActiveBg: 'rgba(0,122,255,0.12)', navActiveText: '#0062CC',
  },
}

// ─── Date utilities (JST + 04:00 境界) ─────────────────────────────────────
// 今日の4時(JST)以降を"今日"と扱う
function getTodayBoundaryISO() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const year = jst.getUTCFullYear()
  const month = jst.getUTCMonth()
  const day = jst.getUTCDate()
  const jstHour = jst.getUTCHours()
  // 04:00 JST 境界：現在が JST 04:00 未満なら前日の 04:00 JST
  const dayOffset = jstHour < 4 ? -1 : 0
  const boundaryUTC = new Date(Date.UTC(year, month, day + dayOffset, 4 - 9, 0, 0))
  return boundaryUTC.toISOString()
}
function toJSTDateStr(d) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().split('T')[0]
}
// JST基準で「入力日時を含む週の月曜日」のYYYY-MM-DDを返す
function getMondayJSTStr(d = new Date()) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const jstDay = jst.getUTCDay()
  const diff = jstDay === 0 ? -6 : 1 - jstDay
  const mon = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + diff))
  return mon.toISOString().split('T')[0]
}
function jstHHMM(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const h = String(jst.getUTCHours()).padStart(2, '0')
  const m = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}
function parseLogContent(content) {
  if (!content) return {}
  try { return typeof content === 'string' ? JSON.parse(content) : content }
  catch { return { raw: content } }
}

// ─── Mobile breakpoint hook (LINE風 下メニュー用) ───────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < breakpoint
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isMobile
}

// ─── Avatar ────────────────────────────────────────────────────────────────
function Avatar({ member, size = 24 }) {
  const name = member?.name || '?'
  const initial = name.charAt(0)
  const hues = ['#4d9fff','#00d68f','#ffd166','#ff6b6b','#a855f7','#06b6d4','#f97316','#ec4899']
  const bg = hues[(name.charCodeAt(0) || 0) % hues.length]
  if (member?.avatar_url) {
    return <img src={member.avatar_url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 700, flexShrink: 0,
    }}>{initial}</div>
  )
}

// ─── Status badge ──────────────────────────────────────────────────────────
function statusOf(log) {
  if (!log) return 'none'
  const c = parseLogContent(log.content)
  if (c.end_at) return 'off'
  if (c.start_at) return 'on'
  return 'none'
}
function statusDot(status, T) {
  const map = {
    on: { color: T.success, label: '始業済み' },
    off: { color: T.info, label: '終業済み' },
    none: { color: T.textFaint, label: '未始業' },
  }
  const s = map[status] || map.none
  return <span title={s.label} style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0, display: 'inline-block' }} />
}

// 全体サマリーモードでまだ中身が確定していないタブ用のプレースホルダ
function SummaryPlaceholder({ T, title, note }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{
        maxWidth: 420, textAlign: 'center', color: T.textSub,
        padding: '28px 32px', borderRadius: 14,
        border: `1px dashed ${T.borderMid}`, background: T.sectionBg,
      }}>
        <div style={{ marginBottom: SPACING.sm, color: T.textMuted, display: 'flex', justifyContent: 'center' }}><Icon name="tools" size={30} /></div>
        <div style={{ ...TYPO.title3, fontSize: 15, color: T.text, marginBottom: SPACING.xs }}>{title}</div>
        <div style={{ ...TYPO.subhead, color: T.textMuted }}>{note}</div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────
export default function MyPageShell({ user, members, levels, themeKey = 'dark', fiscalYear = '2026', onAIFeedback }) {
  const T = THEMES[themeKey] || THEMES.dark
  const { viewAsMember } = useCurrentOrg()
  const myName = useMemo(() => members?.find(m => m.email === user?.email)?.name || '', [members, user])
  // viewAsMember (管理者のメンバー目線プレビュー) 中は admin 権限を無効化して member の見え方を再現
  const isAdmin = useMemo(() => !viewAsMember && members?.find(m => m.email === user?.email)?.is_admin === true, [members, user, viewAsMember])

  const [viewingName, setViewingName] = useState(myName)
  useEffect(() => { if (myName && !viewingName) setViewingName(myName) }, [myName, viewingName])

  // SupervisorInbox 等から「別メンバーの振り返りに移動」をトリガーされたら viewingName を切替
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e) => {
      const name = e?.detail?.name
      if (name) { setViewingName(name); setSummaryMode(false) }
    }
    window.addEventListener('change-viewing-member', handler)
    // 初回マウント時に URL の ?member= も拾う
    try {
      const url = new URL(window.location.href)
      const m = url.searchParams.get('member')
      if (m) { setViewingName(m); setSummaryMode(false) }
    } catch {}
    return () => window.removeEventListener('change-viewing-member', handler)
  }, [])

  // 全社サマリーモード (個別メンバーの代わりに全社の今日タスクを集約表示)
  // ワークスペース起動時は「自分のマイページ」をデフォルト表示する。
  // 全社サマリーへはサイドバー上部、またはマイページ内のボタンから移動できる。
  const [summaryMode, setSummaryMode] = useState(false)

  const [activeTab, setActiveTab] = useState('dashboard')
  // 利用分析: マイページ内のタブ切替を計測 (どのサブ機能が使われたかを把握)
  useEffect(() => {
    if (!activeTab) return
    trackFeature('mycoach', `tab_${activeTab}`)
  }, [activeTab])
  // MyCOO チャット / ドライブ AI 等の「下部に送信ボタンを持つチャット型タブ」は
  // MyCOO オーブと座標が重なるためオーブを非表示にする
  useEffect(() => {
    const HIDE_ORB_TABS = ['coo', 'drive']
    const hide = HIDE_ORB_TABS.includes(activeTab)
    window.dispatchEvent(new CustomEvent('mycoo:set-orb-visibility', { detail: { hide } }))
    // タブ離脱時は確実に元に戻す
    return () => window.dispatchEvent(new CustomEvent('mycoo:set-orb-visibility', { detail: { hide: false } }))
  }, [activeTab])

  // オンボーディングツアーが「個人ダッシュボードを開く」要求を送ってきたら、
  // 全社サマリー → 自分の個人ダッシュボード (ダッシュボードタブ) へ切替える。
  // これにより 今日やること / Gmail / マイOKR 等のブロックがツアーで表示できる。
  useEffect(() => {
    if (typeof window === 'undefined') return
    const openMine = () => {
      setSummaryMode(false)
      if (myName) setViewingName(myName)
      setActiveTab('dashboard')
    }
    window.addEventListener('okr:open-my-dashboard', openMine)
    // MyPageShell マウント前にツアーが発火していた場合はフラグで拾う
    if (window.__okrOpenMyDashboard) { openMine(); window.__okrOpenMyDashboard = false }
    return () => window.removeEventListener('okr:open-my-dashboard', openMine)
  }, [myName])

  // SaaS 化 Phase C: 組織別 feature flag を取得 (現在の組織で有効なモジュール集合)
  const enabledModules = useFeatureFlags()
  // 全社サマリーと個人モードでタブ構成が違うため、モード切替で隠れるタブに
  // いる場合は dashboard にフォールバック。
  useEffect(() => {
    const summaryOnly = ['strategy', 'milestone', 'team_summary']
    // 個人モードのみのタブ (全社サマリーでは非表示)。連携はタブから外したが
    // ?tab=integrations 等で開いた場合に全社モードへ切替えたら dashboard へ戻す。
    const individualOnly = ['okr_edit', 'calendar', 'drive', 'coo', 'retrospect', 'integrations']
    if (summaryMode && individualOnly.includes(activeTab)) setActiveTab('dashboard')
    if (!summaryMode && summaryOnly.includes(activeTab)) setActiveTab('dashboard')
  }, [summaryMode, activeTab])
  // ぺろっぺ 設定モーダル (admin のみ)
  const [cooSettingsOpen, setCooSettingsOpen] = useState(false)
  // COOタブのチャット状態を親で保持 (タブ移動でアンマウントされても消えないように)
  const [cooChatState, setCooChatState] = useState({
    history: [],
    historyLoaded: false,
    mode: 'coach',
  })
  // 📬 表示対象メンバー宛の未解決「確認事項」件数 (サブタブバッジ + バナー用)
  //   viewingName で絞るため、他メンバーのページを見ても件数が表示される
  const [unresolvedConfirmCount, setUnresolvedConfirmCount] = useState(0)
  useEffect(() => {
    if (!viewingName) return
    let alive = true
    const loadCount = async () => {
      const { count } = await supabase.from('member_confirmations')
        .select('id', { count: 'exact', head: true })
        .eq('to_name', viewingName).eq('status', 'open')
      if (alive) setUnresolvedConfirmCount(count || 0)
    }
    loadCount()
    const ch = supabase.channel('unread_confirm_' + viewingName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_confirmations' }, loadCount)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [viewingName])
  // 外部 (MyCOOオーブのナッジ等) からのタブ切替リクエスト
  useEffect(() => {
    const onSetTab = (e) => {
      const t = e?.detail?.tab
      if (!t) return
      setActiveTab(t)
      setSummaryMode(false)
      setMobileSidebarOpen(false)
    }
    window.addEventListener('mycoach:set-tab', onSetTab)
    return () => window.removeEventListener('mycoach:set-tab', onSetTab)
  }, [])

  // ?tab=xxx クエリで初期タブを切替 (連携依頼 mailto などから飛んでくる)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = new URL(window.location.href).searchParams.get('tab')
    // okr_view は廃止 (詳細はヘッダーのOKRへ) → 互換で okr_edit にマップ
    const normalized = t === 'okr_view' ? 'okr_edit' : t
    if (normalized && ['dashboard', 'confirm', 'wbs', 'okr_edit', 'mail', 'calendar', 'drive', 'coo', 'retrospect', 'integrations'].includes(normalized)) {
      setActiveTab(normalized)
    }
  }, [])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  // 集中記入モーダル (ダッシュボードからも OKR記入タブからも開ける)
  const [focusFillOpen, setFocusFillOpen] = useState(null)  // null | 'kr' | 'ka'
  // AI返信モーダル (ダッシュボードのGmailBox / メールタブ 両方から開く)
  const [aiReplyMail, setAiReplyMail] = useState(null)  // null | { id, threadId, from, fromRaw, subject, snippet, messageIdHeader, ... }

  // メール「✓ 既読」マーク (viewingName ごとに localStorage 永続化)
  const mailReadStorageKey = `mail_read_marks_${viewingName || 'guest'}`
  const [mailReadMarks, setMailReadMarks] = useState(() => new Set())
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(mailReadStorageKey) : null
      setMailReadMarks(raw ? new Set(JSON.parse(raw)) : new Set())
    } catch { setMailReadMarks(new Set()) }
  }, [mailReadStorageKey])
  const markMailAsRead = useCallback((id) => {
    setMailReadMarks(prev => {
      const next = new Set(prev); next.add(id)
      try { window.localStorage.setItem(mailReadStorageKey, JSON.stringify([...next])) } catch {}
      return next
    })
  }, [mailReadStorageKey])
  const unmarkMail = useCallback((id) => {
    setMailReadMarks(prev => {
      const next = new Set(prev); next.delete(id)
      try { window.localStorage.setItem(mailReadStorageKey, JSON.stringify([...next])) } catch {}
      return next
    })
  }, [mailReadStorageKey])

  // 今日の work_log 一覧 (メンバー名 → log)
  const [workLogs, setWorkLogs] = useState({})
  const reloadWorkLogs = useCallback(async () => {
    const boundary = getTodayBoundaryISO()
    const { data, error } = await supabase
      .from('coaching_logs')
      .select('*')
      .eq('log_type', 'work_log')
      .gte('created_at', boundary)
      .order('created_at', { ascending: false })
    if (error) { console.warn('work_log fetch error', error); return }
    const map = {}
    ;(data || []).forEach(row => {
      // 最新のものを優先（orderは降順）
      if (!map[row.owner]) map[row.owner] = row
    })
    setWorkLogs(map)
  }, [])
  useEffect(() => { reloadWorkLogs() }, [reloadWorkLogs])

  const sortedMembers = useMemo(() => {
    const arr = [...(members || [])]
    arr.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || (a.name || '').localeCompare(b.name || ''))
    return arr
  }, [members])

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return sortedMembers
    const q = memberSearch.toLowerCase()
    return sortedMembers.filter(m => (m.name || '').toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q))
  }, [sortedMembers, memberSearch])

  const isViewingSelf = viewingName === myName
  const viewingMember = useMemo(() => members?.find(m => m.name === viewingName), [members, viewingName])

  // スマホ (LINE風 下メニュー) 対応
  const isMobile = useIsMobile()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  // モバイルでは折りたたみ(52px化)は使わず常に展開。閉じるはドロワーのclose扱い。
  const collapsed = isMobile ? false : sidebarCollapsed

  // 下メニュー項目 (モバイル時のみ表示)
  const MOBILE_NAV = [
    { key: 'dashboard',  icon: 'user',     label: 'マイページ' },
    { key: 'wbs',        icon: 'check',    label: 'タスク' },
    { key: 'mail',       icon: 'mail',     label: 'メール' },
    { key: 'calendar',   icon: 'calendar', label: 'カレンダー' },
    { key: 'retrospect', icon: 'refresh',  label: '振り返り' },
  ]
  // サイドバードロワー下部の「その他」メニュー
  // マイページのヘッダー(サブタブ)の全項目を網羅し、ドロワーから全機能へ遷移できるようにする
  const SIDEBAR_OTHER = [
    { key: 'dashboard',    icon: 'chart',    label: 'ダッシュボード' },
    { key: 'wbs',          icon: 'check',    label: 'タスク' },
    { key: 'mail',         icon: 'mail',     label: 'メール',     requiresFlag: 'google_integration' },
    { key: 'okr_edit',     icon: 'target',   label: 'OKR' },
    { key: 'retrospect',   icon: 'refresh',  label: '振り返り' },
    { key: 'calendar',     icon: 'calendar', label: 'カレンダー', requiresFlag: 'google_integration' },
    { key: 'drive',        icon: 'drive',    label: 'ドライブ',   requiresFlag: 'google_integration' },
    { key: 'coo',          icon: 'ai',       label: 'MyCOO',      requiresFlag: 'coo_knowledge' },
    { key: 'confirm',      icon: 'bell',     label: '共有・確認' },
    { key: 'integrations', icon: 'link',     label: '連携' },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.bg, minHeight: 0, position: 'relative' }}>
      {/* スマホ: サイドバーを隠し、ドロワーとして表示 */}
      {isMobile && mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40,
          }}
        />
      )}

      {/* ─── 左サイドバー：メンバー一覧 ─── */}
      <div style={{
        width: isMobile ? 240 : (collapsed ? 52 : 220),
        background: T.bgSidebar,
        borderRight: `1px solid ${T.border}`,
        display: isMobile && !mobileSidebarOpen ? 'none' : 'flex',
        flexDirection: 'column',
        flexShrink: 0, transition: 'width 0.18s ease',
        ...(isMobile ? {
          position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50,
          boxShadow: SHADOWS.lg,
        } : {}),
      }}>
        {/* サイドバーヘッダー */}
        <div style={{
          padding: collapsed ? '10px 8px' : '10px 12px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        }}>
          {!collapsed && (
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5 }}>
              メンバー ({filteredMembers.length})
            </div>
          )}
          <button
            onClick={() => isMobile ? setMobileSidebarOpen(false) : setSidebarCollapsed(v => !v)}
            title={isMobile ? '閉じる' : (collapsed ? '展開' : '折り畳む')}
            style={{
              background: 'transparent', border: `1px solid ${T.border}`, color: T.textSub,
              padding: '3px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            }}
          >{isMobile ? <Icon name="cross" size={11} /> : (collapsed ? '»' : '«')}</button>
        </div>

        {/* プロダクトの本当のホーム (全社ポータル) への導線 — サイドバー最上部 */}
        {!collapsed && (
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}` }}>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('okr:goto', { detail: { page: 'portal' } }))
                if (isMobile) setMobileSidebarOpen(false)
              }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                background: T.accentBg || T.sectionBg, color: T.accent || T.text,
                border: `1px solid ${T.border}`, fontSize: 12.5, fontWeight: 700,
              }}
            >
              <Icon name="home" size={15} /> ホーム
              <span style={{ marginLeft: 'auto', color: T.textMuted, fontSize: 10, fontWeight: 500 }}>全社トップ</span>
            </button>
          </div>
        )}

        {/* 検索 */}
        {!collapsed && (
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}` }}>
            <input
              type="text"
              placeholder="名前で検索"
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              style={{
                width: '100%', background: T.bgCard, border: `1px solid ${T.borderMid}`,
                borderRadius: 6, padding: '5px 8px', color: T.text, fontSize: 11,
                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* メンバー一覧（内部スクロール） */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {/* ▼ 全社サマリー (メンバー一覧の上) */}
          {!collapsed && (
            <button
              onClick={() => { setSummaryMode(true); if (isMobile) setMobileSidebarOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 12px',
                background: summaryMode ? T.navActiveBg : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${summaryMode ? T.accent : 'transparent'}`,
                borderBottom: `1px solid ${T.border}`,
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: summaryMode ? T.accent : T.sectionBg,
                color: summaryMode ? '#fff' : T.textSub,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}><Icon name="chart" size={14} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700,
                  color: summaryMode ? T.navActiveText : T.text,
                }}>
                  全社サマリー
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                  みんなの今日のタスク
                </div>
              </div>
            </button>
          )}
          {collapsed && (
            <button
              onClick={() => { setSummaryMode(true); if (isMobile) setMobileSidebarOpen(false) }}
              title="全社サマリー"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', padding: '9px 0',
                background: summaryMode ? T.navActiveBg : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${summaryMode ? T.accent : 'transparent'}`,
                borderBottom: `1px solid ${T.border}`,
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: summaryMode ? T.accent : T.sectionBg,
                color: summaryMode ? '#fff' : T.textSub,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14,
              }}><Icon name="chart" size={15} /></div>
            </button>
          )}

          {filteredMembers.map(m => {
            const log = workLogs[m.name]
            const st = statusOf(log)
            const content = parseLogContent(log?.content)
            const isSelected = !summaryMode && m.name === viewingName
            const isMe = m.name === myName
            if (collapsed) {
              return (
                <button
                  key={m.id}
                  onClick={() => { setViewingName(m.name); setSummaryMode(false); if (isMobile) setMobileSidebarOpen(false) }}
                  title={m.name}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', padding: '6px 0', background: isSelected ? T.navActiveBg : 'transparent',
                    border: 'none', borderLeft: `3px solid ${isSelected ? T.accent : 'transparent'}`,
                    cursor: 'pointer', position: 'relative',
                  }}
                >
                  <Avatar member={m} size={28} />
                  <span style={{ position: 'absolute', bottom: 4, right: 8 }}>{statusDot(st, T)}</span>
                </button>
              )
            }
            return (
              <button
                key={m.id}
                onClick={() => { setViewingName(m.name); setSummaryMode(false); if (isMobile) setMobileSidebarOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '7px 12px', background: isSelected ? T.navActiveBg : 'transparent',
                  border: 'none', borderLeft: `3px solid ${isSelected ? T.accent : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <Avatar member={m} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: isSelected ? 700 : 600,
                    color: isSelected ? T.navActiveText : T.text,
                  }}>
                    {statusDot(st, T)}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.name}{isMe && <span style={{ color: T.accent, marginLeft: 4, fontSize: 10 }}>(自分)</span>}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                    {st === 'on' && content.start_at ? `${jstHHMM(content.start_at)}〜` :
                     st === 'off' && content.start_at && content.end_at ? `${jstHHMM(content.start_at)}–${jstHHMM(content.end_at)}` :
                     m.role || ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* サイドバー下部: その他メニュー (モバイル時のみ、下メニュー外のタブへアクセス) */}
        {isMobile && !collapsed && (
          <div style={{
            borderTop: `1px solid ${T.border}`,
            padding: '8px 0',
            background: T.bgSidebar,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: T.textMuted,
              letterSpacing: 0.5, padding: '4px 12px', marginBottom: 2,
            }}>その他</div>
            {SIDEBAR_OTHER
              .filter(item => !item.requiresFlag || enabledModules?.[item.requiresFlag])
              // モバイルでは下フッターと重複する項目をサイドから除外
              .filter(item => !isMobile || !MOBILE_NAV.some(m => m.key === item.key))
              .map(item => {
              const isActive = !summaryMode && activeTab === item.key
              const showBadge = item.key === 'confirm' && unresolvedConfirmCount > 0
              return (
                <button
                  key={item.key}
                  onClick={() => { setActiveTab(item.key); setSummaryMode(false); setMobileSidebarOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '10px 14px',
                    background: isActive ? T.navActiveBg : 'transparent',
                    border: 'none',
                    borderLeft: `3px solid ${isActive ? T.accent : 'transparent'}`,
                    color: isActive ? T.navActiveText : T.text,
                    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'inline-flex', width: 16 }}><Icon name={item.icon} size={16} /></span>
                  <span>{item.label}</span>
                  {showBadge && (
                    <span style={{
                      marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px',
                      borderRadius: 99, background: T.danger, color: '#fff',
                      fontSize: 10, fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{unresolvedConfirmCount}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* サイドバー最下部: アカウント (モバイルはログアウト導線がここだけ) */}
        {isMobile && !collapsed && (
          <div style={{
            borderTop: `1px solid ${T.border}`,
            padding: '10px 12px 14px',
            background: T.bgSidebar,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: T.textMuted,
              letterSpacing: 0.5, padding: '0 2px 6px',
            }}>アカウント</div>
            {user?.email && (
              <div style={{
                fontSize: 11, color: T.textSub, padding: '0 2px 8px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{user.email}</div>
            )}
            {/* ツアー再生 (スマホはここからアクセス、デスクトップは右上ユーザーメニュー) */}
            <button
              onClick={() => {
                setMobileSidebarOpen(false)
                window.dispatchEvent(new CustomEvent('okr:start-tour'))
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 8,
                background: 'transparent', border: `1px solid ${T.border}`,
                color: T.text, fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ display: 'inline-flex', width: 16 }}><Icon name="sparkle" size={16} /></span>
              <span>ツアーをもう一度見る</span>
            </button>
            <button
              onClick={async () => {
                try { await supabase.auth.signOut() } catch {}
                window.location.href = '/'
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '9px 12px', borderRadius: 8,
                background: 'transparent', border: `1px solid ${T.border}`,
                color: T.danger, fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ display: 'inline-flex', width: 16 }}><Icon name="logout" size={16} /></span>
              <span>ログアウト</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── メインエリア ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, paddingBottom: isMobile ? 60 : 0 }}>
        {/* スマホ: トップバー (ハンバーガー + タブ横スクロール) */}
        {isMobile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 10px', borderBottom: `1px solid ${T.border}`,
            background: T.bgCard, flexShrink: 0,
          }}>
            <button
              onClick={() => setMobileSidebarOpen(true)}
              data-tour="mobile-sidebar-btn"
              style={{
                padding: '6px 10px', borderRadius: 7,
                background: 'transparent', border: `1px solid ${T.border}`,
                color: T.text, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
              }}
              title="メンバー一覧"
            ><Icon name="workspace" size={16} /></button>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: T.text, flex: 1, overflow: 'hidden',
            }}>
              <Avatar member={viewingMember} size={24} />
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {viewingName || '(未選択)'}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                background: isViewingSelf ? T.accentBg : T.sectionBg,
                color: isViewingSelf ? T.accent : T.textMuted, fontWeight: 700,
              }}>{isViewingSelf ? '編集可' : '閲覧のみ'}</span>
            </div>
          </div>
        )}

        {/* サブタブバー (iOS 風セグメンテッドコントロール: グレー背景 + 白ピル状アクティブ) */}
        <div style={{
          display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 8,
          padding: '10px 20px',
          borderBottom: `1px solid ${T.border}`,
          background: 'rgba(255,255,255,0.65)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          flexShrink: 0, overflowX: 'auto',
        }}>
          <div style={{
            display: 'inline-flex', gap: 2,
            background: 'rgba(120,120,128,0.10)',
            padding: 3, borderRadius: 11,
          }}>
          {(() => {
            // タブ構成はモードで異なる:
            //   [全社サマリー] 全社グループ(ダッシュボード/経営戦略/マイルストーン)
            //                  + チーム機能グループ(チームサマリー/共有・確認/タスク/メール)
            //   [個人(マイページ)] 個人グループ(ダッシュボード/タスク/メール/OKR/振り返り
            //                      /カレンダー/ドライブ/MyCOO) + チーム機能グループ(共有・確認)
            // 連携は一度きりの設定のためタブには出さない (?tab=integrations や設定から到達)。
            // OKR はヘッダーナビにもあるが、個人モードでは編集導線として残す。
            // requiresFlag は currentOrg.enabled_modules[flag] が true のときだけ表示。
            const META = {
              dashboard:    { icon: 'chart',    label: 'ダッシュボード' },
              strategy:     { icon: 'cmd',      label: '経営戦略' },
              milestone:    { icon: 'flag',     label: 'マイルストーン' },
              team_summary: { icon: 'note',     label: 'チームサマリー' },
              confirm:      { icon: 'bell',     label: '共有・確認' },
              wbs:          { icon: 'calendar', label: 'タスク' },
              mail:         { icon: 'mail',     label: 'メール', requiresFlag: 'google_integration' },
              okr_edit:     { icon: 'target',   label: 'OKR' },
              retrospect:   { icon: 'msg',      label: '振り返り' },
              calendar:     { icon: 'calendar', label: 'カレンダー', requiresFlag: 'google_integration' },
              drive:        { icon: 'drive',    label: 'ドライブ',   requiresFlag: 'google_integration' },
              coo:          { icon: 'ai',       label: 'MyCOO',     requiresFlag: 'coo_knowledge' },
            }
            const summaryOrder = [
              { key: 'dashboard',    group: 'company' },
              { key: 'strategy',     group: 'company' },
              { key: 'milestone',    group: 'company' },
              { key: 'team_summary', group: 'team' },
              { key: 'confirm',      group: 'team' },
              { key: 'wbs',          group: 'team' },
              { key: 'mail',         group: 'team' },
            ]
            const individualOrder = [
              { key: 'dashboard',  group: 'main' },
              { key: 'wbs',        group: 'main' },
              { key: 'mail',       group: 'main' },
              { key: 'okr_edit',   group: 'main' },
              { key: 'retrospect', group: 'main' },
              { key: 'calendar',   group: 'main' },
              { key: 'drive',      group: 'main' },
              { key: 'coo',        group: 'main' },
              { key: 'confirm',    group: 'team' },
            ]
            return (summaryMode ? summaryOrder : individualOrder)
              .map(t => ({ ...t, ...META[t.key] }))
              .filter(t => !t.requiresFlag || enabledModules?.[t.requiresFlag])
          })().map((t, idx, arr) => {
            const showBadge = t.key === 'confirm' && !summaryMode && unresolvedConfirmCount > 0
            const active = activeTab === t.key
            // チーム機能グループの先頭で区切り + 「チーム機能（オプション）」ラベルを挿入 (両モード)
            const showGroupLabel = t.group === 'team' && (idx === 0 || arr[idx - 1]?.group !== 'team')
            return (
              <Fragment key={t.key}>
                {showGroupLabel && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    margin: '0 4px', paddingLeft: 8,
                    borderLeft: `1px solid ${T.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted }}>チーム機能</span>
                    <span style={{
                      padding: '1px 7px', borderRadius: 99,
                      background: T.sectionBg, color: T.textMuted,
                      border: `1px solid ${T.border}`,
                      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.03em',
                    }}>オプション</span>
                  </div>
                )}
                <button
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: active ? T.bgCard : 'transparent',
                    color: active ? T.text : T.textSub,
                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name={t.icon} size={14} /></span>
                  <span>{t.label}</span>
                  {showBadge && (
                    <span style={{
                      padding: '1px 6px', borderRadius: 99,
                      background: T.danger, color: '#fff',
                      fontSize: 10, fontWeight: 800, minWidth: 16, textAlign: 'center',
                      lineHeight: 1.4,
                    }}>{unresolvedConfirmCount}</span>
                  )}
                </button>
              </Fragment>
            )
          })}
          </div>
          <div style={{ flex: 1 }} />
          {!isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, color: T.textMuted, padding: '6px 12px',
              background: T.sectionBg, borderRadius: 99,
              border: `1px solid ${T.border}`,
            }}>
              <Avatar member={viewingMember} size={20} />
              <span style={{ fontWeight: 700, color: T.text }}>{viewingName || '(未選択)'}</span>
              <span style={{
                color: isViewingSelf ? T.success : T.textMuted, fontWeight: 700,
                padding: '2px 8px', borderRadius: 99,
                background: isViewingSelf ? T.successBg : 'transparent',
              }}>
                {isViewingSelf ? <><Icon name="pencil" size={11} /> 編集可</> : <><Icon name="eye" size={11} /> 閲覧のみ</>}
              </span>
            </div>
          )}
        </div>

        {/* タブコンテンツ
            summaryMode (全体サマリー) / 個別メンバーモード でコンテンツを切替。
            メール/カレンダー/ドライブ/MyCOO/振り返り/連携 は個人用途のため
            summaryMode でも既存挙動のまま (viewingName は myName をデフォルト) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
          {activeTab === 'dashboard' && (
            summaryMode ? (
              <CompanyDashboardSummary
                T={T} themeKey={themeKey}
                levels={levels} members={members}
                fiscalYear={fiscalYear}
                myName={myName} isAdmin={isAdmin}
                onGoToMyPage={() => { setViewingName(myName); setSummaryMode(false) }}
              />
            ) : (
              <DashboardTab
                T={T} themeKey={themeKey}
                viewingName={viewingName} viewingMember={viewingMember}
                isViewingSelf={isViewingSelf} myName={myName}
                members={members}
                levels={levels}
                isAdmin={isAdmin}
                fiscalYear={fiscalYear}
                workLog={workLogs[viewingName]}
                onWorkLogChange={reloadWorkLogs}
                onGoToTab={(key) => setActiveTab(key)}
                onGoToSummary={() => setActiveTab('team_summary')}
                onGoToCompanySummary={() => { setSummaryMode(true); if (myName) setViewingName(myName) }}
                onOpenFocusFill={(mode) => setFocusFillOpen(mode || 'kr')}
                onOpenAIReply={(mail) => setAiReplyMail(mail)}
                mailReadMarks={mailReadMarks}
                onMarkMailRead={markMailAsRead}
              />
            )
          )}
          {activeTab === 'confirm' && (
            summaryMode ? (
              <ConfirmationsTab T={T} myName={myName} members={members} companyWide />
            ) : (
              <ConfirmationsTab T={T} myName={myName} members={members} viewingName={viewingName} />
            )
          )}
          {activeTab === 'wbs' && (
            summaryMode ? (
              <CompanyTasksView T={T} members={members} themeKey={themeKey} user={user} fiscalYear={fiscalYear} />
            ) : (
              <MyTasksPage
                user={isViewingSelf ? user : { ...user, email: viewingMember?.email || user?.email }}
                members={members}
                themeKey={themeKey}
                lockViewMode="my"
                fiscalYear={fiscalYear}
              />
            )
          )}
          {activeTab === 'okr_edit' && (
            summaryMode ? (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <CompanySummaryPage
                  levels={levels}
                  members={members}
                  themeKey={themeKey}
                  fiscalYear={fiscalYear}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* 記入モード / 一覧モード トグル */}
                <div style={{
                  display: 'flex', gap: 6, padding: '8px 16px',
                  borderBottom: `1px solid ${T.border}`, background: T.sectionBg,
                  flexShrink: 0, alignItems: 'center',
                }}>
                  <div style={{ fontSize: 11, color: T.textMuted, marginRight: 4 }}>入力スタイル:</div>
                  <button onClick={() => setFocusFillOpen('kr')} style={{
                    padding: '5px 12px', borderRadius: 7, border: 'none',
                    background: T.info, color: '#fff',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}><Icon name="pencil" size={12} /> KR記入モード</button>
                  <button onClick={() => setFocusFillOpen('ka')} style={{
                    padding: '5px 12px', borderRadius: 7, border: 'none',
                    background: T.success, color: '#fff',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}><Icon name="pencil" size={12} /> KA記入モード</button>
                  <div style={{
                    padding: '5px 12px', borderRadius: 7,
                    background: T.navActiveBg, color: T.navActiveText,
                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}><Icon name="workspace" size={12} /> 一覧モード（表示中）</div>
                </div>
                <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                  <MyOKRPageNew
                    user={isViewingSelf ? user : { ...user, email: viewingMember?.email || user?.email }}
                    levels={levels}
                    members={members}
                    themeKey={themeKey}
                    fiscalYear={fiscalYear}
                    onAIFeedback={onAIFeedback}
                  />
                </div>
              </div>
            )
          )}
          {activeTab === 'mail' && (
            summaryMode ? (
              <CompanyMailTab T={T} members={members} />
            ) : (
              <MailTab
                T={T} viewingName={viewingName} isViewingSelf={isViewingSelf}
                onGoToTab={(key) => setActiveTab(key)}
                onOpenAIReply={(mail) => setAiReplyMail(mail)}
                readMarks={mailReadMarks}
                onMarkRead={markMailAsRead}
                onUnmarkRead={unmarkMail}
              />
            )
          )}
          {activeTab === 'calendar' && (
            <CalendarTab T={T} myName={myName} members={members} viewingName={viewingName} />
          )}
          {activeTab === 'drive' && (
            <DriveTab T={T} myName={myName} viewingName={viewingName} />
          )}
          {activeTab === 'coo' && (
            <COOTab T={T} myName={myName} viewingName={viewingName}
              isAdmin={isAdmin} onOpenSettings={() => setCooSettingsOpen(true)}
              chatState={cooChatState} setChatState={setCooChatState} />
          )}
          {activeTab === 'retrospect' && (
            <RetrospectTab T={T} viewingName={viewingName} viewingMember={viewingMember} myName={myName} isAdmin={isAdmin} members={members} />
          )}
          {activeTab === 'strategy' && (
            <CompanyStrategyTab T={T} levels={levels} members={members} fiscalYear={fiscalYear} />
          )}
          {activeTab === 'team_summary' && (
            <CompanyDashboardSummary
              T={T} themeKey={themeKey}
              levels={levels} members={members}
              fiscalYear={fiscalYear}
              myName={myName} isAdmin={isAdmin}
              teamSummaryOnly
            />
          )}
          {activeTab === 'milestone' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <MilestonePage levels={levels} themeKey={themeKey} fiscalYear={fiscalYear} user={user} members={members} onLevelsChanged={() => {}} />
            </div>
          )}
          {activeTab === 'integrations' && (
            <IntegrationsPanel T={T} myName={myName} isViewingSelf={isViewingSelf} />
          )}
        </div>

        {/* ぺろっぺ設定モーダル (admin) */}
        {cooSettingsOpen && (
          <COOKnowledgePanel T={T} owner={myName} onClose={() => setCooSettingsOpen(false)} />
        )}

        {/* 集中記入モーダル (OKR記入タブ/ダッシュボードから共通で使用) */}
        {focusFillOpen && (
          <FocusFillModal
            open={!!focusFillOpen}
            onClose={() => setFocusFillOpen(null)}
            T={T}
            viewingName={viewingName}
            myName={myName}
            isAdmin={isAdmin}
            initialMode={focusFillOpen}
            levels={levels}
          />
        )}

        {/* AI返信モーダル (ダッシュボードGmailBox / メールタブから共通で使用) */}
        {aiReplyMail && (
          <GmailAIModal
            open={!!aiReplyMail}
            onClose={() => setAiReplyMail(null)}
            mail={aiReplyMail}
            owner={viewingName}
            T={T}
          />
        )}

        {/* スマホ: 下メニュー (LINE風) */}
        {isMobile && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            height: 60, background: T.bgCard,
            borderTop: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
            zIndex: 30, boxShadow: '0 -4px 18px rgba(0,0,0,0.18)',
          }}>
            {MOBILE_NAV.map(item => {
              // 全社サマリー表示中は個人タブ(マイページ等)をアクティブにしない。
              // (summaryMode は実体が dashboard タブなので、そのままだと「マイページ」が
              //  点灯し“マイページにいる”ように見えてしまう)
              const active = !summaryMode && activeTab === item.key
              return (
                <button
                  key={item.key}
                  data-tour={`mobile-nav-${item.key}`}
                  onClick={() => { setActiveTab(item.key); setSummaryMode(false) }}
                  style={{
                    flex: 1, background: 'transparent', border: 'none',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                    color: active ? T.accent : T.textMuted,
                    cursor: 'pointer', fontFamily: 'inherit',
                    borderTop: `2px solid ${active ? T.accent : 'transparent'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}><Icon name={item.icon} size={22} /></div>
                  <div style={{ fontSize: 10, fontWeight: 700 }}>{item.label}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ダッシュボードタブ（3カラム骨組み） ───────────────────────────────────
function DashboardTab({ T, viewingName, viewingMember, isViewingSelf, myName, members, levels = [], isAdmin = false, workLog, onWorkLogChange, onGoToTab, onGoToSummary, onGoToCompanySummary, onOpenFocusFill, onOpenAIReply, mailReadMarks, onMarkMailRead, fiscalYear = '2026' }) {
  const isMobile = useIsMobile()
  const { currentOrg } = useCurrentOrg()  // 始業/終業・KPT 保存時に「今表示中の組織」を明示付与する
  const content = parseLogContent(workLog?.content)
  const st = statusOf(workLog)

  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const greet = jst.getUTCHours() < 11 ? 'おはようございます' : jst.getUTCHours() < 18 ? 'こんにちは' : 'こんばんは'
  const dateStr = `${jst.getUTCMonth()+1}/${jst.getUTCDate()}(${['日','月','火','水','木','金','土'][jst.getUTCDay()]})`

  // 営業日判定 (土日 + 日本の祝日を除外)
  // 月曜でも祝日 (例: 振替休日・GW中の祝日) なら false になる
  // toJSTDateStr は内部で +9h するので、元の now を渡す (jst は既に +9h されているため二重加算回避)
  const jstDateStr = toJSTDateStr(now)
  const isWeekday = !isJpNonBusinessDay(jstDateStr)

  const [busy, setBusy] = useState(false)
  const [kptOpen, setKptOpen] = useState(false)
  // 朝の「今日やること」モーダル
  const [morningOpen, setMorningOpen] = useState(false)
  // 昨日未終業の log (null=未取得, false=なし, {}=あり)
  const [pendingYesterdayLog, setPendingYesterdayLog] = useState(null)

  // 昨日未終業の work_log を検出 (自分閲覧 & 平日 & 今日未始業 の時のみ)
  // 月曜の場合は週末ログを飛ばして金曜分まで遡るため、最新N件取得して平日のみ抽出する
  useEffect(() => {
    if (!isViewingSelf || !myName || !isWeekday || st !== 'none') {
      setPendingYesterdayLog(false)
      return
    }
    let alive = true
    ;(async () => {
      const boundary = getTodayBoundaryISO()
      const { data } = await supabase
        .from('coaching_logs')
        .select('*')
        .eq('owner', myName)
        .eq('log_type', 'work_log')
        .lt('created_at', boundary)
        .order('created_at', { ascending: false })
        .limit(10)
      if (!alive) return
      // 平日 (月〜金 JST) かつ祝日でない最新ログを採用 (土日 + 日本の祝日は始業ゲートで無視)
      const weekdayRow = (data || []).find(row => {
        const j = new Date(new Date(row.created_at).getTime() + 9 * 3600 * 1000)
        const dStr = `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2,'0')}-${String(j.getUTCDate()).padStart(2,'0')}`
        // isJpNonBusinessDay は土日 + 祝日両方を true で返す
        return !isJpNonBusinessDay(dStr)
      })
      if (!weekdayRow) { setPendingYesterdayLog(false); return }
      const c = parseLogContent(weekdayRow.content)
      if (c.start_at && !c.end_at) {
        setPendingYesterdayLog(weekdayRow)
      } else {
        setPendingYesterdayLog(false)
      }
    })()
    return () => { alive = false }
  }, [isViewingSelf, myName, isWeekday, st])

  // 昨日ログ日付文字列
  const yesterdayDateStr = (() => {
    if (!pendingYesterdayLog) return ''
    const yj = new Date(new Date(pendingYesterdayLog.created_at).getTime() + 9 * 3600 * 1000)
    return `${yj.getUTCMonth() + 1}/${yj.getUTCDate()}(${['日','月','火','水','木','金','土'][yj.getUTCDay()]})`
  })()

  // 昨日ログを強制終業
  async function forceCloseYesterday({ keep, problem, tryNote, endTimeHHMM, reflectionDate }) {
    if (!pendingYesterdayLog) return
    setBusy(true)
    const createdJST = new Date(new Date(pendingYesterdayLog.created_at).getTime() + 9 * 3600 * 1000)
    const [hh, mm] = (endTimeHHMM || '18:00').split(':').map(Number)
    // 勤怠(出勤記録)は対象の未終業ログの日付で締める
    const endUtc = new Date(Date.UTC(
      createdJST.getUTCFullYear(), createdJST.getUTCMonth(), createdJST.getUTCDate(),
      hh - 9, mm, 0
    ))
    const oldContent = parseLogContent(pendingYesterdayLog.content)
    const newContent = { ...oldContent, end_at: endUtc.toISOString(), force_closed: true }
    const { error: e1 } = await supabase.from('coaching_logs')
      .update({ content: JSON.stringify(newContent) }).eq('id', pendingYesterdayLog.id)
    if (e1) { setBusy(false); alert('終業記録に失敗しました: ' + e1.message); return }
    if ((keep||'').trim() || (problem||'').trim() || (tryNote||'').trim()) {
      // 振り返り(KPT)は本人が選んだ「対象日」で保存する (既定=未終業ログの勤務日)。
      // どの日の振り返りかを本人に選ばせ、朝会での認知齟齬(火曜に金曜が出る等)を防ぐ。
      const baseISO = reflectionDate ||
        `${createdJST.getUTCFullYear()}-${String(createdJST.getUTCMonth()+1).padStart(2,'0')}-${String(createdJST.getUTCDate()).padStart(2,'0')}`
      const [ry, rmo, rd] = baseISO.split('-').map(Number)
      const kptUtc = new Date(Date.UTC(ry, rmo - 1, rd, hh - 9, mm, 0))
      const { error: e2 } = await supabase.from('coaching_logs').insert({
        owner: myName, log_type: 'kpt',
        organization_id: currentOrg?.id,
        week_start: getMondayJSTStr(kptUtc),
        created_at: kptUtc.toISOString(),
        content: JSON.stringify({ keep, problem, try: tryNote }),
      })
      if (e2) { setBusy(false); alert('振り返り(KPT)の保存に失敗しました: ' + e2.message); return }
    }
    setBusy(false)
    setPendingYesterdayLog(false)
    await onWorkLogChange()
  }

  // ─── リマインダー用データ ──────────────────────────
  const [reminders, setReminders] = useState({
    missingKRs: [], missingKAs: [],
    overdueTasks: [], todayTasks: [], tomorrowTasks: [],
    loading: true,
  })

  const loadReminders = useCallback(async () => {
    if (!viewingName) { setReminders(r => ({ ...r, loading: false })); return }
    setReminders(r => ({ ...r, loading: true }))

    const thisMonday = getMondayJSTStr()
    const today = toJSTDateStr(new Date())
    const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1)
    const tomorrow = toJSTDateStr(tomorrowDate)

    const [krsRes, krReviewsRes, kasRes, tasksRes] = await Promise.all([
      supabase.from('key_results').select('id, title, owner').eq('owner', viewingName),
      supabase.from('kr_weekly_reviews').select('*').eq('week_start', thisMonday),
      supabase.from('weekly_reports').select('*').eq('owner', viewingName).eq('week_start', thisMonday),
      supabase.from('ka_tasks').select('*').eq('assignee', viewingName).neq('status', 'done').lte('due_date', tomorrow),
    ])

    const krs = krsRes.data || []
    const krReviewsMap = Object.fromEntries((krReviewsRes.data || []).map(r => [r.kr_id, r]))
    const missingKRs = krs.filter(kr => {
      const r = krReviewsMap[kr.id]
      if (!r) return true
      return !((r.good||'').trim() || (r.more||'').trim() || (r.focus_output||'').trim() || (r.focus||'').trim())
    })

    const kas = kasRes.data || []
    const missingKAs = kas.filter(ka =>
      !((ka.good||'').trim() || (ka.more||'').trim() || (ka.focus_output||'').trim())
    )

    const tasks = (tasksRes.data || []).filter(t => t.due_date)
    const overdueTasks = tasks.filter(t => t.due_date < today)
    const todayTasks   = tasks.filter(t => t.due_date === today)
    const tomorrowTasks= tasks.filter(t => t.due_date === tomorrow)

    setReminders({ missingKRs, missingKAs, overdueTasks, todayTasks, tomorrowTasks, loading: false })
  }, [viewingName])

  useEffect(() => { loadReminders() }, [loadReminders, workLog?.id])

  // ─── Phase 5: 今日/今週やること ─────────────────────
  const [taskBoard, setTaskBoard] = useState({
    today: [], byWeekday: { 1:[],2:[],3:[],4:[],5:[],6:[],0:[] },
    loading: true,
  })
  const loadTasks = useCallback(async () => {
    if (!viewingName) { setTaskBoard(b => ({ ...b, loading: false })); return }
    setTaskBoard(b => ({ ...b, loading: true }))

    const today = toJSTDateStr(new Date())
    const monday = getMondayJSTStr()
    const sundayD = new Date(monday + 'T00:00:00Z'); sundayD.setUTCDate(sundayD.getUTCDate() + 6)
    const sunday = sundayD.toISOString().split('T')[0]

    // 自分担当の未完了タスクを全件取得。
    // email を持つタスクは email で本人特定 (canonical)。
    // email 未設定タスクのみ表示名でフォールバック (移行期)。
    const sel = '*, weekly_reports(kr_title, ka_title, owner)'
    const byNameRes = await supabase
      .from('ka_tasks').select(sel)
      .eq('assignee', viewingName)
      .order('due_date', { ascending: true, nullsFirst: false })
    // assignee_email が入っているタスクは email 側で拾うので、ここでは未設定分のみ採用
    let rows = (byNameRes.data || []).filter(t => !t.assignee_email)
    const viewingEmail = (members?.find(m => m.name === viewingName)?.email || '').toLowerCase()
    if (viewingEmail) {
      // assignee_email 列が無い環境ではエラーになるので無視 (名前一致のみで動作)
      const byEmailRes = await supabase.from('ka_tasks').select(sel).eq('assignee_email', viewingEmail)
      if (!byEmailRes.error && byEmailRes.data) {
        const seen = new Set(rows.map(t => t.id))
        rows = [...rows, ...byEmailRes.data.filter(t => !seen.has(t.id))]
      }
    }
    const data = rows

    const undone = (data || []).filter(t => t.status !== 'done' && !t.done)

    // 今日やること: 期限超過 OR 今日期限 OR 進行中(期限未設定)
    const todayList = undone.filter(t =>
      (t.due_date && t.due_date <= today) ||
      (!t.due_date && t.status === 'in_progress')
    )

    // 今週やること: 月〜日の範囲にある未完了タスクを曜日別
    const byWeekday = { 1:[],2:[],3:[],4:[],5:[],6:[],0:[] }
    undone.filter(t => t.due_date && t.due_date >= monday && t.due_date <= sunday)
      .forEach(t => {
        const d = new Date(t.due_date + 'T00:00:00Z')
        byWeekday[d.getUTCDay()].push(t)
      })

    setTaskBoard({ today: todayList, byWeekday, loading: false })
  }, [viewingName])
  // workLog の id が変わる (始業/終業) たびにタスク・リマインダー・成果を再取得
  useEffect(() => { loadTasks() }, [loadTasks, workLog?.id])
  // 既存の useEffect は loadTasks 内部で deps 経由で再実行されるので一旦保持

  async function toggleTaskDone(task) {
    if (!isViewingSelf) return
    // 既存の task status 仕様 (MyTasksPage.jsx と同じ STATUS_ORDER) に従い循環:
    // not_started → in_progress → done → not_started
    const cur = task.status || (task.done ? 'done' : 'not_started')
    const nextStatus = cur === 'not_started' ? 'in_progress'
                     : cur === 'in_progress' ? 'done'
                     : 'not_started'
    const newDone = nextStatus === 'done'
    const taskId = Number(task.id)

    // オプティミスティック更新: state を即座に書き換え (リロードで白くならない)
    const applyTo = (newStatus, newDoneVal) => (t) =>
      Number(t.id) === taskId ? { ...t, status: newStatus, done: newDoneVal } : t
    setTaskBoard(b => ({
      ...b,
      today: b.today.map(applyTo(nextStatus, newDone)),
      byWeekday: Object.fromEntries(
        Object.entries(b.byWeekday).map(([k, v]) => [k, v.map(applyTo(nextStatus, newDone))])
      ),
    }))

    // done カラムは確実に更新 (旧スキーマでも成功)
    const { error } = await supabase.from('ka_tasks').update({ done: newDone }).eq('id', task.id)
    if (error) {
      // 失敗時は元の状態にロールバック
      setTaskBoard(b => ({
        ...b,
        today: b.today.map(applyTo(cur, !!task.done)),
        byWeekday: Object.fromEntries(
          Object.entries(b.byWeekday).map(([k, v]) => [k, v.map(applyTo(cur, !!task.done))])
        ),
      }))
      alert('更新に失敗しました: ' + error.message)
      return
    }
    // status カラムがあれば更新 (無い環境でもエラーは握りつぶす、MyTasksPage と同じ方針)
    await supabase.from('ka_tasks').update({ status: nextStatus }).eq('id', task.id).then(() => {}).catch(() => {})

    // 「今週の成果」だけ同期 (loadAchievements 自体は loading フラグを立てないので白くならない)
    loadAchievements()
  }

  // ─── Phase 6: 月次テーマ + 今週の成果 ──────────────
  const monthStartStr = useMemo(() => {
    const jstNow = new Date(Date.now() + 9 * 3600 * 1000)
    const firstOfMonth = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), 1))
    return getMondayJSTStr(firstOfMonth)
  }, [])

  const [monthTheme, setMonthTheme] = useState({ main: '', growth: '', logId: null, loading: true })
  const loadMonthTheme = useCallback(async () => {
    if (!viewingName) { setMonthTheme(m => ({ ...m, loading: false })); return }
    setMonthTheme(m => ({ ...m, loading: true }))
    const { data } = await supabase
      .from('coaching_logs')
      .select('*')
      .eq('owner', viewingName)
      .eq('log_type', 'monthly_theme')
      .eq('week_start', monthStartStr)
      .order('created_at', { ascending: false })
      .limit(1)
    const row = (data || [])[0]
    const c = parseLogContent(row?.content)
    setMonthTheme({ main: c.main || '', growth: c.growth || '', logId: row?.id || null, loading: false })
  }, [viewingName, monthStartStr])
  useEffect(() => { loadMonthTheme() }, [loadMonthTheme])

  async function saveMonthTheme({ main, growth }) {
    if (!isViewingSelf) return
    const content = JSON.stringify({ main, growth })
    if (monthTheme.logId) {
      await supabase.from('coaching_logs').update({ content }).eq('id', monthTheme.logId)
    } else {
      await supabase.from('coaching_logs').insert({
        owner: myName, log_type: 'monthly_theme',
        week_start: monthStartStr, content,
      })
    }
    await loadMonthTheme()
  }

  // ─── 今週のゴール (Phase: 追加機能) ──────────────
  const weekStartStr = useMemo(() => getMondayJSTStr(), [])
  const [weekGoal, setWeekGoal] = useState({ goal: '', logId: null, loading: true })
  const loadWeekGoal = useCallback(async () => {
    if (!viewingName) { setWeekGoal(g => ({ ...g, loading: false })); return }
    setWeekGoal(g => ({ ...g, loading: true }))
    const { data } = await supabase
      .from('coaching_logs').select('*')
      .eq('owner', viewingName).eq('log_type', 'weekly_goal').eq('week_start', weekStartStr)
      .order('created_at', { ascending: false }).limit(1)
    const row = (data || [])[0]
    const c = parseLogContent(row?.content)
    setWeekGoal({ goal: c.goal || '', logId: row?.id || null, loading: false })
  }, [viewingName, weekStartStr])
  useEffect(() => { loadWeekGoal() }, [loadWeekGoal])

  async function saveWeekGoal(goal) {
    if (!isViewingSelf) return
    const content = JSON.stringify({ goal })
    if (weekGoal.logId) {
      await supabase.from('coaching_logs').update({ content }).eq('id', weekGoal.logId)
    } else {
      await supabase.from('coaching_logs').insert({
        owner: myName, log_type: 'weekly_goal', week_start: weekStartStr, content,
      })
    }
    await loadWeekGoal()
  }

  // ─── ウィジェット表示/非表示 prefs (localStorage) ────
  const PREFS_KEY = `mypage-widget-prefs-v2:${myName || 'guest'}`
  const DEFAULT_PREFS = {
    today: true, week: true,
    rem_okr: true, rem_task: true,
    calendar: true, gmail: true,
    goal_month_main: true, goal_month_growth: true, goal_week: true, team_summary: true, achievements: true,
  }
  const [prefs, setPrefs] = useState(DEFAULT_PREFS)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
      setPrefs({ ...DEFAULT_PREFS, ...saved })
    } catch { /* keep defaults */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [PREFS_KEY])
  const togglePref = (key) => {
    setPrefs(p => {
      const next = { ...p, [key]: !p[key] }
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }
  const resetPrefs = () => {
    setPrefs(DEFAULT_PREFS)
    try { localStorage.removeItem(PREFS_KEY) } catch {}
  }
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 今週の成果: 完了タスクのみ
  const [achievements, setAchievements] = useState({ items: [], loading: true })
  const loadAchievements = useCallback(async () => {
    if (!viewingName) { setAchievements({ items: [], loading: false }); return }
    const monday = getMondayJSTStr()
    const sundayD = new Date(monday + 'T00:00:00Z'); sundayD.setUTCDate(sundayD.getUTCDate() + 6)
    const sunday = sundayD.toISOString().split('T')[0]

    // 今週中に完了したタスク (done=true) を取得
    // due_date が今週内 OR done になった日が今週内 (現状 done 日時カラムが無いので due_date で代替)
    const { data: doneTasks } = await supabase.from('ka_tasks')
      .select('*, weekly_reports(kr_title, ka_title, owner)')
      .eq('assignee', viewingName).eq('done', true)
      .gte('due_date', monday).lte('due_date', sunday)

    const items = (doneTasks || []).map(t => ({
      kind: 'task', date: t.due_date, icon: 'check',
      text: t.title || t.weekly_reports?.ka_title || '(無題)',
    }))
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    setAchievements({ items, loading: false })
  }, [viewingName])
  useEffect(() => { loadAchievements() }, [loadAchievements, workLog?.id])

  // 平日 → 朝のタスク登録モーダルを開く (閉じ不可)
  // 土日 → 直接 work_log insert
  async function handleStart() {
    if (busy || !myName) return
    // 平日: 昨日未終業ログの判定がまだ終わっていない (DB クエリ進行中) → 早押しを防ぐ。
    // この判定が終わる前に始業を許すと、ユーザーが先にタスク追加してしまい、
    // 後から振り返り(KPT)モーダルが上に被ってきて手戻り/混乱の原因になる。
    if (isWeekday && pendingYesterdayLog === null) return
    if (isWeekday) {
      setMorningOpen(true)
      return
    }
    await doStartWorkLog()
  }

  async function doStartWorkLog() {
    if (busy || !myName) return
    setBusy(true)
    const { error } = await supabase.from('coaching_logs').insert({
      owner: myName,
      log_type: 'work_log',
      organization_id: currentOrg?.id,
      week_start: getMondayJSTStr(),
      content: JSON.stringify({ start_at: new Date().toISOString() }),
    })
    setBusy(false)
    if (error) { alert('始業の記録に失敗しました: ' + error.message); return }
    setMorningOpen(false)
    await onWorkLogChange()
  }

  async function handleEnd({ keep, problem, tryNote }) {
    if (busy || !workLog) return
    setBusy(true)
    // 1. work_log に end_at を追記
    const oldContent = parseLogContent(workLog.content)
    const newContent = { ...oldContent, end_at: new Date().toISOString() }
    const { error: e1 } = await supabase
      .from('coaching_logs')
      .update({ content: JSON.stringify(newContent) })
      .eq('id', workLog.id)
    if (e1) { setBusy(false); alert('終業記録に失敗しました: ' + e1.message); return }
    // 2. KPT を別ログとして保存（何か記入があれば）
    if ((keep || '').trim() || (problem || '').trim() || (tryNote || '').trim()) {
      const { error: e2 } = await supabase.from('coaching_logs').insert({
        owner: myName,
        log_type: 'kpt',
        organization_id: currentOrg?.id,
        week_start: getMondayJSTStr(),
        content: JSON.stringify({ keep, problem, try: tryNote }),
      })
      if (e2) { setBusy(false); alert('振り返り(KPT)の保存に失敗しました: ' + e2.message); return }
    }
    setBusy(false)
    setKptOpen(false)
    await onWorkLogChange()
  }

  // ─── A. 始業ゲーティング: 自分閲覧 & 未始業 → 始業画面のみ表示 ────
  if (isViewingSelf && st === 'none') {
    // 昨日未終業(平日のみ): まず強制 KPT モーダル
    const showYesterdayKPT = isWeekday && pendingYesterdayLog && pendingYesterdayLog !== false
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <StartWorkGate
          T={T} viewingMember={viewingMember} viewingName={viewingName}
          greet={greet} dateStr={dateStr} busy={busy} onStart={handleStart}
          weekday={isWeekday}
          loading={isWeekday && pendingYesterdayLog === null}
        />
        {showYesterdayKPT && (
          <KPTModal
            T={T} busy={busy} force
            yesterdayDateStr={yesterdayDateStr}
            pendingDateISO={new Date(new Date(pendingYesterdayLog.created_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)}
            todayISO={new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)}
            startedAt={parseLogContent(pendingYesterdayLog.content).start_at}
            onSave={forceCloseYesterday}
            onCancel={() => {}}
          />
        )}
        {morningOpen && !showYesterdayKPT && (
          <MorningTaskModal
            T={T}
            viewingMember={viewingMember}
            viewingName={viewingName}
            members={members}
            busy={busy}
            onStart={doStartWorkLog}
            fiscalYear={fiscalYear}
          />
        )}
      </div>
    )
  }

  // ─── 表示判定ヘルパー ────
  const showW = (key) => prefs[key] !== false  // デフォルト未設定はtrue扱い

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflowX: 'hidden' }}>
      {/* 📬 表示対象宛に未解決の確認事項がある時だけ最上部に出るバナー */}
      <ConfirmationsBanner T={T} viewingName={viewingName} isViewingSelf={isViewingSelf}
        onGoToTab={onGoToTab} />

      {/* 挨拶バー (iOS 風グラスバー: 半透明 + backdrop-blur + ドット型ステータス) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: isMobile ? '12px 16px' : '14px 20px',
        flexWrap: 'wrap',
        background: T.sectionBg,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0, position: 'relative', zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar member={viewingMember} size={42} />
            {/* 状態ドット (右下に色付きで重ねる) */}
            <span style={{
              position: 'absolute', right: -2, bottom: -2,
              width: 14, height: 14, borderRadius: '50%',
              border: `2px solid ${T.bgCard}`,
              background: st === 'on' ? T.success : st === 'off' ? T.info : T.textFaint,
              boxShadow: st === 'on' ? `0 0 0 3px ${T.success}33` : 'none',
            }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>
              {greet}、{viewingName}さん
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{dateStr}</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 99,
                background: st === 'on' ? T.successBg : st === 'off' ? T.infoBg : T.sectionBg,
                color: st === 'on' ? T.success : st === 'off' ? T.info : T.textMuted,
                fontWeight: 700,
              }}>
                {st === 'on'  && content.start_at ? `稼働中 ${jstHHMM(content.start_at)}〜` :
                 st === 'off' && content.end_at   ? `終業済 ${jstHHMM(content.start_at)}–${jstHHMM(content.end_at)}` :
                                                    '未始業'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {onGoToCompanySummary && (
            <button onClick={onGoToCompanySummary} title="全社サマリーを開く" style={{
              background: T.sectionBg, border: `1px solid ${T.border}`, color: T.textSub,
              borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="chart" size={13} /> 全社サマリーへ</button>
          )}
          {isViewingSelf && st === 'on' && (
            <button onClick={() => setKptOpen(true)} disabled={busy} style={{
              ...btnBrand({ size: 'md' }),
              borderRadius: 10, padding: '9px 18px', fontSize: 13,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
              letterSpacing: '0.01em',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="clock" size={14} /> 終業する</button>
          )}
          {isViewingSelf && st === 'off' && (
            <div style={{
              fontSize: 12, color: T.success, padding: '6px 12px', fontWeight: 700,
              background: T.successBg, borderRadius: 99,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}>お疲れさまでした <Icon name="sparkle" size={12} /></div>
          )}
          <button onClick={() => setSettingsOpen(v => !v)} title="ウィジェットの表示設定" style={{
            background: settingsOpen ? T.accentBg : T.sectionBg,
            border: 'none', color: settingsOpen ? T.accent : T.textSub,
            borderRadius: 10, padding: '8px 10px',
            display: 'inline-flex', alignItems: 'center',
            cursor: 'pointer', fontFamily: 'inherit',
          }}><Icon name="settings" size={16} /></button>
        </div>

        {settingsOpen && (
          <SettingsPopover
            T={T} prefs={prefs} togglePref={togglePref} resetPrefs={resetPrefs} onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      {/* クイック追加 (自分のページのみ) */}
      {/* スタートガイドの3ステップ導線は初回スポットライトツアーに集約したため、ここでは常設表示しない */}
      {isViewingSelf && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: isMobile ? '12px 14px 0' : '10px 10px 0', flexShrink: 0 }}>
          <QuickTaskPalette user={{ email: viewingMember?.email }} members={members} inline />
        </div>
      )}

      {/* 3カラム本体 (スマホは1カラム縦積み) */}
      <div style={{
        flex: 1, display: 'grid',
        // minmax(0, ...) を入れないと長い子要素 (KR名など) でグリッド全体が
        // 画面幅を超える "auto" 拡張を起こすことがあるため必須
        gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
        gap: isMobile ? 14 : 10, padding: isMobile ? 14 : 10,
        paddingBottom: isMobile ? 80 : 10,  /* 下メニュー分 */
        minHeight: 0,
        overflow: isMobile ? 'auto' : 'hidden',
      }}>
        {/* ─── 左カラム：今日やること / 今週やること ─── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 10,
          minHeight: isMobile ? 'auto' : 0,
          minWidth: 0,
        }}>
          {showW('today') && (
            <Section dataTour="ws-today" T={T} icon={<Icon name="bolt" size={14} />} accent={T.accent} title={`今日やること${taskBoard.today.length ? ` (${taskBoard.today.length})` : ''}`} flex={1} headerRight={
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => onGoToTab && onGoToTab('wbs')} title="タスクタブを開く" style={{
                  padding: '3px 8px', borderRadius: 6,
                  background: 'transparent', color: T.accent,
                  border: `1px solid ${T.accent}40`,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                }}>タスクタブへ <Icon name="arrowRight" size={11} /></button>
                <button onClick={loadTasks} title="再読み込み" style={{
                  background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
                  borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                }}><Icon name="refresh" size={11} /></button>
              </div>
            }>
              {taskBoard.loading ? <Loading T={T} /> :
                taskBoard.today.length === 0
                  ? <EmptyRich T={T} icon="sparkle" title="今日のタスクはありません"
                      desc={isViewingSelf ? '上のクイックタスクから自然文でサッと登録できます。' : undefined}
                      mycooTip={isViewingSelf ? 'まずは今日やることを1件だけ決めてみましょう。' : undefined}
                    />
                  : <TaskList T={T} tasks={taskBoard.today} canEdit={isViewingSelf} onToggle={toggleTaskDone} showDue />}
            </Section>
          )}
          {showW('week') && (
            <Section dataTour="ws-week" T={T} icon={<Icon name="calendar" size={14} />} accent={T.success} title="今週やること" flex={1}>
              {taskBoard.loading ? <Loading T={T} /> : (
                <WeekTasks T={T} byWeekday={taskBoard.byWeekday} canEdit={isViewingSelf} onToggle={toggleTaskDone} />
              )}
            </Section>
          )}
        </div>

        {/* ─── 中カラム：メール + Google カレンダーの 2 つ ─── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 10,
          minHeight: isMobile ? 'auto' : 0,
          minWidth: 0,
          overflowY: isMobile ? 'visible' : 'auto',
        }}>
          {/* Gmail Box */}
          {showW('gmail') && (
            <GmailBox T={T} viewingName={viewingName} onGoToTab={onGoToTab} onOpenAIReply={onOpenAIReply} readMarks={mailReadMarks || new Set()} onMarkRead={onMarkMailRead} />
          )}
          {/* Google カレンダー Box */}
          {showW('calendar') && (
            <CalendarBox T={T} viewingName={viewingName} onGoToTab={onGoToTab} />
          )}
        </div>

        {/* ─── 右カラム：マイOKR + バッジコレクション (目標管理) ─── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 10,
          minHeight: isMobile ? 'auto' : 0,
          minWidth: 0,
          overflowY: isMobile ? 'visible' : 'auto',
        }}>
          {/* マイOKR (= 旧「OKR・KA記入漏れ」を右カラムへ移動) */}
          <Section dataTour="ws-okr" T={T} icon={<Icon name="target" size={14} />} accent={T.warn} title="マイOKR" flex={0} headerRight={
            <button onClick={loadReminders} title="再読み込み" style={{
              background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
              borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
            }}><Icon name="refresh" size={11} /></button>
          }>
            {reminders.loading ? <Loading T={T} /> : (() => {
              const items = [
                ...reminders.missingKRs.map(kr => ({ icon: 'target', sev: 'warn',
                  text: `KR「${truncate(kr.title, 28)}」未記入` })),
                ...reminders.missingKAs.map(ka => ({ icon: 'note', sev: 'warn',
                  text: `KA「${truncate(ka.ka_title || ka.kr_title, 28)}」未記入` })),
              ]
              const krCount = reminders.missingKRs.length
              const kaCount = reminders.missingKAs.length
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <ReminderList T={T} items={items} maxVisible={3}
                    emptyText={<><Icon name="sparkle" size={12} /> 今週分はすべて記入済みです</>} />
                  {(krCount > 0 || kaCount > 0) && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      {krCount > 0 && (
                        <button onClick={() => onOpenFocusFill && onOpenFocusFill('kr')}
                          style={{
                            ...btnBrand({ size: 'sm' }),
                            flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}><Icon name="target" size={12} /> KR記入 ({krCount}) <Icon name="arrowRight" size={12} /></button>
                      )}
                      {kaCount > 0 && (
                        <button onClick={() => onOpenFocusFill && onOpenFocusFill('ka')}
                          style={{
                            flex: 1, padding: '6px 10px', border: 'none',
                            background: T.success, color: '#fff',
                            borderRadius: 6, fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}><Icon name="check" size={12} /> KA記入 ({kaCount}) <Icon name="arrowRight" size={12} /></button>
                      )}
                    </div>
                  )}
                  <button onClick={() => onGoToTab && onGoToTab('okr_edit')}
                    style={{
                      background: 'transparent', border: `1px dashed ${T.borderMid}`,
                      color: T.textMuted, borderRadius: 6, padding: '4px 8px',
                      fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                      display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                    }}>一覧で見る <Icon name="arrowRight" size={11} /></button>
                </div>
              )
            })()}
          </Section>

          {/* バッジコレクション (月次達成度) */}
          <BadgeCollection T={T} viewingName={viewingName} isViewingSelf={isViewingSelf}
            onGoToRetrospect={() => onGoToTab && onGoToTab('retrospect')} />
        </div>
      </div>

      {kptOpen && (
        <KPTModal
          T={T} busy={busy}
          onCancel={() => setKptOpen(false)} onSave={handleEnd}
          startedAt={content.start_at}
        />
      )}
    </div>
  )
}

// ─── 始業ゲート画面 ────────────────────────────────────────
// loading=true の間は「確認中…」表示でボタン無効化。
// 昨日未終業ログの判定が完了する前に始業されると、後から振り返りモーダルが
// 被ってきて UX が壊れるため、判定完了まで始業を待つ。
function StartWorkGate({ T, viewingMember, viewingName, greet, dateStr, busy, onStart, weekday = true, loading = false }) {
  const disabled = busy || loading
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgCard} 100%)`,
      padding: 30,
    }}>
      <div style={{
        textAlign: 'center', padding: '40px 50px',
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.xl,
        boxShadow: SHADOWS.xl,
        maxWidth: 480, width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Avatar member={viewingMember} size={64} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 4 }}>
          {greet}、{viewingName}さん
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 30 }}>
          {dateStr} · 良い1日を始めましょう
        </div>
        <button
          onClick={onStart}
          disabled={disabled}
          style={{
            background: `linear-gradient(135deg, ${T.success} 0%, ${T.info} 100%)`,
            color: '#fff', border: 'none', borderRadius: RADIUS.lg,
            padding: '16px 48px', fontSize: 18, fontWeight: 800,
            cursor: disabled ? 'wait' : 'pointer', fontFamily: 'inherit',
            opacity: disabled ? 0.6 : 1, letterSpacing: 1,
            boxShadow: SHADOWS.hover(T.success),
            transition: 'transform 0.1s',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
          }}
          onMouseEnter={e => !disabled && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
        >{loading ? <><Icon name="sparkle" size={18} /> 確認中…</> : <><Icon name="sun" size={18} /> 始業する</>}</button>
        {weekday && (
          <div style={{
            marginTop: 20, padding: '8px 14px',
            background: T.accentBg, color: T.accent,
            borderRadius: 8, fontSize: 11, fontWeight: 600, lineHeight: 1.5,
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}>
            <Icon name="sparkle" size={12} /> 平日は始業時に「今日やること」を最低1件 登録してから始業します
          </div>
        )}
        <div style={{ marginTop: 14, fontSize: 10, color: T.textFaint }}>
          ※ 翌日 04:00 JST に自動的にリセットされます
        </div>
      </div>
    </div>
  )
}

// ─── 朝の「今日やること」モーダル (平日・閉じ不可・最低1件必須) ─────────────
// 既存 TaskCreateModal を呼び出す薄いラッパー。
// 今日期日&自分アサインのタスクを DB から取得して一覧表示し、1件以上あると始業可能。
function MorningTaskModal({ T, viewingMember, viewingName, members, busy, onStart, fiscalYear = '2026' }) {
  const [todayTasks, setTodayTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [composeKind, setComposeKind] = useState(null) // null | 'share' | 'confirmation'
  const today = toJSTDateStr(new Date())

  const reload = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ka_tasks')
      .select('id, title, due_date, done')
      .eq('assignee', viewingName)
      .eq('due_date', today)
      .order('id', { ascending: false })
    setTodayTasks(data || [])
    setLoading(false)
  }, [viewingName, today])

  useEffect(() => { reload() }, [reload])

  // タスク0件で開いた時は自動で追加モーダルを前面に
  useEffect(() => {
    if (!loading && todayTasks.length === 0 && !addOpen) {
      setAddOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const canStart = todayTasks.length >= 1

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9998, padding: 20,
    }}>
      <div style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: RADIUS.lg,
        padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh',
        overflowY: 'auto', boxShadow: SHADOWS.xl,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Avatar member={viewingMember} size={42} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.text, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="sun" size={16} /> 今日やること</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {viewingName}さん、朝会でも使えるように今日やることを最低1件 登録してから始業してください
            </div>
          </div>
        </div>

        <div style={{
          padding: '8px 12px', background: T.accentBg, color: T.accent,
          borderRadius: 6, fontSize: 11, marginBottom: 14, lineHeight: 1.5,
          display: 'flex', alignItems: 'center', gap: SPACING.xs,
        }}>
          <Icon name="sparkle" size={12} /> タスクタブと同じ登録機能です。OKR紐付けも可能です。
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
          <Icon name="check" size={13} /> 本日({today})のタスク
          <span style={{
            marginLeft: 8, padding: '1px 8px', borderRadius: 99,
            background: canStart ? T.successBg : T.warnBg,
            color: canStart ? T.success : T.warn,
            fontSize: 10, fontWeight: 700,
          }}>{todayTasks.length}件</span>
        </div>

        <div style={{
          border: `1px solid ${T.border}`, borderRadius: 8,
          minHeight: 60, maxHeight: 220, overflowY: 'auto',
          marginBottom: 14, background: T.sectionBg,
        }}>
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: T.textMuted, fontSize: 11 }}>
              読み込み中...
            </div>
          ) : todayTasks.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: T.textMuted, fontSize: 12, lineHeight: 1.6 }}>
              登録されたタスクはありません<br />
              <span style={{ fontSize: 10 }}>下のボタンからタスクを追加してください</span>
            </div>
          ) : (
            todayTasks.map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px',
                borderBottom: i < todayTasks.length - 1 ? `1px solid ${T.border}` : 'none',
                fontSize: 12, color: T.text,
              }}>
                <span style={{ display: 'inline-flex', color: T.success }}><Icon name="check" size={14} /></span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </span>
              </div>
            ))
          )}
        </div>

        <button
          onClick={() => setAddOpen(true)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: 'transparent', border: `1px dashed ${T.accent}`,
            color: T.accent, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
          }}
        >+ タスクを追加</button>

        {/* 共有事項 / 確認事項を任意で追加 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => setComposeKind('share')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8,
              background: 'transparent', border: `1px dashed ${T.warn}`,
              color: T.warn, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
            }}
          >+ <Icon name="bell" size={13} /> 共有事項 (任意)</button>
          <button
            onClick={() => setComposeKind('confirmation')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8,
              background: 'transparent', border: `1px dashed ${T.accent}`,
              color: T.accent, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
            }}
          >+ <Icon name="mail" size={13} /> 確認事項 (任意)</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onStart}
            disabled={busy || !canStart}
            style={{
              background: canStart ? `linear-gradient(135deg, ${T.success} 0%, ${T.info} 100%)` : T.border,
              color: '#fff', border: 'none', borderRadius: RADIUS.md,
              padding: '12px 28px', fontSize: 14, fontWeight: 800,
              cursor: busy || !canStart ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: busy ? 0.6 : 1,
              boxShadow: canStart ? SHADOWS.hover(T.success) : 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
            }}
          >{busy ? '始業中…' : canStart ? <><Icon name="sun" size={14} /> 始業する</> : <><Icon name="alert" size={14} /> タスクを追加してください</>}</button>
        </div>
      </div>

      {/* 既存 TaskCreateModal を期日=本日 + KA未紐付け でプリセット起動 */}
      {addOpen && (
        <TaskCreateModal
          T={T}
          myName={viewingName}
          members={members}
          defaultDueDate={today}
          defaultNoKaLink={true}
          fiscalYear={fiscalYear}
          onClose={() => setAddOpen(false)}
          onCreated={() => { setAddOpen(false); reload() }}
        />
      )}

      {/* 共有事項 / 確認事項 ComposeModal */}
      {composeKind && (
        <ComposeModal
          T={T}
          myName={viewingName}
          members={members}
          presetKind={composeKind}
          onClose={() => setComposeKind(null)}
          onSaved={() => setComposeKind(null)}
        />
      )}
    </div>
  )
}

// ─── 設定ポップオーバー (ウィジェット表示/非表示) ──────────
function SettingsPopover({ T, prefs, togglePref, resetPrefs, onClose }) {
  const groups = [
    { title: 'タスク', items: [
      { key: 'today', icon: 'bolt', label: '今日やること' },
      { key: 'week',  icon: 'calendar', label: '今週やること' },
    ]},
    { title: '外部連携', items: [
      { key: 'calendar', icon: 'calendar', label: 'Google カレンダー' },
      { key: 'gmail',    icon: 'mail', label: 'Gmail (重要メール)' },
    ]},
    { title: 'ゴール / 成果', items: [
      { key: 'goal_month_main',   icon: 'star', label: '今月のメインテーマ' },
      { key: 'goal_month_growth', icon: 'target', label: '今月の成長テーマ' },
      { key: 'goal_week',         icon: 'rocket', label: '今週のゴール' },
      { key: 'team_summary',      icon: 'chart', label: '今週のチームサマリー' },
      { key: 'achievements',      icon: 'trophy', label: '今週の成果' },
    ]},
  ]
  // ※ リマインダーBox (OKR/タスク/Googleカレンダー/Gmail/Slack/LINE) は常時表示
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'transparent',
      }} />
      <div style={{
        position: 'absolute', right: 16, top: '100%', marginTop: 8,
        background: T.bgCard,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: RADIUS.lg,
        boxShadow: SHADOWS.xl,
        zIndex: 101, padding: 14, minWidth: 260, maxHeight: '70vh', overflowY: 'auto',
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, flex: 1, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
            <Icon name="settings" size={14} /> 表示するウィジェット
          </div>
          <button
            onClick={() => { if (window.confirm('初期状態に戻しますか?')) resetPrefs() }}
            title="全ての表示/非表示設定を初期値に戻す"
            style={{
              background: T.sectionBg, border: 'none',
              color: T.textSub, borderRadius: 7, padding: '4px 10px',
              fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}
          ><Icon name="refresh" size={11} /> リセット</button>
        </div>
        {groups.map(g => (
          <div key={g.title} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 800, marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {g.title}
            </div>
            <div style={{
              background: T.bgCard, borderRadius: 10,
              border: `1px solid ${T.border}`, overflow: 'hidden',
            }}>
            {g.items.map((it, i) => (
              <label key={it.key} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                cursor: 'pointer', fontSize: 13, color: T.text,
                borderBottom: i < g.items.length - 1 ? `0.5px solid ${T.border}` : 'none',
              }}
                onMouseEnter={e => e.currentTarget.style.background = T.sectionBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <input
                  type="checkbox"
                  checked={prefs[it.key] !== false}
                  onChange={() => togglePref(it.key)}
                  style={{ cursor: 'pointer', accentColor: T.accent }}
                />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACING.sm }}><Icon name={it.icon} size={14} /> {it.label}</span>
              </label>
            ))}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}` }}>
          設定はこのブラウザに保存されます
        </div>
      </div>
    </>
  )
}

// ─── 今週のチームサマリー: 個人ダッシュボード用通知行 (詳細は全社サマリーへ誘導) ─
// ─── BadgeCollection: 月次バッジ達成度 (目標管理) ──────────────────────────
//   タスク完了率 / KR記入率 / KA記入率 / 月22日以上ログイン / 振り返り記入 /
//   MyCOO 5回以上相談 / Google連携完了 の 7 種を当月で集計。
//   80% 以上 or 22 日以上で 1 バッジ獲得。詳細は振り返りページで参照可能。
// ─── Monthly1on1Card: 月次 1on1 (KPT 共同記入 + 成長テーマ) ─────────────
//   自分の KPT を編集 + 上司の KPT を閲覧 (上司側からも編集可) + 共同で成長テーマ
//   KR進捗・KR/KA 記入率は BadgeCollectionDetail を参照することを案内
function Monthly1on1Card({ T, viewingName, myName, members = [] }) {
  // 編集権限:
  //   - 部下本人 (myName === viewingName) → self_* を編集
  //   - 上司 (myName === supervisor) → boss_* を編集
  //   - その他の閲覧者 → 全て read-only
  const isMySelf = myName && myName === viewingName
  // 月を YYYY-MM 形式で。default は当月
  const currentMonth = (() => {
    const jst = new Date(Date.now() + 9 * 3600 * 1000)
    return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`
  })()
  const [month, setMonth] = useState(currentMonth)
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({
    supervisor: '', self_keep: '', self_problem: '', self_try: '',
    boss_keep: '', boss_problem: '', boss_try: '', growth_theme: '',
  })

  const load = useCallback(async () => {
    if (!viewingName) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('monthly_1on1')
      .select('*').eq('owner', viewingName).eq('month', month).maybeSingle()
    if (error) console.warn('[monthly_1on1] load error:', error.message)
    setRow(data || null)
    setDraft({
      supervisor: data?.supervisor || '',
      self_keep: data?.self_keep || '',
      self_problem: data?.self_problem || '',
      self_try: data?.self_try || '',
      boss_keep: data?.boss_keep || '',
      boss_problem: data?.boss_problem || '',
      boss_try: data?.boss_try || '',
      growth_theme: data?.growth_theme || '',
    })
    setLoading(false)
  }, [viewingName, month])

  useEffect(() => { load() }, [load])

  async function save(patch) {
    if (!viewingName) return
    setSaving(true)
    const payload = {
      owner: viewingName, month,
      supervisor: patch.supervisor !== undefined ? patch.supervisor : draft.supervisor,
      self_keep: patch.self_keep !== undefined ? patch.self_keep : draft.self_keep,
      self_problem: patch.self_problem !== undefined ? patch.self_problem : draft.self_problem,
      self_try: patch.self_try !== undefined ? patch.self_try : draft.self_try,
      boss_keep: patch.boss_keep !== undefined ? patch.boss_keep : draft.boss_keep,
      boss_problem: patch.boss_problem !== undefined ? patch.boss_problem : draft.boss_problem,
      boss_try: patch.boss_try !== undefined ? patch.boss_try : draft.boss_try,
      growth_theme: patch.growth_theme !== undefined ? patch.growth_theme : draft.growth_theme,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('monthly_1on1')
      .upsert(payload, { onConflict: 'owner,month' })
    if (error) console.warn('[monthly_1on1] save error:', error.message)
    setSaving(false)
    load()
  }

  // 月候補: 当月から過去 6 ヶ月
  const monthOptions = useMemo(() => {
    const jst = new Date(Date.now() + 9 * 3600 * 1000)
    const out = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() - i, 1))
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const label = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`
      out.push({ value: ym, label: i === 0 ? `${label} (今月)` : label })
    }
    return out
  }, [])

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: 18,
    }}>
      {/* ヘッダ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', color: T.accent }}><Icon name="msg" size={20} /></span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>月次 1on1</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            自分と上司が 1ヶ月の KPT をお互い書いて、1on1 で話す材料に
          </div>
        </div>
        <select value={month} onChange={e => setMonth(e.target.value)}
          style={{
            padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.border}`,
            background: T.bg, color: T.text, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
          }}>
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? <Loading T={T} /> : (
        <>
          {/* 上司 (supervisor) 設定 */}
          <div style={{ marginBottom: 14, padding: '10px 12px', background: T.sectionBg, borderRadius: 8, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>上司</span>
            {isMySelf ? (
              <select
                value={draft.supervisor}
                onChange={e => { setDraft(d => ({ ...d, supervisor: e.target.value })); save({ supervisor: e.target.value }) }}
                style={{
                  flex: 1, minWidth: 160,
                  padding: '5px 10px', borderRadius: 6,
                  border: `1px solid ${T.border}`, background: T.bg, color: T.text,
                  fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
                }}>
                <option value="">-- 上司を選択 --</option>
                {(members || []).filter(m => m.name && m.name !== viewingName).map(m => (
                  <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 12, color: T.text }}>{draft.supervisor || '(未設定)'}</span>
            )}
            <span style={{ fontSize: 10, color: T.textMuted, flex: '1 1 100%', minWidth: 0, lineHeight: 1.5 }}>
              ここで指定された上司本人が、そのメンバーの「振り返り」ページを開くと「上司から見た KPT」を編集できます
            </span>
          </div>

          {/* 編集権限の判定: supervisor として指定された人だけが boss_* を編集可能 */}
          {/* 自分から見た KPT (= 部下のセルフ評価) */}
          <KPTRow
            T={T} title="自分から見た KPT" subtitle="部下によるセルフ評価"
            keep={draft.self_keep} problem={draft.self_problem} tryNote={draft.self_try}
            readOnly={!isMySelf}
            onSave={(k, p, t) => save({ self_keep: k, self_problem: p, self_try: t })}
            saving={saving}
          />

          {/* 上司から見た KPT (= supervisor として指定された上司のみ編集可) */}
          <KPTRow
            T={T} title="上司から見た KPT" subtitle="supervisor として指定された上司が部下について記入"
            keep={draft.boss_keep} problem={draft.boss_problem} tryNote={draft.boss_try}
            readOnly={!myName || !draft.supervisor || myName !== draft.supervisor}
            onSave={(k, p, t) => save({ boss_keep: k, boss_problem: p, boss_try: t })}
            saving={saving}
            emptyMessage={isMySelf
              ? `上司 (${draft.supervisor || '未指定'}) がまだ記入していません`
              : '上司がまだ記入していません'}
          />

          {/* 成長テーマ */}
          <div style={{ marginTop: 14, padding: '12px 14px', background: `${T.accent}0a`, border: `1px solid ${T.accent}30`, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon name="rocket" size={13} stroke={1.8} style={{ color: T.accent }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>来月の成長テーマ</span>
              <span style={{ fontSize: 10, color: T.textMuted }}>(双方で合意して記入)</span>
            </div>
            <textarea
              value={draft.growth_theme}
              onChange={e => setDraft(d => ({ ...d, growth_theme: e.target.value }))}
              onBlur={e => save({ growth_theme: e.target.value })}
              placeholder="例: 1on1で相手の話を引き出す力を伸ばす"
              rows={2}
              style={{
                width: '100%', padding: 8, background: T.bg,
                border: `1px solid ${T.border}`, borderRadius: 6, color: T.text,
                fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box',
              }} />
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>
            KR進捗 / KR・KA 記入率 / ログイン日数は <Icon name="chevronD" size={11} style={{ verticalAlign: 'middle' }} /> のバッジコレクションで確認できます
          </div>

          {/* 自分が上司として担当している部下リスト (= 上司視点の inbox) */}
          {isMySelf && <SupervisorInbox T={T} myName={myName} month={month} />}
        </>
      )}
    </div>
  )
}

// ─── SupervisorInbox: 自分が supervisor として指定されている部下の月次1on1 一覧
//   - 自分のページにだけ表示。記入状況 + 部下ページへの導線を提供
function SupervisorInbox({ T, myName, month }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!myName || !month) return
    let alive = true
    supabase.from('monthly_1on1')
      .select('id, owner, month, boss_keep, boss_problem, boss_try, self_keep, self_problem, self_try, updated_at')
      .eq('supervisor', myName).eq('month', month)
      .order('updated_at', { ascending: false })
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [myName, month])

  if (rows === null) return null
  if (rows.length === 0) {
    return (
      <div style={{
        marginTop: 14, padding: '10px 12px',
        background: T.sectionBg, border: `1px dashed ${T.border}`, borderRadius: 8,
        fontSize: 11, color: T.textMuted, textAlign: 'center',
      }}>
        あなたを上司として指定しているメンバーはまだいません
      </div>
    )
  }
  return (
    <div style={{ marginTop: 14, padding: '12px 14px', background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Icon name="org" size={13} stroke={1.8} style={{ color: T.accent }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
          あなたが上司を担当中のメンバー
        </span>
        <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 'auto' }}>
          {rows.length} 名 · 部下名をクリックすると「上司から見た KPT」を記入できます
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => {
          const bossWritten = (r.boss_keep || '').trim() || (r.boss_problem || '').trim() || (r.boss_try || '').trim()
          const selfWritten = (r.self_keep || '').trim() || (r.self_problem || '').trim() || (r.self_try || '').trim()
          return (
            <a key={r.id} href={`?page=mycoach&member=${encodeURIComponent(r.owner)}`}
              onClick={(e) => {
                e.preventDefault()
                // クライアントサイドナビ: 同じ orgSlug + page=mycoach + member 切替で別メンバーの振り返りページへ
                const url = new URL(window.location.href)
                url.searchParams.set('page', 'mycoach')
                url.searchParams.set('member', r.owner)
                window.history.pushState({}, '', url.toString())
                window.dispatchEvent(new CustomEvent('change-viewing-member', { detail: { name: r.owner } }))
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 7,
                background: T.bgCard, border: `1px solid ${T.border}`,
                textDecoration: 'none', color: T.text, cursor: 'pointer',
              }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{r.owner}</span>
              <span style={{
                fontSize: 10, fontWeight: 600,
                padding: '2px 8px', borderRadius: 99,
                background: selfWritten ? `${T.success}1a` : T.sectionBg,
                color: selfWritten ? T.success : T.textMuted,
                border: `1px solid ${selfWritten ? `${T.success}40` : T.border}`,
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}>
                {selfWritten ? <><Icon name="check" size={11} /> セルフ記入済</> : 'セルフ未記入'}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600,
                padding: '2px 8px', borderRadius: 99,
                background: bossWritten ? `${T.accent}1a` : T.warnBg || `${T.warn}1a`,
                color: bossWritten ? T.accent : T.warn,
                border: `1px solid ${bossWritten ? `${T.accent}40` : `${T.warn}40`}`,
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}>
                {bossWritten ? <><Icon name="check" size={11} /> あなたが記入済</> : <><Icon name="pencil" size={11} /> あなたが要記入</>}
              </span>
              <Icon name="arrowRight" size={11} stroke={2} style={{ color: T.textMuted }} />
            </a>
          )
        })}
      </div>
    </div>
  )
}

function KPTRow({ T, title, subtitle, keep, problem, tryNote, readOnly, onSave, saving, emptyMessage }) {
  const [draftK, setDraftK] = useState(keep || '')
  const [draftP, setDraftP] = useState(problem || '')
  const [draftT, setDraftT] = useState(tryNote || '')
  useEffect(() => { setDraftK(keep || ''); setDraftP(problem || ''); setDraftT(tryNote || '') }, [keep, problem, tryNote])

  const allEmpty = !keep && !problem && !tryNote
  // 上司未記入で readOnly のとき、点線囲み + アクションボタン (リマインドを送る)
  if (readOnly && allEmpty) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
          <span style={{ fontSize: 11, color: T.textMuted }}>· {subtitle}</span>
        </div>
        <div style={{
          padding: '20px 18px', background: T.sectionBg,
          border: `1px dashed ${T.borderStrong || T.border}`, borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: T.sectionBg, border: `1px solid ${T.border}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: T.textMuted, flexShrink: 0,
          }}>
            <Icon name="user" size={16} stroke={1.8} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, color: T.text }}>{emptyMessage || 'まだ記入されていません'}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              リマインドを送ると、平均 1.8日 で記入されています。
            </div>
          </div>
          <button
            onClick={() => {
              // Slack DM テンプレを clipboard にコピー (= 簡易実装)
              if (typeof window !== 'undefined' && navigator?.clipboard) {
                navigator.clipboard.writeText(`今月の 1on1 用 KPT を記入していただけますか？\n振り返りページから記入できます。`)
                alert('リマインドメッセージをクリップボードにコピーしました。Slack 等で送信してください。')
              }
            }}
            style={{
              padding: '6px 12px', borderRadius: 7,
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.text, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
            }}>
            <Icon name="msg" size={12} stroke={1.8} /> リマインドを送る
          </button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
        <span style={{ fontSize: 11, color: T.textMuted }}>· {subtitle}</span>
        {readOnly && <span style={{ fontSize: 10, color: T.textFaint, marginLeft: 'auto' }}>閲覧のみ</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <Monthly1on1Field T={T} label="Keep" color={T.success || '#059669'} value={draftK}
          readOnly={readOnly} placeholder="続けたいこと…"
          onChange={setDraftK} onBlur={v => onSave(v, draftP, draftT)} />
        <Monthly1on1Field T={T} label="Problem" color={T.warn || '#d97706'} value={draftP}
          readOnly={readOnly} placeholder="課題に感じたこと…"
          onChange={setDraftP} onBlur={v => onSave(draftK, v, draftT)} />
        <Monthly1on1Field T={T} label="Try" color={T.info || T.accent || '#0284c7'} value={draftT}
          readOnly={readOnly} placeholder="来月試したいこと…"
          onChange={setDraftT} onBlur={v => onSave(draftK, draftP, v)} />
      </div>
    </div>
  )
}

function Monthly1on1Field({ T, label, color, value, readOnly, placeholder, onChange, onBlur }) {
  // 左ボーダー塗り廃止 → ドット + 小ラベル (ハンドオフ準拠)
  return (
    <div style={{
      padding: '12px 14px', background: T.bgCard,
      border: `1px solid ${T.border}`, borderRadius: 10,
      minHeight: 160, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{
          fontSize: 11, fontWeight: 600, color,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>{label}</span>
      </div>
      {readOnly ? (
        <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', flex: 1 }}>
          {value || <span style={{ color: T.textFaint, fontStyle: 'italic' }}>記入なし</span>}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={e => onBlur(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, width: '100%', padding: 0, background: 'transparent',
            border: 'none', color: T.text,
            fontSize: 12.5, fontFamily: 'inherit', resize: 'none', outline: 'none',
            boxSizing: 'border-box', lineHeight: 1.55,
          }} />
      )}
    </div>
  )
}

// ─── バッジ集計ロジック (BadgeCollection / BadgeCollectionDetail で共有) ──
async function fetchBadgeStats(viewingName) {
  if (!viewingName) return []
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const y = jst.getUTCFullYear(), m = jst.getUTCMonth()
  const monthStart = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(y, m + 1, 0)).toISOString().split('T')[0]

  const [tasksRes, krRes, krReviewsRes, kasRes, logsRes, chatsRes, googleRes] = await Promise.all([
    supabase.from('ka_tasks').select('id, done, due_date')
      .eq('assignee', viewingName)
      .gte('due_date', monthStart).lte('due_date', monthEnd),
    supabase.from('key_results').select('id').eq('owner', viewingName).is('archived_at', null).limit(200),
    supabase.from('kr_weekly_reviews').select('kr_id, good, more, focus, focus_output, week_start')
      .gte('week_start', monthStart).lte('week_start', monthEnd),
    supabase.from('weekly_reports').select('id, owner, good, more, focus_output, week_start')
      .eq('owner', viewingName).gte('week_start', monthStart).lte('week_start', monthEnd),
    supabase.from('coaching_logs').select('id, log_type, created_at')
      .eq('owner', viewingName).gte('created_at', `${monthStart}T00:00:00`).lte('created_at', `${monthEnd}T23:59:59`),
    supabase.from('coaching_chats').select('id, role, created_at')
      .eq('owner', viewingName).eq('role', 'user').eq('kind', 'mycoach')
      .gte('created_at', `${monthStart}T00:00:00`).lte('created_at', `${monthEnd}T23:59:59`),
    supabase.from('user_integrations').select('refresh_token').eq('owner', viewingName).eq('service', 'google').limit(1),
  ])

  const tasks = tasksRes.data || []
  const taskRate = tasks.length > 0 ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100) : 0
  const krIds = new Set((krRes.data || []).map(k => k.id))
  const monthlyKrReviews = (krReviewsRes.data || []).filter(r => krIds.has(r.kr_id) &&
    ((r.good || '').trim() || (r.more || '').trim() || (r.focus || '').trim() || (r.focus_output || '').trim()))
  const weeksInMonth = Math.ceil((new Date(monthEnd).getTime() - new Date(monthStart).getTime()) / (7 * 86400000)) + 1
  const krExpected = Math.max(krIds.size * weeksInMonth, 1)
  const krRate = Math.round((monthlyKrReviews.length / krExpected) * 100)
  const kas = kasRes.data || []
  const kaWritten = kas.filter(k => (k.good || '').trim() || (k.more || '').trim() || (k.focus_output || '').trim())
  const kaRate = kas.length > 0 ? Math.round((kaWritten.length / kas.length) * 100) : 0
  const logs = logsRes.data || []
  const workDays = new Set(logs.filter(l => l.log_type === 'work_log')
    .map(l => l.created_at?.split('T')[0])).size
  const kptDays = new Set(logs.filter(l => l.log_type === 'kpt')
    .map(l => l.created_at?.split('T')[0])).size
  const mycooCount = (chatsRes.data || []).length
  const googleConnected = !!(googleRes.data?.[0]?.refresh_token)

  return [
    { key: 'tasks', label: 'タスク完了率', value: `${taskRate}%`, achieved: taskRate >= 80, progress: Math.min(100, taskRate), iconName: 'check', desc: '完了率 80% 以上', target: '80%' },
    { key: 'kr',    label: 'KR記入率',     value: `${krRate}%`, achieved: krRate >= 80, progress: Math.min(100, krRate), iconName: 'target', desc: 'KR の週次レビューが 80% 以上', target: '80%' },
    { key: 'ka',    label: 'KA記入率',     value: `${kaRate}%`, achieved: kaRate >= 80, progress: Math.min(100, kaRate), iconName: 'workspace', desc: 'KA の週次記入が 80% 以上', target: '80%' },
    { key: 'login', label: 'ログイン皆勤', value: `${workDays}日`, achieved: workDays >= 22, progress: Math.min(100, Math.round(workDays / 22 * 100)), iconName: 'morning', desc: '月 22 日以上ログイン', target: '22日' },
    { key: 'kpt',   label: '振り返り皆勤', value: `${kptDays}日`, achieved: kptDays >= 22, progress: Math.min(100, Math.round(kptDays / 22 * 100)), iconName: 'refresh', desc: '月 22 日以上の振り返り記入', target: '22日' },
    { key: 'mycoo', label: 'MyCOO 達人',   value: `${mycooCount}回`, achieved: mycooCount >= 5, progress: Math.min(100, Math.round(mycooCount / 5 * 100)), iconName: 'ai', desc: 'MyCOO に月 5 回以上相談', target: '5回' },
    { key: 'google',label: 'Google 連携',  value: googleConnected ? '完了' : '未連携', achieved: googleConnected, progress: googleConnected ? 100 : 0, iconName: 'link', desc: 'Google アカウントを連携済', target: '連携' },
  ]
}

// ─── BadgeIcon: ゴールド/琥珀/グレーの 3 状態の円形バッジアイコン ─────
function BadgeIcon({ state, iconName, size = 64 }) {
  const iconSize = Math.round(size * 0.42)
  const base = {
    width: size, height: size, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', flexShrink: 0,
  }
  if (state === 'done') {
    return (
      <div style={{
        ...base,
        background: 'radial-gradient(circle at 30% 25%, #fde68a 0%, #f59e0b 45%, #b45309 100%)',
        color: '#fff',
        boxShadow: '0 0 0 4px rgba(245,158,11,.16), 0 2px 8px rgba(180,83,9,.25), inset 0 -2px 4px rgba(124,45,18,.3), inset 0 2px 3px rgba(255,255,255,.45)',
      }}>
        <Icon name={iconName} size={iconSize} stroke={2} />
        {/* ハイライト装飾 */}
        <span aria-hidden style={{
          position: 'absolute', top: '12%', left: '22%',
          width: '20%', height: '12%',
          background: 'rgba(255,255,255,.55)',
          borderRadius: '50%', filter: 'blur(2px)',
          transform: 'rotate(-25deg)', pointerEvents: 'none',
        }} />
      </div>
    )
  }
  if (state === 'near') {
    // near: 達成手前。ゴールドで誤解を生まないようグレー + warn アクセントの控えめ表示
    return (
      <div style={{
        ...base,
        background: 'linear-gradient(160deg, #f4f4f5 0%, #e4e4e7 70%, #d4d4d8 100%)',
        color: '#92400e',
        boxShadow: 'inset 0 -1px 2px rgba(0,0,0,.04), inset 0 1px 2px rgba(255,255,255,.6)',
      }}>
        <Icon name={iconName} size={iconSize} stroke={1.8} />
      </div>
    )
  }
  // far
  return (
    <div style={{
      ...base,
      background: 'linear-gradient(160deg, #f4f4f5 0%, #e4e4e7 70%, #d4d4d8 100%)',
      color: '#a1a1aa',
      boxShadow: 'inset 0 -1px 2px rgba(0,0,0,.04), inset 0 1px 2px rgba(255,255,255,.6)',
    }}>
      <Icon name={iconName} size={iconSize} stroke={1.6} />
    </div>
  )
}

// ─── BadgeCollectionDetail: 振り返りページ用のグリッド表示 ─────────────────
function BadgeCollectionDetail({ T, viewingName }) {
  const [stats, setStats] = useState({ loading: true, items: [] })
  useEffect(() => {
    let alive = true
    ;(async () => {
      const items = await fetchBadgeStats(viewingName)
      if (alive) setStats({ loading: false, items })
    })()
    return () => { alive = false }
  }, [viewingName])

  const achievedCount = stats.items.filter(i => i.achieved).length
  const totalCount = stats.items.length
  const nearCount = stats.items.filter(i => !i.achieved && i.progress >= 60).length
  const monthLabel = (() => {
    const jst = new Date(Date.now() + 9 * 3600 * 1000)
    return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月`
  })()
  // 残り日数 (= 月末まで)
  const daysLeft = (() => {
    const jst = new Date(Date.now() + 9 * 3600 * 1000)
    const lastDay = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 1, 0)).getUTCDate()
    return lastDay - jst.getUTCDate()
  })()

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 14, padding: 18,
    }}>
      {/* ヘッダ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <BadgeIcon state={achievedCount > 0 ? 'done' : 'near'} iconName="star" size={48} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: T.text, letterSpacing: '-0.005em' }}>
            バッジコレクション{' '}
            <span style={{ color: T.textMuted, fontWeight: 500 }}>{achievedCount} / {totalCount}</span>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            {monthLabel} · 月次でリセット · 残り {daysLeft}日
          </div>
        </div>
        {nearCount > 0 && (
          <div style={{
            padding: '8px 14px', borderRadius: 10,
            background: `${T.warn}1f`, border: `1px solid ${T.warn}`,
            fontSize: 12, fontWeight: 600, color: T.warn,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="bolt" size={13} stroke={2} />
            あと一歩 · {nearCount}件が達成間近
          </div>
        )}
        <div style={{ minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textMuted, marginBottom: 4 }}>
            <span>今月の達成</span>
            <span style={{ color: T.text, fontWeight: 600 }}>
              {totalCount > 0 ? Math.round(achievedCount / totalCount * 100) : 0}%
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: T.sectionBg, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${totalCount > 0 ? Math.round(achievedCount / totalCount * 100) : 0}%`,
              background: T.success || '#16a34a', transition: 'width 300ms ease-out',
            }} />
          </div>
        </div>
      </div>

      {/* バッジグリッド */}
      {stats.loading ? <Loading T={T} /> : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {stats.items.map(b => (
            <BadgeCard key={b.key} T={T} badge={b} />
          ))}
        </div>
      )}
    </div>
  )
}

function BadgeCard({ T, badge }) {
  const state = badge.achieved ? 'done' : badge.progress >= 60 ? 'near' : 'far'
  // 残り (= ターゲット - 現在値)
  const remaining = (() => {
    const m = badge.value.match(/(\d+)/)
    const cur = m ? Number(m[1]) : 0
    const tgtM = badge.target.match(/(\d+)/)
    const tgt = tgtM ? Number(tgtM[1]) : 0
    const unit = badge.target.replace(/[\d.]/g, '') || '%'
    return tgt > cur ? `${tgt - cur}${unit}` : ''
  })()
  const containerStyle = state === 'done' ? {
    background: 'linear-gradient(170deg, #fffbeb 0%, #fef3c7 100%)',
    border: '1px solid #fcd34d',
  } : state === 'near' ? {
    // near: 達成風に見えないよう控えめに (border は warn の半透明)
    background: T.bgCard, border: `1px solid ${T.warn}40`,
  } : {
    background: T.bgCard, border: `1px solid ${T.border}`,
  }
  const titleColor = state === 'done' ? '#7c2d12' : T.text
  const descColor = state === 'done' ? '#92400e' : T.textMuted

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: '20px 16px 16px', borderRadius: 14,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', cursor: 'pointer',
      transition: 'transform .2s, box-shadow .2s',
      ...containerStyle,
    }}>
      {/* far のときストライプ装飾 */}
      {state === 'far' && (
        <span aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 18px, rgba(0,0,0,.018) 18px 19px)',
        }} />
      )}
      {/* 獲得 / 達成間近 ピル */}
      {state === 'done' && (
        <span style={{
          position: 'absolute', top: 10, right: 10,
          padding: '2px 8px',
          background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(4px)',
          border: '1px solid rgba(180,83,9,.25)', borderRadius: 99,
          fontSize: 10, fontWeight: 700, color: '#92400e',
          letterSpacing: '0.04em',
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}><Icon name="check" size={11} /> 獲得</span>
      )}
      {state === 'near' && remaining && (
        <span style={{
          position: 'absolute', top: 10, right: 10,
          padding: '2px 7px',
          background: T.warn, color: '#fff',
          borderRadius: 99, fontSize: 9.5, fontWeight: 700,
        }}>あと {remaining}</span>
      )}

      <BadgeIcon state={state} iconName={badge.iconName} size={64} />

      <div style={{
        fontSize: 13.5, fontWeight: 600, marginTop: 12, marginBottom: 4,
        letterSpacing: '-0.005em', color: titleColor,
      }}>{badge.label}</div>

      <div style={{
        fontSize: 11, lineHeight: 1.45, minHeight: 30,
        color: descColor,
      }}>{badge.desc}</div>

      {/* フッタ */}
      {state === 'done' ? (
        <div style={{
          marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          background: 'rgba(255,255,255,.55)',
          border: '1px solid rgba(180,83,9,.2)',
          borderRadius: 99,
          fontSize: 10.5, fontWeight: 600, color: '#92400e',
        }}>
          <Icon name="star" size={10} stroke={2} />
          達成済
        </div>
      ) : (
        <div style={{ width: '100%', marginTop: 10 }}>
          <div style={{
            height: 4, borderRadius: 99, background: T.sectionBg,
            overflow: 'hidden', marginBottom: 4,
          }}>
            <div style={{
              height: '100%', width: `${badge.progress}%`,
              background: state === 'near' ? T.warn : T.accent,
              transition: 'width 0.3s ease-out',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 10, color: T.textMuted,
            fontFamily: 'ui-monospace, SF Mono, monospace',
          }}>
            <span>{badge.value}</span>
            <span>目標 {badge.target}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function BadgeCollection({ T, viewingName, isViewingSelf, onGoToRetrospect }) {
  const [stats, setStats] = useState({ loading: true, items: [] })

  useEffect(() => {
    if (!viewingName) { setStats({ loading: false, items: [] }); return }
    let alive = true
    ;(async () => {
      // 当月の開始 / 終了 (JST)
      const now = new Date()
      const jst = new Date(now.getTime() + 9 * 3600 * 1000)
      const y = jst.getUTCFullYear(), m = jst.getUTCMonth()
      const monthStart = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0]
      const monthEnd = new Date(Date.UTC(y, m + 1, 0)).toISOString().split('T')[0]

      // 並列で各テーブルを集計
      const [tasksRes, krRes, krReviewsRes, kasRes, logsRes, chatsRes, googleRes] = await Promise.all([
        supabase.from('ka_tasks').select('id, done, due_date')
          .eq('assignee', viewingName)
          .gte('due_date', monthStart).lte('due_date', monthEnd),
        supabase.from('key_results').select('id').eq('owner', viewingName).is('archived_at', null).limit(200),
        supabase.from('kr_weekly_reviews').select('kr_id, good, more, focus, focus_output, week_start')
          .gte('week_start', monthStart).lte('week_start', monthEnd),
        supabase.from('weekly_reports').select('id, owner, good, more, focus_output, week_start')
          .eq('owner', viewingName).gte('week_start', monthStart).lte('week_start', monthEnd),
        supabase.from('coaching_logs').select('id, log_type, created_at')
          .eq('owner', viewingName).gte('created_at', `${monthStart}T00:00:00`).lte('created_at', `${monthEnd}T23:59:59`),
        supabase.from('coaching_chats').select('id, role, created_at')
          .eq('owner', viewingName).eq('role', 'user').eq('kind', 'mycoach')
          .gte('created_at', `${monthStart}T00:00:00`).lte('created_at', `${monthEnd}T23:59:59`),
        supabase.from('user_integrations').select('refresh_token').eq('owner', viewingName).eq('service', 'google').limit(1),
      ])
      if (!alive) return

      // 1. タスク完了率
      const tasks = tasksRes.data || []
      const taskRate = tasks.length > 0
        ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100)
        : 0
      // 2. KR記入率: 自分の KR × 月内の週数で「記入された個数 / 期待値」
      const krIds = new Set((krRes.data || []).map(k => k.id))
      const monthlyKrReviews = (krReviewsRes.data || []).filter(r => krIds.has(r.kr_id) &&
        ((r.good || '').trim() || (r.more || '').trim() || (r.focus || '').trim() || (r.focus_output || '').trim()))
      const weeksInMonth = Math.ceil((new Date(monthEnd).getTime() - new Date(monthStart).getTime()) / (7 * 86400000)) + 1
      const krExpected = Math.max(krIds.size * weeksInMonth, 1)
      const krRate = Math.round((monthlyKrReviews.length / krExpected) * 100)
      // 3. KA記入率: weekly_reports のうち何かしら記入された行 / 全行
      const kas = kasRes.data || []
      const kaWritten = kas.filter(k => (k.good || '').trim() || (k.more || '').trim() || (k.focus_output || '').trim())
      const kaRate = kas.length > 0 ? Math.round((kaWritten.length / kas.length) * 100) : 0
      // 4. ログイン日数: 当月の work_log のユニーク日付
      const logs = logsRes.data || []
      const workDays = new Set(logs.filter(l => l.log_type === 'work_log')
        .map(l => l.created_at?.split('T')[0])).size
      // 5. 振り返り (KPT) 日数
      const kptDays = new Set(logs.filter(l => l.log_type === 'kpt')
        .map(l => l.created_at?.split('T')[0])).size
      // 6. MyCOO 相談回数 (user role chat 件数)
      const mycooCount = (chatsRes.data || []).length
      // 7. Google 連携
      const googleConnected = !!(googleRes.data?.[0]?.refresh_token)

      const items = [
        { key: 'tasks', label: 'タスク完了率', value: `${taskRate}%`, achieved: taskRate >= 80, iconName: 'check', desc: '80%以上' },
        { key: 'kr',    label: 'KR記入率',     value: `${krRate}%`, achieved: krRate >= 80, iconName: 'target', desc: '80%以上' },
        { key: 'ka',    label: 'KA記入率',     value: `${kaRate}%`, achieved: kaRate >= 80, iconName: 'workspace', desc: '80%以上' },
        { key: 'login', label: 'ログイン',     value: `${workDays}日`, achieved: workDays >= 22, iconName: 'morning', desc: '22日以上' },
        { key: 'kpt',   label: '振り返り',     value: `${kptDays}日`, achieved: kptDays >= 22, iconName: 'refresh', desc: '22日以上' },
        { key: 'mycoo', label: 'MyCOO 相談',   value: `${mycooCount}回`, achieved: mycooCount >= 5, iconName: 'ai', desc: '5回以上' },
        { key: 'google',label: 'Google 連携',  value: googleConnected ? '完了' : '未', achieved: googleConnected, iconName: 'link', desc: '連携済' },
      ]
      setStats({ loading: false, items })
    })()
    return () => { alive = false }
  }, [viewingName])

  const achievedCount = stats.items.filter(i => i.achieved).length

  return (
    <div data-tour="ws-badge" style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 14,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ color: T.warn, display: 'inline-flex' }}>
          <Icon name="star" size={13} stroke={1.8} />
        </span>
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: T.warn, flex: 1,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>バッジコレクション</div>
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500 }}>
          {achievedCount}/7
        </span>
      </div>
      {stats.loading ? <Loading T={T} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {stats.items.map(b => (
            <div key={b.key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              background: b.achieved ? `${T.success}10` : 'transparent',
              border: `1px solid ${b.achieved ? `${T.success}40` : T.border}`,
              borderRadius: 8,
              opacity: b.achieved ? 1 : 0.7,
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 99,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: b.achieved ? T.success : T.sectionBg,
                color: b.achieved ? '#fff' : T.textMuted,
                flexShrink: 0,
              }}>
                <Icon name={b.iconName} size={14} stroke={2} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.label}
                </div>
                <div style={{ fontSize: 10, color: T.textMuted }}>
                  {b.value} / {b.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {onGoToRetrospect && (
        <button onClick={onGoToRetrospect}
          style={{
            marginTop: 10, width: '100%',
            padding: '6px 10px', border: `1px dashed ${T.border}`,
            background: 'transparent', color: T.textSub,
            borderRadius: 6, fontSize: 11, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
          }}>振り返りページで詳細を見る <Icon name="arrowRight" size={11} /></button>
      )}
    </div>
  )
}

function TeamSummaryNotification({ T, viewingMember, myName, isAdmin, levels = [], isViewingSelf, onGoToSummary }) {
  const monday = useMemo(() => getMondayJSTStr(), [])
  const [stats, setStats] = useState({ total: 0, submitted: 0, myTeams: 0, myTeamsSubmitted: 0 })
  const [loading, setLoading] = useState(true)

  // 対象チーム: 自分が責任者 + 所属
  const myTeamIds = useMemo(() => {
    const ids = new Set()
    ;(levels || []).forEach(l => {
      if (Number(l?.manager_id) === Number(viewingMember?.id)) ids.add(Number(l.id))
    })
    const memberLvls = Array.isArray(viewingMember?.sub_level_ids) ? viewingMember.sub_level_ids
      : viewingMember?.level_id ? [viewingMember.level_id] : []
    memberLvls.forEach(id => ids.add(Number(id)))
    return ids
  }, [levels, viewingMember])

  // 全社のチームレベル (事業部除く)
  const allTeamIds = useMemo(() => {
    const rootIds = new Set((levels || []).filter(l => !l.parent_id).map(l => Number(l.id)))
    return new Set((levels || []).filter(l => {
      if (!l.parent_id) return false
      if (rootIds.has(Number(l.parent_id))) return false
      return true
    }).map(l => Number(l.id)))
  }, [levels])

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data } = await supabase.from('team_weekly_summary')
        .select('level_id, good, more, focus')
        .eq('week_start', monday)
      if (!alive) return
      const submittedSet = new Set((data || []).filter(r => {
        return (r.good || '').trim() || (r.more || '').trim() || (r.focus || '').trim()
      }).map(r => Number(r.level_id)))
      const submittedTotal = [...submittedSet].filter(id => allTeamIds.has(id)).length
      const submittedMine = [...submittedSet].filter(id => myTeamIds.has(id)).length
      setStats({
        total: allTeamIds.size,
        submitted: submittedTotal,
        myTeams: myTeamIds.size,
        myTeamsSubmitted: submittedMine,
      })
      setLoading(false)
    })()
    return () => { alive = false }
  }, [monday, allTeamIds, myTeamIds])

  const myUnsubmitted = stats.myTeams - stats.myTeamsSubmitted
  const allUnsubmitted = stats.total - stats.submitted

  return (
    <div
      onClick={onGoToSummary}
      style={{
        background: T.bgCard,
        border: `1px solid ${T.accent}40`,
        borderLeft: `3px solid ${T.accent}`,
        borderRadius: 12, padding: 14,
        cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${T.accent}0a` }}
      onMouseLeave={(e) => { e.currentTarget.style.background = T.bgCard }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: T.accent, display: 'inline-flex' }}>
          <Icon name="org" size={13} stroke={1.8} />
        </span>
        <div style={{
          fontSize: 10.5, fontWeight: 700, color: T.accent, flex: 1,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>今週のチームサマリー</div>
        {!loading && stats.total > 0 && (
          <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>
            {stats.submitted}/{stats.total}
          </span>
        )}
        <Icon name="arrowRight" size={12} stroke={2} style={{ color: T.accent }} />
      </div>
      <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
        {loading ? '読み込み中...'
          : myUnsubmitted > 0
            ? `あなたの担当 ${myUnsubmitted} チーム未提出`
            : allUnsubmitted > 0
              ? `${allUnsubmitted} チーム未提出`
              : <><Icon name="check" size={13} /> 全チーム提出済み</>}
      </div>
    </div>
  )
}

// ─── 今週のチームサマリー (チーム責任者のみ編集可・Realtime同期) ─
function TeamWeeklySummaryCard({ T, viewingMember, myName, isAdmin, members = [], levels = [], isViewingSelf }) {
  const monday = useMemo(() => getMondayJSTStr(), [])

  // 管理者は全チーム (root直下の事業部レイヤーは除外、チームレベル以下) を対象に
  // 一般ユーザーは「自分が responsible なチーム」 + 「所属チーム」
  const adminTeams = useMemo(() => {
    if (!isAdmin) return []
    // ルートの id 集合 (parent_id が無い levels)
    const rootIds = new Set((levels || []).filter(l => !l?.parent_id).map(l => Number(l.id)))
    return (levels || []).filter(l => {
      if (!l || !l.parent_id) return false           // ルート (全社) 自体は除外
      if (rootIds.has(Number(l.parent_id))) return false  // 親がルート = 事業部レイヤー → 除外
      return true                                     // チームレベル (depth >= 2) のみ
    })
  }, [levels, isAdmin])

  const managerOfTeams = useMemo(() => {
    if (!viewingMember?.id) return []
    return (levels || []).filter(l => Number(l?.manager_id) === Number(viewingMember.id))
  }, [levels, viewingMember?.id])

  const memberLvlIds = useMemo(() => {
    return Array.isArray(viewingMember?.sub_level_ids) ? viewingMember.sub_level_ids
      : viewingMember?.level_id ? [viewingMember.level_id] : []
  }, [viewingMember])

  const memberTeams = useMemo(() => {
    return (levels || []).filter(l => memberLvlIds.includes(Number(l?.id)))
  }, [levels, memberLvlIds])

  // タブに出すチーム (重複除外)
  const tabTeams = useMemo(() => {
    const seen = new Set()
    const list = []
    const add = arr => arr.forEach(t => {
      if (!t || seen.has(Number(t.id))) return
      seen.add(Number(t.id))
      list.push(t)
    })
    // 自分が責任者のチーム → 所属チーム → 管理者なら全チーム
    add(managerOfTeams)
    if (isViewingSelf) add(memberTeams)
    if (isAdmin) add(adminTeams)
    return list
  }, [managerOfTeams, memberTeams, adminTeams, isViewingSelf, isAdmin])

  const [activeLevelId, setActiveLevelId] = useState(null)
  useEffect(() => {
    if (tabTeams.length === 0) { setActiveLevelId(null); return }
    if (!activeLevelId || !tabTeams.some(l => Number(l.id) === Number(activeLevelId))) {
      setActiveLevelId(tabTeams[0].id)
    }
  }, [tabTeams, activeLevelId])

  const activeLevel = useMemo(() => (levels || []).find(l => Number(l?.id) === Number(activeLevelId)), [levels, activeLevelId])
  const isManagerOfActive = !!activeLevel && Number(activeLevel.manager_id) === Number(viewingMember?.id)
  // 編集可: 自分閲覧 かつ (該当チームの責任者 or 管理者)
  const canEdit = isViewingSelf && (isManagerOfActive || isAdmin)

  if (tabTeams.length === 0) return null

  return (
    <TeamSummaryEditor T={T} levelId={activeLevelId} weekStart={monday}
      canEdit={canEdit} myName={myName} isAdmin={isAdmin}
      level={activeLevel}
      managerName={(() => {
        const mgr = activeLevel?.manager_id ? members.find(mm => Number(mm.id) === Number(activeLevel.manager_id)) : null
        return mgr?.name || null
      })()}
      tabs={tabTeams.length > 1 ? tabTeams : null}
      allLevels={levels}
      activeLevelId={activeLevelId} onSelectLevel={setActiveLevelId}
    />
  )
}

function TeamSummaryEditor({ T, levelId, weekStart, canEdit, myName, isAdmin = false, level, managerName, tabs, allLevels = [], activeLevelId, onSelectLevel }) {
  const { currentOrg } = useCurrentOrg()
  const [good, setGood] = useState('')
  const [more, setMore] = useState('')
  const [focus, setFocus] = useState('')
  const [rowId, setRowId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const focusedRef = useRef(null)
  const saveTimer = useRef(null)

  // ロード + 切替時
  useEffect(() => {
    if (!levelId || !weekStart) return
    let alive = true
    setLoading(true); setRowId(null); setGood(''); setMore(''); setFocus('')
    supabase.from('team_weekly_summary').select('*')
      .eq('level_id', levelId).eq('week_start', weekStart).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) {
          setRowId(data.id)
          if (focusedRef.current !== 'good')  setGood(data.good || '')
          if (focusedRef.current !== 'more')  setMore(data.more || '')
          if (focusedRef.current !== 'focus') setFocus(data.focus || '')
        }
        setLoading(false)
      })
    return () => { alive = false }
  }, [levelId, weekStart])

  // Realtime 購読 (team_weekly_summary)
  useEffect(() => {
    if (!levelId || !weekStart) return
    const ch = supabase.channel(`tws_${levelId}_${weekStart}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'team_weekly_summary', filter: `level_id=eq.${levelId}` },
        payload => {
          const row = payload.new || payload.old
          if (!row || row.week_start !== weekStart) return
          if (payload.eventType === 'DELETE') { setRowId(null); return }
          setRowId(row.id)
          if (focusedRef.current !== 'good')  setGood(row.good || '')
          if (focusedRef.current !== 'more')  setMore(row.more || '')
          if (focusedRef.current !== 'focus') setFocus(row.focus || '')
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [levelId, weekStart])

  const save = useCallback(async (g, m, f) => {
    setSaving(true)
    const payload = { level_id: levelId, week_start: weekStart, good: g, more: m, focus: f, updated_by: myName, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('team_weekly_summary')
      .upsert(payload, { onConflict: 'level_id,week_start' }).select().single()
    setSaving(false)
    if (error) { console.error('team summary save error:', error); return }
    if (data) { setRowId(data.id); setSaved(true); setTimeout(() => setSaved(false), 1200) }
  }, [levelId, weekStart, myName])

  const scheduleSave = (g, m, f) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(g, m, f), 800)
  }

  // AIで サマリーを自動生成 (チーム内のKR/KA週次レビューを集約)
  const generateAI = async () => {
    if (!levelId || !weekStart || aiBusy) return
    const hasContent = (good || more || focus).trim().length > 0
    if (hasContent) {
      const ok = window.confirm('現在の内容を AI 生成結果で上書きします。よろしいですか？')
      if (!ok) return
    }
    setAiBusy(true); setAiError('')
    try {
      const res = await fetch('/api/ai/team-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level_id: levelId, week_start: weekStart, organization_id: currentOrg?.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      if (j.message) { setAiError(j.message); return }
      setGood(j.good || '')
      setMore(j.more || '')
      setFocus(j.focus || '')
      // すぐ保存 (debounceスキップ)
      save(j.good || '', j.more || '', j.focus || '')
    } catch (e) {
      setAiError(e.message || 'AI生成に失敗しました')
    } finally {
      setAiBusy(false)
    }
  }

  const inputBase = {
    width: '100%', boxSizing: 'border-box',
    padding: '8px 10px', fontSize: 12, fontFamily: 'inherit',
    background: T.bgCard, color: T.text,
    border: `1px solid ${T.border}`, borderRadius: 6,
    outline: 'none', resize: 'vertical', lineHeight: 1.55,
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #ecfdf5 0%, #34d399 100%)',
      borderRadius: RADIUS.lg, padding: '14px 16px', color: '#064e3b',
      boxShadow: SHADOWS.hover(T.success),
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: 10, flexWrap:'wrap' }}>
        <span style={{ display: 'inline-flex' }}><Icon name="chart" size={16} /></span>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing:'-0.01em' }}>今週のチームサマリー</div>
        {level && (
          <span style={{
            display:'inline-flex', alignItems:'center', gap:4,
            fontSize: 10, fontWeight: 700,
            padding:'2px 8px', borderRadius: 99,
            background:'rgba(255,255,255,0.55)', color:'#064e3b',
          }}>
            <span style={{display:'inline-flex'}}><DataIcon value={level.icon} size={13} fallback="handshake"/></span>{level.name}
          </span>
        )}
        {managerName && (
          <span style={{
            fontSize: 9, fontWeight: 700,
            padding:'2px 7px', borderRadius: 99,
            background:'rgba(255,255,255,0.4)', color:'#065f46',
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><Icon name="pin" size={10} /> {managerName}</span>
        )}
        <div style={{ flex:1 }} />
        {canEdit && (
          <button onClick={generateAI} disabled={aiBusy} title="チーム内のKR/KA週次レビューを集約してAIで自動生成"
            style={{
              padding: '4px 10px', borderRadius: 7,
              background: aiBusy ? 'rgba(255,255,255,0.4)' : '#064e3b',
              color: '#fff', border: 'none',
              fontSize: 10, fontWeight: 800, fontFamily: 'inherit',
              cursor: aiBusy ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            {aiBusy ? <><Icon name="refresh" size={10} /> 生成中…</> : <><Icon name="ai" size={10} /> AIで生成</>}
          </button>
        )}
        <span style={{ fontSize: 10 }}>
          {saving && <span style={{ color:'#065f46', display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="refresh" size={10} /> 保存中…</span>}
          {saved && !saving && <span style={{ color:'#065f46', fontWeight:800, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="check" size={10} /> 保存済</span>}
        </span>
      </div>
      {aiError && (
        <div style={{
          marginBottom: 8, padding: '6px 10px', borderRadius: 6,
          background: 'rgba(255,255,255,0.6)', color: '#7f1d1d',
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: SPACING.xs,
        }}><Icon name="alert" size={11} /> {aiError}</div>
      )}
      {/* 複数チーム責任者の場合のタブ (件数によって表示形態を切替) */}
      {tabs && tabs.length > 1 && (
        <TeamTabSelector tabs={tabs} allLevels={allLevels}
          activeLevelId={activeLevelId} onSelect={onSelectLevel} />
      )}
      {canEdit && isAdmin && managerName && Number(level?.manager_id) !== undefined && (
        <div style={{ fontSize: 10, color:'#064e3b', marginBottom: 8, padding:'4px 8px', background:'rgba(255,255,255,0.45)', borderRadius:6, fontWeight:700, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
          <Icon name="star" size={11} /> 管理者として編集中 (このチームの責任者: {managerName})
        </div>
      )}
      {canEdit && isAdmin && !managerName && (
        <div style={{ fontSize: 10, color:'#064e3b', marginBottom: 8, padding:'4px 8px', background:'rgba(255,255,255,0.45)', borderRadius:6, fontWeight:700, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
          <Icon name="star" size={11} /> 管理者として編集中 (責任者未設定 — 組織ページで設定推奨)
        </div>
      )}
      {!canEdit && (
        <div style={{ fontSize: 10, color:'#065f46', marginBottom: 8, fontStyle:'italic' }}>
          {managerName ? `${managerName} さんが記入します (閲覧のみ)` : '責任者未設定 — 組織ページで設定してください'}
        </div>
      )}
      {loading ? (
        <div style={{ fontSize:11, color:'#065f46', padding:'8px 0' }}>読み込み中…</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          <FieldBlock T={T} iconName="check" label="Good — チーム全体の良かったこと" disabled={!canEdit} value={good}
            onFocus={() => { focusedRef.current = 'good' }}
            onBlur={() => { focusedRef.current = null }}
            onChange={v => { setGood(v); scheduleSave(v, more, focus) }}
            placeholder="例: 評議会クロージング3社決定 / 新メンバー受け入れがスムーズだった"
            inputBase={inputBase} />
          <FieldBlock T={T} iconName="chartDown" label="More — チーム全体の課題・改善点" disabled={!canEdit} value={more}
            onFocus={() => { focusedRef.current = 'more' }}
            onBlur={() => { focusedRef.current = null }}
            onChange={v => { setMore(v); scheduleSave(good, v, focus) }}
            placeholder="例: 商談化率が伸び悩み / オンボーディングの遅延"
            inputBase={inputBase} />
          <FieldBlock T={T} iconName="target" label="Focus — 来週のチーム注力" disabled={!canEdit} value={focus}
            onFocus={() => { focusedRef.current = 'focus' }}
            onBlur={() => { focusedRef.current = null }}
            onChange={v => { setFocus(v); scheduleSave(good, more, v) }}
            placeholder="例: 火曜の評議会で残2社クロージング / 木曜にKPI再設計"
            inputBase={inputBase} />
        </div>
      )}
    </div>
  )
}

// ─── タブセレクタ (件数に応じてタブ / 階層の2行 を切替) ────
function TeamTabSelector({ tabs, allLevels = [], activeLevelId, onSelect }) {
  // 件数が少ない場合は単純な横並びタブ
  if (tabs.length <= 6) {
    return (
      <div style={{ display:'flex', gap: 4, marginBottom: 10, flexWrap:'wrap' }}>
        {tabs.map(t => {
          const a = Number(t.id) === Number(activeLevelId)
          return (
            <button key={t.id} onClick={() => onSelect(t.id)} style={{
              padding: '4px 10px', borderRadius: 7, border: 'none',
              background: a ? '#064e3b' : 'rgba(255,255,255,0.55)',
              color: a ? '#fff' : '#065f46',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}><DataIcon value={t.icon} size={13} fallback="handshake"/> {t.name}</button>
          )
        })}
      </div>
    )
  }

  // 多い場合: 事業部 (parent) でグループ化して 2 行構成
  const levelById = useMemo(() => {
    const m = new Map()
    ;(allLevels || []).forEach(l => l && m.set(Number(l.id), l))
    return m
  }, [allLevels])

  // tabs を parent_id でグルーピング (parent が tabs にあれば「事業部単位」、無ければ root直下に "その他")
  const groups = useMemo(() => {
    const byParent = new Map()
    for (const t of tabs) {
      // parent: tabs自体の parent_id を持つ levelを優先、無ければ自分自身を親グループの代表に
      const parentId = t.parent_id ? Number(t.parent_id) : null
      const parent = parentId ? levelById.get(parentId) : null
      const key = parentId || `__self_${t.id}`
      if (!byParent.has(key)) {
        byParent.set(key, {
          key,
          parent,           // null なら parent 取得不能
          parentName: parent?.name || (t.parent_id ? '?' : '事業部レベル'),
          parentIcon: parent?.icon || '📁',
          children: [],
        })
      }
      byParent.get(key).children.push(t)
    }
    return Array.from(byParent.values())
  }, [tabs, levelById])

  // 選択中タブの parent group を特定
  const activeGroupKey = useMemo(() => {
    const found = groups.find(g => g.children.some(c => Number(c.id) === Number(activeLevelId)))
    return found?.key || groups[0]?.key
  }, [groups, activeLevelId])

  const [openGroup, setOpenGroup] = useState(activeGroupKey)
  useEffect(() => { setOpenGroup(activeGroupKey) }, [activeGroupKey])

  return (
    <div style={{ marginBottom: 10 }}>
      {/* 1段目: 事業部 (グループ) */}
      <div style={{ display:'flex', gap: 4, flexWrap:'wrap', marginBottom: 6 }}>
        {groups.map(g => {
          const a = g.key === openGroup
          return (
            <button key={g.key} onClick={() => setOpenGroup(g.key)} style={{
              padding: '4px 10px', borderRadius: 7, border: 'none',
              background: a ? '#064e3b' : 'rgba(255,255,255,0.55)',
              color: a ? '#fff' : '#065f46',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              display:'inline-flex', alignItems:'center', gap: 4,
            }}>
              <span>{g.parentIcon}</span>
              <span>{g.parentName}</span>
              <span style={{
                padding: '0 6px', borderRadius: 99,
                background: a ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.45)',
                color: a ? '#fff' : '#065f46',
                fontSize: 9, fontWeight: 800,
              }}>{g.children.length}</span>
            </button>
          )
        })}
      </div>
      {/* 2段目: 選択中グループのチーム */}
      {(() => {
        const group = groups.find(g => g.key === openGroup) || groups[0]
        if (!group) return null
        return (
          <div style={{
            display:'flex', gap: 4, flexWrap:'wrap',
            padding: '6px 8px', borderRadius: 8,
            background: 'rgba(255,255,255,0.35)',
          }}>
            {group.children.map(t => {
              const a = Number(t.id) === Number(activeLevelId)
              return (
                <button key={t.id} onClick={() => onSelect(t.id)} style={{
                  padding: '3px 9px', borderRadius: 6, border: 'none',
                  background: a ? '#10b981' : 'rgba(255,255,255,0.8)',
                  color: a ? '#fff' : '#065f46',
                  fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}><DataIcon value={t.icon} size={13} fallback="handshake"/> {t.name}</button>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}

function FieldBlock({ T, label, iconName, value, onChange, onFocus, onBlur, placeholder, disabled, inputBase }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#065f46', marginBottom: 4, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>{iconName && <Icon name={iconName} size={11} />} {label}</div>
      <textarea value={value} placeholder={placeholder} rows={2}
        disabled={disabled} onFocus={onFocus} onBlur={onBlur}
        onChange={e => onChange(e.target.value)}
        style={inputBase} />
    </div>
  )
}

// ─── ポップなゴールカード ─────────────────────────────────
function PopGoalCard({ T, icon, title, gradient, accent, value, loading, canEdit, placeholder, onSave, iconName }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  function startEdit() { setDraft(value || ''); setEditing(true) }
  async function commit() {
    setSaving(true); await onSave(draft); setSaving(false); setEditing(false)
  }
  // Dashboard cleanup ハンドオフ:
  //   多色パステル背景は廃止し、白カード + caption + ライン Icon に統一。
  //   iconName が指定されていれば Icon コンポーネント描画、なければ従来絵文字 (互換)
  return (
    <div style={{
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: 14,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {iconName ? (
          <span style={{ color: T.textMuted, display: 'inline-flex' }}>
            <Icon name={iconName} size={12} stroke={1.8} />
          </span>
        ) : (
          <span style={{ fontSize: 13, lineHeight: 1, color: T.textMuted }}>{icon}</span>
        )}
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: T.textMuted, flex: 1,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>{title}</div>
        {canEdit && !editing && (
          <button onClick={startEdit} title="編集" style={{
            background: 'transparent', border: `1px solid ${T.border}`, color: T.textSub,
            borderRadius: 6, padding: '2px 7px', fontSize: 10, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 500,
          }}>編集</button>
        )}
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: T.textMuted }}>読み込み中...</div>
      ) : editing ? (
        <div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            placeholder={placeholder}
            style={{
              width: '100%', padding: 8, background: T.bg,
              border: `1px solid ${T.border}`, borderRadius: 6, color: T.text,
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
            <button onClick={() => setEditing(false)} disabled={saving} style={{
              background: 'transparent', border: `1px solid ${T.border}`, color: T.textSub,
              borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>キャンセル</button>
            <button onClick={commit} disabled={saving} style={{
              background: T.accent, border: 'none', color: '#fff',
              borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}>保存</button>
          </div>
        </div>
      ) : value ? (
        <div style={{
          fontSize: 13, color: T.text, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        }}>{value}</div>
      ) : (
        <div style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>
          {canEdit ? `${placeholder} (編集 で記入)` : '未設定'}
        </div>
      )}
    </div>
  )
}

// ─── KPT入力モーダル ───────────────────────────────────────────────────────
// force=true: 朝の昨日強制KPT用。キャンセル不可 + 終業時刻入力 + 最低1項目必須
function KPTModal({ T, busy, onCancel, onSave, startedAt, force = false, yesterdayDateStr, pendingDateISO, todayISO }) {
  const [keep, setKeep] = useState('')
  const [problem, setProblem] = useState('')
  const [tryNote, setTryNote] = useState('')
  const [endTimeHHMM, setEndTimeHHMM] = useState('18:00')
  // 振り返りの「対象日」。既定は未終業ログの勤務日。公欠/始業忘れ等は本人が選び直す。
  const [reflectionDate, setReflectionDate] = useState(pendingDateISO || todayISO || '')
  // 対象日の選択肢 (未終業日〜今日) に (今日)(昨日)(おととい)(N日前) の相対ラベルを自動付与
  const dayOptions = useMemo(() => {
    if (!force || !pendingDateISO || !todayISO) return []
    const toUTC = (iso) => { const [y, mo, d] = iso.split('-').map(Number); return Date.UTC(y, mo - 1, d) }
    const todayMs = toUTC(todayISO)
    const WD = ['日','月','火','水','木','金','土']
    const out = []
    let cur = pendingDateISO
    for (let i = 0; i < 31 && cur <= todayISO; i++) {
      const [y, mo, d] = cur.split('-').map(Number)
      const wd = WD[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
      const diff = Math.round((todayMs - toUTC(cur)) / 86400000)
      const rel = diff === 0 ? '今日' : diff === 1 ? '昨日' : diff === 2 ? 'おととい' : `${diff}日前`
      const tags = [rel]
      if (cur === pendingDateISO) tags.push('未終業')
      out.push({ value: cur, label: `${mo}/${d}(${wd}) ・${tags.join(' ・')}` })
      const nx = new Date(Date.UTC(y, mo - 1, d + 1))
      cur = `${nx.getUTCFullYear()}-${String(nx.getUTCMonth()+1).padStart(2,'0')}-${String(nx.getUTCDate()).padStart(2,'0')}`
    }
    return out
  }, [force, pendingDateISO, todayISO])
  const selectedLabel = (dayOptions.find(o => o.value === reflectionDate) || {}).label || yesterdayDateStr || ''

  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const dateStr = yesterdayDateStr ||
    `${jst.getUTCMonth()+1}/${jst.getUTCDate()}(${['日','月','火','水','木','金','土'][jst.getUTCDay()]})`
  const worked = !force && startedAt ? (() => {
    const mins = Math.floor((now - new Date(startedAt)) / 60000)
    const h = Math.floor(mins / 60), m = mins % 60
    return `${h}時間${m}分`
  })() : ''

  const fieldStyle = {
    width: '100%', minHeight: 70, padding: 10,
    background: T.sectionBg, border: `1px solid ${T.borderMid}`,
    borderRadius: 6, color: T.text, fontSize: 13, fontFamily: 'inherit',
    resize: 'vertical', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4, display: 'block' }
  const hintStyle = { fontSize: 10, color: T.textMuted, marginTop: 2, marginBottom: 6 }

  const hasAny = (keep||'').trim() || (problem||'').trim() || (tryNote||'').trim()
  const canSave = force ? hasAny : true  // forceでは最低1項目必須

  return (
    <div
      onClick={force ? undefined : onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 20,
        animation: 'kptModalFadeIn 0.2s ease',
      }}
    >
      <style>{`
        @keyframes kptModalFadeIn { from {opacity:0} to {opacity:1} }
        @keyframes kptModalSlide { from {transform:translateY(20px); opacity:0} to {transform:translateY(0); opacity:1} }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bgCard, borderRadius: RADIUS.xl,
          padding: 24, width: '100%', maxWidth: 540, maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: SHADOWS.xl,
          animation: 'kptModalSlide 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              background: force
                ? `linear-gradient(135deg, ${T.warn} 0%, ${T.warn}c0 100%)`
                : `linear-gradient(135deg, ${T.info} 0%, ${T.info}c0 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, color: '#fff',
              boxShadow: force ? `0 2px 6px ${T.warn}55` : `0 2px 6px ${T.info}55`,
            }}>{force ? <Icon name="alert" size={18} /> : <Icon name="clock" size={18} />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>
                {force ? '振り返りの記入' : '今日の振り返り'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: force ? T.warn : T.textMuted, marginTop: 3 }}>
                {force
                  ? <>対象日: {selectedLabel} の振り返り</>
                  : `${dateStr}${worked ? ` · 稼働 ${worked}` : ''}`}
              </div>
            </div>
          </div>
          {force && (
            <div style={{
              marginTop: 10, padding: '8px 12px',
              background: T.warnBg, color: T.warn,
              fontSize: 12, borderRadius: 9, lineHeight: 1.5, fontWeight: 600,
            }}>
              {yesterdayDateStr} の勤務が終業されていません。振り返りを入力すると今日を始業できます。<br />
              この振り返りは <strong>{selectedLabel}</strong> の分として保存されます。別の日なら下の「対象日」を選び直してください。
            </div>
          )}
        </div>

        {force && dayOptions.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="calendar" size={12} /> この振り返りの対象日</label>
            <div style={hintStyle}>「いつの振り返りか」を選んでください（既定: 未終業の {yesterdayDateStr}）</div>
            <select
              value={reflectionDate}
              onChange={e => setReflectionDate(e.target.value)}
              style={{
                padding: '7px 10px', background: T.sectionBg,
                border: `1px solid ${T.borderMid}`, borderRadius: 6,
                color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', minWidth: 200,
              }}
            >
              {dayOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {force && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="clock" size={12} /> 終業時刻 (JST)</label>
            <input
              type="time"
              value={endTimeHHMM}
              onChange={e => setEndTimeHHMM(e.target.value)}
              style={{
                padding: '6px 10px', background: T.sectionBg,
                border: `1px solid ${T.borderMid}`, borderRadius: 6,
                color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: T.success, flexShrink: 0 }} /> Keep（良かったこと・続けたいこと）</label>
          <div style={hintStyle}>成果・学び・上手くいったこと</div>
          <textarea value={keep} onChange={e => setKeep(e.target.value)} style={fieldStyle} placeholder="例: やずや提案の構成が整理できた" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: T.warn, flexShrink: 0 }} /> Problem（課題・うまくいかなかったこと）</label>
          <div style={hintStyle}>詰まった点・改善したいこと</div>
          <textarea value={problem} onChange={e => setProblem(e.target.value)} style={fieldStyle} placeholder="例: 午前中の集中が途切れやすかった" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: T.info, flexShrink: 0 }} /> Try（明日以降に試したいこと）</label>
          <div style={hintStyle}>次のアクション</div>
          <textarea value={tryNote} onChange={e => setTryNote(e.target.value)} style={fieldStyle} placeholder="例: 朝イチ90分はSlack off で提案書に集中する" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {!force && (
            <button
              onClick={onCancel}
              disabled={busy}
              style={{
                background: 'transparent', border: `1px solid ${T.borderMid}`, color: T.textSub,
                borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >キャンセル</button>
          )}
          <button
            onClick={() => onSave({ keep, problem, tryNote, endTimeHHMM, reflectionDate })}
            disabled={busy || !canSave}
            style={{
              background: canSave ? T.info : T.border,
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 18px', fontSize: 13, fontWeight: 700,
              cursor: busy || !canSave ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: busy ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}
          >{force ? <><Icon name="check" size={13} /> 保存して終業</> : <><Icon name="check" size={13} /> 保存して終業</>}</button>
        </div>
      </div>
    </div>
  )
}

// ─── 全社サマリー: タスクタブ ──────────────────────────────────────────
// 「本日」「全て」のタブで切替える:
//   ・本日 = 本日の全メンバーのタスク状況 (達成率/稼働/遅延/メンバー別)
//   ・全て = 全社タスクをリスト/カード/ガントで一覧 (メンバーサイドバーは非表示)
function CompanyTasksView({ T, members, themeKey, user, fiscalYear }) {
  const [mode, setMode] = useState('today') // 'today' | 'all'
  const TABS = [
    { key: 'today', icon: 'chart', label: '本日' },
    { key: 'all',   icon: 'note',  label: '全て' },
  ]
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 本日 / 全て 切替 */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderBottom: `1px solid ${T.border}`, background: T.sectionBg,
      }}>
        {TABS.map(t => {
          const active = mode === t.key
          return (
            <button key={t.key} onClick={() => setMode(t.key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              ...(active ? btnBrand({ size: 'sm' }) : {
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: 'transparent', color: T.textSub,
              }),
              padding: '7px 14px', borderRadius: RADIUS.sm,
              fontSize: 12.5, fontWeight: 500,
            }}>
              <Icon name={t.icon} size={13} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>
      {/* コンテンツ */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {mode === 'today' ? (
          <CompanySummaryTab T={T} members={members} />
        ) : (
          <MyTasksPage
            user={user}
            members={members}
            themeKey={themeKey}
            lockViewMode="all"
            hideMemberSidebar
            fiscalYear={fiscalYear}
          />
        )}
      </div>
    </div>
  )
}

// ─── 全社サマリー: 全員の今日のタスクと達成率を可視化 ──────────────────
function CompanySummaryTab({ T, members }) {
  const [tasks, setTasks] = useState([])
  const [overdueTasks, setOverdueTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = toJSTDateStr(new Date())
  const todayLabel = (() => {
    const j = new Date(Date.now() + 9 * 3600 * 1000)
    return `${j.getUTCMonth() + 1}/${j.getUTCDate()}(${['日','月','火','水','木','金','土'][j.getUTCDay()]})`
  })()

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const cols = 'id, title, assignee, assignee_email, due_date, done, status'
    const colsNoEmail = 'id, title, assignee, due_date, done, status'
    const fetchBoth = (sel) => Promise.all([
      supabase.from('ka_tasks').select(sel).eq('due_date', today).order('assignee').order('id', { ascending: false }),
      supabase.from('ka_tasks').select(sel).lt('due_date', today).order('assignee').order('due_date', { ascending: true }),
    ])
    let [todayRes, overdueRes] = await fetchBoth(cols)
    // assignee_email 列が無い環境向けフォールバック (列なしで再取得)
    if ((todayRes.error || overdueRes.error) && /assignee_email|column/i.test((todayRes.error || overdueRes.error).message || '')) {
      ;[todayRes, overdueRes] = await fetchBoth(colsNoEmail)
    }
    if (todayRes.error || overdueRes.error) {
      setError((todayRes.error || overdueRes.error).message)
      setTasks([]); setOverdueTasks([]); setLoading(false); return
    }
    setTasks(todayRes.data || [])
    // 未完了のみを遅延とみなす (done フラグ or status='done' を除外)
    setOverdueTasks((overdueRes.data || []).filter(t => !t.done && t.status !== 'done'))
    setLoading(false)
  }, [today])

  useEffect(() => { load() }, [load])

  // メンバー別に集計
  const byMember = useMemo(() => {
    // 表示名ではなく email を優先キーにして同一人物のタスクを 1 グループへ集約
    // (名前の表記揺れ・別アプリ由来でも email が一致すれば 1 人にまとまる)
    const emailToMember = new Map(); const nameToMember = new Map()
    for (const m of (members || [])) {
      if (m.email) emailToMember.set(m.email.toLowerCase(), m)
      nameToMember.set(m.name, m)
    }
    const resolve = (t) => {
      const em = (t.assignee_email || '').toLowerCase()
      const member = (em && emailToMember.get(em)) || nameToMember.get(t.assignee) || { name: t.assignee || em || '(不明)' }
      const key = member.id != null ? `id:${member.id}` : (em ? `em:${em}` : `nm:${t.assignee}`)
      return { key, member }
    }
    const map = new Map()
    for (const m of (members || [])) map.set(`id:${m.id}`, { member: m, tasks: [], overdue: [] })
    for (const t of tasks) {
      if (!t.assignee && !t.assignee_email) continue
      const { key, member } = resolve(t)
      if (!map.has(key)) map.set(key, { member, tasks: [], overdue: [] })
      map.get(key).tasks.push(t)
    }
    for (const t of overdueTasks) {
      if (!t.assignee && !t.assignee_email) continue
      const { key, member } = resolve(t)
      if (!map.has(key)) map.set(key, { member, tasks: [], overdue: [] })
      map.get(key).overdue.push(t)
    }
    // 今日のタスク or 遅延タスクがあるメンバーだけ抽出 + sort_order 順
    const arr = Array.from(map.values()).filter(x => x.tasks.length > 0 || x.overdue.length > 0)
    arr.sort((a, b) => (a.member.sort_order ?? 999) - (b.member.sort_order ?? 999) || (a.member.name || '').localeCompare(b.member.name || ''))
    return arr
  }, [tasks, overdueTasks, members])

  // 全体集計
  const totalTasks = tasks.length
  const totalDone = tasks.filter(t => t.done || t.status === 'done').length
  const overallPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0
  const totalOverdue = overdueTasks.length

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px' }}>
        {/* ヘッダ */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, flexWrap: 'wrap',
        }}>
          <h2 style={{ ...TYPO.title1, color: T.text, margin: 0, display: 'flex', alignItems: 'center', gap: SPACING.sm }}><Icon name="chart" size={20} /> 全社サマリー</h2>
          <div style={{ ...TYPO.subhead, color: T.textMuted, fontWeight: 500 }}>{todayLabel} 時点</div>
          <div style={{ flex: 1 }} />
          <button onClick={load} disabled={loading} style={{
            ...btnSecondary({ T, size: 'sm' }),
            cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}>{loading ? '更新中…' : <><Icon name="refresh" size={12} /> 再取得</>}</button>
        </div>

        {/* 全体統計バー */}
        <div style={{
          ...cardStyle({ T, padding: `${SPACING.lg}px ${SPACING.xl}px` }),
          marginBottom: SPACING.lg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ ...TYPO.subhead, color: T.text, marginBottom: SPACING.sm }}>
                本日の全社達成率
              </div>
              <div style={progressBarStyle({ T, height: 6 })}>
                <div style={progressFillStyle({ color: T.warn, value: overallPct })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              <Stat T={T} label="達成率" value={`${overallPct}%`} color={T.warn} />
              <Stat T={T} label="完了" value={totalDone} color={T.text} />
              <Stat T={T} label="残り" value={totalTasks - totalDone} color={T.text} />
              <Stat T={T} label="合計" value={totalTasks} color={T.text} />
              <Stat T={T} label="遅延" value={totalOverdue} color={totalOverdue > 0 ? T.danger : T.text} />
            </div>
          </div>
        </div>

        {/* メンバー別 */}
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
            読み込み中...
          </div>
        ) : error ? (
          <div style={{ padding: 14, color: T.danger, fontSize: 12, background: T.dangerBg, borderRadius: 8, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
            <Icon name="alert" size={12} /> {error}
          </div>
        ) : byMember.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 12,
            background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: 12,
          }}>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: T.textMuted }}><Icon name="note" size={28} /></div>
            本日のタスク・遅延タスクは登録されていません<br />
            <span style={{ fontSize: 10 }}>各メンバーが始業時にタスクを登録すると、ここに集約されます</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: SPACING.lg }}>
            {byMember.map(({ member, tasks: ts, overdue }) => {
              const done = ts.filter(t => t.done || t.status === 'done').length
              const pct = ts.length > 0 ? Math.round((done / ts.length) * 100) : 0
              const hasToday = ts.length > 0
              const color = !hasToday ? T.textMuted
                : pct >= 80 ? T.success : pct >= 50 ? T.info : pct > 0 ? T.warn : T.danger
              return (
                <div key={member.name} style={{
                  ...cardStyle({ T, padding: 0 }),
                }}>
                  {/* メンバーヘッダ */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: `${SPACING.md + 2}px ${SPACING.lg}px`,
                    borderBottom: `1px solid ${T.border}`,
                  }}>
                    <Avatar member={member} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{member.name}</div>
                        {overdue.length > 0 && (
                          <span style={pillStyle({ color: T.danger, size: 'sm' })}>
                            <Icon name="alert" size={9} /> 遅延 {overdue.length}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted }}>
                        {member.role || ''}
                      </div>
                    </div>
                    {hasToday && (
                      <div style={{
                        fontSize: 18, fontWeight: 700,
                        fontFamily: 'ui-monospace, SF Mono, monospace',
                        color: pct > 0 ? color : T.textMuted,
                      }}>{pct}%</div>
                    )}
                  </div>

                  {/* 遅延タスク一覧 (未完了のみ) */}
                  {overdue.length > 0 && (
                    <div style={{
                      padding: `${SPACING.sm + 2}px ${SPACING.lg}px`,
                      borderBottom: ts.length > 0 ? `1px solid ${T.border}` : 'none',
                    }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 700, color: T.danger,
                        marginBottom: SPACING.xs, letterSpacing: '0.04em',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <Icon name="alert" size={11} /> 遅延タスク ({overdue.length}件)
                      </div>
                      <div style={{ margin: `0 -${SPACING.lg}px` }}>
                        <TaskList T={T} tasks={overdue} canEdit={false} showDue />
                      </div>
                    </div>
                  )}

                  {/* 今日のタスク一覧 */}
                  {ts.length > 0 && (
                    <div style={{
                      padding: `${SPACING.sm + 2}px ${SPACING.lg}px`,
                      background: 'rgba(15,23,42,.02)',
                    }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 700, color: T.textSub,
                        marginBottom: SPACING.xs, letterSpacing: '0.04em',
                      }}>
                        本日のタスク
                      </div>
                      <div style={{ margin: `0 -${SPACING.lg}px` }}>
                        <TaskList T={T} tasks={ts} canEdit={false} showDue />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ T, label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 50 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1, fontFamily: 'ui-monospace, SF Mono, monospace', letterSpacing: '-0.01em' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: T.textMuted, fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

function Section({ T, icon, title, children, flex = 1, headerRight = null, accent, dataTour }) {
  const isMobile = useIsMobile()
  // flex=0 の場合は内容に合わせて自動サイズ (flex-basis:0 の罠を回避)
  // flex>=1 の場合は grow して親の残りスペースを埋める
  // モバイルでは常に自動サイズ (外側スクロール + 中身フルハイト)
  const isAutoSize = isMobile || flex === 0 || flex === 'none'
  // Glass: cardStyle で半透明白 + backdrop-blur + 罫線アクセント
  const base = cardStyle({ T, padding: 0 })
  const outerStyle = isAutoSize
    ? { ...base, flex: '0 0 auto', display: 'flex', flexDirection: 'column' }
    : { ...base, flex, minHeight: 0, display: 'flex', flexDirection: 'column' }
  const innerStyle = isAutoSize
    ? { padding: isMobile ? '12px 14px' : '10px 14px' }
    : { flex: 1, overflowY: 'auto', padding: '10px 14px', minHeight: 0 }
  // icon は文字列 (絵文字) も ReactNode (<Icon />) も受け取れる
  const isEmoji = typeof icon === 'string'
  return (
    <div data-tour={dataTour} style={outerStyle}>
      <div style={sectionHeaderStyle({ T, accent })}>
        {icon && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: RADIUS.sm,
            background: accent ? `${accent}1f` : T.sectionBg,
            color: accent || T.textSub,
            fontSize: isEmoji ? 14 : undefined, lineHeight: 1,
          }}>{icon}</span>
        )}
        <span style={{ flex: 1 }}>{title}</span>
        {headerRight}
      </div>
      <div style={innerStyle}>
        {children}
      </div>
    </div>
  )
}

// ─── 振り返りタブ：KPT + work_log の時系列一覧 ──────────────────────
function RetrospectTab({ T, viewingName, viewingMember, myName, isAdmin = false, members = [] }) {
  const isMobile = useIsMobile()
  const [subTab, setSubTab] = useState('retrospect') // 'retrospect' | 'badges'
  const [range, setRange] = useState('week') // 'week' | 'month' | 'all'

  // ─── アクセス権限ガード ──────────────────────────────────────────
  // 振り返りページの閲覧可能者:
  //   - 自分 (myName === viewingName)
  //   - 管理者 (isAdmin)
  //   - 上司 (= monthly_1on1.supervisor として指定された本人)
  // それ以外は「閲覧権限がありません」画面に
  const [accessAllowed, setAccessAllowed] = useState(null)  // null=判定中 / true / false
  useEffect(() => {
    if (!viewingName) { setAccessAllowed(false); return }
    if (!myName) { setAccessAllowed(null); return }
    if (myName === viewingName || isAdmin) { setAccessAllowed(true); return }
    // 上司判定: 当月の monthly_1on1.supervisor が myName と一致するか
    const jst = new Date(Date.now() + 9 * 3600 * 1000)
    const month = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`
    let alive = true
    supabase.from('monthly_1on1').select('supervisor')
      .eq('owner', viewingName).eq('month', month).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setAccessAllowed(!!(data?.supervisor && data.supervisor === myName))
      })
    return () => { alive = false }
  }, [viewingName, myName, isAdmin])
  const [data, setData] = useState({ days: [], loading: true, taskStats: { onTime: 0, overdue: 0 }, kptSummary: { keep: [], problem: [], try: [] } })

  const load = useCallback(async () => {
    if (!viewingName) { setData({ days: [], loading: false, taskStats: { onTime: 0, overdue: 0 }, kptSummary: { keep: [], problem: [], try: [] } }); return }
    setData(d => ({ ...d, loading: true }))

    const now = new Date()
    const today = toJSTDateStr(now)
    const rangeStart = (() => {
      if (range === 'all') return null
      if (range === 'month') {
        const jst = new Date(now.getTime() + 9 * 3600 * 1000)
        const firstOfMonth = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1))
        return firstOfMonth.toISOString()
      }
      // week
      const monday = new Date(getMondayJSTStr() + 'T00:00:00Z')
      return monday.toISOString()
    })()
    const rangeStartDateOnly = rangeStart ? rangeStart.slice(0, 10) : null

    let q = supabase.from('coaching_logs')
      .select('*')
      .eq('owner', viewingName)
      .in('log_type', ['kpt', 'work_log'])
      .order('created_at', { ascending: false })
    if (rangeStart) q = q.gte('created_at', rangeStart)

    // タスク統計取得 (期間内に due_date があるタスク)
    let tasksQ = supabase.from('ka_tasks').select('id, title, due_date, done').eq('assignee', viewingName)
    if (rangeStartDateOnly) tasksQ = tasksQ.gte('due_date', rangeStartDateOnly)

    const [logsRes, tasksRes] = await Promise.all([q, tasksQ])
    const rows = logsRes.data
    const tasks = tasksRes.data || []

    // タスク統計
    let onTime = 0, overdue = 0
    tasks.forEach(t => {
      if (t.done) {
        // 完了タスクは「期限内完了」とみなす (done時刻カラムが無いため)
        onTime += 1
      } else if (t.due_date && t.due_date < today) {
        // 未完了 & 期限超過
        overdue += 1
      }
    })

    // 日付ごとにまとめる (JST日付)
    const byDate = {}
    ;(rows || []).forEach(row => {
      const dateKey = toJSTDateStr(new Date(row.created_at))
      if (!byDate[dateKey]) byDate[dateKey] = { date: dateKey, workLog: null, kpts: [] }
      const content = parseLogContent(row.content)
      if (row.log_type === 'work_log') {
        if (!byDate[dateKey].workLog) byDate[dateKey].workLog = { ...content, id: row.id }
      } else if (row.log_type === 'kpt') {
        byDate[dateKey].kpts.push({ ...content, id: row.id, created_at: row.created_at })
      }
    })

    // KPT 集約 (keep/problem/try それぞれの記入を全部集める)
    const kptSummary = { keep: [], problem: [], try: [] }
    Object.values(byDate).forEach(d => {
      d.kpts.forEach(k => {
        if ((k.keep || '').trim()) kptSummary.keep.push({ text: k.keep.trim(), date: d.date })
        if ((k.problem || '').trim()) kptSummary.problem.push({ text: k.problem.trim(), date: d.date })
        if ((k.try || '').trim()) kptSummary.try.push({ text: k.try.trim(), date: d.date })
      })
    })

    const days = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date))
    setData({ days, loading: false, taskStats: { onTime, overdue }, kptSummary })
  }, [viewingName, range])

  useEffect(() => { load() }, [load])

  const totalDays = data.days.length
  const totalMinutes = data.days.reduce((sum, d) => {
    if (d.workLog?.start_at && d.workLog?.end_at) {
      return sum + Math.floor((new Date(d.workLog.end_at) - new Date(d.workLog.start_at)) / 60000)
    }
    return sum
  }, 0)
  const totalHrs = Math.floor(totalMinutes / 60), totalMins = totalMinutes % 60

  // アクセス権限判定中 (= myName / 上司情報を取得中)
  if (accessAllowed === null) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
        <div style={{ fontSize: 12, color: T.textMuted }}>権限を確認中…</div>
      </div>
    )
  }
  // アクセス権限なし
  if (accessAllowed === false) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: 24 }}>
        <div style={{
          textAlign: 'center', maxWidth: 360,
          padding: 28, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
        }}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: T.textMuted }}><Icon name="alert" size={36} /></div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            このメンバーの振り返りは閲覧できません
          </div>
          <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.7 }}>
            振り返りページは本人・上司 (= 当月の supervisor) ・管理者だけが閲覧できます。<br />
            ご自身の振り返りは左メンバー一覧から自分を選択してください。
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: isMobile ? '8px 10px' : '10px 16px', background: T.sectionBg,
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}>
        <Avatar member={viewingMember} size={isMobile ? 24 : 28} />
        <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color: T.text, flex: isMobile ? 1 : 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {viewingName} さんの振り返り
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        {!isMobile && (
          <div style={{ fontSize: 11, color: T.textMuted, marginRight: 10 }}>
            {totalDays}日の記録 · 合計 {totalHrs}時間{totalMins}分
          </div>
        )}
        <SegmentedControl T={T} size="sm" value={range} onChange={setRange}
          items={[
            { key: 'week',  label: '今週' },
            { key: 'month', label: '今月' },
            { key: 'all',   label: '全期間' },
          ]} />
        <button onClick={load} title="再読み込み" style={{
          background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
          borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
        }}><Icon name="refresh" size={11} /></button>
        {isMobile && (
          <div style={{ fontSize: 10, color: T.textMuted, width: '100%' }}>
            {totalDays}日 · 合計 {totalHrs}時間{totalMins}分
          </div>
        )}
      </div>

      {/* サブタブ: 振り返り / 1on1 / バッジコレクション */}
      <div style={{
        display: 'flex', gap: 4, padding: '6px 14px',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        {[
          { key: 'retrospect', icon: 'msg', label: '振り返り' },
          { key: 'oneonone',   icon: 'user', label: '1on1' },
          { key: 'badges',     icon: 'medal', label: 'バッジコレクション' },
        ].map(t => {
          const active = subTab === t.key
          return (
            <button key={t.key} onClick={() => setSubTab(t.key)} style={{
              padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: active ? T.navActiveBg : 'transparent',
              color: active ? T.navActiveText : T.textSub,
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name={t.icon} size={12} /> {t.label}</button>
          )
        })}
      </div>

      {/* 本体 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {subTab === 'badges' ? (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <BadgeCollectionDetail T={T} viewingName={viewingName} />
          </div>
        ) : subTab === 'oneonone' ? (
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <Monthly1on1Card T={T} viewingName={viewingName} myName={myName} members={members} />
          </div>
        ) : data.loading ? <Loading T={T} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, margin: '0 auto' }}>
            {/* ストリークバナー (連続記入日数 + 当月ヒートマップ) */}
            <StreakBanner T={T} viewingName={viewingName} />

            {/* 今日の 3 つの問い (Keep / Problem / Try の問いかけ式フォーム) */}
            <ThreeQuestions T={T} viewingName={viewingName} canEdit={myName === viewingName} myName={myName} />

            {/* サマリー: タスク統計 + KPT 集約 */}
            <RetrospectSummary T={T} stats={data.taskStats} kpt={data.kptSummary} range={range} />

            {/* 日別ログ */}
            {data.days.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.textMuted, fontSize: 12 }}>
                <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><Icon name="msg" size={32} /></div>
                <div>この期間のKPT記録はまだありません</div>
                <div style={{ marginTop: 6, fontSize: 10 }}>
                  ダッシュボードの「<Icon name="clock" size={10} style={{ verticalAlign: 'middle' }} /> 終業する」でKPTを記入すると、ここに蓄積されます
                </div>
              </div>
            ) : (
              data.days.map(d => <RetrospectDay key={d.date} T={T} day={d} />)
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StreakBanner: 連続記入日数 + 当月ヒートマップ ──────────────────────
function StreakBanner({ T, viewingName }) {
  const [data, setData] = useState({ loading: true, current: 0, best: 0, monthDays: [], thisMonthCount: 0, totalMonthDays: 0 })
  useEffect(() => {
    if (!viewingName) return
    let alive = true
    ;(async () => {
      // 過去 90 日の kpt log を取得 → 日次に集約
      const ninety = new Date(Date.now() - 90 * 86400000).toISOString()
      const { data: logs } = await supabase.from('coaching_logs')
        .select('created_at, log_type')
        .eq('owner', viewingName).eq('log_type', 'kpt')
        .gte('created_at', ninety)
      const writtenDays = new Set((logs || []).map(l => toJSTDateStr(new Date(l.created_at))))

      // 連続記入日数 (平日のみ集計。土日は跨いでもストリーク途切れない)
      //   - 土日は記入が無くても streak を切らない (cursor をそのまま遡る)
      //   - 直近の平日に記入があれば streak を加算、無ければそこで止める
      const today = toJSTDateStr(new Date())
      let cur = 0
      const cursor = new Date(today + 'T00:00:00Z')
      while (true) {
        const dow = cursor.getUTCDay()
        if (dow === 0 || dow === 6) {
          // 土日: 何もせず1日遡る
          cursor.setUTCDate(cursor.getUTCDate() - 1)
          continue
        }
        if (writtenDays.has(toJSTDateStr(cursor))) {
          cur++
          cursor.setUTCDate(cursor.getUTCDate() - 1)
        } else {
          break // 平日に記入無し → ストリーク切れ
        }
        if (cur > 365) break // 念のため上限
      }

      // 自己ベスト (平日記入のみで集計。土日を挟んでも連続扱い)
      const sorted = Array.from(writtenDays)
        .filter(d => {
          const dow = new Date(d + 'T00:00:00Z').getUTCDay()
          return dow !== 0 && dow !== 6 // 平日記入だけ対象
        })
        .sort()
      // 2 つの日付の「間」に存在する平日の数 (両端排他)
      const weekdaysBetween = (aISO, bISO) => {
        const a = new Date(aISO + 'T00:00:00Z')
        const b = new Date(bISO + 'T00:00:00Z')
        let n = 0
        const c = new Date(a.getTime())
        c.setUTCDate(c.getUTCDate() + 1)
        while (c.getTime() < b.getTime()) {
          const dw = c.getUTCDay()
          if (dw !== 0 && dw !== 6) n++
          c.setUTCDate(c.getUTCDate() + 1)
        }
        return n
      }
      let best = 0, streak = 0, prev = null
      sorted.forEach(d => {
        if (prev) {
          // 前回記入日と今回の間に「飛んだ平日」が 0 なら連続
          streak = weekdaysBetween(prev, d) === 0 ? streak + 1 : 1
        } else streak = 1
        if (streak > best) best = streak
        prev = d
      })

      // 当月ヒートマップ (1日〜月末)
      const jst = new Date(Date.now() + 9 * 3600 * 1000)
      const y = jst.getUTCFullYear(), m = jst.getUTCMonth()
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      const monthDays = []
      for (let d = 1; d <= last; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dow = new Date(Date.UTC(y, m, d)).getUTCDay()
        const isFuture = dateStr > today
        const isWeekend = dow === 0 || dow === 6
        monthDays.push({ d, dateStr, written: writtenDays.has(dateStr), isFuture, isWeekend })
      }
      const thisMonthCount = monthDays.filter(x => x.written).length
      const totalMonthDays = monthDays.filter(x => !x.isFuture && !x.isWeekend).length

      if (alive) setData({ loading: false, current: cur, best, monthDays, thisMonthCount, totalMonthDays })
    })()
    return () => { alive = false }
  }, [viewingName])

  if (data.loading) return null
  const targetDays = 22
  const remainingForBadge = Math.max(0, targetDays - data.current)
  const monthPct = data.totalMonthDays > 0 ? Math.round(data.thisMonthCount / data.totalMonthDays * 100) : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
      {/* 連続記入カード */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 12, padding: 18, position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 12, right: 12,
          padding: '2px 8px', borderRadius: 99,
          background: `${T.warn}1f`, border: `1px solid ${T.warn}`,
          color: T.warn, fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Icon name="bolt" size={11} stroke={2} /> 継続中
        </div>
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: T.textMuted,
          letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
        }}>連続記入</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <span style={{
            fontSize: 32, fontWeight: 600, color: T.text,
            letterSpacing: '-0.02em', fontFamily: 'ui-monospace, SF Mono, monospace',
          }}>{data.current}</span>
          <span style={{ fontSize: 14, color: T.textSub }}>日</span>
          <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 'auto' }}>
            自己ベスト {data.best}日
          </span>
        </div>
        <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
          {data.current === 0
            ? '今日から始めましょう。1 行でも書けば連続記入スタートです。'
            : remainingForBadge > 0
              ? <>今日も書いて <b>{data.current + 1}日</b> にしましょう。あと <b style={{ color: T.warn }}>{remainingForBadge}日</b> で「振り返り皆勤」バッジに手が届きます。</>
              : <><Icon name="sparkle" size={12} style={{ verticalAlign: 'middle' }} /> 振り返り皆勤バッジを達成しています！</>}
        </div>
      </div>

      {/* 当月ヒートマップ */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 12, padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 600, color: T.textMuted,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>今月の記入</div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: T.textSub, fontFamily: 'ui-monospace, SF Mono, monospace' }}>
            {data.thisMonthCount} / {data.totalMonthDays}日 ({monthPct}%)
          </span>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(24px, 1fr))', gap: 3,
          marginBottom: 8,
        }}>
          {data.monthDays.map(x => (
            <div key={x.d} title={`${x.dateStr}${x.written ? ' (記入済)' : x.isWeekend ? ' (休日)' : x.isFuture ? ' (未来)' : ' (未記入)'}`}
              style={{
                aspectRatio: '1 / 1', borderRadius: 4,
                background: x.written ? T.accent : x.isWeekend ? 'transparent' : x.isFuture ? 'transparent' : T.sectionBg,
                border: x.isWeekend && !x.written ? `1px solid ${T.border}` : 'none',
                opacity: x.isFuture ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 600,
                color: x.written ? '#fff' : x.isFuture ? T.textFaint : T.textMuted,
              }}>{x.d}</div>
          ))}
        </div>
        {/* レジェンド */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: T.textMuted }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: T.accent }} /> 記入済
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: T.sectionBg }} /> 未記入
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, border: `1px solid ${T.border}` }} /> 休日
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── ThreeQuestions: 今日の 3 つの問い (Keep / Problem / Try の問いかけ式) ──
function ThreeQuestions({ T, viewingName, canEdit, myName }) {
  const todayStr = toJSTDateStr(new Date())
  const [keep, setKeep] = useState('')
  const [problem, setProblem] = useState('')
  const [tryNote, setTryNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    if (!myName) return
    if (!keep.trim() && !problem.trim() && !tryNote.trim()) return
    setSaving(true)
    const monday = getMondayJSTStr()
    const { error } = await supabase.from('coaching_logs').insert({
      owner: myName, log_type: 'kpt', week_start: monday,
      content: JSON.stringify({ keep: keep.trim(), problem: problem.trim(), try: tryNote.trim() }),
    })
    setSaving(false)
    if (error) { alert('保存失敗: ' + error.message); return }
    setSaved(true)
    setKeep(''); setProblem(''); setTryNote('')
    setTimeout(() => setSaved(false), 1500)
  }

  const handleKey = (e) => {
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() }
  }

  const cols = [
    { key: 'keep',    label: 'KEEP',    color: T.success || '#16a34a', q: '今日うまくいったことは何でしたか？',
      hint: '小さなことで OK — 集中できた瞬間、いい判断ができた場面、声をかけてもらえたこと…',
      value: keep,    setValue: setKeep },
    { key: 'problem', label: 'PROBLEM', color: T.warn    || '#d97706', q: '今日「もっとうまくやれた」と感じたことは？',
      hint: '誰かを責める必要はありません — 自分のやり方で改善できそうな点を一つ。',
      value: problem, setValue: setProblem },
    { key: 'try',     label: 'TRY',     color: T.info    || T.accent || '#0284c7', q: '明日、試したい小さなことは何ですか？',
      hint: '15分でできる行動レベルで。例:「朝イチに会議準備の枠を作る」',
      value: tryNote, setValue: setTryNote },
  ]

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* ヘッダ */}
      <div style={{
        padding: '14px 20px 12px',
        background: `linear-gradient(180deg, ${T.accent}1a 0%, transparent 100%)`,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: T.accent, color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="bolt" size={11} stroke={2.4} />
        </span>
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: T.accent,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>今日の 3 つの問い · {todayStr.slice(5).replace('-', '/')}</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.textMuted }}>
          1問だけでも OK · 後から書き足せます
        </span>
      </div>
      {/* 3 列グリッド (モバイルでは 1 列縦並びに折り返し) */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 1, background: T.border,
      }}>
        {cols.map(c => (
          <div key={c.key} style={{
            background: T.bgCard, padding: '14px 16px 12px',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
              <span style={{
                fontSize: 11, fontWeight: 600, color: c.color,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>{c.label}</span>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 600, color: T.text,
              letterSpacing: '-0.005em', lineHeight: 1.45, marginBottom: 6,
            }}>{c.q}</div>
            <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.5, marginBottom: 10 }}>
              {c.hint}
            </div>
            <textarea
              value={c.value} onChange={e => c.setValue(e.target.value)}
              onKeyDown={handleKey}
              disabled={!canEdit}
              placeholder="一行から、気軽に。"
              style={{
                width: '100%', minHeight: 56, padding: '8px 10px',
                background: T.sectionBg, border: `1px solid ${T.border}`,
                borderRadius: 8, color: T.text, fontSize: 13,
                fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                boxSizing: 'border-box', lineHeight: 1.5,
              }} />
          </div>
        ))}
      </div>
      {/* フッタ */}
      <div style={{
        background: T.sectionBg, borderTop: `1px solid ${T.border}`,
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontSize: 11, color: T.textMuted }}>
          書いた内容は今日の KPT として保存され、明日まとめて整理できます
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saved && <span style={{ fontSize: 11, color: T.success, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="check" size={11} /> 保存しました</span>}
          <span style={{ fontSize: 10, color: T.textMuted }}>
            <kbd style={{ padding: '1px 5px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 10, fontFamily: 'ui-monospace, SF Mono, monospace' }}>⌘</kbd>
            +
            <kbd style={{ padding: '1px 5px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 10, fontFamily: 'ui-monospace, SF Mono, monospace' }}>↵</kbd>
            で保存
          </span>
          <button onClick={save} disabled={saving || !canEdit || (!keep.trim() && !problem.trim() && !tryNote.trim())}
            style={{
              padding: '6px 14px', borderRadius: 7, border: 'none',
              background: T.accent, color: '#fff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (saving || !canEdit || (!keep.trim() && !problem.trim() && !tryNote.trim())) ? 0.5 : 1,
            }}>
            {saving ? '保存中...' : '今日の記録を保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RetrospectSummary({ T, stats, kpt, range }) {
  const rangeLabel = range === 'week' ? '今週' : range === 'month' ? '今月' : '全期間'
  const total = stats.onTime + stats.overdue
  const completionPct = total > 0 ? Math.round((stats.onTime / total) * 100) : 0

  // 4 カラムスタッツ (Indigo Quiet 準拠: 単一色 + caption + 大数値)
  const cards = [
    { caption: '完了したタスク', big: stats.onTime, sub: '件', iconName: 'check', tone: T.text },
    { caption: '遅延中タスク', big: stats.overdue, sub: '件', iconName: 'bell', tone: stats.overdue > 0 ? T.warn : T.textMuted },
    { caption: 'KPT 記入', big: kpt.keep.length + kpt.problem.length + kpt.try.length, sub: '件',
      extra: `K ${kpt.keep.length} · P ${kpt.problem.length} · T ${kpt.try.length}`, iconName: 'star', tone: T.text },
    { caption: '達成率', big: completionPct, sub: '%', iconName: 'target', tone: completionPct >= 80 ? T.success : completionPct >= 50 ? T.accent : T.textMuted },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* キャプション */}
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: T.textMuted,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>{rangeLabel}のあなたの足跡</div>
      </div>

      {/* 4 カラムスタッツ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {cards.map(c => (
          <div key={c.caption} style={{
            padding: 14, background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: T.textMuted, display: 'inline-flex' }}>
                <Icon name={c.iconName} size={11} stroke={1.8} />
              </span>
              <div style={{
                fontSize: 10.5, fontWeight: 600, color: T.textMuted,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>{c.caption}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontSize: 28, fontWeight: 600, color: c.tone,
                letterSpacing: '-0.01em',
                fontFamily: 'ui-monospace, SF Mono, monospace',
              }}>{c.big}</span>
              <span style={{ fontSize: 12, color: T.textMuted }}>{c.sub}</span>
            </div>
            {c.extra && (
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{c.extra}</div>
            )}
          </div>
        ))}
      </div>

      {/* KPT 集約 (3 列、ドット + 小ラベル + リスト) */}
      <div style={{
        padding: 16, background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 12,
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 600, color: T.textMuted,
          letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10,
        }}>{rangeLabel}の KPT</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { key: 'keep',    label: 'KEEP',    color: T.success, items: kpt.keep },
            { key: 'problem', label: 'PROBLEM', color: T.warn,    items: kpt.problem },
            { key: 'try',     label: 'TRY',     color: T.info || T.accent, items: kpt.try },
          ].map(col => (
            <div key={col.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                <span style={{
                  fontSize: 11, fontWeight: 600, color: col.color,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>{col.label}</span>
                <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 'auto' }}>({col.items.length})</span>
              </div>
              {col.items.length === 0 ? (
                <div style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>記入なし</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.7, color: T.text }}>
                  {col.items.slice(0, 6).map((it, i) => (
                    <li key={i}>
                      {it.text}
                      <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 6 }}>
                        ({it.date.slice(5).replace('-', '/')})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RetrospectDay({ T, day }) {
  const isMobile = useIsMobile()
  const dt = new Date(day.date + 'T00:00:00Z')
  const wd = ['日','月','火','水','木','金','土'][dt.getUTCDay()]
  const isWeekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6
  const todayStr = toJSTDateStr(new Date())
  const isToday = day.date === todayStr
  const dateLabel = `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`

  const { start_at, end_at } = day.workLog || {}
  const worked = (start_at && end_at) ? (() => {
    const mins = Math.floor((new Date(end_at) - new Date(start_at)) / 60000)
    return `${Math.floor(mins / 60)}時間${mins % 60}分`
  })() : ''
  const hasKpt = day.kpts.length > 0

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
      overflow: 'hidden',
      opacity: isWeekend && !hasKpt ? 0.6 : 1,
    }}>
      {/* 日付ヘッダ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px',
        borderBottom: `1px solid ${T.border}`,
      }}>
        {/* 日付タイル 32×32 */}
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: isToday ? `${T.accent}1f`
            : isWeekend && !hasKpt ? 'transparent'
            : T.sectionBg,
          color: isToday ? T.accent : T.textSub,
          border: isWeekend && !hasKpt ? `1px dashed ${T.border}` : 'none',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>{dt.getUTCDate()}</div>
          <div style={{ fontSize: 8, lineHeight: 1 }}>{wd}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
            {isToday ? '今日' : dateLabel}
          </div>
          {start_at && (
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {jstHHMM(start_at)}{end_at ? `〜${jstHHMM(end_at)}` : '〜'}{worked && ` · ${worked}`}
            </div>
          )}
        </div>
        {hasKpt && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: T.success,
            padding: '2px 8px', borderRadius: 99,
            background: `${T.success}1a`, border: `1px solid ${T.success}40`,
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: T.success, flexShrink: 0 }} /> 記入済</span>
        )}
        {!hasKpt && isWeekend && (
          <span style={{ fontSize: 10, color: T.textMuted, fontStyle: 'italic' }}>
            休日 · 記入なし
          </span>
        )}
      </div>

      {/* KPT 本体: 3 列グリッド (ドット + ラベル + 本文) */}
      {hasKpt && (
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 1, background: T.border,
        }}>
          {day.kpts.map(kpt => (
            [
              { key: `${kpt.id}-k`, label: 'KEEP',    color: T.success,         text: kpt.keep },
              { key: `${kpt.id}-p`, label: 'PROBLEM', color: T.warn,            text: kpt.problem },
              { key: `${kpt.id}-t`, label: 'TRY',     color: T.info || T.accent, text: kpt.try },
            ].map(col => (
              <div key={col.key} style={{
                background: T.bgCard, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, color: T.textMuted,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>{col.label}</span>
                </div>
                <div style={{
                  fontSize: 12.5, color: T.text, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}>
                  {(col.text || '').trim() || <span style={{ color: T.textFaint, fontStyle: 'italic' }}>—</span>}
                </div>
              </div>
            ))
          ))}
        </div>
      )}
    </div>
  )
}

function KPTField({ T, color, label, text }) {
  // Indigo Quiet 準拠: 左ボーダー塗り廃止 → ドット + 小ラベル
  return (
    <div style={{
      padding: '8px 10px', background: T.bgCard,
      border: `1px solid ${T.border}`, borderRadius: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{
          fontSize: 10, fontWeight: 600, color: T.textMuted,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>{label}</span>
      </div>
      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {(text || '').trim() || <span style={{ color: T.textFaint, fontStyle: 'italic' }}>—</span>}
      </div>
    </div>
  )
}

function truncate(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

function Loading({ T }) {
  return <div style={{ fontSize: 11, color: T.textMuted, padding: 6 }}>読み込み中...</div>
}

function ThemeEditor({ T, icon, title, value, loading, canEdit, placeholder, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() { setDraft(value || ''); setEditing(true) }
  async function commit() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  return (
    <Section T={T} icon={icon} title={title} flex={0} headerRight={
      canEdit && !editing && (
        <button onClick={startEdit} title="編集" style={{
          background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
          borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
        }}><Icon name="pencil" size={11} /></button>
      )
    }>
      {loading ? <Loading T={T} /> : editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            placeholder={placeholder}
            style={{
              width: '100%', padding: 8, background: T.sectionBg,
              border: `1px solid ${T.borderMid}`, borderRadius: 6, color: T.text,
              fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button onClick={() => setEditing(false)} disabled={saving} style={{
              background: 'transparent', border: `1px solid ${T.borderMid}`, color: T.textSub,
              borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>キャンセル</button>
            <button onClick={commit} disabled={saving} style={{
              background: T.accentSolid, border: 'none', color: '#fff',
              borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="check" size={11} /> 保存</button>
          </div>
        </div>
      ) : value ? (
        <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{value}</div>
      ) : (
        <div style={{ fontSize: 11, color: T.textMuted, fontStyle: 'italic' }}>
          {canEdit ? <>未設定 (<Icon name="pencil" size={10} style={{ verticalAlign: 'middle' }} /> で編集)</> : '未設定'}
        </div>
      )}
    </Section>
  )
}

// 既存の MyTasksPage.jsx STATUS_CONFIG と合わせる (not_started / in_progress / done)
// iOS システムカラー
const TASK_STATUS_CONFIG = {
  not_started: { icon: '○', color: '#8E8E93', label: '未着手' },
  in_progress: { icon: '◐', color: '#007AFF', label: '進行中' },
  done:        { icon: '●', color: '#34C759', label: '完了' },
}

// 空状態のリッチ表示 (design_handoff_empty_states 準拠): 中性アイコン + 見出し + 説明 + アクション + 任意の MyCOO ヒント
function EmptyRich({ T, icon, title, desc, children, mycooTip }) {
  return (
    <div style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(15,23,42,.04)', color: T.textSub, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}`, flexShrink: 0 }}>
        <Icon name={icon} size={26} stroke={1.5} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{title}</div>
      {desc && <div style={{ fontSize: 11.5, color: T.textSub, lineHeight: 1.6, maxWidth: 300 }}>{desc}</div>}
      {children && <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' }}>{children}</div>}
      {mycooTip && (
        <div style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: 'linear-gradient(135deg, rgba(37,99,235,.06), rgba(34,211,238,.06))', borderRadius: 10, border: '1px solid rgba(37,99,235,.12)', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: 'linear-gradient(135deg,#3b82f6,#1e3a8a)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(30,58,138,.24)', flexShrink: 0 }}><Icon name="ai" size={13} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.accent, marginBottom: 1, letterSpacing: '.04em' }}>MyCOO からの提案</div>
            <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.55 }}>{mycooTip}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// 空状態のテンプレチップ (クイックタスク追加へ流し込む) / CTA ボタン共通スタイル
function emptyChipStyle(T) {
  return { padding: '4px 10px', fontSize: 11, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 99, cursor: 'pointer', color: T.textSub, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }
}

function TaskList({ T, tasks, canEdit, onToggle, showDue = false }) {
  const today = toJSTDateStr(new Date())
  // 期日 → 状態 (normal / today / soon(3日以内) / overdue / done) を解決
  const dueInfo = (due, done) => {
    const [, m, d] = (due || '').split('-').map(Number)
    const md = (m && d) ? `${m}/${d}` : ''
    if (done) return { state: 'done', icon: 'check', lbl: '完了', date: md }
    const diff = Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000)
    if (diff < 0)  return { state: 'overdue', icon: 'alert',    lbl: '遅延', date: md }
    if (diff === 0) return { state: 'today',  icon: 'clock',    lbl: '期限', date: '今日' }
    if (diff <= 3)  return { state: 'soon',   icon: 'clock',    lbl: '期限', date: md }
    return { state: 'normal', icon: 'calendar', lbl: '期限', date: md }
  }
  const dueTone = {
    normal:  { bg: T.sectionBg, color: T.textSub, border: T.border },
    today:   { bg: T.accentBg,  color: T.accent,  border: `${T.accent}40` },
    soon:    { bg: T.warnBg,    color: T.warn,    border: `${T.warn}40` },
    overdue: { bg: T.dangerBg,  color: T.danger,  border: `${T.danger}40` },
    done:    { bg: T.successBg, color: T.success, border: `${T.success}40` },
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {tasks.map((t, i) => {
        const status = t.status || (t.done ? 'done' : 'not_started')
        const done = status === 'done'
        const inProgress = status === 'in_progress'
        const overdue = t.due_date && t.due_date < today && !done
        const label = t.title || t.weekly_reports?.ka_title || '(無題)'
        const nextLabel = status === 'not_started' ? '進行中'
                        : status === 'in_progress' ? '完了'
                        : '未着手'
        // 18px 円チェックボックス: 完了=緑塗り / 着手中=黄(途中であることを明示) / 未着手=薄い枠
        const cb = done
          ? { bg: T.success, border: T.success, color: '#fff' }
          : inProgress
            ? { bg: T.warnBg, border: T.warn, color: T.warn }
            : overdue
              ? { bg: T.bgCard, border: `${T.danger}66`, color: `${T.danger}66` }
              : { bg: T.bgCard, border: (T.borderStrong || T.border), color: (T.textFaint || 'rgba(15,23,42,.2)') }
        // ホバー時のハイライト: 着手中は黄を維持し、それ以外はアクセント色で「押せる」ことを示す
        const hoverTone = inProgress
          ? { bg: T.warnBg, border: T.warn, color: T.warn }
          : { bg: T.accentBg, border: T.accent, color: T.accent }
        const info = (showDue && t.due_date) ? dueInfo(t.due_date, done) : null
        const tone = info ? dueTone[info.state] : null
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '6px 14px',
            borderBottom: i < tasks.length - 1 ? `1px solid ${T.border}` : 'none',
            background: T.bgCard,
            opacity: done ? 0.6 : 1,
            cursor: canEdit ? 'pointer' : 'default',
          }}>
            <button
              onClick={() => canEdit && onToggle(t)}
              disabled={!canEdit}
              title={canEdit ? `クリックで「${nextLabel}」に変更` : '閲覧のみ'}
              onMouseEnter={canEdit && !done ? (e) => { e.currentTarget.style.borderColor = hoverTone.border; e.currentTarget.style.color = hoverTone.color; e.currentTarget.style.background = hoverTone.bg } : undefined}
              onMouseLeave={canEdit && !done ? (e) => { e.currentTarget.style.borderColor = cb.border; e.currentTarget.style.color = cb.color; e.currentTarget.style.background = cb.bg } : undefined}
              style={{
                width: 18, height: 18, flexShrink: 0,
                borderRadius: 99,
                border: `1.5px solid ${cb.border}`,
                background: cb.bg,
                color: cb.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, cursor: canEdit ? 'pointer' : 'not-allowed',
                transition: 'all .15s',
              }}
            >
              {inProgress
                ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><path d="M6 12h12" /></svg>
                : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={done ? 3 : 2.6} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, color: done ? T.textMuted : T.text,
                textDecoration: done ? 'line-through' : 'none',
                fontWeight: 600, lineHeight: 1.35, letterSpacing: '.01em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{label}</div>
              {inProgress && (
                <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', color: T.warn, lineHeight: 1.3 }}>着手中</span>
              )}
            </div>
            {t.weekly_reports?.kr_title && (
              <span style={{ fontSize: 11, color: T.textMuted, fontFamily: 'ui-monospace, SF Mono, monospace', flexShrink: 0 }}>
                KR: {truncate(t.weekly_reports.kr_title, 14)}
              </span>
            )}
            {t.assignee && (
              <span title={t.assignee} style={{
                width: 24, height: 24, borderRadius: 99, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: avatarColor(t.assignee), color: '#fff',
                fontSize: 11, fontWeight: 700,
                boxShadow: '0 1px 3px rgba(15,23,42,.12)',
              }}>{String(t.assignee).slice(0, 1)}</span>
            )}
            {info && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                padding: '3px 10px 3px 8px', borderRadius: 99,
                fontSize: 11.5, fontFamily: '"Inter","Noto Sans JP",system-ui,sans-serif',
                letterSpacing: '.01em',
                background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`,
              }}>
                <Icon name={info.icon} size={11} />
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', opacity: .75 }}>{info.lbl}</span>
                <span style={{ fontWeight: 700 }}>{info.date}</span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WeekTasks({ T, byWeekday, canEdit, onToggle }) {
  const days = [
    { key: 1, label: '月' }, { key: 2, label: '火' }, { key: 3, label: '水' },
    { key: 4, label: '木' }, { key: 5, label: '金' }, { key: 6, label: '土' }, { key: 0, label: '日' },
  ]
  const today = toJSTDateStr(new Date())
  const todayWd = new Date(today + 'T00:00:00Z').getUTCDay()
  const totalCount = Object.values(byWeekday).reduce((s, arr) => s + arr.length, 0)
  if (totalCount === 0) return (
    <EmptyRich T={T} icon="calendar" title="今週の予定はまだありません"
      desc="「今週の Why」を 3 分で整理すると、優先タスクが見えてきます。">
      <button onClick={() => window.dispatchEvent(new CustomEvent('mycoo:open'))} style={{
        ...btnBrand({ size: 'sm' }), display: 'inline-flex', alignItems: 'center', gap: 6,
      }}><Icon name="ai" size={13} /> MyCOO と整理する</button>
    </EmptyRich>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {days.map(d => {
        const list = byWeekday[d.key] || []
        if (list.length === 0) return null
        const isToday = d.key === todayWd
        return (
          <div key={d.key}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: isToday ? T.accent : T.textMuted,
              marginBottom: 3, letterSpacing: 0.3,
            }}>
              {d.label}曜{isToday ? ' (今日)' : ''} · {list.length}件
            </div>
            <TaskList T={T} tasks={list} canEdit={canEdit} onToggle={onToggle} showDue={false} />
          </div>
        )
      })}
    </div>
  )
}

function ReminderList({ T, items, emptyText, maxVisible, detailLabel, onDetail }) {
  if (!items || items.length === 0) {
    return <div style={{ fontSize: 11, color: T.textMuted, padding: 6, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>{emptyText}</div>
  }
  const sevColor = (sev) => sev === 'danger' ? T.danger : sev === 'warn' ? T.warn : T.info
  const sevBg    = (sev) => sev === 'danger' ? T.dangerBg : sev === 'warn' ? T.warnBg : T.infoBg
  const limit = maxVisible || items.length
  const visible = items.slice(0, limit)
  const hidden = items.length - visible.length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {visible.map((it, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 6,
          padding: '5px 8px', borderRadius: 6,
          background: sevBg(it.sev),
          border: `1px solid ${sevColor(it.sev)}33`,
          fontSize: 11, color: T.text, lineHeight: 1.5,
          minWidth: 0,
        }}>
          <span style={{ flexShrink: 0, display: 'inline-flex', color: sevColor(it.sev) }}><Icon name={it.icon} size={13} /></span>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{it.text}</span>
        </div>
      ))}
      {(hidden > 0 || (items.length > 0 && detailLabel)) && onDetail && (
        <button onClick={onDetail} style={{
          marginTop: 2, background: 'transparent', border: `1px dashed ${T.borderMid}`,
          color: T.accent, borderRadius: 6, padding: '5px 8px',
          fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          textAlign: 'center',
        }}>
          {hidden > 0 ? `他 ${hidden} 件 · ` : ''}{detailLabel}
        </button>
      )}
    </div>
  )
}

function SubSection({ T, label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSub, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function Placeholder({ T, lines = [] }) {
  return (
    <div style={{
      padding: 8, background: T.sectionBg, border: `1px dashed ${T.border}`,
      borderRadius: 6, fontSize: 11, color: T.textMuted, lineHeight: 1.6,
    }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  )
}

// ─── ConfirmationsBanner: ダッシュボード最上部の「確認事項あり」バナー ──
//   表示対象 (viewingName) 宛に未解決があるときだけ表示 (0件なら null)
//   自分閲覧時 / 他メンバー閲覧時 で文言を切り替える
function ConfirmationsBanner({ T, viewingName, isViewingSelf, onGoToTab }) {
  const [items, setItems] = useState([])
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    if (!viewingName) return
    // プレビュー用の上位 3件
    const { data } = await supabase.from('member_confirmations')
      .select('id, from_name, content, reference_urls, created_at')
      .eq('to_name', viewingName).eq('status', 'open')
      .order('created_at', { ascending: false }).limit(3)
    setItems(data || [])
    // 全件数
    const { count: total } = await supabase.from('member_confirmations')
      .select('id', { count: 'exact', head: true })
      .eq('to_name', viewingName).eq('status', 'open')
    setCount(total || 0)
  }, [viewingName])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!viewingName) return
    const ch = supabase.channel(`confirm_banner_${viewingName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_confirmations' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [viewingName, load])

  // 0件なら非表示 (UI 汚さない)
  if (count === 0) return null

  // Dashboard cleanup ハンドオフ準拠:
  //   warn-soft 背景 + warn 左ボーダー + 円形 msg アイコン (ハロー) + テキスト + 返信ボタン
  const previewItem = items[0]
  const previewFrom = previewItem?.from_name || ''
  const previewContent = (previewItem?.content || '').replace(/\s+/g, ' ').trim()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 14px 12px 16px',
      margin: '12px 16px 0',
      background: T.warnBg || `${T.warn}1f`,
      border: `1px solid ${T.warn}`,
      borderLeft: `4px solid ${T.warn}`,
      borderRadius: 8,
      flexShrink: 0,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 99, flexShrink: 0,
        background: T.warn, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 0 4px ${T.warn}26`,
      }}>
        <Icon name="msg" size={14} stroke={2.2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>
            {isViewingSelf ? '未解決の確認事項' : `${viewingName}さん宛の未解決 確認事項`}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: T.warn,
            padding: '1px 7px', background: '#fff',
            border: `1px solid ${T.warn}`, borderRadius: 99,
            whiteSpace: 'nowrap',
          }}>{count}件</span>
        </div>
        {previewContent && (
          <div style={{
            fontSize: 12, color: T.textSub,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {previewFrom && (
              <>
                <span style={{ color: T.textMuted }}>from</span>{' '}
                <span style={{ fontWeight: 500, color: T.text }}>{previewFrom}</span>{' · '}
              </>
            )}
            {previewContent}
          </div>
        )}
      </div>
      <button
        onClick={() => onGoToTab && onGoToTab('confirm')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', fontSize: 12, fontWeight: 500,
          background: T.warn, color: '#fff',
          border: `1px solid ${T.warn}`, borderRadius: 7,
          cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
        }}>
        返信する <Icon name="arrowRight" size={11} stroke={2} />
      </button>
    </div>
  )
}

// ─── CalendarBox: ダッシュボードの直近8時間カレンダー ────────────────────
function CalendarBox({ T, viewingName, onGoToTab }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)

  useEffect(() => {
    if (!viewingName || !orgId) return
    let alive = true
    setLoading(true); setError(''); setNeedsReauth(false)
    fetch(`/api/integrations/calendar/events?owner=${encodeURIComponent(viewingName)}&organization_id=${encodeURIComponent(orgId)}&hours=8`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) {
          setError(j.error || `HTTP ${r.status}`)
          setNeedsReauth(!!j.needsReauth)
          setItems([])
        } else {
          setItems(j.items || [])
        }
      })
      .catch(e => { if (alive) setError(e.message || 'エラー') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [viewingName, orgId])

  const isUnconnected = error.startsWith('未連携')
  const visible = items.slice(0, 5)
  const extra = Math.max(0, items.length - visible.length)

  return (
    <Section dataTour="ws-calendar" T={T} icon={<Icon name="calendar" size={14} />} accent={T.info} title="Google カレンダー (直近8時間)" flex={0}>
      {loading ? (
        <div style={{ padding: 12, color: T.textMuted, fontSize: 11 }}>読み込み中...</div>
      ) : isUnconnected ? (
        <div style={{ padding: 10, fontSize: 11, color: T.textMuted, lineHeight: 1.7 }}>
          未連携です。
          <button onClick={() => onGoToTab?.('integrations')} style={{
            marginLeft: 6, padding: '3px 10px', borderRadius: 6,
            background: T.accent, color: '#fff', border: 'none',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><Icon name="link" size={11} /> 連携タブへ</button>
        </div>
      ) : error ? (
        <div style={{ padding: 10, fontSize: 11, color: T.danger, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap' }}>
          <Icon name="alert" size={11} /> {error}
          {needsReauth && (
            <button onClick={() => onGoToTab?.('integrations')} style={{
              marginLeft: 6, padding: '3px 10px', borderRadius: 6,
              background: T.warn, color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="refresh" size={11} /> 再連携</button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 10, fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="sparkle" size={12} /> 直近の予定はありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visible.map(ev => (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', background: T.sectionBg, borderRadius: 6,
              fontSize: 11, color: T.text,
            }}>
              <span style={{ fontWeight: 700, color: T.textSub, minWidth: 42 }}>{ev.time}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.title}
              </span>
              {ev.hangoutLink && (
                <a href={ev.hangoutLink} target="_blank" rel="noreferrer" style={{
                  padding: '2px 8px', borderRadius: 10,
                  background: T.accentBg, color: T.accent,
                  fontSize: 10, fontWeight: 700, textDecoration: 'none',
                }}>参加</a>
              )}
            </div>
          ))}
          {extra > 0 && (
            <div style={{ fontSize: 11, color: T.textMuted, paddingLeft: 6 }}>他 {extra} 件</div>
          )}
          <a href="https://calendar.google.com/" target="_blank" rel="noreferrer" style={{
            fontSize: 11, color: T.accent, textAlign: 'center',
            padding: '4px 0', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
          }}><Icon name="calendar" size={11} /> Google カレンダーを開く <Icon name="external" size={11} /></a>
        </div>
      )}
    </Section>
  )
}

// ─── GmailBox: ダッシュボードの重要メール 5件 ────────────────────────────
function GmailBox({ T, viewingName, onGoToTab, onOpenAIReply, readMarks, onMarkRead }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [rawItems, setRawItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)

  useEffect(() => {
    if (!viewingName || !orgId) return
    let alive = true
    setLoading(true); setError(''); setNeedsReauth(false)
    // 返信済み・既読が混じっても 5 件確保するため多めに取る
    fetch(`/api/integrations/gmail/threads?owner=${encodeURIComponent(viewingName)}&organization_id=${encodeURIComponent(orgId)}&limit=20&category=important`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) {
          setError(j.error || `HTTP ${r.status}`)
          setNeedsReauth(!!j.needsReauth)
          setRawItems([])
        } else {
          setRawItems(j.items || [])
        }
      })
      .catch(e => { if (alive) setError(e.message || 'エラー') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [viewingName, orgId])

  // 返信済み・既読を除外し、先頭 5 件に絞る
  const items = rawItems
    .filter(m => !m.replied && !(readMarks && readMarks.has(m.id)))
    .slice(0, 5)

  const isUnconnected = error.startsWith('未連携')

  return (
    <Section
      dataTour="ws-gmail" T={T} icon={<Icon name="mail" size={14} />} accent={T.danger} title="Gmail (要対応 5件)" flex={0}
      headerRight={
        !isUnconnected && !error ? (
          <button onClick={() => onGoToTab?.('mail')} style={{
            padding: '3px 8px', borderRadius: 6,
            background: 'transparent', color: T.accent,
            border: `1px solid ${T.accent}40`,
            fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><Icon name="mail" size={11} /> メールタブで全部見る <Icon name="arrowRight" size={11} /></button>
        ) : null
      }
    >
      {loading ? (
        <div style={{ padding: 12, color: T.textMuted, fontSize: 11 }}>読み込み中...</div>
      ) : isUnconnected ? (
        <div style={{ padding: 10, fontSize: 11, color: T.textMuted, lineHeight: 1.7 }}>
          未連携です。
          <button onClick={() => onGoToTab?.('integrations')} style={{
            marginLeft: 6, padding: '3px 10px', borderRadius: 6,
            background: T.accent, color: '#fff', border: 'none',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><Icon name="link" size={11} /> 連携タブへ</button>
        </div>
      ) : error ? (
        <div style={{ padding: 10, fontSize: 11, color: T.danger, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap' }}>
          <Icon name="alert" size={11} /> {error}
          {needsReauth && (
            <button onClick={() => onGoToTab?.('integrations')} style={{
              marginLeft: 6, padding: '3px 10px', borderRadius: 6,
              background: T.warn, color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="refresh" size={11} /> 再連携</button>
          )}
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 10, fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="sparkle" size={12} /> 要対応メールはありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: T.sectionBg, borderRadius: 6,
              fontSize: 11,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.from}: {m.subject}
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.snippet}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <button onClick={() => onMarkRead?.(m.id)} style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: T.successBg, color: T.success,
                  border: `1px solid ${T.success}40`,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
                }}><Icon name="check" size={11} /> 既読</button>
                <button onClick={() => onOpenAIReply?.(m)} style={{
                  ...btnBrand({ size: 'sm' }),
                  padding: '4px 10px', borderRadius: 6, fontSize: 10,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
                }}><Icon name="sparkle" size={11} /> AI返信</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ─── MailTab: 3カテゴリ分類のメールタブ ─────────────────────────────
// ─── CompanyStrategyTab は components/CompanyStrategyTab.jsx に移動 ─

// ─── CompanyMailTab: 全社サマリー時のメール集約 ───────────────────────
// 全メンバーの Gmail から「クレーム/重要」「称賛」「要返信件数」を集約表示

// 自動通知メール (人ではなくシステム発) は分類対象から除外する
const SYSTEM_SENDER = /noreply|no-reply|do-not-reply|donotreply|notification|notice@|alerts?@|info@|@notta|notta\s*bot|automation|mailer-daemon|peatix|ticket|チケット|システム|自動配信|お知らせ/i

// 重要アラート: 顧客のクレーム / 苦情 / 強い不満 / 重大な問題が示唆される
// 弱いワード ("問題" 単独 等) は誤検出するので除外。複合フレーズで限定する。
const CLAIM_KW = /クレーム|苦情|怒り|怒っ|抗議|至急対応|緊急対応|お詫び申し上げ|誠に申し訳|大変申し訳|不具合|障害発生|事故が|キャンセル(希望|させて|します)|返金(希望|して|を求)|遺憾|ひどい|最悪|残念ながら|ご迷惑をおかけ|お手数|遅延のお詫び|不満を|不快|騙さ|詐欺|訴え|弁護士/i

// 称賛: 強めの感謝 / 高評価が示唆される。汎用「ありがとう」だけでは
// 礼儀文に過ぎないので「誠にありがとう」「心より感謝」等の強い形に限定。
const PRAISE_KW = /(誠に|本当に|心から|心より|大変|心の底から)?ありがとうございました?|心より感謝|深く感謝|感謝してい|感謝申し上げ|お礼申し上げ|大変助か|本当に助か|素晴らしい(対応|お話|内容|サービス|資料|プレゼン|機会|出会い)|大変参考になり|大変勉強になり|高く評価|お力添え|たいへん良かった|お話できて(嬉|うれ)し|good\s*(job|work)|excellent|outstanding|amazing|grateful/i

function passesSystemFilter(it) {
  const text = (it.from || '') + ' ' + (it.subject || '') + ' ' + (it.fromEmail || '')
  return !SYSTEM_SENDER.test(text)
}

function CompanyMailTab({ T, members }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [byMember, setByMember] = useState({})  // { name: items[] }
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  useEffect(() => {
    let alive = true
    const validMembers = (members || []).filter(m => m.email && m.name && m.name !== '👀 ゲスト')
    if (validMembers.length === 0 || !orgId) { setLoading(false); return }

    setLoading(true)
    setProgress({ done: 0, total: validMembers.length })
    const next = {}
    let done = 0
    // 5 件並列で順次取得 (Gmail API スロットル対策 + 段階的表示)
    const BATCH = 5
    let alivePromise = Promise.resolve()
    for (let i = 0; i < validMembers.length; i += BATCH) {
      alivePromise = alivePromise.then(async () => {
        if (!alive) return
        const batch = validMembers.slice(i, i + BATCH)
        await Promise.all(batch.map(m =>
          fetch(`/api/integrations/gmail/threads?owner=${encodeURIComponent(m.name)}&organization_id=${encodeURIComponent(orgId)}&limit=30&category=all`)
            .then(r => r.json().catch(() => ({})))
            .then(j => {
              done++
              if (alive) {
                if (Array.isArray(j.allItems || j.items)) next[m.name] = j.allItems || j.items
                setProgress({ done, total: validMembers.length })
              }
            })
            .catch(() => { done++; if (alive) setProgress({ done, total: validMembers.length }) })
        ))
        if (alive) setByMember({ ...next })
      })
    }
    alivePromise.finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [members, orgId])

  // フラット化
  const allItems = []
  Object.entries(byMember).forEach(([name, items]) => {
    items.forEach(it => allItems.push({ ...it, _ownerName: name }))
  })

  // 分類: クレーム > 称賛 (重複時はクレーム優先)
  // 自動通知 (Notta / Peatix / noreply 等) は両方から除外する
  const claims = allItems.filter(it => {
    if (!passesSystemFilter(it)) return false
    const text = (it.subject || '') + ' ' + (it.snippet || '')
    return CLAIM_KW.test(text)
  })
  const claimIds = new Set(claims.map(c => `${c._ownerName}_${c.id}`))
  const praises = allItems.filter(it => {
    if (claimIds.has(`${it._ownerName}_${it.id}`)) return false
    if (!passesSystemFilter(it)) return false
    const text = (it.subject || '') + ' ' + (it.snippet || '')
    return PRAISE_KW.test(text)
  })
  // 要返信: to_me & 未返信 (全メンバー合算)
  const needsReplyByMember = {}
  allItems.forEach(it => {
    if (it.category === 'to_me' && !it.replied) {
      needsReplyByMember[it._ownerName] = (needsReplyByMember[it._ownerName] || 0) + 1
    }
  })
  const needsReplyTotal = Object.values(needsReplyByMember).reduce((s, n) => s + n, 0)

  if (loading && Object.keys(byMember).length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs }}><Icon name="mail" size={13} /> 全社のメールを集約中... ({progress.done}/{progress.total})</div>
  }

  const sectionStyle = {
    ...cardStyle({ T, padding: SPACING.lg }),
    marginBottom: SPACING.lg,
    width: '100%', maxWidth: '100%', boxSizing: 'border-box',
  }
  const itemRow = (it, accent) => (
    <div key={`${it._ownerName}_${it.id}`} style={{
      display: 'flex', alignItems: 'flex-start', gap: SPACING.sm + 2,
      padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.sm,
      background: T.sectionBg, border: `1px solid ${T.borderLight}`,
      marginBottom: SPACING.xs + 2,
      width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      <span style={{ ...pillStyle({ color: accent, size: 'sm' }), flexShrink: 0 }}><Icon name="mail" size={10} /> {it._ownerName}</span>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ ...TYPO.subhead, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.subject || '(件名なし)'}</div>
        <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {it.from || ''} ・ {it.snippet || ''}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
      <div style={{ padding: '14px 18px', maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      {loading && (
        <div style={{ marginBottom: SPACING.sm + 2, padding: `${SPACING.xs + 2}px ${SPACING.md}px`, background: T.accentBg, borderRadius: RADIUS.sm, ...TYPO.subhead, color: T.textSub, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
          <Icon name="mail" size={12} /> 取得中 {progress.done}/{progress.total} メンバー (順次更新)
        </div>
      )}

      {/* 要返信件数 */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.sm + 2 }}>
          <span style={{ display: 'inline-flex', color: T.accent }}><Icon name="mail" size={18} /></span>
          <span style={{ ...TYPO.title3, color: T.text }}>要返信件数</span>
          <span style={{ marginLeft: 'auto', ...TYPO.title1, color: needsReplyTotal > 0 ? T.warn : T.textMuted }}>{needsReplyTotal} 件</span>
        </div>
        {Object.keys(needsReplyByMember).length === 0 ? (
          <div style={{ ...TYPO.subhead, fontWeight: 500, color: T.textMuted, padding: SPACING.sm }}>未返信メールはありません</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.xs + 2 }}>
            {Object.entries(needsReplyByMember).sort((a, b) => b[1] - a[1]).map(([name, n]) => (
              <span key={name} style={{ ...TYPO.footnote, fontWeight: 500, padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.pill, background: T.sectionBg, border: `1px solid ${T.borderLight}`, color: T.textSub }}>
                {name} <strong style={{ color: T.warn, marginLeft: 4 }}>{n}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 重要アラート (クレーム等) */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.sm + 2 }}>
          <span style={{ display: 'inline-flex', color: T.danger }}><Icon name="alert" size={18} /></span>
          <span style={{ ...TYPO.title3, color: T.text }}>重要アラート</span>
          <span style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted }}>クレーム / 苦情 / 至急対応</span>
          <span style={{ marginLeft: 'auto', ...TYPO.headline, color: claims.length > 0 ? T.danger : T.textMuted }}>{claims.length}</span>
        </div>
        {claims.length === 0 ? (
          <div style={{ ...TYPO.subhead, fontWeight: 500, color: T.textMuted, padding: SPACING.sm, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>該当メールはありません <Icon name="sparkle" size={12} /></div>
        ) : (
          <div>{claims.slice(0, 10).map(it => itemRow(it, T.danger))}</div>
        )}
      </div>

      {/* 称賛メール */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.sm + 2 }}>
          <span style={{ display: 'inline-flex', color: T.success }}><Icon name="sparkle" size={18} /></span>
          <span style={{ ...TYPO.title3, color: T.text }}>称賛メール</span>
          <span style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted }}>感謝 / お礼 / 高評価</span>
          <span style={{ marginLeft: 'auto', ...TYPO.headline, color: praises.length > 0 ? T.success : T.textMuted }}>{praises.length}</span>
        </div>
        {praises.length === 0 ? (
          <div style={{ ...TYPO.subhead, fontWeight: 500, color: T.textMuted, padding: SPACING.sm }}>まだ無し</div>
        ) : (
          <div>{praises.slice(0, 10).map(it => itemRow(it, T.success))}</div>
        )}
      </div>

      <div style={{ ...TYPO.caption, fontWeight: 500, letterSpacing: 'normal', color: T.textFaint, fontStyle: 'italic', textAlign: 'center', marginTop: SPACING.sm }}>
        ※ 件名・本文のキーワードから自動分類しています。Google 連携済みのメンバーのみ対象。
      </div>
      </div>
    </div>
  )
}

function MailTab({ T, viewingName, isViewingSelf, onGoToTab, onOpenAIReply, readMarks, onMarkRead, onUnmarkRead }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [allItems, setAllItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)
  const [activeCat, setActiveCat] = useState('to_me')

  useEffect(() => {
    if (!viewingName || !orgId) return
    let alive = true
    setLoading(true); setError(''); setNeedsReauth(false)
    fetch(`/api/integrations/gmail/threads?owner=${encodeURIComponent(viewingName)}&organization_id=${encodeURIComponent(orgId)}&limit=50&category=all`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) {
          setError(j.error || `HTTP ${r.status}`)
          setNeedsReauth(!!j.needsReauth)
          setAllItems([])
        } else {
          setAllItems(j.allItems || j.items || [])
        }
      })
      .catch(e => { if (alive) setError(e.message || 'エラー') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [viewingName, orgId])

  const isUnconnected = error.startsWith('未連携')

  const marks = readMarks || new Set()
  const isDone = (m) => m.replied || marks.has(m.id)

  // 返信必要: To=自分 かつ 未返信 かつ 未既読
  const toMeItems = allItems.filter(m => m.category === 'to_me' && !isDone(m))

  // 確認必要: Cc=自分 / その他 で 未既読
  const ccMeItems = allItems.filter(m =>
    (m.category === 'cc_me' || m.category === 'other') && !isDone(m)
  )

  // 返信・既読済み: 通知/招待系以外で、返信済み or 既読な全て
  //   並び順: 返信済み → 既読のみ (情報量が多い順)
  const donePool = allItems.filter(m => m.category !== 'notification' && m.category !== 'invite' && isDone(m))
  const doneReplied = donePool.filter(m => m.replied)
  const doneReadOnly = donePool.filter(m => !m.replied && marks.has(m.id))
  const doneItems = [...doneReplied, ...doneReadOnly]

  const notifyItems = allItems.filter(m => m.category === 'notification')

  // カレンダー招待 (未読のみ)
  const inviteItems = allItems.filter(m => m.category === 'invite' && !isDone(m))

  const CATS = [
    { key: 'to_me',        icon: 'mail', label: '返信必要',      color: T.danger, items: toMeItems },
    { key: 'cc_me',        icon: 'note', label: '確認必要',      color: T.warn, items: ccMeItems },
    { key: 'invite',       icon: 'calendar', label: 'カレンダー招待',  color: T.info, items: inviteItems },
    { key: 'done',         icon: 'check', label: '返信・既読済み',  color: T.success, items: doneItems },
    { key: 'notification', icon: 'bell', label: '通知・キャンペーン', color: T.textMuted, items: notifyItems },
  ]
  const current = CATS.find(c => c.key === activeCat) || CATS[0]

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
        <h2 style={{ ...TYPO.title3, color: T.text, margin: 0, marginBottom: SPACING.md, display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
          <span style={{ display: 'inline-flex', color: T.accent }}><Icon name="mail" size={16} /></span> メール
        </h2>

        {isUnconnected ? (
          <div style={{
            ...cardStyle({ T, padding: SPACING['2xl'] }),
            ...TYPO.body, color: T.textMuted, textAlign: 'center',
          }}>
            Google と連携するとメールが表示されます。
            <div style={{ marginTop: SPACING.sm + 2 }}>
              <button onClick={() => onGoToTab?.('integrations')} style={{
                ...btnBrand({ size: 'sm' }),
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}><Icon name="link" size={12} /> 連携タブへ</button>
            </div>
          </div>
        ) : error ? (
          <div style={{
            padding: SPACING.md + 2, background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: RADIUS.sm, ...TYPO.subhead, color: T.danger,
            display: 'flex', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap',
          }}>
            <Icon name="alert" size={12} /> {error}
            {needsReauth && (
              <button onClick={() => onGoToTab?.('integrations')} style={{
                ...btnPrimary({ T, size: 'sm', color: T.warn }),
                marginLeft: SPACING.sm,
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}><Icon name="refresh" size={11} /> 再連携</button>
            )}
          </div>
        ) : loading ? (
          <div style={{ padding: SPACING.xl, color: T.textMuted, ...TYPO.subhead, fontWeight: 500, textAlign: 'center' }}>
            読み込み中...
          </div>
        ) : (
          <>
            {/* カテゴリタブ (横スクロール対応で改行を防ぐ) */}
            <div style={{
              display: 'flex', gap: 4, marginBottom: 14,
              borderBottom: `1px solid ${T.border}`, paddingBottom: 0,
              overflowX: 'auto', overflowY: 'hidden',
              flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}>
              {CATS.map(c => {
                const isActive = activeCat === c.key
                const isUrgent = c.key === 'to_me'
                return (
                <button
                  key={c.key}
                  onClick={() => setActiveCat(c.key)}
                  style={{
                    padding: `${SPACING.sm}px ${SPACING.md}px`,
                    background: isActive ? T.bgCard : 'transparent',
                    color: isActive ? c.color : T.textMuted,
                    border: 'none',
                    borderBottom: isActive ? `${isUrgent ? 3.5 : 2.5}px solid ${c.color}` : '2.5px solid transparent',
                    borderRadius: `${RADIUS.sm}px ${RADIUS.sm}px 0 0`,
                    ...TYPO.subhead, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}><Icon name={c.icon} size={12} /> {c.label}</span>
                  <span style={{
                    ...pillStyle({ color: c.color, size: 'sm' }),
                    background: isActive ? `${c.color}22` : T.sectionBg,
                    color: isActive ? c.color : T.textMuted,
                    minWidth: 16, justifyContent: 'center',
                  }}>{c.items.length}</span>
                </button>
              )})}
            </div>

            {/* メール一覧 */}
            {current.items.length === 0 ? (
              <EmptyState T={T} icon={<Icon name="sparkle" size={44} />}
                title="メールはありません"
                description={`「${current.label}」のメールはまだ来ていません。`} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {current.items.map(m => (
                  <MailCard
                    key={m.id}
                    mail={m}
                    T={T}
                    color={current.color}
                    canReply={current.key !== 'notification'}
                    onOpenAIReply={onOpenAIReply}
                    readMarked={marks.has(m.id)}
                    onMarkRead={onMarkRead}
                    onUnmarkRead={onUnmarkRead}
                    viewingName={viewingName}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MailCard({ mail, T, color, canReply, onOpenAIReply, readMarked, onMarkRead, onUnmarkRead, viewingName }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [expanded, setExpanded] = useState(false)
  const [fullBody, setFullBody] = useState(null)
  const [loadingBody, setLoadingBody] = useState(false)
  const [bodyError, setBodyError] = useState('')

  const dateStr = mail.date ? (() => {
    try {
      const d = new Date(mail.date)
      const jst = new Date(d.getTime() + 9 * 3600 * 1000)
      return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
    } catch { return '' }
  })() : ''

  const repliedAtStr = mail.repliedAt ? (() => {
    try {
      const d = new Date(mail.repliedAt)
      const jst = new Date(d.getTime() + 9 * 3600 * 1000)
      return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
    } catch { return '' }
  })() : ''

  const dimmed = mail.replied || readMarked

  const handleExpand = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    if (fullBody !== null || loadingBody) return
    setLoadingBody(true); setBodyError('')
    try {
      const r = await fetch(`/api/integrations/gmail/message?owner=${encodeURIComponent(viewingName || '')}&organization_id=${encodeURIComponent(orgId || '')}&id=${encodeURIComponent(mail.id)}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setBodyError(j.error || `HTTP ${r.status}`)
      else setFullBody(j.text || '(本文なし)')
    } catch (e) {
      setBodyError(e.message || 'エラー')
    }
    setLoadingBody(false)
  }

  return (
    <div style={{
      background: `linear-gradient(180deg, ${T.bgCard} 0%, ${color}08 100%)`,
      border: `1px solid ${color}33`,
      borderRadius: RADIUS.lg, padding: `${SPACING.md + 2}px ${SPACING.lg}px`,
      boxShadow: `${SHADOWS.xs}, ${SHADOWS.glassInset}`,
      backdropFilter: GLASS.blur, WebkitBackdropFilter: GLASS.blur,
      opacity: dimmed ? 0.55 : 1,
      transition: TRANSITION.base,
    }}>
      {/* 返信済み / 既読バッジ */}
      {(mail.replied || readMarked) && (
        <div style={{ marginBottom: SPACING.xs + 2 }}>
          {mail.replied && (
            <span style={{
              ...pillStyle({ color: T.success, size: 'sm' }), marginRight: SPACING.xs + 2,
            }}><Icon name="refresh" size={10} /> 返信済み{repliedAtStr ? ` (${repliedAtStr})` : ''}</span>
          )}
          {readMarked && !mail.replied && (
            <span style={{
              ...pillStyle({ color: T.textMuted, size: 'sm' }),
              background: T.sectionBg, color: T.textMuted,
            }}><Icon name="check" size={10} /> 確認済み</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACING.sm + 2 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs,
            ...TYPO.footnote, fontWeight: 500, color: T.textMuted,
          }}>
            <span style={{ ...TYPO.subhead, fontWeight: 700, color: T.textSub }}>{mail.from}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10.5 }}>・{dateStr}</span>
          </div>
          <div style={{ ...TYPO.callout, color: T.text, marginBottom: SPACING.xs }}>
            {mail.subject}
          </div>
          {/* 本文表示: 展開前はスニペット clamped、展開時は全文を遅延ロード */}
          {!expanded ? (
            <div style={{
              fontSize: 11.5, color: T.textSub, lineHeight: 1.6,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {mail.snippet}
            </div>
          ) : loadingBody ? (
            <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted, padding: '6px 0' }}>読み込み中...</div>
          ) : bodyError ? (
            <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.danger, padding: '6px 0', display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="alert" size={11} /> {bodyError}</div>
          ) : (
            <pre style={{
              fontSize: 11.5, color: T.textSub, lineHeight: 1.6, margin: 0,
              fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 500, overflowY: 'auto',
              padding: `${SPACING.xs + 2}px ${SPACING.sm}px`, background: T.sectionBg, borderRadius: RADIUS.xs,
            }}>{fullBody ?? mail.snippet}</pre>
          )}
          <button onClick={handleExpand} style={{
            marginTop: SPACING.xs, background: 'transparent', border: 'none', color: T.accentText,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}>{expanded ? <><Icon name="chevronU" size={11} /> 閉じる</> : <><Icon name="chevronD" size={11} /> もっと見る</>}</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2, alignItems: 'stretch', minWidth: 88, flexShrink: 0 }}>
          {canReply && !mail.replied && (
            <button onClick={() => onOpenAIReply?.(mail)} style={{
              ...btnBrand({ size: 'sm' }),
              whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
            }}><Icon name="sparkle" size={11} /> AI返信</button>
          )}

          {/* 既読トグル: 返信済みは自動判定なので手動操作不可 */}
          {!mail.replied && canReply && (
            readMarked ? (
              <button onClick={() => onUnmarkRead?.(mail.id)} style={{
                ...btnSecondary({ T, size: 'sm' }),
                color: T.textMuted, whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
              }}><Icon name="refresh" size={10} /> 未読に戻す</button>
            ) : (
              <button onClick={() => onMarkRead?.(mail.id)} style={{
                ...btnSecondary({ T, size: 'sm' }),
                background: T.successBg, color: T.success,
                border: `1px solid ${T.success}40`, fontWeight: 700, whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
              }}><Icon name="check" size={10} /> 既読にする</button>
            )
          )}

          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${mail.threadId}`}
            target="_blank" rel="noreferrer"
            style={{
              ...btnSecondary({ T, size: 'sm' }),
              color: T.textMuted, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
            }}
          >Gmail で開く <Icon name="external" size={10} /></a>
        </div>
      </div>
    </div>
  )
}

// ─── GmailAIModal: AI返信草稿 生成 + 下書き作成 or mailto フォールバック ─────
function GmailAIModal({ open, onClose, mail, owner, T }) {
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!open || !mail) return
    let alive = true
    setLoading(true); setError(''); setDraft('')
    fetch('/api/integrations/gmail/ai-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner,
        subject: mail.subject || '',
        from: mail.fromRaw || mail.from || '',
        snippet: mail.snippet || '',
      }),
    })
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!alive) return
        if (!r.ok) setError(j.error || `HTTP ${r.status}`)
        else setDraft(j.draft || '')
      })
      .catch(e => { if (alive) setError(e.message || 'エラー') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, mail, owner])

  if (!open || !mail) return null

  // From ヘッダから email 部分を抽出
  function extractEmail(raw) {
    if (!raw) return ''
    const m = raw.match(/<([^>]+)>/)
    if (m) return m[1].trim()
    return raw.trim()
  }
  const toEmail = extractEmail(mail.fromRaw || mail.from || '')

  function copyDraft() {
    navigator.clipboard?.writeText(draft || '').then(() => {
      setToast('コピーしました')
      setTimeout(() => setToast(''), 2000)
    }).catch(() => setToast('コピー失敗'))
  }

  function buildFallbackUrl() {
    const url = new URL('https://mail.google.com/mail/')
    url.searchParams.set('view', 'cm')
    url.searchParams.set('fs', '1')
    if (toEmail) url.searchParams.set('to', toEmail)
    url.searchParams.set('su', `Re: ${mail.subject || ''}`)
    url.searchParams.set('body', draft)
    return url.toString()
  }

  // スマホ Safari/Chrome では fetch の await を挟むと window.open が
  // ユーザー操作起点とみなされず blocked される。クリック直後 (同期) に
  // 空タブを開き、結果が返ってきたらそのタブに URL を流し込むことで回避する。
  function navigateTab(targetWindow, url) {
    if (targetWindow && !targetWindow.closed) {
      try { targetWindow.location.href = url; return } catch {}
    }
    const popup = window.open(url, '_blank')
    if (!popup) window.location.href = url   // ポップアップ全面ブロック時は同タブ遷移
  }

  async function createDraft() {
    setSubmitting(true); setToast('')
    // クリック直後の同期処理として空タブを先に開く (スマホのポップアップブロック回避)
    const preWin = window.open('about:blank', '_blank')
    try {
      const r = await fetch('/api/integrations/gmail/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          organization_id: orgId,
          threadId: mail.threadId,
          messageIdHeader: mail.messageIdHeader,
          to: toEmail,
          subject: `Re: ${mail.subject || ''}`,
          body: draft,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        // 403 など → mailto フォールバック (事前に開いたタブをそのまま流用)
        if (r.status === 403 || j.needsScope || j.needsReauth) {
          setToast(`${j.error || 'Gmail API で下書き作成できませんでした'} → 代わりに Gmail の新規作成画面を開きます`)
          navigateTab(preWin, buildFallbackUrl())
          return
        }
        if (preWin && !preWin.closed) { try { preWin.close() } catch {} }
        setError(j.error || `HTTP ${r.status}`)
        return
      }
      // 成功 → 下書きを Gmail で開く
      if (j.openUrl) {
        navigateTab(preWin, j.openUrl)
      } else if (preWin && !preWin.closed) {
        try { preWin.close() } catch {}
      }
      setToast('下書きを作成しました')
      setTimeout(() => { setToast(''); onClose?.() }, 1000)
    } catch (e) {
      if (preWin && !preWin.closed) { try { preWin.close() } catch {} }
      setError(`送信エラー: ${e.message || e}`)
    }
    setSubmitting(false)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bgCard, borderRadius: RADIUS.lg,
          width: '100%', maxWidth: 640, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          border: `1px solid ${T.border}`, overflow: 'hidden',
        }}
      >
        {/* ヘッダ */}
        <div style={{
          padding: '14px 16px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', color: T.accent }}><Icon name="sparkle" size={18} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>AI返信草稿</div>
            <div style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              To: {mail.from} | {mail.subject}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textMuted,
            fontSize: 20, cursor: 'pointer', padding: 4, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center',
          }}><Icon name="cross" size={18} /></button>
        </div>

        {/* 本文 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: T.textMuted, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs }}>
              <Icon name="sparkle" size={12} /> AIが返信草稿を作成中...
            </div>
          ) : error ? (
            <div style={{
              padding: 12, background: T.dangerBg, border: `1px solid ${T.danger}40`,
              borderRadius: 8, fontSize: 12, color: T.danger,
              display: 'flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="alert" size={12} /> {error}</div>
          ) : (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              style={{
                width: '100%', minHeight: 240,
                padding: 12, background: T.sectionBg,
                border: `1px solid ${T.border}`, borderRadius: 8,
                color: T.text, fontSize: 13, lineHeight: 1.7,
                fontFamily: 'inherit', resize: 'vertical',
              }}
            />
          )}
        </div>

        {/* アクション */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${T.border}`,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {toast && (
            <div style={{ flex: 1, fontSize: 11, color: T.textMuted }}>{toast}</div>
          )}
          {!toast && <div style={{ flex: 1 }} />}
          <button
            onClick={copyDraft}
            disabled={loading || !draft}
            style={{
              padding: '8px 14px', borderRadius: 7,
              background: 'transparent', color: T.text,
              border: `1px solid ${T.border}`,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              cursor: loading || !draft ? 'not-allowed' : 'pointer',
              opacity: loading || !draft ? 0.5 : 1,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}
          ><Icon name="note" size={12} /> コピー</button>
          <button
            onClick={createDraft}
            disabled={loading || submitting || !draft}
            style={{
              padding: '8px 14px', borderRadius: 7,
              background: T.accent, color: '#fff', border: 'none',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              cursor: loading || submitting || !draft ? 'not-allowed' : 'pointer',
              opacity: loading || submitting || !draft ? 0.5 : 1,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}
          >{submitting ? '作成中...' : <><Icon name="note" size={12} /> 下書きを作成して Gmail で開く</>}</button>
        </div>
      </div>
    </div>
  )
}

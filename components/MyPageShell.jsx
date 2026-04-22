'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import MyOKRPageNew from './MyOKRPage'
import MyTasksPage from './MyTasksPage'
import OwnerOKRView from './OwnerOKRView'
import FocusFillModal from './FocusFillModal'
import IntegrationsPanel from './IntegrationsPanel'

// ─── Themes ────────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '#0F1117', bgCard: '#1A1D27', bgSidebar: '#14172A',
    border: 'rgba(255,255,255,0.10)', borderMid: 'rgba(255,255,255,0.16)',
    text: '#E8ECF0', textSub: '#B0BAC8', textMuted: '#7a8599', textFaint: '#4A5468',
    accent: '#4d9fff', accentBg: 'rgba(77,159,255,0.14)', accentSolid: '#4d9fff',
    sectionBg: 'rgba(255,255,255,0.03)',
    navActiveBg: 'rgba(77,159,255,0.16)', navActiveText: '#7ab4ff',
    success: '#00d68f', successBg: 'rgba(0,214,143,0.14)',
    warn: '#ffd166', warnBg: 'rgba(255,209,102,0.14)',
    danger: '#ff6b6b', dangerBg: 'rgba(255,107,107,0.14)',
    info: '#4d9fff', infoBg: 'rgba(77,159,255,0.12)',
  },
  light: {
    bg: '#EEF2F5', bgCard: '#FFFFFF', bgSidebar: '#F7F9FC',
    border: '#E2E8F0', borderMid: '#CBD5E0',
    text: '#2D3748', textSub: '#4A5568', textMuted: '#718096', textFaint: '#A0AEC0',
    accent: '#3B82C4', accentBg: 'rgba(59,130,196,0.10)', accentSolid: '#3B82C4',
    sectionBg: '#F8FAFC',
    navActiveBg: 'rgba(59,130,196,0.14)', navActiveText: '#2563EB',
    success: '#059669', successBg: 'rgba(5,150,105,0.10)',
    warn: '#D97706', warnBg: 'rgba(217,119,6,0.10)',
    danger: '#DC2626', dangerBg: 'rgba(220,38,38,0.10)',
    info: '#3B82C4', infoBg: 'rgba(59,130,196,0.10)',
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

// ─── Main component ────────────────────────────────────────────────────────
export default function MyPageShell({ user, members, levels, themeKey = 'dark', fiscalYear = '2026', onAIFeedback }) {
  const T = THEMES[themeKey] || THEMES.dark
  const myName = useMemo(() => members?.find(m => m.email === user?.email)?.name || '', [members, user])
  const isAdmin = useMemo(() => members?.find(m => m.email === user?.email)?.is_admin === true, [members, user])

  const [viewingName, setViewingName] = useState(myName)
  useEffect(() => { if (myName && !viewingName) setViewingName(myName) }, [myName, viewingName])

  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  // 集中記入モーダル (ダッシュボードからも OKR記入タブからも開ける)
  const [focusFillOpen, setFocusFillOpen] = useState(null)  // null | 'kr' | 'ka'
  // AI返信モーダル (ダッシュボードのGmailBox / メールタブ 両方から開く)
  const [aiReplyMail, setAiReplyMail] = useState(null)  // null | { id, threadId, from, fromRaw, subject, snippet, messageIdHeader, ... }

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

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.bg, minHeight: 0 }}>
      {/* ─── 左サイドバー：メンバー一覧 ─── */}
      <div style={{
        width: sidebarCollapsed ? 52 : 220,
        background: T.bgSidebar,
        borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        flexShrink: 0, transition: 'width 0.18s ease',
      }}>
        {/* サイドバーヘッダー */}
        <div style={{
          padding: sidebarCollapsed ? '10px 8px' : '10px 12px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        }}>
          {!sidebarCollapsed && (
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: 0.5 }}>
              メンバー ({filteredMembers.length})
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? '展開' : '折り畳む'}
            style={{
              background: 'transparent', border: `1px solid ${T.border}`, color: T.textSub,
              padding: '3px 7px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            }}
          >{sidebarCollapsed ? '»' : '«'}</button>
        </div>

        {/* 検索 */}
        {!sidebarCollapsed && (
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}` }}>
            <input
              type="text"
              placeholder="🔍 名前で検索"
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
          {filteredMembers.map(m => {
            const log = workLogs[m.name]
            const st = statusOf(log)
            const content = parseLogContent(log?.content)
            const isSelected = m.name === viewingName
            const isMe = m.name === myName
            if (sidebarCollapsed) {
              return (
                <button
                  key={m.id}
                  onClick={() => setViewingName(m.name)}
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
                onClick={() => setViewingName(m.name)}
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
      </div>

      {/* ─── メインエリア ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* サブタブバー */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '8px 14px', borderBottom: `1px solid ${T.border}`,
          background: T.bgCard, flexShrink: 0,
        }}>
          {[
            { key: 'dashboard',    icon: '📊', label: 'ダッシュボード' },
            { key: 'wbs',          icon: '📅', label: 'タスクWBS'     },
            { key: 'okr_edit',     icon: '🎯', label: 'OKR記入'       },
            { key: 'okr_view',     icon: '📈', label: 'OKR詳細'       },
            { key: 'mail',         icon: '📧', label: 'メール'         },
            { key: 'retrospect',   icon: '💭', label: '振り返り'       },
            { key: 'integrations', icon: '🔌', label: '連携'           },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: activeTab === t.key ? T.navActiveBg : 'transparent',
                color: activeTab === t.key ? T.navActiveText : T.textSub,
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >{t.icon} {t.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: T.textMuted, padding: '4px 10px',
            background: T.sectionBg, borderRadius: 7,
          }}>
            <Avatar member={viewingMember} size={20} />
            <span style={{ fontWeight: 700, color: T.text }}>{viewingName || '(未選択)'}</span>
            <span style={{ color: isViewingSelf ? T.accent : T.textMuted, fontWeight: 600 }}>
              {isViewingSelf ? '✏️ 編集可' : '👁 閲覧のみ'}
            </span>
          </div>
        </div>

        {/* タブコンテンツ */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
          {activeTab === 'dashboard' && (
            <DashboardTab
              T={T} themeKey={themeKey}
              viewingName={viewingName} viewingMember={viewingMember}
              isViewingSelf={isViewingSelf} myName={myName}
              workLog={workLogs[viewingName]}
              onWorkLogChange={reloadWorkLogs}
              onGoToTab={(key) => setActiveTab(key)}
              onOpenFocusFill={(mode) => setFocusFillOpen(mode || 'kr')}
              onOpenAIReply={(mail) => setAiReplyMail(mail)}
            />
          )}
          {activeTab === 'wbs' && (
            <MyTasksPage
              user={isViewingSelf ? user : { ...user, email: viewingMember?.email || user?.email }}
              members={members}
              themeKey={themeKey}
              initialViewMode="my"
              onViewModeChange={() => {}}
            />
          )}
          {activeTab === 'okr_edit' && (
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
                  background: '#4d9fff', color: '#fff',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>📝 KR記入モード</button>
                <button onClick={() => setFocusFillOpen('ka')} style={{
                  padding: '5px 12px', borderRadius: 7, border: 'none',
                  background: '#00d68f', color: '#fff',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>📝 KA記入モード</button>
                <div style={{
                  padding: '5px 12px', borderRadius: 7,
                  background: T.navActiveBg, color: T.navActiveText,
                  fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                }}>📋 一覧モード（表示中）</div>
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
          )}
          {activeTab === 'okr_view' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <OwnerOKRView
                ownerName={viewingName}
                levels={levels}
                fiscalYear={fiscalYear}
                themeKey={themeKey}
              />
            </div>
          )}
          {activeTab === 'mail' && (
            <MailTab
              T={T} viewingName={viewingName} isViewingSelf={isViewingSelf}
              onGoToTab={(key) => setActiveTab(key)}
              onOpenAIReply={(mail) => setAiReplyMail(mail)}
            />
          )}
          {activeTab === 'retrospect' && (
            <RetrospectTab T={T} viewingName={viewingName} viewingMember={viewingMember} />
          )}
          {activeTab === 'integrations' && (
            <IntegrationsPanel T={T} myName={myName} isViewingSelf={isViewingSelf} />
          )}
        </div>

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
      </div>
    </div>
  )
}

// ─── ダッシュボードタブ（3カラム骨組み） ───────────────────────────────────
function DashboardTab({ T, viewingName, viewingMember, isViewingSelf, myName, workLog, onWorkLogChange, onGoToTab, onOpenFocusFill, onOpenAIReply }) {
  const content = parseLogContent(workLog?.content)
  const st = statusOf(workLog)

  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const greet = jst.getUTCHours() < 11 ? 'おはようございます' : jst.getUTCHours() < 18 ? 'こんにちは' : 'こんばんは'
  const dateStr = `${jst.getUTCMonth()+1}/${jst.getUTCDate()}(${['日','月','火','水','木','金','土'][jst.getUTCDay()]})`

  const [busy, setBusy] = useState(false)
  const [kptOpen, setKptOpen] = useState(false)

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

  useEffect(() => { loadReminders() }, [loadReminders])

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

    // 自分担当の未完了タスクを全件取得
    const { data } = await supabase
      .from('ka_tasks')
      .select('*, weekly_reports(kr_title, ka_title, owner)')
      .eq('assignee', viewingName)
      .order('due_date', { ascending: true, nullsFirst: false })

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
  useEffect(() => { loadTasks() }, [loadTasks])

  async function toggleTaskDone(task) {
    if (!isViewingSelf) return
    // 既存の task status 仕様 (MyTasksPage.jsx と同じ STATUS_ORDER) に従い循環:
    // not_started → in_progress → done → not_started
    const cur = task.status || (task.done ? 'done' : 'not_started')
    const nextStatus = cur === 'not_started' ? 'in_progress'
                     : cur === 'in_progress' ? 'done'
                     : 'not_started'
    const newDone = nextStatus === 'done'

    // done カラムは確実に更新 (旧スキーマでも成功)
    const { error } = await supabase.from('ka_tasks').update({ done: newDone }).eq('id', task.id)
    if (error) { alert('更新に失敗しました: ' + error.message); return }
    // status カラムがあれば更新 (無い環境でもエラーは握りつぶす、MyTasksPage と同じ方針)
    await supabase.from('ka_tasks').update({ status: nextStatus }).eq('id', task.id).then(() => {}).catch(() => {})

    loadTasks()
    loadReminders()
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
    goal_month_main: true, goal_month_growth: true, goal_week: true, achievements: true,
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
      kind: 'task', date: t.due_date, icon: '✅',
      text: t.title || t.weekly_reports?.ka_title || '(無題)',
    }))
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    setAchievements({ items, loading: false })
  }, [viewingName])
  useEffect(() => { loadAchievements() }, [loadAchievements])

  async function handleStart() {
    if (busy || !myName) return
    setBusy(true)
    const { error } = await supabase.from('coaching_logs').insert({
      owner: myName,
      log_type: 'work_log',
      week_start: getMondayJSTStr(),
      content: JSON.stringify({ start_at: new Date().toISOString() }),
    })
    setBusy(false)
    if (error) { alert('始業の記録に失敗しました: ' + error.message); return }
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
        week_start: getMondayJSTStr(),
        content: JSON.stringify({ keep, problem, try: tryNote }),
      })
      if (e2) console.warn('KPT保存エラー', e2)
    }
    setBusy(false)
    setKptOpen(false)
    await onWorkLogChange()
  }

  // ─── A. 始業ゲーティング: 自分閲覧 & 未始業 → 始業画面のみ表示 ────
  if (isViewingSelf && st === 'none') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <StartWorkGate
          T={T} viewingMember={viewingMember} viewingName={viewingName}
          greet={greet} dateStr={dateStr} busy={busy} onStart={handleStart}
        />
      </div>
    )
  }

  // ─── 表示判定ヘルパー ────
  const showW = (key) => prefs[key] !== false  // デフォルト未設定はtrue扱い

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 挨拶バー + 始業/終業ボタン + 設定 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '10px 16px', background: T.sectionBg, borderBottom: `1px solid ${T.border}`,
        flexShrink: 0, position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar member={viewingMember} size={36} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
              {greet}、{viewingName}さん
            </div>
            <div style={{ fontSize: 11, color: T.textMuted }}>
              {dateStr} ·
              {st === 'on'  && content.start_at ? ` 🟢 稼働中 (${jstHHMM(content.start_at)}〜)` :
               st === 'off' && content.end_at   ? ` 🔵 本日終業済み (${jstHHMM(content.start_at)}–${jstHHMM(content.end_at)})` :
                                                  ' ⚪ 未始業'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isViewingSelf && st === 'on' && (
            <button onClick={() => setKptOpen(true)} disabled={busy} style={{
              background: T.info, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: busy ? 0.6 : 1,
            }}>🌙 終業する</button>
          )}
          {isViewingSelf && st === 'off' && (
            <div style={{ fontSize: 11, color: T.textMuted, padding: '8px 12px' }}>お疲れさまでした</div>
          )}
          {/* 設定ボタン (ウィジェット表示切替) */}
          <button onClick={() => setSettingsOpen(v => !v)} title="ウィジェットの表示設定" style={{
            background: settingsOpen ? T.accentBg : 'transparent',
            border: `1px solid ${T.border}`, color: T.textSub,
            borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>⚙️</button>
        </div>

        {settingsOpen && (
          <SettingsPopover
            T={T} prefs={prefs} togglePref={togglePref} resetPrefs={resetPrefs} onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      {/* 3カラム本体 */}
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 10, padding: 10, minHeight: 0, overflow: 'hidden',
      }}>
        {/* ─── 左カラム：今日やること / 今週やること ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          {showW('today') && (
            <Section T={T} icon="⚡" title={`今日やること${taskBoard.today.length ? ` (${taskBoard.today.length})` : ''}`} flex={1} headerRight={
              <button onClick={loadTasks} title="再読み込み" style={{
                background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
                borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
              }}>↻</button>
            }>
              {taskBoard.loading ? <Loading T={T} /> :
                taskBoard.today.length === 0
                  ? <div style={{ fontSize: 11, color: T.textMuted, padding: 6 }}>✨ 今日のタスクはありません</div>
                  : <TaskList T={T} tasks={taskBoard.today} canEdit={isViewingSelf} onToggle={toggleTaskDone} showDue />}
            </Section>
          )}
          {showW('week') && (
            <Section T={T} icon="📅" title="今週やること" flex={1}>
              {taskBoard.loading ? <Loading T={T} /> : (
                <WeekTasks T={T} byWeekday={taskBoard.byWeekday} canEdit={isViewingSelf} onToggle={toggleTaskDone} />
              )}
            </Section>
          )}
        </div>

        {/* ─── 中カラム：リマインダーBox 種類別に独立表示 ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflowY: 'auto' }}>
          {/* 常に表示: OKR記入漏れ - 集中記入モーダル呼び出し */}
          <Section T={T} icon="📊" title="OKR・KA記入漏れ" flex={0} headerRight={
            <button onClick={loadReminders} title="再読み込み" style={{
              background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
              borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
            }}>↻</button>
          }>
            {reminders.loading ? <Loading T={T} /> : (() => {
              const items = [
                ...reminders.missingKRs.map(kr => ({ icon: '🎯', sev: 'warn',
                  text: `KR「${truncate(kr.title, 28)}」未記入` })),
                ...reminders.missingKAs.map(ka => ({ icon: '📋', sev: 'warn',
                  text: `KA「${truncate(ka.ka_title || ka.kr_title, 28)}」未記入` })),
              ]
              const krCount = reminders.missingKRs.length
              const kaCount = reminders.missingKAs.length
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <ReminderList T={T} items={items} maxVisible={3}
                    emptyText="✨ 今週分はすべて記入済みです" />
                  {/* 集中記入モーダル呼び出し: KR/KAそれぞれ */}
                  {(krCount > 0 || kaCount > 0) && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      {krCount > 0 && (
                        <button onClick={() => onOpenFocusFill && onOpenFocusFill('kr')}
                          style={{
                            flex: 1, padding: '6px 10px', border: 'none',
                            background: '#4d9fff', color: '#fff',
                            borderRadius: 6, fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>🎯 KR記入 ({krCount}) →</button>
                      )}
                      {kaCount > 0 && (
                        <button onClick={() => onOpenFocusFill && onOpenFocusFill('ka')}
                          style={{
                            flex: 1, padding: '6px 10px', border: 'none',
                            background: '#00d68f', color: '#fff',
                            borderRadius: 6, fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>📋 KA記入 ({kaCount}) →</button>
                      )}
                    </div>
                  )}
                  <button onClick={() => onGoToTab && onGoToTab('okr_edit')}
                    style={{
                      background: 'transparent', border: `1px dashed ${T.borderMid}`,
                      color: T.textMuted, borderRadius: 6, padding: '4px 8px',
                      fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    }}>一覧で見る →</button>
                </div>
              )
            })()}
          </Section>

          {/* カレンダー Box - 直近8時間の予定 */}
          {showW('calendar') && (
            <CalendarBox T={T} viewingName={viewingName} onGoToTab={onGoToTab} />
          )}

          {/* Gmail Box - 返信必要 / 確認必要 5件 */}
          {showW('gmail') && (
            <GmailBox T={T} viewingName={viewingName} onGoToTab={onGoToTab} onOpenAIReply={onOpenAIReply} />
          )}
        </div>

        {/* ─── 右カラム：ポップなゴール3種 + コンパクト成果 ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflowY: 'auto' }}>
          {showW('goal_month_main') && (
            <PopGoalCard
              T={T} icon="🌟" title="今月のメインテーマ"
              gradient="linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%)"
              accent="#92400e"
              value={monthTheme.main} loading={monthTheme.loading} canEdit={isViewingSelf}
              placeholder="例: 評議会24社のクロージング完了"
              onSave={(v) => saveMonthTheme({ main: v, growth: monthTheme.growth })}
            />
          )}
          {showW('goal_month_growth') && (
            <PopGoalCard
              T={T} icon="💪" title="今月の成長テーマ"
              gradient="linear-gradient(135deg, #fce7f3 0%, #c084fc 100%)"
              accent="#7c2d8e"
              value={monthTheme.growth} loading={monthTheme.loading} canEdit={isViewingSelf}
              placeholder="例: 1on1で相手の話を引き出す力"
              onSave={(v) => saveMonthTheme({ main: monthTheme.main, growth: v })}
            />
          )}
          {showW('goal_week') && (
            <PopGoalCard
              T={T} icon="🚀" title="今週のゴール"
              gradient="linear-gradient(135deg, #cffafe 0%, #38bdf8 100%)"
              accent="#075985"
              value={weekGoal.goal} loading={weekGoal.loading} canEdit={isViewingSelf}
              placeholder="例: 提案書v2をクライアントに提出して承認をもらう"
              onSave={(v) => saveWeekGoal(v)}
            />
          )}
          {showW('achievements') && (
            <Section T={T} icon="🏆" title="今週の成果" flex={0} headerRight={
              <button onClick={loadAchievements} title="再読み込み" style={{
                background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
                borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
              }}>↻</button>
            }>
              {achievements.loading ? <Loading T={T} /> : (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 8,
                    padding: '8px 10px', marginBottom: 6,
                    background: T.successBg, border: `1px solid ${T.success}33`,
                    borderRadius: 7,
                  }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: T.success || '#00d68f' }}>
                      {achievements.items.length}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>件 タスク完了</span>
                  </div>
                  <div style={{ maxHeight: 110, overflowY: 'auto' }}>
                    {achievements.items.length === 0
                      ? <div style={{ fontSize: 11, color: T.textMuted, padding: 6 }}>今週の完了タスクはまだありません</div>
                      : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {achievements.items.map((it, i) => (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'flex-start', gap: 6,
                              padding: '4px 6px', borderRadius: 5,
                              background: T.successBg, border: `1px solid ${T.success}22`,
                              fontSize: 10, color: T.text, lineHeight: 1.4,
                            }}>
                              <span>{it.icon}</span>
                              <span style={{ color: T.textMuted, fontWeight: 600, minWidth: 40, fontSize: 9 }}>{it.date || '--'}</span>
                              <span style={{ flex: 1 }}>{it.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                </>
              )}
            </Section>
          )}
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
function StartWorkGate({ T, viewingMember, viewingName, greet, dateStr, busy, onStart }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgCard} 100%)`,
      padding: 30,
    }}>
      <div style={{
        textAlign: 'center', padding: '40px 50px',
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
        maxWidth: 480, width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Avatar member={viewingMember} size={64} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 4 }}>
          {greet}、{viewingName}さん 👋
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 30 }}>
          {dateStr} · 良い1日を始めましょう
        </div>
        <button
          onClick={onStart}
          disabled={busy}
          style={{
            background: 'linear-gradient(135deg, #00d68f 0%, #4d9fff 100%)',
            color: '#fff', border: 'none', borderRadius: 14,
            padding: '16px 48px', fontSize: 18, fontWeight: 800,
            cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
            opacity: busy ? 0.6 : 1, letterSpacing: 1,
            boxShadow: '0 8px 24px rgba(0,214,143,0.35)',
            transition: 'transform 0.1s',
          }}
          onMouseEnter={e => !busy && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
        >☀️ 始業する</button>
        <div style={{ marginTop: 20, fontSize: 10, color: T.textFaint }}>
          ※ 翌日 04:00 JST に自動的にリセットされます
        </div>
      </div>
    </div>
  )
}

// ─── 設定ポップオーバー (ウィジェット表示/非表示) ──────────
function SettingsPopover({ T, prefs, togglePref, resetPrefs, onClose }) {
  const groups = [
    { title: 'タスク', items: [
      { key: 'today', label: '⚡ 今日やること' },
      { key: 'week',  label: '📅 今週やること' },
    ]},
    { title: '外部連携', items: [
      { key: 'calendar', label: '📅 Google カレンダー' },
      { key: 'gmail',    label: '📧 Gmail (重要メール)' },
    ]},
    { title: 'ゴール / 成果', items: [
      { key: 'goal_month_main',   label: '🌟 今月のメインテーマ' },
      { key: 'goal_month_growth', label: '💪 今月の成長テーマ' },
      { key: 'goal_week',         label: '🚀 今週のゴール' },
      { key: 'achievements',      label: '🏆 今週の成果' },
    ]},
  ]
  // ※ リマインダーBox (OKR/タスク/Googleカレンダー/Gmail/Slack/LINE) は常時表示
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'transparent',
      }} />
      <div style={{
        position: 'absolute', right: 16, top: '100%', marginTop: 6,
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        zIndex: 101, padding: 12, minWidth: 240, maxHeight: '70vh', overflowY: 'auto',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1 }}>
            ⚙️ 表示するウィジェット
          </div>
          <button
            onClick={() => { if (window.confirm('初期状態に戻しますか?')) resetPrefs() }}
            title="全ての表示/非表示設定を初期値に戻す"
            style={{
              background: 'transparent', border: `1px solid ${T.borderMid}`,
              color: T.textMuted, borderRadius: 5, padding: '3px 8px',
              fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
            }}
          >↻ リセット</button>
        </div>
        {groups.map(g => (
          <div key={g.title} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
              {g.title}
            </div>
            {g.items.map(it => (
              <label key={it.key} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px',
                cursor: 'pointer', borderRadius: 5, fontSize: 12, color: T.text,
              }}
                onMouseEnter={e => e.currentTarget.style.background = T.sectionBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <input
                  type="checkbox"
                  checked={prefs[it.key] !== false}
                  onChange={() => togglePref(it.key)}
                  style={{ cursor: 'pointer' }}
                />
                <span>{it.label}</span>
              </label>
            ))}
          </div>
        ))}
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}` }}>
          設定はこのブラウザに保存されます
        </div>
      </div>
    </>
  )
}

// ─── ポップなゴールカード ─────────────────────────────────
function PopGoalCard({ T, icon, title, gradient, accent, value, loading, canEdit, placeholder, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  function startEdit() { setDraft(value || ''); setEditing(true) }
  async function commit() {
    setSaving(true); await onSave(draft); setSaving(false); setEditing(false)
  }
  return (
    <div style={{
      background: gradient,
      border: `1px solid rgba(255,255,255,0.5)`,
      borderRadius: 14,
      padding: 14,
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
        <div style={{ fontSize: 12, fontWeight: 800, color: accent, flex: 1, letterSpacing: 0.3 }}>
          {title}
        </div>
        {canEdit && !editing && (
          <button onClick={startEdit} title="編集" style={{
            background: 'rgba(255,255,255,0.6)', border: 'none', color: accent,
            borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 700,
          }}>✏️ 編集</button>
        )}
      </div>
      {loading ? (
        <div style={{ fontSize: 11, color: accent, opacity: 0.7 }}>読み込み中...</div>
      ) : editing ? (
        <div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            placeholder={placeholder}
            style={{
              width: '100%', padding: 8, background: 'rgba(255,255,255,0.85)',
              border: `1px solid ${accent}33`, borderRadius: 6, color: '#222',
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
            <button onClick={() => setEditing(false)} disabled={saving} style={{
              background: 'rgba(255,255,255,0.6)', border: 'none', color: accent,
              borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 700,
            }}>キャンセル</button>
            <button onClick={commit} disabled={saving} style={{
              background: accent, border: 'none', color: '#fff',
              borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}>💾 保存</button>
          </div>
        </div>
      ) : value ? (
        <div style={{
          fontSize: 13, color: '#1a1a1a', lineHeight: 1.55, whiteSpace: 'pre-wrap',
          fontWeight: 600,
        }}>{value}</div>
      ) : (
        <div style={{ fontSize: 11, color: accent, opacity: 0.65, fontStyle: 'italic' }}>
          {canEdit ? `${placeholder} (✏️ 編集 で記入)` : '未設定'}
        </div>
      )}
    </div>
  )
}

// ─── KPT入力モーダル ───────────────────────────────────────────────────────
function KPTModal({ T, busy, onCancel, onSave, startedAt }) {
  const [keep, setKeep] = useState('')
  const [problem, setProblem] = useState('')
  const [tryNote, setTryNote] = useState('')

  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const dateStr = `${jst.getUTCMonth()+1}/${jst.getUTCDate()}(${['日','月','火','水','木','金','土'][jst.getUTCDay()]})`
  const worked = startedAt ? (() => {
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

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 12,
          padding: 20, width: '100%', maxWidth: 520, maxHeight: '90vh',
          overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>🌙 今日の振り返り</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {dateStr}{worked ? ` · 稼働 ${worked}` : ''}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>🟢 Keep（良かったこと・続けたいこと）</label>
          <div style={hintStyle}>成果・学び・上手くいったこと</div>
          <textarea value={keep} onChange={e => setKeep(e.target.value)} style={fieldStyle} placeholder="例: やずや提案の構成が整理できた" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>🟡 Problem（課題・うまくいかなかったこと）</label>
          <div style={hintStyle}>詰まった点・改善したいこと</div>
          <textarea value={problem} onChange={e => setProblem(e.target.value)} style={fieldStyle} placeholder="例: 午前中の集中が途切れやすかった" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>🔵 Try（明日以降に試したいこと）</label>
          <div style={hintStyle}>次のアクション</div>
          <textarea value={tryNote} onChange={e => setTryNote(e.target.value)} style={fieldStyle} placeholder="例: 朝イチ90分はSlack off で提案書に集中する" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              background: 'transparent', border: `1px solid ${T.borderMid}`, color: T.textSub,
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >キャンセル</button>
          <button
            onClick={() => onSave({ keep, problem, tryNote })}
            disabled={busy}
            style={{
              background: T.info, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 18px', fontSize: 13, fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: busy ? 0.6 : 1,
            }}
          >💾 保存して終業</button>
        </div>
      </div>
    </div>
  )
}

function Section({ T, icon, title, children, flex = 1, headerRight = null }) {
  // flex=0 の場合は内容に合わせて自動サイズ (flex-basis:0 の罠を回避)
  // flex>=1 の場合は grow して親の残りスペースを埋める
  const isAutoSize = flex === 0 || flex === 'none'
  const outerStyle = isAutoSize
    ? { flex: '0 0 auto', display: 'flex', flexDirection: 'column',
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 10, overflow: 'hidden' }
    : { flex, display: 'flex', flexDirection: 'column', minHeight: 0,
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 10, overflow: 'hidden' }
  const innerStyle = isAutoSize
    ? { padding: '8px 12px' }
    : { flex: 1, overflowY: 'auto', padding: '8px 12px', minHeight: 0 }
  return (
    <div style={outerStyle}>
      <div style={{
        padding: '8px 12px', borderBottom: `1px solid ${T.border}`,
        fontSize: 12, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 6,
        flexShrink: 0, background: T.sectionBg,
      }}>
        <span>{icon}</span><span style={{ flex: 1 }}>{title}</span>
        {headerRight}
      </div>
      <div style={innerStyle}>
        {children}
      </div>
    </div>
  )
}

// ─── 振り返りタブ：KPT + work_log の時系列一覧 ──────────────────────
function RetrospectTab({ T, viewingName, viewingMember }) {
  const [range, setRange] = useState('week') // 'week' | 'month' | 'all'
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', background: T.sectionBg,
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <Avatar member={viewingMember} size={28} />
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
          {viewingName} さんの振り返り
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: T.textMuted, marginRight: 10 }}>
          {totalDays}日の記録 · 合計 {totalHrs}時間{totalMins}分
        </div>
        <div style={{ display: 'flex', gap: 2, background: T.bgCard, padding: 3, borderRadius: 8, border: `1px solid ${T.border}` }}>
          {[
            { key: 'week',  label: '今週' },
            { key: 'month', label: '今月' },
            { key: 'all',   label: '全期間' },
          ].map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: range === r.key ? T.navActiveBg : 'transparent',
              color: range === r.key ? T.navActiveText : T.textMuted,
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
            }}>{r.label}</button>
          ))}
        </div>
        <button onClick={load} title="再読み込み" style={{
          background: 'transparent', border: `1px solid ${T.border}`, color: T.textMuted,
          borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
        }}>↻</button>
      </div>

      {/* 本体 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {data.loading ? <Loading T={T} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 880, margin: '0 auto' }}>
            {/* サマリー: タスク統計 + KPT 集約 */}
            <RetrospectSummary T={T} stats={data.taskStats} kpt={data.kptSummary} range={range} />

            {/* 日別ログ */}
            {data.days.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.textMuted, fontSize: 12 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>💭</div>
                <div>この期間のKPT記録はまだありません</div>
                <div style={{ marginTop: 6, fontSize: 10 }}>
                  ダッシュボードの「🌙 終業する」でKPTを記入すると、ここに蓄積されます
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

function RetrospectSummary({ T, stats, kpt, range }) {
  const rangeLabel = range === 'week' ? '今週' : range === 'month' ? '今月' : '全期間'
  const total = stats.onTime + stats.overdue
  const completionPct = total > 0 ? Math.round((stats.onTime / total) * 100) : 0
  const renderList = (label, items, color, bg) => (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color, marginBottom: 6,
        padding: '3px 8px', background: bg, borderRadius: 5, display: 'inline-block',
      }}>{label} ({items.length})</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: T.textMuted, padding: '4px 8px' }}>記入なし</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: T.text }}>
          {items.map((it, i) => (
            <li key={i}>
              {it.text}
              <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 6 }}>({it.date.slice(5).replace('-', '/')})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 10,
      padding: 14, display: 'grid',
      gridTemplateColumns: 'minmax(220px, 1fr) minmax(320px, 2fr)',
      gap: 16,
    }}>
      {/* 左: 成果 (タスク統計) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.textSub, letterSpacing: 0.5 }}>
          📊 {rangeLabel}の成果
        </div>
        <div style={{
          padding: 14, background: 'rgba(0,214,143,0.10)', border: '1px solid rgba(0,214,143,0.3)',
          borderRadius: 8, textAlign: 'center',
        }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#00d68f', lineHeight: 1 }}>{stats.onTime}</div>
          <div style={{ fontSize: 11, color: T.textSub, marginTop: 5, fontWeight: 600 }}>✅ 完了タスク</div>
        </div>
        <div style={{
          padding: 14, background: 'rgba(255,107,107,0.10)', border: '1px solid rgba(255,107,107,0.3)',
          borderRadius: 8, textAlign: 'center',
        }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#ff6b6b', lineHeight: 1 }}>{stats.overdue}</div>
          <div style={{ fontSize: 11, color: T.textSub, marginTop: 5, fontWeight: 600 }}>🚨 遅延タスク</div>
        </div>
        <div style={{
          padding: 14, background: 'rgba(77,159,255,0.10)', border: '1px solid rgba(77,159,255,0.3)',
          borderRadius: 8, textAlign: 'center',
        }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#4d9fff', lineHeight: 1 }}>{completionPct}%</div>
          <div style={{ fontSize: 11, color: T.textSub, marginTop: 5, fontWeight: 600 }}>📈 期限内達成率</div>
        </div>
      </div>

      {/* 右: KPT 集約 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.textSub, letterSpacing: 0.5 }}>
          💭 {rangeLabel}の KPT
        </div>
        {renderList('🟢 Keep', kpt.keep, '#00a86b', 'rgba(0,168,107,0.12)')}
        {renderList('🟡 Problem', kpt.problem, '#d49500', 'rgba(212,149,0,0.12)')}
        {renderList('🔵 Try', kpt.try, '#4d9fff', 'rgba(77,159,255,0.12)')}
      </div>
    </div>
  )
}

function RetrospectDay({ T, day }) {
  const dt = new Date(day.date + 'T00:00:00Z')
  const wd = ['日','月','火','水','木','金','土'][dt.getUTCDay()]
  const dateLabel = `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}(${wd})`

  const { start_at, end_at } = day.workLog || {}
  const worked = (start_at && end_at) ? (() => {
    const mins = Math.floor((new Date(end_at) - new Date(start_at)) / 60000)
    return `${Math.floor(mins / 60)}時間${mins % 60}分`
  })() : ''

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', background: T.sectionBg,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{dateLabel}</div>
        <div style={{ flex: 1 }} />
        {start_at && (
          <div style={{ fontSize: 10, color: T.textMuted }}>
            ⏰ {jstHHMM(start_at)}{end_at ? ` – ${jstHHMM(end_at)}` : ' 〜'}{worked && ` (${worked})`}
          </div>
        )}
      </div>
      {day.kpts.length === 0 ? (
        <div style={{ padding: 12, fontSize: 11, color: T.textMuted, fontStyle: 'italic' }}>
          KPTの記入はありません
        </div>
      ) : (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {day.kpts.map(kpt => (
            <div key={kpt.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <KPTField T={T} color={T.success} label="🟢 Keep"     text={kpt.keep} />
              <KPTField T={T} color={T.warn}    label="🟡 Problem" text={kpt.problem} />
              <KPTField T={T} color={T.info}    label="🔵 Try"     text={kpt.try} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function KPTField({ T, color, label, text }) {
  return (
    <div style={{
      padding: 10, background: T.sectionBg, borderRadius: 6,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 4, letterSpacing: 0.3 }}>
        {label}
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
        }}>✏️</button>
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
            }}>💾 保存</button>
          </div>
        </div>
      ) : value ? (
        <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{value}</div>
      ) : (
        <div style={{ fontSize: 11, color: T.textMuted, fontStyle: 'italic' }}>
          {canEdit ? '未設定 (✏️ で編集)' : '未設定'}
        </div>
      )}
    </Section>
  )
}

// 既存の MyTasksPage.jsx STATUS_CONFIG と合わせる (not_started / in_progress / done)
const TASK_STATUS_CONFIG = {
  not_started: { icon: '○', color: '#7a8599', label: '未着手' },
  in_progress: { icon: '◐', color: '#4d9fff', label: '進行中' },
  done:        { icon: '●', color: '#00d68f', label: '完了' },
}

function TaskList({ T, tasks, canEdit, onToggle, showDue = false }) {
  const today = toJSTDateStr(new Date())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {tasks.map(t => {
        const status = t.status || (t.done ? 'done' : 'not_started')
        const cfg = TASK_STATUS_CONFIG[status] || TASK_STATUS_CONFIG.not_started
        const done = status === 'done'
        const overdue = t.due_date && t.due_date < today && !done
        const label = t.title || t.weekly_reports?.ka_title || '(無題)'
        const nextLabel = status === 'not_started' ? '進行中'
                        : status === 'in_progress' ? '完了'
                        : '未着手'
        return (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            padding: '6px 8px', borderRadius: 6,
            background: overdue ? T.dangerBg : T.sectionBg,
            border: `1px solid ${overdue ? `${T.danger}33` : T.border}`,
            opacity: done ? 0.55 : 1,
          }}>
            <button
              onClick={() => canEdit && onToggle(t)}
              disabled={!canEdit}
              title={canEdit ? `クリックで「${nextLabel}」に変更` : '閲覧のみ'}
              style={{
                width: 18, height: 18, flexShrink: 0, marginTop: 1,
                borderRadius: 4, border: 'none', background: 'transparent',
                color: cfg.color, fontSize: 16, lineHeight: 1,
                cursor: canEdit ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, fontFamily: 'inherit', fontWeight: 700,
              }}
            >{cfg.icon}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, color: T.text, fontWeight: 500,
                textDecoration: done ? 'line-through' : 'none',
                lineHeight: 1.4, wordBreak: 'break-word',
              }}>{label}</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {showDue && t.due_date && (
                  <span style={{ color: overdue ? T.danger : T.textMuted, fontWeight: overdue ? 700 : 500 }}>
                    {overdue ? '🚨 ' : '📅 '}{t.due_date}
                  </span>
                )}
                {status === 'in_progress' && <span style={{ color: cfg.color, fontWeight: 700 }}>{cfg.icon} {cfg.label}</span>}
                {t.weekly_reports?.kr_title && <span>KR: {truncate(t.weekly_reports.kr_title, 20)}</span>}
              </div>
            </div>
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
  if (totalCount === 0) return <div style={{ fontSize: 11, color: T.textMuted, padding: 6 }}>✨ 今週の期限タスクはありません</div>
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
    return <div style={{ fontSize: 11, color: T.textMuted, padding: 6 }}>{emptyText}</div>
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
        }}>
          <span style={{ flexShrink: 0 }}>{it.icon}</span>
          <span style={{ flex: 1 }}>{it.text}</span>
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

// ─── CalendarBox: ダッシュボードの直近8時間カレンダー ────────────────────
function CalendarBox({ T, viewingName, onGoToTab }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)

  useEffect(() => {
    if (!viewingName) return
    let alive = true
    setLoading(true); setError(''); setNeedsReauth(false)
    fetch(`/api/integrations/calendar/events?owner=${encodeURIComponent(viewingName)}&hours=8`)
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
  }, [viewingName])

  const isUnconnected = error === '未連携'
  const visible = items.slice(0, 5)
  const extra = Math.max(0, items.length - visible.length)

  return (
    <Section T={T} icon="📅" title="Google カレンダー (直近8時間)" flex={0}>
      {loading ? (
        <div style={{ padding: 12, color: T.textMuted, fontSize: 11 }}>読み込み中...</div>
      ) : isUnconnected ? (
        <div style={{ padding: 10, fontSize: 11, color: T.textMuted, lineHeight: 1.7 }}>
          未連携です。
          <button onClick={() => onGoToTab?.('integrations')} style={{
            marginLeft: 6, padding: '3px 10px', borderRadius: 6,
            background: T.accent, color: '#fff', border: 'none',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>🔌 連携タブへ</button>
        </div>
      ) : error ? (
        <div style={{ padding: 10, fontSize: 11, color: T.danger, lineHeight: 1.6 }}>
          ⚠️ {error}
          {needsReauth && (
            <button onClick={() => onGoToTab?.('integrations')} style={{
              marginLeft: 6, padding: '3px 10px', borderRadius: 6,
              background: T.warn, color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>🔄 再連携</button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: 10, fontSize: 11, color: T.textMuted }}>✨ 直近の予定はありません</div>
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
          }}>📅 Google カレンダーを開く ↗</a>
        </div>
      )}
    </Section>
  )
}

// ─── GmailBox: ダッシュボードの重要メール 5件 ────────────────────────────
function GmailBox({ T, viewingName, onGoToTab, onOpenAIReply }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)

  useEffect(() => {
    if (!viewingName) return
    let alive = true
    setLoading(true); setError(''); setNeedsReauth(false)
    fetch(`/api/integrations/gmail/threads?owner=${encodeURIComponent(viewingName)}&limit=5&category=important`)
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
  }, [viewingName])

  const isUnconnected = error === '未連携'

  return (
    <Section
      T={T} icon="📧" title="Gmail (返信必要 / 確認必要 5件)" flex={0}
      headerRight={
        !isUnconnected && !error ? (
          <button onClick={() => onGoToTab?.('mail')} style={{
            padding: '3px 8px', borderRadius: 6,
            background: 'transparent', color: T.accent,
            border: `1px solid ${T.accent}40`,
            fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>📧 メールタブで全部見る →</button>
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
          }}>🔌 連携タブへ</button>
        </div>
      ) : error ? (
        <div style={{ padding: 10, fontSize: 11, color: T.danger, lineHeight: 1.6 }}>
          ⚠️ {error}
          {needsReauth && (
            <button onClick={() => onGoToTab?.('integrations')} style={{
              marginLeft: 6, padding: '3px 10px', borderRadius: 6,
              background: T.warn, color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>🔄 再連携</button>
          )}
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 10, fontSize: 11, color: T.textMuted }}>✨ 要対応メールはありません</div>
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
              <button onClick={() => onOpenAIReply?.(m)} style={{
                padding: '4px 10px', borderRadius: 6,
                background: T.accent, color: '#fff', border: 'none',
                fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}>✨ AI返信</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ─── MailTab: 3カテゴリ分類のメールタブ ─────────────────────────────
function MailTab({ T, viewingName, isViewingSelf, onGoToTab, onOpenAIReply }) {
  const [allItems, setAllItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needsReauth, setNeedsReauth] = useState(false)
  const [activeCat, setActiveCat] = useState('to_me')

  useEffect(() => {
    if (!viewingName) return
    let alive = true
    setLoading(true); setError(''); setNeedsReauth(false)
    fetch(`/api/integrations/gmail/threads?owner=${encodeURIComponent(viewingName)}&limit=50&category=all`)
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
  }, [viewingName])

  const isUnconnected = error === '未連携'

  const toMeItems    = allItems.filter(m => m.category === 'to_me')
  const ccMeItems    = allItems.filter(m => m.category === 'cc_me' || m.category === 'other')
  const notifyItems  = allItems.filter(m => m.category === 'notification')

  const CATS = [
    { key: 'to_me',        label: '📮 返信必要',      color: '#ff6b6b', items: toMeItems },
    { key: 'cc_me',        label: '📋 確認必要',      color: '#ffd166', items: ccMeItems },
    { key: 'notification', label: '📢 通知・キャンペーン', color: '#8aa0b8', items: notifyItems },
  ]
  const current = CATS.find(c => c.key === activeCat) || CATS[0]

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0, marginBottom: 12 }}>
          📧 メール
        </h2>

        {isUnconnected ? (
          <div style={{
            padding: 24, background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: 10, fontSize: 13, color: T.textMuted, textAlign: 'center',
          }}>
            Google と連携するとメールが表示されます。
            <div style={{ marginTop: 10 }}>
              <button onClick={() => onGoToTab?.('integrations')} style={{
                padding: '8px 16px', borderRadius: 8,
                background: T.accent, color: '#fff', border: 'none',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>🔌 連携タブへ</button>
            </div>
          </div>
        ) : error ? (
          <div style={{
            padding: 14, background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: 8, fontSize: 12, color: T.danger,
          }}>
            ⚠️ {error}
            {needsReauth && (
              <button onClick={() => onGoToTab?.('integrations')} style={{
                marginLeft: 8, padding: '4px 12px', borderRadius: 6,
                background: T.warn, color: '#fff', border: 'none',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>🔄 再連携</button>
            )}
          </div>
        ) : loading ? (
          <div style={{ padding: 20, color: T.textMuted, fontSize: 12, textAlign: 'center' }}>
            読み込み中...
          </div>
        ) : (
          <>
            {/* カテゴリタブ */}
            <div style={{
              display: 'flex', gap: 6, marginBottom: 14,
              borderBottom: `1px solid ${T.border}`, paddingBottom: 0,
            }}>
              {CATS.map(c => (
                <button
                  key={c.key}
                  onClick={() => setActiveCat(c.key)}
                  style={{
                    padding: '8px 14px',
                    background: activeCat === c.key ? T.bgCard : 'transparent',
                    color: activeCat === c.key ? c.color : T.textMuted,
                    border: 'none',
                    borderBottom: activeCat === c.key ? `3px solid ${c.color}` : '3px solid transparent',
                    borderRadius: '8px 8px 0 0',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{c.label} ({c.items.length})</button>
              ))}
            </div>

            {/* メール一覧 */}
            {current.items.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
                ✨ メールはありません
              </div>
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

function MailCard({ mail, T, color, canReply, onOpenAIReply }) {
  const [expanded, setExpanded] = useState(false)
  const dateStr = mail.date ? (() => {
    try {
      const d = new Date(mail.date)
      const jst = new Date(d.getTime() + 9 * 3600 * 1000)
      return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
    } catch { return '' }
  })() : ''

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
            fontSize: 11, color: T.textMuted,
          }}>
            <span style={{ fontWeight: 700, color: T.textSub }}>{mail.from}</span>
            <span>・{dateStr}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>
            {mail.subject}
          </div>
          <div style={{
            fontSize: 11, color: T.textSub, lineHeight: 1.6,
            ...(expanded ? {} : {
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            })
          }}>
            {mail.snippet}
          </div>
          {mail.snippet && mail.snippet.length > 120 && (
            <button onClick={() => setExpanded(!expanded)} style={{
              marginTop: 4, background: 'transparent', border: 'none', color: T.accent,
              fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}>{expanded ? '▲ 閉じる' : '▼ もっと見る'}</button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {canReply && (
            <button onClick={() => onOpenAIReply?.(mail)} style={{
              padding: '5px 12px', borderRadius: 6,
              background: T.accent, color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}>✨ AI返信</button>
          )}
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${mail.threadId}`}
            target="_blank" rel="noreferrer"
            style={{
              padding: '4px 10px', borderRadius: 6,
              background: 'transparent', color: T.textMuted,
              border: `1px solid ${T.border}`,
              fontSize: 10, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >Gmail で開く ↗</a>
        </div>
      </div>
    </div>
  )
}

// ─── GmailAIModal: AI返信草稿 生成 + 下書き作成 or mailto フォールバック ─────
function GmailAIModal({ open, onClose, mail, owner, T }) {
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

  function openMailtoFallback() {
    const url = new URL('https://mail.google.com/mail/')
    url.searchParams.set('view', 'cm')
    url.searchParams.set('fs', '1')
    if (toEmail) url.searchParams.set('to', toEmail)
    url.searchParams.set('su', `Re: ${mail.subject || ''}`)
    url.searchParams.set('body', draft)
    window.open(url.toString(), '_blank')
  }

  async function createDraft() {
    setSubmitting(true); setToast('')
    try {
      const r = await fetch('/api/integrations/gmail/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          threadId: mail.threadId,
          messageIdHeader: mail.messageIdHeader,
          to: toEmail,
          subject: `Re: ${mail.subject || ''}`,
          body: draft,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        // 403 など → mailto フォールバック
        if (r.status === 403 || j.needsScope || j.needsReauth) {
          setToast(`${j.error || 'Gmail API で下書き作成できませんでした'} → 代わりに Gmail の新規作成画面を開きます`)
          setTimeout(() => openMailtoFallback(), 500)
          return
        }
        setError(j.error || `HTTP ${r.status}`)
        return
      }
      // 成功 → 下書きを Gmail で開く
      if (j.openUrl) window.open(j.openUrl, '_blank')
      setToast('下書きを作成しました')
      setTimeout(() => { setToast(''); onClose?.() }, 1000)
    } catch (e) {
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
          background: T.bgCard, borderRadius: 12,
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
          <div style={{ fontSize: 18 }}>✨</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>AI返信草稿</div>
            <div style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              To: {mail.from} | {mail.subject}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textMuted,
            fontSize: 20, cursor: 'pointer', padding: 4, fontFamily: 'inherit',
          }}>×</button>
        </div>

        {/* 本文 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
              ✨ AIが返信草稿を作成中...
            </div>
          ) : error ? (
            <div style={{
              padding: 12, background: T.dangerBg, border: `1px solid ${T.danger}40`,
              borderRadius: 8, fontSize: 12, color: T.danger,
            }}>⚠️ {error}</div>
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
            }}
          >📋 コピー</button>
          <button
            onClick={createDraft}
            disabled={loading || submitting || !draft}
            style={{
              padding: '8px 14px', borderRadius: 7,
              background: T.accent, color: '#fff', border: 'none',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              cursor: loading || submitting || !draft ? 'not-allowed' : 'pointer',
              opacity: loading || submitting || !draft ? 0.5 : 1,
            }}
          >{submitting ? '作成中...' : '📝 下書きを作成して Gmail で開く'}</button>
        </div>
      </div>
    </div>
  )
}

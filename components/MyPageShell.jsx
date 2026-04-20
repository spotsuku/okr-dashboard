'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import MyOKRPageNew from './MyOKRPage'
import MyTasksPage from './MyTasksPage'
import OwnerOKRView from './OwnerOKRView'

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

  const [viewingName, setViewingName] = useState(myName)
  useEffect(() => { if (myName && !viewingName) setViewingName(myName) }, [myName, viewingName])

  const [activeTab, setActiveTab] = useState('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

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
            { key: 'dashboard', icon: '📊', label: 'ダッシュボード' },
            { key: 'wbs',       icon: '📅', label: 'タスクWBS'     },
            { key: 'okr_edit',  icon: '🎯', label: 'OKR記入'       },
            { key: 'okr_view',  icon: '📈', label: 'OKR詳細'       },
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
            <MyOKRPageNew
              user={isViewingSelf ? user : { ...user, email: viewingMember?.email || user?.email }}
              levels={levels}
              members={members}
              themeKey={themeKey}
              fiscalYear={fiscalYear}
              onAIFeedback={onAIFeedback}
            />
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
        </div>
      </div>
    </div>
  )
}

// ─── ダッシュボードタブ（3カラム骨組み） ───────────────────────────────────
function DashboardTab({ T, viewingName, viewingMember, isViewingSelf, myName, workLog, onWorkLogChange }) {
  const content = parseLogContent(workLog?.content)
  const st = statusOf(workLog)

  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const greet = jst.getUTCHours() < 11 ? 'おはようございます' : jst.getUTCHours() < 18 ? 'こんにちは' : 'こんばんは'
  const dateStr = `${jst.getUTCMonth()+1}/${jst.getUTCDate()}(${['日','月','火','水','木','金','土'][jst.getUTCDay()]})`

  const [busy, setBusy] = useState(false)
  const [kptOpen, setKptOpen] = useState(false)

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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 挨拶バー + 始業ボタン */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '10px 16px', background: T.sectionBg, borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
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

        {isViewingSelf && (
          <div style={{ display: 'flex', gap: 8 }}>
            {st === 'none' && (
              <button
                onClick={handleStart}
                disabled={busy || !myName}
                style={{
                  background: T.success, color: '#fff', border: 'none', borderRadius: 8,
                  padding: '8px 16px', fontSize: 13, fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                  opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s',
                }}
              >☀️ 始業する</button>
            )}
            {st === 'on' && (
              <button
                onClick={() => setKptOpen(true)}
                disabled={busy}
                style={{
                  background: T.info, color: '#fff', border: 'none', borderRadius: 8,
                  padding: '8px 16px', fontSize: 13, fontWeight: 700,
                  cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                  opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s',
                }}
              >🌙 終業する</button>
            )}
            {st === 'off' && (
              <div style={{ fontSize: 11, color: T.textMuted, padding: '8px 12px' }}>お疲れさまでした</div>
            )}
          </div>
        )}
      </div>

      {/* 3カラム本体（各内部スクロール、画面全体はスクロールしない） */}
      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 10, padding: 10, minHeight: 0, overflow: 'hidden',
      }}>
        {/* 左カラム：今日やること / 今週やること */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <Section T={T} icon="⚡" title="今日やること" flex={1}>
            <Placeholder T={T} lines={[
              '□ Phase 2で ka_tasks.due_date から抽出',
              '□ 重要度・期限・完了トグル',
              '□ 新規タスク追加',
            ]} />
          </Section>
          <Section T={T} icon="📅" title="今週やること" flex={1}>
            <Placeholder T={T} lines={[
              '□ 月 〜 金 の曜日別表示',
              '□ ドラッグで曜日変更',
            ]} />
          </Section>
        </div>

        {/* 中カラム：リマインダー */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Section T={T} icon="🔔" title="リマインダー" flex={1}>
            <SubSection T={T} label="📧 メール">
              <Placeholder T={T} lines={['Phase 4: Gmail MCP連携', '3日以上未返信・重要度高を抽出']} />
            </SubSection>
            <SubSection T={T} label="📊 OKR・KA 記入漏れ">
              <Placeholder T={T} lines={['Phase 3: weekly_reports/kr_weekly_reviews の空欄検出']} />
            </SubSection>
            <SubSection T={T} label="📅 今日のカレンダー">
              <Placeholder T={T} lines={['Phase 3: Google Calendar MCP連携']} />
            </SubSection>
            <SubSection T={T} label="⚠️ タスク期限">
              <Placeholder T={T} lines={['Phase 3: ka_tasks.due_date が今日/明日']} />
            </SubSection>
          </Section>
        </div>

        {/* 右カラム：月テーマ + 成果 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <Section T={T} icon="🌟" title="今月のメインテーマ" flex={0}>
            <Placeholder T={T} lines={['Phase 6: coaching_logs.log_type=monthly_theme から読み込み']} />
          </Section>
          <Section T={T} icon="💪" title="今月の成長テーマ" flex={0}>
            <Placeholder T={T} lines={['Phase 6: 同上']} />
          </Section>
          <Section T={T} icon="🏆" title="今週の成果" flex={1}>
            <Placeholder T={T} lines={[
              'Phase 6: 完了タスク数 / KR進捗',
              '日付別の達成ログ',
            ]} />
          </Section>
        </div>
      </div>

      {kptOpen && (
        <KPTModal
          T={T}
          busy={busy}
          onCancel={() => setKptOpen(false)}
          onSave={handleEnd}
          startedAt={content.start_at}
        />
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

function Section({ T, icon, title, children, flex = 1 }) {
  return (
    <div style={{
      flex, display: 'flex', flexDirection: 'column', minHeight: 0,
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: `1px solid ${T.border}`,
        fontSize: 12, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 6,
        flexShrink: 0, background: T.sectionBg,
      }}>
        <span>{icon}</span><span>{title}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', minHeight: 0 }}>
        {children}
      </div>
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

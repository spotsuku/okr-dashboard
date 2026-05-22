'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useCurrentOrg } from '../lib/orgContext'

// スマホ判定
function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth < bp))
  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

// ─── Date utilities (JST) ─────────────────────────────────────────────────
function jstMonday(d = new Date()) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const day = jst.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + diff))
}
function addDays(d, n) {
  const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x
}
function jstYMD(d) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`
}
function jstLabel(d) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const dow = ['日', '月', '火', '水', '木', '金', '土'][jst.getUTCDay()]
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${dow})`
}
function jstHHMM(iso) {
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
}
function isoFromJST(ymd, hour, min = 0) {
  // ymd "YYYY-MM-DD" 形式 + JST h:m を ISO (Z) に変換
  const [y, mo, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, hour - 9, min)).toISOString()
}

// 週ビュー定数
const HOUR_FROM = 7
const HOUR_TO = 23
const SLOT_MIN = 30           // 30分1スロット
const SLOT_PX = 22            // 1スロットの高さ (px)
const HOURS_PER_DAY = HOUR_TO - HOUR_FROM
const SLOTS_PER_DAY = HOURS_PER_DAY * (60 / SLOT_MIN)
const TOTAL_HEIGHT = SLOTS_PER_DAY * SLOT_PX

// 業務時間 (空き判定用)
const BIZ_FROM = 9
const BIZ_TO = 22

// メンバー色 (最大8人くらい)
const PALETTE = [
  '#4d9fff', '#00d68f', '#ffd166', '#ff6b6b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

export default function CalendarTab({ T, myName, members, viewingName }) {
  const isMobile = useIsMobile()
  const { currentOrg } = useCurrentOrg()
  const orgPath = currentOrg?.slug ? `/${currentOrg.slug}` : ''
  // 週開始日 (JST月曜の UTC 00:00)
  const [weekStart, setWeekStart] = useState(() => jstMonday(new Date()))
  // モバイル: 日ビュー用のカレント日付 (UTC ベース、デフォ今日)
  const [mobileDay, setMobileDay] = useState(() => {
    const j = new Date(Date.now() + 9 * 3600 * 1000)
    return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()))
  })
  // 選択中メンバー名
  const [selected, setSelected] = useState(() => myName ? [myName] : [])
  useEffect(() => {
    if (myName && selected.length === 0) setSelected([myName])
  }, [myName, selected.length])

  const [data, setData] = useState({ members: [] })  // multi-events response
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 表示ビュー (日/週) 手動切替。初期値は画面幅で決定 (モバイル=日 / PC=週)
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768) ? 'day' : 'week')
  const isDay = view === 'day'

  // 日ビュー=1日 / 週ビュー=月曜起点の7日
  const days = useMemo(
    () => isDay ? [mobileDay] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart, mobileDay, isDay]
  )
  const startISO = useMemo(() => isoFromJST(jstYMD(days[0]), HOUR_FROM), [days])
  const endISO = useMemo(() => isoFromJST(jstYMD(days[days.length - 1]), HOUR_TO), [days])

  // メンバー名 → 色
  const colorOf = useCallback((name) => {
    const idx = selected.indexOf(name)
    return idx < 0 ? '#888' : PALETTE[idx % PALETTE.length]
  }, [selected])

  // メンバー名 → email
  const emailOf = useCallback((name) => {
    return members?.find(m => m.name === name)?.email || ''
  }, [members])

  // フェッチ
  const fetchEvents = useCallback(async () => {
    if (selected.length === 0) { setData({ members: [] }); return }
    setLoading(true); setError('')
    try {
      const u = new URL('/api/integrations/calendar/multi-events', window.location.origin)
      u.searchParams.set('members', selected.join(','))
      u.searchParams.set('start', startISO)
      u.searchParams.set('end', endISO)
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setData(j)
    } catch (e) {
      setError(e.message || 'fetch error')
    } finally {
      setLoading(false)
    }
  }, [selected, startISO, endISO])
  useEffect(() => { fetchEvents() }, [fetchEvents])

  // 全員空きスロット (15分粒度、業務時間内のみ)
  const freeSlots = useMemo(() => computeFreeSlots(data, days, selected), [data, days, selected])

  // 連携状態 (名前 → connected/expired/email)
  const statusByName = useMemo(() => {
    const m = {}
    for (const r of data.members || []) {
      m[r.name] = { connected: r.connected, expired: !!r.expired, email: r.email, error: r.error }
    }
    return m
  }, [data])

  // ─── 予定作成/更新/削除の確認モーダル (複数提案をまとめて承認) ───
  const [pendingProposals, setPendingProposals] = useState(null)  // [{ type, plan }, ...] or null
  // 空き枠タップ → 予定作成フォーム { ymd, startMin, endMin }
  const [createSlot, setCreateSlot] = useState(null)

  // AI からの提案を承認 → 実行
  const executeProposal = useCallback(async (type, plan) => {
    const url = '/api/integrations/calendar/event'
    let body, method
    if (type === 'create') {
      method = 'POST'
      body = {
        owner: viewingName || myName,
        summary: plan.summary,
        description: plan.description || '',
        start_iso: plan.start_iso,
        end_iso: plan.end_iso,
        attendee_emails: plan.attendee_emails || [],
        add_meet: !!plan.add_meet,
        recurrence: plan.recurrence || [],
      }
    } else if (type === 'update') {
      method = 'PATCH'
      body = {
        owner: viewingName || myName,
        event_id: plan.event_id,
        updates: {
          summary: plan.summary,
          description: plan.description,
          start_iso: plan.start_iso,
          end_iso: plan.end_iso,
          attendee_emails: plan.attendee_emails,
          recurrence: plan.recurrence,
        },
      }
    } else if (type === 'delete') {
      method = 'DELETE'
      body = { owner: viewingName || myName, event_id: plan.event_id }
    } else {
      throw new Error(`unknown proposal type: ${type}`)
    }
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    return j
  }, [viewingName, myName])

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
      {/* ─── 左: 週ビュー本体 ─── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: T.bg }}>
        <CalendarHeader
          T={T}
          weekStart={weekStart}
          mobileDay={mobileDay}
          isDay={isDay}
          view={view}
          onToggleView={setView}
          onPrev={() => isDay ? setMobileDay(addDays(mobileDay, -1)) : setWeekStart(addDays(weekStart, -7))}
          onNext={() => isDay ? setMobileDay(addDays(mobileDay, 1)) : setWeekStart(addDays(weekStart, 7))}
          onToday={() => {
            if (isDay) {
              const j = new Date(Date.now() + 9 * 3600 * 1000)
              setMobileDay(new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate())))
            } else {
              setWeekStart(jstMonday(new Date()))
            }
          }}
          loading={loading}
          onReload={fetchEvents}
        />
        <MemberChips
          T={T}
          members={members}
          selected={selected}
          setSelected={setSelected}
          myName={myName}
          colorOf={colorOf}
          statusByName={statusByName}
        />
        {error && (
          <div style={{ padding: 8, fontSize: 11, color: T.danger, background: T.dangerBg }}>
            ⚠️ {error}
          </div>
        )}
        <WeekGrid
          T={T}
          days={days}
          dataMembers={data.members || []}
          selected={selected}
          colorOf={colorOf}
          emailOf={emailOf}
          freeSlots={freeSlots}
          onSlotClick={(ymd, startMin) => setCreateSlot({ ymd, startMin, endMin: Math.min(startMin + 60, HOUR_TO * 60) })}
        />
      </div>

      {/* ─── 右: AIチャット常駐 (モバイルはボトムシート) ─── */}
      <AIPanel
        T={T}
        myName={myName}
        viewingName={viewingName}
        members={members}
        selected={selected}
        weekStart={weekStart}
        onProposal={(proposals) => setPendingProposals(proposals)}
        isMobile={isMobile}
      />

      {/* 確認ダイアログ */}
      {pendingProposals && pendingProposals.length > 0 && (
        <ProposalDialog
          T={T}
          proposals={pendingProposals}
          onClose={() => setPendingProposals(null)}
          onConfirm={async () => {
            try {
              // 提案を順次実行 (途中で失敗したらそこで止めて残りはユーザに残す)
              const remaining = [...pendingProposals]
              while (remaining.length > 0) {
                const p = remaining[0]
                await executeProposal(p.type, p.plan)
                remaining.shift()
              }
              setPendingProposals(null)
              await fetchEvents()
            } catch (e) {
              const msg = e.message || 'エラー'
              if (/403|Insufficient|insufficient auth/i.test(msg)) {
                if (window.confirm(
                  'Google の書き込み権限が不足しています。\n\n予定作成には「Calendar 予定の作成・編集」スコープが必要です。連携タブで再認証してください。\n\n今すぐ連携タブに移動しますか？'
                )) {
                  window.location.href = `${orgPath}?page=integrations`
                }
              } else {
                alert(`実行エラー: ${msg}`)
              }
            }
          }}
        />
      )}

      {/* 空き枠タップ → 予定作成フォーム (GCal風) */}
      {createSlot && (
        <CreateEventModal
          T={T}
          slot={createSlot}
          ownerName={viewingName || myName}
          members={members}
          emailOf={emailOf}
          orgPath={orgPath}
          onClose={() => setCreateSlot(null)}
          onCreated={async () => { setCreateSlot(null); await fetchEvents() }}
        />
      )}
    </div>
  )
}

// ─── 予定作成モーダル (空き枠タップで開く / Googleカレンダーへ作成) ────────
function CreateEventModal({ T, slot, ownerName, members, emailOf, orgPath, onClose, onCreated }) {
  const pad = (n) => String(n).padStart(2, '0')
  const minToTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(slot.ymd)
  const [startT, setStartT] = useState(minToTime(slot.startMin))
  const [endT, setEndT] = useState(minToTime(slot.endMin))
  const [attendees, setAttendees] = useState([]) // member names
  const [addMeet, setAddMeet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const candidates = (members || []).filter(m => m.name && m.name !== ownerName && m.email)

  const submit = async () => {
    if (!title.trim() || saving) return
    const [sh, sm] = startT.split(':').map(Number)
    const [eh, em] = endT.split(':').map(Number)
    const start_iso = isoFromJST(date, sh, sm)
    const end_iso = isoFromJST(date, eh, em)
    if (new Date(end_iso) <= new Date(start_iso)) { setErr('終了は開始より後にしてください'); return }
    setSaving(true); setErr('')
    try {
      const r = await fetch('/api/integrations/calendar/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: ownerName,
          summary: title.trim(),
          start_iso, end_iso,
          attendee_emails: attendees.map(emailOf).filter(Boolean),
          add_meet: addMeet,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        const msg = j.error || `HTTP ${r.status}`
        if (/403|Insufficient|insufficient auth/i.test(msg)) {
          if (window.confirm('Google の書き込み権限が不足しています。連携タブで再認証しますか？')) {
            window.location.href = `${orgPath}?page=integrations`
          }
          throw new Error('権限不足')
        }
        throw new Error(msg)
      }
      await onCreated()
    } catch (e) {
      setErr(e.message || '作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const field = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: `1px solid ${T.borderMid}`, background: T.bgCard, color: T.text, fontSize: 16, outline: 'none', fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 4 }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(420px, 100%)', maxHeight: '85vh', overflowY: 'auto',
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
        boxShadow: '0 24px 60px rgba(15,23,42,0.28)', padding: 18,
        fontFamily: 'inherit', color: T.text,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📅 予定を作成</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: T.textMuted, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>タイトル</div>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="予定のタイトル" style={field} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>日付</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={field} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={lbl}>開始</div>
            <input type="time" value={startT} onChange={e => setStartT(e.target.value)} step={1800} style={field} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={lbl}>終了</div>
            <input type="time" value={endT} onChange={e => setEndT(e.target.value)} step={1800} style={field} />
          </div>
        </div>

        {candidates.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={lbl}>参加者（任意）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {candidates.map(m => {
                const on = attendees.includes(m.name)
                return (
                  <button key={m.id} onClick={() => setAttendees(a => on ? a.filter(x => x !== m.name) : [...a, m.name])}
                    style={{
                      padding: '5px 10px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${on ? T.accent : T.borderMid}`,
                      background: on ? `${T.accent}1a` : 'transparent',
                      color: on ? T.accent : T.textSub, fontWeight: on ? 700 : 500,
                    }}>{on ? '✓ ' : ''}{m.name}</button>
                )
              })}
            </div>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={addMeet} onChange={e => setAddMeet(e.target.checked)} />
          Google Meet を追加
        </label>

        {err && <div style={{ fontSize: 12, color: T.danger, marginBottom: 10 }}>⚠️ {err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${T.borderMid}`, background: 'transparent', color: T.textSub, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={submit} disabled={!title.trim() || saving} style={{
            padding: '9px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
            background: title.trim() ? T.accent : T.borderMid, color: '#fff',
            cursor: title.trim() && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}>{saving ? '作成中…' : 'Googleカレンダーに作成'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── ヘッダ (前後/今週) ────────────────────────────────────────────────
function CalendarHeader({ T, weekStart, mobileDay, isDay, view, onToggleView, onPrev, onNext, onToday, loading, onReload }) {
  const end = addDays(weekStart, 6)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 18px', borderBottom: `1px solid ${T.border}`,
      background: 'rgba(255,255,255,0.65)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      flexShrink: 0, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'inline-flex', gap: 2, background: 'rgba(120,120,128,0.10)', padding: 3, borderRadius: 9 }}>
        <button onClick={onPrev} style={btnSm(T)}>← {isDay ? '前日' : '前週'}</button>
        <button onClick={onToday} style={btnSm(T, true)}>{isDay ? '今日' : '今週'}</button>
        <button onClick={onNext} style={btnSm(T)}>{isDay ? '翌日' : '翌週'} →</button>
      </div>
      {/* 日/週 切替トグル */}
      <div style={{ display: 'inline-flex', gap: 2, background: 'rgba(120,120,128,0.10)', padding: 3, borderRadius: 9 }}>
        <button onClick={() => onToggleView('day')} style={btnSm(T, view === 'day')}>日</button>
        <button onClick={() => onToggleView('week')} style={btnSm(T, view === 'week')}>週</button>
      </div>
      <div style={{ marginLeft: 6, fontSize: 14, fontWeight: 800, color: T.text, flex: isDay ? 1 : 'none', letterSpacing: '-0.01em' }}>
        {isDay ? jstLabel(mobileDay) : `${jstLabel(weekStart)} 〜 ${jstLabel(end)}`}
      </div>
      {!isDay && <div style={{ flex: 1 }} />}
      <button onClick={onReload} disabled={loading} style={{
        padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
        background: 'rgba(120,120,128,0.12)', color: T.textSub,
        fontSize: 13, fontFamily: 'inherit',
      }}>{loading ? '…' : '🔄'}</button>
    </div>
  )
}

function btnSm(T, active = false) {
  return {
    padding: '6px 12px', borderRadius: 7,
    background: active ? T.bgCard : 'transparent',
    color: active ? T.text : T.textSub,
    border: 'none',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04)' : 'none',
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    transition: 'all 0.15s ease', whiteSpace: 'nowrap',
  }
}

// ─── メンバー チップ選択 ─────────────────────────────────────────────
function MemberChips({ T, members, selected, setSelected, myName, colorOf, statusByName }) {
  const sorted = useMemo(() => {
    const arr = [...(members || [])]
    arr.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    return arr
  }, [members])
  const toggle = (name) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6,
      padding: '8px 16px', borderBottom: `1px solid ${T.border}`,
      background: T.bgCard, flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, color: T.textMuted, alignSelf: 'center', marginRight: 4 }}>
        メンバー:
      </span>
      {sorted.map(m => {
        const on = selected.includes(m.name)
        const st = statusByName[m.name]
        const isUnconnected = on && st && !st.connected
        const c = on ? colorOf(m.name) : T.textMuted
        return (
          <button
            key={m.id}
            onClick={() => toggle(m.name)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 99,
              background: on ? `${c}22` : 'transparent',
              border: `1px solid ${on ? c : T.border}`,
              color: on ? c : T.textSub,
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer',
            }}
            title={isUnconnected ? '未連携' : (m.name === myName ? '自分' : '')}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: on ? c : 'transparent',
              border: `1px solid ${c}`,
            }} />
            {m.name}
            {isUnconnected && <span style={{ color: T.warn, marginLeft: 2 }}>⚠</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─── 週グリッド (時間 × 日) ───────────────────────────────────────────
function WeekGrid({ T, days, dataMembers, selected, colorOf, emailOf, freeSlots, onSlotClick }) {
  const TIME_COL = 56
  // 0:00 JST 起点での当日経過分 → top px
  const minToPx = (mins) => ((mins - HOUR_FROM * 60) / SLOT_MIN) * SLOT_PX
  // 現在時刻ライン
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  const todayYMD = jstYMD(now)

  return (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      <div style={{ display: 'flex', minWidth: days.length === 1 ? 'auto' : 720 }}>
        {/* 時間軸列 */}
        <div style={{
          width: TIME_COL, flexShrink: 0,
          borderRight: `1px solid ${T.border}`, background: T.bgCard,
          position: 'sticky', left: 0, zIndex: 2,
        }}>
          {/* 日付ヘッダと同じ rendered height (38 + padding 12 + border 1 = 51px) にしてラベルと時間境界線を揃える */}
          <div style={{ height: 38, padding: '6px 0', borderBottom: `1px solid ${T.border}` }} />
          <div style={{ position: 'relative', height: TOTAL_HEIGHT }}>
            {Array.from({ length: HOURS_PER_DAY + 1 }, (_, i) => {
              const h = HOUR_FROM + i
              return (
                <div key={h} style={{
                  position: 'absolute', top: i * 60 / SLOT_MIN * SLOT_PX - 6,
                  right: 6, fontSize: 10, color: T.textMuted, fontFamily: 'monospace',
                }}>{String(h).padStart(2, '0')}:00</div>
              )
            })}
          </div>
        </div>

        {/* 日列 */}
        {days.map((d, di) => {
          const ymd = jstYMD(d)
          const isToday = ymd === todayYMD
          // この日に重なるイベントを集める
          const dayEvents = []
          for (const memberRow of dataMembers) {
            if (!selected.includes(memberRow.name)) continue
            for (const ev of memberRow.events || []) {
              if (!ev.start || !ev.end || ev.allDay) continue
              const s = new Date(ev.start)
              const e = new Date(ev.end)
              const sJ = new Date(s.getTime() + 9 * 3600 * 1000)
              const eJ = new Date(e.getTime() + 9 * 3600 * 1000)
              const sYMD = `${sJ.getUTCFullYear()}-${String(sJ.getUTCMonth() + 1).padStart(2, '0')}-${String(sJ.getUTCDate()).padStart(2, '0')}`
              const eYMD = `${eJ.getUTCFullYear()}-${String(eJ.getUTCMonth() + 1).padStart(2, '0')}-${String(eJ.getUTCDate()).padStart(2, '0')}`
              if (ymd < sYMD || ymd > eYMD) continue
              // この日における開始/終了分
              const dayStart = isoFromJST(ymd, 0, 0)
              const dayEnd = isoFromJST(ymd, 24, 0)
              const segS = Math.max(s.getTime(), new Date(dayStart).getTime())
              const segE = Math.min(e.getTime(), new Date(dayEnd).getTime())
              const segSJ = new Date(segS + 9 * 3600 * 1000)
              const segEJ = new Date(segE + 9 * 3600 * 1000)
              const startMin = segSJ.getUTCHours() * 60 + segSJ.getUTCMinutes()
              const endMin = segEJ.getUTCHours() * 60 + segEJ.getUTCMinutes()
              dayEvents.push({
                id: `${memberRow.name}-${ev.id}-${ymd}`,
                title: ev.title,
                memberName: memberRow.name,
                color: colorOf(memberRow.name),
                startMin, endMin,
                hangoutLink: ev.hangoutLink,
                htmlLink: ev.htmlLink,
              })
            }
          }
          // 当日の空きスロット
          const dayFree = (freeSlots[ymd] || [])

          // 現在時刻ライン (JST)
          let nowTopPx = null
          if (isToday) {
            const jst = new Date(now.getTime() + 9 * 3600 * 1000)
            const m = jst.getUTCHours() * 60 + jst.getUTCMinutes()
            if (m >= HOUR_FROM * 60 && m <= HOUR_TO * 60) {
              nowTopPx = minToPx(m)
            }
          }
          return (
            <div key={ymd} style={{
              flex: 1, minWidth: 100,
              borderRight: `1px solid ${T.border}`,
              display: 'flex', flexDirection: 'column',
            }}>
              {/* 日ヘッダ */}
              <div style={{
                height: 38, padding: '6px 8px',
                borderBottom: `1px solid ${T.border}`,
                background: isToday ? T.accentBg : T.bgCard,
                color: isToday ? T.accent : T.text,
                fontSize: 12, fontWeight: 700,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                {jstLabel(d)}
              </div>
              {/* 時間グリッド本体 (空き枠タップで予定作成) */}
              <div
                onClick={(e) => {
                  // 既存イベント等の子要素クリックは無視、背景の素クリックのみ作成
                  if (e.target !== e.currentTarget || !onSlotClick) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const offsetY = e.clientY - rect.top
                  const absMin = HOUR_FROM * 60 + (offsetY / SLOT_PX) * SLOT_MIN
                  let snapped = Math.floor(absMin / SLOT_MIN) * SLOT_MIN
                  snapped = Math.max(HOUR_FROM * 60, Math.min(snapped, HOUR_TO * 60 - SLOT_MIN))
                  onSlotClick(ymd, snapped)
                }}
                style={{
                  position: 'relative', height: TOTAL_HEIGHT,
                  background: T.bg, cursor: 'pointer',
                }}>
                {/* 時間境界線 (イベントの top と同じ y 座標で完全一致させる) */}
                {Array.from({ length: HOURS_PER_DAY }, (_, i) => {
                  const h = HOUR_FROM + 1 + i
                  return (
                    <div key={`hr-${h}`} style={{
                      position: 'absolute', left: 0, right: 0,
                      top: minToPx(h * 60),
                      height: 1, background: T.border, pointerEvents: 'none',
                    }} />
                  )
                })}
                {/* 業務時間外を薄くシェード */}
                <div style={{
                  position: 'absolute', left: 0, right: 0,
                  top: 0, height: minToPx(BIZ_FROM * 60),
                  background: 'rgba(0,0,0,0.15)', pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute', left: 0, right: 0,
                  top: minToPx(BIZ_TO * 60), height: TOTAL_HEIGHT - minToPx(BIZ_TO * 60),
                  background: 'rgba(0,0,0,0.15)', pointerEvents: 'none',
                }} />

                {/* 空きスロット (緑バー) */}
                {dayFree.map((s, i) => {
                  const top = minToPx(s.startMin)
                  const h = Math.max(2, ((s.endMin - s.startMin) / SLOT_MIN) * SLOT_PX)
                  return (
                    <div key={`free-${i}`} style={{
                      position: 'absolute', left: 2, right: 2,
                      top, height: h,
                      background: 'rgba(0,214,143,0.18)',
                      borderLeft: `2px solid #00d68f`,
                      borderRadius: 4, pointerEvents: 'none',
                    }} title={`全員空き: ${formatMin(s.startMin)}–${formatMin(s.endMin)}`} />
                  )
                })}

                {/* イベント (重ね合わせは横に並べてレーン化) */}
                {(() => {
                  // ── レーン計算: 開始順にソートして、衝突しないレーンを順番に割り当て
                  const sorted = [...dayEvents].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
                  const columns = []
                  for (const ev of sorted) {
                    let placed = false
                    for (let i = 0; i < columns.length; i++) {
                      const last = columns[i][columns[i].length - 1]
                      if (last.endMin <= ev.startMin) {
                        columns[i].push(ev); ev._col = i; placed = true; break
                      }
                    }
                    if (!placed) { columns.push([ev]); ev._col = columns.length - 1 }
                  }
                  // 重なるイベントが使うレーン総数を各 ev に
                  for (const ev of sorted) {
                    let maxCols = ev._col + 1
                    for (const ev2 of sorted) {
                      if (ev === ev2) continue
                      if (ev2.startMin < ev.endMin && ev2.endMin > ev.startMin) {
                        maxCols = Math.max(maxCols, ev2._col + 1)
                      }
                    }
                    ev._cols = maxCols
                  }
                  return sorted.map(ev => {
                    const top = minToPx(ev.startMin)
                    const h = Math.max(SLOT_PX - 3, ((ev.endMin - ev.startMin) / SLOT_MIN) * SLOT_PX - 2)
                    const widthPct = 100 / ev._cols
                    const leftPct = ev._col * widthPct
                    const isNarrow = ev._cols > 1
                    return (
                      <CalendarEvent key={ev.id} ev={ev} T={T} top={top} h={h}
                        leftPct={leftPct} widthPct={widthPct} isNarrow={isNarrow}
                        formatMin={formatMin} />
                    )
                  })
                })()}

                {/* 現在時刻ライン */}
                {nowTopPx != null && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: nowTopPx,
                    height: 2, background: '#ff6b6b', zIndex: 3, pointerEvents: 'none',
                  }} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      {/* 凡例 + 未連携リスト */}
      <UnconnectedFooter T={T} dataMembers={dataMembers} selected={selected} />
    </div>
  )
}

// ─── 1イベントを描画 (ホバーで詳細ポップアップ) ──────────────────────────
function CalendarEvent({ ev, T, top, h, leftPct, widthPct, isNarrow, formatMin }) {
  const [hover, setHover] = useState(false)
  // 細いとき (重なりレーン化された時) はタイトルを省略 / アイコンドットだけ
  const minimal = isNarrow && widthPct < 50
  return (
    <div
      style={{
        position: 'absolute',
        boxSizing: 'border-box',
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        top, height: h,
        background: hover ? `${ev.color}88` : `${ev.color}55`,
        borderLeft: `3px solid ${ev.color}`,
        borderRadius: 5, padding: minimal ? '2px 3px' : '3px 5px',
        fontSize: 10, color: T.text,
        overflow: 'hidden', cursor: 'pointer',
        boxShadow: hover ? `0 4px 12px ${ev.color}55, 0 0 0 1px ${ev.color}80` : 'none',
        zIndex: hover ? 5 : 1,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => ev.htmlLink && window.open(ev.htmlLink, '_blank')}
    >
      <div style={{
        fontWeight: 700, lineHeight: 1.2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {ev.title || '(無題)'}
      </div>
      {!minimal && (
        <div style={{ color: T.textMuted, fontSize: 9, lineHeight: 1.2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ev.memberName}
        </div>
      )}
      {/* ホバー時の詳細ポップアップ */}
      {hover && (
        <div style={{
          position: 'absolute', top: '100%', left: 0,
          marginTop: 4, padding: '10px 12px',
          background: 'rgba(28,28,30,0.95)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          color: '#fff', borderRadius: 10,
          fontSize: 11, lineHeight: 1.5, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.30), 0 12px 32px rgba(0,0,0,0.20)',
          zIndex: 100, minWidth: 200, maxWidth: 320,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 12,
            whiteSpace: 'normal', wordBreak: 'break-word' }}>{ev.title || '(無題)'}</div>
          <div style={{ opacity: 0.85, marginBottom: 2 }}>
            👤 <strong>{ev.memberName}</strong>
          </div>
          <div style={{ opacity: 0.85 }}>
            🕐 {formatMin(ev.startMin)}–{formatMin(ev.endMin)}
          </div>
          {ev.hangoutLink && (
            <div style={{ marginTop: 6, fontSize: 10, opacity: 0.7 }}>📹 Meet あり</div>
          )}
        </div>
      )}
    </div>
  )
}

function formatMin(min) {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ─── 全員空きスロット計算 (日別、業務時間 9-22 内、SLOT_MIN 単位) ────────
function computeFreeSlots(data, days, selected) {
  const result = {}
  if (!selected || selected.length === 0) return result
  // 連携済みメンバーだけで判定 (未連携は判定対象外)
  const connectedRows = (data.members || []).filter(r => selected.includes(r.name) && r.connected && !r.expired)
  if (connectedRows.length === 0) return result
  for (const d of days) {
    const ymd = jstYMD(d)
    const slotsCount = (BIZ_TO - BIZ_FROM) * (60 / SLOT_MIN)
    const busy = new Array(slotsCount).fill(false)
    const dayStartTs = new Date(isoFromJST(ymd, BIZ_FROM, 0)).getTime()
    for (const row of connectedRows) {
      for (const ev of row.events || []) {
        if (!ev.start || !ev.end || ev.allDay) continue
        const s = new Date(ev.start).getTime()
        const e = new Date(ev.end).getTime()
        const dayEndTs = new Date(isoFromJST(ymd, BIZ_TO, 0)).getTime()
        const segS = Math.max(s, dayStartTs)
        const segE = Math.min(e, dayEndTs)
        if (segE <= segS) continue
        const startSlot = Math.floor((segS - dayStartTs) / (SLOT_MIN * 60 * 1000))
        const endSlot = Math.ceil((segE - dayStartTs) / (SLOT_MIN * 60 * 1000))
        for (let i = Math.max(0, startSlot); i < Math.min(slotsCount, endSlot); i++) {
          busy[i] = true
        }
      }
    }
    // 連続 free 区間を抽出 (最低1スロット = 30分)
    const free = []
    let i = 0
    while (i < slotsCount) {
      if (!busy[i]) {
        let j = i
        while (j < slotsCount && !busy[j]) j++
        free.push({
          startMin: BIZ_FROM * 60 + i * SLOT_MIN,
          endMin:   BIZ_FROM * 60 + j * SLOT_MIN,
        })
        i = j
      } else {
        i++
      }
    }
    result[ymd] = free
  }
  return result
}

// ─── 未連携メンバーのフッター (連携依頼 mailto) ────────────────────────
function UnconnectedFooter({ T, dataMembers, selected }) {
  const { currentOrg } = useCurrentOrg()
  const orgPath = currentOrg?.slug ? `/${currentOrg.slug}` : ''
  const unconnected = (dataMembers || []).filter(r => selected.includes(r.name) && !r.connected)
  if (unconnected.length === 0) return null
  return (
    <div style={{
      padding: '10px 16px', borderTop: `1px solid ${T.border}`,
      background: T.sectionBg, fontSize: 11, color: T.textMuted,
    }}>
      <div style={{ marginBottom: 4, fontWeight: 700, color: T.warn }}>
        ⚠️ 以下のメンバーは Google 未連携のためカレンダーが取得できません:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {unconnected.map(r => {
          const subject = encodeURIComponent('OKR Dashboard カレンダー連携のお願い')
          const link = typeof window !== 'undefined'
            ? `${window.location.origin}${orgPath}?page=integrations`
            : `${orgPath}?page=integrations`
          const body = encodeURIComponent(
            `${r.name} さん\n\nOKR Dashboard でカレンダーを共有したいので、以下のURLから Google 連携をお願いします。\n\n${link}\n\nよろしくお願いします。`
          )
          return (
            <a key={r.name}
               href={`mailto:?subject=${subject}&body=${body}`}
               style={{
                 padding: '3px 10px', borderRadius: 6,
                 background: T.warnBg, color: T.warn,
                 textDecoration: 'none', fontWeight: 700,
               }}>
              ✉️ {r.name} に連携依頼を送る
            </a>
          )
        })}
      </div>
    </div>
  )
}

// ─── AI チャットパネル (右側常駐) ──────────────────────────────────────
const AI_HISTORY_STORAGE_KEY = 'okr-calendar-ai-history-v1'

function AIPanel({ T, myName, viewingName, members, selected, weekStart, onProposal, isMobile = false }) {
  // [{role, content (string), actions?: [{tool}]}]
  // localStorage に永続化 (クリアボタン押下まで保持。リロード/ページ移動で消えないように)
  const [history, setHistory] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(AI_HISTORY_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  })
  // history 変更を localStorage へ反映 (action result 本体は重いので tool 名のみ保存)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const compact = history.map(h => ({
        role: h.role,
        content: h.content,
        actions: (h.actions || []).map(a => ({ tool: a.tool })),
      }))
      localStorage.setItem(AI_HISTORY_STORAGE_KEY, JSON.stringify(compact))
    } catch {}
  }, [history])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [collapsed, setCollapsed] = useState(isMobile)  // モバイルは初期閉
  const scrollRef = useRef(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history, busy])

  const owner = viewingName || myName
  const [lastUserMsg, setLastUserMsg] = useState('')

  const clearHistory = () => {
    setHistory([])
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(AI_HISTORY_STORAGE_KEY) } catch {}
    }
  }

  const send = async (overrideMsg) => {
    const msg = (overrideMsg ?? input).trim()
    if (!msg || busy) return
    // 再送でない場合のみ入力欄クリア & 履歴に追加
    const isRetry = overrideMsg != null
    if (!isRetry) setInput('')
    setErr('')
    setLastUserMsg(msg)
    if (!isRetry) setHistory(prev => [...prev, { role: 'user', content: msg }])
    setBusy(true)
    try {
      const ctxMembers = (members || []).map(m => ({ name: m.name, email: m.email }))
      const r = await fetch('/api/integrations/calendar/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          message: msg,
          context: {
            members: ctxMembers,
            today_iso: new Date().toISOString(),
            timezone: 'Asia/Tokyo',
            week_start_iso: weekStart.toISOString(),
            selected_members: selected,
          },
          history: history.map(h => ({ role: h.role, content: h.content })),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)

      // 提案 (mutate) を全て収集して 1 つのダイアログにまとめる
      const proposalActions = (j.actions || []).filter(a =>
        a.result?.proposal && ['create', 'update', 'delete'].includes(a.result.proposal)
      )
      setHistory(prev => [...prev, {
        role: 'assistant',
        content: j.text || '(返答なし)',
        actions: j.actions || [],
      }])
      if (proposalActions.length > 0) {
        onProposal(proposalActions.map(a => ({ type: a.result.proposal, plan: a.result.plan })))
      }
    } catch (e) {
      setErr(e.message || 'AI エラー')
    } finally {
      setBusy(false)
    }
  }

  if (collapsed) {
    // スマホ: 右下に丸い FAB ボタン
    if (isMobile) {
      return (
        <button
          onClick={() => setCollapsed(false)} title="AI を開く"
          style={{
            position: 'fixed', right: 16, bottom: 76, zIndex: 25,
            width: 52, height: 52, borderRadius: '50%',
            background: T.accent, color: '#fff', border: 'none',
            boxShadow: '0 6px 18px rgba(77,159,255,0.4)',
            fontSize: 22, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >🤖</button>
      )
    }
    return (
      <div style={{
        width: 36, borderLeft: `1px solid ${T.border}`, background: T.bgCard,
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0',
      }}>
        <button onClick={() => setCollapsed(false)} title="AI を開く" style={{
          background: 'transparent', border: 'none', color: T.accent,
          fontSize: 18, cursor: 'pointer', padding: 4,
        }}>🤖</button>
      </div>
    )
  }

  return (
    <div style={isMobile ? {
      // モバイル: フルスクリーンシート
      position: 'fixed', inset: 0, zIndex: 40,
      background: T.bgCard, display: 'flex', flexDirection: 'column',
      paddingBottom: 60,  // 下メニュー分
    } : {
      width: 340, flexShrink: 0,
      borderLeft: `1px solid ${T.border}`, background: T.bgCard,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <span style={{ fontSize: 14 }}>🤖</span>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1 }}>
          カレンダー AI
        </div>
        <button onClick={clearHistory} disabled={busy} style={btnSm(T)}>クリア</button>
        <button onClick={() => setCollapsed(true)} style={btnSm(T)}>»</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {history.length === 0 && (
          <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.7, padding: 8 }}>
            例:
            <ul style={{ paddingLeft: 16, margin: '6px 0' }}>
              <li>「来週の月曜午後、三木さんと1時間会議入れて」</li>
              <li>「今週、選択メンバー全員が空いてる時間は？」</li>
              <li>「毎週金曜10時から定例MTG (5回)」</li>
            </ul>
          </div>
        )}
        {history.map((h, i) => (
          <div key={i} style={{
            marginBottom: 10, padding: '8px 10px', borderRadius: 8,
            background: h.role === 'user' ? T.accentBg : T.sectionBg,
            border: `1px solid ${h.role === 'user' ? T.accent + '40' : T.border}`,
            fontSize: 12, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.5,
          }}>
            <div style={{
              fontSize: 10, color: T.textMuted, marginBottom: 4, fontWeight: 700,
            }}>{h.role === 'user' ? '🙂 あなた' : '🤖 AI'}</div>
            {h.content}
            {h.actions && h.actions.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, color: T.textMuted }}>
                ツール: {h.actions.map(a => a.tool).join(' → ')}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ padding: 8, fontSize: 11, color: T.textMuted }}>考え中…</div>
        )}
        {err && (
          <div style={{
            padding: 10, fontSize: 11, color: T.danger,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: 6, marginTop: 4, lineHeight: 1.5,
          }}>
            <div style={{ marginBottom: 6 }}>⚠️ {err}</div>
            {lastUserMsg && (
              <button onClick={() => send(lastUserMsg)} disabled={busy} style={{
                padding: '4px 12px', borderRadius: 6,
                background: T.accent, color: '#fff', border: 'none',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>🔄 再試行</button>
            )}
          </div>
        )}
      </div>
      <div style={{
        padding: 10, borderTop: `1px solid ${T.border}`,
        display: 'flex', gap: 6, flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
          }}
          placeholder="自然文で指示 (Ctrl+Enter送信)"
          rows={2}
          disabled={busy}
          style={{
            flex: 1, background: T.bg, color: T.text,
            border: `1px solid ${T.border}`, borderRadius: 6,
            padding: '6px 8px', fontSize: 12, fontFamily: 'inherit',
            resize: 'vertical', outline: 'none',
          }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{
          padding: '0 14px', borderRadius: 6,
          background: busy ? T.border : T.accent, color: '#fff',
          border: 'none', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          cursor: busy ? 'not-allowed' : 'pointer',
        }}>送信</button>
      </div>
    </div>
  )
}

// ─── 確認ダイアログ (作成/更新/削除、複数提案を一括承認可) ──────────────
function ProposalDialog({ T, proposals, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const handle = async () => {
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }
  const n = proposals.length
  const hasDelete = proposals.some(p => p.type === 'delete')
  const allSameType = proposals.every(p => p.type === proposals[0].type)
  const verb = !allSameType ? '変更' : proposals[0].type === 'create' ? '作成'
             : proposals[0].type === 'update' ? '更新' : '削除'
  const title = n === 1 ? `予定の${verb}を承認しますか？` : `${n} 件の予定の${verb}を承認しますか？`
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: T.bgCard, borderRadius: 12, width: 'min(560px, 92vw)',
        border: `1px solid ${T.border}`, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${T.border}`,
          fontSize: 14, fontWeight: 700, color: T.text,
        }}>{title}</div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: 12, color: T.text, lineHeight: 1.7 }}>
          {proposals.map((p, idx) => (
            <ProposalBody key={idx} T={T} proposal={p} index={idx} total={n} />
          ))}
        </div>
        <div style={{
          padding: 12, borderTop: `1px solid ${T.border}`,
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} disabled={busy} style={{
            padding: '8px 16px', borderRadius: 7,
            background: 'transparent', color: T.textSub, border: `1px solid ${T.border}`,
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}>キャンセル</button>
          <button onClick={handle} disabled={busy} style={{
            padding: '8px 18px', borderRadius: 7,
            background: hasDelete ? T.danger : T.accent,
            color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer',
          }}>{busy ? '実行中…' : (n === 1 ? '承認して実行' : `${n} 件まとめて承認`)}</button>
        </div>
      </div>
    </div>
  )
}

// 1 件分の提案の中身を描画 (複数提案時はインデックスヘッダ付き)
function ProposalBody({ T, proposal, index, total }) {
  const { type, plan } = proposal
  const recurrenceText = formatRecurrence(plan.recurrence, plan.start_iso)
  const isMulti = total > 1
  const verb = type === 'create' ? '作成' : type === 'update' ? '更新' : '削除'
  return (
    <div style={{
      marginBottom: isMulti && index < total - 1 ? 14 : 0,
      paddingBottom: isMulti && index < total - 1 ? 14 : 0,
      borderBottom: isMulti && index < total - 1 ? `1px dashed ${T.border}` : 'none',
    }}>
      {isMulti && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 6,
        }}>予定 {index + 1} / {total} ({verb})</div>
      )}
      {type === 'create' && (
        <>
          <Row T={T} k="件名" v={plan.summary} />
          <Row T={T} k="日時" v={`${jstHHMM(plan.start_iso)} – ${jstHHMM(plan.end_iso)} (${shortDate(plan.start_iso)})`} />
          {recurrenceText && <Row T={T} k="繰り返し" v={recurrenceText} />}
          <Row T={T} k="招待"
               v={(plan.attendee_names || []).length === 0 ? '(なし)' :
                  (plan.attendee_names || []).map(n =>
                    plan.unresolved_names?.includes(n) ? `${n} (⚠ メール未解決)` : n
                  ).join(', ')} />
          {plan.attendee_emails && plan.attendee_emails.length > 0 && (
            <div style={{ fontSize: 10, color: T.textMuted, marginLeft: 80 }}>
              → {plan.attendee_emails.join(', ')}
            </div>
          )}
          <Row T={T} k="Meet" v={plan.add_meet ? '✅ Google Meet リンクを発行' : '—'} />
          {plan.description && <Row T={T} k="説明" v={plan.description} />}
          {!isMulti && (
            <div style={{
              marginTop: 10, padding: 8, background: T.warnBg, color: T.warn,
              fontSize: 11, borderRadius: 6,
            }}>
              ⚠️ 承認すると招待メールが招待者に自動送信されます。件名は仮押さえとして「[仮]」が先頭に付きます。
            </div>
          )}
        </>
      )}
      {type === 'update' && (
        <>
          <Row T={T} k="event_id" v={plan.event_id} />
          {plan.summary && <Row T={T} k="件名" v={plan.summary} />}
          {(plan.start_iso || plan.end_iso) && (
            <Row T={T} k="日時" v={`${plan.start_iso ? jstHHMM(plan.start_iso) : '?'} – ${plan.end_iso ? jstHHMM(plan.end_iso) : '?'}`} />
          )}
          {recurrenceText && <Row T={T} k="繰り返し" v={recurrenceText} />}
          {plan.attendee_names && <Row T={T} k="招待" v={plan.attendee_names.join(', ')} />}
          {plan.description && <Row T={T} k="説明" v={plan.description} />}
        </>
      )}
      {type === 'delete' && (
        <Row T={T} k="event_id" v={plan.event_id} />
      )}
      {/* 複数提案時はまとめ警告を末尾に 1 回だけ表示 */}
      {isMulti && index === total - 1 && (
        <div style={{
          marginTop: 10, padding: 8,
          background: proposal.type === 'delete' ? T.dangerBg : T.warnBg,
          color: proposal.type === 'delete' ? T.danger : T.warn,
          fontSize: 11, borderRadius: 6,
        }}>
          ⚠️ 承認すると {total} 件すべてが順次実行され、招待メール/通知が自動送信されます。仮押さえ予定の件名先頭には「[仮]」が付きます。
        </div>
      )}
    </div>
  )
}

function Row({ T, k, v }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
      <div style={{ width: 70, color: T.textMuted, fontSize: 11, flexShrink: 0 }}>{k}</div>
      <div style={{ flex: 1, color: T.text, wordBreak: 'break-word' }}>{v}</div>
    </div>
  )
}

function shortDate(iso) {
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const dow = ['日', '月', '火', '水', '木', '金', '土'][jst.getUTCDay()]
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${dow})`
}

// RRULE を人間語に (代表的なパターンのみ)
function formatRecurrence(rrules, startIso) {
  if (!rrules || rrules.length === 0) return ''
  const rule = rrules[0].replace(/^RRULE:/, '')
  const params = Object.fromEntries(
    rule.split(';').map(p => {
      const [k, v] = p.split('=')
      return [k, v]
    })
  )
  const freq = params.FREQ
  const count = params.COUNT
  const until = params.UNTIL
  const byday = params.BYDAY  // MO,TU,WE,TH,FR,SA,SU (-1TH = 最終木曜)
  const dayMap = { MO: '月', TU: '火', WE: '水', TH: '木', FR: '金', SA: '土', SU: '日' }
  const startTime = startIso ? jstHHMM(startIso) : ''
  let txt = ''
  if (freq === 'DAILY') txt = `毎日 ${startTime}`
  else if (freq === 'WEEKLY') {
    const days = (byday || '').split(',').map(d => {
      const m = d.match(/^(-?\d+)?([A-Z]{2})$/)
      if (!m) return d
      const prefix = m[1] === '-1' ? '最終' : (m[1] || '')
      return `${prefix}${dayMap[m[2]] || m[2]}曜`
    }).join('・')
    txt = `毎週 ${days || ''} ${startTime}`.trim()
  }
  else if (freq === 'MONTHLY') {
    const days = (byday || '').split(',').map(d => {
      const m = d.match(/^(-?\d+)?([A-Z]{2})$/)
      if (!m) return d
      const prefix = m[1] === '-1' ? '最終' : (m[1] ? `第${m[1]}` : '')
      return `${prefix}${dayMap[m[2]] || m[2]}曜`
    }).join('・')
    txt = `毎月 ${days || ''} ${startTime}`.trim()
  }
  else txt = rule
  if (count) txt += ` × ${count}回`
  else if (until) txt += ` (〜${until.slice(0, 8)})`
  return txt
}

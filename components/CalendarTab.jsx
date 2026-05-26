'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useCurrentOrg } from '../lib/orgContext'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { inputStyle, btnPrimary, btnSecondary } from '../lib/iosStyles'

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
  const { currentOrg } = useCurrentOrg()
  const orgId = currentOrg?.id || null
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
    if (!orgId) return
    setLoading(true); setError('')
    try {
      const u = new URL('/api/integrations/calendar/multi-events', window.location.origin)
      u.searchParams.set('members', selected.join(','))
      u.searchParams.set('start', startISO)
      u.searchParams.set('end', endISO)
      u.searchParams.set('organization_id', orgId || '')
      const r = await fetch(u.toString())
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setData(j)
    } catch (e) {
      setError(e.message || 'fetch error')
    } finally {
      setLoading(false)
    }
  }, [selected, startISO, endISO, orgId])
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

  // 空き枠タップ → 予定作成フォーム { ymd, startMin, endMin }
  const [createSlot, setCreateSlot] = useState(null)

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
        <MemberSelect
          T={T}
          members={members}
          selected={selected}
          setSelected={setSelected}
          myName={myName}
          colorOf={colorOf}
          statusByName={statusByName}
        />
        {error && (
          <div style={{ padding: SPACING.sm, ...TYPO.footnote, color: T.danger, background: T.dangerBg, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
            <Icon name="alert" size={13} /> {error}
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

      {/* 空き枠タップ → 予定作成フォーム (GCal風) */}
      {createSlot && (
        <CreateEventModal
          T={T}
          slot={createSlot}
          ownerName={viewingName || myName}
          members={members}
          emailOf={emailOf}
          orgPath={orgPath}
          orgId={orgId}
          onClose={() => setCreateSlot(null)}
          onCreated={async () => { setCreateSlot(null); await fetchEvents() }}
        />
      )}
    </div>
  )
}

// ─── 予定作成モーダル (空き枠タップで開く / Googleカレンダーへ作成) ────────
function CreateEventModal({ T, slot, ownerName, members, emailOf, orgPath, orgId, onClose, onCreated }) {
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
          organization_id: orgId,
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

  const field = { ...inputStyle({ T }), padding: '9px 11px', borderRadius: RADIUS.sm, border: `1px solid ${T.borderMid}`, fontSize: 16 }
  const lbl = { ...TYPO.footnote, fontWeight: 700, color: T.textMuted, marginBottom: SPACING.xs }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(420px, 100%)', maxHeight: '85vh', overflowY: 'auto',
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.xl,
        boxShadow: SHADOWS.xl, padding: SPACING.lg + 2,
        fontFamily: 'inherit', color: T.text,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md + 2 }}>
          <div style={{ ...TYPO.title3, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="calendar" size={16} /> 予定を作成</div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: T.textMuted, cursor: 'pointer', display: 'flex' }}><Icon name="cross" size={18} /></button>
        </div>

        <div style={{ marginBottom: SPACING.md }}>
          <div style={lbl}>タイトル</div>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="予定のタイトル" style={field} />
        </div>
        <div style={{ marginBottom: SPACING.md }}>
          <div style={lbl}>日付</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={field} />
        </div>
        <div style={{ display: 'flex', gap: SPACING.sm + 2, marginBottom: SPACING.md }}>
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
          <div style={{ marginBottom: SPACING.md }}>
            <div style={lbl}>参加者（任意）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.xs + 2 }}>
              {candidates.map(m => {
                const on = attendees.includes(m.name)
                return (
                  <button key={m.id} onClick={() => setAttendees(a => on ? a.filter(x => x !== m.name) : [...a, m.name])}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                      padding: '5px 10px', borderRadius: RADIUS.pill, ...TYPO.subhead, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${on ? T.accent : T.borderMid}`,
                      background: on ? T.accentBg : 'transparent',
                      color: on ? T.accent : T.textSub, fontWeight: on ? 700 : 500,
                    }}>{on ? <Icon name="check" size={12} /> : null}{m.name}</button>
                )
              })}
            </div>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg, ...TYPO.body, cursor: 'pointer' }}>
          <input type="checkbox" checked={addMeet} onChange={e => setAddMeet(e.target.checked)} />
          Google Meet を追加
        </label>

        {err && <div style={{ ...TYPO.subhead, color: T.danger, marginBottom: SPACING.sm + 2, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="alert" size={13} /> {err}</div>}

        <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...btnSecondary({ T }), padding: '9px 16px' }}>キャンセル</button>
          <button onClick={submit} disabled={!title.trim() || saving} style={{
            ...btnPrimary({ T }), padding: '9px 18px',
            ...(title.trim() ? {} : { background: T.borderMid, boxShadow: 'none' }),
            cursor: title.trim() && !saving ? 'pointer' : 'not-allowed',
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
      display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
      padding: `${SPACING.md}px ${SPACING.lg + 2}px`, borderBottom: `1px solid ${T.border}`,
      background: T.sectionBg,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      flexShrink: 0, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'inline-flex', gap: 2, background: 'rgba(120,120,128,0.10)', padding: 3, borderRadius: RADIUS.sm + 1 }}>
        <button onClick={onPrev} style={btnSm(T)}>← {isDay ? '前日' : '前週'}</button>
        <button onClick={onToday} style={btnSm(T, true)}>{isDay ? '今日' : '今週'}</button>
        <button onClick={onNext} style={btnSm(T)}>{isDay ? '翌日' : '翌週'} →</button>
      </div>
      {/* 日/週 切替トグル */}
      <div style={{ display: 'inline-flex', gap: 2, background: 'rgba(120,120,128,0.10)', padding: 3, borderRadius: RADIUS.sm + 1 }}>
        <button onClick={() => onToggleView('day')} style={btnSm(T, view === 'day')}>日</button>
        <button onClick={() => onToggleView('week')} style={btnSm(T, view === 'week')}>週</button>
      </div>
      <div style={{ marginLeft: SPACING.xs + 2, ...TYPO.headline, fontWeight: 800, color: T.text, flex: isDay ? 1 : 'none', letterSpacing: '-0.01em' }}>
        {isDay ? jstLabel(mobileDay) : `${jstLabel(weekStart)} 〜 ${jstLabel(end)}`}
      </div>
      {!isDay && <div style={{ flex: 1 }} />}
      <button onClick={onReload} disabled={loading} style={{
        padding: '7px 12px', borderRadius: RADIUS.sm + 1, border: 'none', cursor: 'pointer',
        background: 'rgba(120,120,128,0.12)', color: T.textSub,
        display: 'flex', alignItems: 'center', fontFamily: 'inherit',
      }}>{loading ? '…' : <Icon name="refresh" size={15} />}</button>
    </div>
  )
}

function btnSm(T, active = false) {
  return {
    padding: '6px 12px', borderRadius: RADIUS.xs + 1,
    background: active ? T.bgCard : 'transparent',
    color: active ? T.text : T.textSub,
    border: 'none',
    boxShadow: active ? SHADOWS.sm : 'none',
    ...TYPO.subhead, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    transition: 'all 0.15s ease', whiteSpace: 'nowrap',
  }
}

// ─── メンバー選択 (ドロップダウン式: 多人数でも省スペース) ─────────────
function MemberSelect({ T, members, selected, setSelected, myName, colorOf, statusByName }) {
  const sorted = useMemo(() => {
    const arr = [...(members || [])]
    arr.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    return arr
  }, [members])

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (name) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }
  const selectAll = () => setSelected(sorted.map(m => m.name))
  const clearAll = () => setSelected([])
  const onlyMe = () => setSelected(myName ? [myName] : [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(m => (m.name || '').toLowerCase().includes(q))
  }, [sorted, query])

  // トリガーに出す選択中サマリ (色ドット最大5 + 余りを +N)
  const DOT_MAX = 5
  const selectedSorted = sorted.filter(m => selected.includes(m.name))

  return (
    <div ref={wrapRef} style={{
      position: 'relative',
      padding: `${SPACING.sm}px ${SPACING.lg}px`, borderBottom: `1px solid ${T.border}`,
      background: T.bgCard, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: SPACING.sm,
    }}>
      <span style={{ ...TYPO.footnote, color: T.textMuted, flexShrink: 0 }}>メンバー:</span>

      {/* トリガーボタン */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: SPACING.sm,
          padding: '5px 10px', borderRadius: RADIUS.sm,
          background: open ? T.accentBg : 'transparent',
          border: `1px solid ${open ? T.accent : T.border}`,
          color: T.text, ...TYPO.subhead, fontWeight: 700, fontFamily: 'inherit',
          cursor: 'pointer', maxWidth: '100%',
        }}
      >
        {/* 選択中の色ドット */}
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {selectedSorted.slice(0, DOT_MAX).map((m, i) => (
            <span key={m.id} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: colorOf(m.name),
              border: `1.5px solid ${T.bgCard}`,
              marginLeft: i === 0 ? 0 : -4,
            }} />
          ))}
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>
          {selected.length === 0 ? '選択してください'
            : selected.length === 1 ? selectedSorted[0]?.name || '1人'
            : `${selected.length}人を表示中`}
        </span>
        <span style={{ color: T.textMuted, display: 'flex' }}><Icon name={open ? 'chevronU' : 'chevronD'} size={12} /></span>
      </button>

      {/* ドロップダウンパネル */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: SPACING.lg, marginTop: SPACING.xs, zIndex: 30,
          width: 'min(300px, calc(100vw - 32px))',
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
          boxShadow: SHADOWS.lg,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* 検索 (人数が多いときのみ) */}
          {sorted.length > 6 && (
            <div style={{ padding: SPACING.sm, borderBottom: `1px solid ${T.border}` }}>
              <input
                autoFocus value={query} onChange={e => setQuery(e.target.value)}
                placeholder="名前で絞り込み"
                style={{
                  ...inputStyle({ T }), padding: '6px 9px',
                  borderRadius: RADIUS.xs + 1, background: T.bg, ...TYPO.subhead,
                }}
              />
            </div>
          )}

          {/* 一括操作 */}
          <div style={{ display: 'flex', gap: SPACING.xs + 2, padding: '8px 10px', borderBottom: `1px solid ${T.border}` }}>
            <button onClick={selectAll} style={miniBtn(T)}>全員</button>
            {myName && <button onClick={onlyMe} style={miniBtn(T)}>自分のみ</button>}
            <button onClick={clearAll} style={miniBtn(T)}>クリア</button>
          </div>

          {/* メンバー一覧 */}
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: SPACING.xs + 2 }}>
            {filtered.length === 0 && (
              <div style={{ padding: SPACING.md, ...TYPO.subhead, color: T.textMuted, textAlign: 'center' }}>
                該当なし
              </div>
            )}
            {filtered.map(m => {
              const on = selected.includes(m.name)
              const st = statusByName[m.name]
              const isUnconnected = on && st && !st.connected
              const c = on ? colorOf(m.name) : T.textMuted
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '7px 9px', borderRadius: RADIUS.sm, border: 'none',
                    background: on ? `${c}14` : 'transparent',
                    color: on ? T.text : T.textSub,
                    ...TYPO.subhead, fontWeight: on ? 700 : 500, fontFamily: 'inherit',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    background: on ? c : 'transparent',
                    border: `1.5px solid ${on ? c : T.border}`,
                  }} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name}
                    {m.name === myName && <span style={{ color: T.textMuted, fontWeight: 500 }}> (自分)</span>}
                  </span>
                  {isUnconnected && <span style={{ color: T.warn, display: 'flex' }} title="未連携"><Icon name="alert" size={12} /></span>}
                  {on && <span style={{ color: c, display: 'flex' }}><Icon name="check" size={13} /></span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function miniBtn(T) {
  return {
    flex: 1, padding: '5px 8px', borderRadius: RADIUS.xs + 1,
    background: 'transparent', border: `1px solid ${T.border}`,
    color: T.textSub, ...TYPO.footnote, fontWeight: 700, fontFamily: 'inherit',
    cursor: 'pointer', whiteSpace: 'nowrap',
  }
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

  // MyCOO オーブ(右下 固定パネル)が開いている間は、週ビューの列を左へ寄せて
  // 土日(右端)がオーブに隠れないようにする。
  const [orbOpen, setOrbOpen] = useState(false)
  useEffect(() => {
    const h = (e) => setOrbOpen(!!e?.detail?.open)
    window.addEventListener('mycoo:orb', h)
    return () => window.removeEventListener('mycoo:orb', h)
  }, [])
  const orbPad = orbOpen && days.length > 1 ? 410 : 0

  return (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      <div style={{ display: 'flex', minWidth: days.length === 1 ? 'auto' : 720, paddingRight: orbPad, transition: 'padding-right 0.2s ease' }}>
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
                  right: SPACING.xs + 2, fontSize: 10, color: T.textMuted, fontFamily: 'monospace',
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
              {/* 日ヘッダ (sticky)。イベント(zIndex 1〜5)・現在時刻線(3)より前面かつ
                 不透明にして、スクロール時に予定が透けて見づらくならないようにする。 */}
              <div style={{
                height: 38, padding: '6px 8px',
                borderBottom: `1px solid ${T.border}`,
                background: T.bgCard,
                boxShadow: isToday ? `inset 0 0 0 999px ${T.accentBg}` : 'none',
                color: isToday ? T.accent : T.text,
                ...TYPO.subhead, fontWeight: 700,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                position: 'sticky', top: 0, zIndex: 8,
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
                      background: T.successBg,
                      borderLeft: `2px solid ${T.success}`,
                      borderRadius: RADIUS.xs - 2, pointerEvents: 'none',
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
                    height: 2, background: T.danger, zIndex: 3, pointerEvents: 'none',
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
        borderRadius: RADIUS.xs - 1, padding: minimal ? '2px 3px' : '3px 5px',
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
          marginTop: SPACING.xs, padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
          background: 'rgba(28,28,30,0.95)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          color: '#fff', borderRadius: RADIUS.md,
          ...TYPO.footnote, fontWeight: 600, lineHeight: 1.5, whiteSpace: 'nowrap',
          boxShadow: SHADOWS.lg,
          zIndex: 100, minWidth: 200, maxWidth: 320,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 800, marginBottom: SPACING.xs, fontSize: 12,
            whiteSpace: 'normal', wordBreak: 'break-word' }}>{ev.title || '(無題)'}</div>
          <div style={{ opacity: 0.85, marginBottom: 2, display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
            <Icon name="user" size={12} /> <strong>{ev.memberName}</strong>
          </div>
          <div style={{ opacity: 0.85, display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
            <Icon name="clock" size={12} /> {formatMin(ev.startMin)}–{formatMin(ev.endMin)}
          </div>
          {ev.hangoutLink && (
            <div style={{ marginTop: SPACING.xs + 2, fontSize: 10, opacity: 0.7, display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}><Icon name="msg" size={11} /> Meet あり</div>
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
      padding: `${SPACING.sm + 2}px ${SPACING.lg}px`, borderTop: `1px solid ${T.border}`,
      background: T.sectionBg, ...TYPO.footnote, color: T.textMuted,
    }}>
      <div style={{ marginBottom: SPACING.xs, fontWeight: 700, color: T.warn, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
        <Icon name="alert" size={13} /> 以下のメンバーは Google 未連携のためカレンダーが取得できません:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.sm }}>
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
                 display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                 padding: '3px 10px', borderRadius: RADIUS.xs,
                 background: T.warnBg, color: T.warn,
                 textDecoration: 'none', fontWeight: 700,
               }}>
              <Icon name="mail" size={12} /> {r.name} に連携依頼を送る
            </a>
          )
        })}
      </div>
    </div>
  )
}

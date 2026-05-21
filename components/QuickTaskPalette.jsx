'use client'
// QuickTaskPalette — ⌘K / T で開く自然文タスク投函オーバーレイ
//
// design_handoff_mycoo_quicktask/README.md Part 2 を再現。
//   - ⌘K / Ctrl+K、または T (入力欄非フォーカス時) で起動
//   - 自然文から 日付 / @担当 / #目標 / 優先度 を解析
//   - 解釈プレビューを常時表示 (AI 誤解の事故防止)
//   - ↵ 追加して閉じる / ⇧↵ 追加して続ける / Esc 閉じる
//   - 作成成功で okr:task-created を発火 (MyCOO オーブが ✓ を出す)
//   - okr:open-quicktask イベント (detail.preset) で外部から起動 (MyCOO 連携)
//
// 注: ka_tasks に goal/priority 列が無いため、件名・担当・期日のみ永続化。
//     優先度/紐付けはプレビュー表示のみ (列追加なしの方針)。
import * as React from 'react'
import { supabase } from '../lib/supabase'

const TONE = {
  date:     { bg: 'rgba(59,130,246,.12)', fg: '#1d4ed8' },
  assignee: { bg: 'rgba(91,91,214,.12)',  fg: '#4338ca' },
  goal:     { bg: 'rgba(5,150,105,.12)',  fg: '#047857' },
  priority: { bg: 'rgba(217,119,6,.12)',  fg: '#d97706' },
}

const WD = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 }

// JST の本日 (UTC 真夜中で JST 日付を表現)
function jstToday() {
  const jst = new Date(Date.now() + 9 * 3600 * 1000)
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()))
}
function fmtDate(d) {
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d, n) { return new Date(d.getTime() + n * 86400000) }

// 自然文 → 構造化
function parseTask(text, members) {
  const matches = [] // { raw }
  let title = text

  // ── 日付 ──
  let date = null, dateLabel = ''
  const today = jstToday()
  const dayKw = [
    { re: /明々後日|明明後日/, n: 3 }, { re: /明後日/, n: 2 },
    { re: /明日/, n: 1 }, { re: /今日|本日/, n: 0 },
  ]
  for (const k of dayKw) {
    const m = text.match(k.re)
    if (m) { date = addDays(today, k.n); matches.push(m[0]); break }
  }
  if (!date) {
    const m = text.match(/(来週|今週)?\s*([日月火水木金土])曜?/)
    if (m && WD[m[2]] !== undefined) {
      const target = WD[m[2]]
      let diff = (target - today.getUTCDay() + 7) % 7
      if (m[1] === '来週') diff += 7
      else if (diff === 0 && m[1] !== '今週') diff = 7 // 単独「月曜」は次の該当日
      date = addDays(today, diff); matches.push(m[0])
    }
  }
  if (!date) {
    let m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
    if (!m) m = text.match(/(\d{1,2})[/／](\d{1,2})/)
    if (m) {
      const mm = Number(m[1]), dd = Number(m[2])
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        date = new Date(Date.UTC(today.getUTCFullYear(), mm - 1, dd)); matches.push(m[0])
      }
    }
  }
  // 時刻 (表示のみ)
  let timeLabel = ''
  const tm = text.match(/(\d{1,2})\s*時(\s*(\d{1,2})\s*分)?/)
  if (tm) { timeLabel = `${tm[1]}:${tm[3] ? String(tm[3]).padStart(2, '0') : '00'}`; matches.push(tm[0]) }
  if (date) dateLabel = `${date.getUTCMonth() + 1}/${date.getUTCDate()}${timeLabel ? ` ${timeLabel}` : ''}`

  // ── 担当 (@名前) ──
  let assignee = ''
  const am = text.match(/@\s*([^\s#!@]+)/)
  if (am) {
    const cand = am[1]
    const hit = (members || []).find(mm => mm.name && (mm.name === cand || cand.startsWith(mm.name) || mm.name.startsWith(cand)))
    assignee = hit ? hit.name : cand
    matches.push(am[0])
  }

  // ── 目標 (#xxx) 表示のみ ──
  let goal = ''
  const gm = text.match(/#\s*([^\s@!]+)/)
  if (gm) { goal = gm[1]; matches.push(gm[0]) }

  // ── 優先度 ──
  let priority = ''
  const pm = text.match(/!\s*(high|low|normal)|重要|緊急|至急|急ぎ/i)
  if (pm) {
    const raw = pm[0].toLowerCase()
    priority = /low/.test(raw) ? 'low' : /normal/.test(raw) ? 'normal' : 'high'
    matches.push(pm[0])
  }

  // 件名 = トークンを除いた残り
  for (const raw of matches) title = title.split(raw).join(' ')
  title = title.replace(/\s+/g, ' ').trim()

  return { title, date, dateLabel, timeLabel, assignee, goal, priority,
    tokens: { date: matches.find(()=>date) ? dateLabel : '', } }
}

const PRIORITY_LABEL = { high: '高 (!high)', normal: '中', low: '低 (!low)' }
const PRIORITY_TONE = { high: TONE.priority, normal: { bg: 'rgba(14,165,233,.12)', fg: '#0369a1' }, low: { bg: 'rgba(148,163,184,.16)', fg: '#64748b' } }

function Kbd({ children }) {
  return <span style={{ display: 'inline-block', minWidth: 14, padding: '2px 6px', fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace, monospace', background: 'rgba(15,23,42,.06)', borderRadius: 4, color: '#94a3b8' }}>{children}</span>
}

export default function QuickTaskPalette({ user, members = [] }) {
  const myName = React.useMemo(() => members.find(m => m.email === user?.email)?.name || '', [members, user])
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const inputRef = React.useRef(null)

  const parsed = React.useMemo(() => parseTask(draft, members), [draft, members])
  const resolvedAssignee = parsed.assignee || myName

  const openPalette = React.useCallback((preset = '') => {
    setDraft(preset)
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [])

  // グローバルショートカット ⌘K / T と外部起動イベント
  React.useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); open ? setOpen(false) : openPalette()
      } else if (!open && (e.key === 't' || e.key === 'T') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); openPalette()
      }
    }
    function onOpenEvent(e) { openPalette(e?.detail?.preset || '') }
    window.addEventListener('keydown', onKey)
    window.addEventListener('okr:open-quicktask', onOpenEvent)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('okr:open-quicktask', onOpenEvent) }
  }, [open, openPalette])

  async function add(keepOpen) {
    if (!parsed.title || saving) return
    setSaving(true)
    const payload = {
      title: parsed.title,
      assignee: resolvedAssignee || '',
      status: 'not_started',
      done: false,
      ...(parsed.date ? { due_date: fmtDate(parsed.date) } : {}),
    }
    const { error } = await supabase.from('ka_tasks').insert(payload)
    setSaving(false)
    if (error) { alert('タスク追加に失敗しました: ' + error.message); return }
    window.dispatchEvent(new CustomEvent('okr:task-created', { detail: { count: 1 } }))
    if (keepOpen) { setDraft(''); setTimeout(() => inputRef.current?.focus(), 10) }
    else { setOpen(false); setDraft('') }
  }

  function onInputKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); add(e.shiftKey) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  if (!open) return null

  const PreviewRow = ({ label, children }) => (
    <>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </>
  )
  const pill = (tone, text) => (
    <span style={{ padding: '1px 8px', borderRadius: 99, background: tone.bg, color: tone.fg, fontWeight: 600, fontSize: 11 }}>{text}</span>
  )

  return (
    <>
      <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)', width: 'min(560px, calc(100vw - 32px))',
        background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(15,23,42,.08)', borderRadius: 16, overflow: 'hidden', zIndex: 101,
        boxShadow: '0 32px 80px rgba(15,23,42,.28)',
        fontFamily: '"Inter", "Noto Sans JP", system-ui, sans-serif', color: '#0f172a',
      }}>
        {/* 入力行 */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(15,23,42,.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: 'linear-gradient(135deg, #3b82f6, #1e3a8a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <input
            ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onInputKey}
            placeholder="例: 明日 11時 提案資料を送る @佐藤 #目標2 !high"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: '#0f172a', fontFamily: 'inherit' }}
          />
          <Kbd>⌘K</Kbd>
        </div>

        {/* 解析トークン (4色) */}
        {(parsed.dateLabel || parsed.assignee || parsed.goal || parsed.priority) && (
          <div style={{ padding: '10px 22px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {parsed.dateLabel && pill(TONE.date, `📅 ${parsed.dateLabel}`)}
            {parsed.assignee && pill(TONE.assignee, `@${parsed.assignee}`)}
            {parsed.goal && pill(TONE.goal, `🎯 ${parsed.goal}`)}
            {parsed.priority && pill(PRIORITY_TONE[parsed.priority], `! ${parsed.priority}`)}
          </div>
        )}

        {/* 解釈プレビュー */}
        <div style={{ padding: '14px 22px', background: 'rgba(255,255,255,.5)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>解釈プレビュー</div>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, alignItems: 'center' }}>
            <PreviewRow label="件名"><span style={{ fontWeight: 500 }}>{parsed.title || <span style={{ color: '#cbd5e1' }}>—</span>}</span></PreviewRow>
            <PreviewRow label="期日">{parsed.dateLabel ? pill(TONE.date, `📅 ${parsed.dateLabel}`) : <span style={{ color: '#cbd5e1' }}>—</span>}</PreviewRow>
            <PreviewRow label="担当">
              {resolvedAssignee
                ? <><span style={{ width: 18, height: 18, borderRadius: 99, background: '#cbd5e1', color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{resolvedAssignee[0]}</span><span>{resolvedAssignee}{!parsed.assignee && '（自分）'}</span></>
                : <span style={{ color: '#cbd5e1' }}>—</span>}
            </PreviewRow>
            <PreviewRow label="紐付け">{parsed.goal ? pill(TONE.goal, `🎯 ${parsed.goal}`) : <span style={{ color: '#cbd5e1' }}>—</span>}</PreviewRow>
            <PreviewRow label="優先度">{parsed.priority ? pill(PRIORITY_TONE[parsed.priority], PRIORITY_LABEL[parsed.priority]) : <span style={{ color: '#cbd5e1' }}>—</span>}</PreviewRow>
          </div>
        </div>

        {/* アクションバー */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(15,23,42,.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => add(false)} disabled={!parsed.title || saving} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8,
            background: parsed.title ? 'linear-gradient(135deg, #3b82f6, #1e3a8a)' : '#cbd5e1', color: '#fff',
            cursor: parsed.title && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            boxShadow: '0 2px 6px rgba(30,58,138,.3)', display: 'flex', alignItems: 'center', gap: 8,
          }}>{saving ? '追加中…' : '追加'} <Kbd>↵</Kbd></button>
          <button onClick={() => add(true)} disabled={!parsed.title || saving} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 500, borderRadius: 8,
            background: '#fff', color: '#475569', border: '1px solid rgba(15,23,42,.12)',
            cursor: parsed.title && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}>あとで（続けて投函）</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Kbd>Esc</Kbd> キャンセル · <Kbd>⇧↵</Kbd> 続けて追加
          </span>
        </div>
      </div>
    </>
  )
}

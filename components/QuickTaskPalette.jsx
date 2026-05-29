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
import Icon from './Icon'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { cardStyle, pillStyle, btnBrand, btnGhost, inputStyle } from '../lib/iosStyles'

// このオーバーレイは light 固定の Glass UI。トークンは light を参照。
const T = COMMON_TOKENS.light

const TONE = {
  date:     { bg: T.infoBg,    fg: T.info },
  assignee: { bg: T.accentBg,  fg: T.accentText },
  goal:     { bg: T.successBg, fg: T.success },
  priority: { bg: T.warnBg,    fg: T.warn },
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
const PRIORITY_TONE = { high: TONE.priority, normal: { bg: T.accentBg, fg: T.accentText }, low: { bg: 'rgba(148,163,184,.16)', fg: T.textSub } }

function Kbd({ children }) {
  return <span style={{ display: 'inline-block', minWidth: 14, padding: '2px 6px', ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', fontFamily: 'ui-monospace, monospace', background: T.border, borderRadius: RADIUS.xs, color: T.textMuted }}>{children}</span>
}

export default function QuickTaskPalette({ user, members = [], inline = false }) {
  const myName = React.useMemo(() => members.find(m => m.email === user?.email)?.name || '', [members, user])
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const inputRef = React.useRef(null)
  const composingRef = React.useRef(false)

  // モバイル判定: キーボードショートカット表記 (⌘K / ↵ / Esc) はタッチ端末で
  // 無意味なため非表示にし、アクションバーをボタン主体のレイアウトへ切替える。
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

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
    function onQuickFill(e) {
      const text = e?.detail?.text || ''
      if (inline) {
        setDraft(text)
        setTimeout(() => { inputRef.current?.focus(); inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 30)
      } else {
        openPalette(text)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('okr:open-quicktask', onOpenEvent)
    window.addEventListener('okr:quickfill', onQuickFill)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('okr:open-quicktask', onOpenEvent); window.removeEventListener('okr:quickfill', onQuickFill) }
  }, [open, openPalette, inline])

  async function add(keepOpen) {
    if (!parsed.title || saving) return
    setSaving(true)
    // 担当の email を解決 (突合用の安定キー)。@担当ならそのメンバー、未指定なら自分。
    const assigneeEmail = (
      members.find(m => m.name === resolvedAssignee)?.email ||
      (resolvedAssignee === myName ? user?.email : '') || ''
    ).toLowerCase()
    const base = {
      title: parsed.title,
      assignee: resolvedAssignee || '',
      status: 'not_started',
      done: false,
      ...(parsed.date ? { due_date: fmtDate(parsed.date) } : {}),
    }
    let { error } = await supabase.from('ka_tasks').insert({ ...base, ...(assigneeEmail ? { assignee_email: assigneeEmail } : {}) })
    // assignee_email 列が無い古い環境向けフォールバック (列なしで再挿入)
    if (error && /assignee_email|column/i.test(error.message || '')) {
      ;({ error } = await supabase.from('ka_tasks').insert(base))
    }
    setSaving(false)
    if (error) { alert('タスク追加に失敗しました: ' + error.message); return }
    window.dispatchEvent(new CustomEvent('okr:task-created', { detail: { count: 1 } }))
    if (keepOpen) { setDraft(''); setTimeout(() => inputRef.current?.focus(), 10) }
    else { setOpen(false); setDraft('') }
  }

  function onInputKey(e) {
    // IME 変換中の Enter は確定操作なので追加しない (compositionref + isComposing 二重判定)
    if (e.key === 'Enter') {
      if (composingRef.current || e.nativeEvent?.isComposing || e.keyCode === 229) return
      e.preventDefault(); add(e.shiftKey)
    }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  if (!inline && !open) return null

  const PreviewRow = ({ label, children }) => (
    <>
      <div style={{ ...TYPO.subhead, fontWeight: 500, color: T.textMuted }}>{label}</div>
      <div style={{ ...TYPO.subhead, fontWeight: 500, display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>{children}</div>
    </>
  )
  const pill = (tone, children) => (
    <span style={{ ...pillStyle({ color: tone.fg, size: 'md' }), background: tone.bg, fontWeight: 600 }}>{children}</span>
  )

  // ─── インライン版 (マイページ常時表示用のコンパクトバー) ───
  if (inline) {
    return (
      <div style={{ ...cardStyle({ T, padding: 0 }), borderRadius: RADIUS.xl, border: `1px solid ${T.border}`, background: T.bgCard, fontFamily: '"Inter","Noto Sans JP",system-ui,sans-serif', color: T.text }}>
        <div style={{ padding: '12px 16px 2px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', color: T.info || T.accent }}><Icon name="bolt" size={15} /></span>
          <span style={{ ...TYPO.subhead, fontWeight: 800, color: T.text }}>クイックタスク追加</span>
          <span style={{ ...TYPO.caption, color: T.textMuted }}>自然文で日付・KR をまとめて指定できます</span>
        </div>
        <div style={{ padding: '8px 12px 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 30, height: 30, borderRadius: RADIUS.sm, flexShrink: 0, background: 'linear-gradient(135deg,#3b82f6,#1e3a8a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Icon name="plus" size={15} stroke={2.6} />
          </div>
          <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onInputKey}
            onCompositionStart={() => { composingRef.current = true }} onCompositionEnd={() => { composingRef.current = false }}
            placeholder="例: 明日 11時 提案書をクライアントに送る #KR2-売上"
            style={{ flex: 1, minWidth: 150, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: T.text, fontFamily: 'inherit', padding: '4px 0' }} />
          {parsed.dateLabel && pill(TONE.date, <><Icon name="calendar" size={11} /> {parsed.dateLabel}</>)}
          {parsed.goal && pill(TONE.goal, <><Icon name="target" size={11} /> {parsed.goal}</>)}
          <button onClick={() => add(false)} disabled={!parsed.title || saving} style={{
            ...btnBrand({ size: 'sm' }),
            ...(parsed.title ? {} : { background: T.textFaint, boxShadow: 'none' }),
            cursor: parsed.title && !saving ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
          }}>{saving ? '追加中…' : <>追加 <Icon name="arrowRight" size={13} /></>}</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 100 }} />
      <div style={{
        ...cardStyle({ T, padding: 0 }),
        position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)', width: 'min(560px, calc(100vw - 32px))',
        background: 'rgba(255,255,255,.96)',
        borderRadius: RADIUS.xl, zIndex: 101,
        boxShadow: SHADOWS.xl,
        fontFamily: '"Inter", "Noto Sans JP", system-ui, sans-serif', color: T.text,
      }}>
        {/* 入力行 */}
        <div style={{ padding: `${SPACING.lg + 2}px ${SPACING['2xl'] - 2}px`, borderBottom: `1px solid ${T.borderLight}`, display: 'flex', alignItems: 'center', gap: SPACING.md }}>
          <div style={{ width: 28, height: 28, borderRadius: RADIUS.xs + 1, flexShrink: 0, background: 'linear-gradient(135deg, #3b82f6, #1e3a8a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Icon name="plus" size={14} stroke={2.6} />
          </div>
          <input
            ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onInputKey}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            placeholder="例: 明日 11時 提案資料を送る @佐藤 #目標2 !high"
            style={{ ...inputStyle({ T }), width: 'auto', flex: 1, border: 'none', padding: 0, background: 'transparent', fontSize: 16, color: T.text }}
          />
          {!isMobile && <Kbd>⌘K</Kbd>}
        </div>

        {/* 解析トークン (4色) */}
        {(parsed.dateLabel || parsed.assignee || parsed.goal || parsed.priority) && (
          <div style={{ padding: `${SPACING.sm + 2}px ${SPACING['2xl'] - 2}px 0`, display: 'flex', gap: SPACING.xs + 2, flexWrap: 'wrap' }}>
            {parsed.dateLabel && pill(TONE.date, <><Icon name="calendar" size={11} /> {parsed.dateLabel}</>)}
            {parsed.assignee && pill(TONE.assignee, `@${parsed.assignee}`)}
            {parsed.goal && pill(TONE.goal, <><Icon name="target" size={11} /> {parsed.goal}</>)}
            {parsed.priority && pill(PRIORITY_TONE[parsed.priority], `! ${parsed.priority}`)}
          </div>
        )}

        {/* 解釈プレビュー */}
        <div style={{ padding: `${SPACING.md + 2}px ${SPACING['2xl'] - 2}px`, background: 'rgba(255,255,255,.5)' }}>
          <div style={{ ...TYPO.caption, color: T.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: SPACING.sm }}>解釈プレビュー</div>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: SPACING.sm, alignItems: 'center' }}>
            <PreviewRow label="件名"><span style={{ fontWeight: 500 }}>{parsed.title || <span style={{ color: T.textFaint }}>—</span>}</span></PreviewRow>
            <PreviewRow label="期日">{parsed.dateLabel ? pill(TONE.date, <><Icon name="calendar" size={11} /> {parsed.dateLabel}</>) : <span style={{ color: T.textFaint }}>—</span>}</PreviewRow>
            <PreviewRow label="担当">
              {resolvedAssignee
                ? <><span style={{ width: 18, height: 18, borderRadius: RADIUS.pill, background: T.textFaint, color: '#fff', ...TYPO.caption, letterSpacing: 'normal', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{resolvedAssignee[0]}</span><span>{resolvedAssignee}{!parsed.assignee && '（自分）'}</span></>
                : <span style={{ color: T.textFaint }}>—</span>}
            </PreviewRow>
            <PreviewRow label="紐付け">{parsed.goal ? pill(TONE.goal, <><Icon name="target" size={11} /> {parsed.goal}</>) : <span style={{ color: T.textFaint }}>—</span>}</PreviewRow>
            <PreviewRow label="優先度">{parsed.priority ? pill(PRIORITY_TONE[parsed.priority], PRIORITY_LABEL[parsed.priority]) : <span style={{ color: T.textFaint }}>—</span>}</PreviewRow>
          </div>
        </div>

        {/* アクションバー (モバイルではキーボード表記を省きボタン主体に) */}
        <div style={{
          padding: `${SPACING.md + 2}px ${SPACING['2xl'] - 2}px`, borderTop: `1px solid ${T.borderLight}`,
          display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}>
          <button onClick={() => add(false)} disabled={!parsed.title || saving} style={{
            ...btnBrand({ size: 'md' }),
            ...(parsed.title ? {} : { background: T.textFaint, boxShadow: 'none' }),
            cursor: parsed.title && !saving ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
            ...(isMobile ? { flex: '1 1 100%' } : {}),
          }}>{saving ? '追加中…' : '追加'} {!isMobile && <Kbd>↵</Kbd>}</button>
          <button onClick={() => add(true)} disabled={!parsed.title || saving} style={{
            ...btnGhost({ T, size: 'md' }), fontWeight: 500,
            cursor: parsed.title && !saving ? 'pointer' : 'not-allowed',
            ...(isMobile ? { flex: '1 1 auto' } : {}),
          }}>あとで（続けて投函）</button>
          {isMobile ? (
            <button onClick={() => setOpen(false)} style={{
              ...btnGhost({ T, size: 'md' }), fontWeight: 500, color: T.textMuted, flex: '0 0 auto',
            }}>キャンセル</button>
          ) : (
            <>
              <div style={{ flex: 1 }} />
              <span style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted, display: 'flex', alignItems: 'center', gap: SPACING.xs + 2 }}>
                <Kbd>Esc</Kbd> キャンセル · <Kbd>⇧↵</Kbd> 続けて追加
              </span>
            </>
          )}
        </div>
      </div>
    </>
  )
}

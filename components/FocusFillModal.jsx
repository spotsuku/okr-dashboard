'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── 日付ユーティリティ (JST) ─────────────────────────
function toJSTDateStr(d) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().split('T')[0]
}
function getMondayJSTStr(d = new Date()) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const wd = jst.getUTCDay()
  const diff = wd === 0 ? -6 : 1 - wd
  const mon = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + diff))
  return mon.toISOString().split('T')[0]
}
// 今週のMondayから offset日後のJST 00:00 のタイムスタンプ
function weekdayDeadlineMs(offset) {
  const [y, m, d] = getMondayJSTStr().split('-').map(Number)
  // JST 00:00 = UTC前日15:00
  return Date.UTC(y, m - 1, d + offset, -9, 0, 0)
}
function formatCountdown(deadlineMs) {
  const diff = deadlineMs - Date.now()
  if (diff <= 0) {
    const pastHours = Math.floor((-diff) / 3600000)
    const pastDays = Math.floor(pastHours / 24)
    if (pastDays > 0) return { text: `${pastDays}日 超過`, overdue: true, urgent: true }
    return { text: `${pastHours}時間 超過`, overdue: true, urgent: true }
  }
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(hrs / 24)
  if (days > 0) return { text: `あと ${days}日${hrs % 24}時間`, overdue: false, urgent: days === 0 && hrs < 24 }
  return { text: `あと ${hrs}時間`, overdue: false, urgent: true }
}

const MODE_CONFIG = {
  kr: {
    title: '🎯 KR記入モード',
    cta: '今週のKRを振り返り確認しよう！',
    deadlineLabel: '木曜 00:00 JST まで',
    deadlineOffset: 3,  // 月曜+3 = 木曜
    accent: '#4d9fff',
    accentBg: 'rgba(77,159,255,0.12)',
  },
  ka: {
    title: '📋 KA記入モード',
    cta: 'KAの今週の振り返りと来週の注力を確認しよう！',
    deadlineLabel: '金曜 00:00 JST まで',
    deadlineOffset: 4,  // 月曜+4 = 金曜
    accent: '#00d68f',
    accentBg: 'rgba(0,214,143,0.12)',
  },
}

const WEATHER_OPTIONS = [
  { v: 0, icon: '⚪', label: '未設定' },
  { v: 1, icon: '🌧️', label: '雨' },
  { v: 2, icon: '☁️', label: '曇り' },
  { v: 3, icon: '⛅', label: '晴れ時々曇り' },
  { v: 4, icon: '☀️', label: '晴れ' },
  { v: 5, icon: '🌟', label: '快晴' },
]

// ─── メインコンポーネント ───────────────────────────
export default function FocusFillModal({ open, onClose, T, viewingName, myName, initialMode = 'kr' }) {
  const isViewingSelf = viewingName === myName
  const [mode, setMode] = useState(initialMode)
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState({ kr: [], ka: [] })      // 未記入カード一覧
  const [index, setIndex] = useState({ kr: 0, ka: 0 })        // 各モードの現在位置
  const [draft, setDraft] = useState({ good: '', more: '', focus: '', weather: 0 })
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState({ kr: false, ka: false })
  const [objMap, setObjMap] = useState({})
  const [swipeDelta, setSwipeDelta] = useState(0)  // D: スワイプ時のX移動量

  const weekStart = useMemo(() => getMondayJSTStr(), [])
  const krDeadline = useMemo(() => weekdayDeadlineMs(MODE_CONFIG.kr.deadlineOffset), [])
  const kaDeadline = useMemo(() => weekdayDeadlineMs(MODE_CONFIG.ka.deadlineOffset), [])

  // ─── データ取得 ───
  const load = useCallback(async () => {
    if (!viewingName) return
    setLoading(true)

    const [krsRes, krReviewsRes, kasRes, objsRes] = await Promise.all([
      supabase.from('key_results').select('id, title, target, current, unit, owner, objective_id').eq('owner', viewingName),
      supabase.from('kr_weekly_reviews').select('*').eq('week_start', weekStart),
      supabase.from('weekly_reports').select('id, ka_title, kr_id, kr_title, objective_id, owner, status, good, more, focus_output')
        .eq('owner', viewingName).eq('week_start', weekStart).neq('status', 'done'),
      supabase.from('objectives').select('id, title, period'),
    ])

    const krs = krsRes.data || []
    const krReviewsMap = Object.fromEntries((krReviewsRes.data || []).map(r => [r.kr_id, r]))
    const om = {}; (objsRes.data || []).forEach(o => { om[o.id] = o }); setObjMap(om)

    // KR 未記入キュー (C対応): レコード未作成 or 全フィールド空 (weather=0 含む)
    const krQueue = krs
      .filter(kr => {
        const r = krReviewsMap[kr.id]
        if (!r) return true
        const allTextEmpty = !((r.good || '').trim() || (r.more || '').trim() || (r.focus || '').trim() || (r.focus_output || '').trim())
        const weatherUnset = (r.weather || 0) === 0
        return allTextEmpty && weatherUnset  // 完全空白のみ対象
      })
      .map(kr => ({
        kind: 'kr',
        kr,
        review: krReviewsMap[kr.id] || null,
        objective: om[kr.objective_id] || null,
      }))

    // KA 未記入キュー: good/more/focus_output が全空
    const kaQueue = (kasRes.data || [])
      .filter(ka => !((ka.good || '').trim() || (ka.more || '').trim() || (ka.focus_output || '').trim()))
      .map(ka => ({
        kind: 'ka',
        ka,
        objective: om[ka.objective_id] || null,
      }))

    setQueue({ kr: krQueue, ka: kaQueue })
    setIndex({ kr: 0, ka: 0 })
    setCompleted({ kr: krQueue.length === 0, ka: kaQueue.length === 0 })
    setLoading(false)
  }, [viewingName, weekStart])

  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => { if (open) setMode(initialMode) }, [open, initialMode])

  // ─── 現在のカードが変わったら draft を初期化 ───
  const currentCard = queue[mode]?.[index[mode]]
  useEffect(() => {
    if (!currentCard) {
      setDraft({ good: '', more: '', focus: '', weather: 0 })
      return
    }
    if (currentCard.kind === 'kr') {
      const r = currentCard.review
      setDraft({
        good: r?.good || '',
        more: r?.more || '',
        focus: r?.focus || '',
        weather: r?.weather || 0,
      })
    } else {
      const ka = currentCard.ka
      setDraft({
        good: ka.good || '',
        more: ka.more || '',
        focus: ka.focus_output || '',  // KA側では focus_output カラム
        weather: 0,  // KAには weather なし
      })
    }
  }, [currentCard?.kind, currentCard?.kr?.id, currentCard?.ka?.id])

  // ─── 保存 ───
  async function handleSaveNext() {
    if (!currentCard) return
    if (!isViewingSelf) return   // E: 本人のみ保存可
    const filled = (draft.good || '').trim() || (draft.more || '').trim() || (draft.focus || '').trim()
    if (!filled) {
      // 空のまま保存はスキップ扱い
      return moveNext()
    }

    setSaving(true)
    if (currentCard.kind === 'kr') {
      const payload = {
        kr_id: currentCard.kr.id,
        week_start: weekStart,
        weather: Number(draft.weather) || 0,
        good: draft.good || '',
        more: draft.more || '',
        focus: draft.focus || '',
      }
      // upsert on (kr_id, week_start)
      const { error } = await supabase.from('kr_weekly_reviews')
        .upsert(payload, { onConflict: 'kr_id,week_start' })
      if (error) { setSaving(false); alert('KR保存エラー: ' + error.message); return }
    } else {
      const payload = {
        good: draft.good || '',
        more: draft.more || '',
        focus_output: draft.focus || '',
      }
      const { error } = await supabase.from('weekly_reports')
        .update(payload).eq('id', currentCard.ka.id)
      if (error) { setSaving(false); alert('KA保存エラー: ' + error.message); return }
    }
    setSaving(false)
    moveNext()
  }

  function moveNext() {
    const q = queue[mode]
    const nextIdx = index[mode] + 1
    if (nextIdx >= q.length) {
      setCompleted(c => ({ ...c, [mode]: true }))
    } else {
      setIndex(i => ({ ...i, [mode]: nextIdx }))
    }
  }

  function moveBack() {
    setIndex(i => ({ ...i, [mode]: Math.max(0, i[mode] - 1) }))
    setCompleted(c => ({ ...c, [mode]: false }))
  }

  function skipCard() {
    // キューの末尾に移動
    const q = [...queue[mode]]
    const cur = q.splice(index[mode], 1)[0]
    q.push(cur)
    setQueue(prev => ({ ...prev, [mode]: q }))
    // indexはそのままで次のカードが表示される
    if (index[mode] >= q.length - 1) {
      setIndex(i => ({ ...i, [mode]: 0 }))
    }
  }

  // ─── D: スワイプジェスチャ ───
  const touchStartX = useMemo(() => ({ x: 0 }), [])
  const onTouchStart = (e) => {
    // textarea/button/input に触れた場合は無視
    const tag = e.target?.tagName?.toLowerCase()
    if (tag === 'textarea' || tag === 'input' || tag === 'button' || tag === 'select') return
    touchStartX.x = e.touches[0].clientX
    setSwipeDelta(0)
  }
  const onTouchMove = (e) => {
    if (!touchStartX.x) return
    const delta = e.touches[0].clientX - touchStartX.x
    setSwipeDelta(delta)
  }
  const onTouchEnd = () => {
    const THRESHOLD = 80
    const delta = swipeDelta
    touchStartX.x = 0
    setSwipeDelta(0)
    if (Math.abs(delta) < THRESHOLD) return
    if (delta < -THRESHOLD) {
      // 左スワイプ: 保存して次へ (本人のみ)
      if (isViewingSelf && !saving) handleSaveNext()
    } else if (delta > THRESHOLD) {
      // 右スワイプ: 戻る
      if (!saving) moveBack()
    }
  }

  if (!open) return null

  const cfg = MODE_CONFIG[mode]
  const q = queue[mode]
  const current = q[index[mode]]
  const remaining = Math.max(0, q.length - index[mode])
  const done = Math.max(0, q.length - remaining)
  const total = q.length
  const progressPct = total === 0 ? 100 : Math.round((done / total) * 100)
  const deadline = mode === 'kr' ? krDeadline : kaDeadline
  const countdown = formatCountdown(deadline)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 14,
        width: '100%', maxWidth: 720, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* ─── モード切替タブ ─── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          borderBottom: `1px solid ${T.border}`, background: T.sectionBg,
          padding: '10px 14px 0 14px', gap: 0, flexWrap: 'wrap',
        }}>
          {['kr', 'ka'].map(m => {
            const isActive = mode === m
            const mc = MODE_CONFIG[m]
            const count = queue[m]?.length || 0
            return (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: '8px 14px 10px 14px', border: 'none',
                background: isActive ? T.bgCard : 'transparent',
                borderRadius: '8px 8px 0 0',
                borderBottom: isActive ? `2px solid ${mc.accent}` : '2px solid transparent',
                color: isActive ? T.text : T.textMuted,
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                marginBottom: -1,
              }}>
                {mc.title}
                {count > 0 && <span style={{
                  marginLeft: 6, padding: '1px 7px', borderRadius: 99,
                  background: mc.accent, color: '#fff', fontSize: 10,
                }}>{count}</span>}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          {/* 閲覧中のユーザー + 権限バッジ (E対応) */}
          <div style={{
            fontSize: 10, color: T.textMuted, padding: '4px 8px',
            background: isViewingSelf ? 'rgba(77,159,255,0.12)' : 'rgba(122,133,153,0.12)',
            borderRadius: 6, marginRight: 8, marginBottom: 6,
          }}>
            {isViewingSelf ? `✏️ ${viewingName} (自分)` : `👁 ${viewingName} (閲覧のみ)`}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textMuted,
            fontSize: 22, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 10px',
            marginBottom: 6,
          }}>×</button>
        </div>

        {/* ─── CTA + 進捗 + 締切 ─── */}
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, background: cfg.accentBg }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: cfg.accent, marginBottom: 6 }}>
            {cfg.cta}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: T.textSub }}>
            <div style={{ flex: 1 }}>
              <div style={{
                height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 99, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${progressPct}%`, background: cfg.accent,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ marginTop: 4, fontWeight: 600 }}>
                {done} / {total} 完了 (残り{remaining}件)
              </div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 7,
              background: countdown.overdue ? 'rgba(255,107,107,0.15)' :
                          countdown.urgent ? 'rgba(255,209,102,0.15)' : 'rgba(255,255,255,0.3)',
              color: countdown.overdue ? '#ff6b6b' : countdown.urgent ? '#ffa94d' : T.text,
              fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap',
            }}>
              {countdown.overdue ? '🚨 ' : countdown.urgent ? '⚠️ ' : '⏰ '}{cfg.deadlineLabel.split(' ')[0]} · {countdown.text}
            </div>
          </div>
        </div>

        {/* ─── カード本体 (スワイプ対応) ─── */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            flex: 1, overflowY: 'auto', padding: 24, minHeight: 0,
            transform: `translateX(${swipeDelta}px)`,
            transition: swipeDelta === 0 ? 'transform 0.2s ease' : 'none',
            opacity: Math.abs(swipeDelta) > 120 ? 0.5 : 1,
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: T.textMuted }}>読み込み中...</div>
          ) : completed[mode] || q.length === 0 ? (
            <CompletionScreen T={T} mode={mode} q={q} onClose={onClose} />
          ) : current ? (
            <CardView T={T} card={current} draft={draft} setDraft={setDraft} cfg={cfg} readOnly={!isViewingSelf} />
          ) : null}
        </div>

        {/* ─── フッター操作 ─── */}
        {!loading && !completed[mode] && q.length > 0 && (
          <div style={{
            display: 'flex', gap: 8, padding: '12px 20px',
            borderTop: `1px solid ${T.border}`, background: T.sectionBg,
            alignItems: 'center',
          }}>
            <button onClick={skipCard} disabled={saving || q.length <= 1} style={{
              background: 'transparent', border: `1px solid ${T.borderMid}`,
              color: T.textSub, borderRadius: 8, padding: '8px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              opacity: q.length <= 1 ? 0.5 : 1,
            }}>⏭ 後で</button>
            <button onClick={moveBack} disabled={saving || index[mode] === 0} style={{
              background: 'transparent', border: `1px solid ${T.borderMid}`,
              color: T.textSub, borderRadius: 8, padding: '8px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              opacity: index[mode] === 0 ? 0.4 : 1,
            }}>← 戻る</button>
            <div style={{ flex: 1, fontSize: 10, color: T.textFaint, textAlign: 'center', display: 'none' }} className="swipe-hint">
              ← スワイプで戻る / 右スワイプで保存 →
            </div>
            <div style={{ flex: 1 }} />
            {isViewingSelf ? (
              <button onClick={handleSaveNext} disabled={saving} style={{
                background: cfg.accent, border: 'none', color: '#fff',
                borderRadius: 8, padding: '8px 20px',
                fontSize: 13, fontWeight: 800, cursor: saving ? 'wait' : 'pointer',
                fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
              }}>
                {saving ? '保存中...' : (index[mode] === q.length - 1 ? '✅ 保存して完了 🎉' : '✅ 保存して次へ →')}
              </button>
            ) : (
              <button onClick={moveNext} disabled={index[mode] === q.length - 1} style={{
                background: T.accent, border: 'none', color: '#fff',
                borderRadius: 8, padding: '8px 20px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                opacity: index[mode] === q.length - 1 ? 0.5 : 1,
              }}>次へ →</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── カード表示 ────────────────────────────────────────
function CardView({ T, card, draft, setDraft, cfg, readOnly = false }) {
  const isKR = card.kind === 'kr'
  const kr = card.kr
  const ka = card.ka
  const obj = card.objective
  const title = isKR ? kr.title : (ka.ka_title || '(無題)')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* コンテキスト: Objective → タイトル */}
      <div>
        {obj && (
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
            {obj.period?.toUpperCase()} · OBJECTIVE {obj.title && <span style={{ color: T.textSub, fontWeight: 500, marginLeft: 4 }}>{obj.title}</span>}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
            background: cfg.accentBg, color: cfg.accent,
          }}>{isKR ? 'KR' : 'KA'}</span>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
            {title}
          </div>
        </div>
        {isKR && kr.target && (
          <div style={{ fontSize: 11, color: T.textMuted }}>
            目標 {kr.target}{kr.unit || ''} · 現在 {kr.current || 0}{kr.unit || ''} ({kr.target ? Math.round((kr.current || 0) / kr.target * 100) : 0}%)
          </div>
        )}
        {!isKR && ka.kr_title && (
          <div style={{ fontSize: 11, color: T.textMuted }}>
            所属KR: {ka.kr_title}
          </div>
        )}
      </div>

      {/* KR のみ: 天気 */}
      {isKR && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
            🌤️ 今週の体感・主観
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {WEATHER_OPTIONS.slice(1).map(w => (
              <button key={w.v}
                onClick={() => !readOnly && setDraft(d => ({ ...d, weather: w.v }))}
                disabled={readOnly}
                style={{
                  flex: 1, padding: '10px 4px',
                  background: Number(draft.weather) === w.v ? cfg.accentBg : 'transparent',
                  border: `1px solid ${Number(draft.weather) === w.v ? cfg.accent : T.border}`,
                  borderRadius: 8, cursor: readOnly ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  color: T.text, fontSize: 10, opacity: readOnly ? 0.6 : 1,
                }}>
                <span style={{ fontSize: 18 }}>{w.icon}</span>
                <span>{w.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3 フィールド */}
      <FieldRow T={T} label="✅ 先週 good (良かったこと・続けたいこと)"
        color="#00d68f" readOnly={readOnly}
        value={draft.good} onChange={v => setDraft(d => ({ ...d, good: v }))}
        placeholder="例: 評議会で3社のクロージングが確定した" />
      <FieldRow T={T} label="🔺 先週 more (課題・改善点)"
        color="#ff6b6b" readOnly={readOnly}
        value={draft.more} onChange={v => setDraft(d => ({ ...d, more: v }))}
        placeholder="例: 午前中の集中が切れがちだった" />
      <FieldRow T={T} label={isKR ? '🎯 今週の focus (注力アクション)' : '🎯 今週 focus (Moreへの対応策)'}
        color="#4d9fff" readOnly={readOnly}
        value={draft.focus} onChange={v => setDraft(d => ({ ...d, focus: v }))}
        placeholder="例: 月曜朝90分はSlack offで提案書作成に集中" />
    </div>
  )
}

function FieldRow({ T, label, color, value, onChange, placeholder, readOnly = false }) {
  return (
    <div>
      <div style={{
        display: 'inline-block', fontSize: 11, fontWeight: 700,
        color, background: `${color}18`, borderRadius: 5,
        padding: '3px 8px', marginBottom: 4,
      }}>{label}</div>
      <textarea
        value={value} onChange={e => onChange(e.target.value)}
        readOnly={readOnly}
        rows={3} placeholder={readOnly ? '' : placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '10px 12px', fontSize: 13, lineHeight: 1.6,
          background: T.sectionBg, border: `1px solid ${T.borderMid}`,
          borderRadius: 8, color: T.text, outline: 'none', fontFamily: 'inherit',
          resize: 'vertical', minHeight: 72,
          cursor: readOnly ? 'default' : 'text',
        }}
      />
    </div>
  )
}

// ─── 完了画面 ────────────────────────────────────────
function CompletionScreen({ T, mode, q, onClose }) {
  const mc = MODE_CONFIG[mode]
  const isEmpty = q.length === 0
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{isEmpty ? '✨' : '🎉'}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 6 }}>
        {isEmpty ? '記入すべき項目はありません' : '完璧です！お疲れさまでした'}
      </div>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 24 }}>
        {isEmpty
          ? `${mc.title.replace(/^[^ ]+ /, '')}の未記入項目はありません。`
          : `${q.length}件の ${mode === 'kr' ? 'KR' : 'KA'} レビューを完成しました。`}
      </div>
      <button onClick={onClose} style={{
        background: mc.accent, border: 'none', color: '#fff',
        borderRadius: 8, padding: '10px 24px',
        fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}>閉じる</button>
    </div>
  )
}

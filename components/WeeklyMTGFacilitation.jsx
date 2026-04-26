'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAutoSave } from '../lib/useAutoSave'
import { getMeeting, MEETING_URLS } from '../lib/meetings'
import { openNotionUrl } from '../lib/notionLink'
import ConfirmationsTab from './ConfirmationsTab'
import MeetingImport from './MeetingImport'

// ─── テーマ ──────────────────────────────────────────────────────────────────
const DARK_T = {
  bg: '#0F1117', bgCard: '#111828', bgCard2: '#1a2030', bgSection: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)', borderMid: 'rgba(255,255,255,0.12)',
  text: '#E8ECF0', textSub: '#cfd6e8', textMuted: '#7a8499', textFaint: '#4a5266',
  accent: '#4d9fff', success: '#00d68f', warn: '#ff9f43', danger: '#ff6b6b',
}
const LIGHT_T = {
  bg: '#EEF2F5', bgCard: '#FFFFFF', bgCard2: '#F5F7FA', bgSection: '#F8FAFC',
  border: '#E2E8F0', borderMid: '#CBD5E0',
  text: '#2D3748', textSub: '#4A5568', textMuted: '#718096', textFaint: '#A0AEC0',
  accent: '#3B82C4', success: '#15A977', warn: '#D97A1F', danger: '#DC6B6B',
}

// ─── 階層 ヘルパー ────────────────────────────────────────────────────────
// 全社 (depth=0) → 事業部 (depth=1) → チーム (depth=2)
function getDepth(levelId, levels) {
  let d = 0
  let cur = levels.find(l => Number(l?.id) === Number(levelId))
  while (cur && cur.parent_id) {
    d++
    cur = levels.find(l => Number(l?.id) === Number(cur.parent_id))
  }
  return d
}

// scope に応じた対象レベルIDの配列を返す（depthベース）
function resolveScopeLevelIds(wkly, levels) {
  if (!Array.isArray(levels) || levels.length === 0) return []
  if (wkly?.scope === 'teams-of') {
    const parent = levels.find(l => l?.name === wkly.parentLevelName)
    if (!parent) return []
    return levels
      .filter(l => Number(l?.parent_id) === Number(parent.id))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(l => l.id)
  }
  if (wkly?.scope === 'all-teams') {
    return levels
      .filter(l => getDepth(l?.id, levels) === 2)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(l => l.id)
  }
  if (wkly?.scope === 'all-departments') {
    return levels
      .filter(l => getDepth(l?.id, levels) === 1)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(l => l.id)
  }
  return []
}

// ─── アバター ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function Avatar({ name, avatarUrl, size = 22 }) {
  if (!name) return null
  const color = avatarColor(name)
  return avatarUrl
    ? <img src={avatarUrl} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${color}60`, flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: `${color}25`, border: `1.5px solid ${color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color, flexShrink: 0 }}>{name.slice(0,2)}</div>
}

// ─── 共通: ステップ定義 ─────────────────────────────────────────────────────
function stepsForFlow(meeting) {
  // 会議タイプごとに step を返す。各 step は { n, label, icon, kind } を持ち、
  // kind が描画する内容を決める。
  const wkly = meeting?.weeklyMTG
  if (wkly?.withDiscussion) {
    // マネージャー会議:
    //   1. KR順送り (チーム層) → 2. チームサマリー → 3. 横断連携・確認事項 → 4. ネクストアクション → 5. 終了
    return [
      { n: 1, label: 'KR順送り',           icon: '🎯', kind: 'kr_loop' },
      { n: 2, label: 'チームサマリー',     icon: '🤝', kind: 'team_summary' },
      { n: 3, label: '横断連携・確認事項', icon: '💬', kind: 'confirmations' },
      { n: 4, label: 'ネクストアクション', icon: '✅', kind: 'next_actions' },
      { n: 5, label: '終了',               icon: '🏁', kind: 'done' },
    ]
  }
  if (meeting?.key === 'director') {
    // ディレクター確認会議:
    //   1. KRサマリー閲覧 (マネージャー会議で書かれた内容)
    //   2. 確認事項 → 3. ネクストアクション → 4. 終了
    return [
      { n: 1, label: 'KRサマリー閲覧',     icon: '📊', kind: 'team_summary_readonly' },
      { n: 2, label: '確認事項',           icon: '💬', kind: 'confirmations' },
      { n: 3, label: 'ネクストアクション', icon: '✅', kind: 'next_actions' },
      { n: 4, label: '終了',               icon: '🏁', kind: 'done' },
    ]
  }
  if (wkly?.flow === 'ka') {
    // 週次キックオフ
    return [
      { n: 1, label: 'KA順送り',           icon: '📋', kind: 'ka_loop' },
      { n: 2, label: '確認事項',           icon: '💬', kind: 'confirmations' },
      { n: 3, label: 'ネクストアクション', icon: '✅', kind: 'next_actions' },
      { n: 4, label: '終了',               icon: '🏁', kind: 'done' },
    ]
  }
  // 経営企画会議など (KR重点だが director でも manager でもない)
  return [
    { n: 1, label: 'KR順送り',           icon: '🎯', kind: 'kr_loop' },
    { n: 2, label: '確認事項',           icon: '💬', kind: 'confirmations' },
    { n: 3, label: 'ネクストアクション', icon: '✅', kind: 'next_actions' },
    { n: 4, label: '終了',               icon: '🏁', kind: 'done' },
  ]
}

// ─── メインコンポーネント ───────────────────────────────────────────────────
export default function WeeklyMTGFacilitation({
  meeting, weekStart, levels = [], members = [], myName, themeKey = 'dark',
  onSwitchToList,
}) {
  const T = themeKey === 'dark' ? DARK_T : LIGHT_T
  const wkly = meeting?.weeklyMTG

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scopePreview, setScopePreview] = useState(null) // { perLevel: [{level, count}], total }
  // 会議に入ったとき、セッションがすでに進行中でも一度はスタートページを表示する
  const [viewingPrep, setViewingPrep] = useState(true)
  // ファシリテーター ドラフト (会議開始時に session.facilitator として保存)
  const [facilitatorDraft, setFacilitatorDraft] = useState('')
  useEffect(() => {
    // session が読み込まれた / ユーザー名が確定した時点で初期値を反映
    if (session?.facilitator) setFacilitatorDraft(session.facilitator)
    else if (myName) setFacilitatorDraft(myName)
  }, [session?.facilitator, myName])
  // 会議予定時間 ドラフト (分単位)
  const [durationDraft, setDurationDraft] = useState(30)
  useEffect(() => {
    if (session?.duration_minutes) setDurationDraft(session.duration_minutes)
  }, [session?.duration_minutes])
  // 10分前アラートの抑制フラグ (一度通知したら同じセッションでは再通知しない)
  const tenMinAlertedRef = useRef(false)

  // ── セッションを取得（無ければ未開始扱い） ─────────────
  useEffect(() => {
    if (!meeting?.key || !weekStart) return
    let alive = true
    setLoading(true)
    supabase.from('weekly_mtg_sessions')
      .select('*')
      .eq('meeting_key', meeting.key)
      .eq('week_start', weekStart)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setSession(data || null)
        setLoading(false)
      })
    return () => { alive = false }
  }, [meeting?.key, weekStart])

  // ── Realtime 購読 ───────────────────────────────────────
  useEffect(() => {
    if (!session?.id) return
    const ch = supabase
      .channel(`mtg_session_${session.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_mtg_sessions', filter: `id=eq.${session.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            setSession(prev => ({ ...prev, ...payload.new }))
          } else if (payload.eventType === 'DELETE') {
            setSession(null)
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session?.id])

  // ── スコープ内のチーム/部署 + KR/KA件数のプレビュー ─────
  const loadScopePreview = useCallback(async () => {
    if (!wkly || !levels?.length) return

    const levelIds = resolveScopeLevelIds(wkly, levels)
    if (levelIds.length === 0) { setScopePreview({ perLevel: [], total: 0 }); return }
    const scopeLevels = levelIds.map(id => levels.find(l => Number(l.id) === Number(id))).filter(Boolean)

    const { data: objs } = await supabase.from('objectives')
      .select('id, level_id').in('level_id', levelIds)
    const objsByLevel = {}
    ;(objs || []).forEach(o => {
      if (!objsByLevel[o.level_id]) objsByLevel[o.level_id] = []
      objsByLevel[o.level_id].push(o.id)
    })
    const allObjIds = (objs || []).map(o => o.id)

    let perLevel = []
    if (wkly.flow === 'kr') {
      let krs = []
      if (allObjIds.length > 0) {
        const { data } = await supabase.from('key_results')
          .select('id, objective_id').in('objective_id', allObjIds)
        krs = data || []
      }
      perLevel = scopeLevels.map(l => {
        const ids = new Set(objsByLevel[l.id] || [])
        return { level: l, count: krs.filter(k => ids.has(k.objective_id)).length }
      })
    } else if (wkly.flow === 'ka') {
      let kas = []
      if (allObjIds.length > 0) {
        const { data } = await supabase.from('weekly_reports')
          .select('id, objective_id, status, ka_title, kr_id, owner, week_start')
          .in('objective_id', allObjIds).eq('week_start', weekStart)
        // status='done' を除外
        kas = (data || []).filter(k => k.status !== 'done')
      }
      perLevel = scopeLevels.map(l => {
        const ids = new Set(objsByLevel[l.id] || [])
        return { level: l, count: kas.filter(k => ids.has(k.objective_id)).length }
      })
    }

    const total = perLevel.reduce((s, x) => s + x.count, 0)
    setScopePreview({ perLevel, total })
  }, [wkly, levels, weekStart])

  useEffect(() => { loadScopePreview() }, [loadScopePreview])

  // ── アクション ──────────────────────────────────────────
  const startMeeting = async () => {
    tenMinAlertedRef.current = false
    const payload = {
      meeting_key: meeting.key,
      week_start: weekStart,
      step: 1,
      facilitator: facilitatorDraft || myName || null,
      duration_minutes: Number(durationDraft) || 30,
      started_at: new Date().toISOString(),
      finished_at: null,
      current_item_id: null,
      current_team_id: null,
      completed_item_ids: [],
    }
    if (session?.id) {
      const { data } = await supabase.from('weekly_mtg_sessions')
        .update(payload).eq('id', session.id).select().single()
      if (data) setSession(data)
    } else {
      const { data, error } = await supabase.from('weekly_mtg_sessions')
        .insert(payload).select().single()
      if (error) { alert('会議開始に失敗: ' + error.message); return }
      if (data) setSession(data)
    }
  }

  const goToStep = async (step) => {
    if (!session?.id) return
    await supabase.from('weekly_mtg_sessions').update({ step }).eq('id', session.id)
  }

  const finishMeeting = async () => {
    if (!session?.id) return
    if (!window.confirm('会議を終了しますか？')) return
    const lastStepN = stepsForFlow(meeting).slice(-1)[0]?.n ?? 4
    await supabase.from('weekly_mtg_sessions').update({
      step: lastStepN, finished_at: new Date().toISOString(),
    }).eq('id', session.id)
  }

  const resetMeeting = async () => {
    if (!session?.id) return
    if (!window.confirm('会議をリセット（最初からやり直し）しますか？')) return
    await supabase.from('weekly_mtg_sessions').update({
      step: 0, current_item_id: null, current_team_id: null,
      completed_item_ids: [], finished_at: null, started_at: new Date().toISOString(),
    }).eq('id', session.id)
  }

  // ── レンダー ───────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 40, color: T.textMuted, fontSize: 14 }}>読み込み中...</div>
  }

  const step = session?.step ?? 0
  const stepDefs = stepsForFlow(meeting)
  const currentStepDef = stepDefs.find(s => s.n === step)
  const stepKind = currentStepDef?.kind
  const stepNumbers = stepDefs.map(s => s.n)
  const stepIdx = stepNumbers.indexOf(step)
  const prevStepN = stepIdx > 0 ? stepNumbers[stepIdx - 1] : null
  const nextStepN = stepIdx >= 0 && stepIdx < stepNumbers.length - 1 ? stepNumbers[stepIdx + 1] : null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto',
      background: T.bg, color: T.text, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* タイマー (進行中ステップでのみ) */}
      {!viewingPrep && step >= 1 && step <= 3 && session?.started_at && (
        <MeetingTimerBanner
          T={T}
          startedAt={session.started_at}
          durationMinutes={session.duration_minutes || 30}
          tenMinAlertedRef={tenMinAlertedRef}
          meetingTitle={meeting?.title || '会議'}
        />
      )}

      {/* ステップヘッダー（準備画面表示中は出さない） */}
      {!viewingPrep && step >= 1 && (
        <div style={{
          padding: '12px 20px', borderBottom: `1px solid ${T.border}`,
          background: T.bgCard, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 900, margin: '0 auto' }}>
            {stepDefs.map((s, i) => {
              const isActive = step === s.n
              const isDone = step > s.n
              return (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <button onClick={() => session?.id && goToStep(s.n)}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
                      cursor: session?.id ? 'pointer' : 'default', fontFamily: 'inherit',
                      background: isActive ? T.accent : isDone ? `${T.accent}20` : T.bgSection,
                      color: isActive ? '#fff' : isDone ? T.accent : T.textMuted,
                      fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                    <span>{s.icon}</span>
                    <span>{s.n}. {s.label}</span>
                    {isDone && <span style={{ fontSize: 12 }}>✓</span>}
                  </button>
                  {i < stepDefs.length - 1 && (
                    <div style={{ width: 12, height: 2, background: isDone ? T.accent : T.border, flexShrink: 0 }} />
                  )}
                </div>
              )
            })}
          </div>
          {/* ファシリ表示 */}
          {session?.facilitator && (
            <div style={{ maxWidth: 900, margin: '8px auto 0', fontSize: 11, color: T.textMuted, textAlign: 'right' }}>
              ファシリ: <strong style={{ color: T.text }}>{session.facilitator}</strong>
              {session.started_at && <span> ・ 開始 {formatTime(session.started_at)}</span>}
            </div>
          )}
        </div>
      )}

      {/* メインコンテンツ */}
      <div style={{ flex: 1 }}>
        {viewingPrep ? (
          <Step0Preparation
            T={T} meeting={meeting} weekStart={weekStart} myName={myName} members={members}
            levels={levels}
            scope={scopePreview} session={session}
            facilitatorDraft={facilitatorDraft}
            onFacilitatorChange={setFacilitatorDraft}
            durationDraft={durationDraft}
            onDurationChange={setDurationDraft}
            onStart={async () => { await startMeeting(); setViewingPrep(false) }}
            onResume={() => setViewingPrep(false)}
            onReset={resetMeeting}
            onSwitchToList={onSwitchToList}
          />
        ) : (
          <>
            {/* kind に応じて該当コンポーネントをレンダー */}
            {stepKind === 'kr_loop' && (
              <Step1KRLoop
                T={T} meeting={meeting} weekStart={weekStart}
                levels={levels} members={members}
                session={session}
                onUpdateSession={(patch) => supabase.from('weekly_mtg_sessions').update(patch).eq('id', session.id)}
                onAdvanceToStep2={() => nextStepN != null && goToStep(nextStepN)}
                onPrev={() => prevStepN != null ? goToStep(prevStepN) : setViewingPrep(true)}
                onBackToPrep={() => setViewingPrep(true)}
              />
            )}
            {stepKind === 'ka_loop' && (
              <Step1KALoop
                T={T} meeting={meeting} weekStart={weekStart}
                levels={levels} members={members}
                session={session}
                onUpdateSession={(patch) => supabase.from('weekly_mtg_sessions').update(patch).eq('id', session.id)}
                onAdvanceToStep2={() => nextStepN != null && goToStep(nextStepN)}
                onPrev={() => prevStepN != null ? goToStep(prevStepN) : setViewingPrep(true)}
                onBackToPrep={() => setViewingPrep(true)}
              />
            )}
            {stepKind === 'team_summary' && (
              <Step1ManagerSummary
                T={T} meeting={meeting} weekStart={weekStart}
                levels={levels} members={members}
                session={session}
                onUpdateSession={(patch) => supabase.from('weekly_mtg_sessions').update(patch).eq('id', session.id)}
                onAdvanceToStep2={() => nextStepN != null && goToStep(nextStepN)}
                onPrev={() => prevStepN != null ? goToStep(prevStepN) : setViewingPrep(true)}
                onBackToPrep={() => setViewingPrep(true)}
              />
            )}
            {stepKind === 'team_summary_readonly' && (
              <Step1DirectorReview
                T={T} meeting={meeting} weekStart={weekStart}
                levels={levels} members={members}
                onPrev={() => prevStepN != null ? goToStep(prevStepN) : setViewingPrep(true)}
                onNext={() => nextStepN != null && goToStep(nextStepN)}
                onBackToPrep={() => setViewingPrep(true)}
              />
            )}
            {stepKind === 'confirmations' && (
              <Step2Confirmations
                T={T} myName={myName} members={members} withDiscussion={wkly?.withDiscussion}
                onPrev={() => prevStepN != null && goToStep(prevStepN)}
                onNext={() => nextStepN != null && goToStep(nextStepN)}
              />
            )}
            {stepKind === 'next_actions' && (
              <Step3NextActions
                T={T} meeting={meeting} weekStart={weekStart} session={session}
                myName={myName} members={members} levels={levels}
                onPrev={() => prevStepN != null && goToStep(prevStepN)}
                onFinish={finishMeeting}
              />
            )}
            {stepKind === 'done' && (
              <Step4Done
                T={T} session={session} scope={scopePreview} meeting={meeting}
                onReset={async () => { await resetMeeting(); setViewingPrep(true) }}
                onSwitchToList={onSwitchToList}
              />
            )}
            {/* セッション未開始(step=0) なのに viewingPrep=false になった保険：準備に戻す */}
            {(step === 0 || !stepKind) && (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <button onClick={() => setViewingPrep(true)} style={primaryBtn(T)}>
                  会議準備画面に戻る →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── タイマーバナー: 残り時間 + 10分前アラート + 超過警告 ─────────────────
function MeetingTimerBanner({ T, startedAt, durationMinutes, tenMinAlertedRef, meetingTitle }) {
  const [now, setNow] = useState(() => Date.now())
  // 30秒ごとに更新（電池に優しい間隔）
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000)
    return () => clearInterval(id)
  }, [])

  const startMs   = new Date(startedAt).getTime()
  const endMs     = startMs + durationMinutes * 60 * 1000
  const remaining = Math.max(-99999, endMs - now)            // 負なら超過
  const remainingMin = Math.floor(remaining / 60000)
  const elapsedMin   = Math.floor((now - startMs) / 60000)
  const totalMin     = durationMinutes
  const ratio        = Math.max(0, Math.min(1, (now - startMs) / (durationMinutes * 60 * 1000)))

  const isOver  = remaining < 0
  const isTen   = !isOver && remainingMin <= 10
  const isFive  = !isOver && remainingMin <= 5

  // 10分前に1度だけブラウザ通知（許可がある場合）
  useEffect(() => {
    if (!isTen || isOver) return
    if (tenMinAlertedRef.current) return
    tenMinAlertedRef.current = true
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('⏰ 残り10分', { body: `${meetingTitle} の終了予定まで残り 10 分です` })
      }
    } catch {}
  }, [isTen, isOver, meetingTitle, tenMinAlertedRef])

  const bg     = isOver ? `${T.danger}18` : isFive ? `${T.danger}10` : isTen ? `${T.warn}15` : T.bgCard
  const border = isOver ? T.danger        : isFive ? T.danger         : isTen ? T.warn       : T.border
  const accent = isOver ? T.danger        : isFive ? T.danger         : isTen ? T.warn       : T.accent

  const fmt = (mm) => {
    const m = Math.abs(mm)
    return `${Math.floor(m / 60) > 0 ? `${Math.floor(m / 60)}時間` : ''}${m % 60}分`
  }

  return (
    <div style={{
      padding: '8px 16px', background: bg, borderBottom: `2px solid ${border}`, flexShrink: 0,
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14 }}>{isOver ? '🚨' : isTen ? '⚠️' : '⏱'}</span>
        <span style={{ fontSize: 12, color: T.textMuted }}>
          {isOver ? (
            <span style={{ color: T.danger, fontWeight: 700 }}>
              終了予定時刻を <strong>{fmt(remainingMin)}</strong> 過ぎています
            </span>
          ) : isFive ? (
            <span style={{ color: T.danger, fontWeight: 700 }}>残り {fmt(remainingMin)}！ そろそろまとめへ</span>
          ) : isTen ? (
            <span style={{ color: T.warn, fontWeight: 700 }}>残り {fmt(remainingMin)} ・ 10分前です</span>
          ) : (
            <>残り <strong style={{ color: T.text }}>{fmt(remainingMin)}</strong></>
          )}
        </span>
        <span style={{ fontSize: 11, color: T.textMuted }}>
          経過 {elapsedMin}分 / 予定 {totalMin}分
        </span>
        <div style={{ flex: 1, height: 4, background: T.bgSection, borderRadius: 99, overflow: 'hidden', minWidth: 80 }}>
          <div style={{
            height: '100%', width: `${Math.min(100, ratio * 100)}%`,
            background: accent, transition: 'width 0.3s',
          }} />
        </div>
      </div>
    </div>
  )
}

// ─── Step 0: 開始画面 ───────────────────────────────────────────────────────
function Step0Preparation({ T, meeting, weekStart, myName, members = [], levels = [], scope, session, facilitatorDraft, onFacilitatorChange, durationDraft = 30, onDurationChange, onStart, onResume, onReset, onSwitchToList }) {
  const wkly = meeting?.weeklyMTG
  const flowLabel = wkly?.flow === 'ka' ? 'KA重点' : 'KR重点'
  const scopeLabel = wkly?.scope === 'teams-of' ? `${wkly.parentLevelName} 配下のチーム`
    : wkly?.scope === 'all-teams' ? '全チーム合同'
    : wkly?.scope === 'all-departments' ? '全事業部合同' : '未定義'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          padding: '14px 24px', background: T.bgCard, borderRadius: 14,
          border: `1px solid ${T.borderMid}`,
        }}>
          <span style={{ fontSize: 36 }}>{meeting.icon}</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700 }}>{meeting.schedule}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{meeting.title}</div>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: T.textMuted }}>
          📅 対象週: <strong style={{ color: T.text }}>{formatWeekRange(weekStart)}</strong>
        </div>
      </div>

      {/* 観点バッジ */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <Badge T={T} bg={`${T.accent}20`} fg={T.accent}>🧭 ファシリモード</Badge>
        <Badge T={T} bg={`${T.success}20`} fg={T.success}>{flowLabel}</Badge>
        <Badge T={T} bg={T.bgSection} fg={T.textSub}>👥 {scopeLabel}</Badge>
        {wkly?.withDiscussion && <Badge T={T} bg={`${T.warn}20`} fg={T.warn}>💬 課題・依頼セクション有</Badge>}
      </div>

      {/* Notion議事録 案内 */}
      <div style={{
        marginBottom: 20, padding: '14px 18px',
        background: `${T.accent}10`, border: `1px solid ${T.accent}40`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.accent, marginBottom: 4 }}>
          🎙 Notionで録音議事録をとってください
        </div>
        <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.6, marginBottom: 8 }}>
          会議のNotionページを開いて、録音と議事録の作成を開始してください。
          会議の最後に、この議事録からネクストアクションを取り込めます。
        </div>
        <button onClick={() => {
          const url = MEETING_URLS[meeting?.key]
          if (!url) { alert(`${meeting?.title} のNotion URLが設定されていません`); return }
          openNotionUrl(url)
        }} style={{
          padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.accent}80`,
          background: 'transparent', color: T.accent, fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>📝 Notionを開く ↗</button>
      </div>

      {/* 進行アジェンダ */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: 20, marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 700, marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          会議の流れ
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>
          <li><strong style={{ color: T.text }}>{wkly?.flow === 'ka' ? 'KA順送り' : 'KR順送り'}</strong>
            ：{wkly?.flow === 'ka'
              ? '担当が KA ごとに 先週good / 先週more / 今週focus を共有'
              : 'KR担当が current 値 / 天気 / 今週フォーカスを共有'}</li>
          {wkly?.withDiscussion && (
            <li><strong style={{ color: T.text }}>課題・依頼事項</strong>：チーム間の確認・依頼を入力</li>
          )}
          <li><strong style={{ color: T.text }}>確認事項</strong>：会議全体での確認事項を整理</li>
          <li><strong style={{ color: T.text }}>会議終了</strong>：サマリー確認 → クローズ</li>
        </ol>
      </div>

      {/* スコープ内訳 */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: 20, marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 700, marginBottom: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          今回確認する {wkly?.flow === 'ka' ? 'KA' : 'KR'}
        </div>
        {!scope ? (
          <div style={{ fontSize: 12, color: T.textMuted }}>集計中...</div>
        ) : scope.perLevel.length === 0 ? (
          <div style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>
            対象が見つかりません（組織レベルが未設定の可能性）
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {scope.perLevel.map(({ level, count }) => (
                <div key={level.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: T.bgSection, borderRadius: 7,
                  border: `1px solid ${T.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{level.icon || '📁'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{level.name}</span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                    background: count > 0 ? `${T.accent}20` : T.bgSection,
                    color: count > 0 ? T.accent : T.textMuted,
                  }}>
                    {count} 件
                  </span>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 12, padding: '10px 12px', background: T.bgSection, borderRadius: 7,
              fontSize: 12, color: T.textSub, textAlign: 'center',
            }}>
              合計 <strong style={{ color: T.text, fontSize: 14 }}>{scope.total}</strong> 件 を順に確認します
            </div>
          </>
        )}
      </div>

      {/* ファシリテーター選択 */}
      <div style={{
        marginBottom: 18, padding: '12px 16px', background: T.bgCard,
        border: `1px solid ${T.border}`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          本日のファシリテーター
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={facilitatorDraft} avatarUrl={members.find(m => m?.name === facilitatorDraft)?.avatar_url} size={32} />
          <select
            value={facilitatorDraft || ''}
            onChange={e => onFacilitatorChange && onFacilitatorChange(e.target.value)}
            style={{
              flex: 1, background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 7,
              padding: '8px 10px', fontSize: 13, color: avatarColor(facilitatorDraft) || T.text,
              cursor: 'pointer', fontFamily: 'inherit', outline: 'none', fontWeight: 700,
            }}>
            <option value="">-- ファシリ未選択 --</option>
            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6 }}>
          会議開始時に記録されます。会議中に変更したい場合は「リセット」してから選び直してください。
        </div>
      </div>

      {/* 会議予定時間 */}
      <div style={{
        marginBottom: 18, padding: '12px 16px', background: T.bgCard,
        border: `1px solid ${T.border}`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          会議予定時間
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[15, 30, 45, 60, 90].map(m => {
            const active = Number(durationDraft) === m
            return (
              <button key={m}
                onClick={() => onDurationChange && onDurationChange(m)}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: `1px solid ${active ? T.accent : T.borderMid}`,
                  background: active ? `${T.accent}15` : 'transparent',
                  color: active ? T.accent : T.textSub,
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                }}>{m}分</button>
            )
          })}
          <input type="number" min={5} max={300} step={5}
            value={durationDraft || 30}
            onChange={e => onDurationChange && onDurationChange(Number(e.target.value) || 30)}
            style={{
              width: 70, background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 7,
              padding: '6px 10px', color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none',
            }} />
          <span style={{ fontSize: 11, color: T.textMuted }}>分</span>
          {/* ブラウザ通知の許可 */}
          <button onClick={() => {
              if (typeof Notification === 'undefined') { alert('お使いのブラウザは通知に対応していません'); return }
              if (Notification.permission === 'granted') { alert('通知は既に許可されています'); return }
              Notification.requestPermission().then(p => {
                alert(p === 'granted' ? '通知が許可されました（10分前にデスクトップ通知が出ます）' : '通知は許可されませんでした')
              })
            }}
            style={{
              marginLeft: 'auto', padding: '5px 10px', borderRadius: 6,
              border: `1px dashed ${T.borderMid}`, background: 'transparent',
              color: T.textMuted, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            }}>🔔 10分前通知を許可</button>
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6 }}>
          会議開始から {durationDraft}分で「終了予定」。残り10分でアラートが出ます。
        </div>
      </div>

      {/* 開始 / 再開 / リセット / 一覧モード切替 */}
      {(() => {
        const sessStep = session?.step ?? 0
        const inProgress = sessStep > 0 && sessStep < 3
        const isFinished = sessStep === 3

        const bigPrimary = {
          padding: '14px 28px', borderRadius: 10, border: 'none', cursor: scope ? 'pointer' : 'wait',
          background: scope ? T.accent : T.borderMid, color: '#fff',
          fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 8,
        }
        const bigSecondary = {
          padding: '14px 20px', borderRadius: 10, border: `1px solid ${T.borderMid}`,
          background: 'transparent', color: T.textSub, cursor: 'pointer',
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        }

        return (
          <>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {inProgress ? (
                <>
                  <button onClick={onResume} disabled={!scope} style={bigPrimary}>
                    <span style={{ fontSize: 18 }}>▶️</span> 続きから再開
                    <span style={{ fontSize: 11, opacity: 0.85 }}>(Step {sessStep})</span>
                  </button>
                  <button onClick={onReset} style={bigSecondary}>↻ リセットして最初から</button>
                </>
              ) : isFinished ? (
                <button onClick={onStart} disabled={!scope} style={bigPrimary}>
                  <span style={{ fontSize: 18 }}>▶️</span> もう一度開始
                  {myName && <span style={{ fontSize: 11, opacity: 0.85 }}>（ファシリ: {myName}）</span>}
                </button>
              ) : (
                <button onClick={onStart} disabled={!scope} style={bigPrimary}>
                  <span style={{ fontSize: 18 }}>▶️</span> 会議を開始
                  {myName && <span style={{ fontSize: 11, opacity: 0.85 }}>（ファシリ: {myName}）</span>}
                </button>
              )}
              {onSwitchToList && (
                <button onClick={onSwitchToList} style={bigSecondary}>📋 一覧モードで開く</button>
              )}
            </div>

            {/* 状態の補足表示 */}
            <div style={{ marginTop: 14, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>
              {inProgress && session?.facilitator && (
                <>進行中: ファシリ {session.facilitator} ・ 開始 {formatTime(session.started_at)}</>
              )}
              {isFinished && session?.finished_at && (
                <>前回 終了済み: {formatTime(session.finished_at)}</>
              )}
              {sessStep === 0 && session?.facilitator && (
                <>前回ファシリ: {session.facilitator}（{formatTime(session.started_at)}）</>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}

// ─── Step 1: KR順送り（Phase 3-1: ナビ枠 + 現在KR表示） ─────────────────────
function Step1KRLoop({ T, meeting, weekStart, levels, members, session, onUpdateSession, onAdvanceToStep2, onPrev, onBackToPrep }) {
  const wkly = meeting?.weeklyMTG
  const [items, setItems] = useState(null) // [{ level, objective, kr }, ...] in order
  const [loadError, setLoadError] = useState(null)

  // scope 内の KR を順序付きで集める（depth で正確に判定）
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (!weekStart || typeof weekStart !== 'string' || weekStart.length < 7) {
          if (alive) setItems([]); return
        }
        if (!Array.isArray(levels) || levels.length === 0) {
          if (alive) setItems([]); return
        }

        // 1) スコープ内の levels を depth ベースで取得
        const scopeLevelIds = resolveScopeLevelIds(wkly, levels)
        if (scopeLevelIds.length === 0) { if (alive) setItems([]); return }

        // 2) 当四半期の Objective を取得
        const fy = weekStart.slice(0, 4)
        const month = Number(weekStart.slice(5, 7))
        const q = month >= 4 && month <= 6 ? 'q1' : month >= 7 && month <= 9 ? 'q2' : month >= 10 && month <= 12 ? 'q3' : 'q4'
        const periodKeys = [q, `${fy}_${q}`]

        const objsRes = await supabase.from('objectives')
          .select('id, level_id, period, title, owner, parent_objective_id')
          .in('level_id', scopeLevelIds)
          .in('period', periodKeys)
          .range(0, 49999)
        if (objsRes.error) throw objsRes.error
        const objs = objsRes.data || []

        const objIds = objs.map(o => o.id)
        let krs = []
        if (objIds.length > 0) {
          const krsRes = await supabase.from('key_results')
            .select('id, title, target, current, unit, owner, objective_id, lower_is_better')
            .in('objective_id', objIds)
            .range(0, 49999)
          if (krsRes.error) throw krsRes.error
          krs = krsRes.data || []
        }

        // 3) 順序組み立て: level 順 → objective 順 → kr 順
        const byLevel = new Map(scopeLevelIds.map(id => [id, []]))
        objs.forEach(o => {
          if (o && byLevel.has(o.level_id)) byLevel.get(o.level_id).push(o)
        })
        const built = []
        for (const lvlId of scopeLevelIds) {
          const lvl = levels.find(l => Number(l?.id) === Number(lvlId)) || { id: lvlId, name: '?', icon: '🏢' }
          const lvlObjs = (byLevel.get(lvlId) || []).sort((a, b) => a.id - b.id)
          for (const o of lvlObjs) {
            const objKrs = krs.filter(k => Number(k.objective_id) === Number(o.id)).sort((a, b) => a.id - b.id)
            for (const kr of objKrs) {
              built.push({ level: lvl, objective: o, kr })
            }
          }
        }
        if (alive) { setItems(built); setLoadError(null) }
      } catch (e) {
        console.error('Step1KRLoop load error:', e)
        if (alive) { setItems([]); setLoadError(e?.message || String(e)) }
      }
    }
    load()
    return () => { alive = false }
  }, [wkly?.scope, weekStart, levels])

  if (items === null) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>KR一覧を読み込み中...</div>
  }
  if (loadError) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ background: `${T.danger}15`, border: `1px solid ${T.danger}40`, borderRadius: 10, padding: 16, color: T.danger, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>KR一覧の取得でエラー</div>
          <div style={{ fontSize: 11, opacity: 0.85, whiteSpace: 'pre-wrap' }}>{loadError}</div>
        </div>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button onClick={onPrev} style={secondaryBtn(T)}>← 会議準備に戻る</button>
        </div>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🤷</div>
        <div style={{ fontSize: 14, color: T.text, marginBottom: 6 }}>このスコープに今四半期のKRがありません</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20 }}>「次へ」で確認事項ステップへ進めます</div>
        <button onClick={onAdvanceToStep2} style={primaryBtn(T)}>確認事項へ →</button>
      </div>
    )
  }

  // 現在位置: session.current_item_id を items から探す。なければ先頭。
  const completed = new Set(session?.completed_item_ids || [])
  let currentIdx = items.findIndex(it => Number(it.kr?.id) === Number(session?.current_item_id))
  if (currentIdx === -1 || currentIdx >= items.length) currentIdx = 0
  const current = items[currentIdx]
  if (!current || !current.kr) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: T.danger, fontSize: 13 }}>
        現在のKRが見つかりません。
        <button onClick={onPrev} style={{ ...secondaryBtn(T), marginLeft: 12 }}>← 会議準備に戻る</button>
      </div>
    )
  }
  const currentKR = current.kr
  const currentObj = current.objective || {}
  const currentLevel = current.level || {}

  const goNext = async () => {
    const nextCompleted = [...new Set([...completed, currentKR.id])]
    if (currentIdx + 1 < items.length) {
      const next = items[currentIdx + 1]
      await onUpdateSession({ current_item_id: next.kr.id, completed_item_ids: nextCompleted })
    } else {
      await onUpdateSession({ current_item_id: null, completed_item_ids: nextCompleted, step: 2 })
    }
  }
  const goBack = async () => {
    if (currentIdx > 0) {
      const prev = items[currentIdx - 1]
      await onUpdateSession({ current_item_id: prev.kr.id })
    } else {
      onPrev() // Step 0 に戻る
    }
  }
  const skipCurrent = async () => {
    if (currentIdx + 1 < items.length) {
      const next = items[currentIdx + 1]
      await onUpdateSession({ current_item_id: next.kr.id })
    } else {
      await onUpdateSession({ current_item_id: null, step: 2 })
    }
  }
  const jumpTo = async (idx) => {
    if (items[idx]?.kr?.id) {
      await onUpdateSession({ current_item_id: items[idx].kr.id })
    }
  }

  // KREditCard に渡す期間ラベル（年度プレフィックスを除去）
  const periodLabel = (currentObj?.period || '').toString().split('_').pop().toUpperCase()

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      {/* トップアクション (準備に戻る) */}
      {onBackToPrep && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={onBackToPrep} style={{
            padding: '6px 12px', borderRadius: 7, border: `1px solid ${T.borderMid}`,
            background: 'transparent', color: T.textSub, cursor: 'pointer',
            fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
          }}>↩ 会議準備に戻る</button>
        </div>
      )}

      {/* 進行ナビ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        padding: '10px 14px', background: T.bgCard, borderRadius: 10, border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 700 }}>進捗</div>
        <div style={{ fontSize: 14, color: T.text, fontWeight: 800 }}>
          {currentIdx + 1} <span style={{ color: T.textMuted, fontSize: 11 }}>/ {items.length}</span>
        </div>
        <div style={{ flex: 1, height: 6, background: T.bgSection, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${((currentIdx) / items.length) * 100}%`, background: T.accent, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          完了 <strong style={{ color: T.success }}>{completed.size}</strong> / 残 <strong style={{ color: T.text }}>{items.length - currentIdx - 1}</strong>
        </div>
      </div>

      {/* 現在のKR カード（Phase 3-2: インライン編集 + kr_weekly_reviews 編集） */}
      <KREditCard
        key={currentKR.id /* KR切替時に内部state再初期化 */}
        T={T} kr={currentKR} objective={currentObj} level={currentLevel}
        weekStart={weekStart} members={members} periodLabel={periodLabel}
      />

      {/* 次へ/前へ/スキップ */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={goBack} style={secondaryBtn(T)}>
          ← {currentIdx === 0 ? '会議準備に戻る' : '前のKR'}
        </button>
        <button onClick={skipCurrent} style={secondaryBtn(T)}>スキップ</button>
        <div style={{ flex: 1 }} />
        <button onClick={goNext} style={primaryBtn(T)}>
          {currentIdx + 1 < items.length ? '次のKR →' : '確認事項へ →'}
        </button>
      </div>

      {/* 進捗ジャンプリスト */}
      <div style={{
        marginTop: 18, padding: '12px 16px', background: T.bgCard,
        border: `1px solid ${T.border}`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          KR 一覧（クリックでジャンプ）
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map((it, i) => {
            const isDone = completed.has(it.kr.id)
            const isActive = i === currentIdx
            return (
              <button key={it.kr.id} onClick={() => jumpTo(i)} title={`${it.level?.name} / ${it.kr.title}`}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                  background: isActive ? T.accent : isDone ? `${T.success}25` : T.bgSection,
                  color: isActive ? '#fff' : isDone ? T.success : T.textSub,
                  fontWeight: 700,
                }}>
                {isDone && '✓ '}{i + 1}. {it.level?.name?.slice(0, 8)}{it.level?.name?.length > 8 ? '…' : ''}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── KA ステータス定義 ─────────────────────────────────────────────────────
const KA_STATUS_CFG = {
  focus:  { label: '🎯 注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)',  border: 'rgba(77,159,255,0.3)' },
  good:   { label: '✅ Good', color: '#00d68f', bg: 'rgba(0,214,143,0.1)',    border: 'rgba(0,214,143,0.3)' },
  more:   { label: '🔺 More', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)',  border: 'rgba(255,107,107,0.3)' },
  normal: { label: '未分類',  color: '#606880', bg: 'rgba(128,128,128,0.08)', border: 'rgba(128,128,128,0.2)' },
  done:   { label: '✓ 完了',  color: '#a0a8be', bg: 'rgba(160,168,190,0.08)', border: 'rgba(160,168,190,0.2)' },
}
const KA_STATUS_ORDER = ['normal','focus','good','more','done']

// ─── Step 1: KA順送り（Phase 4） ───────────────────────────────────────────
function Step1KALoop({ T, meeting, weekStart, levels, members, session, onUpdateSession, onAdvanceToStep2, onPrev, onBackToPrep }) {
  const wkly = meeting?.weeklyMTG
  const [items, setItems] = useState(null) // [{ team, objective, kr, ka }]
  const [loadError, setLoadError] = useState(null)

  // scope内のチーム配下の KA を順序付きで取得（当週・status!=done）
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (!weekStart || typeof weekStart !== 'string' || weekStart.length < 7) {
          if (alive) setItems([]); return
        }
        if (!Array.isArray(levels) || levels.length === 0) {
          if (alive) setItems([]); return
        }
        const scopeLevelIds = resolveScopeLevelIds(wkly, levels)
        if (scopeLevelIds.length === 0) { if (alive) setItems([]); return }

        // Objective を取得
        const objsRes = await supabase.from('objectives')
          .select('id, level_id, period, title, owner')
          .in('level_id', scopeLevelIds)
          .range(0, 49999)
        if (objsRes.error) throw objsRes.error
        const objs = objsRes.data || []
        const allObjIds = objs.map(o => o.id)
        if (allObjIds.length === 0) { if (alive) setItems([]); return }

        // 当週のKA (weekly_reports)
        const kasRes = await supabase.from('weekly_reports')
          .select('*')
          .in('objective_id', allObjIds)
          .eq('week_start', weekStart)
          .neq('status', 'done')
          .range(0, 49999)
        if (kasRes.error) throw kasRes.error
        const kas = kasRes.data || []

        // KR を取得（コンテキスト表示用）
        const krsRes = await supabase.from('key_results')
          .select('id, title, objective_id')
          .in('objective_id', allObjIds)
          .range(0, 49999)
        if (krsRes.error) throw krsRes.error
        const krs = krsRes.data || []

        // 順序組み立て: チーム順 → Objective順 → KA(sort_order)順
        const built = []
        for (const lvlId of scopeLevelIds) {
          const team = levels.find(l => Number(l?.id) === Number(lvlId)) || { id: lvlId, name: '?', icon: '🏢' }
          const teamObjs = objs.filter(o => Number(o.level_id) === Number(lvlId)).sort((a, b) => a.id - b.id)
          for (const o of teamObjs) {
            const objKas = kas
              .filter(k => Number(k.objective_id) === Number(o.id))
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
            for (const ka of objKas) {
              const kr = krs.find(k => Number(k.id) === Number(ka.kr_id)) || null
              built.push({ team, objective: o, kr, ka })
            }
          }
        }
        if (alive) { setItems(built); setLoadError(null) }
      } catch (e) {
        console.error('Step1KALoop load error:', e)
        if (alive) { setItems([]); setLoadError(e?.message || String(e)) }
      }
    }
    load()
    return () => { alive = false }
  }, [wkly?.scope, wkly?.parentLevelName, weekStart, levels])

  if (items === null) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>KA一覧を読み込み中...</div>
  }
  if (loadError) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ background: `${T.danger}15`, border: `1px solid ${T.danger}40`, borderRadius: 10, padding: 16, color: T.danger, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>KA一覧の取得でエラー</div>
          <div style={{ fontSize: 11, opacity: 0.85, whiteSpace: 'pre-wrap' }}>{loadError}</div>
        </div>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button onClick={onPrev} style={secondaryBtn(T)}>← 会議準備に戻る</button>
        </div>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🤷</div>
        <div style={{ fontSize: 14, color: T.text, marginBottom: 6 }}>このスコープに今週のKAがありません</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20 }}>「次へ」で確認事項ステップへ進めます</div>
        <button onClick={onAdvanceToStep2} style={primaryBtn(T)}>確認事項へ →</button>
      </div>
    )
  }

  const completed = new Set(session?.completed_item_ids || [])
  let currentIdx = items.findIndex(it => Number(it.ka?.id) === Number(session?.current_item_id))
  if (currentIdx === -1 || currentIdx >= items.length) currentIdx = 0
  const current = items[currentIdx]
  if (!current || !current.ka) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: T.danger, fontSize: 13 }}>
        現在のKAが見つかりません。
        <button onClick={onPrev} style={{ ...secondaryBtn(T), marginLeft: 12 }}>← 会議準備に戻る</button>
      </div>
    )
  }

  const goNext = async () => {
    const nextCompleted = [...new Set([...completed, current.ka.id])]
    if (currentIdx + 1 < items.length) {
      const next = items[currentIdx + 1]
      await onUpdateSession({ current_item_id: next.ka.id, completed_item_ids: nextCompleted })
    } else {
      await onUpdateSession({ current_item_id: null, completed_item_ids: nextCompleted, step: 2 })
    }
  }
  const goBack = async () => {
    if (currentIdx > 0) {
      const prev = items[currentIdx - 1]
      await onUpdateSession({ current_item_id: prev.ka.id })
    } else {
      onPrev()
    }
  }
  const skipCurrent = async () => {
    if (currentIdx + 1 < items.length) {
      const next = items[currentIdx + 1]
      await onUpdateSession({ current_item_id: next.ka.id })
    } else {
      await onUpdateSession({ current_item_id: null, step: 2 })
    }
  }
  const jumpTo = async (idx) => {
    if (items[idx]?.ka?.id) {
      await onUpdateSession({ current_item_id: items[idx].ka.id })
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      {onBackToPrep && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={onBackToPrep} style={{
            padding: '6px 12px', borderRadius: 7, border: `1px solid ${T.borderMid}`,
            background: 'transparent', color: T.textSub, cursor: 'pointer',
            fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
          }}>↩ 会議準備に戻る</button>
        </div>
      )}

      {/* 進行ナビ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        padding: '10px 14px', background: T.bgCard, borderRadius: 10, border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 700 }}>進捗</div>
        <div style={{ fontSize: 14, color: T.text, fontWeight: 800 }}>
          {currentIdx + 1} <span style={{ color: T.textMuted, fontSize: 11 }}>/ {items.length}</span>
        </div>
        <div style={{ flex: 1, height: 6, background: T.bgSection, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(completed.size / items.length) * 100}%`, background: T.success, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          完了 <strong style={{ color: T.success }}>{completed.size}</strong> / 残 <strong style={{ color: T.text }}>{Math.max(0, items.length - currentIdx - 1)}</strong>
        </div>
      </div>

      {/* KA編集カード */}
      <KAEditCard
        key={current.ka.id}
        T={T} ka={current.ka} team={current.team} objective={current.objective} kr={current.kr}
        members={members} weekStart={weekStart}
      />

      {/* 次へ/前へ/スキップ */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={goBack} style={secondaryBtn(T)}>
          ← {currentIdx === 0 ? '会議準備に戻る' : '前のKA'}
        </button>
        <button onClick={skipCurrent} style={secondaryBtn(T)}>スキップ</button>
        <div style={{ flex: 1 }} />
        <button onClick={goNext} style={primaryBtn(T)}>
          {currentIdx + 1 < items.length ? '次のKA →' : '確認事項へ →'}
        </button>
      </div>

      {/* チーム別 ジャンプリスト */}
      <div style={{
        marginTop: 18, padding: '12px 16px', background: T.bgCard,
        border: `1px solid ${T.border}`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          KA 一覧（クリックでジャンプ・チーム別）
        </div>
        {(() => {
          // チーム単位でグループ化
          const byTeam = new Map()
          items.forEach((it, i) => {
            const tid = it.team?.id ?? '0'
            if (!byTeam.has(tid)) byTeam.set(tid, { team: it.team, items: [] })
            byTeam.get(tid).items.push({ idx: i, item: it })
          })
          return [...byTeam.values()].map(g => (
            <div key={g.team?.id ?? '0'} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: T.textSub, fontWeight: 700, marginBottom: 4 }}>
                {g.team?.icon || '🏢'} {g.team?.name || '?'} <span style={{ color: T.textMuted, fontWeight: 500 }}>（{g.items.length}件）</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.items.map(({ idx, item }) => {
                  const isDone = completed.has(item.ka.id)
                  const isActive = idx === currentIdx
                  return (
                    <button key={item.ka.id} onClick={() => jumpTo(idx)}
                      title={item.ka.ka_title || '(無題)'}
                      style={{
                        padding: '3px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10,
                        background: isActive ? T.accent : isDone ? `${T.success}25` : T.bgSection,
                        color: isActive ? '#fff' : isDone ? T.success : T.textSub,
                        fontWeight: 700, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                      {isDone && '✓ '}{(item.ka.ka_title || '(無題)').slice(0, 14)}
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        })()}
      </div>
    </div>
  )
}

// ─── 過去のマネージャー定例サマリー（ディレクター確認会議の準備画面用） ─────
// 直前回のマネージャー定例で記録されたチーム別 Good/More/Focus を read-only 表示。
// データソースは Step1ManagerSummary と同じ weekly_reports (先週分)。
// ─── Step 1 (ディレクター確認会議): KRサマリー閲覧 (read-only) ────────────────
// マネージャー会議で書かれた今週分のチームサマリーを閲覧。編集はしない。
function Step1DirectorReview({ T, meeting, weekStart, levels, members, onPrev, onNext, onBackToPrep }) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      {onBackToPrep && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={onBackToPrep} style={{
            padding: '6px 12px', borderRadius: 7, border: `1px solid ${T.borderMid}`,
            background: 'transparent', color: T.textSub, cursor: 'pointer',
            fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
          }}>↩ 会議準備に戻る</button>
        </div>
      )}

      <div style={{
        marginBottom: 16, padding: '14px 18px',
        background: `${T.accent}10`, border: `1px solid ${T.accent}40`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.accent, marginBottom: 4 }}>
          📊 マネージャー会議で記録されたチーム別 KRサマリーを確認
        </div>
        <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
          各チームのマネージャーが書き込んだ今週分の Good/More/Focus を読み、
          ディレクター視点で気になる点を <strong>確認事項</strong> や <strong>ネクストアクション</strong> として
          次のステップで記録してください。
        </div>
      </div>

      {/* 同じ週 (= weekStart) の team_weekly_summary を直接読む */}
      <DirectorSummaryList T={T} weekStart={weekStart} levels={levels} members={members} />

      <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onPrev} style={secondaryBtn(T)}>← 会議準備に戻る</button>
        <div style={{ flex: 1 }} />
        <button onClick={onNext} style={primaryBtn(T)}>確認事項へ →</button>
      </div>
    </div>
  )
}

// 今週分の team_weekly_summary を全チーム読み込み、read-only で並べる
function DirectorSummaryList({ T, weekStart, levels, members }) {
  const [teams, setTeams] = useState(null)
  const [activeTeamId, setActiveTeamId] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (!weekStart || !Array.isArray(levels) || levels.length === 0) {
          if (alive) setTeams([]); return
        }
        // マネージャー会議のスコープ (= all-teams = depth=2)
        const managerMtg = getMeeting('manager')
        const scopeLevelIds = resolveScopeLevelIds(managerMtg?.weeklyMTG, levels)
        if (scopeLevelIds.length === 0) { if (alive) setTeams([]); return }

        // 今週分の team_weekly_summary
        const summariesRes = await supabase.from('team_weekly_summary')
          .select('level_id, good, more, focus')
          .in('level_id', scopeLevelIds)
          .eq('week_start', weekStart)
          .range(0, 49999)
        const summaryMap = new Map((summariesRes.data || []).map(s => [Number(s.level_id), s]))

        // 補助: 今週のKA件数 + 担当アバター
        const objsRes = await supabase.from('objectives')
          .select('id, level_id').in('level_id', scopeLevelIds).range(0, 49999)
        const objs = objsRes.data || []
        const objIds = objs.map(o => o.id)
        const objToLevel = new Map(objs.map(o => [Number(o.id), Number(o.level_id)]))
        let kas = []
        if (objIds.length > 0) {
          const kasRes = await supabase.from('weekly_reports')
            .select('id, owner, status, objective_id')
            .in('objective_id', objIds)
            .eq('week_start', weekStart)
            .neq('status', 'done')
            .range(0, 49999)
          kas = kasRes.data || []
        }
        const kaCountByLevel = new Map(scopeLevelIds.map(id => [Number(id), 0]))
        const ownerSetByLevel = new Map(scopeLevelIds.map(id => [Number(id), new Set()]))
        for (const ka of kas) {
          const lvlId = objToLevel.get(Number(ka.objective_id))
          if (!lvlId) continue
          kaCountByLevel.set(Number(lvlId), (kaCountByLevel.get(Number(lvlId)) || 0) + 1)
          if (ka.owner) ownerSetByLevel.get(Number(lvlId)).add(ka.owner)
        }

        // KR + kr_weekly_reviews を取得 (チーム単位で並べる用)
        let krs = []
        let reviews = []
        if (objIds.length > 0) {
          const krsRes = await supabase.from('key_results')
            .select('id, title, objective_id, target, current, unit, lower_is_better, owner')
            .in('objective_id', objIds)
            .range(0, 49999)
          krs = krsRes.data || []
          const krIds = krs.map(k => k.id)
          if (krIds.length > 0) {
            const revRes = await supabase.from('kr_weekly_reviews')
              .select('kr_id, weather, good, more, focus')
              .in('kr_id', krIds)
              .eq('week_start', weekStart)
              .range(0, 49999)
            reviews = revRes.data || []
          }
        }
        const reviewByKr = new Map(reviews.map(r => [Number(r.kr_id), r]))
        const krsByLevel = new Map(scopeLevelIds.map(id => [Number(id), []]))
        for (const kr of krs) {
          const lvlId = objToLevel.get(Number(kr.objective_id))
          if (!lvlId) continue
          const list = krsByLevel.get(Number(lvlId))
          if (!list) continue
          const rv = reviewByKr.get(Number(kr.id))
          list.push({
            id: kr.id,
            title: kr.title,
            target: kr.target,
            current: kr.current,
            unit: kr.unit,
            lower_is_better: kr.lower_is_better,
            owner: kr.owner,
            weather: rv?.weather || 0,
            good:  (rv?.good  || '').trim(),
            more:  (rv?.more  || '').trim(),
            focus: (rv?.focus || '').trim(),
          })
        }

        const built = scopeLevelIds.map(id => {
          const team = levels.find(l => Number(l.id) === Number(id)) || { id, name: '?', icon: '🤝' }
          const sum = summaryMap.get(Number(id))
          const teamKrs = (krsByLevel.get(Number(id)) || []).sort((a, b) => a.id - b.id)
          return {
            team,
            kaCount: kaCountByLevel.get(Number(id)) || 0,
            owners: [...(ownerSetByLevel.get(Number(id)) || [])],
            good:  (sum?.good || '').trim(),
            more:  (sum?.more || '').trim(),
            focus: (sum?.focus || '').trim(),
            hasSummary: !!(sum && (sum.good || sum.more || sum.focus)),
            krs: teamKrs,
          }
        })
        if (alive) setTeams(built)
      } catch (e) {
        console.error('DirectorSummaryList load error:', e)
        if (alive) setTeams([])
      }
    }
    load()
    return () => { alive = false }
  }, [weekStart, levels])

  if (teams === null) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>読み込み中…</div>
  }
  if (teams.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
        対象チームが見つかりません。
      </div>
    )
  }

  const writtenTeams = teams.filter(t => t.hasSummary).length
  const visibleTeams = activeTeamId == null ? teams : teams.filter(t => Number(t.team?.id) === Number(activeTeamId))

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 11, color: T.textMuted }}>
        記入済 <strong style={{ color: T.text }}>{writtenTeams}</strong> / {teams.length} チーム
      </div>

      {/* チームフィルタ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <button onClick={() => setActiveTeamId(null)}
          style={chipStyle(T, activeTeamId == null)}>
          全チーム ({teams.length})
        </button>
        {teams.map(t => (
          <button key={t.team.id} onClick={() => setActiveTeamId(t.team.id)}
            style={chipStyle(T, Number(activeTeamId) === Number(t.team.id))}>
            {t.team.icon || '🤝'} {t.team.name}
            {t.hasSummary && <span style={{ marginLeft: 4 }}>✓</span>}
          </button>
        ))}
      </div>

      {/* チームカード一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visibleTeams.map(t => (
          <ReadOnlyTeamSummaryCard key={t.team.id} T={T} teamData={t} members={members} weekStart={weekStart} />
        ))}
      </div>
    </div>
  )
}

function PreviousManagerSummary({ T, weekStart, levels, members }) {
  const [teams, setTeams] = useState(null)
  const [expanded, setExpanded] = useState(true)
  const [activeTeamId, setActiveTeamId] = useState(null) // null = 全チーム表示

  // 「先週」の月曜日。今週の weekStart から -7日。
  const lastMonday = useMemo(() => {
    if (!weekStart) return null
    const [y, m, d] = weekStart.split('-').map(Number)
    const prev = new Date(Date.UTC(y, m - 1, d - 7))
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,'0')}-${String(prev.getUTCDate()).padStart(2,'0')}`
  }, [weekStart])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (!lastMonday || !Array.isArray(levels) || levels.length === 0) {
          if (alive) setTeams([]); return
        }
        // マネージャー定例のスコープ (= all-teams = depth=2)
        const managerMtg = getMeeting('manager')
        const wkly = managerMtg?.weeklyMTG
        const scopeLevelIds = resolveScopeLevelIds(wkly, levels)
        if (scopeLevelIds.length === 0) { if (alive) setTeams([]); return }

        // 先週の team_weekly_summary を取得 (チームサマリー本体)
        const summariesRes = await supabase.from('team_weekly_summary')
          .select('level_id, good, more, focus')
          .in('level_id', scopeLevelIds)
          .eq('week_start', lastMonday)
          .range(0, 49999)
        const summaryMap = new Map((summariesRes.data || []).map(s => [Number(s.level_id), s]))

        // 参考: 先週のKA件数 (補助情報として表示)
        const objsRes = await supabase.from('objectives')
          .select('id, level_id').in('level_id', scopeLevelIds).range(0, 49999)
        const objs = objsRes.data || []
        const objIds = objs.map(o => o.id)
        const objToLevel = new Map(objs.map(o => [Number(o.id), Number(o.level_id)]))
        let kas = []
        if (objIds.length > 0) {
          const kasRes = await supabase.from('weekly_reports')
            .select('id, owner, status, objective_id')
            .in('objective_id', objIds)
            .eq('week_start', lastMonday)
            .neq('status', 'done')
            .range(0, 49999)
          kas = kasRes.data || []
        }
        const kaCountByLevel = new Map(scopeLevelIds.map(id => [Number(id), 0]))
        const ownerSetByLevel = new Map(scopeLevelIds.map(id => [Number(id), new Set()]))
        for (const ka of kas) {
          const lvlId = objToLevel.get(Number(ka.objective_id))
          if (!lvlId) continue
          kaCountByLevel.set(Number(lvlId), (kaCountByLevel.get(Number(lvlId)) || 0) + 1)
          if (ka.owner) ownerSetByLevel.get(Number(lvlId)).add(ka.owner)
        }

        const built = scopeLevelIds.map(id => {
          const team = levels.find(l => Number(l.id) === Number(id)) || { id, name: '?', icon: '🏢' }
          const sum = summaryMap.get(Number(id))
          return {
            team,
            kaCount: kaCountByLevel.get(Number(id)) || 0,
            owners: [...(ownerSetByLevel.get(Number(id)) || [])],
            good:  (sum?.good || '').trim(),
            more:  (sum?.more || '').trim(),
            focus: (sum?.focus || '').trim(),
            hasSummary: !!(sum && (sum.good || sum.more || sum.focus)),
          }
        }).filter(t => t.hasSummary || t.kaCount > 0) // 何もないチームは省略
        if (alive) setTeams(built)
      } catch (e) {
        console.error('PreviousManagerSummary load error:', e)
        if (alive) setTeams([])
      }
    }
    load()
    return () => { alive = false }
  }, [lastMonday, levels])

  if (!lastMonday) return null
  if (teams === null) {
    return (
      <div style={{ marginBottom: 18, padding: '10px 14px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, color: T.textMuted }}>
        先週のマネージャー定例サマリーを読み込み中...
      </div>
    )
  }

  const lastLabel = formatWeekRange2(lastMonday)
  const writtenTeams = teams.filter(t => t.hasSummary).length

  // 表示するチーム
  const visibleTeams = activeTeamId == null ? teams : teams.filter(t => Number(t.team?.id) === Number(activeTeamId))

  return (
    <div style={{ marginBottom: 18, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* ヘッダー */}
      <button onClick={() => setExpanded(e => !e)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'left',
      }}>
        <span style={{ fontSize: 16 }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>📊 先週のマネージャー定例サマリー</span>
        <span style={{ fontSize: 11, color: T.textMuted }}>（{lastLabel}）</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: T.textMuted }}>
          記入済 <strong style={{ color: T.text }}>{writtenTeams}</strong> / {teams.length} チーム
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${T.border}` }}>
          {teams.length === 0 ? (
            <div style={{ padding: '16px 4px', fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>
              先週はマネージャー定例の記録がありません。
            </div>
          ) : (
            <>
              {/* チームフィルタ */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 0' }}>
                <button onClick={() => setActiveTeamId(null)}
                  style={chipStyle(T, activeTeamId == null)}>
                  全チーム ({teams.length})
                </button>
                {teams.map(t => (
                  <button key={t.team.id} onClick={() => setActiveTeamId(t.team.id)}
                    style={chipStyle(T, Number(activeTeamId) === Number(t.team.id))}>
                    {t.team.icon || '🤝'} {t.team.name}
                    {t.hasSummary && <span style={{ marginLeft: 4 }}>✓</span>}
                  </button>
                ))}
              </div>

              {/* チームカード一覧 (read-only) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {visibleTeams.map(t => (
                  <ReadOnlyTeamSummaryCard key={t.team.id} T={T} teamData={t} members={members} weekStart={lastMonday} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function chipStyle(T, active) {
  return {
    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 11, fontWeight: 700,
    background: active ? T.accent : T.bgSection,
    color: active ? '#fff' : T.textSub,
  }
}

function ReadOnlyTeamSummaryCard({ T, teamData, members, weekStart }) {
  const { team, kaCount, owners, good, more, focus, hasSummary, krs = [] } = teamData
  const [krsExpanded, setKrsExpanded] = useState(true) // KR詳細の展開状態 (デフォルト展開)
  const [expandedKR, setExpandedKR] = useState(null)   // 個別KRの展開
  const prevWeek = weekStart ? getPrevMondayStr(weekStart) : null
  const prevLabel = prevWeek ? formatWeekRange2(prevWeek) : ''
  const thisLabel = weekStart ? formatWeekRange2(weekStart) : ''

  // チームの達成率平均 (target>0 のKRを対象に進捗% 平均を取る)
  const validKrs = krs.filter(k => Number(k.target ?? 0) > 0)
  let avgProgress = null
  if (validKrs.length > 0) {
    const total = validKrs.reduce((s, k) => {
      const target = Number(k.target ?? 0)
      const current = Number(k.current ?? 0)
      const raw = k.lower_is_better
        ? Math.max(0, ((target * 2 - current) / target) * 100)
        : (current / target) * 100
      return s + Math.min(150, Math.max(0, raw))
    }, 0)
    avgProgress = Math.round(total / validKrs.length)
  }
  const avgColor = avgProgress == null ? T.textMuted
    : avgProgress >= 100 ? T.success
    : avgProgress >= 60  ? T.accent
    : T.danger

  return (
    <div style={{ background: T.bgSection, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 18 }}>{team?.icon || '🤝'}</span>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{team?.name}</div>
        {kaCount > 0 && (
          <span style={{ padding: '2px 8px', borderRadius: 99, background: `${T.accent}18`, color: T.accent, fontWeight: 700, fontSize: 10 }}>
            KA {kaCount}件
          </span>
        )}
        {krs.length > 0 && (
          <span style={{ padding: '2px 8px', borderRadius: 99, background: `${T.success}18`, color: T.success, fontWeight: 700, fontSize: 10 }}>
            KR {krs.length}件
          </span>
        )}

        {/* 右上: 担当アバター + 達成率リング (縦並び) */}
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {owners.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {owners.slice(0, 5).map(name => {
                const m = members.find(x => x?.name === name)
                return <Avatar key={name} name={name} avatarUrl={m?.avatar_url} size={18} />
              })}
              {owners.length > 5 && <span style={{ fontSize: 10, color: T.textMuted }}>+{owners.length - 5}</span>}
            </div>
          )}
          {avgProgress != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ProgressRing value={avgProgress} color={avgColor} size={50} bg={T.bgCard} />
              <div style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, lineHeight: 1.3, textAlign: 'right' }}>
                KR達成率<br/>平均 ({validKrs.length}件)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* チーム全体まとめ (team_weekly_summary) */}
      {!hasSummary ? (
        <div style={{ fontSize: 11, color: T.textFaint, fontStyle: 'italic', padding: '4px 0', marginBottom: krs.length > 0 ? 12 : 0 }}>
          このチームはまだサマリーが記入されていません。
        </div>
      ) : (
        <div style={{ marginBottom: krs.length > 0 ? 12 : 0 }}>
          <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            📝 チーム全体まとめ
          </div>
          <ReadOnlyBlock T={T} icon="✅" label="Good" sub={prevLabel ? `先週 ${prevLabel}` : '先週'} accent={T.success} text={good} />
          <ReadOnlyBlock T={T} icon="🔺" label="More" sub={prevLabel ? `先週 ${prevLabel}` : '先週'} accent={T.danger} text={more} />
          <ReadOnlyBlock T={T} icon="🎯" label="Focus" sub={thisLabel ? `今週 ${thisLabel}` : '今週'} accent={T.accent} text={focus} lastBlock />
        </div>
      )}

      {/* KR詳細セクション (折りたたみ) */}
      {krs.length > 0 && (
        <div>
          <button onClick={() => setKrsExpanded(e => !e)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '4px 0', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <span style={{ fontSize: 13 }}>{krsExpanded ? '▾' : '▸'}</span>
            📊 KR 詳細 ({krs.length}件)
          </button>
          {krsExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {krs.map(kr => (
                <KRReadOnlyRow key={kr.id} T={T} kr={kr}
                  expanded={expandedKR === kr.id}
                  onToggle={() => setExpandedKR(p => p === kr.id ? null : kr.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 円グラフ風の進捗リング
function ProgressRing({ value, color, size = 50, bg = 'rgba(0,0,0,0.06)' }) {
  const v = Math.max(0, Math.min(150, value || 0))
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * Math.min(100, v) / 100
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.3} fontWeight="800" fill={color}>{v}%</text>
    </svg>
  )
}

// 1KRを 1行で表示。クリックで Good/More/Focus を展開。
function KRReadOnlyRow({ T, kr, expanded, onToggle }) {
  const target  = Number(kr.target  ?? 0)
  const current = Number(kr.current ?? 0)
  const progress = target > 0
    ? Math.min(150, Math.round(kr.lower_is_better
        ? Math.max(0, ((target * 2 - current) / target) * 100)
        : (current / target) * 100))
    : 0
  const progressColor = progress >= 100 ? T.success : progress >= 60 ? T.accent : T.danger
  const weatherIcons = { 1: '☀️', 2: '🌤', 3: '☁️', 4: '🌧' }
  const hasReview = !!(kr.good || kr.more || kr.focus || kr.weather)

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden' }}>
      <button onClick={onToggle}
        title={hasReview ? 'クリックで Good/More/Focus を展開' : 'レビュー未記入'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}>
        <span style={{ fontSize: 11, color: T.textFaint }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {kr.title}
        </span>
        {kr.weather > 0 && <span style={{ fontSize: 14 }}>{weatherIcons[kr.weather]}</span>}
        <span style={{ fontSize: 11, color: T.textMuted }}>
          {current}{kr.unit} / {target}{kr.unit}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: progressColor, minWidth: 36, textAlign: 'right' }}>
          {progress}%
        </span>
      </button>
      {/* 進捗バー (常時表示) */}
      <div style={{ height: 3, background: T.bgSection, marginLeft: 28, marginRight: 12, marginBottom: expanded ? 0 : 8 }}>
        <div style={{ height: '100%', width: `${Math.min(100, progress)}%`, background: progressColor }} />
      </div>
      {expanded && (
        <div style={{ padding: '8px 12px 10px 28px', borderTop: `1px solid ${T.border}` }}>
          {!hasReview ? (
            <div style={{ fontSize: 11, color: T.textFaint, fontStyle: 'italic' }}>このKRはまだレビューが記入されていません。</div>
          ) : (
            <>
              <ReadOnlyBlock T={T} icon="✅" label="Good" sub="" accent={T.success} text={kr.good} />
              <ReadOnlyBlock T={T} icon="🔺" label="More" sub="" accent={T.danger}  text={kr.more} />
              <ReadOnlyBlock T={T} icon="🎯" label="Focus" sub="" accent={T.accent} text={kr.focus} lastBlock />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ReadOnlyBlock({ T, icon, label, sub, accent, text, lastBlock }) {
  if (!text) return null
  return (
    <div style={{ marginBottom: lastBlock ? 0 : 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>{label}</span>
        <span style={{ fontSize: 10, color: T.textMuted }}>{sub}</span>
      </div>
      <div style={{
        padding: '8px 12px', background: T.bgCard, borderRadius: 6,
        borderLeft: `3px solid ${accent}`, fontSize: 12, color: T.textSub, lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>{text}</div>
    </div>
  )
}

// ─── Step 1 (マネージャー定例): チーム別 Good/More/Focus サマリー ─────────────
// 各チームのマネージャーが順番にチーム成果(Good)/課題(More)/注力(Focus) を共有。
// 横断連携の確認は次の Step 2 (確認事項) で扱う。
function Step1ManagerSummary({ T, meeting, weekStart, levels, members, session, onUpdateSession, onAdvanceToStep2, onPrev, onBackToPrep }) {
  const wkly = meeting?.weeklyMTG
  const [teams, setTeams] = useState(null) // [{ team, kaCount, owners, statusCounts, good, more, focus }]
  const [loadError, setLoadError] = useState(null)

  // チーム別に当週KAを集計
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (!weekStart || !Array.isArray(levels) || levels.length === 0) {
          if (alive) setTeams([]); return
        }
        const scopeLevelIds = resolveScopeLevelIds(wkly, levels)
        if (scopeLevelIds.length === 0) { if (alive) setTeams([]); return }

        const objsRes = await supabase.from('objectives')
          .select('id, level_id').in('level_id', scopeLevelIds).range(0, 49999)
        if (objsRes.error) throw objsRes.error
        const objs = objsRes.data || []
        const objIds = objs.map(o => o.id)
        const objToLevel = new Map(objs.map(o => [Number(o.id), Number(o.level_id)]))

        let kas = []
        if (objIds.length > 0) {
          const kasRes = await supabase.from('weekly_reports')
            .select('id, ka_title, owner, status, good, more, focus_output, objective_id, kr_id')
            .in('objective_id', objIds)
            .eq('week_start', weekStart)
            .neq('status', 'done')
            .range(0, 49999)
          if (kasRes.error) throw kasRes.error
          kas = kasRes.data || []
        }

        // チーム単位で集計
        const teamMap = new Map(scopeLevelIds.map(id => [Number(id), {
          kaCount: 0, ownerSet: new Set(),
          statusCounts: { focus: 0, good: 0, more: 0, normal: 0 },
          kas: [], // チーム配下の全KA（編集可能サマリー用）
        }]))
        for (const ka of kas) {
          const lvlId = objToLevel.get(Number(ka.objective_id))
          if (!lvlId) continue
          const td = teamMap.get(Number(lvlId))
          if (!td) continue
          td.kaCount++
          if (ka.owner) td.ownerSet.add(ka.owner)
          const st = KA_STATUS_ORDER.includes(ka.status) ? ka.status : 'normal'
          td.statusCounts[st] = (td.statusCounts[st] || 0) + 1
          td.kas.push(ka)
        }

        const built = scopeLevelIds.map(id => {
          const team = levels.find(l => Number(l.id) === Number(id)) || { id, name: '?', icon: '🏢' }
          const td = teamMap.get(Number(id))
          return {
            team,
            kaCount: td.kaCount,
            owners: [...td.ownerSet],
            statusCounts: td.statusCounts,
            kas: (td.kas || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id),
          }
        })
        if (alive) { setTeams(built); setLoadError(null) }
      } catch (e) {
        console.error('Step1ManagerSummary load error:', e)
        if (alive) { setTeams([]); setLoadError(e?.message || String(e)) }
      }
    }
    load()
    return () => { alive = false }
  }, [wkly?.scope, weekStart, levels])

  if (teams === null) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>チーム別サマリーを集計中...</div>
  }
  if (loadError) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ background: `${T.danger}15`, border: `1px solid ${T.danger}40`, borderRadius: 10, padding: 16, color: T.danger, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>サマリー取得エラー</div>
          <div style={{ fontSize: 11, opacity: 0.85, whiteSpace: 'pre-wrap' }}>{loadError}</div>
        </div>
      </div>
    )
  }
  if (teams.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🤷</div>
        <div style={{ fontSize: 14, color: T.text, marginBottom: 6 }}>対象チームが見つかりません</div>
        <button onClick={onAdvanceToStep2} style={primaryBtn(T)}>確認事項へ →</button>
      </div>
    )
  }

  // 現在チーム判定
  const completed = new Set(session?.completed_item_ids || [])
  let currentIdx = teams.findIndex(t => Number(t.team?.id) === Number(session?.current_team_id))
  if (currentIdx === -1 || currentIdx >= teams.length) currentIdx = 0
  const current = teams[currentIdx]

  const goNext = async () => {
    const nextCompleted = [...new Set([...(session?.completed_item_ids || []), current.team.id])]
    if (currentIdx + 1 < teams.length) {
      await onUpdateSession({ current_team_id: teams[currentIdx + 1].team.id, completed_item_ids: nextCompleted })
    } else {
      await onUpdateSession({ current_team_id: null, completed_item_ids: nextCompleted, step: 2 })
    }
  }
  const goBack = async () => {
    if (currentIdx > 0) {
      await onUpdateSession({ current_team_id: teams[currentIdx - 1].team.id })
    } else {
      onPrev()
    }
  }
  const skip = async () => {
    if (currentIdx + 1 < teams.length) {
      await onUpdateSession({ current_team_id: teams[currentIdx + 1].team.id })
    } else {
      await onUpdateSession({ current_team_id: null, step: 2 })
    }
  }
  const jumpTo = async (idx) => {
    if (teams[idx]?.team?.id) await onUpdateSession({ current_team_id: teams[idx].team.id })
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      {onBackToPrep && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={onBackToPrep} style={{
            padding: '6px 12px', borderRadius: 7, border: `1px solid ${T.borderMid}`,
            background: 'transparent', color: T.textSub, cursor: 'pointer',
            fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
          }}>↩ 会議準備に戻る</button>
        </div>
      )}

      {/* 進行ナビ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        padding: '10px 14px', background: T.bgCard, borderRadius: 10, border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 700 }}>進捗</div>
        <div style={{ fontSize: 14, color: T.text, fontWeight: 800 }}>
          {currentIdx + 1} <span style={{ color: T.textMuted, fontSize: 11 }}>/ {teams.length} チーム</span>
        </div>
        <div style={{ flex: 1, height: 6, background: T.bgSection, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(completed.size / teams.length) * 100}%`, background: T.success, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          完了 <strong style={{ color: T.success }}>{completed.size}</strong>
        </div>
      </div>

      {/* 現在チームのサマリーカード */}
      <TeamSummaryCard T={T} teamData={current} members={members} weekStart={weekStart} />

      {/* 次へ / 前へ / スキップ */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
        <button onClick={goBack} style={secondaryBtn(T)}>
          ← {currentIdx === 0 ? '会議準備に戻る' : '前のチーム'}
        </button>
        <button onClick={skip} style={secondaryBtn(T)}>スキップ</button>
        <div style={{ flex: 1 }} />
        <button onClick={goNext} style={primaryBtn(T)}>
          {currentIdx + 1 < teams.length ? '次のチーム →' : '横断連携の確認へ →'}
        </button>
      </div>

      {/* チームジャンプリスト */}
      <div style={{
        marginTop: 18, padding: '12px 16px', background: T.bgCard,
        border: `1px solid ${T.border}`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          チーム一覧（クリックでジャンプ）
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {teams.map((t, i) => {
            const isDone = completed.has(t.team.id)
            const isActive = i === currentIdx
            return (
              <button key={t.team.id} onClick={() => jumpTo(i)}
                title={`${t.team.name} (KA ${t.kaCount}件)`}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                  background: isActive ? T.accent : isDone ? `${T.success}25` : T.bgSection,
                  color: isActive ? '#fff' : isDone ? T.success : T.textSub, fontWeight: 700,
                }}>
                {isDone && '✓ '}{t.team.icon || '🏢'} {t.team.name} <span style={{ opacity: 0.65 }}>({t.kaCount})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 横断連携への誘導 */}
      <div style={{
        marginTop: 18, padding: '12px 16px', background: `${T.warn}10`,
        border: `1px solid ${T.warn}40`, borderRadius: 10, fontSize: 12, color: T.textSub,
      }}>
        💡 各チーム共有が一巡したら「横断連携の確認へ →」で Step 2 へ。<br />
        曖昧な業務の引き取り、チーム間の依頼・連携は「確認事項」として記録します。
      </div>
    </div>
  )
}

function TeamSummaryCard({ T, teamData, members, weekStart }) {
  const { team, kaCount, owners, statusCounts } = teamData
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: '22px 26px' }}>
      {/* ヘッダー: チーム名 + 担当者リスト */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 24 }}>{team?.icon || '🤝'}</span>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{team?.name}</div>
        <span style={{
          padding: '3px 10px', borderRadius: 99, background: `${T.accent}18`,
          color: T.accent, fontWeight: 700, fontSize: 11,
        }}>KA {kaCount}件</span>
        {owners.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            {owners.slice(0, 5).map(name => {
              const m = members.find(x => x?.name === name)
              return <Avatar key={name} name={name} avatarUrl={m?.avatar_url} size={22} />
            })}
            {owners.length > 5 && <span style={{ fontSize: 11, color: T.textMuted }}>+{owners.length - 5}</span>}
          </div>
        )}
      </div>

      {/* KAステータス内訳 (参考情報) */}
      {kaCount > 0 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16,
          padding: '8px 12px', background: T.bgSection, borderRadius: 8,
        }}>
          {Object.entries(KA_STATUS_CFG).filter(([k]) => k !== 'done').map(([k, cfg]) => (
            <span key={k} style={{
              padding: '3px 10px', borderRadius: 99, background: cfg.bg, color: cfg.color,
              border: `1px solid ${cfg.border}`, fontSize: 11, fontWeight: 700,
            }}>
              {cfg.label} {statusCounts[k] || 0}
            </span>
          ))}
        </div>
      )}

      {/* チームの Good/More/Focus サマリー（編集可能、KA有無に関係なく書ける） */}
      <TeamSummaryEditor T={T} team={team} weekStart={weekStart} />
    </div>
  )
}

// ─── チーム単位の Good/More/Focus 編集（team_weekly_summary テーブル） ────
function TeamSummaryEditor({ T, team, weekStart }) {
  const [summary, setSummary]   = useState({ good: '', more: '', focus: '' })
  const [summaryId, setSummaryId] = useState(null)
  const [focusedField, setFocusedField] = useState(null)
  const focusedRef = useRef(focusedField)
  useEffect(() => { focusedRef.current = focusedField }, [focusedField])

  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const timer = useRef(null)
  const summaryIdRef = useRef(null)
  useEffect(() => { summaryIdRef.current = summaryId }, [summaryId])

  // 取得 (チーム/週切替時に再取得)
  useEffect(() => {
    let alive = true
    if (!team?.id || !weekStart) return
    supabase.from('team_weekly_summary')
      .select('*').eq('level_id', team.id).eq('week_start', weekStart)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) {
          setSummaryId(data.id)
          setSummary({ good: data.good || '', more: data.more || '', focus: data.focus || '' })
        } else {
          setSummaryId(null)
          setSummary({ good: '', more: '', focus: '' })
        }
      })
    return () => { alive = false }
  }, [team?.id, weekStart])

  // Realtime: 他クライアントの編集を即時反映 (編集中フィールドは保護)
  useEffect(() => {
    if (!team?.id || !weekStart) return
    const ch = supabase.channel(`tws_${team.id}_${weekStart}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_weekly_summary', filter: `level_id=eq.${team.id}` },
        payload => {
          const row = payload.new || payload.old
          if (!row || row.week_start !== weekStart) return
          if (payload.eventType === 'DELETE') { setSummaryId(null); return }
          setSummaryId(row.id)
          setSummary(prev => ({
            good:  focusedRef.current === 'good'  ? prev.good  : (row.good  || ''),
            more:  focusedRef.current === 'more'  ? prev.more  : (row.more  || ''),
            focus: focusedRef.current === 'focus' ? prev.focus : (row.focus || ''),
          }))
        }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [team?.id, weekStart])

  const persist = useCallback(async (newSummary) => {
    setSaving(true)
    const payload = { ...newSummary, updated_at: new Date().toISOString() }
    if (summaryIdRef.current) {
      await supabase.from('team_weekly_summary').update(payload).eq('id', summaryIdRef.current)
    } else {
      const { data } = await supabase.from('team_weekly_summary')
        .insert({ level_id: team.id, week_start: weekStart, ...payload })
        .select().single()
      if (data) { setSummaryId(data.id); summaryIdRef.current = data.id }
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1200)
  }, [team?.id, weekStart])

  const schedule = (newSummary) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persist(newSummary), 800)
  }
  const flush = (newSummary) => {
    if (timer.current) clearTimeout(timer.current)
    persist(newSummary)
  }

  const change = (field, value) => {
    const next = { ...summary, [field]: value }
    setSummary(next); schedule(next)
  }

  const prevWeek  = weekStart ? getPrevMondayStr(weekStart) : null
  const prevLabel = prevWeek ? formatWeekRange2(prevWeek) : ''
  const thisLabel = weekStart ? formatWeekRange2(weekStart) : ''

  return (
    <div>
      {/* 保存インジケータ */}
      <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6, textAlign: 'right', minHeight: 14 }}>
        {saving && <span style={{ color: T.accent }}>⟳ 保存中…</span>}
        {saved && !saving && <span style={{ color: T.success }}>✓ 保存済</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <ReviewBox T={T} icon="✅" label="Good" sub={prevLabel ? `先週 ${prevLabel} の振り返り` : '先週の振り返り'} accent={T.success}
          value={summary.good}
          onChange={v => change('good', v)}
          onFocus={() => setFocusedField('good')}
          onBlur={() => { setFocusedField(null); flush(summary) }}
          placeholder="チームの良かったこと・続けたいこと"
        />
        <ReviewBox T={T} icon="🔺" label="More" sub={prevLabel ? `先週 ${prevLabel} の課題` : '先週の課題'} accent={T.danger}
          value={summary.more}
          onChange={v => change('more', v)}
          onFocus={() => setFocusedField('more')}
          onBlur={() => { setFocusedField(null); flush(summary) }}
          placeholder="チームの課題・改善点"
        />
        <ReviewBox T={T} icon="🎯" label="Focus" sub={thisLabel ? `今週 ${thisLabel} の注力` : '今週の注力'} accent={T.accent}
          value={summary.focus}
          onChange={v => change('focus', v)}
          onFocus={() => setFocusedField('focus')}
          onBlur={() => { setFocusedField(null); flush(summary) }}
          placeholder="今週の重点・注力"
        />
      </div>
    </div>
  )
}

// ─── KA編集カード（Phase 4） ────────────────────────────────────────────────
function KAEditCard({ T, ka, team, objective, kr, members, weekStart }) {
  const [kaTitle,     setKaTitle]     = useState(ka.ka_title || '')
  const [ownerDraft,  setOwnerDraft]  = useState(ka.owner || '')
  const [status,      setStatus]      = useState(ka.status || 'normal')
  const [good,        setGood]        = useState(ka.good || '')
  const [more,        setMore]        = useState(ka.more || '')
  const [focusOutput, setFocusOutput] = useState(ka.focus_output || '')
  const [editingTitle, setEditingTitle] = useState(false)

  const [focusedField, setFocusedField] = useState(null)
  const focusedRef = useRef(null)
  useEffect(() => { focusedRef.current = focusedField }, [focusedField])

  const autoSave = useAutoSave('weekly_reports', ka.id)

  // Realtime: 自分以外のクライアントの編集を反映 (focusedField は上書きしない)
  useEffect(() => {
    const ch = supabase.channel(`ka_facil_${ka.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'weekly_reports', filter: `id=eq.${ka.id}` }, payload => {
        if (!payload.new) return
        if (focusedRef.current !== 'ka_title' && !editingTitle) setKaTitle(payload.new.ka_title || '')
        if (focusedRef.current !== 'owner')        setOwnerDraft(payload.new.owner || '')
        if (focusedRef.current !== 'status')       setStatus(payload.new.status || 'normal')
        if (focusedRef.current !== 'good')         setGood(payload.new.good || '')
        if (focusedRef.current !== 'more')         setMore(payload.new.more || '')
        if (focusedRef.current !== 'focus_output') setFocusOutput(payload.new.focus_output || '')
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ka.id]) // eslint-disable-line

  const cycleStatus = () => {
    const idx = KA_STATUS_ORDER.indexOf(status)
    const next = KA_STATUS_ORDER[(idx + 1) % KA_STATUS_ORDER.length]
    setStatus(next)
    autoSave.saveNow('status', next)
  }

  const handleTitleBlur = () => {
    setEditingTitle(false)
    setFocusedField(null)
    const trimmed = kaTitle.trim()
    if (trimmed && trimmed !== (ka.ka_title || '')) {
      autoSave.saveNow('ka_title', trimmed)
    } else if (!trimmed) {
      setKaTitle(ka.ka_title || '')
    }
  }
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Escape') { setKaTitle(ka.ka_title || ''); setEditingTitle(false); setFocusedField(null); return }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.target.blur() }
  }

  const cfg = KA_STATUS_CFG[status] || KA_STATUS_CFG.normal
  const prevWeek  = weekStart ? getPrevMondayStr(weekStart) : null
  const prevLabel = prevWeek ? formatWeekRange2(prevWeek) : ''
  const thisLabel = weekStart ? formatWeekRange2(weekStart) : ''
  const ownerMember = ownerDraft ? members.find(m => m?.name === ownerDraft) : null

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: '22px 26px', marginBottom: 18, position: 'relative',
    }}>
      {/* 階層パンくず */}
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{team?.icon || '🏢'}</span>
        <strong style={{ color: T.textSub }}>{team?.name}</strong>
        <span>›</span>
        <span style={{ color: T.textSub }}>{objective?.title}</span>
        {kr && (
          <>
            <span>›</span>
            <span style={{ color: T.textMuted, fontSize: 10 }}>KR: {kr.title}</span>
          </>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10 }}>
          {autoSave.saving && <span style={{ color: T.accent }}>⟳ 保存中…</span>}
          {autoSave.saved && !autoSave.saving && <span style={{ color: T.success }}>✓ 保存済</span>}
        </span>
      </div>

      {/* KAタイトル + ステータス */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <span onClick={cycleStatus} title="クリックでステータス切替"
          style={{
            fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 99, cursor: 'pointer',
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap', flexShrink: 0,
          }}>{cfg.label}</span>
        {editingTitle ? (
          <textarea autoFocus value={kaTitle}
            onChange={e => setKaTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            rows={1}
            style={{
              flex: 1, fontSize: 18, fontWeight: 800, color: T.text, lineHeight: 1.4,
              background: T.bgCard2 || T.bgSection, border: `1px solid ${T.accent}80`, borderRadius: 6,
              padding: '6px 10px', outline: 'none', fontFamily: 'inherit', resize: 'vertical',
            }} />
        ) : (
          <div onClick={() => { setEditingTitle(true); setFocusedField('ka_title') }}
            title="クリックで編集"
            style={{ flex: 1, fontSize: 18, fontWeight: 800, color: T.text, lineHeight: 1.4, cursor: 'text', minHeight: 24, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {kaTitle || '(無題)'}
          </div>
        )}
      </div>

      {/* 担当 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Avatar name={ownerDraft} avatarUrl={ownerMember?.avatar_url} size={26} />
        <select value={ownerDraft}
          onFocus={() => setFocusedField('owner')}
          onBlur={() => { setFocusedField(null); autoSave.saveNow('owner', ownerDraft) }}
          onChange={e => { setOwnerDraft(e.target.value); autoSave.save('owner', e.target.value) }}
          style={{
            background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 6,
            padding: '5px 10px', fontSize: 13, color: avatarColor(ownerDraft) || T.textMuted,
            cursor: 'pointer', fontFamily: 'inherit', outline: 'none', fontWeight: 700, minWidth: 140,
          }}>
          <option value="">-- 担当 --</option>
          {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
      </div>

      {/* good / more / focus */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <ReviewBox T={T} icon="✅" label="Good" sub={prevLabel ? `先週 ${prevLabel} の振り返り` : '先週の振り返り'} accent={T.success}
          value={good}
          onChange={v => { setGood(v); autoSave.save('good', v) }}
          onFocus={() => setFocusedField('good')}
          onBlur={() => { setFocusedField(null); autoSave.saveNow('good', good) }}
          placeholder="良かったこと・続けたいこと"
        />
        <ReviewBox T={T} icon="🔺" label="More" sub={prevLabel ? `先週 ${prevLabel} の課題` : '先週の課題'} accent={T.danger}
          value={more}
          onChange={v => { setMore(v); autoSave.save('more', v) }}
          onFocus={() => setFocusedField('more')}
          onBlur={() => { setFocusedField(null); autoSave.saveNow('more', more) }}
          placeholder="課題・改善点"
        />
        <ReviewBox T={T} icon="🎯" label="Focus" sub={thisLabel ? `今週 ${thisLabel} の注力` : '今週の注力'} accent={T.accent}
          value={focusOutput}
          onChange={v => { setFocusOutput(v); autoSave.save('focus_output', v) }}
          onFocus={() => setFocusedField('focus_output')}
          onBlur={() => { setFocusedField(null); autoSave.saveNow('focus_output', focusOutput) }}
          placeholder="今週の重点アクション"
        />
      </div>
    </div>
  )
}

// ─── KR編集カード（Phase 3-2） ─────────────────────────────────────────────
const WEATHERS = [
  { v: 1, icon: '☀️', label: '快晴' },
  { v: 2, icon: '🌤', label: '晴れ' },
  { v: 3, icon: '☁️', label: '曇り' },
  { v: 4, icon: '🌧',  label: '雨'  },
]

// 指定 monday の前週月曜日を返す（YYYY-MM-DD）
function getPrevMondayStr(mondayStr) {
  const [y, m, d] = mondayStr.split('-').map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - 7))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,'0')}-${String(prev.getUTCDate()).padStart(2,'0')}`
}
// "YYYY-MM-DD" → "M/D〜D"
function formatWeekRange2(mondayStr) {
  if (!mondayStr) return ''
  const [y, m, d] = mondayStr.split('-').map(Number)
  const sun = new Date(Date.UTC(y, m - 1, d + 6))
  const sm = sun.getUTCMonth() + 1
  const sd = sun.getUTCDate()
  return m === sm ? `${m}/${d}〜${sd}` : `${m}/${d}〜${sm}/${sd}`
}

function KREditCard({ T, kr, objective, level, weekStart, members, periodLabel }) {
  // KR本体のローカルstate（編集用）
  const [target,     setTarget]     = useState(kr.target ?? 0)
  const [currentVal, setCurrentVal] = useState(kr.current ?? 0)
  const [ownerDraft, setOwnerDraft] = useState(kr.owner || '')
  const krAutoSave = useAutoSave('key_results', kr.id)

  // kr_weekly_reviews
  const [reviewId,   setReviewId]   = useState(null)
  const [weather,    setWeather]    = useState(0)
  const [good,       setGood]       = useState('')
  const [more,       setMore]       = useState('')
  const [focusText,  setFocusText]  = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewSaved,  setReviewSaved]  = useState(false)

  // 編集中のフィールド (Realtimeで上書きされないように管理)
  const [focusedField, setFocusedField] = useState(null)
  const focusedRef = useRef(null)
  useEffect(() => { focusedRef.current = focusedField }, [focusedField])

  // 800ms デバウンスのタイマー
  const reviewTimer = useRef(null)

  // 初回ロード + 週/KR切替時にレビューを取得
  useEffect(() => {
    let alive = true
    supabase.from('kr_weekly_reviews').select('*')
      .eq('kr_id', kr.id).eq('week_start', weekStart).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (data) {
          setReviewId(data.id)
          if (focusedRef.current !== 'weather')   setWeather(data.weather || 0)
          if (focusedRef.current !== 'good')      setGood(data.good || '')
          if (focusedRef.current !== 'more')      setMore(data.more || '')
          if (focusedRef.current !== 'focusText') setFocusText(data.focus || '')
        } else {
          setReviewId(null); setWeather(0); setGood(''); setMore(''); setFocusText('')
        }
      })
    return () => { alive = false }
  }, [kr.id, weekStart])

  // Realtime: kr_weekly_reviews 変更 → 編集中フィールドは上書きしない
  useEffect(() => {
    const ch = supabase.channel(`krrev_${kr.id}_${weekStart}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kr_weekly_reviews', filter: `kr_id=eq.${kr.id}` }, payload => {
        const row = payload.new || payload.old
        if (!row || row.week_start !== weekStart) return
        if (payload.eventType === 'DELETE') { setReviewId(null); return }
        setReviewId(row.id)
        if (focusedRef.current !== 'weather')   setWeather(row.weather || 0)
        if (focusedRef.current !== 'good')      setGood(row.good || '')
        if (focusedRef.current !== 'more')      setMore(row.more || '')
        if (focusedRef.current !== 'focusText') setFocusText(row.focus || '')
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [kr.id, weekStart])

  // Realtime: key_results 変更（target/current/owner）
  useEffect(() => {
    const ch = supabase.channel(`kr_${kr.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'key_results', filter: `id=eq.${kr.id}` }, payload => {
        if (!payload.new) return
        if (focusedRef.current !== 'target')  setTarget(payload.new.target ?? 0)
        if (focusedRef.current !== 'current') setCurrentVal(payload.new.current ?? 0)
        if (focusedRef.current !== 'owner')   setOwnerDraft(payload.new.owner || '')
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [kr.id])

  // KR切替時にローカルstateを新KR値で再初期化（key={kr.id}でも保険）
  useEffect(() => {
    setTarget(kr.target ?? 0)
    setCurrentVal(kr.current ?? 0)
    setOwnerDraft(kr.owner || '')
  }, [kr.id, kr.target, kr.current, kr.owner])

  // kr_weekly_reviews を upsert（id があれば update、無ければ insert）
  const saveReview = useCallback(async (w, g, m, f) => {
    setReviewSaving(true)
    const payload = { kr_id: kr.id, week_start: weekStart, weather: w, good: g, more: m, focus: f, updated_at: new Date().toISOString() }
    if (reviewId) {
      await supabase.from('kr_weekly_reviews').update(payload).eq('id', reviewId)
    } else {
      const { data } = await supabase.from('kr_weekly_reviews').insert(payload).select().single()
      if (data) setReviewId(data.id)
    }
    setReviewSaving(false); setReviewSaved(true)
    setTimeout(() => setReviewSaved(false), 1200)
  }, [kr.id, weekStart, reviewId])

  const scheduleReviewSave = (w, g, m, f) => {
    if (reviewTimer.current) clearTimeout(reviewTimer.current)
    reviewTimer.current = setTimeout(() => saveReview(w, g, m, f), 800)
  }
  const flushReviewSave = (w, g, m, f) => {
    if (reviewTimer.current) clearTimeout(reviewTimer.current)
    saveReview(w, g, m, f)
  }

  // 進捗計算
  const progress = target > 0
    ? Math.min(150, Math.round(kr.lower_is_better
        ? Math.max(0, ((target * 2 - currentVal) / target) * 100)
        : (currentVal / target) * 100))
    : 0
  const progressColor = progress >= 100 ? T.success : progress >= 60 ? T.accent : T.danger

  const ownerMember = ownerDraft ? members.find(m => m?.name === ownerDraft) : null

  const inputBase = {
    border: `1px solid ${T.borderMid}`, borderRadius: 6, padding: '4px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    background: T.bgCard, color: T.text,
  }

  const prevWeek = getPrevMondayStr(weekStart)

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: '22px 26px', marginBottom: 18, position: 'relative',
    }}>
      {/* 階層パンくず */}
      <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{level?.icon || '🏢'}</span>
        <strong style={{ color: T.textSub }}>{level?.name}</strong>
        <span>›</span>
        <span style={{ color: T.textSub }}>{objective?.title}</span>
        {periodLabel && (
          <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 99, background: `${T.accent}20`, color: T.accent, fontWeight: 700, fontSize: 10 }}>
            {periodLabel}
          </span>
        )}
        {/* 保存インジケータ */}
        <span style={{ marginLeft: 'auto', fontSize: 10 }}>
          {(krAutoSave.saving || reviewSaving) && <span style={{ color: T.accent }}>⟳ 保存中…</span>}
          {(krAutoSave.saved || reviewSaved) && !(krAutoSave.saving || reviewSaving) && <span style={{ color: T.success }}>✓ 保存済</span>}
        </span>
      </div>

      {/* KRタイトル */}
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text, lineHeight: 1.4, marginBottom: 14 }}>
        {kr.title}
      </div>

      {/* 担当 + 数値編集 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar name={ownerDraft} avatarUrl={ownerMember?.avatar_url} size={28} />
          <select value={ownerDraft}
            onFocus={() => setFocusedField('owner')}
            onBlur={() => { setFocusedField(null); krAutoSave.saveNow('owner', ownerDraft) }}
            onChange={e => { setOwnerDraft(e.target.value); krAutoSave.save('owner', e.target.value) }}
            style={{ ...inputBase, fontWeight: 700, color: avatarColor(ownerDraft), minWidth: 130 }}>
            <option value="">-- 担当 --</option>
            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <input type="number" value={currentVal}
            onFocus={() => setFocusedField('current')}
            onBlur={() => { setFocusedField(null); krAutoSave.saveNow('current', Number(currentVal)) }}
            onChange={e => { const v = Number(e.target.value); setCurrentVal(v); krAutoSave.save('current', v) }}
            style={{ ...inputBase, width: 80, fontSize: 18, fontWeight: 800, color: progressColor, textAlign: 'right' }} />
          <span style={{ fontSize: 12, color: T.textMuted }}>{kr.unit}</span>
          <span style={{ fontSize: 12, color: T.textMuted }}>/</span>
          <input type="number" value={target}
            onFocus={() => setFocusedField('target')}
            onBlur={() => { setFocusedField(null); krAutoSave.saveNow('target', Number(target)) }}
            onChange={e => { const v = Number(e.target.value); setTarget(v); krAutoSave.save('target', v) }}
            style={{ ...inputBase, width: 80, fontSize: 13, fontWeight: 700, color: T.textSub, textAlign: 'right' }} />
          <span style={{ fontSize: 12, color: T.textMuted }}>{kr.unit}</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: progressColor, minWidth: 60, textAlign: 'right' }}>{progress}%</div>
      </div>

      {/* 進捗バー */}
      <div style={{ height: 8, background: T.bgSection, borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${Math.min(100, progress)}%`, background: progressColor, transition: 'width 0.3s' }} />
      </div>

      {/* 天気 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 700 }}>天気（{formatWeekRange2(weekStart)}）</span>
        {WEATHERS.map(w => {
          const active = weather === w.v
          return (
            <button key={w.v}
              onClick={() => { setWeather(w.v); flushReviewSave(w.v, good, more, focusText) }}
              title={w.label}
              style={{
                padding: '6px 10px', borderRadius: 8, border: `1px solid ${active ? T.accent : T.border}`,
                background: active ? `${T.accent}18` : 'transparent', cursor: 'pointer',
                fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
              }}>{w.icon}</button>
          )
        })}
      </div>

      {/* good / more / focus 入力 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {/* Good */}
        <ReviewBox T={T} icon="✅" label="Good" sub={`先週 ${formatWeekRange2(prevWeek)}`} accent={T.success}
          value={good}
          onChange={v => { setGood(v); scheduleReviewSave(weather, v, more, focusText) }}
          onFocus={() => setFocusedField('good')}
          onBlur={() => { setFocusedField(null); flushReviewSave(weather, good, more, focusText) }}
          placeholder="良かったこと・続けたいこと"
        />
        {/* More */}
        <ReviewBox T={T} icon="🔺" label="More" sub={`先週 ${formatWeekRange2(prevWeek)}`} accent={T.danger}
          value={more}
          onChange={v => { setMore(v); scheduleReviewSave(weather, good, v, focusText) }}
          onFocus={() => setFocusedField('more')}
          onBlur={() => { setFocusedField(null); flushReviewSave(weather, good, more, focusText) }}
          placeholder="課題・改善したいこと"
        />
        {/* Focus */}
        <ReviewBox T={T} icon="🎯" label="Focus" sub={`今週 ${formatWeekRange2(weekStart)}`} accent={T.accent}
          value={focusText}
          onChange={v => { setFocusText(v); scheduleReviewSave(weather, good, more, v) }}
          onFocus={() => setFocusedField('focusText')}
          onBlur={() => { setFocusedField(null); flushReviewSave(weather, good, more, focusText) }}
          placeholder="今週の重点アクション"
        />
      </div>
    </div>
  )
}

// テキストエリアの高さを内容に合わせて自動拡張
function autoGrowTextarea(el, minRows = 6) {
  if (!el) return
  el.style.height = 'auto'
  // fontSize 12 / lineHeight 1.6 → 1行 ≒ 19.2px。パディング 14px 込み
  const minH = minRows * 20 + 14
  el.style.height = Math.max(el.scrollHeight, minH) + 'px'
}

function ReviewBox({ T, icon, label, sub, accent, value, onChange, onFocus, onBlur, placeholder, minRows = 6 }) {
  const ref = useRef(null)
  // 値が外部から変わった時 (初期表示・他クライアント編集の反映) も再計算
  useEffect(() => { autoGrowTextarea(ref.current, minRows) }, [value, minRows])

  return (
    <div style={{
      background: T.bgSection, borderRadius: 8, border: `1px solid ${T.border}`,
      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{label}</span>
        <span style={{ fontSize: 10, color: T.textMuted }}>{sub}</span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={e => { onChange(e.target.value); autoGrowTextarea(e.target, minRows) }}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={minRows}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 6,
          padding: '6px 8px', color: T.text, fontSize: 12, lineHeight: 1.6,
          outline: 'none', fontFamily: 'inherit', resize: 'none', overflow: 'hidden',
          minHeight: minRows * 20 + 14,
        }}
      />
    </div>
  )
}

// ─── Step 2: 確認事項（Phase 5 = "C"） ───────────────────────────────────────
// withDiscussion=true (マネージャー定例) は別途専用UIを協議中。
// 当面は ConfirmationsTab を全社モードで表示するシンプル実装。
function Step2Confirmations({ T, myName, members, withDiscussion, onPrev, onNext }) {
  // ConfirmationsTab に渡す T を拡張（sectionBg / successBg が必要）
  const extendedT = useMemo(() => ({
    ...T,
    sectionBg: T.bgSection || T.bgCard2 || 'rgba(128,128,128,0.06)',
    successBg: T.success ? `${T.success}20` : 'rgba(0,214,143,0.12)',
  }), [T])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 上部ヘッダー（withDiscussion の案内） */}
      {withDiscussion && (
        <div style={{
          maxWidth: 900, width: '100%', margin: '12px auto 0', padding: '12px 16px',
          background: `${T.warn}15`, border: `1px solid ${T.warn}40`, borderRadius: 8,
          fontSize: 12, color: T.textSub,
        }}>
          <div style={{ fontWeight: 700, color: T.warn, marginBottom: 4 }}>🤝 横断連携の確認</div>
          各チームの共有を踏まえ、以下を「確認事項」として記録してください：<br />
          ・<strong>担当が曖昧な業務</strong>（どのチームが拾うか）<br />
          ・<strong>引き継ぎ・依頼事項</strong>（チーム間でボールを渡したいもの）<br />
          ・<strong>連携が必要な案件</strong>（複数チームで連動する作業）
        </div>
      )}

      {/* ConfirmationsTab を全社モードで埋め込み（会議中は新規追加も可能に） */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ConfirmationsTab T={extendedT} myName={myName} members={members} companyWide allowCompose />
      </div>

      {/* フッターナビ */}
      <div style={{
        position: 'sticky', bottom: 0, background: T.bg,
        borderTop: `1px solid ${T.border}`, padding: '12px 20px',
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <button onClick={onPrev} style={secondaryBtn(T)}>← Step 1 に戻る</button>
        <div style={{ flex: 1 }} />
        <button onClick={onNext} style={primaryBtn(T)}>ネクストアクションへ →</button>
      </div>
    </div>
  )
}

// ─── 共通ボタンスタイル ────────────────────────────────────────────────────
function primaryBtn(T) {
  return {
    padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: T.accent, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
  }
}
function secondaryBtn(T) {
  return {
    padding: '10px 18px', borderRadius: 8, border: `1px solid ${T.borderMid}`, cursor: 'pointer',
    background: 'transparent', color: T.textSub, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
  }
}

// ─── Step 3: ネクストアクション ─────────────────────────────────────────────
// 「誰がいつまでに何をやるか」を必ず確認するステップ。
// meeting_action_items テーブル に保存。会議終了時に0件なら警告。
function Step3NextActions({ T, meeting, weekStart, session, myName, members, levels = [], onPrev, onFinish }) {
  const [items, setItems] = useState(null)
  const [scopeKAs, setScopeKAs] = useState([]) // 任意紐付け用のKA選択肢
  const [loadError, setLoadError] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  // 既存タスク取得 (ka_tasks; meeting_key + week_start で会議スコープを識別)
  useEffect(() => {
    let alive = true
    if (!meeting?.key) return
    supabase.from('ka_tasks')
      .select('*')
      .eq('meeting_key', meeting.key)
      .eq('week_start', weekStart || null)
      .order('id', { ascending: true })
      .range(0, 49999)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setLoadError(error.message); setItems([]); return }
        setItems(data || [])
      })
    return () => { alive = false }
  }, [meeting?.key, weekStart])

  // 会議スコープ内のKA一覧 (任意紐付け用)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (!Array.isArray(levels) || levels.length === 0) return
        const wkly = meeting?.weeklyMTG
        const scopeLevelIds = resolveScopeLevelIds(wkly, levels)
        if (scopeLevelIds.length === 0) { if (alive) setScopeKAs([]); return }
        const objsRes = await supabase.from('objectives')
          .select('id, level_id, title').in('level_id', scopeLevelIds).range(0, 49999)
        const objs = objsRes.data || []
        const objIds = objs.map(o => o.id)
        if (objIds.length === 0) { if (alive) setScopeKAs([]); return }
        const kasRes = await supabase.from('weekly_reports')
          .select('id, ka_title, owner, kr_id, objective_id, level_id, week_start, status')
          .in('objective_id', objIds)
          .eq('week_start', weekStart)
          .neq('status', 'done')
          .range(0, 49999)
        const kas = kasRes.data || []
        // ラベル組み立て: 「[チーム] KAタイトル (担当)」
        const objToLevel = new Map(objs.map(o => [Number(o.id), Number(o.level_id)]))
        const lvlToName  = new Map(levels.map(l => [Number(l?.id), l?.name || '']))
        const list = kas.map(ka => {
          const lvlId = objToLevel.get(Number(ka.objective_id))
          const teamName = lvlToName.get(Number(lvlId)) || ''
          return { ...ka, _label: `[${teamName}] ${ka.ka_title || '(無題)'}${ka.owner ? ` (${ka.owner})` : ''}` }
        }).sort((a, b) => a._label.localeCompare(b._label))
        if (alive) setScopeKAs(list)
      } catch (e) {
        console.error('Step3NextActions scope KA load error:', e)
      }
    }
    load()
    return () => { alive = false }
  }, [meeting?.key, weekStart, levels])

  // Realtime購読 (ka_tasks 変更を監視; この会議の行のみ反映)
  useEffect(() => {
    if (!meeting?.key) return
    const ch = supabase.channel(`mtg_tasks_${meeting.key}_${weekStart}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ka_tasks' },
        payload => {
          const row = payload.new || payload.old
          if (!row) return
          // この会議スコープのレコードだけ扱う
          if ((row.meeting_key || null) !== meeting.key) return
          if ((row.week_start || null) !== (weekStart || null)) return
          if (payload.eventType === 'INSERT') {
            setItems(p => (p || []).some(x => x.id === payload.new.id) ? p : [...(p || []), payload.new])
          } else if (payload.eventType === 'UPDATE') {
            setItems(p => (p || []).map(x => x.id === payload.new.id ? { ...x, ...payload.new } : x))
          } else if (payload.eventType === 'DELETE') {
            setItems(p => (p || []).filter(x => x.id !== payload.old.id))
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [meeting?.key, weekStart])

  const addItem = async () => {
    const payload = {
      meeting_key: meeting.key, week_start: weekStart, session_id: session?.id ?? null,
      assignee: '', due_date: null, title: '', done: false,
      report_id: null, ka_key: null,
    }
    const { data, error } = await supabase.from('ka_tasks').insert(payload).select().single()
    if (error) { alert('追加失敗: ' + error.message); return }
    if (data) setItems(p => (p || []).some(x => x.id === data.id) ? p : [...(p || []), data])
  }

  const deleteItem = async (id) => {
    if (!window.confirm('このネクストアクションを削除しますか？')) return
    await supabase.from('ka_tasks').delete().eq('id', id)
    setItems(p => (p || []).filter(x => x.id !== id))
  }

  const handleFinish = () => {
    const count = (items || []).length
    const filled = (items || []).filter(it => (it.title || '').trim()).length
    if (count === 0) {
      if (!window.confirm('ネクストアクションが0件です。本当に会議を終了しますか？\n（誰がいつまでに何をやるかが決まらない会議は意味がありません）')) return
    } else if (filled < count) {
      if (!window.confirm(`内容が空のアクションが ${count - filled} 件あります。このまま終了しますか？`)) return
    }
    onFinish()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{
        marginBottom: 16, padding: '14px 18px',
        background: `${T.warn}10`, border: `1px solid ${T.warn}40`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.warn, marginBottom: 4 }}>
          ✅ ネクストアクションを確定
        </div>
        <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
          <strong>誰がいつまでに何をやるか</strong>を記録します。決まらない会議は意味がありません。<br />
          会議で出た決定事項・宿題・依頼を全て書き出してから終了してください。
        </div>
      </div>

      {/* テーブルヘッダー */}
      <div style={{
        display: 'grid', gridTemplateColumns: '140px 130px 1fr 180px 32px',
        gap: 8, padding: '8px 12px', background: T.bgCard, borderRadius: 8,
        border: `1px solid ${T.border}`, marginBottom: 6, fontSize: 11,
        color: T.textMuted, fontWeight: 700,
      }}>
        <div>担当</div>
        <div>期日</div>
        <div>内容</div>
        <div>KA紐付け（任意）</div>
        <div></div>
      </div>

      {/* 行 */}
      {items === null ? (
        <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>読み込み中…</div>
      ) : items.length === 0 ? (
        <div style={{
          padding: '24px 16px', background: T.bgCard, border: `1px dashed ${T.borderMid}`,
          borderRadius: 8, fontSize: 12, color: T.textMuted, textAlign: 'center', marginBottom: 8,
        }}>
          まだネクストアクションが登録されていません。下のボタンから追加してください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {items.map(it => (
            <NextActionRow key={it.id} T={T} item={it} members={members} scopeKAs={scopeKAs} onDelete={() => deleteItem(it.id)} />
          ))}
        </div>
      )}

      {loadError && (
        <div style={{ marginBottom: 8, padding: '8px 12px', background: `${T.danger}10`, border: `1px solid ${T.danger}40`, borderRadius: 6, color: T.danger, fontSize: 11 }}>
          取得エラー: {loadError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={addItem} style={{
          padding: '8px 14px', borderRadius: 7, border: `1px dashed ${T.accent}80`,
          background: 'transparent', color: T.accent, cursor: 'pointer',
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
        }}>＋ アクションを追加</button>
        <button onClick={() => setImportOpen(true)} style={{
          padding: '8px 14px', borderRadius: 7, border: 'none',
          background: T.accent, color: '#fff', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          boxShadow: `0 2px 8px ${T.accent}40`,
        }}>📋 Notionから取り込み</button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onPrev} style={secondaryBtn(T)}>← Step 2 に戻る</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: T.textMuted, marginRight: 8 }}>
          記録: <strong style={{ color: T.text }}>{(items || []).filter(it => (it.title || '').trim()).length}</strong> 件
        </div>
        <button onClick={handleFinish} style={primaryBtn(T)}>🏁 会議を終了</button>
      </div>

      {/* Notion議事録 取り込みモーダル */}
      <MeetingImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        meetingKey={meeting?.key}
        meetingTitle={meeting?.title}
        members={members}
        weekStart={weekStart}
        sessionId={session?.id ?? null}
        T={{ bgCard: T.bgCard, text: T.text, textMuted: T.textMuted, borderMid: T.borderMid, borderLight: T.border, bgCard2: T.bgSection }}
      />
    </div>
  )
}

function NextActionRow({ T, item, members, scopeKAs = [], onDelete }) {
  const [assignee, setAssignee] = useState(item.assignee || '')
  const [dueDate,  setDueDate]  = useState(item.due_date || '')
  const [title,    setTitle]    = useState(item.title || '')
  const [reportId, setReportId] = useState(item.report_id || '')
  const [focusedField, setFocusedField] = useState(null)
  const focusedRef = useRef(null)
  useEffect(() => { focusedRef.current = focusedField }, [focusedField])

  // タスクテーブルは ka_tasks に統一
  const autoSave = useAutoSave('ka_tasks', item.id)

  // Realtime: 編集中フィールドは保護
  useEffect(() => {
    const ch = supabase.channel(`mtg_task_row_${item.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ka_tasks', filter: `id=eq.${item.id}` },
        payload => {
          if (!payload.new) return
          if (focusedRef.current !== 'assignee')  setAssignee(payload.new.assignee || '')
          if (focusedRef.current !== 'due_date')  setDueDate(payload.new.due_date || '')
          if (focusedRef.current !== 'title')     setTitle(payload.new.title || '')
          if (focusedRef.current !== 'report_id') setReportId(payload.new.report_id || '')
        }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [item.id])

  // KA を変更したら ka_key も追従して保存
  const handleKAChange = (newReportId) => {
    setReportId(newReportId)
    if (!newReportId) {
      autoSave.save('report_id', null)
      autoSave.save('ka_key', null)
    } else {
      const ka = scopeKAs.find(k => Number(k.id) === Number(newReportId))
      const kaKey = ka ? computeKAKey(ka) : null
      autoSave.save('report_id', Number(newReportId))
      autoSave.save('ka_key', kaKey)
    }
  }

  const ownerMember = assignee ? members.find(m => m?.name === assignee) : null

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '140px 130px 1fr 180px 32px',
      gap: 8, padding: '8px 12px', background: T.bgCard, borderRadius: 8,
      border: `1px solid ${T.border}`, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Avatar name={assignee} avatarUrl={ownerMember?.avatar_url} size={20} />
        <select value={assignee}
          onFocus={() => setFocusedField('assignee')}
          onBlur={() => { setFocusedField(null); autoSave.saveNow('assignee', assignee) }}
          onChange={e => { setAssignee(e.target.value); autoSave.save('assignee', e.target.value) }}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: assignee ? avatarColor(assignee) : T.textMuted,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
            fontWeight: 700, minWidth: 0,
          }}>
          <option value="">--</option>
          {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
      </div>
      <input type="date"
        value={dueDate || ''}
        onFocus={() => setFocusedField('due_date')}
        onBlur={() => { setFocusedField(null); autoSave.saveNow('due_date', dueDate || null) }}
        onChange={e => { setDueDate(e.target.value); autoSave.save('due_date', e.target.value || null) }}
        style={{
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5,
          padding: '4px 6px', color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none',
        }} />
      <input
        value={title}
        onFocus={() => setFocusedField('title')}
        onBlur={() => { setFocusedField(null); autoSave.saveNow('title', title) }}
        onChange={e => { setTitle(e.target.value); autoSave.save('title', e.target.value) }}
        placeholder="内容（何をやるか）"
        style={{
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5,
          padding: '6px 8px', color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none',
        }} />
      {/* KA 紐付け (任意) */}
      <select value={reportId || ''}
        onChange={e => handleKAChange(e.target.value || null)}
        title="関連するKAを選ぶと、個人のタスク一覧でもそのKA配下に表示されます"
        style={{
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5,
          padding: '4px 6px', color: reportId ? T.text : T.textMuted,
          fontSize: 11, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
        }}>
        <option value="">-- KAなし --</option>
        {scopeKAs.map(ka => (
          <option key={ka.id} value={ka.id}>{ka._label}</option>
        ))}
      </select>
      <button onClick={onDelete} title="削除" style={{
        background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer',
        fontSize: 14, padding: '0 4px', fontFamily: 'inherit',
      }}>✕</button>
    </div>
  )
}

// ─── Step 4: 終了画面 ────────────────────────────────────────────────────────
function Step4Done({ T, session, scope, meeting, onReset, onSwitchToList }) {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0, marginBottom: 8 }}>
        お疲れ様でした！
      </h2>
      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 24 }}>
        {meeting?.title} を完了しました
      </div>

      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: 20, marginBottom: 24, textAlign: 'left',
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>サマリー</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SummaryItem T={T} label="ファシリ" value={session?.facilitator || '—'} />
          <SummaryItem T={T} label="開始" value={session?.started_at ? formatTime(session.started_at) : '—'} />
          <SummaryItem T={T} label="終了" value={session?.finished_at ? formatTime(session.finished_at) : '—'} />
          <SummaryItem T={T} label="所要" value={formatDuration(session?.started_at, session?.finished_at)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={onReset} style={{
          padding: '10px 20px', borderRadius: 8, border: `1px solid ${T.borderMid}`,
          background: 'transparent', color: T.textSub, cursor: 'pointer',
          fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
        }}>↺ もう一度開始</button>
        {onSwitchToList && (
          <button onClick={onSwitchToList} style={{
            padding: '10px 20px', borderRadius: 8, border: `1px solid ${T.borderMid}`,
            background: 'transparent', color: T.textSub, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}>📋 一覧モードで詳細確認</button>
        )}
      </div>
    </div>
  )
}

// ─── プレースホルダ Step 1 / 2 (Phase 3-5 で本実装) ──────────────────────────
function PlaceholderStep({ T, title, note, onPrev, onNext, nextLabel = '次へ →' }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>{title}</h2>
      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 28 }}>{note}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {onPrev && (
          <button onClick={onPrev} style={{
            padding: '10px 18px', borderRadius: 8, border: `1px solid ${T.borderMid}`,
            background: 'transparent', color: T.textSub, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}>← 前へ</button>
        )}
        {onNext && (
          <button onClick={onNext} style={{
            padding: '10px 18px', borderRadius: 8, border: 'none',
            background: T.accent, color: '#fff', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          }}>{nextLabel}</button>
        )}
      </div>
    </div>
  )
}

// ─── 小物 ────────────────────────────────────────────────────────────────────
function Badge({ T, bg, fg, children }) {
  return (
    <span style={{
      padding: '4px 10px', borderRadius: 99, background: bg, color: fg,
      fontSize: 11, fontWeight: 700,
    }}>{children}</span>
  )
}

function SummaryItem({ T, label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{value}</div>
    </div>
  )
}

// ─── ヘルパー ────────────────────────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '—' }
}

function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—'
  try {
    const ms = new Date(endIso) - new Date(startIso)
    const min = Math.round(ms / 60000)
    if (min < 60) return `${min}分`
    return `${Math.floor(min / 60)}時間${min % 60}分`
  } catch { return '—' }
}

function formatWeekRange(mondayStr) {
  if (!mondayStr) return '—'
  const [y, m, d] = mondayStr.split('-').map(Number)
  const sun = new Date(Date.UTC(y, m - 1, d + 6))
  const sm = sun.getUTCMonth() + 1
  const sd = sun.getUTCDate()
  return m === sm ? `${m}/${d}〜${sd}` : `${m}/${d}〜${sm}/${sd}`
}

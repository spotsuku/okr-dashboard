'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

// ─── 共通: ステップ定義 ─────────────────────────────────────────────────────
function stepsForFlow(wkly) {
  // 共通4ステップ: 0=未開始 / 1=順送り / 2=確認事項(manager: 課題・依頼も同画面) / 3=終了
  const items = [
    { n: 1, label: wkly?.flow === 'ka' ? 'KA順送り' : 'KR順送り', icon: wkly?.flow === 'ka' ? '📋' : '🎯' },
    { n: 2, label: wkly?.withDiscussion ? '課題・依頼+確認事項' : '確認事項', icon: '💬' },
    { n: 3, label: '終了', icon: '🏁' },
  ]
  return items
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

    let scopeLevels = []
    if (wkly.scope === 'teams-of') {
      const parent = levels.find(l => l.name === wkly.parentLevelName)
      if (!parent) { setScopePreview({ perLevel: [], total: 0 }); return }
      scopeLevels = levels
        .filter(l => Number(l.parent_id) === Number(parent.id))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    } else if (wkly.scope === 'all-teams') {
      // depth=2 = 親が depth=1 (= parent_id が null の事業部)
      scopeLevels = levels.filter(l => {
        if (l.parent_id == null) return false
        const p = levels.find(x => Number(x.id) === Number(l.parent_id))
        return p && p.parent_id == null
      }).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    } else if (wkly.scope === 'all-departments') {
      scopeLevels = levels
        .filter(l => l.parent_id == null)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    }

    const levelIds = scopeLevels.map(l => l.id)
    if (levelIds.length === 0) { setScopePreview({ perLevel: [], total: 0 }); return }

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
    const payload = {
      meeting_key: meeting.key,
      week_start: weekStart,
      step: 1,
      facilitator: myName || null,
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
    await supabase.from('weekly_mtg_sessions').update({
      step: 3, finished_at: new Date().toISOString(),
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
  const stepDefs = stepsForFlow(wkly)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto',
      background: T.bg, color: T.text, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* ステップヘッダー（step >= 1 の時だけ表示） */}
      {step >= 1 && (
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
        {step === 0 && (
          <Step0Preparation
            T={T} meeting={meeting} weekStart={weekStart} myName={myName}
            scope={scopePreview} session={session}
            onStart={startMeeting}
            onSwitchToList={onSwitchToList}
          />
        )}
        {step === 1 && wkly?.flow === 'kr' && (
          <Step1KRLoop
            T={T} meeting={meeting} weekStart={weekStart}
            levels={levels} members={members}
            session={session}
            onUpdateSession={(patch) => supabase.from('weekly_mtg_sessions').update(patch).eq('id', session.id)}
            onAdvanceToStep2={() => goToStep(2)}
            onPrev={() => goToStep(0)}
          />
        )}
        {step === 1 && wkly?.flow === 'ka' && (
          <PlaceholderStep
            T={T} title="Step 1: KA順送り（実装中）"
            note="KAを1つずつ確認するUIは Phase 4 で実装します。"
            onPrev={() => goToStep(0)}
            onNext={() => goToStep(2)}
          />
        )}
        {step === 2 && (
          <PlaceholderStep
            T={T}
            title={wkly?.withDiscussion ? 'Step 2: 課題・依頼事項 + 確認事項（実装中）' : 'Step 2: 確認事項（実装中）'}
            note="このステップは Phase 5 で実装します。"
            onPrev={() => goToStep(1)}
            onNext={finishMeeting}
            nextLabel="会議を終了 →"
          />
        )}
        {step === 3 && (
          <Step3Done
            T={T} session={session} scope={scopePreview} meeting={meeting}
            onReset={resetMeeting} onSwitchToList={onSwitchToList}
          />
        )}
      </div>
    </div>
  )
}

// ─── Step 0: 開始画面 ───────────────────────────────────────────────────────
function Step0Preparation({ T, meeting, weekStart, myName, scope, session, onStart, onSwitchToList }) {
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

      {/* 開始 / 一覧モード切替 */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onStart} disabled={!scope}
          style={{
            padding: '14px 32px', borderRadius: 10, border: 'none', cursor: scope ? 'pointer' : 'wait',
            background: scope ? T.accent : T.borderMid, color: '#fff',
            fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
          <span style={{ fontSize: 18 }}>▶️</span> 会議を開始
          {myName && <span style={{ fontSize: 11, opacity: 0.85 }}>（ファシリ: {myName}）</span>}
        </button>
        {onSwitchToList && (
          <button onClick={onSwitchToList} style={{
            padding: '14px 20px', borderRadius: 10, border: `1px solid ${T.borderMid}`,
            background: 'transparent', color: T.textSub, cursor: 'pointer',
            fontSize: 13, fontFamily: 'inherit',
          }}>
            📋 一覧モードで開く
          </button>
        )}
      </div>

      {session?.facilitator && session?.step === 0 && (
        <div style={{ marginTop: 16, fontSize: 11, color: T.textMuted, textAlign: 'center' }}>
          前回ファシリ: {session.facilitator}（{formatTime(session.started_at)}）
        </div>
      )}
    </div>
  )
}

// ─── Step 1: KR順送り（Phase 3-1: ナビ枠 + 現在KR表示） ─────────────────────
function Step1KRLoop({ T, meeting, weekStart, levels, members, session, onUpdateSession, onAdvanceToStep2, onPrev }) {
  const wkly = meeting?.weeklyMTG
  const [items, setItems] = useState(null) // [{ level, objective, kr }, ...] in order

  // scope 内の KR を順序付きで集める（depth=2 全チーム or depth=1 全事業部、当四半期）
  useEffect(() => {
    let alive = true
    const load = async () => {
      // 1) スコープ内の levels
      let scopeLevelIds = []
      if (wkly?.scope === 'all-teams') {
        scopeLevelIds = levels.filter(l => {
          if (l.parent_id == null) return false
          const p = levels.find(x => Number(x.id) === Number(l.parent_id))
          return p && p.parent_id == null
        }).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(l => l.id)
      } else if (wkly?.scope === 'all-departments') {
        scopeLevelIds = levels.filter(l => l.parent_id == null)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(l => l.id)
      }
      if (scopeLevelIds.length === 0) { if (alive) setItems([]); return }

      // 2) 当四半期の Objective を取得
      const fy = weekStart.slice(0, 4) // 年度近似(粗いが現状の派生でOK)
      const month = Number(weekStart.slice(5, 7))
      const q = month >= 4 && month <= 6 ? 'q1' : month >= 7 && month <= 9 ? 'q2' : month >= 10 && month <= 12 ? 'q3' : 'q4'
      const periodKeys = [q, `${fy}_${q}`] // 年度プレフィックスあり/なし両対応

      const { data: objs } = await supabase.from('objectives')
        .select('id, level_id, period, title, owner, parent_objective_id')
        .in('level_id', scopeLevelIds)
        .in('period', periodKeys)
        .range(0, 49999)

      const objIds = (objs || []).map(o => o.id)
      let krs = []
      if (objIds.length > 0) {
        const { data } = await supabase.from('key_results')
          .select('id, title, target, current, unit, owner, objective_id, lower_is_better')
          .in('objective_id', objIds)
          .range(0, 49999)
        krs = data || []
      }

      // 3) 順序組み立て: level 順 → objective 順 → kr 順
      const byLevel = new Map(scopeLevelIds.map(id => [id, []]))
      ;(objs || []).forEach(o => {
        if (byLevel.has(o.level_id)) byLevel.get(o.level_id).push(o)
      })
      const built = []
      for (const lvlId of scopeLevelIds) {
        const lvl = levels.find(l => Number(l.id) === Number(lvlId))
        const lvlObjs = (byLevel.get(lvlId) || []).sort((a, b) => a.id - b.id)
        for (const o of lvlObjs) {
          const objKrs = krs.filter(k => Number(k.objective_id) === Number(o.id)).sort((a, b) => a.id - b.id)
          for (const kr of objKrs) {
            built.push({ level: lvl, objective: o, kr })
          }
        }
      }
      if (alive) setItems(built)
    }
    load()
    return () => { alive = false }
  }, [wkly?.scope, weekStart, levels])

  if (items === null) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>KR一覧を読み込み中...</div>
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
  let currentIdx = items.findIndex(it => Number(it.kr.id) === Number(session?.current_item_id))
  if (currentIdx === -1) currentIdx = 0
  const current = items[currentIdx]
  const currentKR = current.kr
  const currentObj = current.objective
  const currentLevel = current.level

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
    await onUpdateSession({ current_item_id: items[idx].kr.id })
  }

  // 進捗計算
  const progress = currentKR.target > 0
    ? Math.min(150, Math.round((currentKR.lower_is_better
        ? Math.max(0, ((currentKR.target * 2 - currentKR.current) / currentKR.target) * 100)
        : (currentKR.current / currentKR.target) * 100)))
    : 0
  const progressColor = progress >= 100 ? T.success : progress >= 60 ? T.accent : T.danger

  const ownerMember = members.find(m => m.name === currentKR.owner)
  const ownerColor = avatarColor(currentKR.owner)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
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

      {/* 現在のKR カード */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: '22px 26px', marginBottom: 18, position: 'relative',
      }}>
        {/* 階層パンくず */}
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{currentLevel?.icon || '🏢'}</span>
          <strong style={{ color: T.textSub }}>{currentLevel?.name}</strong>
          <span>›</span>
          <span style={{ color: T.textSub }}>{currentObj?.title}</span>
          <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 99, background: `${T.accent}20`, color: T.accent, fontWeight: 700, fontSize: 10 }}>
            {(currentObj?.period || '').replace(/^.+_/, '').toUpperCase()}
          </span>
        </div>

        {/* KRタイトル */}
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text, lineHeight: 1.4, marginBottom: 14 }}>
          {currentKR.title}
        </div>

        {/* 担当 + 数値 + 進捗 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar name={currentKR.owner} avatarUrl={ownerMember?.avatar_url} size={28} />
            <span style={{ fontSize: 13, fontWeight: 700, color: ownerColor }}>{currentKR.owner || '(担当未設定)'}</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: progressColor }}>{currentKR.current ?? 0}</span>
            <span style={{ fontSize: 12, color: T.textMuted }}>{currentKR.unit}</span>
            <span style={{ fontSize: 12, color: T.textMuted }}>/</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.textSub }}>{currentKR.target ?? 0}</span>
            <span style={{ fontSize: 12, color: T.textMuted }}>{currentKR.unit}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: progressColor, minWidth: 60, textAlign: 'right' }}>{progress}%</div>
        </div>

        {/* 進捗バー */}
        <div style={{ height: 8, background: T.bgSection, borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${Math.min(100, progress)}%`, background: progressColor, transition: 'width 0.3s' }} />
        </div>

        {/* Phase 3-2 で天気 / good / more / focus 編集を入れる予定 */}
        <div style={{
          marginTop: 16, padding: '10px 14px', background: T.bgSection,
          borderRadius: 8, fontSize: 11, color: T.textMuted, fontStyle: 'italic',
        }}>
          💡 数値・天気・good/more/focus の編集UIは Phase 3-2 で追加予定。今は表示のみ。
        </div>
      </div>

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

// ─── Step 3: 終了画面 ────────────────────────────────────────────────────────
function Step3Done({ T, session, scope, meeting, onReset, onSwitchToList }) {
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

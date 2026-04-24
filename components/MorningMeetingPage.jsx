'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// 🌅 朝会タブ (ヘッダーから遷移)
//   ステップ1: メンバー順番報告 (昨日の振り返り + 今日のタスク)
//   ステップ2: 確認事項タイム
//   進行状態は morning_meetings テーブルで全員同期

// ─── テーマ ─────────────────────────────────────────────────
const DARK_T = {
  bg:'#090d18', bgCard:'#0e1420', bgCard2:'#141b2b', sectionBg:'rgba(255,255,255,0.03)',
  border:'rgba(255,255,255,0.09)', borderMid:'rgba(255,255,255,0.15)',
  text:'#e8eaf0', textSub:'#a0a8be', textMuted:'#606880', textFaint:'#404660',
  accent:'#4d9fff', accentBg:'rgba(77,159,255,0.13)',
  success:'#00d68f', successBg:'rgba(0,214,143,0.13)',
  warn:'#ffd166', warnBg:'rgba(255,209,102,0.13)',
  danger:'#ff6b6b', dangerBg:'rgba(255,107,107,0.13)',
}
const LIGHT_T = {
  bg:'#f5f7fb', bgCard:'#ffffff', bgCard2:'#f7f9fc', sectionBg:'rgba(0,0,0,0.03)',
  border:'rgba(0,0,0,0.08)', borderMid:'rgba(0,0,0,0.12)',
  text:'#1a1f36', textSub:'#4a5270', textMuted:'#7080a0', textFaint:'#90a0bc',
  accent:'#4d9fff', accentBg:'rgba(77,159,255,0.13)',
  success:'#00a871', successBg:'rgba(0,214,143,0.13)',
  warn:'#d39e00', warnBg:'rgba(255,209,102,0.13)',
  danger:'#d64545', dangerBg:'rgba(255,107,107,0.13)',
}
const M_THEMES = { dark: DARK_T, light: LIGHT_T }

// ─── JST 日付ユーティリティ ──────────────────────────────────
function toJSTDateStr(d) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().split('T')[0]
}
function jstWeekday(d) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return ['日','月','火','水','木','金','土'][jst.getUTCDay()]
}
function getYesterdayJSTDateStr() {
  const d = new Date(Date.now() - 86400000)
  return toJSTDateStr(d)
}
function parseLogContent(s) { try { return JSON.parse(s) } catch { return {} } }

// ─── メイン ──────────────────────────────────────────────────
export default function MorningMeetingPage({ user, members = [], themeKey = 'dark' }) {
  const T = M_THEMES[themeKey] || DARK_T

  const meetingDate = toJSTDateStr(new Date())
  const todayLabel = (() => {
    const j = new Date(Date.now() + 9 * 3600 * 1000)
    return `${j.getUTCMonth() + 1}/${j.getUTCDate()}(${jstWeekday(new Date())})`
  })()

  // 参加対象メンバー (sort_order 順)
  const sortedMembers = useMemo(() => {
    return [...(members || [])].sort((a, b) =>
      (a.sort_order ?? 999) - (b.sort_order ?? 999) || (a.name || '').localeCompare(b.name || ''))
  }, [members])

  const myMember = members.find(m => m.email === user?.email)
  const myName = myMember?.name || ''

  // ミーティング状態
  const [meeting, setMeeting] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadMeeting = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('morning_meetings')
      .select('*').eq('meeting_date', meetingDate).maybeSingle()
    setMeeting(data || null)
    setLoading(false)
  }, [meetingDate])

  useEffect(() => { loadMeeting() }, [loadMeeting])

  // Realtime 同期 (meeting / confirmations / replies)
  useEffect(() => {
    const ch = supabase.channel('morning_meeting_' + meetingDate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'morning_meetings' }, () => loadMeeting())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [meetingDate, loadMeeting])

  // 朝会開始 (まだレコード無ければ作成)
  const startMeeting = async () => {
    const firstSpeaker = sortedMembers[0]?.name || null
    const { error } = await supabase.from('morning_meetings').insert({
      meeting_date: meetingDate, step: 1,
      current_speaker: firstSpeaker, completed_speakers: [],
    })
    if (error) { alert('朝会開始に失敗: ' + error.message); return }
    loadMeeting()
  }

  // 次の発表者へ
  const goNextSpeaker = async () => {
    if (!meeting) return
    const completed = [...(meeting.completed_speakers || [])]
    if (meeting.current_speaker && !completed.includes(meeting.current_speaker)) {
      completed.push(meeting.current_speaker)
    }
    const next = sortedMembers.find(m => !completed.includes(m.name))
    const nextSpeaker = next?.name || null
    // 全員終わったらステップ2へ
    const step = nextSpeaker ? 1 : 2
    const { error } = await supabase.from('morning_meetings').update({
      current_speaker: nextSpeaker, completed_speakers: completed, step,
    }).eq('id', meeting.id)
    if (error) { alert('進行に失敗: ' + error.message); return }
    loadMeeting()
  }

  // 前の発表者へ
  const goPrevSpeaker = async () => {
    if (!meeting) return
    const completed = [...(meeting.completed_speakers || [])]
    if (completed.length === 0) return
    const prevSpeaker = completed.pop()
    const { error } = await supabase.from('morning_meetings').update({
      current_speaker: prevSpeaker, completed_speakers: completed, step: 1,
    }).eq('id', meeting.id)
    if (error) { alert('戻る操作失敗: ' + error.message); return }
    loadMeeting()
  }

  const goToSpeaker = async (name) => {
    if (!meeting) return
    const prevIdx = sortedMembers.findIndex(m => m.name === name)
    if (prevIdx < 0) return
    const completed = sortedMembers.slice(0, prevIdx).map(m => m.name)
    const { error } = await supabase.from('morning_meetings').update({
      current_speaker: name, completed_speakers: completed, step: 1,
    }).eq('id', meeting.id)
    if (error) { alert('切替失敗: ' + error.message); return }
    loadMeeting()
  }

  const goStep2 = async () => {
    if (!meeting) return
    const { error } = await supabase.from('morning_meetings').update({ step: 2 }).eq('id', meeting.id)
    if (error) { alert('ステップ2遷移失敗: ' + error.message); return }
    loadMeeting()
  }

  const backToStep1 = async () => {
    if (!meeting) return
    const { error } = await supabase.from('morning_meetings').update({ step: 1 }).eq('id', meeting.id)
    if (error) { alert('ステップ1戻り失敗: ' + error.message); return }
    loadMeeting()
  }

  const finishMeeting = async () => {
    if (!meeting) return
    if (!window.confirm('朝会を終了してよろしいですか?')) return
    const { error } = await supabase.from('morning_meetings').update({
      step: 3, finished_at: new Date().toISOString(),
    }).eq('id', meeting.id)
    if (error) { alert('終了失敗: ' + error.message); return }
    loadMeeting()
  }

  const resetMeeting = async () => {
    if (!meeting) return
    if (!window.confirm('朝会をリセットして最初から始めますか?')) return
    const firstSpeaker = sortedMembers[0]?.name || null
    const { error } = await supabase.from('morning_meetings').update({
      step: 1, current_speaker: firstSpeaker, completed_speakers: [], finished_at: null,
    }).eq('id', meeting.id)
    if (error) { alert('リセット失敗: ' + error.message); return }
    loadMeeting()
  }

  if (loading) {
    return <div style={{ padding: 40, color: T.textMuted, fontSize: 13 }}>読み込み中...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        {/* ヘッダ */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0 }}>🌅 朝会</h1>
          <span style={{ fontSize: 12, color: T.textMuted }}>{todayLabel}</span>
          <div style={{ flex: 1 }} />
          {meeting && meeting.step < 3 && (
            <button onClick={resetMeeting} style={btnSt(T)}>↻ リセット</button>
          )}
        </div>

        {/* 未開始 */}
        {!meeting && (
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 40, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🌅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>
              今日の朝会はまだ始まっていません
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20 }}>
              開始するとメンバー {sortedMembers.length} 人で順に昨日の振り返りと今日のタスクを共有します
            </div>
            <button onClick={startMeeting} disabled={sortedMembers.length === 0} style={{
              padding: '10px 28px', borderRadius: 10,
              background: 'linear-gradient(135deg, #ff9f43 0%, #f97316 100%)',
              color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              cursor: sortedMembers.length ? 'pointer' : 'not-allowed',
              boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
            }}>🌅 朝会を開始する</button>
          </div>
        )}

        {/* 開催中 (step 1 or 2) */}
        {meeting && meeting.step < 3 && (
          <>
            {/* 進行ステップ表示 */}
            <StepHeader T={T} step={meeting.step} onJumpToStep={async (s) => {
              if (s === 1) await backToStep1()
              else if (s === 2) await goStep2()
            }} />

            {/* ステップ1 */}
            {meeting.step === 1 && (
              <Step1Report T={T} members={sortedMembers} meeting={meeting}
                onNext={goNextSpeaker} onPrev={goPrevSpeaker} onJump={goToSpeaker}
                onSkipToStep2={goStep2} />
            )}

            {/* ステップ2 */}
            {meeting.step === 2 && (
              <Step2Confirmations T={T} members={sortedMembers} myName={myName}
                onBack={backToStep1} onFinish={finishMeeting} />
            )}
          </>
        )}

        {/* 終了 */}
        {meeting && meeting.step === 3 && (
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 40, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🏁</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>
              今日の朝会は終了しました
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 20 }}>
              {meeting.finished_at && `終了時刻: ${jstHHMM(meeting.finished_at)}`}
            </div>
            <button onClick={resetMeeting} style={btnSt(T, T.accent)}>↻ もう一度始める</button>
          </div>
        )}
      </div>
    </div>
  )
}

function jstHHMM(iso) {
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const h = String(jst.getUTCHours()).padStart(2, '0')
  const m = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function btnSt(T, color) {
  return {
    padding: '6px 14px', borderRadius: 7,
    background: 'transparent', color: color || T.textSub,
    border: `1px solid ${color ? color + '60' : T.border}`,
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  }
}

// ─── ステップヘッダー (現在のステップ / クリックで切替) ─────────
function StepHeader({ T, step, onJumpToStep }) {
  const steps = [
    { n: 1, label: '個別報告' },
    { n: 2, label: '確認事項タイム' },
  ]
  return (
    <div style={{
      display: 'flex', gap: 6, marginBottom: 16, padding: 6,
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
    }}>
      {steps.map(s => {
        const active = step === s.n
        return (
          <button key={s.n} onClick={() => onJumpToStep(s.n)} style={{
            flex: 1, padding: '10px 14px', borderRadius: 7, border: 'none',
            background: active ? T.accent : 'transparent',
            color: active ? '#fff' : T.textSub,
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: active ? 'rgba(255,255,255,0.25)' : T.border,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800,
            }}>{s.n}</span>
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── ステップ1: 個別報告 ───────────────────────────────────────
function Step1Report({ T, members, meeting, onNext, onPrev, onJump, onSkipToStep2 }) {
  const current = meeting.current_speaker
  const completed = new Set(meeting.completed_speakers || [])
  const currentMember = members.find(m => m.name === current)
  const allDone = members.every(m => completed.has(m.name))

  return (
    <>
      {/* 進行状況サマリー (メンバーリスト) */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
        padding: 12, marginBottom: 14,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 8 }}>
          メンバー進行状況 ({completed.size} / {members.length})
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {members.map(m => {
            const isDone = completed.has(m.name)
            const isCurrent = m.name === current
            return (
              <button key={m.name} onClick={() => onJump(m.name)} style={{
                padding: '4px 10px', borderRadius: 99, border: 'none',
                background: isCurrent ? T.accent : isDone ? T.successBg : T.sectionBg,
                color: isCurrent ? '#fff' : isDone ? T.success : T.textSub,
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span>{isCurrent ? '🟢' : isDone ? '✅' : '⬜'}</span>
                <span>{m.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 現在の発表者 */}
      {currentMember ? (
        <SpeakerReport T={T} member={currentMember} />
      ) : allDone ? (
        <div style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: 30, textAlign: 'center', marginBottom: 14,
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>全員の報告が完了しました</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>ステップ2に進んで確認事項タイムへ</div>
        </div>
      ) : null}

      {/* 進行ボタン */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button onClick={onPrev} disabled={completed.size === 0} style={{
          ...btnSt(T),
          opacity: completed.size === 0 ? 0.4 : 1,
          cursor: completed.size === 0 ? 'not-allowed' : 'pointer',
        }}>⏮ 前の人</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {allDone && (
            <button onClick={onSkipToStep2} style={{
              padding: '8px 18px', borderRadius: 8,
              background: T.accent, color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>ステップ2へ →</button>
          )}
          {!allDone && (
            <button onClick={onNext} style={{
              padding: '8px 18px', borderRadius: 8,
              background: T.accent, color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>⏭ 次の人へ</button>
          )}
        </div>
      </div>
    </>
  )
}

// ─── 発表者の昨日の振り返り + 今日のタスク ─────────────────────
function SpeakerReport({ T, member }) {
  const [kpt, setKpt] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const yesterday = getYesterdayJSTDateStr()
  const today = toJSTDateStr(new Date())

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      // 昨日の KPT (coaching_logs)
      const { data: kpts } = await supabase.from('coaching_logs')
        .select('*').eq('owner', member.name).eq('log_type', 'kpt')
        .gte('created_at', yesterday + 'T00:00:00+09:00')
        .lt('created_at', today + 'T00:00:00+09:00')
        .order('created_at', { ascending: false }).limit(1)
      // 今日のタスク
      const { data: ts } = await supabase.from('ka_tasks')
        .select('id, title, due_date, done, status')
        .eq('assignee', member.name).eq('due_date', today)
        .order('id', { ascending: false })
      if (!alive) return
      const kptContent = kpts?.[0] ? parseLogContent(kpts[0].content) : null
      setKpt(kptContent)
      setTasks(ts || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [member.name, yesterday, today])

  const doneCnt = tasks.filter(t => t.done || t.status === 'done').length

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `4px solid #ff9f43`,
      borderRadius: 12, padding: 20, marginBottom: 14,
    }}>
      {/* 発表者ヘッダ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#ff9f43', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800,
        }}>{member.name.charAt(0)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{member.name}</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>{member.role || ''}</div>
        </div>
        <div style={{
          padding: '4px 12px', borderRadius: 99,
          background: 'rgba(255,159,67,0.15)', color: '#ff9f43',
          fontSize: 11, fontWeight: 700,
        }}>🎤 発表中</div>
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>読み込み中...</div>
      ) : (
        <>
          {/* 昨日の振り返り */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 8 }}>
              📝 昨日の振り返り
            </div>
            {kpt ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <KPTRow T={T} label="Keep"    color={T.success} text={kpt.keep} />
                <KPTRow T={T} label="Problem" color={T.warn}    text={kpt.problem} />
                <KPTRow T={T} label="Try"     color={T.accent}  text={kpt.try} />
              </div>
            ) : (
              <div style={{
                padding: 10, fontSize: 11, color: T.textMuted, fontStyle: 'italic',
                background: T.sectionBg, borderRadius: 6,
              }}>振り返りが未入力です</div>
            )}
          </div>

          {/* 今日のタスク */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 8 }}>
              📅 今日のタスク
              <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 99,
                background: T.sectionBg, color: T.textMuted,
                fontSize: 10, fontWeight: 700 }}>完了 {doneCnt} / 全 {tasks.length}</span>
            </div>
            {tasks.length === 0 ? (
              <div style={{
                padding: 10, fontSize: 11, color: T.textMuted, fontStyle: 'italic',
                background: T.sectionBg, borderRadius: 6,
              }}>今日のタスクは未登録です</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tasks.map(t => {
                  const isDone = t.done || t.status === 'done'
                  return (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px',
                      background: isDone ? T.successBg : T.sectionBg,
                      borderRadius: 6, fontSize: 12,
                      color: isDone ? T.textMuted : T.text,
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}>
                      <span>{isDone ? '✅' : '⬜'}</span>
                      <span>{t.title || '(無題)'}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function KPTRow({ T, label, color, text }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, minWidth: 66, padding: '3px 8px', borderRadius: 5,
        background: color + '20', color, fontSize: 10, fontWeight: 700, textAlign: 'center',
      }}>{label}</span>
      <span style={{
        flex: 1, fontSize: 12, color: T.text,
        whiteSpace: 'pre-wrap', lineHeight: 1.55,
        padding: '3px 2px',
      }}>{text || <span style={{ color: T.textMuted, fontStyle: 'italic' }}>(未入力)</span>}</span>
    </div>
  )
}

// ─── ステップ2: 確認事項タイム ────────────────────────────────
function Step2Confirmations({ T, members, myName, onBack, onFinish }) {
  const [items, setItems] = useState([])
  const [replies, setReplies] = useState({})
  const [loading, setLoading] = useState(true)
  const [filterTo, setFilterTo] = useState('') // '' = 全員

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('member_confirmations')
      .select('*').eq('status', 'open').order('created_at', { ascending: false })
    setItems(data || [])
    if (data && data.length > 0) {
      const ids = data.map(d => d.id)
      const { data: reps } = await supabase.from('member_confirmation_replies')
        .select('*').in('confirmation_id', ids).order('created_at', { ascending: true })
      const m = {}
      for (const r of (reps || [])) {
        if (!m[r.confirmation_id]) m[r.confirmation_id] = []
        m[r.confirmation_id].push(r)
      }
      setReplies(m)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('morning_step2_confirmations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_confirmations' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_confirmation_replies' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const resolve = async (id) => {
    const { error } = await supabase.from('member_confirmations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('確認済み化失敗: ' + error.message); return }
    load()
  }

  const filtered = filterTo ? items.filter(i => i.to_name === filterTo) : items

  return (
    <>
      {/* フィルタ + 件数 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
        padding: '8px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
          🟠 未解決の確認事項 {filtered.length}件
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: T.textMuted }}>宛先:</span>
        <select value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{
          padding: '4px 8px', borderRadius: 6,
          background: T.bg, border: `1px solid ${T.border}`,
          color: T.text, fontSize: 11, fontFamily: 'inherit', outline: 'none',
        }}>
          <option value="">全員</option>
          {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
      </div>

      {/* リスト */}
      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: 30, textAlign: 'center', color: T.textMuted, fontSize: 12,
          background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: 10,
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✨</div>
          未解決の確認事項はありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {filtered.map(it => (
            <MeetingConfirmCard key={it.id} T={T} item={it}
              replies={replies[it.id] || []} myName={myName}
              onResolve={() => resolve(it.id)} onReplied={load} />
          ))}
        </div>
      )}

      {/* 進行ボタン */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 14 }}>
        <button onClick={onBack} style={btnSt(T)}>⏮ ステップ1に戻る</button>
        <button onClick={onFinish} style={{
          padding: '8px 22px', borderRadius: 8,
          background: T.success, color: '#fff', border: 'none',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        }}>🏁 朝会を終了</button>
      </div>
    </>
  )
}

// 朝会中の確認事項カード (返信 + 解決化 可能)
function MeetingConfirmCard({ T, item, replies, myName, onResolve, onReplied }) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)

  const send = async () => {
    if (!replyText.trim() || saving) return
    setSaving(true)
    const { error } = await supabase.from('member_confirmation_replies').insert({
      confirmation_id: item.id, from_name: myName, content: replyText.trim(),
    })
    setSaving(false)
    if (error) { alert('返信失敗: ' + error.message); return }
    setReplyText(''); setReplyOpen(false); onReplied()
  }

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `3px solid #ff9f43`,
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: T.textMuted }}>from</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{item.from_name}</span>
        <span style={{ fontSize: 11, color: T.textFaint }}>→</span>
        <span style={{ fontSize: 12, color: T.textMuted }}>to</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{item.to_name}</span>
      </div>
      <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.6, padding: '4px 2px' }}>
        {item.content}
      </div>
      {replies.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${T.border}` }}>
          {replies.map(r => (
            <div key={r.id} style={{ marginBottom: 6, fontSize: 11 }}>
              <b style={{ color: T.textSub }}>{r.from_name}</b>
              <span style={{ color: T.text, marginLeft: 6, whiteSpace: 'pre-wrap' }}>{r.content}</span>
            </div>
          ))}
        </div>
      )}
      {replyOpen && (
        <div style={{ marginTop: 8 }}>
          <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
            placeholder="回答を入力" rows={2}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12,
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
              color: T.text, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
            }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
            <button onClick={() => { setReplyOpen(false); setReplyText('') }} style={btnSt(T)}>キャンセル</button>
            <button onClick={send} disabled={!replyText.trim() || saving} style={{
              padding: '4px 12px', borderRadius: 6,
              background: replyText.trim() ? T.accent : T.border, color: '#fff', border: 'none',
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              cursor: replyText.trim() && !saving ? 'pointer' : 'not-allowed',
            }}>{saving ? '送信中…' : '送信'}</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {!replyOpen && <button onClick={() => setReplyOpen(true)} style={btnSt(T)}>💬 返信</button>}
        <button onClick={onResolve} style={btnSt(T, T.success)}>✓ 確認済みにする</button>
      </div>
    </div>
  )
}

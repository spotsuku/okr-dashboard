'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { MEETING_URLS } from '../lib/meetings'
import { openNotionUrl } from '../lib/notionLink'
import MeetingImport from './MeetingImport'
import { ComposeModal } from './ConfirmationsTab'
import { COMMON_TOKENS } from '../lib/themeTokens'
import { HeroCard } from './iosUI'

// 🌅 朝会タブ (ヘッダーから遷移)
//   ステップ1: メンバー順番報告 (昨日の振り返り + 今日のタスク)
//   ステップ2: 確認事項タイム
//   ステップ3: ネクストアクション (誰がいつまでに何をやるか) — ka_tasks に保存
//   ステップ4: 終了
//   進行状態は morning_meetings テーブルで全員同期

// ─── テーマ ─────────────────────────────────────────────────
// テーマは lib/themeTokens.js で一元管理
const DARK_T  = { ...COMMON_TOKENS.dark }
const LIGHT_T = { ...COMMON_TOKENS.light }
const M_THEMES = { dark: DARK_T, light: LIGHT_T }

// ─── JST 日付ユーティリティ ──────────────────────────────────
function toJSTDateStr(d) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().split('T')[0]
}
// 「04:00 JST 境界」でのJST日付。深夜0〜4時は前日扱いにする
// (例: 火曜 1:00 に書いた振り返りは「月曜の振り返り」とみなす)
function toBoundaryJSTDateStr(d) {
  const ms = d.getTime() + 9 * 3600 * 1000
  const jst = new Date(ms)
  if (jst.getUTCHours() < 4) {
    return new Date(ms - 86400000).toISOString().split('T')[0]
  }
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
// 「前回の振り返り」を引く起点日 (JST)。月曜は金曜まで遡る。
function getPrevReviewJSTDateStr() {
  const now = new Date()
  const jstNow = new Date(now.getTime() + 9 * 3600 * 1000)
  const dow = jstNow.getUTCDay()  // 0=日, 1=月, ..., 6=土
  // 月曜は金曜 (3日前)、日曜は金曜 (2日前)、土曜は金曜 (1日前) まで遡る
  const daysBack = dow === 1 ? 3 : dow === 0 ? 2 : 1
  const d = new Date(now.getTime() - daysBack * 86400000)
  return toJSTDateStr(d)
}
function formatJSTMonthDay(dateStr) {
  // 'YYYY-MM-DD' → 'M/D(曜)'
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dow = ['日','月','火','水','木','金','土'][new Date(y, mo - 1, d).getDay()]
  return `${mo}/${d}(${dow})`
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

  // 開始画面で選ぶファシリ + 予定時間 (開始時にDBへ保存)
  const [facilitatorDraft, setFacilitatorDraft] = useState('')
  const [durationDraft, setDurationDraft]       = useState(30)
  useEffect(() => { if (myName && !facilitatorDraft) setFacilitatorDraft(myName) }, [myName, facilitatorDraft])
  // 既存レコードがあれば値をプリフィル (step=0 の準備画面で再編集できる)
  useEffect(() => {
    if (!meeting) return
    if (meeting.facilitator) setFacilitatorDraft(meeting.facilitator)
    if (meeting.duration_minutes) setDurationDraft(meeting.duration_minutes)
  }, [meeting?.id])

  // 10分前アラート (1度だけ通知) の制御
  const tenMinAlertedRef = useRef(false)
  useEffect(() => { tenMinAlertedRef.current = false }, [meeting?.id])
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { Notification.requestPermission() } catch {}
    }
  }, [])

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
    const dur = Math.max(5, Math.min(180, Number(durationDraft) || 30))
    const nowIso = new Date().toISOString()
    if (meeting && meeting.id) {
      // 既存レコード (step=0 や step=4 から開始) を step=1 に更新
      const { error } = await supabase.from('morning_meetings').update({
        step: 1,
        current_speaker: firstSpeaker, completed_speakers: [],
        facilitator: facilitatorDraft || null,
        duration_minutes: dur,
        started_at: nowIso,
        finished_at: null,
      }).eq('id', meeting.id)
      if (error) { alert('朝会開始に失敗: ' + error.message); return }
    } else {
      const { error } = await supabase.from('morning_meetings').insert({
        meeting_date: meetingDate, step: 1,
        current_speaker: firstSpeaker, completed_speakers: [],
        facilitator: facilitatorDraft || null,
        duration_minutes: dur,
        started_at: nowIso,
      })
      if (error) { alert('朝会開始に失敗: ' + error.message); return }
    }
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

  const setStep = async (s) => {
    if (!meeting) return
    const { error } = await supabase.from('morning_meetings').update({ step: s }).eq('id', meeting.id)
    if (error) { alert(`ステップ${s} 遷移失敗: ` + error.message); return }
    loadMeeting()
  }

  const goStep2     = () => setStep(2)
  const backToStep1 = () => setStep(1)
  const goStep3     = () => setStep(3)
  const backToStep2 = () => setStep(2)

  const finishMeeting = async () => {
    if (!meeting) return
    if (!window.confirm('朝会を終了してよろしいですか?')) return
    const { error } = await supabase.from('morning_meetings').update({
      step: 4, finished_at: new Date().toISOString(),
    }).eq('id', meeting.id)
    if (error) { alert('終了失敗: ' + error.message); return }
    loadMeeting()
  }

  // リセット: 開始ページ (step=0) に戻す
  const resetMeeting = async () => {
    if (!meeting) return
    if (!window.confirm('朝会をリセットして開始ページに戻りますか?')) return
    const { error } = await supabase.from('morning_meetings').update({
      step: 0, current_speaker: null, completed_speakers: [], finished_at: null,
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
          {meeting && meeting.step >= 1 && meeting.step < 4 && (
            <button onClick={resetMeeting} style={btnSt(T)}>↻ リセット</button>
          )}
        </div>

        {/* 開始ページ (未開始 or step=0) */}
        {(!meeting || meeting.step === 0) && (
          <MorningStartScreen
            T={T}
            todayLabel={todayLabel}
            members={sortedMembers}
            meeting={meeting}
            facilitatorDraft={facilitatorDraft}
            onFacilitatorChange={setFacilitatorDraft}
            durationDraft={durationDraft}
            onDurationChange={setDurationDraft}
            onStart={startMeeting}
          />
        )}

        {/* 開催中 (step 1〜3) */}
        {meeting && meeting.step >= 1 && meeting.step < 4 && (
          <>
            {/* 残り時間バナー */}
            <MorningTimerBanner T={T}
              startedAt={meeting.started_at}
              durationMinutes={meeting.duration_minutes ?? 30}
              tenMinAlertedRef={tenMinAlertedRef} />

            {/* ファシリ表示 */}
            {meeting.facilitator && (
              <div style={{
                marginBottom: 12, padding: '6px 12px',
                background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 8,
                fontSize: 11, color: T.textMuted,
              }}>
                👤 ファシリ: <strong style={{ color: T.text }}>{meeting.facilitator}</strong>
              </div>
            )}

            {/* 進行ステップ表示 */}
            <StepHeader T={T} step={meeting.step} onJumpToStep={async (s) => {
              if (s === 1) await backToStep1()
              else if (s === 2) await goStep2()
              else if (s === 3) await goStep3()
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
                onBack={backToStep1} onNext={goStep3} />
            )}

            {/* ステップ3: ネクストアクション */}
            {meeting.step === 3 && (
              <Step3NextActionsMorning T={T} meeting={meeting}
                members={sortedMembers}
                onBack={backToStep2} onFinish={finishMeeting} />
            )}
          </>
        )}

        {/* 終了 */}
        {meeting && meeting.step === 4 && (
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 40, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🏁</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>
              今日の朝会は終了しました
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 20 }}>
              {meeting.facilitator && <>ファシリ: {meeting.facilitator}　</>}
              {meeting.finished_at && `終了時刻: ${jstHHMM(meeting.finished_at)}`}
            </div>
            <button onClick={resetMeeting} style={btnSt(T, T.accent)}>↻ 開始ページに戻る</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 開始ページ (準備画面) ───────────────────────────────────
// 他の会議 (週次MTG Step0) 同様の作りで、ファシリ・予定時間・アジェンダ・
// 参加メンバー・Notion議事録案内をまとめて表示。
// !meeting (本日まだ無し) と meeting.step===0 (リセット後) の両方で使う。
function MorningStartScreen({ T, todayLabel, members = [], meeting, facilitatorDraft, onFacilitatorChange, durationDraft, onDurationChange, onStart }) {
  const isResume = !!(meeting && meeting.id) // リセット後 (記録あり) かどうか
  const noMembers = members.length === 0

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 0 40px' }}>
      {/* ヒーローカード (iPad 風) */}
      <HeroCard T={T}
        eyebrow="平日毎日"
        title="🌅 朝会"
        subtitle={`本日 ${todayLabel}${isResume ? ' ・ リセット済み' : ''}`}
        color="#FF9500"
      />

      {/* Notion 議事録案内 */}
      <div style={{
        marginBottom: 18, padding: '14px 18px',
        background: T.accentBg, border: `1px solid ${T.accent}40`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.accent, marginBottom: 4 }}>
          🎙 Notionで録音議事録をとってください
        </div>
        <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.6, marginBottom: 8 }}>
          朝会のNotionページを開いて、録音と議事録の作成を開始してください。
          会議の最後に、この議事録からネクストアクションを取り込めます。
        </div>
        <button onClick={() => {
          const url = MEETING_URLS['morning']
          if (!url) { alert('朝会のNotion URLが設定されていません'); return }
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
        padding: 18, marginBottom: 18,
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          会議の流れ
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.textSub, lineHeight: 1.8 }}>
          <li><strong style={{ color: T.text }}>個別報告</strong>：メンバーが順に「昨日の振り返り (KPT) と今日のタスク」を共有</li>
          <li><strong style={{ color: T.text }}>確認事項タイム</strong>：未解決の確認事項を返信・解決化</li>
          <li><strong style={{ color: T.text }}>ネクストアクション</strong>：誰がいつまでに何をやるかを記録</li>
          <li><strong style={{ color: T.text }}>会議終了</strong>：サマリー確認 → クローズ</li>
        </ol>
      </div>

      {/* 参加メンバー */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
        padding: 18, marginBottom: 18,
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          参加メンバー ({members.length}人)
        </div>
        {noMembers ? (
          <div style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>
            メンバーが登録されていません。組織設定からメンバーを追加してください。
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {members.map((m, idx) => (
              <span key={m.name} style={{
                padding: '4px 10px', borderRadius: 99,
                background: T.sectionBg, color: T.textSub,
                fontSize: 11, fontWeight: 600,
              }}>
                <span style={{ color: T.textMuted, marginRight: 4 }}>{idx + 1}.</span>{m.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ファシリテーター */}
      <div style={{
        marginBottom: 16, padding: '12px 16px', background: T.bgCard,
        border: `1px solid ${T.border}`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          本日のファシリテーター
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#ff9f43', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, flexShrink: 0,
          }}>{(facilitatorDraft || '?').charAt(0)}</div>
          <select value={facilitatorDraft || ''}
            onChange={e => onFacilitatorChange && onFacilitatorChange(e.target.value)}
            style={{
              flex: 1, background: T.bg, border: `1px solid ${T.borderMid}`, borderRadius: 7,
              padding: '8px 10px', fontSize: 13, color: T.text,
              cursor: 'pointer', fontFamily: 'inherit', outline: 'none', fontWeight: 700,
            }}>
            <option value="">-- ファシリ未選択 --</option>
            {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {/* 予定時間 */}
      <div style={{
        marginBottom: 22, padding: '12px 16px', background: T.bgCard,
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
                  background: active ? T.accentBg : 'transparent',
                  color: active ? T.accent : T.textSub,
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                }}>{m}分</button>
            )
          })}
          <input type="number" min={5} max={300} step={5}
            value={durationDraft || 30}
            onChange={e => onDurationChange && onDurationChange(Number(e.target.value) || 30)}
            style={{
              width: 70, background: T.bg, border: `1px solid ${T.borderMid}`, borderRadius: 7,
              padding: '6px 10px', color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none',
            }} />
          <span style={{ fontSize: 11, color: T.textMuted }}>分</span>
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
          会議開始から {durationDraft || 30}分で「終了予定」。残り10分でアラートが出ます。
        </div>
      </div>

      {/* 開始ボタン */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button onClick={onStart} disabled={noMembers} style={{
          padding: '14px 40px', borderRadius: 10, border: 'none',
          background: noMembers
            ? T.borderMid
            : 'linear-gradient(135deg, #ff9f43 0%, #f97316 100%)',
          color: '#fff',
          fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
          cursor: noMembers ? 'not-allowed' : 'pointer',
          boxShadow: noMembers ? 'none' : '0 4px 14px rgba(249,115,22,0.3)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>▶️</span>
          {isResume ? '朝会をもう一度開始する' : '朝会を開始する'}
          {facilitatorDraft && <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>（ファシリ: {facilitatorDraft}）</span>}
        </button>
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
    { n: 3, label: 'ネクストアクション' },
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
  // kptList: { dateLabel, keep, problem, try }[]  (新しい順 = 直近が上)
  const [kptList, setKptList] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  // 月曜は金曜まで遡って KPT を取得 (週末で前日が休みのケースに対応)
  // 範囲が複数日にまたがる場合は範囲内の全KPT (土日含む) を表示する
  const yesterday = getPrevReviewJSTDateStr()
  const today = toJSTDateStr(new Date())

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      // 範囲内の KPT (coaching_logs) を全件取得 (新しい順)
      // 上限を「今日 00:00」で切ると、今朝入力した KPT が範囲外で取れないため
      // 上限なし (= NOW まで) にして、今日入力したものも拾う。
      const { data: kpts } = await supabase.from('coaching_logs')
        .select('*').eq('owner', member.name).eq('log_type', 'kpt')
        .gte('created_at', yesterday + 'T00:00:00+09:00')
        .order('created_at', { ascending: false }).limit(20)
      // 今日のタスク
      const { data: ts } = await supabase.from('ka_tasks')
        .select('id, title, due_date, done, status')
        .eq('assignee', member.name).eq('due_date', today)
        .order('id', { ascending: false })
      if (!alive) return
      // 日付ごとに最新1件だけ採用 (同じ日に複数KPTがあれば直近のみ)
      // 04:00 JST 境界: 深夜0〜4時に書かれた振り返りは「前日の振り返り」として扱う
      const byDate = new Map()
      for (const row of (kpts || [])) {
        const dateStr = toBoundaryJSTDateStr(new Date(row.created_at))
        if (byDate.has(dateStr)) continue
        const c = parseLogContent(row.content)
        byDate.set(dateStr, {
          dateStr,
          dateLabel: formatJSTMonthDay(dateStr),
          keep: c.keep, problem: c.problem, try: c.try,
        })
      }
      // 新しい日付が上に来るように
      const list = Array.from(byDate.values())
        .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1))
      setKptList(list)
      setTasks(ts || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [member.name, yesterday, today])

  const doneCnt = tasks.filter(t => t.done || t.status === 'done').length

  return (
    <div style={{
      background: `linear-gradient(180deg, ${T.bgCard} 0%, #ff9f4308 100%)`,
      border: `1px solid #ff9f4326`,
      borderRadius: 18, padding: '22px 24px', marginBottom: 14,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(255,159,67,0.10), 0 16px 40px rgba(0,0,0,0.04)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* 上端に色グラデ帯 (左太線の代わり) */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, #ff9f43 0%, #f9731680 100%)',
      }} />
      <div aria-hidden style={{
        position: 'absolute', top: -50, right: -30, width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(255,159,67,0.10) 0%, transparent 60%)',
        pointerEvents: 'none', borderRadius: '50%',
      }} />
      {/* 発表者ヘッダ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, position: 'relative', zIndex: 1 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, flexShrink: 0,
          background: 'linear-gradient(135deg, #ff9f43 0%, #f97316 100%)',
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 900,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px rgba(255,159,67,0.45)',
        }}>{member.name.charAt(0)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>{member.name}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{member.role || ''}</div>
        </div>
        <div style={{
          padding: '5px 14px', borderRadius: 99,
          background: 'linear-gradient(135deg, #ff9f43 0%, #f97316 100%)',
          color: '#fff',
          fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
          boxShadow: '0 2px 6px rgba(255,159,67,0.45)',
        }}>🎤 発表中</div>
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>読み込み中...</div>
      ) : (
        <>
          {/* 前回の振り返り (月曜は金〜日の全KPTを表示) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 8 }}>
              📝 前回の振り返り
            </div>
            {kptList.length === 0 ? (
              <div style={{
                padding: 10, fontSize: 11, color: T.textMuted, fontStyle: 'italic',
                background: T.sectionBg, borderRadius: 6,
              }}>振り返りが未入力です</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {kptList.map(k => (
                  <div key={k.dateStr} style={{
                    padding: '10px 12px',
                    background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                      📅 {k.dateLabel}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <KPTRow T={T} label="Keep"    color={T.success} text={k.keep} />
                      <KPTRow T={T} label="Problem" color={T.warn}    text={k.problem} />
                      <KPTRow T={T} label="Try"     color={T.accent}  text={k.try} />
                    </div>
                  </div>
                ))}
              </div>
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
function Step2Confirmations({ T, members, myName, onBack, onNext }) {
  const [items, setItems] = useState([])
  const [replies, setReplies] = useState({})
  const [loading, setLoading] = useState(true)
  const [filterTo, setFilterTo] = useState('') // '' = 全員
  const [composing, setComposing] = useState(false) // 新規追加モーダル

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
      {/* フィルタ + 件数 + 追加 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap',
        padding: '8px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
          🟠 未解決の確認事項 {filtered.length}件
        </span>
        <button onClick={() => setComposing(true)} style={{
          padding: '5px 12px', borderRadius: 6, border: 'none',
          background: T.accent, color: '#fff',
          fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        }}>＋ 追加</button>
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

      {composing && (
        <ComposeModal T={{ ...T, borderMid: T.border }} myName={myName} members={members}
          onClose={() => setComposing(false)}
          onSaved={() => { setComposing(false); load() }} />
      )}

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
        <button onClick={onNext} style={{
          padding: '8px 22px', borderRadius: 8,
          background: T.accent, color: '#fff', border: 'none',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        }}>ステップ3 (ネクストアクション) へ →</button>
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

// ─── 残り時間バナー (10分前にブラウザ通知) ─────────────────────
function MorningTimerBanner({ T, startedAt, durationMinutes, tenMinAlertedRef }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000)
    return () => clearInterval(id)
  }, [])
  if (!startedAt) return null

  const startMs   = new Date(startedAt).getTime()
  const endMs     = startMs + (durationMinutes || 30) * 60 * 1000
  const remaining = endMs - now
  const remainingMin = Math.floor(remaining / 60000)
  const elapsedMin   = Math.floor((now - startMs) / 60000)
  const isOver  = remaining < 0
  const isTen   = !isOver && remainingMin <= 10
  const isFive  = !isOver && remainingMin <= 5
  const ratio   = Math.max(0, Math.min(1, (now - startMs) / ((durationMinutes || 30) * 60 * 1000)))

  useEffect(() => {
    if (!isTen || isOver) return
    if (tenMinAlertedRef.current) return
    tenMinAlertedRef.current = true
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('⏰ 朝会 残り10分', { body: '朝会の終了予定まで残り 10 分です' })
      }
    } catch {}
  }, [isTen, isOver, tenMinAlertedRef])

  const bg     = isOver ? T.dangerBg : isFive ? T.dangerBg : isTen ? T.warnBg : T.bgCard
  const border = isOver ? T.danger   : isFive ? T.danger   : isTen ? T.warn   : T.border
  const accent = isOver ? T.danger   : isFive ? T.danger   : isTen ? T.warn   : T.accent
  const fmt = (mm) => {
    const m = Math.abs(mm)
    return `${Math.floor(m / 60) > 0 ? `${Math.floor(m / 60)}時間` : ''}${m % 60}分`
  }

  return (
    <div style={{
      marginBottom: 12, padding: '8px 14px',
      background: bg, border: `1px solid ${border}`, borderRadius: 8,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
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
        経過 {elapsedMin}分 / 予定 {durationMinutes || 30}分
      </span>
      <div style={{ flex: 1, height: 4, background: T.sectionBg, borderRadius: 99, overflow: 'hidden', minWidth: 80 }}>
        <div style={{
          height: '100%', width: `${Math.min(100, ratio * 100)}%`,
          background: accent, transition: 'width 0.3s',
        }} />
      </div>
    </div>
  )
}

// ─── ステップ3: ネクストアクション (ka_tasks に保存; meeting_key='morning') ───
function Step3NextActionsMorning({ T, meeting, members, onBack, onFinish }) {
  const [items, setItems] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  const meetingKey = 'morning'
  const weekStart  = meeting.meeting_date  // ka_tasks.week_start (DATE) は朝会の場合その日付を使う

  // 既存タスク取得
  useEffect(() => {
    let alive = true
    supabase.from('ka_tasks')
      .select('*')
      .eq('meeting_key', meetingKey)
      .eq('week_start', weekStart)
      .order('id', { ascending: true })
      .range(0, 49999)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setLoadError(error.message); setItems([]); return }
        setItems(data || [])
      })
    return () => { alive = false }
  }, [weekStart])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`morning_tasks_${weekStart}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ka_tasks' },
        payload => {
          const row = payload.new || payload.old
          if (!row) return
          if ((row.meeting_key || null) !== meetingKey) return
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
  }, [weekStart])

  const addItem = async () => {
    const payload = {
      meeting_key: meetingKey, week_start: weekStart, session_id: meeting.id,
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
      if (!window.confirm('ネクストアクションが0件です。本当に朝会を終了しますか？')) return
    } else if (filled < count) {
      if (!window.confirm(`内容が空のアクションが ${count - filled} 件あります。このまま終了しますか？`)) return
    }
    onFinish()
  }

  return (
    <>
      <div style={{
        marginBottom: 12, padding: '12px 14px',
        background: T.warnBg, border: `1px solid ${T.warn}40`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.warn, marginBottom: 4 }}>
          ✅ ネクストアクションを確定
        </div>
        <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.6 }}>
          朝会で出た決定事項・依頼を <strong>誰がいつまでに何をやるか</strong> 記録します。
        </div>
      </div>

      {/* テーブルヘッダ */}
      <div style={{
        display: 'grid', gridTemplateColumns: '140px 130px 1fr 32px',
        gap: 8, padding: '8px 12px', background: T.bgCard, borderRadius: 8,
        border: `1px solid ${T.border}`, marginBottom: 6, fontSize: 11,
        color: T.textMuted, fontWeight: 700,
      }}>
        <div>担当</div>
        <div>期日</div>
        <div>内容</div>
        <div></div>
      </div>

      {/* 行 */}
      {items === null ? (
        <div style={{ padding: 20, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>読み込み中…</div>
      ) : items.length === 0 ? (
        <div style={{
          padding: '20px 14px', background: T.bgCard, border: `1px dashed ${T.borderMid}`,
          borderRadius: 8, fontSize: 12, color: T.textMuted, textAlign: 'center', marginBottom: 8,
        }}>
          まだネクストアクションが登録されていません。下のボタンから追加してください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {items.map(it => (
            <MorningNextActionRow key={it.id} T={T} item={it} members={members} onDelete={() => deleteItem(it.id)} />
          ))}
        </div>
      )}

      {loadError && (
        <div style={{ marginBottom: 8, padding: '6px 10px', background: T.dangerBg, border: `1px solid ${T.danger}40`, borderRadius: 6, color: T.danger, fontSize: 11 }}>
          取得エラー: {loadError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={addItem} style={{
          padding: '8px 14px', borderRadius: 7, border: `1px dashed ${T.accent}80`,
          background: 'transparent', color: T.accent, cursor: 'pointer',
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
        }}>＋ アクションを追加</button>
        <button onClick={() => setImportOpen(true)} style={{
          padding: '8px 14px', borderRadius: 7, border: 'none',
          background: 'linear-gradient(135deg, #ff9f43 0%, #f97316 100%)',
          color: '#fff', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          boxShadow: '0 2px 8px rgba(249,115,22,0.25)',
        }}>📋 Notionから取り込み</button>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onBack} style={btnSt(T)}>⏮ ステップ2に戻る</button>
        <div style={{ fontSize: 11, color: T.textMuted }}>
          記録: <strong style={{ color: T.text }}>{(items || []).filter(it => (it.title || '').trim()).length}</strong> 件
        </div>
        <button onClick={handleFinish} style={{
          padding: '8px 22px', borderRadius: 8,
          background: T.success, color: '#fff', border: 'none',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
        }}>🏁 朝会を終了</button>
      </div>

      {/* Notion議事録 取り込みモーダル */}
      <MeetingImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        meetingKey="morning"
        meetingTitle="朝会"
        members={members}
        weekStart={weekStart}
        sessionId={meeting.id}
        T={{ bgCard: T.bgCard, text: T.text, textMuted: T.textMuted, borderMid: T.border, borderLight: T.border, bgCard2: T.sectionBg }}
      />
    </>
  )
}

// ネクストアクション 1行 (autoSave なしのシンプル版; onBlur で保存)
function MorningNextActionRow({ T, item, members, onDelete }) {
  const [assignee, setAssignee] = useState(item.assignee || '')
  const [dueDate,  setDueDate]  = useState(item.due_date || '')
  const [title,    setTitle]    = useState(item.title || '')
  const focusedRef = useRef(null)

  // Realtime: 編集中フィールドは保護
  useEffect(() => {
    const ch = supabase.channel(`morning_task_row_${item.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ka_tasks', filter: `id=eq.${item.id}` },
        payload => {
          if (!payload.new) return
          if (focusedRef.current !== 'assignee') setAssignee(payload.new.assignee || '')
          if (focusedRef.current !== 'due_date') setDueDate(payload.new.due_date || '')
          if (focusedRef.current !== 'title')    setTitle(payload.new.title || '')
        }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [item.id])

  const saveField = async (field, value) => {
    const { error } = await supabase.from('ka_tasks').update({ [field]: value }).eq('id', item.id)
    if (error) console.warn(`morning task ${field} 保存失敗`, error)
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '140px 130px 1fr 32px',
      gap: 8, padding: '8px 12px', background: T.bgCard, borderRadius: 8,
      border: `1px solid ${T.border}`, alignItems: 'center',
    }}>
      <select value={assignee}
        onFocus={() => { focusedRef.current = 'assignee' }}
        onBlur={() => { focusedRef.current = null; saveField('assignee', assignee) }}
        onChange={e => { setAssignee(e.target.value); saveField('assignee', e.target.value) }}
        style={{
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5,
          padding: '4px 6px', color: assignee ? T.text : T.textMuted,
          fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', fontWeight: 700,
        }}>
        <option value="">--</option>
        {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
      </select>
      <input type="date"
        value={dueDate || ''}
        onFocus={() => { focusedRef.current = 'due_date' }}
        onBlur={() => { focusedRef.current = null; saveField('due_date', dueDate || null) }}
        onChange={e => setDueDate(e.target.value)}
        style={{
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5,
          padding: '4px 6px', color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none',
        }} />
      <input
        value={title}
        onFocus={() => { focusedRef.current = 'title' }}
        onBlur={() => { focusedRef.current = null; saveField('title', title) }}
        onChange={e => setTitle(e.target.value)}
        placeholder="内容（何をやるか）"
        style={{
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5,
          padding: '6px 8px', color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none',
        }} />
      <button onClick={onDelete} title="削除" style={{
        background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer',
        fontSize: 14, padding: '0 4px', fontFamily: 'inherit',
      }}>✕</button>
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { MEETING_URLS } from '../lib/meetings'
import { openNotionUrl } from '../lib/notionLink'
import MeetingImport from './MeetingImport'
import { ComposeModal } from './ConfirmationsTab'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS, BRAND_GRADIENT } from '../lib/themeTokens'
import { btnPrimary, btnSecondary, accentRingStyle, btnBrand } from '../lib/iosStyles'
import Icon from './Icon'
import { isJpNonBusinessDay } from '../lib/jpHolidays'
import { renderTextWithLinks } from '../lib/renderTextWithLinks'

// 朝会タブ (ヘッダーから遷移)
//   ステップ1: メンバー順番報告 (昨日の振り返り + 今日のタスク)
//   ステップ2: 共有事項タイム
//   ステップ3: 確認事項タイム
//   ステップ4: ネクストアクション (誰がいつまでに何をやるか) — ka_tasks に保存
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
// 「前回の振り返り」を引く起点日 (JST)。
// 前日が土日 or 祝日の場合、直近の平日 (非祝日) まで遡る。
// 例:
//  - 火 (前日=月曜が祝日) → 金まで遡る (金 + 土日 + 月の4日分)
//  - 月 (前日=日) → 金まで遡る (金 + 土 + 日の3日分)
//  - 水 (前日=火が平日) → 火のみ
function getPrevReviewJSTDateStr() {
  // まず前日から開始
  let d = new Date(Date.now() - 86400000)
  let dateStr = toJSTDateStr(d)
  // 前日が休日 (土日祝) なら、平日が見つかるまでさらに遡る
  // 最大10日 (連休が長引く想定)
  for (let i = 0; i < 10 && isJpNonBusinessDay(dateStr); i++) {
    d = new Date(d.getTime() - 86400000)
    dateStr = toJSTDateStr(d)
  }
  return dateStr
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

  const goStep2     = () => setStep(2)   // 共有事項タイム
  const backToStep1 = () => setStep(1)
  const goStep3     = () => setStep(3)   // 確認事項タイム
  const backToStep2 = () => setStep(2)
  const goStep4     = () => setStep(4)   // ネクストアクション
  const backToStep3 = () => setStep(3)

  const finishMeeting = async () => {
    if (!meeting) return
    if (!window.confirm('朝会を終了してよろしいですか?')) return
    const { error } = await supabase.from('morning_meetings').update({
      step: 5, finished_at: new Date().toISOString(),
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
    return <div style={{ padding: SPACING['3xl'] + SPACING.sm, color: T.textMuted, ...TYPO.body }}>読み込み中...</div>
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
        {/* ヘッダ */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACING.md, marginBottom: SPACING.lg, flexWrap: 'wrap' }}>
          <h1 style={{ ...TYPO.title1, color: T.text, margin: 0, display: 'flex', alignItems: 'center', gap: SPACING.sm }}><Icon name="morning" size={22} />朝会</h1>
          <span style={{ ...TYPO.subhead, color: T.textMuted }}>{todayLabel}</span>
          <div style={{ flex: 1 }} />
          {meeting && meeting.step >= 1 && meeting.step < 5 && (
            <button onClick={resetMeeting} style={btnSt(T)}><Icon name="refresh" size={12} /> リセット</button>
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

        {/* 開催中 (step 1〜4) */}
        {meeting && meeting.step >= 1 && meeting.step < 5 && (
          <>
            {/* 残り時間バナー */}
            <MorningTimerBanner T={T}
              startedAt={meeting.started_at}
              durationMinutes={meeting.duration_minutes ?? 30}
              tenMinAlertedRef={tenMinAlertedRef} />

            {/* ファシリ表示 */}
            {meeting.facilitator && (
              <div style={{
                marginBottom: SPACING.md, padding: `${SPACING.sm - 2}px ${SPACING.md}px`,
                background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
                ...TYPO.footnote, fontWeight: 600, color: T.textMuted,
                display: 'flex', alignItems: 'center', gap: SPACING.xs,
              }}>
                <Icon name="user" size={12} /> ファシリ: <strong style={{ color: T.text }}>{meeting.facilitator}</strong>
              </div>
            )}

            {/* 進行ステップ表示 */}
            <StepHeader T={T} step={meeting.step} onJumpToStep={async (s) => {
              if (s === 1) await backToStep1()
              else if (s === 2) await goStep2()
              else if (s === 3) await goStep3()
              else if (s === 4) await goStep4()
            }} />

            {/* ステップ1: 個別報告 */}
            {meeting.step === 1 && (
              <Step1Report T={T} members={sortedMembers} meeting={meeting}
                onNext={goNextSpeaker} onPrev={goPrevSpeaker} onJump={goToSpeaker}
                onSkipToStep2={goStep2} />
            )}

            {/* ステップ2: 共有事項タイム */}
            {meeting.step === 2 && (
              <Step2Shares T={T} members={sortedMembers} myName={myName}
                onBack={backToStep1} onNext={goStep3} />
            )}

            {/* ステップ3: 確認事項タイム */}
            {meeting.step === 3 && (
              <Step2Confirmations T={T} members={sortedMembers} myName={myName}
                onBack={backToStep2} onNext={goStep4} />
            )}

            {/* ステップ4: ネクストアクション */}
            {meeting.step === 4 && (
              <Step3NextActionsMorning T={T} meeting={meeting}
                members={sortedMembers}
                onBack={backToStep3} onFinish={finishMeeting} />
            )}
          </>
        )}

        {/* 終了 */}
        {meeting && meeting.step === 5 && (
          <div style={{
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg,
            padding: SPACING['3xl'] + SPACING.sm, textAlign: 'center',
          }}>
            <div style={{ color: T.success, marginBottom: SPACING.lg, display: 'flex', justifyContent: 'center' }}><Icon name="flag" size={48} /></div>
            <div style={{ ...TYPO.title3, color: T.text, marginBottom: SPACING.sm }}>
              今日の朝会は終了しました
            </div>
            <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted, marginBottom: SPACING.xl }}>
              {meeting.facilitator && <>ファシリ: {meeting.facilitator}　</>}
              {meeting.finished_at && `終了時刻: ${jstHHMM(meeting.finished_at)}`}
            </div>
            <button onClick={resetMeeting} style={btnSt(T, T.accent)}><Icon name="refresh" size={12} /> 開始ページに戻る</button>
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
      {/* ヒーロー (ブランドブルー → シアン) */}
      <div style={{
        marginTop: SPACING.lg, marginBottom: SPACING['2xl'],
        padding: `${SPACING['2xl']}px ${SPACING['2xl'] + 4}px`,
        background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #22d3ee 100%)',
        borderRadius: RADIUS['2xl'], color: '#fff',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(37,99,235,.22)',
      }}>
        <div aria-hidden style={{
          position: 'absolute', top: -80, right: -60, width: 280, height: 280,
          background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 60%)',
          borderRadius: '50%', pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: SPACING.lg }}>
          <div style={{
            width: 64, height: 64, borderRadius: RADIUS.lg, flexShrink: 0,
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}><Icon name="sun" size={32} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              ...TYPO.caption, fontWeight: 800, letterSpacing: '0.18em',
              opacity: 0.85, textTransform: 'uppercase', marginBottom: SPACING.xs,
            }}>平日毎日</div>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>朝会</div>
            <div style={{ ...TYPO.subhead, opacity: 0.92, marginTop: SPACING.xs }}>{`本日 ${todayLabel}${isResume ? ' ・ リセット済み' : ''}`}</div>
          </div>
        </div>
      </div>

      {/* Notion 議事録案内 */}
      <div style={{
        marginBottom: SPACING.lg + 2, padding: `${SPACING.md + 2}px ${SPACING.lg + 2}px`,
        background: T.accentBg, border: `1px solid ${T.accent}40`, borderRadius: RADIUS.md,
      }}>
        <div style={{ ...TYPO.callout, fontWeight: 800, color: T.accent, marginBottom: SPACING.xs, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
          <Icon name="note" size={14} /> Notionで録音議事録をとってください
        </div>
        <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textSub, lineHeight: 1.6, marginBottom: SPACING.sm }}>
          朝会のNotionページを開いて、録音と議事録の作成を開始してください。
          会議の最後に、この議事録からネクストアクションを取り込めます。
        </div>
        <button onClick={() => {
          const url = MEETING_URLS['morning']
          if (!url) { alert('朝会のNotion URLが設定されていません'); return }
          openNotionUrl(url)
        }} style={{
          padding: `${SPACING.sm - 2}px ${SPACING.md}px`, borderRadius: RADIUS.xs, border: `1px solid ${T.accent}80`,
          background: 'transparent', color: T.accent, ...TYPO.footnote, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}><Icon name="pencil" size={12} /> Notionを開く <Icon name="external" size={12} /></button>
      </div>

      {/* 進行アジェンダ */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg,
        padding: SPACING.lg + 2, marginBottom: SPACING.lg + 2,
      }}>
        <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 700, marginBottom: SPACING.sm + 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          会議の流れ
        </div>
        <ol style={{ margin: 0, paddingLeft: SPACING.lg + 2, ...TYPO.body, fontWeight: 500, color: T.textSub, lineHeight: 1.8 }}>
          <li><strong style={{ color: T.text }}>個別報告</strong>：メンバーが順に「昨日の振り返り (KPT) と今日のタスク」を共有</li>
          <li><strong style={{ color: T.text }}>確認事項タイム</strong>：未解決の確認事項を返信・解決化</li>
          <li><strong style={{ color: T.text }}>ネクストアクション</strong>：誰がいつまでに何をやるかを記録</li>
          <li><strong style={{ color: T.text }}>会議終了</strong>：サマリー確認 → クローズ</li>
        </ol>
      </div>

      {/* 参加メンバー */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg,
        padding: SPACING.lg + 2, marginBottom: SPACING.lg + 2,
      }}>
        <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 700, marginBottom: SPACING.sm + 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          参加メンバー ({members.length}人)
        </div>
        {noMembers ? (
          <div style={{ ...TYPO.subhead, color: T.textMuted, fontStyle: 'italic' }}>
            メンバーが登録されていません。組織設定からメンバーを追加してください。
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.xs + 2 }}>
            {members.map((m, idx) => (
              <span key={m.name} style={{
                padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.pill,
                background: T.sectionBg, color: T.textSub,
                ...TYPO.footnote, fontWeight: 600,
              }}>
                <span style={{ color: T.textMuted, marginRight: SPACING.xs }}>{idx + 1}.</span>{m.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ファシリテーター */}
      <div style={{
        marginBottom: SPACING.lg, padding: `${SPACING.md}px ${SPACING.lg}px`, background: T.bgCard,
        border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
      }}>
        <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 700, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          本日のファシリテーター
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm + 2 }}>
          <div style={{
            ...accentRingStyle({ color: T.accent, size: 32 }),
            borderRadius: '50%',
            ...TYPO.headline, fontWeight: 800,
          }}>{(facilitatorDraft || '?').charAt(0)}</div>
          <select value={facilitatorDraft || ''}
            onChange={e => onFacilitatorChange && onFacilitatorChange(e.target.value)}
            style={{
              flex: 1, background: T.bg, border: `1px solid ${T.borderMid}`, borderRadius: RADIUS.sm - 1,
              padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, ...TYPO.body, color: T.text,
              cursor: 'pointer', fontFamily: 'inherit', outline: 'none', fontWeight: 700,
            }}>
            <option value="">-- ファシリ未選択 --</option>
            {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {/* 予定時間 */}
      <div style={{
        marginBottom: SPACING['2xl'] - 2, padding: `${SPACING.md}px ${SPACING.lg}px`, background: T.bgCard,
        border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
      }}>
        <div style={{ ...TYPO.footnote, color: T.textMuted, fontWeight: 700, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          会議予定時間
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
          {[15, 30, 45, 60, 90].map(m => {
            const active = Number(durationDraft) === m
            return (
              <button key={m}
                onClick={() => onDurationChange && onDurationChange(m)}
                style={{
                  padding: `${SPACING.sm - 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.sm - 1, border: `1px solid ${active ? T.accent : T.borderMid}`,
                  background: active ? T.accentBg : 'transparent',
                  color: active ? T.accent : T.textSub,
                  cursor: 'pointer', fontFamily: 'inherit', ...TYPO.subhead, fontWeight: 700,
                }}>{m}分</button>
            )
          })}
          <input type="number" min={5} max={300} step={5}
            value={durationDraft || 30}
            onChange={e => onDurationChange && onDurationChange(Number(e.target.value) || 30)}
            style={{
              width: 70, background: T.bg, border: `1px solid ${T.borderMid}`, borderRadius: RADIUS.sm - 1,
              padding: `${SPACING.sm - 2}px ${SPACING.sm + 2}px`, color: T.text, ...TYPO.subhead, fontFamily: 'inherit', outline: 'none',
            }} />
          <span style={{ ...TYPO.footnote, color: T.textMuted }}>分</span>
          <button onClick={() => {
              if (typeof Notification === 'undefined') { alert('お使いのブラウザは通知に対応していません'); return }
              if (Notification.permission === 'granted') { alert('通知は既に許可されています'); return }
              Notification.requestPermission().then(p => {
                alert(p === 'granted' ? '通知が許可されました（10分前にデスクトップ通知が出ます）' : '通知は許可されませんでした')
              })
            }}
            style={{
              marginLeft: 'auto', padding: `${SPACING.xs + 1}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.xs,
              border: `1px dashed ${T.borderMid}`, background: 'transparent',
              color: T.textMuted, cursor: 'pointer', ...TYPO.footnote, fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="bell" size={12} /> 10分前通知を許可</button>
        </div>
        <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 0, color: T.textMuted, marginTop: SPACING.xs + 2 }}>
          会議開始から {durationDraft || 30}分で「終了予定」。残り10分でアラートが出ます。
        </div>
      </div>

      {/* 開始ボタン */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button onClick={onStart} disabled={noMembers} style={{
          ...(noMembers ? {} : btnBrand({ size: 'lg' })),
          padding: `${SPACING.md + 2}px ${SPACING['3xl'] + SPACING.sm}px`, borderRadius: RADIUS.md, border: 'none',
          background: noMembers ? T.borderMid : BRAND_GRADIENT.cta,
          color: '#fff',
          fontSize: TYPO.title3.fontSize - 1, fontWeight: 800, fontFamily: 'inherit',
          cursor: noMembers ? 'not-allowed' : 'pointer',
          boxShadow: noMembers ? 'none' : '0 4px 14px rgba(37,99,235,.28)',
          display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
        }}>
          <Icon name="rocket" size={18} />
          {isResume ? '朝会をもう一度開始する' : '朝会を開始する'}
          {facilitatorDraft && <span style={{ ...TYPO.footnote, opacity: 0.85, fontWeight: 600 }}>（ファシリ: {facilitatorDraft}）</span>}
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
    padding: `${SPACING.sm - 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.sm - 1,
    background: 'transparent', color: color || T.textSub,
    border: `1px solid ${color ? color + '60' : T.border}`,
    ...TYPO.subhead, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
  }
}

// ─── ステップヘッダー (現在のステップ / クリックで切替) ─────────
function StepHeader({ T, step, onJumpToStep }) {
  const steps = [
    { n: 1, label: '個別報告' },
    { n: 2, label: '共有事項タイム' },
    { n: 3, label: '確認事項タイム' },
    { n: 4, label: 'ネクストアクション' },
  ]
  return (
    <div style={{
      display: 'flex', gap: SPACING.xs + 2, marginBottom: SPACING.lg, padding: SPACING.xs + 2,
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
    }}>
      {steps.map(s => {
        const active = step === s.n
        const done = s.n < step
        return (
          <button key={s.n} onClick={() => onJumpToStep(s.n)} style={{
            flex: 1, padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, borderRadius: RADIUS.sm - 1,
            border: active ? 'none' : done ? `1px solid ${T.success}30` : `1px solid ${T.border}`,
            background: active ? BRAND_GRADIENT.cta : done ? T.successBg : 'rgba(255,255,255,0.6)',
            color: active ? '#fff' : done ? T.success : T.textSub,
            boxShadow: active ? '0 2px 8px rgba(37,99,235,.28)' : 'none',
            ...TYPO.body, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs + 2,
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: active ? 'rgba(255,255,255,0.25)' : done ? `${T.success}26` : T.border,
              color: active ? '#fff' : done ? T.success : T.textSub,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...TYPO.footnote, fontWeight: 800,
            }}>{done ? <Icon name="check" size={12} /> : s.n}</span>
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
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
        padding: SPACING.md, marginBottom: SPACING.lg - 2,
      }}>
        <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.textMuted, marginBottom: SPACING.sm }}>
          メンバー進行状況 ({completed.size} / {members.length})
        </div>
        <div style={{ display: 'flex', gap: SPACING.xs + 2, flexWrap: 'wrap' }}>
          {members.map(m => {
            const isDone = completed.has(m.name)
            const isCurrent = m.name === current
            return (
              <button key={m.name} onClick={() => onJump(m.name)} style={{
                padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.pill, border: 'none',
                background: isCurrent ? T.accent : isDone ? T.successBg : T.sectionBg,
                color: isCurrent ? '#fff' : isDone ? T.success : T.textSub,
                ...TYPO.footnote, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: SPACING.xs,
              }}>
                {isCurrent
                  ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />
                  : isDone
                    ? <Icon name="check" size={12} />
                    : <Icon name="circle" size={12} />}
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
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg,
          padding: SPACING['3xl'] - 2, textAlign: 'center', marginBottom: SPACING.lg - 2,
        }}>
          <div style={{ color: T.success, marginBottom: SPACING.sm + 2, display: 'flex', justifyContent: 'center' }}><Icon name="sparkle" size={36} /></div>
          <div style={{ ...TYPO.title3, fontSize: TYPO.title3.fontSize - 1, color: T.text }}>全員の報告が完了しました</div>
          <div style={{ ...TYPO.footnote, fontWeight: 600, color: T.textMuted, marginTop: SPACING.xs + 2 }}>ステップ2に進んで共有事項タイムへ</div>
        </div>
      ) : null}

      {/* 進行ボタン */}
      <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button onClick={onPrev} disabled={completed.size === 0} style={{
          ...btnSt(T),
          opacity: completed.size === 0 ? 0.4 : 1,
          cursor: completed.size === 0 ? 'not-allowed' : 'pointer',
        }}><Icon name="chevronL" size={12} /> 前の人</button>
        <div style={{ display: 'flex', gap: SPACING.sm }}>
          {allDone && (
            <button onClick={onSkipToStep2} style={{
              padding: `${SPACING.sm}px ${SPACING.lg + 2}px`, borderRadius: RADIUS.sm,
              background: T.accent, color: '#fff', border: 'none',
              ...TYPO.body, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}>ステップ2へ <Icon name="arrowRight" size={13} /></button>
          )}
          {!allDone && (
            <button onClick={onNext} style={{
              padding: `${SPACING.sm}px ${SPACING.lg + 2}px`, borderRadius: RADIUS.sm,
              background: T.accent, color: '#fff', border: 'none',
              ...TYPO.body, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="chevronR" size={13} /> 次の人へ</button>
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
      // 今日のタスク + 期限切れの未完了タスク
      const { data: ts } = await supabase.from('ka_tasks')
        .select('id, title, due_date, done, status')
        .eq('assignee', member.name).lte('due_date', today)
        .order('due_date', { ascending: true })
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
      // 過去日の完了済みタスクは除外 (= 今日 or 期限切れ未完了 のみ残す)
      const filtered = (ts || []).filter(t => {
        const isDone = t.done || t.status === 'done'
        return t.due_date === today || !isDone
      })
      setTasks(filtered)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [member.name, yesterday, today])

  const doneCnt = tasks.filter(t => t.done || t.status === 'done').length
  const overdueCnt = tasks.filter(t => t.due_date < today && !(t.done || t.status === 'done')).length

  return (
    <div style={{
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: RADIUS.xl, padding: 0, marginBottom: SPACING.lg - 2,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(37,99,235,0.06), 0 16px 40px rgba(0,0,0,0.04)',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`@keyframes mmBlink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      {/* 発表者ヘッダ (アクセントソフトグラデ) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACING.lg - 2,
        padding: `${SPACING.lg + 2}px ${SPACING.lg + 4}px`,
        background: 'linear-gradient(120deg, rgba(14,165,233,.08), rgba(14,165,233,.02) 40%, transparent)',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: RADIUS.lg, flexShrink: 0,
          background: BRAND_GRADIENT.cta,
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 900,
          boxShadow: '0 4px 12px rgba(30,58,138,.28)',
        }}>{member.name.charAt(0)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>{member.name}</div>
          <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>{member.role || ''}</div>
        </div>
        <div style={{
          padding: `${SPACING.xs}px ${SPACING.md}px`, borderRadius: RADIUS.pill,
          background: BRAND_GRADIENT.cta,
          color: '#fff',
          ...TYPO.footnote, fontWeight: 800, letterSpacing: '0.04em',
          boxShadow: '0 2px 6px rgba(37,99,235,.28)',
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'mmBlink 1.4s ease-in-out infinite', flexShrink: 0 }} />
          発表中
        </div>
      </div>
      <div style={{ padding: `${SPACING.lg}px ${SPACING['2xl']}px ${SPACING['2xl'] - 2}px` }}>

      {loading ? (
        <div style={{ padding: SPACING.xl, textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>読み込み中...</div>
      ) : (
        <>
          {/* 前回の振り返り (月曜は金〜日の全KPTを表示) */}
          <div style={{ marginBottom: SPACING.lg }}>
            <div style={{ ...TYPO.subhead, fontWeight: 700, color: T.textSub, marginBottom: SPACING.sm, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
              <Icon name="note" size={13} /> 前回の振り返り
            </div>
            {kptList.length === 0 ? (
              <div style={{
                padding: SPACING.sm + 2, ...TYPO.footnote, color: T.textMuted, fontStyle: 'italic',
                background: T.sectionBg, borderRadius: RADIUS.xs,
              }}>振り返りが未入力です</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
                {kptList.map(k => (
                  <div key={k.dateStr} style={{
                    padding: `${SPACING.sm + 2}px ${SPACING.md}px`,
                    background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
                  }}>
                    <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.text, marginBottom: SPACING.xs + 2, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
                      <Icon name="calendar" size={12} /> {k.dateLabel}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
                      <KPTRow T={T} label="Keep"    color={T.success} text={k.keep} />
                      <KPTRow T={T} label="Problem" color={T.warn}    text={k.problem} />
                      <KPTRow T={T} label="Try"     color={T.accent}  text={k.try} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 共有事項は朝会のステップ2「共有事項タイム」に統合されたため、ここでは非表示 */}

          {/* 今日のタスク + 期限切れ */}
          <div>
            <div style={{ ...TYPO.subhead, fontWeight: 700, color: T.textSub, marginBottom: SPACING.sm, display: 'flex', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap' }}>
              <Icon name="calendar" size={13} /> 今日のタスク
              <span style={{ marginLeft: SPACING.xs, padding: `1px ${SPACING.sm}px`, borderRadius: RADIUS.pill,
                background: T.sectionBg, color: T.textMuted,
                ...TYPO.caption, letterSpacing: 0 }}>完了 {doneCnt} / 全 {tasks.length}</span>
              {overdueCnt > 0 && (
                <span style={{ marginLeft: SPACING.xs + 2, padding: `1px ${SPACING.sm}px`, borderRadius: RADIUS.pill,
                  background: T.dangerBg, color: T.danger,
                  ...TYPO.caption, letterSpacing: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="alert" size={11} /> 期限切れ {overdueCnt}</span>
              )}
            </div>
            {tasks.length === 0 ? (
              <div style={{
                padding: SPACING.sm + 2, ...TYPO.footnote, color: T.textMuted, fontStyle: 'italic',
                background: T.sectionBg, borderRadius: RADIUS.xs,
              }}>今日のタスクは未登録です</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
                {tasks.map(t => {
                  const isDone = t.done || t.status === 'done'
                  const isOverdue = t.due_date < today && !isDone
                  return (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.sm,
                      padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`,
                      background: isDone ? T.successBg : (isOverdue ? 'rgba(225,29,72,.04)' : T.sectionBg),
                      border: isOverdue ? '1px solid rgba(225,29,72,.15)' : 'none',
                      borderRadius: RADIUS.sm, ...TYPO.subhead, fontWeight: 500,
                      color: isDone ? T.textMuted : T.text,
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}>
                      <span style={{ color: isDone ? T.success : (isOverdue ? T.danger : T.textMuted), display: 'inline-flex' }}><Icon name={isDone ? 'check' : 'circle'} size={13} /></span>
                      <span style={{ flex: 1 }}>{t.title || '(無題)'}</span>
                      {isOverdue && (
                        <span style={{
                          flexShrink: 0, ...TYPO.caption, letterSpacing: 0, fontWeight: 600,
                          padding: `2px ${SPACING.sm}px`, borderRadius: RADIUS.xs - 1,
                          background: T.dangerBg, color: T.danger,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}>{formatJSTMonthDay(t.due_date)} 期限切れ</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  )
}

// ─── 共有事項 (自由記入 + 任意URL) — coaching_logs に保存 ─────────────
function SharingSection({ T, memberName, today }) {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [logId, setLogId] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef(null)
  const dirtyRef = useRef(false)

  // 切替時に読み込み
  useEffect(() => {
    let alive = true
    setLoaded(false)
    setText(''); setUrl(''); setLogId(null); dirtyRef.current = false
    ;(async () => {
      const { data } = await supabase.from('coaching_logs')
        .select('id, content')
        .eq('owner', memberName)
        .eq('log_type', 'morning_share')
        .eq('week_start', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!alive) return
      if (data) {
        const c = parseLogContent(data.content)
        setText(c.text || '')
        setUrl(c.url || '')
        setLogId(data.id)
      }
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [memberName, today])

  // 保存 (debounced)
  const save = useCallback(async (nextText, nextUrl, currentId) => {
    setSaving(true)
    const content = JSON.stringify({ text: nextText, url: nextUrl })
    try {
      if (currentId) {
        await supabase.from('coaching_logs').update({ content }).eq('id', currentId)
      } else {
        const { data } = await supabase.from('coaching_logs').insert({
          owner: memberName,
          week_start: today,
          log_type: 'morning_share',
          content,
        }).select().single()
        if (data) setLogId(data.id)
      }
      dirtyRef.current = false
    } finally {
      setSaving(false)
    }
  }, [memberName, today])

  const scheduleSave = useCallback((nextText, nextUrl) => {
    dirtyRef.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      save(nextText, nextUrl, logId)
    }, 700)
  }, [save, logId])

  // unmount 時に未保存ならフラッシュ
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const onTextChange = (e) => { setText(e.target.value); scheduleSave(e.target.value, url) }
  const onUrlChange  = (e) => { setUrl(e.target.value);  scheduleSave(text, e.target.value) }

  // 表示用に URL を整形 (プロトコル無しなら付与)
  const displayUrl = url ? (url.match(/^https?:\/\//) ? url : `https://${url}`) : ''

  return (
    <div style={{ marginBottom: SPACING.lg }}>
      <div style={{ ...TYPO.subhead, fontWeight: 700, color: T.textSub, marginBottom: SPACING.sm, display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
        <Icon name="msg" size={13} /> 共有事項
        {saving && <span style={{ ...TYPO.caption, letterSpacing: 0, color: T.textMuted, fontWeight: 400 }}>保存中…</span>}
        {!saving && loaded && (text || url) && (
          <span style={{ ...TYPO.caption, letterSpacing: 0, color: T.success, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="check" size={11} /> 保存済</span>
        )}
      </div>
      <div style={{
        padding: SPACING.sm + 2, background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
        display: 'flex', flexDirection: 'column', gap: SPACING.sm,
      }}>
        <textarea
          value={text}
          onChange={onTextChange}
          placeholder="共有したい内容を自由に記入..."
          rows={3}
          disabled={!loaded}
          style={{
            width: '100%', padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, ...TYPO.subhead, fontWeight: 500, fontFamily: 'inherit',
            background: T.bgCard, color: T.text,
            border: `1px solid ${T.border}`, borderRadius: RADIUS.xs,
            outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            lineHeight: 1.55,
          }}
        />
        <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center' }}>
          <input
            type="url"
            value={url}
            onChange={onUrlChange}
            placeholder="関連URL (任意) — 例: https://docs.google.com/..."
            disabled={!loaded}
            style={{
              flex: 1, padding: `${SPACING.xs + 3}px ${SPACING.sm + 2}px`, ...TYPO.footnote, fontWeight: 500, fontFamily: 'inherit',
              background: T.bgCard, color: T.text,
              border: `1px solid ${T.border}`, borderRadius: RADIUS.xs,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {displayUrl && (
            <a href={displayUrl} target="_blank" rel="noopener noreferrer" style={{
              flexShrink: 0, padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.xs,
              background: T.accent, color: '#fff',
              ...TYPO.footnote, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="link" size={11} /> 開く</a>
          )}
        </div>
      </div>
    </div>
  )
}

function KPTRow({ T, label, color, text }) {
  return (
    <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, minWidth: 66, padding: `3px ${SPACING.sm}px`, borderRadius: RADIUS.xs - 1,
        background: color + '20', color, ...TYPO.caption, letterSpacing: 0, textAlign: 'center',
      }}>{label}</span>
      <span style={{
        flex: 1, ...TYPO.subhead, fontWeight: 500, color: T.text,
        whiteSpace: 'pre-wrap', lineHeight: 1.55,
        padding: '3px 2px',
      }}>{text || <span style={{ color: T.textMuted, fontStyle: 'italic' }}>(未入力)</span>}</span>
    </div>
  )
}

// ─── ステップ2: 共有事項タイム + 確認事項タイム (前後に並べる) ──
// ─── ステップ2/3 共通: 共有事項 or 確認事項のリスト ───────────
function MeetingItemsTime({
  T, members, myName, kind, onBack, onNext,
  backLabel = '戻る', nextLabel = '次へ',
  iconName = 'msg', noun = '共有事項',
}) {
  const [items, setItems] = useState([])
  const [replies, setReplies] = useState({})
  const [loading, setLoading] = useState(true)
  const [filterTo, setFilterTo] = useState('') // '' = 全員
  const [composing, setComposing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('member_confirmations')
      .select('*').eq('status', 'open').order('created_at', { ascending: false })
    const filtered = (data || []).filter(it => {
      // kind 一致 (旧データは confirmation 扱い)。会議タグに関わらず、未解決(open)の
      // 共有/確認はすべて朝会に表示する (朝会＝その日の共有・確認の総まとめ)。
      return (it.kind || 'confirmation') === kind
    })
    setItems(filtered)
    if (filtered.length > 0) {
      const ids = filtered.map(d => d.id)
      const { data: reps } = await supabase.from('member_confirmation_replies')
        .select('*').in('confirmation_id', ids).order('created_at', { ascending: true })
      const m = {}
      for (const r of (reps || [])) {
        if (!m[r.confirmation_id]) m[r.confirmation_id] = []
        m[r.confirmation_id].push(r)
      }
      setReplies(m)
    } else {
      setReplies({})
    }
    setLoading(false)
  }, [kind])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`morning_${kind}_items`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_confirmations' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_confirmation_replies' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, kind])

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
        display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, marginBottom: SPACING.md, flexWrap: 'wrap',
        padding: `${SPACING.sm}px ${SPACING.md}px`, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
      }}>
        <span style={{ ...TYPO.subhead, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}>
          <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name={iconName} size={13} /></span> 未解決の{noun} {filtered.length}件
        </span>
        <button onClick={() => setComposing(true)} style={{
          ...btnBrand({ size: 'sm' }),
          padding: `${SPACING.xs + 1}px ${SPACING.md}px`, borderRadius: RADIUS.xs,
          ...TYPO.footnote, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}><Icon name="plus" size={12} /> {noun}を追加</button>
        <div style={{ flex: 1 }} />
        <span style={{ ...TYPO.footnote, color: T.textMuted }}>宛先:</span>
        <select value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{
          padding: `${SPACING.xs}px ${SPACING.sm}px`, borderRadius: RADIUS.xs,
          background: T.bg, border: `1px solid ${T.border}`,
          color: T.text, ...TYPO.footnote, fontFamily: 'inherit', outline: 'none',
        }}>
          <option value="">全員</option>
          {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
        </select>
      </div>

      {composing && (
        <ComposeModal T={{ ...T, borderMid: T.border }} myName={myName} members={members}
          presetKind={kind}
          presetMeetingKeys={['morning']}
          onClose={() => setComposing(false)}
          onSaved={() => { setComposing(false); load() }} />
      )}

      {/* リスト */}
      {loading ? (
        <div style={{ padding: SPACING['3xl'] - 2, textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: SPACING['3xl'] - 2, textAlign: 'center', color: T.textMuted, ...TYPO.subhead,
          background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: RADIUS.md,
        }}>
          <div style={{ color: T.success, marginBottom: SPACING.sm + 2, display: 'flex', justifyContent: 'center' }}><Icon name="sparkle" size={28} /></div>
          未解決の{noun}はありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm, marginBottom: SPACING.lg - 2 }}>
          {filtered.map(it => (
            <MeetingConfirmCard key={it.id} T={T} item={it}
              replies={replies[it.id] || []} myName={myName}
              onResolve={() => resolve(it.id)} onReplied={load} />
          ))}
        </div>
      )}

      {/* 進行ボタン */}
      <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: SPACING.lg - 2 }}>
        <button onClick={onBack} style={btnSt(T)}><Icon name="chevronL" size={12} /> {backLabel}</button>
        <button onClick={onNext} style={{
          padding: `${SPACING.sm}px ${SPACING['2xl'] - 2}px`, borderRadius: RADIUS.sm,
          background: T.accent, color: '#fff', border: 'none',
          ...TYPO.body, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}>{nextLabel} <Icon name="arrowRight" size={13} /></button>
      </div>
    </>
  )
}

// ─── ステップ2: 共有事項タイム ───────────────────────────────
function Step2Shares({ T, members, myName, onBack, onNext }) {
  return (
    <MeetingItemsTime T={T} members={members} myName={myName}
      kind="share" iconName="msg" noun="共有事項"
      backLabel="ステップ1 (個別報告) に戻る"
      nextLabel="ステップ3 (確認事項タイム) へ"
      onBack={onBack} onNext={onNext} />
  )
}

// ─── ステップ3: 確認事項タイム ───────────────────────────────
function Step2Confirmations({ T, members, myName, onBack, onNext }) {
  return (
    <MeetingItemsTime T={T} members={members} myName={myName}
      kind="confirmation" iconName="check" noun="確認事項"
      backLabel="ステップ2 (共有事項タイム) に戻る"
      nextLabel="ステップ4 (ネクストアクション) へ"
      onBack={onBack} onNext={onNext} />
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
      borderRadius: RADIUS.sm, padding: SPACING.md,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs + 2, flexWrap: 'wrap' }}>
        <span style={{ ...TYPO.subhead, color: T.textMuted }}>from</span>
        <span style={{ ...TYPO.subhead, fontWeight: 700, color: T.text }}>{item.from_name}</span>
        <span style={{ color: T.textFaint, display: 'inline-flex' }}><Icon name="arrowRight" size={12} /></span>
        <span style={{ ...TYPO.subhead, color: T.textMuted }}>to</span>
        <span style={{ ...TYPO.subhead, fontWeight: 700, color: T.text }}>{item.to_name}</span>
      </div>
      <div style={{ ...TYPO.body, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.6, padding: '4px 2px' }}>
        {renderTextWithLinks(item.content, { color: T.accent })}
      </div>
      {Array.isArray(item.reference_urls) && item.reference_urls.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.xs + 2, marginTop: SPACING.xs + 2 }}>
          {item.reference_urls.map((u, i) => {
            const href = u.url?.match(/^https?:\/\//) ? u.url : (u.url ? `https://${u.url}` : '#')
            return (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                padding: `3px ${SPACING.sm + 1}px`, borderRadius: RADIUS.xs,
                background: T.accentBg, color: T.accent,
                ...TYPO.footnote, fontWeight: 700, textDecoration: 'none',
                border: `1px solid ${T.accent}30`,
              }}><Icon name="link" size={11} /> {u.label || u.url}</a>
            )
          })}
        </div>
      )}
      {replies.length > 0 && (
        <div style={{ marginTop: SPACING.sm, paddingLeft: SPACING.sm + 2, borderLeft: `2px solid ${T.border}` }}>
          {replies.map(r => (
            <div key={r.id} style={{ marginBottom: SPACING.xs + 2, ...TYPO.footnote, fontWeight: 500 }}>
              <b style={{ color: T.textSub }}>{r.from_name}</b>
              <span style={{ color: T.text, marginLeft: SPACING.xs + 2, whiteSpace: 'pre-wrap' }}>{renderTextWithLinks(r.content, { color: T.accent })}</span>
            </div>
          ))}
        </div>
      )}
      {replyOpen && (
        <div style={{ marginTop: SPACING.sm }}>
          <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
            placeholder="回答を入力" rows={2}
            style={{
              width: '100%', boxSizing: 'border-box', padding: `${SPACING.xs + 2}px ${SPACING.sm}px`, ...TYPO.subhead, fontWeight: 500,
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: RADIUS.xs,
              color: T.text, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
            }} />
          <div style={{ display: 'flex', gap: SPACING.xs + 2, marginTop: SPACING.xs, justifyContent: 'flex-end' }}>
            <button onClick={() => { setReplyOpen(false); setReplyText('') }} style={btnSt(T)}>キャンセル</button>
            <button onClick={send} disabled={!replyText.trim() || saving} style={{
              padding: `${SPACING.xs}px ${SPACING.md}px`, borderRadius: RADIUS.xs,
              background: replyText.trim() ? T.accent : T.border, color: '#fff', border: 'none',
              ...TYPO.footnote, fontWeight: 700, fontFamily: 'inherit',
              cursor: replyText.trim() && !saving ? 'pointer' : 'not-allowed',
            }}>{saving ? '送信中…' : '送信'}</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: SPACING.xs + 2, marginTop: SPACING.sm }}>
        {!replyOpen && <button onClick={() => setReplyOpen(true)} style={btnSt(T)}><Icon name="msg" size={12} /> 返信</button>}
        <button onClick={onResolve} style={btnSt(T, T.success)}><Icon name="check" size={12} /> 確認済みにする</button>
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
      marginBottom: SPACING.md, padding: `${SPACING.sm}px ${SPACING.md + 2}px`,
      background: bg, border: `1px solid ${border}`, borderRadius: RADIUS.sm,
      display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, flexWrap: 'wrap',
    }}>
      <span style={{ color: accent, display: 'inline-flex' }}><Icon name={isOver || isTen ? 'alert' : 'clock'} size={14} /></span>
      <span style={{ ...TYPO.subhead, color: T.textMuted }}>
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
      <span style={{ ...TYPO.footnote, color: T.textMuted }}>
        経過 {elapsedMin}分 / 予定 {durationMinutes || 30}分
      </span>
      <div style={{ flex: 1, height: 4, background: T.sectionBg, borderRadius: RADIUS.pill, overflow: 'hidden', minWidth: 80 }}>
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
        marginBottom: SPACING.md, padding: `${SPACING.md}px ${SPACING.md + 2}px`,
        background: T.warnBg, border: `1px solid ${T.warn}40`, borderRadius: RADIUS.md,
      }}>
        <div style={{ ...TYPO.callout, fontWeight: 800, color: T.warn, marginBottom: SPACING.xs, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
          <Icon name="check" size={13} /> ネクストアクションを確定
        </div>
        <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textSub, lineHeight: 1.6 }}>
          朝会で出た決定事項・依頼を <strong>誰がいつまでに何をやるか</strong> 記録します。
        </div>
      </div>

      {/* 全社の停滞タスクレビュー (期限切れ + 本日期限) */}
      <CompanyStaleTasksReview T={T} />

      {/* テーブルヘッダ */}
      <div style={{
        display: 'grid', gridTemplateColumns: '140px 130px 1fr 32px',
        gap: SPACING.sm, padding: `${SPACING.sm}px ${SPACING.md}px`, background: T.bgCard, borderRadius: RADIUS.sm,
        border: `1px solid ${T.border}`, marginBottom: SPACING.xs + 2, ...TYPO.footnote,
        color: T.textMuted, fontWeight: 700,
      }}>
        <div>担当</div>
        <div>期日</div>
        <div>内容</div>
        <div></div>
      </div>

      {/* 行 */}
      {items === null ? (
        <div style={{ padding: SPACING.xl, textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>読み込み中…</div>
      ) : items.length === 0 ? (
        <div style={{
          padding: `${SPACING.xl}px ${SPACING.md + 2}px`, background: T.bgCard, border: `1px dashed ${T.borderMid}`,
          borderRadius: RADIUS.sm, ...TYPO.subhead, color: T.textMuted, textAlign: 'center', marginBottom: SPACING.sm,
        }}>
          まだネクストアクションが登録されていません。下のボタンから追加してください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2, marginBottom: SPACING.sm }}>
          {items.map(it => (
            <MorningNextActionRow key={it.id} T={T} item={it} members={members} onDelete={() => deleteItem(it.id)} />
          ))}
        </div>
      )}

      {loadError && (
        <div style={{ marginBottom: SPACING.sm, padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`, background: T.dangerBg, border: `1px solid ${T.danger}40`, borderRadius: RADIUS.xs, color: T.danger, ...TYPO.footnote }}>
          取得エラー: {loadError}
        </div>
      )}

      <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.lg + 2, flexWrap: 'wrap' }}>
        <button onClick={addItem} style={{
          padding: `${SPACING.sm}px ${SPACING.md + 2}px`, borderRadius: RADIUS.sm - 1, border: `1px dashed ${T.accent}80`,
          background: 'transparent', color: T.accent, cursor: 'pointer',
          ...TYPO.subhead, fontWeight: 700, fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}><Icon name="plus" size={13} /> アクションを追加</button>
        <button onClick={() => setImportOpen(true)} style={{
          ...btnBrand({ size: 'sm' }),
          padding: `${SPACING.sm}px ${SPACING.md + 2}px`, borderRadius: RADIUS.sm - 1,
          ...TYPO.subhead, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}><Icon name="note" size={13} /> Notionから取り込み</button>
      </div>

      <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onBack} style={btnSt(T)}><Icon name="chevronL" size={12} /> ステップ2に戻る</button>
        <div style={{ ...TYPO.footnote, color: T.textMuted }}>
          記録: <strong style={{ color: T.text }}>{(items || []).filter(it => (it.title || '').trim()).length}</strong> 件
        </div>
        <button onClick={handleFinish} style={{
          padding: `${SPACING.sm}px ${SPACING['2xl'] - 2}px`, borderRadius: RADIUS.sm,
          background: T.success, color: '#fff', border: 'none',
          ...TYPO.body, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
        }}><Icon name="flag" size={13} /> 朝会を終了</button>
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
      gap: SPACING.sm, padding: `${SPACING.sm}px ${SPACING.md}px`, background: T.bgCard, borderRadius: RADIUS.sm,
      border: `1px solid ${T.border}`, alignItems: 'center',
    }}>
      <select value={assignee}
        onFocus={() => { focusedRef.current = 'assignee' }}
        onBlur={() => { focusedRef.current = null; saveField('assignee', assignee) }}
        onChange={e => { setAssignee(e.target.value); saveField('assignee', e.target.value) }}
        style={{
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: RADIUS.xs - 1,
          padding: `${SPACING.xs}px ${SPACING.xs + 2}px`, color: assignee ? T.text : T.textMuted,
          ...TYPO.subhead, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', fontWeight: 700,
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
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: RADIUS.xs - 1,
          padding: `${SPACING.xs}px ${SPACING.xs + 2}px`, color: T.text, ...TYPO.subhead, fontWeight: 500, fontFamily: 'inherit', outline: 'none',
        }} />
      <input
        value={title}
        onFocus={() => { focusedRef.current = 'title' }}
        onBlur={() => { focusedRef.current = null; saveField('title', title) }}
        onChange={e => setTitle(e.target.value)}
        placeholder="内容（何をやるか）"
        style={{
          background: 'transparent', border: `1px solid ${T.border}`, borderRadius: RADIUS.xs - 1,
          padding: `${SPACING.xs + 2}px ${SPACING.sm}px`, color: T.text, ...TYPO.subhead, fontWeight: 500, fontFamily: 'inherit', outline: 'none',
        }} />
      <button onClick={onDelete} title="削除" style={{
        background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer',
        padding: '0 4px', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon name="cross" size={14} /></button>
    </div>
  )
}

// ─── 全社の停滞タスクレビュー (朝会用) ──────────────────────────────
// 期限切れ未完了 + 本日期限 のタスクを全社で集約表示し、その場でステータス更新可能にする。
// 狙い: 朝会の場で「もう終わってるよ」となる作業漏れを反映する。
function CompanyStaleTasksReview({ T }) {
  const [tasks, setTasks] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const today = useMemo(() => toJSTDateStr(new Date()), [])

  // 期限切れ + 今日期限 を取得
  const load = useCallback(async () => {
    // 期限切れ: due_date < today AND done=false
    const { data: overdue, error: e1 } = await supabase.from('ka_tasks')
      .select('id, title, assignee, due_date, done, status')
      .eq('done', false)
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .range(0, 999)
    // 今日期限
    const { data: todays, error: e2 } = await supabase.from('ka_tasks')
      .select('id, title, assignee, due_date, done, status')
      .eq('due_date', today)
      .order('assignee', { ascending: true })
      .range(0, 999)
    if (e1 || e2) {
      setLoadError((e1?.message || '') + (e2?.message || ''))
    }
    const merged = [...(overdue || []), ...(todays || [])]
    // dedupe by id (just in case)
    const map = new Map()
    merged.forEach(t => map.set(t.id, t))
    setTasks(Array.from(map.values()))
  }, [today])

  useEffect(() => { load() }, [load])

  // Realtime: タスク更新を即反映 (朝会参加者全員でステータスが共有される)
  useEffect(() => {
    const ch = supabase.channel(`morning_stale_tasks_${today}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ka_tasks' },
        payload => {
          const row = payload.new
          if (!row) return
          setTasks(prev => (prev || []).map(t => t.id === row.id ? { ...t, ...row } : t))
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [today])

  // タスク完了切替
  const toggleDone = async (task) => {
    const next = !task.done
    setTasks(prev => (prev || []).map(t => t.id === task.id ? { ...t, done: next, status: next ? 'done' : t.status } : t))
    const { error } = await supabase.from('ka_tasks').update({
      done: next, status: next ? 'done' : (task.status === 'done' ? 'in_progress' : task.status),
    }).eq('id', task.id)
    if (error) {
      // ロールバック
      setTasks(prev => (prev || []).map(t => t.id === task.id ? task : t))
      alert('更新失敗: ' + error.message)
    }
  }
  // ステータス変更
  const changeStatus = async (task, newStatus) => {
    setTasks(prev => (prev || []).map(t => t.id === task.id ? { ...t, status: newStatus, done: newStatus === 'done' } : t))
    const { error } = await supabase.from('ka_tasks').update({
      status: newStatus, done: newStatus === 'done',
    }).eq('id', task.id)
    if (error) {
      setTasks(prev => (prev || []).map(t => t.id === task.id ? task : t))
      alert('更新失敗: ' + error.message)
    }
  }

  if (tasks === null) {
    return (
      <div style={{ padding: SPACING.lg, textAlign: 'center', color: T.textMuted, ...TYPO.subhead, marginBottom: SPACING.md }}>
        全社タスク 読み込み中…
      </div>
    )
  }

  // 担当者別にグループ化 (期限切れ→今日 の順、各グループ内は期日昇順)
  const grouped = {}
  for (const t of tasks) {
    const key = t.assignee || '(未アサイン)'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  }
  const sortedAssignees = Object.keys(grouped).sort()
  const overdueCount = tasks.filter(t => t.due_date && t.due_date < today && !t.done).length
  const todayCount = tasks.filter(t => t.due_date === today && !t.done).length
  const totalOpen = tasks.filter(t => !t.done).length

  return (
    <div style={{
      marginBottom: SPACING.lg - 2, background: T.bgCard,
      border: `1px solid ${overdueCount > 0 ? T.danger + '30' : T.warn + '30'}`,
      borderRadius: RADIUS.md, overflow: 'hidden',
    }}>
      {/* ヘッダ */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px`, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap',
          background: overdueCount > 0 ? `${T.danger}08` : `${T.warn}08`,
        }}>
        <span style={{ color: overdueCount > 0 ? T.danger : T.warn, display: 'inline-flex' }}><Icon name="alert" size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TYPO.callout, color: T.text }}>
            全社の停滞タスク レビュー
            <span style={{ marginLeft: SPACING.sm, ...TYPO.caption, letterSpacing: 0, color: T.textMuted, fontWeight: 600 }}>
              期限切れ {overdueCount}件 ・ 本日期限 {todayCount}件 ・ 合計未完 {totalOpen}件
            </span>
          </div>
          <div style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 600, color: T.textMuted, marginTop: 2 }}>
            朝会の場で「終わってるよ」というタスクは 完了 を押してその場で反映 (Realtime同期)
          </div>
        </div>
        <button
          style={{
            padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.xs, background: 'transparent',
            border: `1px solid ${T.border}`, color: T.textSub, ...TYPO.caption, letterSpacing: 0, fontFamily: 'inherit',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}
        ><Icon name={collapsed ? 'chevronD' : 'chevronU'} size={11} /> {collapsed ? '展開' : '折りたたむ'}</button>
      </div>

      {!collapsed && (
        <div style={{ padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px` }}>
          {loadError && (
            <div style={{ marginBottom: SPACING.sm, padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`, background: T.dangerBg, border: `1px solid ${T.danger}40`, borderRadius: RADIUS.xs, color: T.danger, ...TYPO.footnote }}>
              取得エラー: {loadError}
            </div>
          )}
          {totalOpen === 0 ? (
            <div style={{ padding: SPACING.md, ...TYPO.subhead, color: T.success, textAlign: 'center', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs }}>
              <Icon name="check" size={13} /> 期限切れ・今日期限の未完了タスクはありません
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm + 2 }}>
              {sortedAssignees.map(assignee => {
                const assigneeTasks = grouped[assignee].filter(t => !t.done)
                if (assigneeTasks.length === 0) return null
                return (
                  <div key={assignee} style={{
                    background: T.sectionBg, border: `1px solid ${T.borderLight}`,
                    borderRadius: RADIUS.sm, padding: `${SPACING.sm}px ${SPACING.sm + 2}px`,
                  }}>
                    <div style={{ ...TYPO.footnote, fontWeight: 800, color: T.textSub, marginBottom: SPACING.xs + 2, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
                      <Icon name="user" size={12} /> {assignee} <span style={{ color: T.textMuted, fontWeight: 600 }}>({assigneeTasks.length}件)</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs }}>
                      {assigneeTasks.map(task => {
                        const overdue = task.due_date && task.due_date < today
                        const days = task.due_date ? Math.round((new Date(today) - new Date(task.due_date)) / 86400000) : 0
                        // 超過日数で 4 段階に色強度を上げる
                        const badgeTier = !overdue
                          ? { bg: T.warnBg, fg: T.warn }
                          : days <= 2
                            ? { bg: 'rgba(248,113,113,.18)', fg: '#dc2626' }
                            : days <= 8
                              ? { bg: 'rgba(239,68,68,.18)', fg: '#b91c1c' }
                              : { bg: 'rgba(220,38,38,.22)', fg: '#991b1b' }
                        return (
                          <div key={task.id} style={{
                            display: 'flex', alignItems: 'center', gap: SPACING.sm,
                            padding: `${SPACING.xs + 2}px ${SPACING.sm}px`,
                            background: overdue ? 'rgba(225,29,72,.04)' : `${T.warn}08`,
                            border: `1px solid ${overdue ? 'rgba(225,29,72,.15)' : T.warn + '30'}`,
                            borderRadius: RADIUS.sm, ...TYPO.subhead, fontWeight: 500,
                          }}>
                            <span style={{
                              padding: `2px ${SPACING.xs + 2}px`, borderRadius: RADIUS.xs - 2,
                              background: badgeTier.bg, color: badgeTier.fg,
                              fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0,
                            }}>
                              {overdue ? `${days}日超過` : '今日'}
                            </span>
                            <span style={{ ...TYPO.caption, letterSpacing: 0, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {task.due_date ? task.due_date.slice(5) : ''}
                            </span>
                            <span style={{ flex: 1, color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {task.title || '(タイトル未入力)'}
                            </span>
                            <select
                              value={task.status || 'not_started'}
                              onChange={e => changeStatus(task, e.target.value)}
                              style={{
                                padding: `2px ${SPACING.xs}px`, ...TYPO.caption, letterSpacing: 0, fontWeight: 600, fontFamily: 'inherit',
                                background: T.bgCard, color: T.textSub, border: `1px solid ${T.border}`,
                                borderRadius: RADIUS.xs - 2, cursor: 'pointer',
                              }}>
                              <option value="not_started">未着手</option>
                              <option value="in_progress">進行中</option>
                              <option value="done">完了</option>
                            </select>
                            <button
                              onClick={() => toggleDone(task)}
                              title="完了マーク"
                              style={{
                                padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.xs - 1,
                                background: T.success, color: '#fff', border: 'none',
                                ...TYPO.caption, letterSpacing: 0, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                                whiteSpace: 'nowrap', flexShrink: 0,
                                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                              }}>
                              <Icon name="check" size={11} /> 完了
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

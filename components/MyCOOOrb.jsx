'use client'
// MyCOOOrb — 常駐 AI コンパニオン (全画面共通・右下固定)
//
// design_handoff_mycoo_quicktask/README.md Part 1 を再現。
//   - 56×56 円オーブ + アンビエントリング (3秒呼吸パルス)
//   - 状態: idle (オーブのみ) / open (チャットパネル)
//   - チャットは既存 /api/integrations/coo/ai を流用
//   - ⌘J / Ctrl+J で開閉、Esc で閉じる
//   - クイックタスク作成成功 (okr:task-created) でオーブに ✓ + ナッジ
//   - チャット内「＋ タスクを追加」でクイックタスクへ転送 (okr:open-quicktask)
import * as React from 'react'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { inputStyle } from '../lib/iosStyles'
import Icon from './Icon'
import ProposalDialog from './ProposalDialog'

const MYCOO_GRAD = 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)'

// 4 ポイント・スパークル (塗り)
function Sparkle({ size = 26, fill = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true">
      <path d="M12 2 L13.5 9 L20 11 L13.5 13 L12 20 L10.5 13 L4 11 L10.5 9 Z" />
    </svg>
  )
}

const CHIPS = ['今日の優先順位は？', '今週の目標を確認', '振り返りを書く']
// OKR フィードバック (旧 AICoachCard をオーブに移植)。
// COO AI (/api/integrations/coo/ai) は owner の KR/KA 文脈を自前で参照するため、
// クライアントから OKR データを埋め込む必要はなく、依頼プロンプトのみ送る。
const OKR_FEEDBACK_PROMPT = '今週のOKR(KR・KA)の進捗についてフィードバックをください。良かった点・改善点・来週へのアドバイス・励ましの言葉を簡潔にお願いします。'

export default function MyCOOOrb({ user, members = [], T, orgId }) {
  const { isMobile } = useResponsive()
  const myName = React.useMemo(
    () => members.find(m => m.email === user?.email)?.name || '',
    [members, user]
  )
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState([])
  const [historyLoaded, setHistoryLoaded] = React.useState(false)
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [nudge, setNudge] = React.useState(null) // { message, primaryLabel, primaryAction }
  const [checkmark, setCheckmark] = React.useState(false)
  // カレンダー予定の作成/更新/削除提案 (承認ダイアログ用)
  const [pendingProposals, setPendingProposals] = React.useState(null)
  const scrollRef = React.useRef(null)
  const composingRef = React.useRef(false)

  // 既存タブ MyCOO と同じ会話履歴 (coaching_chats / kind='coo') を共有。
  // タブで話した続きをオーブから、オーブで話した続きをタブから続けられる。
  React.useEffect(() => {
    if (!myName || historyLoaded) return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('coaching_chats')
        .select('role, content, created_at')
        .eq('owner', myName).eq('kind', 'coo')
        .order('created_at', { ascending: true })
        .limit(200)
      if (!alive) return
      if (error && error.code !== '42P01' && error.code !== '42703') {
        console.warn('coo orb history load error:', error)
      }
      if (data && data.length > 0) setMessages(data.map(r => ({ role: r.role, content: r.content })))
      setHistoryLoaded(true)
    })()
    return () => { alive = false }
  }, [myName, historyLoaded])

  const saveMessage = React.useCallback(async (role, content) => {
    if (!myName || !content) return
    try {
      await supabase.from('coaching_chats').insert({ owner: myName, kind: 'coo', role, content, metadata: null })
    } catch (e) { console.warn('coo orb save error:', e) }
  }, [myName])

  // ⌘J / Ctrl+J で開閉、Esc で閉じる
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault(); setOpen(o => !o); setNudge(null)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // クイックタスク作成成功 → ✓ をふっと出して、リストを開くナッジ
  React.useEffect(() => {
    function onTaskCreated(e) {
      const count = e?.detail?.count || 1
      setCheckmark(true)
      setTimeout(() => setCheckmark(false), 800)
      if (!open) {
        setNudge({
          message: `${count} 件追加しました。今日のリストを開きますか？`,
          primaryLabel: 'リストを開く',
          primaryAction: () => {
            setNudge(null)
            window.dispatchEvent(new CustomEvent('okr:goto', { detail: { page: 'mycoach' } }))
          },
        })
      }
    }
    window.addEventListener('okr:task-created', onTaskCreated)
    return () => window.removeEventListener('okr:task-created', onTaskCreated)
  }, [open])

  React.useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open, busy])

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || busy) return
    setInput('')
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(p => [...p, { role: 'user', content: msg }])
    saveMessage('user', msg)
    setBusy(true)
    try {
      const r = await fetch('/api/integrations/coo/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: myName, message: msg, mode: 'speed', history, organization_id: orgId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      const aiContent = j.text || '(応答なし)'
      setMessages(p => [...p, { role: 'assistant', content: aiContent }])
      saveMessage('assistant', aiContent)
      // カレンダーの作成/更新/削除提案があれば承認ダイアログを出す
      const proposalActions = (j.actions || []).filter(a =>
        a.result?.proposal && ['create', 'update', 'delete'].includes(a.result.proposal)
      )
      if (proposalActions.length > 0) {
        setPendingProposals(proposalActions.map(a => ({ type: a.result.proposal, plan: a.result.plan })))
      }
    } catch (e) {
      // エラーメッセージは履歴に保存しない (再質問を促す)
      setMessages(p => [...p, { role: 'assistant', content: `⚠️ ${e.message || 'エラー'}` }])
    } finally {
      setBusy(false)
    }
  }

  // 承認された提案を /api/integrations/calendar/event で実行 (owner = 本人)
  async function executeProposal(type, plan) {
    const url = '/api/integrations/calendar/event'
    let body, method
    if (type === 'create') {
      method = 'POST'
      body = {
        owner: myName,
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
        owner: myName,
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
      body = { owner: myName, event_id: plan.event_id }
    } else {
      throw new Error(`unknown proposal type: ${type}`)
    }
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    return j
  }

  return (
    <>
      <style>{`
        @keyframes mycoo-pulse { 0%,100% { opacity:.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.15); } }
        @keyframes mycoo-pop { from { opacity:0; transform:translateY(8px) scale(.96); } to { opacity:1; transform:translateY(0) scale(1); } }
      `}</style>
      <div style={{
        position: 'fixed',
        // モバイルは下部ナビ(約64px)と重ならないよう持ち上げ、左右余白も詰める
        bottom: isMobile ? 84 : 24, right: isMobile ? 12 : 24, left: isMobile ? 12 : 'auto',
        zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12,
        pointerEvents: 'none',
        fontFamily: '"Inter", "Noto Sans JP", system-ui, sans-serif',
      }}>
        {/* ナッジ吹き出し */}
        {nudge && !open && (
          <div style={{
            pointerEvents: 'auto', position: 'relative', maxWidth: 280,
            background: '#1e293b', color: '#fff', padding: `${SPACING.md}px ${SPACING.lg}px`,
            borderRadius: RADIUS.lg, ...TYPO.body, lineHeight: 1.55,
            boxShadow: SHADOWS.lg,
            animation: 'mycoo-pop .3s cubic-bezier(.16,1,.3,1)',
          }}>
            <button onClick={() => setNudge(null)} style={{
              position: 'absolute', top: 8, right: 10, border: 'none', background: 'transparent',
              color: 'rgba(255,255,255,.5)', cursor: 'pointer', padding: 0,
            }}><Icon name="cross" size={10} /></button>
            <div style={{ marginRight: SPACING.md }}>{nudge.message}</div>
            <div style={{ display: 'flex', gap: SPACING.xs + 2, justifyContent: 'flex-end', marginTop: SPACING.sm + 2 }}>
              <button onClick={nudge.primaryAction} style={{
                background: '#fff', color: '#1d4ed8', border: `1px solid ${T.borderMid}`,
                padding: '6px 12px', ...TYPO.footnote, fontWeight: 600, borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit',
              }}>{nudge.primaryLabel}</button>
              <button onClick={() => setNudge(null)} style={{
                background: 'rgba(255,255,255,.7)', color: T.textSub, border: 'none',
                padding: '6px 12px', ...TYPO.footnote, fontWeight: 600, borderRadius: RADIUS.pill, cursor: 'pointer', fontFamily: 'inherit',
                backdropFilter: 'blur(8px)',
              }}>あとで</button>
            </div>
            <div style={{
              position: 'absolute', bottom: -6, right: 28, width: 12, height: 12,
              background: '#1e293b', transform: 'rotate(45deg)', borderRadius: 2,
            }} />
          </div>
        )}

        {/* チャットパネル */}
        {open && (
          <div style={{
            pointerEvents: 'auto',
            // モバイルは画面幅に合わせ、高さもビューポート内に収めて内部スクロールを効かせる
            width: isMobile ? 'calc(100vw - 24px)' : 380,
            height: isMobile ? 'min(68vh, 560px)' : 520,
            maxWidth: '100%', minHeight: 0,
            display: 'flex', flexDirection: 'column',
            background: T.bgCard,
            backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            border: `1px solid ${T.border}`, borderRadius: RADIUS.xl, overflow: 'hidden',
            boxShadow: `${SHADOWS.xl}, ${SHADOWS.glassInset}`,
            animation: 'mycoo-pop .3s cubic-bezier(.16,1,.3,1)',
          }}>
            {/* ヘッダ */}
            <div style={{ padding: '14px 16px', background: MYCOO_GRAD, color: '#fff', display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: RADIUS.pill, flexShrink: 0,
                background: 'rgba(255,255,255,.15)', border: '1.5px solid rgba(255,255,255,.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Sparkle size={16} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYPO.headline }}>MyCOO</div>
                <div style={{ fontSize: 10.5, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: T.success }} />
                  あなたの仕事を見てます
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{
                border: 'none', background: 'transparent', color: 'rgba(255,255,255,.7)', cursor: 'pointer', padding: SPACING.xs,
              }}><Icon name="cross" size={14} /></button>
            </div>

            {/* メッセージ */}
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: SPACING.md + 2, display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
              {messages.length === 0 && (
                <div style={{
                  maxWidth: '88%', alignSelf: 'flex-start', padding: '10px 14px',
                  background: T.bgCard2, color: T.text,
                  border: `1px solid ${T.border}`, borderRadius: RADIUS.md, borderTopLeftRadius: 4,
                  boxShadow: SHADOWS.xs, fontSize: 12.5, lineHeight: 1.65,
                }}>
                  こんにちは{myName ? `、${myName}さん` : ''}。今日の優先順位やタスクの整理、何でも相談してください。
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={m.role === 'user' ? {
                  maxWidth: '88%', alignSelf: 'flex-end', padding: '10px 14px',
                  background: MYCOO_GRAD, color: '#fff', borderRadius: RADIUS.md, borderTopRightRadius: 4,
                  boxShadow: '0 2px 8px rgba(30,58,138,.18)', fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                } : {
                  maxWidth: '88%', alignSelf: 'flex-start', padding: '10px 14px',
                  background: T.bgCard2, color: T.text,
                  border: `1px solid ${T.border}`, borderRadius: RADIUS.md, borderTopLeftRadius: 4,
                  boxShadow: SHADOWS.xs, fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                }}>{m.content}</div>
              ))}
              {busy && (
                <div style={{
                  alignSelf: 'flex-start', padding: '10px 14px', background: T.bgCard2,
                  border: `1px solid ${T.border}`, borderRadius: RADIUS.md, borderTopLeftRadius: 4,
                  fontSize: 12.5, color: T.textMuted,
                }}>考えています…</div>
              )}
            </div>

            {/* サジェスチョンチップ */}
            <div style={{ display: 'flex', gap: SPACING.xs + 2, flexWrap: 'wrap', borderTop: `1px solid ${T.border}`, padding: '6px 12px' }}>
              <button onClick={() => window.dispatchEvent(new CustomEvent('okr:open-quicktask'))} style={{ ...chipStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="plus" size={11} /> タスクを追加</button>
              <button onClick={() => send(OKR_FEEDBACK_PROMPT)} style={{ ...chipStyle, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="sparkle" size={11} /> OKRフィードバック</button>
              {CHIPS.map(c => (
                <button key={c} onClick={() => send(c)} style={chipStyle}>{c}</button>
              ))}
            </div>

            {/* 入力欄 */}
            <div style={{ padding: '10px 12px 12px', display: 'flex', alignItems: 'center', gap: SPACING.sm, background: T.sectionBg, borderTop: `1px solid ${T.border}` }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onKeyDown={e => { if (e.key === 'Enter' && !(composingRef.current || e.nativeEvent?.isComposing || e.keyCode === 229)) { e.preventDefault(); send() } }}
                placeholder="MyCOO に聞く..."
                style={{
                  flex: 1, minWidth: 0, padding: '10px 14px', background: '#fff', border: `1px solid ${T.borderMid}`,
                  // iOS は font-size < 16px の入力でフォーカス時に自動ズームするため 16px に
                  borderRadius: RADIUS.pill, fontSize: 16, outline: 'none', fontFamily: 'inherit', color: T.text,
                }}
              />
              <button onClick={() => send()} disabled={busy} style={{
                width: 36, height: 36, borderRadius: RADIUS.pill, flexShrink: 0, border: 'none',
                background: MYCOO_GRAD, color: '#fff', cursor: busy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(30,58,138,.3)',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* オーブ */}
        <div style={{ pointerEvents: 'auto', position: 'relative', width: 56, height: 56 }}>
          <div style={{
            position: 'absolute', inset: -8, borderRadius: 99,
            background: 'radial-gradient(circle, rgba(99,102,241,.25), transparent 70%)',
            animation: 'mycoo-pulse 3s ease-in-out infinite', pointerEvents: 'none',
          }} />
          <button
            onClick={() => { setOpen(o => !o); setNudge(null) }}
            title="MyCOO (⌘J)"
            style={{
              position: 'relative', width: 56, height: 56, borderRadius: 99,
              background: MYCOO_GRAD, border: '3px solid rgba(255,255,255,.85)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              boxShadow: '0 8px 24px rgba(30,58,138,.32), inset 0 1px 0 rgba(255,255,255,.3), inset 0 -2px 4px rgba(30,58,138,.4)',
              transition: 'transform 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            {checkmark
              ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
              : <Sparkle size={26} />}
          </button>
        </div>
      </div>

      {/* カレンダー予定の確認ダイアログ (作成/更新/削除を承認後に実行) */}
      {T && pendingProposals && pendingProposals.length > 0 && (
        <ProposalDialog
          T={T}
          proposals={pendingProposals}
          onClose={() => setPendingProposals(null)}
          onConfirm={async () => {
            const remaining = [...pendingProposals]
            try {
              while (remaining.length > 0) {
                await executeProposal(remaining[0].type, remaining[0].plan)
                remaining.shift()
              }
              setPendingProposals(null)
              const okMsg = '✅ カレンダーに反映しました。'
              setMessages(p => [...p, { role: 'assistant', content: okMsg }])
              saveMessage('assistant', okMsg)
            } catch (e) {
              const msg = e.message || 'エラー'
              if (/403|Insufficient|insufficient auth/i.test(msg)) {
                alert('Google の予定作成権限が不足しています。連携タブで再認証してください。')
              } else {
                alert(`実行エラー: ${msg}`)
              }
            }
          }}
        />
      )}
    </>
  )
}

const chipStyle = {
  padding: '5px 10px', ...TYPO.footnote, background: 'rgba(255,255,255,.6)',
  border: '1px solid rgba(15,23,42,.08)', borderRadius: RADIUS.pill, color: '#475569',
  cursor: 'pointer', fontFamily: 'inherit',
}

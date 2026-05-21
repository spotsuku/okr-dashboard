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

export default function MyCOOOrb({ user, members = [] }) {
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
        body: JSON.stringify({ owner: myName, message: msg, mode: 'speed', history }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      const aiContent = j.text || '(応答なし)'
      setMessages(p => [...p, { role: 'assistant', content: aiContent }])
      saveMessage('assistant', aiContent)
    } catch (e) {
      // エラーメッセージは履歴に保存しない (再質問を促す)
      setMessages(p => [...p, { role: 'assistant', content: `⚠️ ${e.message || 'エラー'}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes mycoo-pulse { 0%,100% { opacity:.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.15); } }
        @keyframes mycoo-pop { from { opacity:0; transform:translateY(8px) scale(.96); } to { opacity:1; transform:translateY(0) scale(1); } }
      `}</style>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12,
        pointerEvents: 'none',
        fontFamily: '"Inter", "Noto Sans JP", system-ui, sans-serif',
      }}>
        {/* ナッジ吹き出し */}
        {nudge && !open && (
          <div style={{
            pointerEvents: 'auto', position: 'relative', maxWidth: 280,
            background: '#1e293b', color: '#fff', padding: '12px 16px',
            borderRadius: 14, fontSize: 13, lineHeight: 1.55, fontWeight: 500,
            boxShadow: '0 8px 24px rgba(15,23,42,.18)',
            animation: 'mycoo-pop .3s cubic-bezier(.16,1,.3,1)',
          }}>
            <button onClick={() => setNudge(null)} style={{
              position: 'absolute', top: 8, right: 10, border: 'none', background: 'transparent',
              color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 10, padding: 0,
            }}>✕</button>
            <div style={{ marginRight: 12 }}>{nudge.message}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={nudge.primaryAction} style={{
                background: '#fff', color: '#1d4ed8', border: '1px solid rgba(15,23,42,.1)',
                padding: '6px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
              }}>{nudge.primaryLabel}</button>
              <button onClick={() => setNudge(null)} style={{
                background: 'rgba(255,255,255,.7)', color: '#475569', border: 'none',
                padding: '6px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
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
            pointerEvents: 'auto', width: 380, height: 520,
            display: 'flex', flexDirection: 'column',
            background: 'rgba(255,255,255,.92)',
            backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            border: '1px solid rgba(15,23,42,.08)', borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(15,23,42,.18), 0 1px 0 rgba(255,255,255,.7) inset',
            animation: 'mycoo-pop .3s cubic-bezier(.16,1,.3,1)',
          }}>
            {/* ヘッダ */}
            <div style={{ padding: '14px 16px', background: MYCOO_GRAD, color: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 99, flexShrink: 0,
                background: 'rgba(255,255,255,.15)', border: '1.5px solid rgba(255,255,255,.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Sparkle size={16} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>MyCOO</div>
                <div style={{ fontSize: 10.5, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: '#34d399' }} />
                  あなたの仕事を見てます
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{
                border: 'none', background: 'transparent', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 14, padding: 4,
              }}>✕</button>
            </div>

            {/* メッセージ */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 && (
                <div style={{
                  maxWidth: '88%', alignSelf: 'flex-start', padding: '10px 14px',
                  background: 'rgba(255,255,255,.8)', color: '#0f172a',
                  border: '1px solid rgba(15,23,42,.06)', borderRadius: 12, borderTopLeftRadius: 4,
                  boxShadow: '0 1px 2px rgba(15,23,42,.04)', fontSize: 12.5, lineHeight: 1.65,
                }}>
                  こんにちは{myName ? `、${myName}さん` : ''}。今日の優先順位やタスクの整理、何でも相談してください。
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={m.role === 'user' ? {
                  maxWidth: '88%', alignSelf: 'flex-end', padding: '10px 14px',
                  background: MYCOO_GRAD, color: '#fff', borderRadius: 12, borderTopRightRadius: 4,
                  boxShadow: '0 2px 8px rgba(30,58,138,.18)', fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                } : {
                  maxWidth: '88%', alignSelf: 'flex-start', padding: '10px 14px',
                  background: 'rgba(255,255,255,.8)', color: '#0f172a',
                  border: '1px solid rgba(15,23,42,.06)', borderRadius: 12, borderTopLeftRadius: 4,
                  boxShadow: '0 1px 2px rgba(15,23,42,.04)', fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                }}>{m.content}</div>
              ))}
              {busy && (
                <div style={{
                  alignSelf: 'flex-start', padding: '10px 14px', background: 'rgba(255,255,255,.8)',
                  border: '1px solid rgba(15,23,42,.06)', borderRadius: 12, borderTopLeftRadius: 4,
                  fontSize: 12.5, color: '#94a3b8',
                }}>考えています…</div>
              )}
            </div>

            {/* サジェスチョンチップ */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid rgba(15,23,42,.06)', padding: '6px 12px' }}>
              <button onClick={() => window.dispatchEvent(new CustomEvent('okr:open-quicktask'))} style={chipStyle}>＋ タスクを追加</button>
              {CHIPS.map(c => (
                <button key={c} onClick={() => send(c)} style={chipStyle}>{c}</button>
              ))}
            </div>

            {/* 入力欄 */}
            <div style={{ padding: '10px 12px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.5)', borderTop: '1px solid rgba(15,23,42,.06)' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onKeyDown={e => { if (e.key === 'Enter' && !(composingRef.current || e.nativeEvent?.isComposing || e.keyCode === 229)) { e.preventDefault(); send() } }}
                placeholder="MyCOO に聞く..."
                style={{
                  flex: 1, padding: '10px 14px', background: '#fff', border: '1px solid rgba(15,23,42,.1)',
                  borderRadius: 99, fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#0f172a',
                }}
              />
              <button onClick={() => send()} disabled={busy} style={{
                width: 36, height: 36, borderRadius: 99, flexShrink: 0, border: 'none',
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
    </>
  )
}

const chipStyle = {
  padding: '5px 10px', fontSize: 11, background: 'rgba(255,255,255,.6)',
  border: '1px solid rgba(15,23,42,.08)', borderRadius: 99, color: '#475569',
  cursor: 'pointer', fontFamily: 'inherit',
}

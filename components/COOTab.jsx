'use client'
import { useState, useEffect, useRef } from 'react'

function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => typeof window === 'undefined' ? false : window.innerWidth < bp)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

export default function COOTab({ T, myName, viewingName, isAdmin, onOpenSettings }) {
  const isMobile = useIsMobile()
  const owner = viewingName || myName

  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState('coach')
  const [lastUserMsg, setLastUserMsg] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history, busy])

  const send = async (override) => {
    const msg = (override ?? input).trim()
    if (!msg || busy) return
    const isRetry = override != null
    if (!isRetry) setInput('')
    setErr('')
    setLastUserMsg(msg)
    if (!isRetry) setHistory(prev => [...prev, { role: 'user', content: msg }])
    setBusy(true)
    try {
      const r = await fetch('/api/integrations/coo/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner, message: msg, mode,
          history: history.map(h => ({ role: h.role, content: h.content })),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setHistory(prev => [...prev, {
        role: 'assistant',
        content: j.text || '(応答なし)',
        actions: j.actions || [],
      }])
    } catch (e) {
      setErr(e.message || 'エラー')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg }}>
      {/* ヘッダー (iOS グラスバー) */}
      <div style={{
        padding: '12px 18px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        flexWrap: 'wrap',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, #34C759 0%, #30D158c0 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, boxShadow: '0 2px 6px rgba(52,199,89,0.4)',
        }}>🐸</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>ぺろっぺ</div>
          <div style={{ fontSize: 11, color: T.textMuted }}>三木CEOの右腕 AIコーチ</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 2, background: 'rgba(120,120,128,0.10)', padding: 3, borderRadius: 9 }}>
          {[
            { key: 'coach', label: '🎯 コーチ', desc: 'GROWで深掘り' },
            { key: 'speed', label: '⚡ スピード', desc: '即答' },
          ].map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              title={m.desc}
              style={{
                padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: mode === m.key ? T.bgCard : 'transparent',
                color: mode === m.key ? T.text : T.textSub,
                boxShadow: mode === m.key ? '0 1px 2px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.04)' : 'none',
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}>{m.label}</button>
          ))}
        </div>
        {isAdmin && (
          <button onClick={onOpenSettings} title="ぺろっぺ設定 (admin)" style={{
            padding: '5px 10px', borderRadius: 6,
            background: 'transparent', border: `1px solid ${T.border}`,
            color: T.textSub, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>⚙️ 設定</button>
        )}
        <button onClick={() => setHistory([])} disabled={busy} style={{
          padding: '5px 10px', borderRadius: 6,
          background: 'transparent', border: `1px solid ${T.border}`,
          color: T.textSub, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}>クリア</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, maxWidth: 880, margin: '0 auto', width: '100%' }}>
        {history.length === 0 && (
          <div style={{
            padding: 20, background: T.sectionBg, borderRadius: 10,
            fontSize: 13, color: T.textMuted, lineHeight: 1.8,
          }}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>🐸 こんにちは、{owner}さん</div>
            仕事のこと、なんでも壁打ちしてください。<br />
            今日のあなたの OKR・タスク・直近の振り返りを見ながら、コーチングします。
            <div style={{ marginTop: 14, fontSize: 12 }}>
              <strong>例:</strong>
              <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
                <li>「やずや案件が進まない、どうしたらいい?」</li>
                <li>「増田さん今忙しい? タスクお願いしていい?」</li>
                <li>「来週の OKR 会議で何を議論すべき?」</li>
                <li>「私の今期の重点を教えて」</li>
              </ul>
            </div>
          </div>
        )}
        {history.map((h, i) => (
          <div key={i} style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 10,
            background: h.role === 'user' ? T.accentBg : T.sectionBg,
            border: `1px solid ${h.role === 'user' ? T.accent + '40' : T.border}`,
            fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.7,
          }}>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6, fontWeight: 700 }}>
              {h.role === 'user' ? `🙂 ${owner}さん` : '🐸 ぺろっぺ'}
            </div>
            {h.content}
            {h.actions && h.actions.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, color: T.textMuted, fontStyle: 'italic' }}>
                参照: {h.actions.map(a => a.tool).join(' → ')}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ padding: 10, fontSize: 12, color: T.textMuted }}>
            🐸 考え中…
          </div>
        )}
        {err && (
          <div style={{
            padding: 12, fontSize: 12, color: T.danger,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: 8, lineHeight: 1.6,
          }}>
            <div style={{ marginBottom: 8 }}>⚠️ {err}</div>
            {lastUserMsg && (
              <button onClick={() => send(lastUserMsg)} disabled={busy} style={{
                padding: '5px 14px', borderRadius: 6,
                background: T.accent, color: '#fff', border: 'none',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>🔄 再試行</button>
            )}
          </div>
        )}
      </div>

      <div style={{
        padding: 12, borderTop: `1px solid ${T.border}`,
        display: 'flex', gap: 8, flexShrink: 0, background: T.bgCard,
        maxWidth: 880, margin: '0 auto', width: '100%', boxSizing: 'border-box',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
          }}
          placeholder="自然文で質問・相談 (Ctrl+Enter送信)"
          rows={2}
          disabled={busy}
          style={{
            flex: 1, background: T.bg, color: T.text,
            border: `1px solid ${T.border}`, borderRadius: 7,
            padding: '9px 12px', fontSize: 13, fontFamily: 'inherit',
            resize: 'vertical', outline: 'none',
          }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{
          padding: '0 18px', borderRadius: 7,
          background: busy ? T.border : T.accent, color: '#fff',
          border: 'none', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          cursor: busy ? 'not-allowed' : 'pointer', minWidth: 80,
        }}>送信</button>
      </div>
    </div>
  )
}

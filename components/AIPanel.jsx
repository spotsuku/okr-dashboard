'use client'
import { useState, useRef, useEffect } from 'react'

const SUGGESTIONS = [
  '現在のOKRにフィードバックをください',
  '経営レベルのOKRの案を提案してください',
  '目標達成率を上げるためのアドバイスをください',
  'KRの設定方法のベストプラクティスを教えてください',
]

export default function AIPanel({ onClose, okrContext }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'こんにちは！OKRコーチのClaudeです。\n\nOKRの案の作成、フィードバック、目標達成のアドバイスなど、何でもご相談ください。現在のOKRデータも参照しながらサポートします。',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text) => {
    const userText = text || input.trim()
    if (!userText || loading) return
    setInput('')

    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context: okrContext,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `エラーが発生しました: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 420,
      background: '#0e1420', borderLeft: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', zIndex: 200,
      boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(77,159,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #4d9fff, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, boxShadow: '0 0 16px #4d9fff40',
          }}>🤖</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf0' }}>OKR AIコーチ</div>
            <div style={{ fontSize: 10, color: '#4d9fff' }}>● オンライン</div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          color: '#a0a8be', width: 28, height: 28, borderRadius: '50%',
          cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            marginBottom: 14,
            display: 'flex',
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            gap: 8, alignItems: 'flex-start',
          }}>
            {m.role === 'assistant' && (
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #4d9fff, #a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
              }}>🤖</div>
            )}
            <div style={{
              maxWidth: '82%',
              background: m.role === 'user' ? '#4d9fff' : 'rgba(255,255,255,0.05)',
              border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              padding: '10px 13px',
              fontSize: 12.5, lineHeight: 1.65, color: m.role === 'user' ? '#fff' : '#d0d4e8',
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4d9fff, #a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
            }}>🤖</div>
            <div style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px 14px 14px 4px', padding: '12px 16px',
              display: 'flex', gap: 4, alignItems: 'center',
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#4d9fff',
                  animation: 'bounce 1.2s infinite',
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <div style={{ fontSize: 10, color: '#404660', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>よく使う質問</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => send(s)} style={{
                background: 'rgba(77,159,255,0.06)', border: '1px solid rgba(77,159,255,0.2)',
                borderRadius: 8, padding: '8px 12px', color: '#8ab4ff',
                fontSize: 11.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="OKRについて何でも聞いてください..."
          rows={2}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '9px 12px', color: '#e8eaf0', fontSize: 12.5,
            outline: 'none', fontFamily: 'inherit', resize: 'none', lineHeight: 1.5,
          }}
        />
        <button onClick={() => send()} disabled={!input.trim() || loading} style={{
          width: 36, height: 36, borderRadius: 10, border: 'none',
          background: input.trim() && !loading ? 'linear-gradient(135deg, #4d9fff, #a855f7)' : 'rgba(255,255,255,0.08)',
          color: '#fff', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
          fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.2s',
          boxShadow: input.trim() && !loading ? '0 0 16px #4d9fff40' : 'none',
        }}>↑</button>
      </div>
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}

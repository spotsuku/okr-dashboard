'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { TYPO, RADIUS, SPACING } from '../lib/themeTokens'

// ─────────────────────────────────────────────────────────────
// メモ帳モード - 複数タスクを改行区切りで一括追加
//
// パース構文:
//   - "タスク名" または "- タスク名" / "• タスク名" / "・タスク名" = 本文
//   - "@YYYY-MM-DD"            = 期日 (= 日付指定)
//   - "@今日 / 明日 / 今週 / 来週" = 期日 (= 相対指定)
//   - "@田中"                  = 担当者 (= members.name で完全一致)
//   - "#focus / good / more / done" = ステータス
// ─────────────────────────────────────────────────────────────

export default function TaskBulkAddModal({ T, members = [], myName, onClose, onCreated }) {
  const [text, setText]     = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)
  const textareaRef         = useRef(null)

  // 初期フォーカス
  useEffect(() => { textareaRef.current?.focus() }, [])

  // パース結果 (プレビュー用)
  const parsed = useMemo(() => parseLines(text, members), [text, members])

  // Cmd+Enter で全追加
  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  const handleSave = async () => {
    if (parsed.length === 0 || saving) return
    setSaving(true); setErr(null)
    const payloads = parsed.map(p => ({
      title:     p.title,
      assignee:  p.assignee || myName || null,
      due_date:  p.due_date || null,
      status:    p.status || null,
      done:      false,
      report_id: null,
      ka_key:    null,
    }))
    const { error } = await supabase.from('ka_tasks').insert(payloads)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onCreated && onCreated(parsed.length)
    onClose && onClose()
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, padding: 20,
      }}
    >
      <div style={{
        width: '90vw', maxWidth: 900, maxHeight: '90vh',
        background: T.bg, borderRadius: 14, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* ヘッダー */}
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 10, background: T.bgCard,
        }}>
          <span style={{ fontSize: 18 }}>📝</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: T.text }}>
            メモ帳モード — 複数タスクを一括追加
          </span>
          <span style={{ fontSize: 11, color: T.textMuted }}>{parsed.length} 件認識</span>
          <button onClick={onClose} style={{
            padding: '4px 10px', borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: 'transparent', color: T.textSub,
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>キャンセル</button>
        </div>

        {/* 本体: 左 textarea / 右 プレビュー */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
          {/* 左: 入力 */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}` }}>
            <div style={{ padding: '8px 14px', fontSize: 11, color: T.textMuted, background: T.sectionBg, borderBottom: `1px solid ${T.border}` }}>
              改行で 1 タスク。<code>@YYYY-MM-DD</code> / <code>@明日</code> / <code>@田中</code> / <code>#focus</code> が使えます。
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`営業資料の準備\n- クライアントAに見積もり送る @2026-05-20\n- 経営会議の議題まとめ @来週 @${myName || '担当者'}\n月次レポート提出 #focus`}
              style={{
                flex: 1,
                padding: 14,
                background: T.bg, color: T.text,
                border: 'none', outline: 'none',
                fontSize: 14, lineHeight: 1.7,
                fontFamily: '"SF Mono", "Cascadia Code", "Menlo", Consolas, "Hiragino Kaku Gothic ProN", "Noto Sans JP", monospace',
                resize: 'none',
              }}
            />
          </div>

          {/* 右: プレビュー */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', fontSize: 11, color: T.textMuted, background: T.sectionBg, borderBottom: `1px solid ${T.border}` }}>
              認識結果 ({parsed.length} 件)
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
              {parsed.length === 0 ? (
                <div style={{ ...TYPO.caption, color: T.textFaint, padding: 20, textAlign: 'center' }}>
                  ↑ 左側に書くとここに認識結果が出ます
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {parsed.map((p, i) => (
                    <div key={i} style={{
                      padding: 8,
                      background: T.bgCard,
                      borderRadius: RADIUS.sm,
                      borderLeft: `3px solid ${statusColor(p.status, T)}`,
                      fontSize: 12,
                    }}>
                      <div style={{ color: T.text, fontWeight: 600 }}>{p.title}</div>
                      <div style={{ marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, color: T.textMuted }}>
                        {p.due_date    && <span>📅 {p.due_date}</span>}
                        {p.assignee    && <span>👤 {p.assignee}</span>}
                        {!p.assignee && <span style={{ color: T.textFaint }}>👤 {myName || '担当未定'} (デフォルト)</span>}
                        {p.status      && <span style={{ color: statusColor(p.status, T), fontWeight: 700 }}>{statusLabel(p.status)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div style={{
          padding: '10px 16px',
          borderTop: `1px solid ${T.border}`,
          background: T.bgCard,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {err && <span style={{ fontSize: 11, color: T.danger }}>エラー: {err}</span>}
          <span style={{ flex: 1 }} />
          <span style={{ ...TYPO.caption, color: T.textMuted }}>⌘ + Enter で一括追加</span>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 7,
            border: `1px solid ${T.border}`,
            background: 'transparent', color: T.textSub,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>キャンセル</button>
          <button
            onClick={handleSave}
            disabled={parsed.length === 0 || saving}
            style={{
              padding: '8px 20px', borderRadius: 7, border: 'none',
              background: parsed.length === 0 || saving ? T.border : T.accent,
              color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: parsed.length === 0 || saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >{saving ? '追加中…' : `${parsed.length} 件追加`}</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// パース: 1 行 1 タスク。@日付 / @担当 / #ステータス を抽出
// ─────────────────────────────────────────────────────────────
function parseLines(text, members) {
  const memberNames = (members || []).map(m => m.name).filter(Boolean)
  const today = new Date()
  return text.split('\n').map(rawLine => {
    let line = rawLine.trim()
    if (!line) return null

    // 行頭の箇条書き記号を除去
    line = line.replace(/^[-•・▪︎*]\s*/, '').trim()

    const out = {}

    // @YYYY-MM-DD
    const dateMatch = line.match(/@(\d{4}-\d{2}-\d{2})/)
    if (dateMatch) {
      out.due_date = dateMatch[1]
      line = line.replace(dateMatch[0], '').trim()
    } else {
      // @今日 / 明日 / 今週 / 来週
      const fuzzy = line.match(/@(今日|明日|今週末?|来週|来月)/)
      if (fuzzy) {
        const d = new Date(today)
        if (fuzzy[1] === '明日')        d.setDate(d.getDate() + 1)
        else if (fuzzy[1].startsWith('今週')) d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7))  // 今週金曜
        else if (fuzzy[1] === '来週')   d.setDate(d.getDate() + 7)
        else if (fuzzy[1] === '来月')   d.setMonth(d.getMonth() + 1)
        out.due_date = d.toISOString().slice(0, 10)
        line = line.replace(fuzzy[0], '').trim()
      }
    }

    // #status
    const statusMatch = line.match(/#(focus|good|more|done|normal)/i)
    if (statusMatch) {
      out.status = statusMatch[1].toLowerCase()
      line = line.replace(statusMatch[0], '').trim()
    }

    // @担当者 (= members.name と完全一致 or 部分一致)
    for (const name of memberNames) {
      const re = new RegExp(`@${name}\\b`)
      if (re.test(line)) {
        out.assignee = name
        line = line.replace(re, '').trim()
        break
      }
    }

    if (!line) return null
    return { title: line, ...out }
  }).filter(Boolean)
}

function statusColor(s, T) {
  const map = {
    focus: '#FFB700', good: '#34C759', more: '#FF3B30', done: T?.textFaint,
  }
  return map[s] || (T?.border || '#ccc')
}

function statusLabel(s) {
  return ({ focus: '🎯 focus', good: '✅ good', more: '🔺 more', done: '✓ done' })[s] || ''
}

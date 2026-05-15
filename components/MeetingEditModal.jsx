'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { AVAILABLE_MODULES, MODULE_META } from '../lib/meetings/moduleRegistry'

// ─────────────────────────────────────────────────────────────
// 会議の追加 / 編集モーダル (Phase 5e 本格)
//
// props:
//   T            - テーマ
//   orgId        - 組織 ID
//   meeting      - 既存会議 (= 編集モード) / null (= 新規追加)
//   onClose      - 閉じる時のコールバック
//   onSaved      - 保存成功時のコールバック (一覧再読み込みなど)
// ─────────────────────────────────────────────────────────────

const PRESET_ICONS = ['🌅', '🚀', '🌱', '🏛️', '💰', '👔', '📋', '📊', '🏷', '🎯', '📅', '⚡']
const PRESET_COLORS = [
  '#ff9f43', '#4d9fff', '#ffd166', '#ff6b6b', '#FF9500', '#00d68f',
  '#a855f7', '#5856d6', '#6B96C7', '#34C759',
]
const DAYS_OF_WEEK = [
  { v: null, label: '指定なし' },
  { v: 1, label: '月曜' }, { v: 2, label: '火曜' }, { v: 3, label: '水曜' },
  { v: 4, label: '木曜' }, { v: 5, label: '金曜' }, { v: 6, label: '土曜' }, { v: 0, label: '日曜' },
]

export default function MeetingEditModal({ T, orgId, meeting, onClose, onSaved }) {
  const isNew = !meeting
  const [title, setTitle]       = useState(meeting?.title || '')
  const [key, setKey]           = useState(meeting?.key || '')
  const [icon, setIcon]         = useState(meeting?.icon || '📋')
  const [color, setColor]       = useState(meeting?.color || '#4d9fff')
  const [dayOfWeek, setDayOfWeek] = useState(meeting?.day_of_week ?? null)
  const [modules, setModules]   = useState(() => {
    const list = meeting?.modules || []
    return [...list].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  })
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState(null)

  const handleAddModule = (type) => {
    if (modules.some(m => m.type === type)) {
      setErr(`「${MODULE_META[type]?.label}」は既に追加されています`)
      return
    }
    setModules(prev => [
      ...prev,
      { type, sort_order: prev.length + 1, config: {} },
    ])
    setErr(null)
  }

  const handleRemoveModule = (idx) => {
    setModules(prev => prev.filter((_, i) => i !== idx).map((m, i) => ({ ...m, sort_order: i + 1 })))
  }

  const handleMoveModule = (idx, direction) => {
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= modules.length) return
    setModules(prev => {
      const next = [...prev]
      const tmp = next[idx]
      next[idx] = next[newIdx]
      next[newIdx] = tmp
      return next.map((m, i) => ({ ...m, sort_order: i + 1 }))
    })
  }

  const handleSave = async () => {
    if (!title.trim()) { setErr('タイトルは必須です'); return }
    if (!key.trim()) { setErr('key は必須です (URL/識別子として使用)'); return }
    if (modules.length === 0) { setErr('モジュールを最低 1 つ追加してください'); return }
    setSaving(true)
    setErr(null)

    const payload = {
      organization_id: orgId,
      key: key.trim(),
      title: title.trim(),
      icon,
      color,
      modules,
      day_of_week: dayOfWeek,
    }

    let result
    if (isNew) {
      result = await supabase.from('organization_meetings').insert(payload).select().single()
    } else {
      result = await supabase.from('organization_meetings')
        .update(payload).eq('id', meeting.id).select().single()
    }

    setSaving(false)
    if (result.error) {
      setErr('保存失敗: ' + result.error.message)
      return
    }
    onSaved && onSaved(result.data)
    onClose && onClose()
  }

  const inputSt = {
    padding: '8px 12px', borderRadius: 7, border: `1px solid ${T.border}`,
    background: T.bg, color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const labelSt = { fontSize: 11, color: T.textMuted, fontWeight: 700, marginBottom: 4, display: 'block' }
  const sectionSt = { marginBottom: 14 }

  // モジュール候補 (まだ追加されていないもの)
  const availableToAdd = AVAILABLE_MODULES.filter(m => !modules.some(x => x.type === m.type))

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
        width: '90vw', maxWidth: 700, maxHeight: '90vh',
        background: T.bg, borderRadius: 14, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* ヘッダー */}
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
          background: T.bgCard,
        }}>
          <span style={{ fontSize: 18 }}>{isNew ? '➕' : '✏️'}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: T.text }}>
            {isNew ? '会議を追加' : `会議を編集: ${meeting.title}`}
          </span>
          <button onClick={onClose} style={{
            padding: '4px 10px', borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: 'transparent', color: T.textSub,
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>キャンセル</button>
        </div>

        {/* 本体 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {err && (
            <div style={{
              padding: 8, marginBottom: 12,
              background: `${T.danger}15`, border: `1px solid ${T.danger}40`,
              borderRadius: 7, color: T.danger, fontSize: 12,
            }}>{err}</div>
          )}

          {/* 基本情報 */}
          <div style={sectionSt}>
            <label style={labelSt}>タイトル <span style={{ color: T.danger }}>*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 週次定例" style={inputSt} />
          </div>

          <div style={sectionSt}>
            <label style={labelSt}>key (URL / 識別子) <span style={{ color: T.danger }}>*</span></label>
            <input
              value={key} onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
              placeholder="例: weekly-team" style={inputSt}
              disabled={!isNew}
            />
            {!isNew && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>key は編集できません (進行履歴との互換性のため)</div>}
          </div>

          <div style={{ ...sectionSt, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelSt}>アイコン</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {PRESET_ICONS.map(i => (
                  <button key={i} onClick={() => setIcon(i)} style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: `1px solid ${icon === i ? T.accent : T.border}`,
                    background: icon === i ? `${T.accent}18` : T.bgCard,
                    fontSize: 16, cursor: 'pointer',
                  }}>{i}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={labelSt}>色</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{
                    width: 28, height: 28, borderRadius: 8,
                    border: color === c ? `2px solid ${T.text}` : `1px solid ${T.border}`,
                    background: c, cursor: 'pointer',
                  }} />
                ))}
              </div>
            </div>
          </div>

          <div style={sectionSt}>
            <label style={labelSt}>曜日</label>
            <select value={dayOfWeek ?? ''} onChange={e => setDayOfWeek(e.target.value === '' ? null : Number(e.target.value))} style={{ ...inputSt, cursor: 'pointer' }}>
              {DAYS_OF_WEEK.map(d => (
                <option key={d.label} value={d.v ?? ''}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* モジュール構成 */}
          <div style={sectionSt}>
            <label style={labelSt}>モジュール構成 (= 会議のステップ順序) <span style={{ color: T.danger }}>*</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {modules.map((m, idx) => {
                const meta = MODULE_META[m.type] || { icon: '?', label: m.type, desc: '' }
                return (
                  <div key={`${m.type}-${idx}`} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 11, color: T.textMuted, width: 18, textAlign: 'center' }}>{idx + 1}</span>
                    <span style={{ fontSize: 18 }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{meta.label}</div>
                      <div style={{ fontSize: 10, color: T.textMuted }}>{meta.desc}</div>
                    </div>
                    <button onClick={() => handleMoveModule(idx, -1)} disabled={idx === 0} title="上へ" style={iconBtnSt(T, idx === 0)}>↑</button>
                    <button onClick={() => handleMoveModule(idx, 1)} disabled={idx === modules.length - 1} title="下へ" style={iconBtnSt(T, idx === modules.length - 1)}>↓</button>
                    <button onClick={() => handleRemoveModule(idx)} title="削除" style={{ ...iconBtnSt(T, false), color: T.danger }}>×</button>
                  </div>
                )
              })}
              {modules.length === 0 && (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: T.textFaint, background: T.bgCard, borderRadius: 8 }}>
                  下から追加してください
                </div>
              )}
            </div>

            {availableToAdd.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>追加可能なモジュール:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {availableToAdd.map(m => (
                    <button key={m.type} onClick={() => handleAddModule(m.type)} style={{
                      padding: '4px 10px', borderRadius: 6,
                      border: `1px dashed ${T.border}`,
                      background: 'transparent', color: T.text,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>+ {m.icon} {m.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* フッター */}
        <div style={{
          padding: '10px 16px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          background: T.bgCard,
        }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 7,
            border: `1px solid ${T.border}`,
            background: 'transparent', color: T.textSub,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>キャンセル</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 20px', borderRadius: 7,
            border: 'none', background: saving ? T.border : T.accent,
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>{saving ? '保存中…' : (isNew ? '作成' : '保存')}</button>
        </div>
      </div>
    </div>
  )
}

function iconBtnSt(T, disabled) {
  return {
    width: 26, height: 26, borderRadius: 6,
    border: `1px solid ${T.border}`,
    background: 'transparent',
    color: disabled ? T.textFaint : T.textSub,
    fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}

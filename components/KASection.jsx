'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { computeKAKey } from '../lib/kaKey'

// ─── 共通 KA セクション ─────────────────────────────────────────
// 展開・追加・削除・担当変更できる weekly_reports ベースの KA 表示パネル
// OKR詳細 年間ビュー / 個人ビュー 両方から同じ体験で使うための共通化。
//
// Props:
//   krId        (必須): KR の id
//   objectiveId (必須): 親 Objective の id (追加時に使用)
//   levelId     (必須): 組織 level の id (追加時に使用)
//   theme       : テーマオブジェクト (accent, text, bgCard などのカラー定義)
//                 未指定時は明色テーマのデフォルトを適用
export default function KASection({ krId, objectiveId, levelId, theme }) {
  const T = theme || DEFAULT_THEME

  const [reports, setReports] = useState([])
  const [members,  setMembers]  = useState([])
  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [adding,   setAdding]   = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newOwner, setNewOwner] = useState('')

  // 現在週の月曜日 (JST)
  const currentWeekStart = (() => {
    const now = new Date()
    const jst = new Date(now.getTime() + 9 * 3600 * 1000)
    const day = jst.getUTCDay()
    const diff = jst.getUTCDate() - day + (day === 0 ? -6 : 1)
    jst.setUTCDate(diff)
    return jst.toISOString().split('T')[0]
  })()

  useEffect(() => {
    if (!krId) return
    load()
  }, [krId])

  useEffect(() => {
    if (!open || members.length > 0) return
    supabase.from('members').select('id,name,email').order('name').then(({ data }) => setMembers(data || []))
  }, [open])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('weekly_reports')
      .select('*').eq('kr_id', krId).neq('status', 'done').range(0, 9999)
    setReports(data || [])
    setLoading(false)
  }

  // ka_key で重複排除 (最新週のデータを優先)
  const uniqueKAs = (() => {
    const map = new Map()
    for (const r of reports) {
      const k = computeKAKey(r)
      const cur = map.get(k)
      if (!cur || (r.week_start || '') > (cur.week_start || '')) map.set(k, r)
    }
    return Array.from(map.values())
  })()

  const addKA = async () => {
    if (!newTitle.trim()) return
    const payload = {
      week_start: currentWeekStart,
      level_id: levelId,
      objective_id: objectiveId,
      kr_id: krId,
      ka_title: newTitle.trim(),
      owner: newOwner || '',
      status: 'normal',
    }
    const { data, error } = await supabase.from('weekly_reports').insert(payload).select().single()
    if (error) { alert('KA追加失敗: ' + error.message); return }
    if (data) { setReports(p => [...p, data]); setNewTitle(''); setNewOwner(''); setAdding(false) }
  }

  const deleteKA = async (report) => {
    if (!window.confirm(`この KA「${report.ka_title}」を全週分 まとめて削除しますか？`)) return
    const { data: candidates } = await supabase.from('weekly_reports')
      .select('id, owner')
      .eq('kr_id', report.kr_id)
      .eq('ka_title', report.ka_title || '')
      .eq('objective_id', report.objective_id)
    const targetOwner = (report.owner || '').trim()
    const ids = (candidates || [])
      .filter(r => (r.owner || '').trim() === targetOwner)
      .map(r => r.id)
    if (ids.length === 0) ids.push(report.id)
    const { error } = await supabase.from('weekly_reports').delete().in('id', ids)
    if (error) { alert('削除失敗: ' + error.message); return }
    const key = computeKAKey(report)
    setReports(p => p.filter(r => computeKAKey(r) !== key))
  }

  const updateOwner = async (report, newOwner) => {
    const { data: candidates } = await supabase.from('weekly_reports')
      .select('id, owner')
      .eq('kr_id', report.kr_id)
      .eq('ka_title', report.ka_title || '')
      .eq('objective_id', report.objective_id)
    const targetOwner = (report.owner || '').trim()
    const ids = (candidates || [])
      .filter(r => (r.owner || '').trim() === targetOwner)
      .map(r => r.id)
    if (ids.length === 0) ids.push(report.id)
    const { error } = await supabase.from('weekly_reports').update({ owner: newOwner }).in('id', ids)
    if (error) { alert('担当者変更失敗: ' + error.message); return }
    setReports(p => p.map(r => ids.includes(r.id) ? { ...r, owner: newOwner } : r))
  }

  return (
    <div style={{ marginTop: 6, marginBottom: 8 }}>
      <div onClick={() => setOpen(p => !p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginBottom: open ? 8 : 0 }}>
        <span style={{ fontSize: 10, color: T.accent, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
        <span style={{ fontSize: 11, color: T.accent }}>{open ? 'KA を閉じる' : 'KA を表示'}</span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: T.badgeBg, color: '#fff' }}>
          {uniqueKAs.length}件
        </span>
      </div>

      {open && (
        <>
          {loading && <div style={{ fontSize: 11, color: T.textMuted, padding: '4px 0' }}>読み込み中...</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
            {uniqueKAs.map(ka => (
              <div key={ka.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, background: T.bgCard2, border: `1px solid ${T.border}` }}>
                <span style={{ flex: 1, fontSize: 12, color: T.textSub, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ka.ka_title || '(無題)'}</span>
                <select value={ka.owner || ''} onChange={e => updateOwner(ka, e.target.value)} onClick={e => e.stopPropagation()} style={{
                  fontSize: 10, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4,
                  color: T.textSub, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px', outline: 'none',
                }}>
                  <option value="">-- 担当 --</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
                <button onClick={() => deleteKA(ka)} style={{ background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}>✕</button>
              </div>
            ))}
            {uniqueKAs.length === 0 && !loading && (
              <div style={{ fontSize: 11, color: T.textFaintest, fontStyle: 'italic', padding: '2px 0' }}>KAがありません</div>
            )}
          </div>

          {adding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                autoFocus value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (newTitle.trim()) addKA() }
                  if (e.key === 'Escape') setAdding(false)
                }}
                placeholder="KA タイトル (Enter追加・Shift+Enter改行)"
                rows={2}
                style={{ flex: 1, background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: T.text, outline: 'none', fontFamily: 'inherit', resize: 'vertical', minHeight: 56, lineHeight: 1.6 }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={newOwner} onChange={e => setNewOwner(e.target.value)}
                  style={{ fontSize: 11, background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 6, padding: '5px 8px', color: T.text, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
                  <option value="">-- 担当 (任意) --</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
                <button onClick={addKA} disabled={!newTitle.trim()} style={{ background: newTitle.trim() ? (T.accentSolid || T.accent) : T.badgeBg, border: 'none', color: '#fff', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: newTitle.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>追加</button>
                <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.accent, background: 'transparent', border: `1px dashed ${T.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
              ＋ KAを追加
            </button>
          )}
        </>
      )}
    </div>
  )
}

const DEFAULT_THEME = {
  accent:       '#4d9fff',
  accentSolid:  '#4d9fff',
  text:         '#1a1f36',
  textSub:      '#4a5270',
  textMuted:    '#7a8599',
  textFaint:    '#a0acbf',
  textFaintest: '#c0c9d5',
  bgCard:       '#ffffff',
  bgCard2:      '#f5f7fb',
  border:       'rgba(0,0,0,0.08)',
  borderMid:    'rgba(0,0,0,0.12)',
  badgeBg:      '#4d9fff',
  badgeBorder:  'rgba(77,159,255,0.4)',
}

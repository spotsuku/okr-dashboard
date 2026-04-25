'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { computeKAKey } from '../lib/kaKey'
import { useAutoSave } from '../lib/useAutoSave'

// ─── 共通 KA セクション ─────────────────────────────────────────
// 展開・追加・削除・担当変更・タイトル編集ができる weekly_reports ベースの KA 表示パネル。
// OKR詳細 年間ビュー / 個人ビュー 両方から同じ体験で使うための共通化。
// 入力は Excel 風（クリックで編集 → ブラーで自動保存）。週次MTGと同じ weekly_reports を
// そのまま読み書きし、Supabase Realtime で他クライアントからの変更を即時反映する。
//
// Props:
//   krId        (必須): KR の id
//   objectiveId (必須): 親 Objective の id (追加時に使用)
//   levelId     (必須): 組織 level の id (追加時に使用)
//   theme       : テーマオブジェクト (accent, text, bgCard などのカラー定義)
//                 未指定時は明色テーマのデフォルトを適用

const STATUS_CFG = {
  focus:  { label: '🎯 注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)',  border: 'rgba(77,159,255,0.3)' },
  good:   { label: '✅ Good', color: '#00d68f', bg: 'rgba(0,214,143,0.1)',    border: 'rgba(0,214,143,0.3)' },
  more:   { label: '🔺 More', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)',  border: 'rgba(255,107,107,0.3)' },
  normal: { label: '未分類',  color: '#606880', bg: 'rgba(128,128,128,0.08)', border: 'rgba(128,128,128,0.2)' },
  done:   { label: '✓ 完了',  color: '#a0a8be', bg: 'rgba(160,168,190,0.08)', border: 'rgba(160,168,190,0.2)' },
}
const STATUS_ORDER = ['normal','focus','good','more','done']

const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function Avatar({ name, avatarUrl, size = 20 }) {
  if (!name) return <div style={{ width:size, height:size, borderRadius:'50%', background:'transparent', flexShrink:0 }} />
  const c = avatarColor(name)
  return avatarUrl
    ? <img src={avatarUrl} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', border:`1.5px solid ${c}60`, flexShrink:0 }} />
    : <div style={{ width:size, height:size, borderRadius:'50%', background:`${c}25`, border:`1.5px solid ${c}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.38, fontWeight:700, color:c, flexShrink:0 }}>{name.slice(0,2)}</div>
}

export default function KASection({ krId, objectiveId, levelId, theme }) {
  const T = theme || DEFAULT_THEME

  const [reports, setReports] = useState([])
  const [members, setMembers] = useState([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [adding,  setAdding]  = useState(false)
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
    supabase.from('members').select('id,name,email,avatar_url').order('name').then(({ data }) => setMembers(data || []))
  }, [krId])

  // Supabase Realtime購読（この KR の weekly_reports 変更を即時反映）
  useEffect(() => {
    if (!krId) return
    const channel = supabase
      .channel(`ka_section_${krId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_reports', filter: `kr_id=eq.${krId}` }, payload => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setReports(prev => prev.some(r => r.id === payload.new.id)
            ? prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r)
            : [...prev, payload.new])
        } else if (payload.eventType === 'INSERT' && payload.new) {
          setReports(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new])
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setReports(prev => prev.filter(r => r.id !== payload.old.id))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [krId])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('weekly_reports')
      .select('*').eq('kr_id', krId).range(0, 49999)
    setReports(data || [])
    setLoading(false)
  }

  // ka_key で重複排除 (最新週のデータを優先)。status=done のKAはリストから除外。
  const uniqueKAs = (() => {
    const map = new Map()
    for (const r of reports) {
      const k = computeKAKey(r)
      const cur = map.get(k)
      if (!cur || (r.week_start || '') > (cur.week_start || '')) map.set(k, r)
    }
    return Array.from(map.values()).filter(r => r.status !== 'done')
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
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {loading && <div style={{ fontSize: 11, color: T.textMuted, padding: '4px 0' }}>読み込み中...</div>}

          {uniqueKAs.length > 0 && (
            <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', marginBottom: 6, background: T.bgCard2, borderRadius: 7, overflow: 'hidden', border: `1px solid ${T.border}` }}>
              <colgroup>
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: 80 }} />
                <col style={{ width: 28 }} />
              </colgroup>
              <thead>
                <tr style={{ background: T.bgCard }}>
                  <th style={thS(T)}>担当</th>
                  <th style={thS(T)}>KAタイトル</th>
                  <th style={{ ...thS(T), textAlign: 'center' }}>状態</th>
                  <th style={thS(T)}></th>
                </tr>
              </thead>
              <tbody>
                {uniqueKAs.map(ka => (
                  <KARow key={ka.id} ka={ka} members={members} T={T} onDelete={() => deleteKA(ka)} />
                ))}
              </tbody>
            </table>
          )}
          {uniqueKAs.length === 0 && !loading && (
            <div style={{ fontSize: 11, color: T.textFaintest, fontStyle: 'italic', padding: '2px 0', marginBottom: 6 }}>KAがありません</div>
          )}

          {adding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                autoFocus value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (newTitle.trim()) addKA() }
                  if (e.key === 'Escape') setAdding(false)
                }}
                placeholder="KA タイトル（確定後にEnterで追加 / Shift+Enterで改行）"
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
        </div>
      )}
    </div>
  )
}

// ─── 1行（Excel風インライン編集 + 800msデバウンス自動保存） ─────
function KARow({ ka, members, T, onDelete }) {
  const [kaTitle,      setKaTitle]      = useState(ka.ka_title || '')
  const [ownerDraft,   setOwnerDraft]   = useState(ka.owner || '')
  const [status,       setStatus]       = useState(ka.status || 'normal')
  const [editingTitle, setEditingTitle] = useState(false)
  const autoSave = useAutoSave('weekly_reports', ka.id)

  // リモート更新をマージ（編集中フィールドは上書きしない）
  useEffect(() => {
    const ff = autoSave.focusedField
    if (ff !== 'ka_title' && !editingTitle) setKaTitle(ka.ka_title || '')
    if (ff !== 'owner')    setOwnerDraft(ka.owner || '')
    if (ff !== 'status')   setStatus(ka.status || 'normal')
  }, [ka.ka_title, ka.owner, ka.status]) // eslint-disable-line

  // 他週の同じ KA 行（kr_id / ka_title / objective_id / owner 一致）にも同フィールドを反映
  const syncSiblingWeeks = async (field, value) => {
    const { data: candidates } = await supabase.from('weekly_reports')
      .select('id, owner')
      .eq('kr_id', ka.kr_id)
      .eq('ka_title', ka.ka_title || '')
      .eq('objective_id', ka.objective_id)
      .neq('id', ka.id)
    const targetOwner = (ka.owner || '').trim()
    const ids = (candidates || [])
      .filter(r => (r.owner || '').trim() === targetOwner)
      .map(r => r.id)
    if (ids.length === 0) return
    await supabase.from('weekly_reports').update({ [field]: value }).in('id', ids)
  }

  // ka_tasks の ka_key を追従
  const syncTaskKaKey = async (oldKey, newKey) => {
    if (!oldKey || !newKey || oldKey === newKey) return
    await supabase.from('ka_tasks').update({ ka_key: newKey }).eq('ka_key', oldKey)
  }

  const handleOwnerChange = (val) => {
    setOwnerDraft(val)
    autoSave.save('owner', val)
    const oldKey = computeKAKey(ka)
    const newKey = computeKAKey({ ...ka, owner: val })
    syncTaskKaKey(oldKey, newKey)
    syncSiblingWeeks('owner', val)
  }

  const handleTitleBlur = () => {
    setEditingTitle(false)
    autoSave.setFocusedField(null)
    const trimmed = kaTitle.trim()
    if (trimmed && trimmed !== (ka.ka_title || '')) {
      autoSave.saveNow('ka_title', trimmed)
      const oldKey = computeKAKey(ka)
      const newKey = computeKAKey({ ...ka, ka_title: trimmed })
      syncTaskKaKey(oldKey, newKey)
      syncSiblingWeeks('ka_title', trimmed)
    } else if (!trimmed) {
      setKaTitle(ka.ka_title || '')
    }
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setKaTitle(ka.ka_title || '')
      setEditingTitle(false)
      autoSave.setFocusedField(null)
      return
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      // IME非変換中のEnterで確定（blur → 保存）
      e.preventDefault()
      e.target.blur()
    }
  }

  const cycleStatus = () => {
    const idx = STATUS_ORDER.indexOf(status)
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
    setStatus(next)
    autoSave.saveNow('status', next)
  }

  const cfg = STATUS_CFG[status] || STATUS_CFG.normal
  const ownerMember = members.find(m => m.name === ownerDraft)
  const cellS = { padding: '5px 8px', borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle', fontSize: 12 }

  return (
    <tr>
      <td style={{ ...cellS, width: 110 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Avatar name={ownerDraft} avatarUrl={ownerMember?.avatar_url} size={20} />
          <select value={ownerDraft}
            onChange={e => handleOwnerChange(e.target.value)}
            onFocus={() => autoSave.setFocusedField('owner')}
            onBlur={() => autoSave.setFocusedField(null)}
            style={{ flex: 1, background: 'transparent', border: 'none', color: ownerDraft ? avatarColor(ownerDraft) : T.textMuted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', outline: 'none', fontWeight: 600, minWidth: 0 }}>
            <option value="">--</option>
            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>
      </td>
      <td style={cellS}>
        {editingTitle ? (
          <textarea autoFocus value={kaTitle}
            onChange={e => setKaTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            rows={1}
            style={{ width: '100%', boxSizing: 'border-box', background: T.bgCard, border: `1px solid ${T.accent}80`, borderRadius: 4, padding: '3px 6px', color: T.text, fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5, minHeight: 24 }}
          />
        ) : (
          <div onClick={() => { setEditingTitle(true); autoSave.setFocusedField('ka_title') }}
            title="クリックで編集"
            style={{ fontSize: 12, color: T.textSub, cursor: 'text', lineHeight: 1.4, minHeight: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {kaTitle || '(無題)'}
          </div>
        )}
      </td>
      <td style={{ ...cellS, width: 80, textAlign: 'center' }}>
        <span onClick={cycleStatus}
          title="クリックでステータス切替"
          style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 99, cursor: 'pointer', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap', display: 'inline-block' }}>
          {cfg.label}
        </span>
      </td>
      <td style={{ ...cellS, width: 28, textAlign: 'center', padding: '5px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
          {autoSave.saving && <span style={{ fontSize: 9, color: T.accent }}>⟳</span>}
          {autoSave.saved && <span style={{ fontSize: 9, color: '#00d68f' }}>✓</span>}
          <button onClick={onDelete}
            title="削除"
            style={{ background: 'none', border: 'none', color: T.textFaint, cursor: 'pointer', fontSize: 11, padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>
      </td>
    </tr>
  )
}

const thS = (T) => ({ padding: '5px 8px', fontSize: 9, color: T.textMuted, fontWeight: 700, borderBottom: `1px solid ${T.border}`, textAlign: 'left', whiteSpace: 'nowrap' })

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

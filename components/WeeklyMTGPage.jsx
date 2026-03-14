'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── ヘルパー ──────────────────────────────────────────────────────────────────
function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}
function formatWeekLabel(w) {
  const d = new Date(w)
  return `${d.getMonth()+1}/${d.getDate()}`
}
function getPastWeeks(n = 10) {
  const weeks = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i * 7)
    weeks.push(getMondayOf(d))
  }
  return [...new Set(weeks)].sort((a, b) => b.localeCompare(a))
}
function getDepth(levelId, levels) {
  let d = 0, cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) { d++; cur = levels.find(l => Number(l.id) === Number(cur.parent_id)) }
  return d
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f', 3: '#ffd166' }
const STATUS_CFG = {
  focus:  { label: '🎯 注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)',  border: 'rgba(77,159,255,0.3)' },
  good:   { label: '✅ Good', color: '#00d68f', bg: 'rgba(0,214,143,0.1)',    border: 'rgba(0,214,143,0.3)' },
  more:   { label: '🔺 More', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)',  border: 'rgba(255,107,107,0.3)' },
  normal: { label: '未分類',  color: '#606880', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' },
}

// ─── KA入力モーダル ────────────────────────────────────────────────────────────
function ReportModal({ initial, onSave, onClose, levels, weekStart, objectives }) {
  const [kaTitle,     setKaTitle]     = useState(initial?.ka_title || '')
  const [objectiveId, setObjectiveId] = useState(String(initial?.objective_id || ''))
  const [owner,       setOwner]       = useState(initial?.owner || '')
  const [assistant,   setAssistant]   = useState(initial?.assistant || '')
  const [focusOutput, setFocusOutput] = useState(initial?.focus_output || '')
  const [good,        setGood]        = useState(initial?.good || '')
  const [more,        setMore]        = useState(initial?.more || '')
  const [nextAction,  setNextAction]  = useState(initial?.next_action || '')
  const [status,      setStatus]      = useState(initial?.status || 'normal')
  const [reportTime,  setReportTime]  = useState(initial?.report_time || '')
  const [levelId,     setLevelId]     = useState(String(initial?.level_id || levels[0]?.id || ''))
  const [saving,      setSaving]      = useState(false)

  // level変更時はobjective_idをリセット
  const handleLevelChange = (v) => { setLevelId(v); setObjectiveId('') }

  // 選択中levelのOKR一覧
  const levelObjs = objectives.filter(o => Number(o.level_id) === Number(levelId))

  const save = async () => {
    if (!kaTitle.trim()) return
    setSaving(true)
    await onSave({
      id: initial?.id,
      week_start:   weekStart,
      level_id:     parseInt(levelId),
      objective_id: objectiveId ? parseInt(objectiveId) : null,
      ka_title:     kaTitle.trim(),
      kr_title:     objectives.find(o => o.id === parseInt(objectiveId))?.title || null,
      owner:        owner.trim() || null,
      assistant:    assistant.trim() || null,
      focus_output: focusOutput.trim() || null,
      good:         good.trim() || null,
      more:         more.trim() || null,
      next_action:  nextAction.trim() || null,
      status,
      report_time:  reportTime.trim() || null,
    })
    setSaving(false)
    onClose()
  }

  const S = { border: 'rgba(255,255,255,0.1)', text: '#e8eaf0', muted: '#606880' }
  const inputStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, borderRadius: 8, padding: '9px 12px', color: S.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }
  const lbl = t => <div style={{ fontSize: 11, color: S.muted, marginBottom: 5, marginTop: 4 }}>{t}</div>

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{initial?.id ? 'KAレポートを編集' : 'KAレポートを追加'}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#a0a8be', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>

          {lbl('所属部署')}
          <select value={levelId} onChange={e => handleLevelChange(e.target.value)} style={{ ...inputStyle, background: '#1a2030', cursor: 'pointer' }}>
            {levels.map(l => <option key={l.id} value={String(l.id)}>{l.icon} {l.name}</option>)}
          </select>

          {lbl('紐づくOKR（任意）')}
          <select value={objectiveId} onChange={e => setObjectiveId(e.target.value)} style={{ ...inputStyle, background: '#1a2030', cursor: 'pointer' }}>
            <option value="">-- OKRを選択 --</option>
            {levelObjs.map(o => <option key={o.id} value={String(o.id)}>{o.title}</option>)}
          </select>

          {lbl('KAタイトル *')}
          <input value={kaTitle} onChange={e => setKaTitle(e.target.value)} placeholder="例：CSジャーニーの可視化" style={inputStyle} />

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>{lbl('KA責任者')}<input value={owner} onChange={e => setOwner(e.target.value)} placeholder="例：鬼木" style={inputStyle} /></div>
            <div style={{ flex: 1 }}>{lbl('アシスタント')}<input value={assistant} onChange={e => setAssistant(e.target.value)} placeholder="例：智弘" style={inputStyle} /></div>
            <div style={{ flex: 1 }}>{lbl('報告時間')}<input value={reportTime} onChange={e => setReportTime(e.target.value)} placeholder="例：5分" style={inputStyle} /></div>
          </div>

          {lbl('ステータス')}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {Object.entries(STATUS_CFG).map(([key, cfg]) => (
              <button key={key} onClick={() => setStatus(key)} style={{ flex: 1, padding: '6px 4px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, border: `1px solid ${status === key ? cfg.border : 'rgba(255,255,255,0.1)'}`, background: status === key ? cfg.bg : 'transparent', color: status === key ? cfg.color : '#606880' }}>{cfg.label}</button>
            ))}
          </div>

          {lbl('今週の注力アウトプット（月曜確認）')}
          <textarea value={focusOutput} onChange={e => setFocusOutput(e.target.value)} placeholder="今週やること・注力タスク" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />

          {lbl('✅ Good（良かったこと・進捗）')}
          <textarea value={good} onChange={e => setGood(e.target.value)} placeholder="うまくいったこと" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />

          {lbl('🔺 More（改善・もっとやるべきこと）')}
          <textarea value={more} onChange={e => setMore(e.target.value)} placeholder="改善が必要なこと" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />

          {lbl('ネクストアクション')}
          <textarea value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="翌週のアクション" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
            <button onClick={save} disabled={saving} style={{ background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? '保存中...' : '保存する'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── KA行 ─────────────────────────────────────────────────────────────────────
function KARow({ report, prevReport, compareMode, onEdit, onDelete, objectives }) {
  const cfg = STATUS_CFG[report.status] || STATUS_CFG.normal
  const compareStatus = !prevReport ? 'new' : prevReport.status !== report.status ? 'changed' : 'same'
  const compareCfg = { new: { label: '新規', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)' }, changed: { label: '変化', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' }, same: { label: '継続', color: '#606880', bg: 'rgba(255,255,255,0.06)' } }[compareStatus]
  const obj = report.objective_id ? objectives.find(o => o.id === Number(report.objective_id)) : null

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <div style={{ fontWeight: 600, color: '#dde0ec', fontSize: 13, marginBottom: 4, lineHeight: 1.4 }}>{report.ka_title}</div>
        {obj && (
          <div style={{ fontSize: 10, color: '#4d9fff', background: 'rgba(77,159,255,0.08)', border: '1px solid rgba(77,159,255,0.2)', borderRadius: 4, padding: '2px 7px', display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
            🎯 {obj.title}
          </div>
        )}
        {!obj && report.kr_title && (
          <div style={{ fontSize: 10, color: '#8090b0', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px', display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {report.kr_title}
          </div>
        )}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        {report.owner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${cfg.color}25`, border: `1px solid ${cfg.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: cfg.color, flexShrink: 0 }}>{report.owner.slice(0,2)}</div>
            <span style={{ color: '#a0a8be' }}>{report.owner}</span>
          </div>
        )}
        {report.report_time && <div style={{ fontSize: 10, color: '#404660', marginTop: 3 }}>⏱ {report.report_time}</div>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>{cfg.label}</span>
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 12, color: '#a0a8be', lineHeight: 1.6, maxWidth: 180 }}>
        {report.focus_output ? <div style={{ whiteSpace: 'pre-wrap' }}>{report.focus_output.slice(0,120)}{report.focus_output.length > 120 ? '…' : ''}</div> : <span style={{ color: '#303450' }}>—</span>}
      </td>
      <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 12, lineHeight: 1.6, maxWidth: 200 }}>
        {report.good && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, fontWeight: 700, color: '#00d68f' }}>✅ Good</span><div style={{ color: '#a0a8be', whiteSpace: 'pre-wrap', marginTop: 2 }}>{report.good.slice(0,100)}{report.good.length > 100 ? '…' : ''}</div></div>}
        {report.more && <div><span style={{ fontSize: 10, fontWeight: 700, color: '#ff6b6b' }}>🔺 More</span><div style={{ color: '#a0a8be', whiteSpace: 'pre-wrap', marginTop: 2 }}>{report.more.slice(0,100)}{report.more.length > 100 ? '…' : ''}</div></div>}
        {!report.good && !report.more && <span style={{ color: '#303450' }}>—</span>}
      </td>
      {compareMode && <td style={{ padding: '10px 12px', verticalAlign: 'top' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: compareCfg.bg, color: compareCfg.color }}>{compareCfg.label}</span></td>}
      <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onEdit(report)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#606880', width: 24, height: 24, borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
          <button onClick={() => onDelete(report.id)} style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', width: 24, height: 24, borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      </td>
    </tr>
  )
}

// ─── 部署セクション ────────────────────────────────────────────────────────────
function DeptSection({ level, reports, prevReports, compareMode, onEdit, onDelete, depth, objectives }) {
  const [open, setOpen] = useState(true)
  const color = LAYER_COLORS[depth] || '#a0a8be'
  const layerLabel = depth === 0 ? '経営' : depth === 1 ? '事業部' : 'チーム'

  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={() => setOpen(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: `${color}0e`, border: `1px solid ${color}28`, borderLeft: `3px solid ${color}`, borderRadius: 8, marginBottom: open ? 8 : 0, cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: 16 }}>{level.icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{level.name}</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${color}20`, color, fontWeight: 700 }}>{layerLabel}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', fontSize: 11 }}>
          {reports.filter(r => r.status === 'focus').length > 0 && <span style={{ color: '#4d9fff' }}>🎯 {reports.filter(r => r.status === 'focus').length}</span>}
          {reports.filter(r => r.status === 'good').length  > 0 && <span style={{ color: '#00d68f' }}>✅ {reports.filter(r => r.status === 'good').length}</span>}
          {reports.filter(r => r.status === 'more').length  > 0 && <span style={{ color: '#ff6b6b' }}>🔺 {reports.filter(r => r.status === 'more').length}</span>}
          {reports.length === 0 && <span style={{ color: '#303450' }}>KAなし</span>}
          <span style={{ color: '#404660', fontSize: 12, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
        </div>
      </div>
      {open && reports.length > 0 && (
        <div style={{ background: '#0e1420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['KA / 紐づくOKR', '担当', 'ステータス', '今週の注力', 'Good / More', ...(compareMode ? ['前週比'] : []), ''].map((h,i) => (
                  <th key={i} style={{ padding: '7px 12px', fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const prev = prevReports.find(p => p.ka_title === r.ka_title && p.owner === r.owner)
                return <KARow key={r.id} report={r} prevReport={prev} compareMode={compareMode} onEdit={onEdit} onDelete={onDelete} objectives={objectives} />
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && reports.length === 0 && (
        <div style={{ padding: '10px 14px', fontSize: 12, color: '#303450', fontStyle: 'italic' }}>この週のKAレポートはありません</div>
      )}
    </div>
  )
}

// ─── メインページ ──────────────────────────────────────────────────────────────
export default function WeeklyMTGPage({ levels }) {
  const weeks = getPastWeeks(10)
  const [weekIdx,       setWeekIdx]       = useState(0)
  const [reports,       setReports]       = useState([])
  const [prevRpts,      setPrevRpts]      = useState([])
  const [objectives,    setObjectives]    = useState([])
  const [loading,       setLoading]       = useState(false)
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [filterOwner,   setFilterOwner]   = useState('all')
  const [activeLevelId, setActiveLevelId] = useState(null) // サイドバー選択
  const [compareMode,   setCompareMode]   = useState(false)
  const [modal,         setModal]         = useState(null)

  const currentWeek = weeks[weekIdx]
  const prevWeek    = weeks[weekIdx + 1]

  // OKR一覧を取得（起動時1回）
  useEffect(() => {
    supabase.from('objectives').select('id,title,level_id,period').order('level_id').then(({ data }) => setObjectives(data || []))
  }, [])

  // レポート取得
  useEffect(() => {
    if (!currentWeek) return
    const load = async () => {
      setLoading(true)
      const [{ data: curr }, { data: prev }] = await Promise.all([
        supabase.from('weekly_reports').select('*').eq('week_start', currentWeek).order('level_id').order('id'),
        prevWeek ? supabase.from('weekly_reports').select('*').eq('week_start', prevWeek).order('level_id').order('id') : Promise.resolve({ data: [] }),
      ])
      setReports(curr || [])
      setPrevRpts(prev || [])
      setLoading(false)
    }
    load()
  }, [currentWeek, prevWeek])

  const reload = async () => {
    const { data: curr } = await supabase.from('weekly_reports').select('*').eq('week_start', currentWeek).order('level_id').order('id')
    setReports(curr || [])
  }

  const handleSave = async (data) => {
    if (data.id) {
      const { id, created_at, updated_at, ...rest } = data
      await supabase.from('weekly_reports').update(rest).eq('id', id)
    } else {
      const insertData = {
        week_start: data.week_start, level_id: data.level_id,
        objective_id: data.objective_id || null,
        ka_title: data.ka_title, kr_title: data.kr_title || null,
        owner: data.owner || null, assistant: data.assistant || null,
        focus_output: data.focus_output || null, good: data.good || null,
        more: data.more || null, next_action: data.next_action || null,
        status: data.status || 'normal', report_time: data.report_time || null,
      }
      await supabase.from('weekly_reports').insert([insertData])
    }
    await reload()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('削除しますか？')) return
    await supabase.from('weekly_reports').delete().eq('id', id)
    setReports(p => p.filter(r => r.id !== id))
  }

  // フィルタリング
  const displayReports = reports.filter(r => {
    const levelOk  = !activeLevelId || Number(r.level_id) === Number(activeLevelId)
    const statusOk = filterStatus === 'all' || r.status === filterStatus
    const ownerOk  = filterOwner === 'all' || r.owner === filterOwner
    return levelOk && statusOk && ownerOk
  })

  const owners = [...new Set(reports.map(r => r.owner).filter(Boolean))]

  // サイドバー用：levelsをツリーで表示
  const roots = levels.filter(l => !l.parent_id)
  function renderSidebarLevel(level, indent = 0) {
    const depth = getDepth(level.id, levels)
    const color = LAYER_COLORS[depth] || '#a0a8be'
    const count = reports.filter(r => Number(r.level_id) === Number(level.id)).length
    const isActive = Number(activeLevelId) === Number(level.id)
    const children = levels.filter(l => Number(l.parent_id) === Number(level.id))
    return (
      <div key={level.id}>
        <div onClick={() => setActiveLevelId(isActive ? null : level.id)} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px',
          paddingLeft: 10 + indent * 14, borderRadius: 7, cursor: 'pointer', marginBottom: 2,
          background: isActive ? `${color}18` : 'transparent',
          border: `1px solid ${isActive ? color + '40' : 'transparent'}`,
        }}>
          <span style={{ fontSize: 14 }}>{level.icon}</span>
          <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? color : '#a0a8be', flex: 1 }}>{level.name}</span>
          {count > 0 && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: `${color}18`, color, fontWeight: 700 }}>{count}</span>}
        </div>
        {children.map(c => renderSidebarLevel(c, indent + 1))}
      </div>
    )
  }

  // 表示グループ
  const targetLevels = activeLevelId
    ? levels.filter(l => Number(l.id) === Number(activeLevelId))
    : levels
  const grouped = targetLevels.map(l => ({
    level: l, depth: getDepth(l.id, levels),
    reports: displayReports.filter(r => Number(r.level_id) === Number(l.id)),
    prevReports: prevRpts.filter(r => Number(r.level_id) === Number(l.id)),
  })).filter(g => g.reports.length > 0)

  const totalFocus = displayReports.filter(r => r.status === 'focus').length
  const totalGood  = displayReports.filter(r => r.status === 'good').length
  const totalMore  = displayReports.filter(r => r.status === 'more').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#090d18', color: '#e8eaf0', fontFamily: 'system-ui,sans-serif' }}>

      {/* ページヘッダー */}
      <div style={{ padding: '12px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, color: '#4d9fff', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 2 }}>WEEKLY MTG</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>週次KA確認</div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#606880' }}>週：</span>
          {weeks.slice(0, 6).map((w, i) => (
            <button key={w} onClick={() => setWeekIdx(i)} style={{ padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: weekIdx === i ? 'rgba(77,159,255,0.18)' : 'transparent', border: `1px solid ${weekIdx === i ? 'rgba(77,159,255,0.45)' : 'rgba(255,255,255,0.1)'}`, color: weekIdx === i ? '#4d9fff' : '#a0a8be' }}>
              {formatWeekLabel(w)}{i === 0 ? '（今週）' : ''}
            </button>
          ))}
          <button onClick={() => setCompareMode(p => !p)} style={{ padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: compareMode ? 'rgba(168,85,247,0.12)' : 'transparent', border: `1px solid ${compareMode ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.1)'}`, color: compareMode ? '#a855f7' : '#606880' }}>🔀 前週比較</button>
          <button onClick={() => setModal({ type: 'add', levelId: activeLevelId })} style={{ padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: '#4d9fff', border: 'none', color: '#fff' }}>＋ KA追加</button>
        </div>
      </div>

      {/* サマリー＋フィルター */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        {[[`${displayReports.length}件`, '#a0a8be', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.1)'], [`🎯 ${totalFocus}`, '#4d9fff', 'rgba(77,159,255,0.08)', 'rgba(77,159,255,0.2)'], [`✅ ${totalGood}`, '#00d68f', 'rgba(0,214,143,0.08)', 'rgba(0,214,143,0.2)'], [`🔺 ${totalMore}`, '#ff6b6b', 'rgba(255,107,107,0.08)', 'rgba(255,107,107,0.2)']].map(([label, color, bg, border], i) => (
          <div key={i} style={{ padding: '3px 10px', borderRadius: 7, background: bg, border: `1px solid ${border}`, fontSize: 12, fontWeight: 600, color }}>{label}</div>
        ))}
        <div style={{ height: 14, width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
        {[['all','すべて'],['focus','🎯'],['good','✅'],['more','🔺']].map(([key, lbl]) => (
          <button key={key} onClick={() => setFilterStatus(key)} style={{ padding: '3px 9px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: filterStatus === key ? (key === 'all' ? 'rgba(255,255,255,0.12)' : STATUS_CFG[key]?.bg) : 'transparent', border: `1px solid ${filterStatus === key ? (key === 'all' ? 'rgba(255,255,255,0.25)' : STATUS_CFG[key]?.border) : 'rgba(255,255,255,0.1)'}`, color: filterStatus === key ? (key === 'all' ? '#e8eaf0' : STATUS_CFG[key]?.color) : '#606880' }}>{lbl}</button>
        ))}
        {owners.length > 0 && <>
          <div style={{ height: 14, width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
          <button onClick={() => setFilterOwner('all')} style={{ padding: '3px 9px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: filterOwner === 'all' ? 'rgba(255,255,255,0.12)' : 'transparent', border: `1px solid ${filterOwner === 'all' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}`, color: filterOwner === 'all' ? '#e8eaf0' : '#606880' }}>全員</button>
          {owners.map(o => <button key={o} onClick={() => setFilterOwner(o)} style={{ padding: '3px 9px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: filterOwner === o ? 'rgba(77,159,255,0.15)' : 'transparent', border: `1px solid ${filterOwner === o ? 'rgba(77,159,255,0.4)' : 'rgba(255,255,255,0.1)'}`, color: filterOwner === o ? '#4d9fff' : '#606880' }}>{o}</button>)}
        </>}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#606880' }}>{currentWeek}</div>
      </div>

      {/* サイドバー＋コンテンツ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* サイドバー */}
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '12px 8px', overflowY: 'auto', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 10 }}>部署</div>
          {/* 全部署 */}
          <div onClick={() => setActiveLevelId(null)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 2, background: !activeLevelId ? 'rgba(77,159,255,0.12)' : 'transparent', border: `1px solid ${!activeLevelId ? 'rgba(77,159,255,0.3)' : 'transparent'}` }}>
            <span style={{ fontSize: 14 }}>🏢</span>
            <span style={{ fontSize: 12, fontWeight: !activeLevelId ? 700 : 500, color: !activeLevelId ? '#4d9fff' : '#a0a8be', flex: 1 }}>全部署</span>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'rgba(77,159,255,0.12)', color: '#4d9fff', fontWeight: 700 }}>{reports.length}</span>
          </div>
          {roots.map(r => renderSidebarLevel(r, 0))}
        </div>

        {/* メインコンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#4d9fff', fontSize: 13 }}>読み込み中...</div>}
          {!loading && grouped.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14, color: '#606880', marginBottom: 8 }}>この週のKAレポートはまだありません</div>
              <button onClick={() => setModal({ type: 'add', levelId: activeLevelId })} style={{ padding: '8px 20px', borderRadius: 8, background: '#4d9fff', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>＋ KA追加</button>
            </div>
          )}
          {!loading && grouped.map(({ level, depth, reports: rpts, prevReports: pRpts }) => (
            <DeptSection key={level.id} level={level} reports={rpts} prevReports={pRpts} compareMode={compareMode} onEdit={r => setModal({ type: 'edit', report: r })} onDelete={handleDelete} depth={depth} objectives={objectives} />
          ))}
        </div>
      </div>

      {/* モーダル */}
      {modal && (
        <ReportModal
          initial={modal.report || (modal.levelId ? { level_id: modal.levelId } : null)}
          onSave={handleSave}
          onClose={() => setModal(null)}
          levels={levels}
          weekStart={currentWeek}
          objectives={objectives}
        />
      )}
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── ヘルパー ──────────────────────────────────────────────────────────────────
function getMondayOf(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(weekStart) {
  const d = new Date(weekStart)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function getPastWeeks(n = 8) {
  const weeks = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i * 7)
    weeks.push(getMondayOf(d))
  }
  return [...new Set(weeks)].sort((a, b) => b.localeCompare(a))
}

const STATUS_CFG = {
  focus:  { label: '🎯 注力', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)', border: 'rgba(77,159,255,0.3)' },
  good:   { label: '✅ Good', color: '#00d68f', bg: 'rgba(0,214,143,0.1)',   border: 'rgba(0,214,143,0.3)' },
  more:   { label: '🔺 More', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.3)' },
  normal: { label: '未分類',  color: '#606880', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' },
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f', 3: '#ffd166' }

function getDepth(levelId, levels) {
  let d = 0, cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) { d++; cur = levels.find(l => Number(l.id) === Number(cur.parent_id)) }
  return d
}

// ─── モーダル（KAレポート入力） ────────────────────────────────────────────────
function ReportModal({ initial, onSave, onClose, levels, weekStart }) {
  const [kaTitle,      setKaTitle]      = useState(initial?.ka_title || '')
  const [krTitle,      setKrTitle]      = useState(initial?.kr_title || '')
  const [owner,        setOwner]        = useState(initial?.owner || '')
  const [assistant,    setAssistant]    = useState(initial?.assistant || '')
  const [focusOutput,  setFocusOutput]  = useState(initial?.focus_output || '')
  const [good,         setGood]         = useState(initial?.good || '')
  const [more,         setMore]         = useState(initial?.more || '')
  const [nextAction,   setNextAction]   = useState(initial?.next_action || '')
  const [status,       setStatus]       = useState(initial?.status || 'normal')
  const [reportTime,   setReportTime]   = useState(initial?.report_time || '')
  const [levelId,      setLevelId]      = useState(String(initial?.level_id || levels[0]?.id || ''))
  const [saving,       setSaving]       = useState(false)

  const save = async () => {
    if (!kaTitle.trim()) return
    setSaving(true)
    await onSave({
      id: initial?.id,
      week_start: weekStart,
      level_id: parseInt(levelId),
      ka_title: kaTitle.trim(),
      kr_title: krTitle.trim(),
      owner: owner.trim(),
      assistant: assistant.trim(),
      focus_output: focusOutput.trim(),
      good: good.trim(),
      more: more.trim(),
      next_action: nextAction.trim(),
      status,
      report_time: reportTime.trim(),
    })
    setSaving(false)
    onClose()
  }

  const T = { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)', text: '#e8eaf0', textSub: '#a0a8be', muted: '#606880' }

  const inp = (val, set, ph, multiline = false) => multiline ? (
    <textarea value={val} onChange={e => set(e.target.value)} placeholder={ph} rows={3} style={{
      width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`,
      borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, outline: 'none',
      fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12,
    }} />
  ) : (
    <input type="text" value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{
      width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.border}`,
      borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, outline: 'none',
      fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12,
    }} />
  )

  const lbl = (text) => <div style={{ fontSize: 11, color: T.muted, marginBottom: 5, marginTop: 4 }}>{text}</div>

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{initial?.id ? 'KAレポートを編集' : 'KAレポートを追加'}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#a0a8be', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          {lbl('所属部署')}
          <select value={levelId} onChange={e => setLevelId(e.target.value)} style={{ width: '100%', background: '#1a2030', border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12, cursor: 'pointer' }}>
            {levels.map(l => <option key={l.id} value={String(l.id)}>{l.icon} {l.name}</option>)}
          </select>

          {lbl('KAタイトル *')}
          {inp(kaTitle, setKaTitle, '例：CSジャーニーの可視化')}

          {lbl('紐づくKR（任意）')}
          {inp(krTitle, setKrTitle, '例：契約更新累計20社完了')}

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>{lbl('KA責任者')}{inp(owner, setOwner, '例：鬼木')}</div>
            <div style={{ flex: 1 }}>{lbl('アシスタント')}{inp(assistant, setAssistant, '例：智弘')}</div>
            <div style={{ flex: 1 }}>{lbl('報告時間')}{inp(reportTime, setReportTime, '例：5分')}</div>
          </div>

          {lbl('ステータス')}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {Object.entries(STATUS_CFG).map(([key, cfg]) => (
              <button key={key} onClick={() => setStatus(key)} style={{
                flex: 1, padding: '6px 4px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11, fontWeight: 600, border: `1px solid ${status === key ? cfg.border : 'rgba(255,255,255,0.1)'}`,
                background: status === key ? cfg.bg : 'transparent', color: status === key ? cfg.color : '#606880',
              }}>{cfg.label}</button>
            ))}
          </div>

          {lbl('今週の注力アウトプット（月曜確認）')}
          {inp(focusOutput, setFocusOutput, '今週やること・注力タスクを記入', true)}

          {lbl('✅ Good（良かったこと・進捗）')}
          {inp(good, setGood, 'うまくいったこと、進捗を記入', true)}

          {lbl('🔺 More（改善・もっとやるべきこと）')}
          {inp(more, setMore, '改善が必要なこと、課題を記入', true)}

          {lbl('ネクストアクション')}
          {inp(nextAction, setNextAction, '翌週のアクションを記入', true)}

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
function KARow({ report, prevReport, compareMode, onEdit, onDelete }) {
  const cfg = STATUS_CFG[report.status] || STATUS_CFG.normal
  const compareStatus = !prevReport ? 'new'
    : prevReport.status !== report.status ? 'changed'
    : 'same'
  const compareCfg = {
    new:     { label: '新規', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)' },
    changed: { label: '変化', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
    same:    { label: '継続', color: '#606880', bg: 'rgba(255,255,255,0.06)' },
  }[compareStatus]

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {/* KA */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <div style={{ fontWeight: 600, color: '#dde0ec', fontSize: 13, marginBottom: 4, lineHeight: 1.4 }}>{report.ka_title}</div>
        {report.kr_title && (
          <div style={{ fontSize: 10, color: '#8090b0', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '2px 6px', display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            🎯 {report.kr_title}
          </div>
        )}
      </td>
      {/* 担当 */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
        {report.owner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${cfg.color}25`, border: `1px solid ${cfg.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: cfg.color, flexShrink: 0 }}>
              {report.owner.slice(0, 2)}
            </div>
            <span style={{ color: '#a0a8be' }}>{report.owner}</span>
          </div>
        )}
        {report.report_time && <div style={{ fontSize: 10, color: '#404660', marginTop: 3 }}>⏱ {report.report_time}</div>}
      </td>
      {/* ステータス */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>
          {cfg.label}
        </span>
      </td>
      {/* 注力アウトプット */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 12, color: '#a0a8be', lineHeight: 1.6, maxWidth: 200 }}>
        {report.focus_output ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{report.focus_output.slice(0, 120)}{report.focus_output.length > 120 ? '...' : ''}</div>
        ) : <span style={{ color: '#303450' }}>—</span>}
      </td>
      {/* Good / More */}
      <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 12, lineHeight: 1.6, maxWidth: 220 }}>
        {report.good && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#00d68f' }}>✅ Good</span>
            <div style={{ color: '#a0a8be', whiteSpace: 'pre-wrap', marginTop: 2 }}>{report.good.slice(0, 100)}{report.good.length > 100 ? '...' : ''}</div>
          </div>
        )}
        {report.more && (
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ff6b6b' }}>🔺 More</span>
            <div style={{ color: '#a0a8be', whiteSpace: 'pre-wrap', marginTop: 2 }}>{report.more.slice(0, 100)}{report.more.length > 100 ? '...' : ''}</div>
          </div>
        )}
        {!report.good && !report.more && <span style={{ color: '#303450' }}>—</span>}
      </td>
      {/* 前週比 */}
      {compareMode && (
        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: compareCfg.bg, color: compareCfg.color }}>
            {compareCfg.label}
          </span>
        </td>
      )}
      {/* 操作 */}
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
function DeptSection({ level, reports, prevReports, compareMode, onEdit, onDelete, depth }) {
  const [open, setOpen] = useState(true)
  const color = LAYER_COLORS[depth] || '#a0a8be'
  const focusCnt  = reports.filter(r => r.status === 'focus').length
  const goodCnt   = reports.filter(r => r.status === 'good').length
  const moreCnt   = reports.filter(r => r.status === 'more').length

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 部署ヘッダー */}
      <div onClick={() => setOpen(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: `${color}0e`, border: `1px solid ${color}28`, borderLeft: `3px solid ${color}`, borderRadius: 8, marginBottom: open ? 8 : 0, cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: 16 }}>{level.icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{level.name}</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `${color}20`, color, fontWeight: 700 }}>
          {depth === 0 ? '経営' : depth === 1 ? '事業部' : 'チーム'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', fontSize: 11 }}>
          {focusCnt > 0 && <span style={{ color: '#4d9fff' }}>🎯 {focusCnt}</span>}
          {goodCnt  > 0 && <span style={{ color: '#00d68f' }}>✅ {goodCnt}</span>}
          {moreCnt  > 0 && <span style={{ color: '#ff6b6b' }}>🔺 {moreCnt}</span>}
          {reports.length === 0 && <span style={{ color: '#303450' }}>KAなし</span>}
          <span style={{ color: '#404660', fontSize: 12, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
        </div>
      </div>

      {open && reports.length > 0 && (
        <div style={{ background: '#0e1420', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '7px 12px', fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>KA</th>
                <th style={{ padding: '7px 12px', fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', width: 90 }}>担当</th>
                <th style={{ padding: '7px 12px', fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', width: 80 }}>ステータス</th>
                <th style={{ padding: '7px 12px', fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>今週の注力</th>
                <th style={{ padding: '7px 12px', fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Good / More</th>
                {compareMode && <th style={{ padding: '7px 12px', fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', width: 70 }}>前週比</th>}
                <th style={{ padding: '7px 12px', fontSize: 10, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const prev = prevReports.find(p => p.ka_title === r.ka_title && p.owner === r.owner)
                return <KARow key={r.id} report={r} prevReport={prev} compareMode={compareMode} onEdit={onEdit} onDelete={onDelete} />
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
  const weeks        = getPastWeeks(10)
  const [weekIdx,    setWeekIdx]    = useState(0)
  const [reports,    setReports]    = useState([])
  const [prevRpts,   setPrevRpts]   = useState([])
  const [loading,    setLoading]    = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterOwner,  setFilterOwner]  = useState('all')
  const [compareMode,  setCompareMode]  = useState(false)
  const [modal,      setModal]      = useState(null)

  const currentWeek = weeks[weekIdx]
  const prevWeek    = weeks[weekIdx + 1]

  // データ取得
  useEffect(() => {
    if (!currentWeek) return
    const load = async () => {
      setLoading(true)
      const [{ data: curr }, { data: prev }] = await Promise.all([
        supabase.from('weekly_reports').select('*').eq('week_start', currentWeek).order('level_id').order('id'),
        prevWeek
          ? supabase.from('weekly_reports').select('*').eq('week_start', prevWeek).order('level_id').order('id')
          : Promise.resolve({ data: [] }),
      ])
      setReports(curr || [])
      setPrevRpts(prev || [])
      setLoading(false)
    }
    load()
  }, [currentWeek, prevWeek])

  // CRUD
  const handleSave = async (data) => {
    if (data.id) {
      const { id, ...rest } = data
      await supabase.from('weekly_reports').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
    } else {
      // id/updated_atを除外してinsert
      const { id: _id, updated_at: _ua, created_at: _ca, ...insertData } = data
      await supabase.from('weekly_reports').insert([insertData])
    }
    // 再読み込み
    const { data: curr } = await supabase.from('weekly_reports').select('*').eq('week_start', currentWeek).order('level_id').order('id')
    setReports(curr || [])
  }

  const handleDelete = async (id) => {
    if (!window.confirm('このKAレポートを削除しますか？')) return
    await supabase.from('weekly_reports').delete().eq('id', id)
    setReports(p => p.filter(r => r.id !== id))
  }

  // フィルタリング
  const filteredReports = reports.filter(r => {
    const statusOk = filterStatus === 'all' || r.status === filterStatus
    const ownerOk  = filterOwner  === 'all' || r.owner === filterOwner
    return statusOk && ownerOk
  })

  // 担当者リスト（ユニーク）
  const owners = [...new Set(reports.map(r => r.owner).filter(Boolean))]

  // サマリー
  const focusCnt = filteredReports.filter(r => r.status === 'focus').length
  const goodCnt  = filteredReports.filter(r => r.status === 'good').length
  const moreCnt  = filteredReports.filter(r => r.status === 'more').length

  // 部署ごとにグループ化
  const grouped = levels.map(l => ({
    level: l,
    depth: getDepth(l.id, levels),
    reports: filteredReports.filter(r => Number(r.level_id) === Number(l.id)),
    prevReports: prevRpts.filter(r => Number(r.level_id) === Number(l.id)),
  })).filter(g => g.reports.length > 0 || filterStatus === 'all')

  return (
    <div style={{ minHeight: '100%', background: '#090d18', color: '#e8eaf0', fontFamily: 'system-ui,sans-serif' }}>

      {/* ページヘッダー */}
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: '#4d9fff', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 2 }}>WEEKLY MTG</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>週次KA確認</div>
        </div>
        {/* 週選択 */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#606880' }}>週：</span>
          {weeks.slice(0, 6).map((w, i) => (
            <button key={w} onClick={() => setWeekIdx(i)} style={{
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 600,
              background: weekIdx === i ? 'rgba(77,159,255,0.18)' : 'transparent',
              border: `1px solid ${weekIdx === i ? 'rgba(77,159,255,0.45)' : 'rgba(255,255,255,0.1)'}`,
              color: weekIdx === i ? '#4d9fff' : '#a0a8be',
            }}>{formatWeekLabel(w)}{i === 0 ? '（今週）' : ''}</button>
          ))}
          {/* 前週比較ボタン */}
          <button onClick={() => setCompareMode(p => !p)} style={{
            padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 600,
            background: compareMode ? 'rgba(168,85,247,0.12)' : 'transparent',
            border: `1px solid ${compareMode ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.1)'}`,
            color: compareMode ? '#a855f7' : '#606880',
          }}>🔀 前週比較{compareMode ? '中' : ''}</button>
          {/* 追加ボタン */}
          <button onClick={() => setModal({ type: 'add' })} style={{
            padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700, background: '#4d9fff', border: 'none', color: '#fff',
          }}>＋ KA追加</button>
        </div>
      </div>

      {/* サマリーバー */}
      <div style={{ display: 'flex', gap: 10, padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { label: `${filteredReports.length} 件のKA`, color: '#a0a8be', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)' },
          { label: `🎯 注力 ${focusCnt}件`, color: '#4d9fff', bg: 'rgba(77,159,255,0.08)', border: 'rgba(77,159,255,0.2)' },
          { label: `✅ Good ${goodCnt}件`, color: '#00d68f', bg: 'rgba(0,214,143,0.08)', border: 'rgba(0,214,143,0.2)' },
          { label: `🔺 More ${moreCnt}件`, color: '#ff6b6b', bg: 'rgba(255,107,107,0.08)', border: 'rgba(255,107,107,0.2)' },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '4px 12px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, fontSize: 12, fontWeight: 600, color: s.color }}>
            {s.label}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#606880' }}>{currentWeek} 週</div>
      </div>

      {/* フィルターバー */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>表示：</span>
        {[['all','すべて'],['focus','🎯 注力'],['good','✅ Good'],['more','🔺 More']].map(([key, lbl]) => (
          <button key={key} onClick={() => setFilterStatus(key)} style={{
            padding: '4px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 11, fontWeight: 600,
            background: filterStatus === key
              ? key === 'all' ? 'rgba(255,255,255,0.12)' : STATUS_CFG[key]?.bg
              : 'transparent',
            border: `1px solid ${filterStatus === key
              ? key === 'all' ? 'rgba(255,255,255,0.25)' : STATUS_CFG[key]?.border
              : 'rgba(255,255,255,0.1)'}`,
            color: filterStatus === key
              ? key === 'all' ? '#e8eaf0' : STATUS_CFG[key]?.color
              : '#606880',
          }}>{lbl}</button>
        ))}
        {owners.length > 0 && (
          <>
            <span style={{ fontSize: 11, color: '#606880', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: 12 }}>担当者：</span>
            <button onClick={() => setFilterOwner('all')} style={{ padding: '4px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: filterOwner === 'all' ? 'rgba(255,255,255,0.12)' : 'transparent', border: `1px solid ${filterOwner === 'all' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}`, color: filterOwner === 'all' ? '#e8eaf0' : '#606880' }}>全員</button>
            {owners.map(o => (
              <button key={o} onClick={() => setFilterOwner(o)} style={{ padding: '4px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: filterOwner === o ? 'rgba(77,159,255,0.15)' : 'transparent', border: `1px solid ${filterOwner === o ? 'rgba(77,159,255,0.4)' : 'rgba(255,255,255,0.1)'}`, color: filterOwner === o ? '#4d9fff' : '#606880' }}>{o}</button>
            ))}
          </>
        )}
      </div>

      {/* コンテンツ */}
      <div style={{ padding: '16px 20px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#4d9fff', fontSize: 13 }}>読み込み中...</div>}
        {!loading && grouped.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, color: '#606880', marginBottom: 8 }}>この週のKAレポートはまだありません</div>
            <div style={{ fontSize: 12, color: '#404660' }}>「＋ KA追加」からレポートを登録してください</div>
          </div>
        )}
        {!loading && grouped.map(({ level, depth, reports: rpts, prevReports: prevRpts2 }) => (
          <DeptSection
            key={level.id}
            level={level}
            reports={rpts}
            prevReports={prevRpts2}
            compareMode={compareMode}
            onEdit={r => setModal({ type: 'edit', report: r })}
            onDelete={handleDelete}
            depth={depth}
          />
        ))}
      </div>

      {/* モーダル */}
      {modal && (
        <ReportModal
          initial={modal.report}
          onSave={handleSave}
          onClose={() => setModal(null)}
          levels={levels}
          weekStart={currentWeek}
        />
      )}
    </div>
  )
}

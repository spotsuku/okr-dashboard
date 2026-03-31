'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─── サンプルCSV ───────────────────────────────────────────────────────────────
const SAMPLE_OKR_CSV = `目標名,担当者,所属部署,期間,KR1タイトル,KR1目標値,KR1現在値,KR1単位,KR2タイトル,KR2目標値,KR2現在値,KR2単位
全社売上を前年比120%達成する,三木智弘,経営,第1四半期,売上高,100000000,72000000,円,新規顧客獲得数,20,12,社
新規パートナーを10社獲得する,田中花子,パートナー,Q1,新規契約数,10,6,社,商談件数,30,18,件
ユースイベント参加者を200名にする,鈴木一郎,ユース事業部,q1,参加者数,200,120,名,満足度,90,78,%`

const SAMPLE_KA_CSV = `KAタイトル,担当者,所属部署,ステータス,週
CSジャーニーの可視化,三木智弘,パートナー事業部,注力,2026-03-17
新規提案資料の作成,田中花子,評議会,未分類,2026-03-17
ユース向けコンテンツ企画,鈴木一郎,コンテンツ,Good,2026-03-17`

// ─── ヘルパー ──────────────────────────────────────────────────────────────────
function toPeriodKey(period, fiscalYear) {
  return fiscalYear === '2026' ? period : `${fiscalYear}_${period}`
}
function getLevelDepth(levelId, levels) {
  let d = 0, cur = levels.find(l => l.id === levelId)
  while (cur && cur.parent_id) { d++; cur = levels.find(l => l.id === cur.parent_id) }
  return d
}
function getMondayOf(dateStr) {
  const d = new Date(dateStr || new Date())
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}
function getPastWeeks(n) {
  const weeks = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i * 7)
    weeks.push(getMondayOf(d.toISOString()))
  }
  return [...new Set(weeks)].sort((a, b) => b.localeCompare(a))
}

const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }
const STATUS_OPTIONS = [
  { value: 'normal', label: '未分類',  color: '#606880' },
  { value: 'focus',  label: '🎯 注力', color: '#4d9fff' },
  { value: 'good',   label: '✅ Good', color: '#00d68f' },
  { value: 'more',   label: '🔺 More', color: '#ff6b6b' },
]
const STATUS_MAP = {
  '未分類': 'normal', 'normal': 'normal',
  '注力': 'focus', 'focus': 'focus',
  'good': 'good', 'Good': 'good', 'GOOD': 'good',
  'more': 'more', 'More': 'more', 'MORE': 'more',
}

// ─── 共通コンポーネント ────────────────────────────────────────────────────────
function DeptSelect({ value, onChange, levels }) {
  const roots = levels.filter(l => !l.parent_id)
  const renderOptions = (levelId, indent) => {
    const level = levels.find(l => l.id === levelId)
    if (!level) return []
    const depth = getLevelDepth(levelId, levels)
    const label = LAYER_LABELS[depth] || ''
    const prefix = '\u3000'.repeat(indent)
    const result = [
      <option key={level.id} value={level.name}>
        {prefix}{level.icon} {level.name}({label})
      </option>
    ]
    levels.filter(l => Number(l.parent_id) === Number(levelId)).forEach(child => {
      result.push(...renderOptions(child.id, indent + 1))
    })
    return result
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: value ? '#e8eaf0' : '#505878', fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
      <option value="">-- 部署を選択 --</option>
      {roots.flatMap(r => renderOptions(r.id, 0))}
    </select>
  )
}

function StepBar({ steps, current }) {
  const stepNum = steps.indexOf(current) + 1
  const LABELS = { upload: 'アップロード', analyzing: 'AI解析', preview: 'プレビュー・修正', done: '登録完了' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
      {steps.map((s, i) => {
        const done = stepNum > i + 1, active = stepNum === i + 1
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: done ? '#00d68f' : active ? '#4d9fff' : 'rgba(255,255,255,0.06)', color: done || active ? '#fff' : '#404660', border: `2px solid ${done ? '#00d68f' : active ? '#4d9fff' : 'rgba(255,255,255,0.1)'}` }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 10, color: active ? '#4d9fff' : done ? '#00d68f' : '#404660', whiteSpace: 'nowrap' }}>{LABELS[s] || s}</div>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: stepNum > i + 1 ? '#00d68f' : 'rgba(255,255,255,0.07)', marginBottom: 16, marginLeft: 4, marginRight: 4 }} />}
          </div>
        )
      })}
    </div>
  )
}

function DropZone({ onFile, csvText, setCsvText, fileName, dragOver, setDragOver, fileRef, accept }) {
  return (
    <>
      <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current.click()}
        style={{ border: `2px dashed ${dragOver ? '#4d9fff' : 'rgba(255,255,255,0.12)'}`, borderRadius: 16, padding: '44px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(77,159,255,0.06)' : 'rgba(255,255,255,0.02)', marginBottom: 20, transition: 'all 0.2s' }}>
        <input ref={fileRef} type="file" accept={accept || '.csv'} style={{ display: 'none' }} onChange={e => onFile(e.target.files[0])} />
        <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: dragOver ? '#4d9fff' : '#dde0ec' }}>クリックまたはドラッグ&ドロップ</div>
        <div style={{ fontSize: 12, color: '#505878' }}>CSV ファイル (.csv)</div>
        {fileName && <div style={{ marginTop: 12, fontSize: 13, color: '#4d9fff', fontWeight: 600 }}>📄 {fileName}</div>}
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#606880', marginBottom: 6 }}>またはCSVテキストを直接貼り付け</div>
        <textarea value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="CSVテキストをここに貼り付け..." rows={5}
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#e8eaf0', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
      </div>
    </>
  )
}

// ─── OKR CSV登録タブ ──────────────────────────────────────────────────────────
function OKRCsvTab({ levels, fiscalYear }) {
  const [step, setStep] = useState('upload')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [aiLogs, setAiLogs] = useState([])
  const [aiSummary, setAiSummary] = useState(null)
  const [editRows, setEditRows] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()
  const departments = levels.map(l => l.name)
  const periods = [{ value: 'annual', label: '通期' }, { value: 'q1', label: 'Q1' }, { value: 'q2', label: 'Q2' }, { value: 'q3', label: 'Q3' }, { value: 'q4', label: 'Q4' }]

  const handleFile = (file) => {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => setCsvText(e.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  const analyzeWithAI = async () => {
    if (!csvText.trim()) return
    setStep('analyzing'); setAiLogs([]); setError('')
    setAiLogs([{ msg: 'CSVを読み込みました。AIが解析を開始します...', type: 'info', time: new Date().toLocaleTimeString() }])
    try {
      setAiLogs(p => [...p, { msg: '列構造・部署名・期間の表記を解析中...', type: 'info', time: new Date().toLocaleTimeString() }])
      const res = await fetch('/api/csv-analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, departments }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || 'AI解析に失敗しました'); setStep('upload'); return }
      const logs = [{ msg: '✅ 列マッピング完了', type: 'success', time: new Date().toLocaleTimeString() }]
      data.rows.filter(r => r.fixes?.length > 0).forEach(r => r.fixes.forEach(f => logs.push({ msg: `✅ ${f}`, type: 'success', time: new Date().toLocaleTimeString() })))
      if (data.summary.warnings > 0) logs.push({ msg: `⚠️ ${data.summary.warnings}件に警告があります`, type: 'warn', time: new Date().toLocaleTimeString() })
      logs.push({ msg: `✅ AI解析完了！${data.summary.total}件を検出しました`, type: 'success', time: new Date().toLocaleTimeString() })
      setAiLogs(logs); setEditRows(data.rows.map((r, i) => ({ ...r, _id: i + 1 }))); setAiSummary(data.summary)
      setTimeout(() => setStep('preview'), 600)
    } catch (e) { setError('通信エラー: ' + e.message); setStep('upload') }
  }

  const updateRow = (id, field, val) => setEditRows(p => p.map(r => r._id === id ? { ...r, [field]: val } : r))
  const updateKR = (rowId, krIdx, field, val) => setEditRows(p => p.map(r => {
    if (r._id !== rowId) return r
    const krs = [...r.krs]; krs[krIdx] = { ...krs[krIdx], [field]: val }; return { ...r, krs }
  }))
  const removeRow = id => setEditRows(p => p.filter(r => r._id !== id))

  const handleRegister = async () => {
    setRegistering(true); setError('')
    let ok = 0, ng = 0
    for (const row of editRows) {
      const level = levels.find(l => l.name === row.department)
      if (!level) { ng++; continue }
      const periodKey = toPeriodKey(row.period, fiscalYear)
      const { data: obj, error: e1 } = await supabase.from('objectives')
        .insert({ title: row.title, owner: row.owner, level_id: level.id, period: periodKey }).select().single()
      if (e1) { ng++; continue }
      if (row.krs?.length) {
        await supabase.from('key_results').insert(
          row.krs.map(kr => ({ title: kr.title, target: parseFloat(kr.target) || 0, current: parseFloat(kr.current) || 0, unit: kr.unit || '', lower_is_better: false, objective_id: obj.id }))
        )
      }
      ok++
    }
    setRegistering(false)
    if (ng > 0) setError(`⚠️ ${ng}件は登録に失敗しました`)
    if (ok > 0) setStep('done')
  }

  const reset = () => { setStep('upload'); setCsvText(''); setFileName(''); setAiLogs([]); setAiSummary(null); setEditRows([]); setError('') }

  return (
    <div>
      <StepBar steps={['upload', 'analyzing', 'preview', 'done']} current={step} />
      {error && <div style={{ color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {step === 'upload' && (
        <div>
          <DropZone onFile={handleFile} csvText={csvText} setCsvText={setCsvText} fileName={fileName} dragOver={dragOver} setDragOver={setDragOver} fileRef={fileRef} />
          <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a855f7', marginBottom: 10 }}>🤖 AIが自動で補正できること</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              {['列名のゆらぎ（「目標名」「タイトル」など）', '部署名の略称・表記ゆれ', '期間の表記（「第1四半期」→ q1）', '全角/半角数字の自動変換', '担当者名のスペース補正', 'Excelからのコピペにも対応'].map(t => (
                <div key={t} style={{ fontSize: 11, color: '#8090b0', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: '#00d68f' }}>✓</span> {t}
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#606880', marginBottom: 6 }}>利用可能な部署・チーム：</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {levels.map(l => {
                  const depth = getLevelDepth(l.id, levels)
                  const color = LAYER_COLORS[depth] || '#a0a8be'
                  return <span key={l.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: `${color}12`, border: `1px solid ${color}30`, color }}>{l.icon} {l.name}</span>
                })}
              </div>
            </div>
            <button onClick={() => { setCsvText(SAMPLE_OKR_CSV); setFileName('') }}
              style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7', borderRadius: 7, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              サンプルCSVを読み込む
            </button>
          </div>
          <button onClick={analyzeWithAI} disabled={!csvText.trim()} style={{ width: '100%', border: 'none', color: csvText.trim() ? '#fff' : '#404660', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: csvText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', background: csvText.trim() ? 'linear-gradient(135deg,#4d9fff,#a855f7)' : 'rgba(255,255,255,0.06)' }}>
            🤖 AIで解析する（{fiscalYear}年度として登録）
          </button>
        </div>
      )}

      {step === 'analyzing' && (
        <div style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#a855f7', boxShadow: '0 0 10px #a855f7' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#a855f7' }}>AIが解析中...</span>
          </div>
          {aiLogs.map((log, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: log.type === 'success' ? '#00d68f' : log.type === 'warn' ? '#ffd166' : '#8090b0', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: '#404660', flexShrink: 0 }}>{log.time}</span>{log.msg}
            </div>
          ))}
        </div>
      )}

      {step === 'preview' && aiSummary && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 16, background: fiscalYear === '2026' ? 'rgba(77,159,255,0.08)' : 'rgba(255,159,67,0.08)', border: `1px solid ${fiscalYear === '2026' ? 'rgba(77,159,255,0.25)' : 'rgba(255,159,67,0.25)'}` }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: fiscalYear === '2026' ? '#4d9fff' : '#ff9f43' }}>{fiscalYear}年度として登録されます</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {[{ label: '検出件数', value: aiSummary.total, color: '#4d9fff' }, { label: '自動補正', value: `${aiSummary.fixed}件`, color: '#a855f7' }, { label: '要確認', value: `${aiSummary.warnings}件`, color: aiSummary.warnings ? '#ffd166' : '#00d68f' }].map(s => (
              <div key={s.label} style={{ background: '#111828', border: `1px solid ${s.color}25`, borderRadius: 10, padding: '12px 18px', flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 10, color: '#606880', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {editRows.map(row => (
              <div key={row._id} style={{ background: '#111828', border: `1px solid ${row.fixes?.length ? 'rgba(168,85,247,0.25)' : 'rgba(0,214,143,0.15)'}`, borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {row.fixes?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {row.fixes.map((f, i) => <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' }}>🤖 {f}</span>)}
                      </div>
                    )}
                    <input value={row.title} onChange={e => updateRow(row._id, 'title', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', color: '#dde0ec', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 2, minWidth: 140 }}>
                        <div style={{ fontSize: 10, color: '#606880', marginBottom: 3 }}>
                          部署 / チーム
                          {(() => {
                            const lv = levels.find(l => l.name === row.department)
                            if (!lv) return <span style={{ color: '#ff6b6b', marginLeft: 6 }}>⚠️ 未マッチ</span>
                            const depth = getLevelDepth(lv.id, levels)
                            const color = LAYER_COLORS[depth] || '#a0a8be'
                            return <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 99, background: `${color}18`, color }}>{LAYER_LABELS[depth]}</span>
                          })()}
                        </div>
                        <DeptSelect value={row.department} onChange={val => updateRow(row._id, 'department', val)} levels={levels} />
                      </div>
                      <div style={{ flex: 2, minWidth: 100 }}>
                        <div style={{ fontSize: 10, color: '#606880', marginBottom: 3 }}>担当者</div>
                        <input value={row.owner} onChange={e => updateRow(row._id, 'owner', e.target.value)}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 80 }}>
                        <div style={{ fontSize: 10, color: '#606880', marginBottom: 3 }}>期間</div>
                        <select value={row.period} onChange={e => updateRow(row._id, 'period', e.target.value)}
                          style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                          {periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => removeRow(row._id)} style={{ marginLeft: 12, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
                {row.krs?.map((kr, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '8px 10px', marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#4d9fff', flexShrink: 0 }}>KR{i + 1}</span>
                    <input value={kr.title} onChange={e => updateKR(row._id, i, 'title', e.target.value)} style={{ flex: 3, minWidth: 100, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 8px', color: '#c0c4d8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                    <input value={kr.current} onChange={e => updateKR(row._id, i, 'current', e.target.value)} placeholder="現在値" style={{ width: 70, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 8px', color: '#c0c4d8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                    <span style={{ fontSize: 11, color: '#404660' }}>/</span>
                    <input value={kr.target} onChange={e => updateKR(row._id, i, 'target', e.target.value)} placeholder="目標値" style={{ width: 70, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 8px', color: '#c0c4d8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                    <input value={kr.unit} onChange={e => updateKR(row._id, i, 'unit', e.target.value)} placeholder="単位" style={{ width: 50, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 8px', color: '#c0c4d8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={reset} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>← やり直す</button>
            <button onClick={handleRegister} disabled={registering || editRows.length === 0} style={{ flex: 1, background: 'linear-gradient(135deg,#00d68f,#4d9fff)', border: 'none', color: '#fff', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 700, cursor: registering ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: registering ? 0.6 : 1 }}>
              {registering ? '登録中...' : `✅ ${editRows.length}件を${fiscalYear}年度に登録する`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>OKR登録完了！</div>
          <div style={{ fontSize: 14, color: '#606880', marginBottom: 28 }}>{fiscalYear}年度のOKRダッシュボードに反映されました</div>
          <button onClick={reset} style={{ background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>さらに登録する</button>
        </div>
      )}
    </div>
  )
}

// ─── KA CSV登録タブ ────────────────────────────────────────────────────────────
function KACsvTab({ levels, fiscalYear }) {
  const [step, setStep] = useState('upload')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [aiLogs, setAiLogs] = useState([])
  const [aiSummary, setAiSummary] = useState(null)
  const [editRows, setEditRows] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [members, setMembers] = useState([])
  const fileRef = useRef()
  const weeks = getPastWeeks(8)

  useEffect(() => {
    supabase.from('objectives').select('id,title,level_id,period').order('id').then(({ data }) => setObjectives(data || []))
    supabase.from('key_results').select('id,title,objective_id').order('id').then(({ data }) => setKeyResults(data || []))
    supabase.from('members').select('id,name').order('name').then(({ data }) => setMembers(data || []))
  }, [])

  const departments = levels.map(l => l.name)

  const handleFile = (file) => {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => setCsvText(e.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  // ★ AI解析（KAモード）
  const analyzeWithAI = async () => {
    if (!csvText.trim()) return
    setStep('analyzing'); setAiLogs([]); setError('')
    setAiLogs([{ msg: 'CSVを読み込みました。AIがKAデータを解析します...', type: 'info', time: new Date().toLocaleTimeString() }])
    try {
      setAiLogs(p => [...p, { msg: '列名・部署名・ステータス・日付の表記を解析中...', type: 'info', time: new Date().toLocaleTimeString() }])
      const res = await fetch('/api/csv-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, departments, mode: 'ka' }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || 'AI解析に失敗しました'); setStep('upload'); return }

      const logs = [{ msg: '✅ 列マッピング完了', type: 'success', time: new Date().toLocaleTimeString() }]
      data.rows.filter(r => r.fixes?.length > 0).forEach(r =>
        r.fixes.forEach(f => logs.push({ msg: `✅ ${f}`, type: 'success', time: new Date().toLocaleTimeString() }))
      )
      if (data.summary.warnings > 0) logs.push({ msg: `⚠️ ${data.summary.warnings}件に警告があります`, type: 'warn', time: new Date().toLocaleTimeString() })
      logs.push({ msg: `✅ AI解析完了！${data.summary.total}件のKAを検出しました`, type: 'success', time: new Date().toLocaleTimeString() })

      // AIの結果にIDを付与
      setAiLogs(logs)
      setEditRows(data.rows.map((r, i) => ({
        ...r,
        _id: i + 1,
        weekStart: r.weekStart || weeks[0],
        objectiveId: null,
        krId: null,
        krTitle: '',
      })))
      setAiSummary(data.summary)
      setTimeout(() => setStep('preview'), 600)
    } catch (e) { setError('通信エラー: ' + e.message); setStep('upload') }
  }

  const updateRow = (id, field, val) => setEditRows(p => p.map(r => r._id === id ? { ...r, [field]: val } : r))
  const removeRow = id => setEditRows(p => p.filter(r => r._id !== id))
  const getObjsForLevel = (levelId) => objectives.filter(o => Number(o.level_id) === Number(levelId))
  const getKRsForObj = (objId) => keyResults.filter(kr => Number(kr.objective_id) === Number(objId))

  const handleRegister = async () => {
    setRegistering(true); setError('')
    let ok = 0, ng = 0
    for (const row of editRows) {
      if (!row.kaTitle?.trim()) { ng++; continue }
      const level = levels.find(l => l.name === row.department)
      const payload = {
        week_start: row.weekStart,
        level_id: level ? level.id : null,
        ka_title: row.kaTitle.trim(),
        owner: row.owner || null,
        status: row.status,
        kr_id: row.krId || null,
        kr_title: row.krTitle || null,
        objective_id: row.objectiveId || null,
      }
      const { error: e } = await supabase.from('weekly_reports').insert(payload)
      if (e) { ng++; console.error('KA insert error:', e) } else ok++
    }
    setRegistering(false)
    if (ng > 0) setError(`⚠️ ${ng}件は登録に失敗しました`)
    if (ok > 0) setStep('done')
  }

  const reset = () => { setStep('upload'); setCsvText(''); setFileName(''); setAiLogs([]); setAiSummary(null); setEditRows([]); setError('') }

  return (
    <div>
      <StepBar steps={['upload', 'analyzing', 'preview', 'done']} current={step} />
      {error && <div style={{ color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* アップロード */}
      {step === 'upload' && (
        <div>
          <DropZone onFile={handleFile} csvText={csvText} setCsvText={setCsvText} fileName={fileName} dragOver={dragOver} setDragOver={setDragOver} fileRef={fileRef} />
          <div style={{ background: 'rgba(0,214,143,0.06)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#00d68f', marginBottom: 10 }}>🤖 AIが自動で補正できること（KA）</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              {[
                '列名のゆらぎ（「内容」「タスク」→ KAタイトル）',
                '部署名の略称・表記ゆれ',
                'ステータスの表記統一（「注力」→ focus）',
                '日付を月曜日に自動補正',
                '全角/半角の自動変換',
                '担当者名のスペース補正',
              ].map(t => (
                <div key={t} style={{ fontSize: 11, color: '#8090b0', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: '#00d68f' }}>✓</span> {t}
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#8090b0', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, lineHeight: 1.8 }}>
              KAタイトル,担当者,所属部署,ステータス,週<br />
              CSジャーニーの可視化,田中花子,パートナー事業部,注力,2026-03-17
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#606880', marginBottom: 6 }}>利用可能な部署・チーム：</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {levels.map(l => {
                  const depth = getLevelDepth(l.id, levels)
                  const color = LAYER_COLORS[depth] || '#a0a8be'
                  return <span key={l.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: `${color}12`, border: `1px solid ${color}30`, color }}>{l.icon} {l.name}</span>
                })}
              </div>
            </div>
            <button onClick={() => { setCsvText(SAMPLE_KA_CSV); setFileName('') }}
              style={{ background: 'rgba(0,214,143,0.12)', border: '1px solid rgba(0,214,143,0.25)', color: '#00d68f', borderRadius: 7, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              サンプルCSVを読み込む
            </button>
          </div>
          <button onClick={analyzeWithAI} disabled={!csvText.trim()} style={{ width: '100%', border: 'none', color: csvText.trim() ? '#fff' : '#404660', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: csvText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', background: csvText.trim() ? 'linear-gradient(135deg,#00d68f,#4d9fff)' : 'rgba(255,255,255,0.06)' }}>
            🤖 AIで解析する（KAデータ）
          </button>
        </div>
      )}

      {/* AI解析中 */}
      {step === 'analyzing' && (
        <div style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00d68f', boxShadow: '0 0 10px #00d68f' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#00d68f' }}>AIがKAデータを解析中...</span>
          </div>
          {aiLogs.map((log, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: log.type === 'success' ? '#00d68f' : log.type === 'warn' ? '#ffd166' : '#8090b0', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: '#404660', flexShrink: 0 }}>{log.time}</span>{log.msg}
            </div>
          ))}
        </div>
      )}

      {/* プレビュー */}
      {step === 'preview' && aiSummary && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: '検出件数', value: aiSummary.total, color: '#4d9fff' },
              { label: '自動補正', value: `${aiSummary.fixed}件`, color: '#00d68f' },
              { label: '要確認', value: `${aiSummary.warnings}件`, color: aiSummary.warnings ? '#ffd166' : '#00d68f' },
            ].map(s => (
              <div key={s.label} style={{ background: '#111828', border: `1px solid ${s.color}25`, borderRadius: 10, padding: '12px 18px', flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 10, color: '#606880', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {editRows.map(row => {
              const levelObj = levels.find(l => l.name === row.department)
              const objsForLevel = levelObj ? getObjsForLevel(levelObj.id) : []
              const krsForObj = row.objectiveId ? getKRsForObj(row.objectiveId) : []
              const statusCfg = STATUS_OPTIONS.find(s => s.value === row.status) || STATUS_OPTIONS[0]
              return (
                <div key={row._id} style={{ background: '#111828', border: `1px solid ${row.fixes?.length ? 'rgba(0,214,143,0.3)' : 'rgba(0,214,143,0.15)'}`, borderRadius: 12, padding: '14px 16px' }}>
                  {row.fixes?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {row.fixes.map((f, i) => (
                        <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(0,214,143,0.12)', color: '#00d68f', border: '1px solid rgba(0,214,143,0.3)' }}>🤖 {f}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* KAタイトル */}
                      <input value={row.kaTitle} onChange={e => updateRow(row._id, 'kaTitle', e.target.value)} placeholder="KAタイトル（必須）"
                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', color: '#dde0ec', fontSize: 13, fontWeight: 600, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }} />
                      {/* 基本情報 */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <div style={{ flex: 2, minWidth: 130 }}>
                          <div style={{ fontSize: 10, color: '#606880', marginBottom: 3 }}>部署 / チーム
                            {(() => {
                              const lv = levels.find(l => l.name === row.department)
                              if (!lv) return <span style={{ color: '#ff6b6b', marginLeft: 6 }}>⚠️ 未マッチ</span>
                              const depth = getLevelDepth(lv.id, levels)
                              const color = LAYER_COLORS[depth] || '#a0a8be'
                              return <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 99, background: `${color}18`, color }}>{LAYER_LABELS[depth]}</span>
                            })()}
                          </div>
                          <DeptSelect value={row.department} onChange={val => {
                            updateRow(row._id, 'department', val)
                            updateRow(row._id, 'objectiveId', null)
                            updateRow(row._id, 'krId', null)
                            updateRow(row._id, 'krTitle', '')
                          }} levels={levels} />
                        </div>
                        <div style={{ flex: 2, minWidth: 100 }}>
                          <div style={{ fontSize: 10, color: '#606880', marginBottom: 3 }}>担当者</div>
                          <select value={row.owner || ''} onChange={e => updateRow(row._id, 'owner', e.target.value)}
                            style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                            <option value="">-- 未設定 --</option>
                            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: 1, minWidth: 90 }}>
                          <div style={{ fontSize: 10, color: '#606880', marginBottom: 3 }}>ステータス</div>
                          <select value={row.status} onChange={e => updateRow(row._id, 'status', e.target.value)}
                            style={{ width: '100%', background: '#1a2030', border: `1px solid ${statusCfg.color}40`, borderRadius: 6, padding: '6px 8px', color: statusCfg.color, fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}>
                            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ fontSize: 10, color: '#606880', marginBottom: 3 }}>週（月曜日）</div>
                          <select value={row.weekStart} onChange={e => updateRow(row._id, 'weekStart', e.target.value)}
                            style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                            {weeks.map(w => <option key={w} value={w}>{w}{w === weeks[0] ? '（今週）' : ''}</option>)}
                          </select>
                        </div>
                      </div>
                      {/* OKR・KR紐付け */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 2, minWidth: 180 }}>
                          <div style={{ fontSize: 10, color: '#4d9fff', marginBottom: 3 }}>紐づくObjective（任意）</div>
                          <select value={row.objectiveId || ''} onChange={e => {
                            const val = e.target.value ? parseInt(e.target.value) : null
                            updateRow(row._id, 'objectiveId', val)
                            updateRow(row._id, 'krId', null)
                            updateRow(row._id, 'krTitle', '')
                          }}
                            style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(77,159,255,0.2)', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                            <option value="">-- OKRを選択（任意）--</option>
                            {objsForLevel.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: 2, minWidth: 180 }}>
                          <div style={{ fontSize: 10, color: '#4d9fff', marginBottom: 3 }}>紐づくKR（任意）</div>
                          <select value={row.krId || ''} onChange={e => {
                            const val = e.target.value ? parseInt(e.target.value) : null
                            const kr = keyResults.find(k => k.id === val)
                            updateRow(row._id, 'krId', val)
                            updateRow(row._id, 'krTitle', kr ? kr.title : '')
                          }}
                            disabled={!row.objectiveId}
                            style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(77,159,255,0.2)', borderRadius: 6, padding: '6px 8px', color: row.objectiveId ? '#e8eaf0' : '#404660', fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: row.objectiveId ? 'pointer' : 'not-allowed' }}>
                            <option value="">-- KRを選択（任意）--</option>
                            {krsForObj.map(kr => <option key={kr.id} value={kr.id}>{kr.title}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeRow(row._id)} style={{ marginLeft: 4, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={reset} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>← やり直す</button>
            <button onClick={handleRegister} disabled={registering || editRows.length === 0} style={{ flex: 1, background: 'linear-gradient(135deg,#00d68f,#4d9fff)', border: 'none', color: '#fff', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 700, cursor: registering ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: registering ? 0.6 : 1 }}>
              {registering ? '登録中...' : `✅ ${editRows.length}件のKAを登録する`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>KA登録完了！</div>
          <div style={{ fontSize: 14, color: '#606880', marginBottom: 28 }}>週次MTGページに反映されました</div>
          <button onClick={reset} style={{ background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>さらに登録する</button>
        </div>
      )}
    </div>
  )
}
// ─── メインページ ──────────────────────────────────────────────────────────────
export default function CsvPage({ levels, fiscalYear = '2026' }) {
  const [activeTab, setActiveTab] = useState('okr')
  const tabs = [
    { key: 'okr', label: '🎯 OKR登録',  desc: 'OKR・KRをCSVで一括登録', grad: 'linear-gradient(135deg,#4d9fff,#a855f7)' },
    { key: 'ka',  label: '📋 KA登録',   desc: 'KAをCSVで一括登録',      grad: 'linear-gradient(135deg,#00d68f,#4d9fff)' },
  ]
  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#a855f7', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>AI-Powered</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>CSV一括登録</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: fiscalYear === '2026' ? 'rgba(77,159,255,0.15)' : 'rgba(255,159,67,0.15)', border: `1px solid ${fiscalYear === '2026' ? 'rgba(77,159,255,0.4)' : 'rgba(255,159,67,0.4)'}`, borderRadius: 8, padding: '4px 12px', color: fiscalYear === '2026' ? '#4d9fff' : '#ff9f43', fontSize: 13, fontWeight: 700 }}>
            📅 {fiscalYear}年度
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#606880', marginTop: 4 }}>OKR・KAをCSVで一括登録できます</div>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: activeTab === tab.key ? tab.grad : 'transparent',
            color: activeTab === tab.key ? '#fff' : '#606880',
            transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{tab.label}</div>
            <div style={{ fontSize: 10, opacity: activeTab === tab.key ? 0.85 : 0.6, marginTop: 2 }}>{tab.desc}</div>
          </button>
        ))}
      </div>

      {activeTab === 'okr' && <OKRCsvTab levels={levels} fiscalYear={fiscalYear} />}
      {activeTab === 'ka'  && <KACsvTab  levels={levels} fiscalYear={fiscalYear} />}
    </div>
  )
}

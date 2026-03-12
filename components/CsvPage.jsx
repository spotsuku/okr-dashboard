'use client'
import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SAMPLE_CSV = `目標名,担当者,所属部署,期間,KR1タイトル,KR1目標値,KR1現在値,KR1単位,KR2タイトル,KR2目標値,KR2現在値,KR2単位
全社売上を前年比120%達成する,三木智弘,経営,第1四半期,売上高,100000000,72000000,円,新規顧客獲得数,20,12,社
新規パートナーを10社獲得する,田中花子,パートナー,Q1,新規契約数,10,6,社,商談件数,30,18,件
ユースイベント参加者を200名にする,鈴木一郎,ユース事業部,q1,参加者数,200,120,名,満足度,90,78,%`

export default function CsvPage({ levels }) {
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

  const handleFile = (file) => {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => setCsvText(e.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  const analyzeWithAI = async () => {
    if (!csvText.trim()) return
    setStep('analyzing')
    setAiLogs([])
    setError('')

    setAiLogs([{ msg: 'CSVを読み込みました。AIが解析を開始します...', type: 'info', time: new Date().toLocaleTimeString() }])

    try {
      setAiLogs(p => [...p, { msg: '列構造・部署名・期間の表記を解析中...', type: 'info', time: new Date().toLocaleTimeString() }])

      const res = await fetch('/api/csv-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, departments }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'AI解析に失敗しました')
        setStep('upload')
        return
      }

      const logs = [
        { msg: '✅ 列マッピング完了', type: 'success', time: new Date().toLocaleTimeString() },
      ]

      const fixedRows = data.rows.filter(r => r.fixes?.length > 0)
      fixedRows.forEach(r => {
        r.fixes.forEach(f => {
          logs.push({ msg: `✅ ${f}`, type: 'success', time: new Date().toLocaleTimeString() })
        })
      })

      if (data.summary.warnings > 0) {
        logs.push({ msg: `⚠️ ${data.summary.warnings}件に警告があります`, type: 'warn', time: new Date().toLocaleTimeString() })
      }

      logs.push({ msg: `✅ AI解析完了！${data.summary.total}件を検出しました`, type: 'success', time: new Date().toLocaleTimeString() })

      setAiLogs(logs)
      setEditRows(data.rows.map((r, i) => ({ ...r, _id: i + 1 })))
      setAiSummary(data.summary)

      setTimeout(() => setStep('preview'), 600)

    } catch (e) {
      setError('通信エラーが発生しました: ' + e.message)
      setStep('upload')
    }
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
      const { data: obj, error: e1 } = await supabase
        .from('objectives')
        .insert([{ title: row.title, owner: row.owner, level_id: level.id, period: row.period }])
        .select().single()
      if (e1) { ng++; continue }
      if (row.krs?.length) {
        await supabase.from('key_results').insert(
          row.krs.map(kr => ({ title: kr.title, target: parseFloat(kr.target) || 0, current: parseFloat(kr.current) || 0, unit: kr.unit || '', lower_is_better: false, objective_id: obj.id }))
        )
      }
      ok++
    }
    setRegistering(false)
    if (ng > 0) setError(`⚠️ ${ng}件は登録に失敗しました（部署名を確認してください）`)
    if (ok > 0) setStep('done')
  }

  const reset = () => { setStep('upload'); setCsvText(''); setFileName(''); setAiLogs([]); setAiSummary(null); setEditRows([]); setError('') }

  const periods = [
    { value: 'annual', label: '通期' }, { value: 'q1', label: 'Q1' },
    { value: 'q2', label: 'Q2' }, { value: 'q3', label: 'Q3' }, { value: 'q4', label: 'Q4' },
  ]
  const STEPS = [
    { n: 1, label: 'アップロード' }, { n: 2, label: 'AI解析' },
    { n: 3, label: 'プレビュー・修正' }, { n: 4, label: '登録完了' },
  ]
  const stepNum = { upload: 1, analyzing: 2, preview: 3, done: 4 }[step]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: '#a855f7', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>AI-Powered</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>CSV一括登録</div>
        <div style={{ fontSize: 13, color: '#606880', marginTop: 4 }}>AIが列名・部署名・期間の表記ゆれを自動で補正してプレビューします</div>
      </div>

      {/* ステップ */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
        {STEPS.map((s, i) => {
          const done = stepNum > s.n, active = stepNum === s.n
          return (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: done ? '#00d68f' : active ? '#4d9fff' : 'rgba(255,255,255,0.06)', color: done || active ? '#fff' : '#404660', border: `2px solid ${done ? '#00d68f' : active ? '#4d9fff' : 'rgba(255,255,255,0.1)'}` }}>
                  {done ? '✓' : s.n}
                </div>
                <div style={{ fontSize: 10, color: active ? '#4d9fff' : done ? '#00d68f' : '#404660', whiteSpace: 'nowrap' }}>{s.label}</div>
              </div>
              {i < 3 && <div style={{ flex: 1, height: 2, background: stepNum > s.n ? '#00d68f' : 'rgba(255,255,255,0.07)', marginBottom: 16, marginLeft: 4, marginRight: 4 }} />}
            </div>
          )
        })}
      </div>

      {error && <div style={{ color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* アップロード */}
      {step === 'upload' && (
        <div>
          <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileRef.current.click()}
            style={{ border: `2px dashed ${dragOver ? '#4d9fff' : 'rgba(255,255,255,0.12)'}`, borderRadius: 16, padding: '44px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(77,159,255,0.06)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s', marginBottom: 20 }}>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
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

          <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a855f7', marginBottom: 10 }}>🤖 AIが自動で補正できること</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {['列名のゆらぎ（「目標名」「タイトル」など）', '部署名の略称・表記ゆれ', '期間の表記（「第1四半期」→ q1）', '全角/半角数字の自動変換', '担当者名のスペース補正', 'Excelからのコピペにも対応'].map(t => (
                <div key={t} style={{ fontSize: 11, color: '#8090b0', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: '#00d68f' }}>✓</span> {t}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: '#606880' }}>利用可能な部署名：</div>
              {departments.map(d => (
                <span key={d} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be' }}>{d}</span>
              ))}
            </div>
            <button onClick={() => { setCsvText(SAMPLE_CSV); setFileName('') }}
              style={{ marginTop: 12, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7', borderRadius: 7, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              サンプルCSVを読み込む
            </button>
          </div>

          <button onClick={analyzeWithAI} disabled={!csvText.trim()} style={{ width: '100%', border: 'none', color: csvText.trim() ? '#fff' : '#404660', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: csvText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', background: csvText.trim() ? 'linear-gradient(135deg,#4d9fff,#a855f7)' : 'rgba(255,255,255,0.06)' }}>
            🤖 AIで解析する
          </button>
        </div>
      )}

      {/* AI解析中 */}
      {step === 'analyzing' && (
        <div style={{ background: '#111828', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#a855f7', boxShadow: '0 0 10px #a855f7' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#a855f7' }}>AIが解析中...</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aiLogs.map((log, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: log.type === 'success' ? '#00d68f' : log.type === 'warn' ? '#ffd166' : '#8090b0' }}>
                <span style={{ fontSize: 10, color: '#404660', flexShrink: 0 }}>{log.time}</span>
                {log.msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* プレビュー */}
      {step === 'preview' && aiSummary && (
        <div>
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
                        {row.fixes.map((f, i) => (
                          <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' }}>🤖 {f}</span>
                        ))}
                      </div>
                    )}
                    <input value={row.title} onChange={e => updateRow(row._id, 'title', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', color: '#dde0ec', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 2, minWidth: 120 }}>
                        <div style={{ fontSize: 10, color: '#606880', marginBottom: 3 }}>部署</div>
                        <select value={row.department} onChange={e => updateRow(row._id, 'department', e.target.value)}
                          style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: '#e8eaf0', fontSize: 12, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                          {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
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
                    <input value={kr.title} onChange={e => updateKR(row._id, i, 'title', e.target.value)}
                      style={{ flex: 3, minWidth: 100, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 8px', color: '#c0c4d8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                    <input value={kr.current} onChange={e => updateKR(row._id, i, 'current', e.target.value)} placeholder="現在値"
                      style={{ width: 70, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 8px', color: '#c0c4d8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                    <span style={{ fontSize: 11, color: '#404660' }}>/</span>
                    <input value={kr.target} onChange={e => updateKR(row._id, i, 'target', e.target.value)} placeholder="目標値"
                      style={{ width: 70, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 8px', color: '#c0c4d8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                    <input value={kr.unit} onChange={e => updateKR(row._id, i, 'unit', e.target.value)} placeholder="単位"
                      style={{ width: 50, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '4px 8px', color: '#c0c4d8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={reset} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>← やり直す</button>
            <button onClick={handleRegister} disabled={registering || editRows.length === 0} style={{ flex: 1, background: 'linear-gradient(135deg,#00d68f,#4d9fff)', border: 'none', color: '#fff', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 700, cursor: registering ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: registering ? 0.6 : 1 }}>
              {registering ? '登録中...' : `✅ ${editRows.length}件を登録する`}
            </button>
          </div>
        </div>
      )}

      {/* 完了 */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>登録完了！</div>
          <div style={{ fontSize: 14, color: '#606880', marginBottom: 28 }}>OKRダッシュボードに反映されました</div>
          <button onClick={reset} style={{ background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            さらに登録する
          </button>
        </div>
      )}
    </div>
  )
}

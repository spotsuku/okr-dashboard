'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const CSV_SAMPLE = `department,period,title,owner,kr1_title,kr1_target,kr1_current,kr1_unit,kr2_title,kr2_target,kr2_current,kr2_unit
経営,q1,全社売上を前年比120%達成する,三木 智弘,売上高,100000000,72000000,円,新規顧客獲得数,20,12,社
パートナー事業部,q1,新規パートナーを10社獲得する,田中 花子,新規契約数,10,6,社,商談件数,30,18,件
ユース事業部,q1,ユースイベント参加者を200名にする,鈴木 一郎,参加者数,200,120,名,満足度,90,78,%`

export default function CsvPage({ levels }) {
  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [registering, setRegistering] = useState(false)

  const parseCSV = (text) => {
    setError(''); setSuccess(''); setPreview([])
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) { setError('データが2行以上必要です（1行目はヘッダー）'); return }
    const headers = lines[0].split(',').map(h => h.trim())
    const required = ['department', 'period', 'title', 'owner']
    const missing = required.filter(r => !headers.includes(r))
    if (missing.length) { setError(`必須列が不足しています: ${missing.join(', ')}`); return }

    const rows = lines.slice(1).map((line, i) => {
      const vals = line.split(',').map(v => v.trim())
      const row = {}
      headers.forEach((h, idx) => row[h] = vals[idx] || '')
      // KRをまとめる
      const krs = []
      for (let n = 1; n <= 3; n++) {
        if (row[`kr${n}_title`]) {
          krs.push({
            title: row[`kr${n}_title`],
            target: parseFloat(row[`kr${n}_target`]) || 0,
            current: parseFloat(row[`kr${n}_current`]) || 0,
            unit: row[`kr${n}_unit`] || '',
          })
        }
      }
      row._krs = krs
      row._rowNum = i + 2
      return row
    })
    setPreview(rows)
  }

  const handleRegister = async () => {
    if (!preview.length) return
    setRegistering(true)
    setError('')
    let successCount = 0
    let errCount = 0

    for (const row of preview) {
      // 部署名からlevel_idを取得
      const level = levels.find(l => l.name === row.department)
      if (!level) { errCount++; continue }

      const { data: obj, error: e1 } = await supabase
        .from('objectives')
        .insert([{ title: row.title, owner: row.owner, level_id: level.id, period: row.period.toLowerCase() }])
        .select().single()
      if (e1) { errCount++; continue }

      if (row._krs.length) {
        await supabase.from('key_results').insert(
          row._krs.map(kr => ({ ...kr, lower_is_better: false, objective_id: obj.id }))
        )
      }
      successCount++
    }

    setRegistering(false)
    if (errCount === 0) {
      setSuccess(`✅ ${successCount}件の目標を登録しました`)
      setPreview([])
      setCsvText('')
    } else {
      setSuccess(`✅ ${successCount}件登録しました`)
      setError(`⚠️ ${errCount}件は登録に失敗しました（部署名が一致しているか確認してください）`)
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>CSV一括登録</div>
        <div style={{ fontSize: 13, color: '#606880' }}>CSVテキストで目標をまとめて登録できます</div>
      </div>

      {/* フォーマット説明 */}
      <div style={{ background: 'rgba(77,159,255,0.06)', border: '1px solid rgba(77,159,255,0.2)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#4d9fff', marginBottom: 10 }}>📋 CSVフォーマット</div>
        <div style={{ fontSize: 12, color: '#8090b0', marginBottom: 12, lineHeight: 1.6 }}>
          1行目はヘッダー行です。KRは kr1〜kr3 まで追加可能です。<br />
          部署名はダッシュボードの組織名と完全一致させてください。
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '12px 14px', overflowX: 'auto', marginBottom: 12 }}>
          <code style={{ fontSize: 11, color: '#a0a8be', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            department, period, title, owner, kr1_title, kr1_target, kr1_current, kr1_unit, kr2_title, ...
          </code>
        </div>
        {/* 利用可能な部署一覧 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#606880', marginBottom: 6 }}>利用可能な部署名：</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {levels.map(l => (
              <span key={l.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be' }}>{l.name}</span>
            ))}
          </div>
        </div>
        <button onClick={() => { setCsvText(CSV_SAMPLE); setPreview([]); setError(''); setSuccess('') }}
          style={{ background: 'rgba(77,159,255,0.12)', border: '1px solid rgba(77,159,255,0.25)', color: '#4d9fff', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
          サンプルを読み込む
        </button>
      </div>

      {/* 入力エリア */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#606880', marginBottom: 6 }}>CSVテキストを貼り付け</div>
        <textarea
          value={csvText}
          onChange={e => { setCsvText(e.target.value); setPreview([]); setSuccess('') }}
          placeholder="ここにCSVテキストを貼り付けてください..."
          rows={7}
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#e8eaf0', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => parseCSV(csvText)} disabled={!csvText.trim()}
          style={{ background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: !csvText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !csvText.trim() ? 0.5 : 1 }}>
          プレビュー確認
        </button>
        <button onClick={() => { setCsvText(''); setPreview([]); setError(''); setSuccess('') }}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be', borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          クリア
        </button>
      </div>

      {error && <div style={{ color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>{error}</div>}
      {success && <div style={{ color: '#00d68f', background: 'rgba(0,214,143,0.1)', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>{success}</div>}

      {/* プレビューテーブル */}
      {preview.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#dde0ec' }}>プレビュー（{preview.length}件）</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['#', '部署', '期間', '目標タイトル', '担当者', 'KR数'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#606880', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => {
                    const levelFound = levels.some(l => l.name === row.department)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: levelFound ? 'transparent' : 'rgba(255,107,107,0.05)' }}>
                        <td style={{ padding: '10px 14px', color: '#404660' }}>{row._rowNum}</td>
                        <td style={{ padding: '10px 14px', color: levelFound ? '#4d9fff' : '#ff6b6b', fontWeight: levelFound ? 400 : 600 }}>
                          {row.department}{!levelFound && ' ⚠️'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#a0a8be', textTransform: 'uppercase' }}>{row.period}</td>
                        <td style={{ padding: '10px 14px', color: '#dde0ec', maxWidth: 240 }}>{row.title}</td>
                        <td style={{ padding: '10px 14px', color: '#a0a8be' }}>{row.owner}</td>
                        <td style={{ padding: '10px 14px', color: '#a0a8be' }}>{row._krs.length}件</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <button onClick={handleRegister} disabled={registering}
            style={{ background: '#00d68f', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 26px', fontSize: 13, fontWeight: 700, cursor: registering ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: registering ? 0.6 : 1 }}>
            {registering ? '登録中...' : `✅ この内容で${preview.length}件を登録する`}
          </button>
        </div>
      )}
    </div>
  )
}

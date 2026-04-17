'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { computeKAKey } from '../lib/kaKey'

export default function MorningMeetingImport({ open, onClose, members = [], T }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pages, setPages] = useState([]) // ページ一覧
  const [selectedPage, setSelectedPage] = useState(null) // 選択中のページ
  const [meetingInfo, setMeetingInfo] = useState(null)
  const [items, setItems] = useState([])
  const [allKAs, setAllKAs] = useState([])
  const [objMap, setObjMap] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [kaSearch, setKaSearch] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)

  // モーダルを開いたらページ一覧 + 候補KAを取得
  useEffect(() => {
    if (!open) return
    setError(null); setSaved(null); setMeetingInfo(null); setItems([]); setSelectedPage(null); setPages([])
    setLoading(true)
    Promise.all([
      fetch('/api/notion-morning-meeting').then(r => r.json()),
      supabase.from('weekly_reports').select('id,ka_title,kr_id,objective_id,owner,status,week_start')
        .neq('status','done').order('week_start', { ascending: false }).order('ka_title'),
      supabase.from('objectives').select('id,title'),
    ]).then(([nt, kas, objs]) => {
      setLoading(false)
      if (nt?.error) { setError(nt.error); return }
      const seen = new Set()
      const unique = (kas?.data || []).filter(ka => {
        const key = `${ka.ka_title}_${ka.owner}_${ka.objective_id}`
        if (seen.has(key)) return false
        seen.add(key); return true
      })
      setAllKAs(unique)
      const om = {}; (objs?.data || []).forEach(o => { om[o.id] = o }); setObjMap(om)
      setPages(nt.pages || [])
    }).catch(e => { setLoading(false); setError(e.message || '取得エラー') })
  }, [open])

  // ページを選択してアクションアイテムを取得
  const selectPage = async (page) => {
    setSelectedPage(page)
    setLoadingItems(true); setError(null); setItems([])
    try {
      const res = await fetch(`/api/notion-morning-meeting?pageId=${page.id}`)
      const nt = await res.json()
      if (nt?.error) { setError(nt.error); setLoadingItems(false); return }
      setMeetingInfo({ pageTitle: nt.pageTitle, meetingDate: nt.meetingDate, pageUrl: nt.pageUrl })
      setItems((nt.actionItems || []).map(x => ({
        include: true, text: x.text, assignee: '', reportId: '', dueDate: '',
      })))
    } catch (e) {
      setError(e.message || 'ページ取得エラー')
    }
    setLoadingItems(false)
  }

  if (!open) return null

  const filteredKAs = kaSearch
    ? allKAs.filter(k => (k.ka_title || '').toLowerCase().includes(kaSearch.toLowerCase()))
    : allKAs

  const doImport = async () => {
    const toInsert = items.filter(x => x.include && x.text.trim())
    if (toInsert.length === 0) { onClose(); return }
    setSaving(true)
    const payloads = toInsert.map(x => {
      const ka = x.reportId ? allKAs.find(k => String(k.id) === String(x.reportId)) : null
      return {
        title: x.text.trim(),
        assignee: x.assignee || null,
        due_date: x.dueDate || null,
        done: false,
        report_id: ka?.id || null,
        ka_key: computeKAKey(ka),
      }
    })
    const { error: e } = await supabase.from('ka_tasks').insert(payloads)
    setSaving(false)
    if (e) { setError('取り込みに失敗: ' + e.message); return }
    setSaved({ count: payloads.length })
    setTimeout(() => { onClose(); }, 1200)
  }

  const update = (i, field, value) => setItems(prev => prev.map((x, idx) => idx === i ? { ...x, [field]: value } : x))
  const remove = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T?.bgCard || '#fff', color: T?.text || '#1a1a1a', borderRadius: 12,
        width: '100%', maxWidth: 1000, maxHeight: '90vh', overflow: 'hidden',
        display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* ヘッダー */}
        <div style={{ padding:'14px 18px', borderBottom:`1px solid ${T?.borderMid || '#e5e5e5'}`, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:18 }}>🌅</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700 }}>朝会タスクの取り込み</div>
            {selectedPage && meetingInfo && (
              <div style={{ fontSize:11, color: T?.textMuted || '#888', marginTop:2 }}>
                {meetingInfo.meetingDate} ・ {meetingInfo.pageTitle || '(無題)'}
                {meetingInfo.pageUrl && (
                  <a href={meetingInfo.pageUrl} target="_blank" rel="noreferrer" style={{ marginLeft:8, color:'#4d9fff', textDecoration:'none' }}>↗ Notionで開く</a>
                )}
              </div>
            )}
            {!selectedPage && (
              <div style={{ fontSize:11, color: T?.textMuted || '#888', marginTop:2 }}>取り込む朝会の日付を選択してください</div>
            )}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, color: T?.textMuted || '#888', cursor:'pointer' }}>×</button>
        </div>

        {/* ボディ */}
        <div style={{ flex:1, overflow:'auto', padding:16 }}>
          {loading && <div style={{ color: T?.textMuted || '#888', fontSize:13 }}>朝会ページを読み込み中…</div>}
          {error && <div style={{ color:'#dc2626', fontSize:13, padding:'10px 12px', background:'rgba(220,38,38,0.08)', borderRadius:8, marginBottom:12 }}>{error}</div>}
          {saved && <div style={{ color:'#10b981', fontSize:13, padding:'10px 12px', background:'rgba(16,185,129,0.08)', borderRadius:8 }}>{saved.count}件のタスクを取り込みました ✓</div>}

          {/* ── ステップ1: ページ選択 ── */}
          {!loading && !saved && !selectedPage && pages.length > 0 && (
            <div>
              <div style={{ fontSize:12, color: T?.textMuted || '#888', marginBottom:10 }}>
                最新{pages.length}件の朝会ページ（Date プロパティ降順）
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {pages.map(p => (
                  <button key={p.id} onClick={() => selectPage(p)} style={{
                    display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:8,
                    border:`1px solid ${T?.borderMid || '#ddd'}`, background:'transparent', color:'inherit',
                    cursor:'pointer', fontFamily:'inherit', fontSize:13, textAlign:'left', transition:'all 0.1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = T?.bgCard2 || 'rgba(0,0,0,0.03)'; e.currentTarget.style.borderColor = '#4d9fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = T?.borderMid || '#ddd' }}
                  >
                    <span style={{ fontSize:20 }}>📝</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title || '(無題)'}</div>
                      <div style={{ fontSize:11, color: T?.textMuted || '#888', marginTop:2 }}>{p.date || '日付なし'}</div>
                    </div>
                    <span style={{ fontSize:11, color:'#4d9fff', fontWeight:600, flexShrink:0 }}>選択 →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!loading && !saved && !selectedPage && pages.length === 0 && !error && (
            <div style={{ color: T?.textMuted || '#888', fontSize:13 }}>朝会DBにページが見つかりませんでした。</div>
          )}

          {/* ── ステップ2: アクションアイテム確認 ── */}
          {loadingItems && <div style={{ color: T?.textMuted || '#888', fontSize:13 }}>アクションアイテムを読み込み中…</div>}
          {selectedPage && !loadingItems && !saved && items.length === 0 && !error && (
            <div style={{ color: T?.textMuted || '#888', fontSize:13 }}>
              アクションアイテムが見つかりませんでした。Notionページに「アクションアイテム」見出しの配下にto-doブロックを入れてください。
              <button onClick={() => setSelectedPage(null)} style={{ display:'block', marginTop:10, background:'none', border:`1px solid ${T?.borderMid || '#ddd'}`, borderRadius:6, padding:'5px 12px', color:'inherit', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>← 別の日を選ぶ</button>
            </div>
          )}
          {selectedPage && !loadingItems && !saved && items.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <button onClick={() => { setSelectedPage(null); setItems([]); setMeetingInfo(null) }} style={{ background:'none', border:`1px solid ${T?.borderMid || '#ddd'}`, borderRadius:6, padding:'4px 10px', color:'inherit', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>← 戻る</button>
                <span style={{ fontSize:11, color: T?.textMuted || '#888' }}>
                  {items.length}件の未完了アクションを検出。担当者・紐付けKA・期日を確認して取り込んでください。
                </span>
              </div>
              {items.map((x, i) => (
                <div key={i} style={{
                  display:'grid', gridTemplateColumns: '22px 1fr 130px 220px 130px 28px',
                  gap:6, alignItems:'center', padding:'6px 0', borderBottom:`0.5px solid ${T?.borderLight || '#eee'}`,
                }}>
                  <input type="checkbox" checked={x.include} onChange={e => update(i, 'include', e.target.checked)} />
                  <input type="text" value={x.text} onChange={e => update(i, 'text', e.target.value)} placeholder="タスク名"
                    style={{ padding:'5px 8px', borderRadius:6, border:`1px solid ${T?.borderMid || '#ddd'}`, background:'transparent', color:'inherit', fontSize:12, fontFamily:'inherit' }} />
                  <select value={x.assignee} onChange={e => update(i, 'assignee', e.target.value)}
                    style={{ padding:'5px 8px', borderRadius:6, border:`1px solid ${T?.borderMid || '#ddd'}`, background:'transparent', color:'inherit', fontSize:12, fontFamily:'inherit' }}>
                    <option value="">担当者未設定</option>
                    {members.map(m => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                  </select>
                  <select value={x.reportId} onChange={e => update(i, 'reportId', e.target.value)}
                    style={{ padding:'5px 8px', borderRadius:6, border:`1px solid ${T?.borderMid || '#ddd'}`, background:'transparent', color:'inherit', fontSize:12, fontFamily:'inherit' }}>
                    <option value="">KA未紐付け</option>
                    {filteredKAs.map(k => (
                      <option key={k.id} value={k.id}>
                        {objMap[k.objective_id]?.title ? `[${objMap[k.objective_id].title.slice(0,12)}] ` : ''}
                        {k.ka_title}{k.owner ? ` (${k.owner})` : ''}
                      </option>
                    ))}
                  </select>
                  <input type="date" value={x.dueDate} onChange={e => update(i, 'dueDate', e.target.value)}
                    style={{ padding:'5px 8px', borderRadius:6, border:`1px solid ${T?.borderMid || '#ddd'}`, background:'transparent', color:'inherit', fontSize:12, fontFamily:'inherit' }} />
                  <button onClick={() => remove(i)} title="削除" style={{ background:'none', border:'none', color: T?.textMuted || '#999', cursor:'pointer', fontSize:16 }}>×</button>
                </div>
              ))}
              <div style={{ marginTop:10 }}>
                <input type="text" value={kaSearch} onChange={e => setKaSearch(e.target.value)} placeholder="KAを絞り込み（タイトルで検索）"
                  style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${T?.borderMid || '#ddd'}`, background:'transparent', color:'inherit', fontSize:11, width: 280, fontFamily:'inherit' }} />
              </div>
            </>
          )}
        </div>

        {/* フッター */}
        <div style={{ padding:'10px 16px', borderTop:`1px solid ${T?.borderMid || '#e5e5e5'}`, display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onClose} disabled={saving} style={{ padding:'7px 14px', borderRadius:7, border:`1px solid ${T?.borderMid || '#ddd'}`, background:'transparent', color:'inherit', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>キャンセル</button>
          {selectedPage && !saved && (
            <button onClick={doImport} disabled={saving || loadingItems || items.filter(x => x.include && x.text.trim()).length === 0}
              style={{ padding:'7px 14px', borderRadius:7, border:'none', background:'#4d9fff', color:'#fff', fontSize:12, cursor:'pointer', opacity: (saving || loadingItems) ? 0.5 : 1, fontFamily:'inherit', fontWeight:600 }}>
              {saving ? '取り込み中…' : `${items.filter(x => x.include && x.text.trim()).length}件を取り込む`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

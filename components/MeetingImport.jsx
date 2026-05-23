'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { computeKAKey } from '../lib/kaKey'
import { openNotionUrl } from '../lib/notionLink'
import { useCurrentOrg } from '../lib/orgContext'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { btnBrand, btnSecondary } from '../lib/iosStyles'

// 汎用: どの会議でも使える議事録タスク取り込みモーダル
//   props:
//     open: boolean
//     onClose: () => void
//     meetingKey: string (例: 'morning', 'weekly-kickoff' など - lib/meetings.js 参照)
//     meetingTitle: string (表示用)
//     members: Array<{name: string}>
//     T: テーマオブジェクト
export default function MeetingImport({ open, onClose, meetingKey = 'morning', meetingTitle = '朝会', members = [], T, weekStart = null, sessionId = null, onImported }) {
  const { currentOrg } = useCurrentOrg()
  const orgQs = currentOrg?.id ? `&organization_id=${encodeURIComponent(currentOrg.id)}` : ''
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pages, setPages] = useState([])
  const [selectedPage, setSelectedPage] = useState(null)
  const [meetingInfo, setMeetingInfo] = useState(null)
  const [items, setItems] = useState([])
  const [allKAs, setAllKAs] = useState([])
  const [objMap, setObjMap] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const [kaSearch, setKaSearch] = useState('')
  const [loadingItems, setLoadingItems] = useState(false)

  // ページ一覧の取得 (初回 + 再読み込み両対応)
  const loadPages = useCallback(async () => {
    setError(null); setSaved(null); setMeetingInfo(null); setItems([]); setSelectedPage(null); setPages([])
    setLoading(true)
    try {
      // cache: 'no-store' でブラウザキャッシュを回避 (キャンセル→再取込で同じURLでも最新を取得)
      const ts = Date.now()  // 念のためクエリにタイムスタンプも追加
      const [ntRes, kasRes, objsRes] = await Promise.all([
        fetch(`/api/notion-meeting?meetingKey=${encodeURIComponent(meetingKey)}${orgQs}&_t=${ts}`, { cache: 'no-store' }),
        supabase.from('weekly_reports').select('id,ka_title,kr_id,objective_id,owner,status,week_start')
          .neq('status','done').order('week_start', { ascending: false }).order('ka_title').range(0, 49999),
        supabase.from('objectives').select('id,title').range(0, 49999),
      ])
      const nt = await ntRes.json()
      setLoading(false)
      if (nt?.error) { setError(nt.error); return }
      const seen = new Set()
      const unique = (kasRes?.data || []).filter(ka => {
        const key = `${ka.ka_title}_${ka.owner}_${ka.objective_id}`
        if (seen.has(key)) return false
        seen.add(key); return true
      })
      setAllKAs(unique)
      const om = {}; (objsRes?.data || []).forEach(o => { om[o.id] = o }); setObjMap(om)
      setPages(nt.pages || [])
    } catch (e) {
      setLoading(false); setError(e.message || '取得エラー')
    }
  }, [meetingKey, orgQs])

  useEffect(() => {
    if (!open) return
    loadPages()
  }, [open, loadPages])

  const selectPage = async (page) => {
    setSelectedPage(page)
    setLoadingItems(true); setError(null); setItems([])
    try {
      const ts = Date.now()
      const res = await fetch(
        `/api/notion-meeting?meetingKey=${encodeURIComponent(meetingKey)}&pageId=${page.id}${orgQs}&_t=${ts}`,
        { cache: 'no-store' }
      )
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

  // 選択中ページのアクションアイテムを再取得 (会議直後のNotion伝播待ちに使用)
  const reloadSelectedPage = async () => {
    if (!selectedPage) return
    await selectPage(selectedPage)
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
        // 会議コンテキストを保存 (Step3 のリストにそのまま並ぶように)
        meeting_key: meetingKey || null,
        week_start: weekStart || null,
        session_id: sessionId || null,
      }
    })
    const { error: e } = await supabase.from('ka_tasks').insert(payloads)
    setSaving(false)
    if (e) { setError('取り込みに失敗: ' + e.message); return }
    setSaved({ count: payloads.length })
    if (typeof onImported === 'function') { try { onImported(payloads.length) } catch {} }
    setTimeout(() => { onClose(); }, 1200)
  }

  const update = (i, field, value) => setItems(prev => prev.map((x, idx) => idx === i ? { ...x, [field]: value } : x))
  const remove = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:SPACING.xl }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T?.bgCard, color: T?.text, borderRadius: RADIUS.lg,
        width: '100%', maxWidth: 1000, maxHeight: '90vh', overflow: 'hidden',
        display:'flex', flexDirection:'column', boxShadow: SHADOWS.xl,
      }}>
        {/* ヘッダー */}
        <div style={{ padding:`${SPACING.md + 2}px ${SPACING.lg + 2}px`, borderBottom:`1px solid ${T?.borderMid}`, display:'flex', alignItems:'center', gap:SPACING.sm + 2 }}>
          <Icon name="note" size={18} style={{ color: T?.text }} />
          <div style={{ flex:1 }}>
            <div style={{ ...TYPO.headline, fontSize:15, color: T?.text }}>{meetingTitle} タスクの取り込み</div>
            {selectedPage && meetingInfo && (
              <div style={{ ...TYPO.footnote, color: T?.textMuted, marginTop:2 }}>
                {meetingInfo.meetingDate} ・ {meetingInfo.pageTitle || '(無題)'}
                {meetingInfo.pageUrl && (
                  <button
                    type="button"
                    onClick={() => openNotionUrl(meetingInfo.pageUrl)}
                    style={{ marginLeft:SPACING.sm, color: T?.accent, background:'none', border:'none', padding:0, cursor:'pointer', ...TYPO.footnote, fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:4 }}
                  ><Icon name="external" size={12} />Notionで開く</button>
                )}
              </div>
            )}
            {!selectedPage && (
              <div style={{ ...TYPO.footnote, color: T?.textMuted, marginTop:2 }}>取り込む議事録の日付を選択してください</div>
            )}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color: T?.textMuted, cursor:'pointer', display:'flex' }}><Icon name="cross" size={20} /></button>
        </div>

        {/* ボディ */}
        <div style={{ flex:1, overflow:'auto', padding:SPACING.lg }}>
          {loading && <div style={{ color: T?.textMuted, ...TYPO.body }}>議事録ページを読み込み中…</div>}
          {error && <div style={{ color: T?.danger, ...TYPO.body, padding:`${SPACING.sm + 2}px ${SPACING.md}px`, background: T?.dangerBg, borderRadius:RADIUS.sm, marginBottom:SPACING.md }}>{error}</div>}
          {saved && <div style={{ color: T?.success, ...TYPO.body, padding:`${SPACING.sm + 2}px ${SPACING.md}px`, background: T?.successBg, borderRadius:RADIUS.sm, display:'flex', alignItems:'center', gap:SPACING.sm }}>{saved.count}件のタスクを取り込みました <Icon name="check" size={14} /></div>}

          {/* ステップ1: ページ選択 */}
          {!loading && !saved && !selectedPage && pages.length > 0 && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:SPACING.sm + 2 }}>
                <div style={{ ...TYPO.subhead, fontWeight:600, color: T?.textMuted }}>
                  最新{pages.length}件のページ（Date プロパティ降順）
                </div>
                <button onClick={loadPages}
                  title="Notion議事録DBを再取得"
                  style={{ ...btnSecondary({ T, size:'sm' }), color: T?.text, display:'inline-flex', alignItems:'center', gap:4 }}>
                  <Icon name="refresh" size={12} /> 再読み込み
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:SPACING.xs }}>
                {pages.map(p => (
                  <button key={p.id} onClick={() => selectPage(p)} style={{
                    display:'flex', alignItems:'center', gap:SPACING.md, padding:`${SPACING.sm + 2}px ${SPACING.md + 2}px`, borderRadius:RADIUS.sm,
                    border:`1px solid ${T?.borderMid}`, background:'transparent', color:'inherit',
                    cursor:'pointer', fontFamily:'inherit', ...TYPO.body, textAlign:'left', transition:'all 0.1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = T?.bgCard2; e.currentTarget.style.borderColor = T?.accent }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = T?.borderMid }}
                  >
                    <Icon name="note" size={20} style={{ color: T?.textSub }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title || '(無題)'}</div>
                      <div style={{ ...TYPO.footnote, color: T?.textMuted, marginTop:2 }}>{p.date || '日付なし'}</div>
                    </div>
                    <span style={{ ...TYPO.footnote, color: T?.accent, flexShrink:0, display:'inline-flex', alignItems:'center', gap:4 }}>選択 <Icon name="arrowRight" size={12} /></span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!loading && !saved && !selectedPage && pages.length === 0 && !error && (
            <div style={{ color: T?.textMuted, ...TYPO.body }}>
              議事録DBにページが見つかりませんでした。
              <button onClick={loadPages}
                style={{ ...btnBrand({ size:'sm' }), display:'flex', alignItems:'center', gap:4, marginTop:SPACING.sm }}>
                <Icon name="refresh" size={12} /> 再読み込み
              </button>
            </div>
          )}

          {/* ステップ2: アクションアイテム確認 */}
          {loadingItems && <div style={{ color: T?.textMuted, ...TYPO.body }}>アクションアイテムを読み込み中…</div>}
          {selectedPage && !loadingItems && !saved && items.length === 0 && !error && (
            <div style={{ color: T?.textMuted, ...TYPO.body }}>
              アクションアイテムが見つかりませんでした。<br />
              Notionページに「アクションアイテム」見出しの配下にto-doブロックを入れてください。
              <div style={{ marginTop:SPACING.xs + 2, ...TYPO.footnote, color: T?.textMuted, lineHeight:1.6 }}>
                会議直後でNotion側が反映されていない可能性もあります。少し待ってから再読み込みしてみてください。
              </div>
              <div style={{ display:'flex', gap:SPACING.sm, marginTop:SPACING.sm + 2 }}>
                <button onClick={reloadSelectedPage}
                  style={{ ...btnBrand({ size:'sm' }), display:'flex', alignItems:'center', gap:4 }}>
                  <Icon name="refresh" size={12} /> 再読み込み
                </button>
                <button onClick={() => setSelectedPage(null)}
                  style={{ ...btnSecondary({ T, size:'sm' }), color: T?.text, display:'inline-flex', alignItems:'center', gap:4 }}>
                  <Icon name="chevronL" size={12} /> 別の日を選ぶ
                </button>
              </div>
            </div>
          )}
          {selectedPage && !loadingItems && !saved && items.length > 0 && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm, marginBottom:SPACING.sm }}>
                <button onClick={() => { setSelectedPage(null); setItems([]); setMeetingInfo(null) }} style={{ ...btnSecondary({ T, size:'sm' }), color: T?.text, display:'inline-flex', alignItems:'center', gap:4 }}><Icon name="chevronL" size={12} /> 戻る</button>
                <span style={{ ...TYPO.footnote, color: T?.textMuted }}>
                  {items.length}件の未完了アクションを検出。担当者・紐付けKA・期日を確認して取り込んでください。
                </span>
              </div>
              {items.map((x, i) => (
                <div key={i} style={{
                  display:'grid', gridTemplateColumns: '22px 1fr 130px 220px 130px 28px',
                  gap:SPACING.xs + 2, alignItems:'center', padding:`${SPACING.xs + 2}px 0`, borderBottom:`0.5px solid ${T?.borderLight}`,
                }}>
                  <input type="checkbox" checked={x.include} onChange={e => update(i, 'include', e.target.checked)} />
                  <input type="text" value={x.text} onChange={e => update(i, 'text', e.target.value)} placeholder="タスク名"
                    style={{ padding:`${SPACING.xs + 1}px ${SPACING.sm}px`, borderRadius:RADIUS.xs, border:`1px solid ${T?.borderMid}`, background:'transparent', color:'inherit', ...TYPO.subhead, fontWeight:500, fontFamily:'inherit' }} />
                  <select value={x.assignee} onChange={e => update(i, 'assignee', e.target.value)}
                    style={{ padding:`${SPACING.xs + 1}px ${SPACING.sm}px`, borderRadius:RADIUS.xs, border:`1px solid ${T?.borderMid}`, background:'transparent', color:'inherit', ...TYPO.subhead, fontWeight:500, fontFamily:'inherit' }}>
                    <option value="">担当者未設定</option>
                    {members.map(m => <option key={m.id || m.name} value={m.name}>{m.name}</option>)}
                  </select>
                  <select value={x.reportId} onChange={e => update(i, 'reportId', e.target.value)}
                    style={{ padding:`${SPACING.xs + 1}px ${SPACING.sm}px`, borderRadius:RADIUS.xs, border:`1px solid ${T?.borderMid}`, background:'transparent', color:'inherit', ...TYPO.subhead, fontWeight:500, fontFamily:'inherit' }}>
                    <option value="">KA未紐付け</option>
                    {filteredKAs.map(k => (
                      <option key={k.id} value={k.id}>
                        {objMap[k.objective_id]?.title ? `[${objMap[k.objective_id].title.slice(0,12)}] ` : ''}
                        {k.ka_title}{k.owner ? ` (${k.owner})` : ''}
                      </option>
                    ))}
                  </select>
                  <input type="date" value={x.dueDate} onChange={e => update(i, 'dueDate', e.target.value)}
                    style={{ padding:`${SPACING.xs + 1}px ${SPACING.sm}px`, borderRadius:RADIUS.xs, border:`1px solid ${T?.borderMid}`, background:'transparent', color:'inherit', ...TYPO.subhead, fontWeight:500, fontFamily:'inherit' }} />
                  <button onClick={() => remove(i)} title="削除" style={{ background:'none', border:'none', color: T?.textMuted, cursor:'pointer', display:'flex' }}><Icon name="trash" size={16} /></button>
                </div>
              ))}
              <div style={{ marginTop:SPACING.sm + 2 }}>
                <input type="text" value={kaSearch} onChange={e => setKaSearch(e.target.value)} placeholder="KAを絞り込み（タイトルで検索）"
                  style={{ padding:`${SPACING.xs + 1}px ${SPACING.sm + 2}px`, borderRadius:RADIUS.xs, border:`1px solid ${T?.borderMid}`, background:'transparent', color:'inherit', ...TYPO.footnote, fontWeight:500, width: 280, fontFamily:'inherit' }} />
              </div>
            </>
          )}
        </div>

        {/* フッター */}
        <div style={{ padding:`${SPACING.sm + 2}px ${SPACING.lg}px`, borderTop:`1px solid ${T?.borderMid}`, display:'flex', justifyContent:'flex-end', gap:SPACING.sm }}>
          <button onClick={onClose} disabled={saving} style={{ ...btnSecondary({ T, size:'sm' }), color: T?.text }}>キャンセル</button>
          {selectedPage && !saved && (
            <button onClick={doImport} disabled={saving || loadingItems || items.filter(x => x.include && x.text.trim()).length === 0}
              style={{ ...btnBrand({ size:'sm' }), opacity: (saving || loadingItems) ? 0.5 : 1 }}>
              {saving ? '取り込み中…' : `${items.filter(x => x.include && x.text.trim()).length}件を取り込む`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

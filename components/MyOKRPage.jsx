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
const currentWeek = getMondayOf(new Date())

const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
const PERIOD_LABELS = { annual:'通期', q1:'Q1', q2:'Q2', q3:'Q3', q4:'Q4' }
// 年度プレフィックスを除去してraw期間キーを取得 (2025_q4 → q4)
function rawPeriod(period) { return period?.includes('_') ? period.split('_').pop() : period }
function periodLabel(period) { return PERIOD_LABELS[rawPeriod(period)] || period }
const LAYER_COLORS  = { 0:'#ff6b6b', 1:'#4d9fff', 2:'#00d68f', 3:'#ffd166' }

function getDepth(levelId, levels) {
  let d = 0, cur = levels.find(l => Number(l.id) === Number(levelId))
  while (cur && cur.parent_id) { d++; cur = levels.find(l => Number(l.id) === Number(cur.parent_id)) }
  return d
}
function calcPct(current, target, lowerIsBetter) {
  if (!target) return 0
  const r = lowerIsBetter ? target / Math.max(current, 0.001) : current / target
  return Math.min(Math.round(r * 100), 150)
}
function calcKRStars(current, target, lowerIsBetter) {
  const p = calcPct(current, target, lowerIsBetter)
  if (p >= 120) return 5; if (p >= 110) return 4; if (p >= 100) return 3
  if (p >= 90)  return 2; if (p >= 80)  return 1; return 0
}
const KR_STAR_CFG = [
  { label:'80%未満',   color:'#606880' }, { label:'80%〜89%',   color:'#ffd166' },
  { label:'90%〜99%',  color:'#4d9fff' }, { label:'100%〜109%', color:'#00d68f' },
  { label:'110%〜119%',color:'#ff9f43' }, { label:'120%以上',   color:'#a855f7' },
]
const WEATHER_CFG = [
  { score:0, icon:'—',  label:'未選択',       color:'#606880' },
  { score:1, icon:'⛈', label:'嵐',           color:'#8090b0' },
  { score:2, icon:'🌧', label:'雨',           color:'#4d9fff' },
  { score:3, icon:'☁️', label:'曇り',         color:'#a0a8be' },
  { score:4, icon:'🌤', label:'晴れのち曇り',  color:'#ffd166' },
  { score:5, icon:'☀️', label:'快晴',         color:'#ff9f43' },
]
const STATUS_CFG = {
  focus:  { label:'🎯 注力', color:'#4d9fff', bg:'rgba(77,159,255,0.12)', border:'rgba(77,159,255,0.3)' },
  good:   { label:'✅ Good', color:'#00d68f', bg:'rgba(0,214,143,0.1)',   border:'rgba(0,214,143,0.3)'  },
  more:   { label:'🔺 More', color:'#ff6b6b', bg:'rgba(255,107,107,0.1)', border:'rgba(255,107,107,0.3)'},
  normal: { label:'未分類',  color:'#606880', bg:'rgba(255,255,255,0.04)',border:'rgba(255,255,255,0.1)'},
}

// ─── Avatar（画像 or イニシャル） ─────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 22, wT }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0,
          border: `1.5px solid ${avatarColor(name)}60`,
        }}
      />
    )
  }
  if (!name) return null
  const c = avatarColor(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${c}25`, border: `1.5px solid ${c}60`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: c, flexShrink: 0,
    }}>
      {name.slice(0, 2)}
    </div>
  )
}

// ─── KRカード ─────────────────────────────────────────────────────────────────
function KRCard({ kr, myName, members, wT }) {
  const [currentVal,  setCurrentVal]  = useState(String(kr.current ?? ''))
  const [editingVal,  setEditingVal]  = useState(false)
  const [krSaving,    setKrSaving]    = useState(false)
  const [krSaved,     setKrSaved]     = useState(false)
  const [review,      setReview]      = useState(null)
  const [weather,     setWeather]     = useState(0)
  const [good,        setGood]        = useState('')
  const [more,        setMore]        = useState('')
  const [focus,       setFocus]       = useState('')
  const [open,        setOpen]        = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)

  const pct      = calcPct(parseFloat(currentVal)||0, kr.target, kr.lower_is_better)
  const stars    = calcKRStars(parseFloat(currentVal)||0, kr.target, kr.lower_is_better)
  const starCfg  = KR_STAR_CFG[stars]
  const pctColor = pct >= 100 ? '#00d68f' : pct >= 60 ? '#4d9fff' : '#ff6b6b'

  useEffect(() => {
    supabase.from('kr_weekly_reviews').select('*').eq('kr_id', kr.id).eq('week_start', currentWeek).maybeSingle()
      .then(({ data }) => {
        if (data) { setReview(data); setWeather(data.weather||0); setGood(data.good||''); setMore(data.more||''); setFocus(data.focus||'') }
      })
  }, [kr.id])

  const saveKR = async () => {
    const val = parseFloat(currentVal); if (isNaN(val)) return
    setKrSaving(true)
    await supabase.from('key_results').update({ current: val }).eq('id', kr.id)
    setKrSaving(false); setKrSaved(true); setEditingVal(false)
    setTimeout(() => setKrSaved(false), 1500)
  }

  const saveReview = async () => {
    setSaving(true)
    const payload = { kr_id: kr.id, week_start: currentWeek, weather, good, more, focus, updated_at: new Date().toISOString() }
    if (review?.id) {
      await supabase.from('kr_weekly_reviews').update(payload).eq('id', review.id)
    } else {
      const { data } = await supabase.from('kr_weekly_reviews').insert(payload).select().single()
      if (data) setReview(data)
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const taS = { width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55 }

  return (
    <div style={{ border:`1px solid ${open ? pctColor+'50' : wT().border}`, borderRadius:10, marginBottom:10, overflow:'hidden', transition:'border-color 0.15s' }}>
      <div onClick={() => setOpen(p=>!p)} style={{ padding:'10px 14px', background:wT().bgCard, borderLeft:`4px solid ${pctColor}`, cursor:'pointer', userSelect:'none' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
          <span style={{ fontSize:11, fontWeight:700, color:pctColor, background:`${pctColor}15`, padding:'2px 7px', borderRadius:4 }}>{pct}%</span>
          <span style={{ fontSize:13, fontWeight:600, color:wT().text, flex:1, lineHeight:1.4 }}>{kr.title}</span>
          <div onClick={e=>e.stopPropagation()} style={{ display:'flex', alignItems:'center', gap:4 }}>
            {editingVal ? (
              <>
                <input type="number" value={currentVal} onChange={e=>setCurrentVal(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter') saveKR(); if(e.key==='Escape') setEditingVal(false) }}
                  autoFocus style={{ width:70, background:wT().bgCard2, border:`1px solid #4d9fff80`, borderRadius:6, padding:'3px 7px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', textAlign:'right' }} />
                <span style={{ fontSize:11, color:wT().textMuted }}>{kr.unit} / {kr.target}{kr.unit}</span>
                <button onClick={saveKR} style={{ padding:'3px 8px', borderRadius:5, background:'#4d9fff', border:'none', color:'#fff', fontSize:10, fontWeight:700, cursor:'pointer' }}>{krSaving?'…':'✓'}</button>
                <button onClick={()=>setEditingVal(false)} style={{ padding:'3px 6px', borderRadius:5, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textMuted, fontSize:10, cursor:'pointer' }}>✕</button>
              </>
            ) : (
              <div onClick={()=>setEditingVal(true)} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, cursor:'pointer', border:`1px solid transparent` }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=wT().borderMid; e.currentTarget.style.background=wT().borderLight }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='transparent' }}>
                {krSaved && <span style={{ fontSize:10, color:'#00d68f', fontWeight:700 }}>✓ </span>}
                <span style={{ fontSize:12, color:wT().text, fontWeight:600 }}>{parseFloat(currentVal)||0}{kr.unit}</span>
                <span style={{ fontSize:11, color:wT().textMuted }}>/ {kr.target}{kr.unit}</span>
                <span style={{ fontSize:9, color:wT().textFaint }}>✎</span>
              </div>
            )}
          </div>
          <span style={{ fontSize:12, letterSpacing:1, color:'#ffd166', flexShrink:0 }}>{'★'.repeat(stars)}<span style={{ color:wT().borderMid }}>{'★'.repeat(5-stars)}</span></span>
          {!open && weather > 0 && <span style={{ fontSize:16 }}>{WEATHER_CFG[weather]?.icon}</span>}
          <span style={{ fontSize:11, color:wT().textFaint, transform:open?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s', display:'inline-block' }}>▾</span>
        </div>
        <div style={{ height:4, borderRadius:2, background:wT().borderLight, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:pctColor, borderRadius:2, transition:'width 0.4s' }} />
        </div>
        {!open && (good||more) && (
          <div style={{ display:'flex', gap:12, marginTop:5, flexWrap:'wrap' }}>
            {good && <div style={{ fontSize:11, color:wT().textSub, display:'flex', gap:3 }}><span style={{ color:'#00d68f', fontSize:10 }}>✅</span><span>{good.slice(0,50)}{good.length>50?'…':''}</span></div>}
            {more && <div style={{ fontSize:11, color:wT().textSub, display:'flex', gap:3 }}><span style={{ color:'#ff6b6b', fontSize:10 }}>🔺</span><span>{more.slice(0,50)}{more.length>50?'…':''}</span></div>}
          </div>
        )}
      </div>

      {open && (
        <div style={{ padding:'12px 14px', background:wT().bgCard2 }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:14, marginBottom:12, padding:'10px 12px', background:wT().bgCard, borderRadius:8, border:`1px solid ${wT().border}` }}>
            <div style={{ borderRight:`1px solid ${wT().border}`, paddingRight:14 }}>
              <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>KR達成評価（自動）</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:20, letterSpacing:2, color:'#ffd166' }}>{'★'.repeat(stars)}<span style={{ color:wT().borderMid }}>{'★'.repeat(5-stars)}</span></span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:starCfg.color }}>{starCfg.label}</div>
                  <div style={{ fontSize:10, color:wT().textMuted }}>達成率 {pct}%</div>
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>今週の体感・主観</div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {WEATHER_CFG.slice(1).map(w => {
                  const isActive = w.score === weather
                  return (
                    <div key={w.score} onClick={()=>setWeather(isActive?0:w.score)} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:7, cursor:'pointer', transition:'all 0.15s', background:isActive?`${w.color}15`:'transparent', border:`1px solid ${isActive?w.color+'60':wT().borderMid}` }}>
                      <span style={{ fontSize:16 }}>{w.icon}</span>
                      <span style={{ fontSize:11, fontWeight:isActive?700:400, color:isActive?w.color:wT().textMuted }}>{w.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8, minWidth:0 }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#00d68f', background:'rgba(0,214,143,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>✅ Good — うまくいったこと</div>
              <textarea value={good} onChange={e=>setGood(e.target.value)} rows={3} placeholder="進んでいること・良かったこと" style={taS} onFocus={e=>e.target.style.borderColor='rgba(0,214,143,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border} />
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#ff6b6b', background:'rgba(255,107,107,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>🔺 More — 課題・改善点</div>
              <textarea value={more} onChange={e=>setMore(e.target.value)} rows={3} placeholder="うまくいっていないこと・課題" style={taS} onFocus={e=>e.target.style.borderColor='rgba(255,107,107,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border} />
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <div style={{ flex:1, height:1, background:wT().border }} />
            <span style={{ fontSize:10, color:wT().textMuted }}>↓ Moreへの対応</span>
            <div style={{ flex:1, height:1, background:wT().border }} />
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#4d9fff', background:'rgba(77,159,255,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>🎯 今週の注力アクション</div>
            <textarea value={focus} onChange={e=>setFocus(e.target.value)} rows={2} placeholder="Moreに対してどう動くか・何に力を入れるか" style={taS} onFocus={e=>e.target.style.borderColor='rgba(77,159,255,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border} />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button onClick={()=>setOpen(false)} style={{ padding:'5px 12px', borderRadius:6, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={saveReview} disabled={saving} style={{ padding:'5px 16px', borderRadius:6, background:saved?'#00d68f':'#4d9fff', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background 0.3s' }}>
              {saved?'✓ 保存済み（週次MTGに反映）':saving?'保存中...':'保存して週次MTGに反映'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KAカード ─────────────────────────────────────────────────────────────────
function MyKACard({ report, onSave, onDelete, wT, members, tasks = [] }) {
  const [open,   setOpen]   = useState(false)
  const [good,   setGood]   = useState(report.good || '')
  const [more,   setMore]   = useState(report.more || '')
  const [focus,  setFocus]  = useState(report.focus_output || '')
  const [status, setStatus] = useState(report.status || 'normal')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const cfg = STATUS_CFG[status] || STATUS_CFG.normal
  const STATUS_ORDER = ['normal','focus','good','more']

  // ownerのavatar_urlを取得
  const ownerMember = members?.find(m => m.name === report.owner)

  const save = async (e) => {
    e && e.stopPropagation()
    setSaving(true)
    await supabase.from('weekly_reports').update({ good, more, focus_output: focus, status }).eq('id', report.id)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1500)
    onSave({ ...report, good, more, focus_output: focus, status })
  }

  const taS = { width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:7, padding:'7px 9px', color:wT().text, fontSize:12, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55 }

  return (
    <div onClick={() => !open && setOpen(true)} style={{ background:wT().bgCard, border:`1px solid ${open?'#4d9fff50':wT().border}`, borderRadius:9, marginBottom:7, cursor:open?'default':'pointer', transition:'border-color 0.15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px' }} onClick={() => setOpen(p=>!p)}>
        <Avatar name={report.owner} avatarUrl={ownerMember?.avatar_url} size={20} wT={wT} />
        <span style={{ fontSize:13, fontWeight:600, color:wT().text, flex:1 }}>{report.ka_title}</span>
        <span onClick={e=>{ e.stopPropagation(); const idx=STATUS_ORDER.indexOf(status); setStatus(STATUS_ORDER[(idx+1)%STATUS_ORDER.length]) }} style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:99, cursor:'pointer', background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}` }}>{cfg.label}</span>
        <button onClick={e=>{e.stopPropagation();onDelete(report.id)}} style={{ width:20,height:20,borderRadius:4,border:'none',cursor:'pointer',fontSize:9,background:'rgba(255,107,107,0.08)',color:'#ff6b6b' }}>✕</button>
        <span style={{ fontSize:10, color:wT().textFaint, transform:open?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s', display:'inline-block' }}>▾</span>
      </div>
      {!open && (good||more||tasks.length > 0) && (
        <div style={{ display:'flex', gap:8, padding:'0 12px 7px 40px', flexWrap:'wrap' }}>
          {good && <div style={{ fontSize:11, color:wT().textSub, display:'flex', gap:3 }}><span style={{ color:'#00d68f', fontSize:10 }}>✅</span>{good.slice(0,50)}{good.length>50?'…':''}</div>}
          {more && <div style={{ fontSize:11, color:wT().textSub, display:'flex', gap:3 }}><span style={{ color:'#ff6b6b', fontSize:10 }}>🔺</span>{more.slice(0,50)}{more.length>50?'…':''}</div>}
          {tasks.length > 0 && <div style={{ fontSize:11, color:wT().textMuted, display:'flex', gap:3 }}><span style={{ fontSize:10 }}>📌</span>{tasks.filter(t=>!t.done).length}/{tasks.length}件 未完了</div>}
        </div>
      )}
      {open && (
        <div style={{ padding:'0 12px 12px' }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8, minWidth:0 }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#00d68f', background:'rgba(0,214,143,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>✅ Good</div>
              <textarea value={good} onChange={e=>setGood(e.target.value)} rows={3} placeholder="うまくいったこと" style={taS} />
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#ff6b6b', background:'rgba(255,107,107,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>🔺 More</div>
              <textarea value={more} onChange={e=>setMore(e.target.value)} rows={3} placeholder="課題・改善点" style={taS} />
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <div style={{ flex:1, height:1, background:wT().border }} /><span style={{ fontSize:10, color:wT().textMuted }}>↓ Moreへの対応</span><div style={{ flex:1, height:1, background:wT().border }} />
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#4d9fff', background:'rgba(77,159,255,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:4, display:'inline-block' }}>🎯 注力アクション</div>
            <textarea value={focus} onChange={e=>setFocus(e.target.value)} rows={2} placeholder="Moreに対してどう動くか" style={taS} />
          </div>
          {tasks.length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#a855f7', background:'rgba(168,85,247,0.1)', padding:'3px 8px', borderRadius:5, marginBottom:6, display:'inline-block' }}>📌 タスク（{tasks.filter(t=>!t.done).length}/{tasks.length}件 未完了）</div>
              {tasks.map(t => (
                <div key={t.id || t._tmp} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:12 }}>
                  <span style={{ fontSize:13, flexShrink:0 }}>{t.done ? '✅' : '☐'}</span>
                  <span style={{ flex:1, color: t.done ? wT().textMuted : wT().text, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title || '(未入力)'}</span>
                  {t.assignee && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:'rgba(77,159,255,0.1)', color:'#4d9fff', flexShrink:0 }}>{t.assignee}</span>}
                  {t.due_date && <span style={{ fontSize:10, color: !t.done && t.due_date < new Date().toISOString().split('T')[0] ? '#ff6b6b' : wT().textMuted, flexShrink:0 }}>{t.due_date.slice(5).replace('-','/')}</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, paddingTop:8, borderTop:`1px solid ${wT().border}` }}>
            <button onClick={()=>setOpen(false)} style={{ padding:'5px 10px', borderRadius:6, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={save} disabled={saving} style={{ padding:'5px 14px', borderRadius:6, background:saved?'#00d68f':'#4d9fff', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              {saved?'✓ 保存済み':saving?'…':'保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── メインページ ──────────────────────────────────────────────────────────────
export default function MyOKRPage({ user, levels, members, themeKey = 'dark', fiscalYear = '2026', onAIFeedback }) {
  const W_THEMES = {
    dark: {
      bg:'#090d18', bgCard:'#0e1420', bgCard2:'#111828', bgSidebar:'#0e1420',
      border:'rgba(255,255,255,0.07)', borderLight:'rgba(255,255,255,0.04)',
      borderMid:'rgba(255,255,255,0.1)', text:'#e8eaf0', textSub:'#a0a8be',
      textMuted:'#606880', textFaint:'#404660', textFaintest:'#303450',
    },
    light: {
      bg:'#f0f2f7', bgCard:'#ffffff', bgCard2:'#f7f8fc', bgSidebar:'#ffffff',
      border:'rgba(0,0,0,0.08)', borderLight:'rgba(0,0,0,0.05)',
      borderMid:'rgba(0,0,0,0.12)', text:'#1a1f36', textSub:'#4a5270',
      textMuted:'#7080a0', textFaint:'#90a0bc', textFaintest:'#b0bcd0',
    }
  }
  const wT = () => W_THEMES[themeKey] || W_THEMES.dark

  const myMember = members.find(m => m.email === user?.email)
  const myName   = myMember?.name || user?.email || ''

  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [kaReports,  setKaReports]  = useState([])
  const [kaTasks,    setKaTasks]    = useState({}) // { reportId: [tasks] }
  const [reviews,    setReviews]    = useState({})
  const [loading,    setLoading]    = useState(true)
  const [activeObjId,setActiveObjId]= useState(null)
  const [activePeriod,setActivePeriod]=useState('all')

  useEffect(() => {
    if (!myName) return
    const load = async () => {
      setLoading(true)
      // ① 自分がOwner/KR担当/KA担当のデータを並行取得
      const [{ data: myObjs }, { data: myKRs }, { data: myKAs }, { data: myAssignedTasks }] = await Promise.all([
        supabase.from('objectives').select('id,title,level_id,period,owner').eq('owner', myName).order('period'),
        supabase.from('key_results').select('*').eq('owner', myName),
        supabase.from('weekly_reports').select('*').eq('owner', myName).neq('status', 'done'),
        supabase.from('ka_tasks').select('*').eq('assignee', myName).eq('done', false),
      ])
      // ★ 年度フィルタを適用
      const filterByFY = (objs) => (objs || []).filter(o => {
        if (fiscalYear === '2026') return !o.period.includes('_')
        return o.period.startsWith(`${fiscalYear}_`)
      })
      const ownedObjs = filterByFY(myObjs)

      // ①-b 他人のKAで自分がタスク担当のものも取得
      const assignedReportIds = [...new Set((myAssignedTasks || []).map(t => t.report_id).filter(Boolean))]
      const myKAIds = new Set((myKAs || []).map(r => r.id))
      const missingReportIds = assignedReportIds.filter(id => !myKAIds.has(id))
      let assignedKAs = []
      if (missingReportIds.length > 0) {
        const { data } = await supabase.from('weekly_reports').select('*').in('id', missingReportIds).neq('status', 'done')
        assignedKAs = data || []
      }
      const allMyKAs = [...(myKAs || []), ...assignedKAs].filter((r,i,arr) => arr.findIndex(x => x.id === r.id) === i)

      // ② KR担当/KA担当/タスク担当の親Objectiveも取得して統合
      const krObjIds = (myKRs || []).map(kr => kr.objective_id).filter(Boolean)
      const kaObjIds = allMyKAs.map(r => r.objective_id).filter(Boolean)
      const ownedObjIds = ownedObjs.map(o => o.id)
      const missingObjIds = [...new Set([...krObjIds, ...kaObjIds])].filter(id => !ownedObjIds.includes(id))

      let extraObjs = []
      if (missingObjIds.length > 0) {
        const { data } = await supabase.from('objectives').select('id,title,level_id,period,owner').in('id', missingObjIds)
        extraObjs = filterByFY(data)
      }
      const filteredObjs = [...ownedObjs, ...extraObjs].filter((o,i,arr) => arr.findIndex(x => x.id === o.id) === i)

      // ③ 自分がOwnerのObjectiveに紐づく全KRも取得
      const objIds = filteredObjs.map(o => o.id)
      let krsForObjs = []
      if (objIds.length > 0) {
        const { data } = await supabase.from('key_results').select('*').in('objective_id', objIds)
        krsForObjs = data || []
      }
      const normalizeKR = kr => kr.current === undefined && kr.current_value !== undefined ? { ...kr, current: kr.current_value } : kr
      const allMyKRs = [...(myKRs||[]), ...krsForObjs].map(normalizeKR).filter((kr,i,arr)=>arr.findIndex(k=>k.id===kr.id)===i)
      const krIds = allMyKRs.map(k=>k.id)
      let revData = []
      if (krIds.length > 0) {
        const { data } = await supabase.from('kr_weekly_reviews').select('*').in('kr_id', krIds).eq('week_start', currentWeek)
        revData = data || []
      }
      const revMap = {}
      revData.forEach(r => { revMap[r.kr_id] = r })

      // ④ 全KAのタスクを取得
      const kaIds = allMyKAs.map(r => r.id)
      let allTasksMap = {}
      if (kaIds.length > 0) {
        const { data: allTasks } = await supabase.from('ka_tasks').select('*').in('report_id', kaIds).order('id')
        for (const t of (allTasks || [])) {
          if (!allTasksMap[t.report_id]) allTasksMap[t.report_id] = []
          allTasksMap[t.report_id].push(t)
        }
      }

      setObjectives(filteredObjs)
      setKeyResults(allMyKRs)
      setKaReports(allMyKAs)
      setKaTasks(allTasksMap)
      setReviews(revMap)
      setLoading(false)
    }
    load()
  }, [myName, fiscalYear])

  const selectedObj = activeObjId ? objectives.find(o=>o.id===Number(activeObjId)) : null
  const objKRs = activeObjId ? keyResults.filter(kr=>Number(kr.objective_id)===Number(activeObjId)) : []
  const objKAs = activeObjId ? kaReports.filter(r=>Number(r.objective_id)===Number(activeObjId)) : []
  const visibleObjs = objectives.filter(o => activePeriod === 'all' || rawPeriod(o.period) === activePeriod)

  const handleKASave = (updated) => setKaReports(p=>p.map(r=>r.id===updated.id?updated:r))
  const handleKADelete = async (id) => {
    if (!window.confirm('削除しますか？')) return
    await supabase.from('weekly_reports').delete().eq('id', id)
    setKaReports(p=>p.filter(r=>r.id!==id))
  }

  const periodTabs = [['all','通期'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4']]

  if (loading) return <div style={{ padding:40, color:'#4d9fff', fontSize:14 }}>読み込み中...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:wT().bg, color:wT().text, fontFamily:'system-ui,sans-serif' }}>

      {/* ヘッダー */}
      <div style={{ padding:'11px 16px', borderBottom:`1px solid ${wT().border}`, display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        {/* ユーザーアバター（画像 or イニシャル） */}
        {myMember?.avatar_url ? (
          <img
            src={myMember.avatar_url}
            alt={myName}
            style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', border:`2px solid ${avatarColor(myName)}60`, flexShrink:0 }}
          />
        ) : (
          <div style={{ width:36, height:36, borderRadius:'50%', background:`${avatarColor(myName)}25`, border:`2px solid ${avatarColor(myName)}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:avatarColor(myName), flexShrink:0 }}>
            {myName.slice(0,2)}
          </div>
        )}
        <div>
          <div style={{ fontSize:10, color:wT().textMuted, marginBottom:1 }}>{myMember?.role || 'メンバー'}</div>
          <div style={{ fontSize:15, fontWeight:700 }}>{myName} のOKR</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99, background: fiscalYear==='2026'?'rgba(77,159,255,0.15)':'rgba(255,159,67,0.15)', color: fiscalYear==='2026'?'#4d9fff':'#ff9f43', border:`1px solid ${fiscalYear==='2026'?'rgba(77,159,255,0.3)':'rgba(255,159,67,0.3)'}` }}>
            📅 {fiscalYear}年度
          </div>
          <div style={{ fontSize:11, color:wT().textMuted }}>{currentWeek} 週</div>
        </div>
      </div>

      {/* 期間タブ */}
      <div style={{ display:'flex', gap:4, padding:'7px 16px', borderBottom:`1px solid ${wT().border}`, flexShrink:0 }}>
        <span style={{ fontSize:11, color:wT().textMuted, fontWeight:700, marginRight:4 }}>期間：</span>
        {periodTabs.map(([key,lbl])=>(
          <button key={key} onClick={()=>{setActivePeriod(key);setActiveObjId(null)}} style={{ padding:'4px 12px', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, background:activePeriod===key?(key==='all'?wT().borderMid:'rgba(77,159,255,0.15)'):'transparent', border:`1px solid ${activePeriod===key?(key==='all'?wT().border:'rgba(77,159,255,0.4)'):wT().borderMid}`, color:activePeriod===key?(key==='all'?wT().text:'#4d9fff'):wT().textMuted }}>{lbl}</button>
        ))}
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* 左：Objective一覧 */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${wT().border}`, overflowY:'auto', padding:10, background:wT().bg }}>
          <div style={{ fontSize:10, color:'#4d9fff', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>🎯 マイObjective（{visibleObjs.length}件）</div>
          {visibleObjs.length === 0 && (
            <div style={{ fontSize:12, color:wT().textFaintest, fontStyle:'italic', padding:'10px 4px' }}>Objectiveがありません</div>
          )}
          {visibleObjs.map(obj => {
            const isActive = Number(activeObjId) === Number(obj.id)
            const d = getDepth(obj.level_id, levels)
            const color = LAYER_COLORS[d] || '#a0a8be'
            const level = levels.find(l=>Number(l.id)===Number(obj.level_id))
            const objKRsCount = keyResults.filter(kr=>Number(kr.objective_id)===Number(obj.id)).length
            const objKAsCount = kaReports.filter(r=>Number(r.objective_id)===Number(obj.id)).length
            const myKRs = keyResults.filter(kr=>Number(kr.objective_id)===Number(obj.id))
            const avgPct = myKRs.length > 0 ? Math.round(myKRs.reduce((s,kr)=>s+calcPct(kr.current,kr.target,kr.lower_is_better),0)/myKRs.length) : 0
            const pctColor = avgPct>=100?'#00d68f':avgPct>=60?'#4d9fff':'#ff6b6b'
            return (
              <div key={obj.id} onClick={()=>setActiveObjId(isActive?null:obj.id)} style={{ padding:'10px 12px', borderRadius:9, marginBottom:7, cursor:'pointer', border:`1px solid ${isActive?color+'60':wT().border}`, background:isActive?`${color}10`:wT().bgCard, transition:'all 0.12s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:99, background:`${color}18`, color }}>{periodLabel(obj.period)}</span>
                  {level && <span style={{ fontSize:10, color:wT().textMuted }}>{level.icon} {level.name}</span>}
                </div>
                <div style={{ fontSize:12, fontWeight:600, lineHeight:1.4, marginBottom:6, color:isActive?wT().text:wT().textSub }}>{obj.title}</div>
                <div style={{ height:3, borderRadius:2, background:wT().borderLight, overflow:'hidden', marginBottom:5 }}>
                  <div style={{ height:'100%', width:`${Math.min(avgPct,100)}%`, background:pctColor, borderRadius:2 }} />
                </div>
                <div style={{ display:'flex', gap:8, fontSize:10, color:wT().textMuted }}>
                  <span style={{ color:pctColor, fontWeight:700 }}>{avgPct}%</span>
                  <span>KR {objKRsCount}件</span>
                  <span style={{ color:objKAsCount>0?'#4d9fff':wT().textFaint }}>KA {objKAsCount}件</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 右：KR + KA詳細 */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', background:wT().bgCard2 }}>
          {!selectedObj ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:10, color:wT().textFaint }}>
              <div style={{ fontSize:36 }}>🎯</div>
              <div style={{ fontSize:13 }}>左のObjectiveをクリックしてください</div>
            </div>
          ) : (
            <>
              {(() => {
                const d = getDepth(selectedObj.level_id, levels)
                const color = LAYER_COLORS[d] || '#a0a8be'
                return (
                  <div style={{ padding:'12px 14px', background:`${color}0e`, border:`1px solid ${color}30`, borderLeft:`4px solid ${color}`, borderRadius:10, marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:`${color}20`, color }}>{periodLabel(selectedObj.period)}</span>
                      <span style={{ fontSize:10, color:wT().textMuted }}>Objective</span>
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color:wT().text, lineHeight:1.5 }}>{selectedObj.title}</div>
                  </div>
                )
              })()}

              {onAIFeedback && (
                <div style={{ marginBottom:14 }}>
                  <button onClick={() => {
                    const krSummary = objKRs.map(kr => {
                      const rev = reviews[kr.id]
                      const pct = calcPct(kr.current, kr.target, kr.lower_is_better)
                      return `KR「${kr.title}」: 達成率${pct}% (${kr.current}${kr.unit}/${kr.target}${kr.unit})` +
                        (rev?.good  ? `\n  Good: ${rev.good}`  : '') +
                        (rev?.more  ? `\n  More: ${rev.more}`  : '') +
                        (rev?.focus ? `\n  注力: ${rev.focus}` : '')
                    }).join('\n')
                    const kaSummary = objKAs.map(r =>
                      `KA「${r.ka_title}」[${r.status}]` +
                      (r.good ? ` Good:${r.good}` : '') +
                      (r.more ? ` More:${r.more}` : '')
                    ).join('\n')
                    const msg = `${myName}さんの今週のOKR進捗についてフィードバックをください。\n\nObjective: ${selectedObj.title}\n\n${krSummary}${kaSummary ? '\n\nKA一覧:\n' + kaSummary : ''}\n\n良かった点・改善点・来週へのアドバイス・励ましの言葉を日本語で簡潔にお願いします。`
                    onAIFeedback(msg)
                  }} style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'10px 14px', borderRadius:10, border:'1px solid rgba(168,85,247,0.35)', background:'rgba(168,85,247,0.08)', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(168,85,247,0.15)'}
                    onMouseLeave={e=>e.currentTarget.style.background='rgba(168,85,247,0.08)'}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,#4d9fff,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 }}>🤖</div>
                    <div style={{ textAlign:'left' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'#a855f7' }}>AIコーチにフィードバックをもらう</div>
                      <div style={{ fontSize:10, color:wT().textMuted }}>現在のKR・KA状況をもとにアドバイスをもらえます</div>
                    </div>
                    <span style={{ marginLeft:'auto', fontSize:11, color:'#a855f7' }}>→</span>
                  </button>
                </div>
              )}

              {objKRs.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>📊 Key Results（{objKRs.length}件）</div>
                  {objKRs.map(kr => {
                    const krKAs = objKAs.filter(r => Number(r.kr_id) === Number(kr.id))
                    return (
                      <div key={kr.id} style={{ marginBottom:14 }}>
                        <KRCard kr={kr} myName={myName} members={members} wT={wT} />
                        {krKAs.length > 0 && (
                          <div style={{ marginLeft:12, borderLeft:`2px solid ${wT().border}`, paddingLeft:10, marginTop:4 }}>
                            <div style={{ fontSize:10, color:wT().textMuted, fontWeight:600, marginBottom:4 }}>📋 KA（{krKAs.length}件）</div>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                              <thead>
                                <tr style={{ borderBottom:`1px solid ${wT().border}` }}>
                                  <th style={{ textAlign:'left', padding:'4px 6px', color:wT().textMuted, fontWeight:600, fontSize:10 }}>担当</th>
                                  <th style={{ textAlign:'left', padding:'4px 6px', color:wT().textMuted, fontWeight:600, fontSize:10 }}>KAタイトル</th>
                                  <th style={{ textAlign:'left', padding:'4px 6px', color:wT().textMuted, fontWeight:600, fontSize:10 }}>状態</th>
                                  <th style={{ textAlign:'left', padding:'4px 6px', color:wT().textMuted, fontWeight:600, fontSize:10 }}>Good</th>
                                  <th style={{ textAlign:'left', padding:'4px 6px', color:wT().textMuted, fontWeight:600, fontSize:10 }}>More</th>
                                </tr>
                              </thead>
                              <tbody>
                                {krKAs.map(r => {
                                  const sCfg = STATUS_CFG[r.status] || STATUS_CFG.normal
                                  return (
                                    <tr key={r.id} style={{ borderBottom:`1px solid ${wT().borderLight}` }}>
                                      <td style={{ padding:'5px 6px', whiteSpace:'nowrap' }}>
                                        {r.owner ? <Avatar name={r.owner} size={18} wT={wT} /> : <span style={{ color:wT().textFaint }}>--</span>}
                                      </td>
                                      <td style={{ padding:'5px 6px', color:wT().text, lineHeight:1.4 }}>{r.ka_title}</td>
                                      <td style={{ padding:'5px 6px' }}>
                                        <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:sCfg.bg, color:sCfg.color, border:`1px solid ${sCfg.border}`, whiteSpace:'nowrap' }}>{sCfg.label}</span>
                                      </td>
                                      <td style={{ padding:'5px 6px', color:wT().textSub, fontSize:10, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.good || ''}</td>
                                      <td style={{ padding:'5px 6px', color:wT().textSub, fontSize:10, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.more || ''}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {objKRs.length === 0 && (
                <div style={{ fontSize:12, color:wT().textFaint, fontStyle:'italic', padding:'10px 4px', marginBottom:12 }}>このObjectiveにKRがありません</div>
              )}

              {(() => {
                const krIds = new Set(objKRs.map(kr => Number(kr.id)))
                const unlinkedKAs = objKAs.filter(r => !r.kr_id || !krIds.has(Number(r.kr_id)))
                if (unlinkedKAs.length === 0) return null
                return (
                  <div>
                    <div style={{ fontSize:10, color:wT().textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>📋 その他のKA（{unlinkedKAs.length}件）</div>
                    {unlinkedKAs.map(r => (
                      <MyKACard key={r.id} report={r} onSave={handleKASave} onDelete={handleKADelete} wT={wT} members={members} tasks={kaTasks[r.id] || []} />
                    ))}
                  </div>
                )
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

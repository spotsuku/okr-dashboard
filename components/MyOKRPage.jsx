'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { SegmentedControl } from './iosUI'
import Icon, { DataIcon } from './Icon'
import { useAutoSave } from '../lib/useAutoSave'
import { computeKAKey } from '../lib/kaKey'

// ─── ヘルパー ──────────────────────────────────────────────────────────────────
// JST基準で「入力日時を含む週の月曜日」のYYYY-MM-DD文字列を返す
function getMondayOf(date) {
  const dt = typeof date === 'string' ? new Date(date) : (date || new Date())
  const jst = new Date(dt.getTime() + 9 * 3600 * 1000)
  const jstDay = jst.getUTCDay()
  const diff = jstDay === 0 ? -6 : 1 - jstDay
  const mon = new Date(Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + diff
  ))
  return mon.toISOString().split('T')[0]
}
function formatWeekLabel(mondayStr) {
  const [y, m, day] = mondayStr.split('-').map(Number)
  const sun = new Date(Date.UTC(y, m - 1, day + 6))
  const m2 = sun.getUTCMonth() + 1
  const d2 = sun.getUTCDate()
  return m === m2 ? `${m}/${day}〜${d2}` : `${m}/${day}〜${m2}/${d2}`
}

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
  { score:0, icon:null,     label:'未選択',       color:'#606880' },
  { score:1, icon:'storm',  label:'嵐',           color:'#8090b0' },
  { score:2, icon:'rain',   label:'雨',           color:'#4d9fff' },
  { score:3, icon:'cloud',  label:'曇り',         color:'#a0a8be' },
  { score:4, icon:'partly', label:'晴れのち曇り',  color:'#ffd166' },
  { score:5, icon:'sun',    label:'快晴',         color:'#ff9f43' },
]
const STATUS_CFG = {
  focus:  { label:'注力', color:'#007AFF', bg:'rgba(0,122,255,0.10)', border:'rgba(0,122,255,0.30)' },
  good:   { label:'Good', color:'#34C759', bg:'rgba(52,199,89,0.10)', border:'rgba(52,199,89,0.30)' },
  more:   { label:'More', color:'#FF3B30', bg:'rgba(255,59,48,0.10)', border:'rgba(255,59,48,0.30)' },
  normal: { label:'未分類',  color:'#8E8E93', bg:'rgba(142,142,147,0.10)', border:'rgba(142,142,147,0.20)' },
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
function KRCard({ kr, myName, members, wT, currentWeek, onKRUpdated }) {
  const [currentVal,  setCurrentVal]  = useState(String(kr.current ?? ''))
  const [editingVal,  setEditingVal]  = useState(false)
  const [krEditing,   setKrEditing]   = useState(false)
  const [krTitle,     setKrTitle]     = useState(kr.title || '')
  const [krTarget,    setKrTarget]    = useState(String(kr.target ?? ''))
  const [krUnit,      setKrUnit]      = useState(kr.unit || '')
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
  const pctColor = pct >= 100 ? wT().accent : pct >= 60 ? wT().success : pct >= 30 ? wT().warn : wT().danger

  useEffect(() => {
    // 週が変わったら入力をリセットして新しい週のレビューを読み込む
    setReview(null); setWeather(0); setGood(''); setMore(''); setFocus('')
    supabase.from('kr_weekly_reviews').select('*').eq('kr_id', kr.id).eq('week_start', currentWeek).maybeSingle()
      .then(({ data }) => {
        if (data) { setReview(data); setWeather(data.weather||0); setGood(data.good||''); setMore(data.more||''); setFocus(data.focus||'') }
      })
  }, [kr.id, currentWeek])

  const saveKR = async () => {
    const val = parseFloat(currentVal); if (isNaN(val)) return
    setKrSaving(true)
    await supabase.from('key_results').update({ current: val }).eq('id', kr.id)
    setKrSaving(false); setKrSaved(true); setEditingVal(false)
    setTimeout(() => setKrSaved(false), 1500)
  }

  const saveKRFull = async () => {
    setKrSaving(true)
    const payload = {
      title: krTitle.trim() || kr.title,
      current: parseFloat(currentVal) || 0,
      target: parseFloat(krTarget) || 0,
      unit: krUnit,
    }
    await supabase.from('key_results').update(payload).eq('id', kr.id)
    setKrSaving(false); setKrSaved(true); setKrEditing(false)
    setCurrentVal(String(payload.current))
    if (onKRUpdated) onKRUpdated()
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

  const taS = { width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs, padding:'7px 9px', color:wT().text, fontSize:TYPO.subhead.fontSize, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.55 }

  return (
    <div style={{
      border:`1px solid ${open ? pctColor+'40' : pctColor+'15'}`,
      borderRadius:RADIUS.lg, marginBottom:SPACING.sm, overflow:'hidden',
      position: 'relative',
      boxShadow: open
        ? SHADOWS.hover(pctColor)
        : SHADOWS.sm,
      transition:'all 0.2s ease',
    }}>
      {/* 上端に色グラデ帯 (左太線の代わり) */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${pctColor} 0%, ${pctColor}80 100%)`,
      }} />
      <div onClick={() => setOpen(p=>!p)} style={{
        padding:'14px 16px',
        background: open
          ? `linear-gradient(180deg, ${wT().bgCard} 0%, ${pctColor}08 100%)`
          : wT().bgCard,
        cursor:'pointer', userSelect:'none',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm, marginBottom:5 }}>
          <span style={{ ...TYPO.footnote, fontWeight:700, color:pctColor, background:`${pctColor}15`, padding:'2px 7px', borderRadius:RADIUS.xs }}>{pct}%</span>
          <span style={{ ...TYPO.body, fontWeight:600, color:wT().text, flex:1, lineHeight:1.4 }}>{kr.title}</span>
          <div onClick={e=>e.stopPropagation()} style={{ display:'flex', alignItems:'center', gap:SPACING.xs }}>
            {editingVal ? (
              <>
                <input type="number" value={currentVal} onChange={e=>setCurrentVal(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter') saveKR(); if(e.key==='Escape') setEditingVal(false) }}
                  autoFocus style={{ width:70, background:wT().bgCard2, border:`1px solid ${wT().info}80`, borderRadius:RADIUS.xs, padding:'3px 7px', color:wT().text, fontSize:TYPO.subhead.fontSize, outline:'none', fontFamily:'inherit', textAlign:'right' }} />
                <span style={{ ...TYPO.footnote, fontWeight:500, color:wT().textMuted }}>{kr.unit} / {kr.target}{kr.unit}</span>
                <button onClick={saveKR} style={{ padding:'3px 8px', borderRadius:RADIUS.xs, background:wT().info, border:'none', color:'#fff', fontSize:TYPO.caption.fontSize, fontWeight:700, cursor:'pointer', display:'inline-flex', alignItems:'center' }}>{krSaving?'…':<Icon name="check" size={11} />}</button>
                <button onClick={()=>setEditingVal(false)} style={{ padding:'3px 6px', borderRadius:RADIUS.xs, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textMuted, fontSize:TYPO.caption.fontSize, cursor:'pointer', display:'inline-flex', alignItems:'center' }}><Icon name="cross" size={11} /></button>
              </>
            ) : (
              <div onClick={()=>setEditingVal(true)} style={{ display:'flex', alignItems:'center', gap:SPACING.xs, padding:'3px 8px', borderRadius:RADIUS.xs, cursor:'pointer', border:`1px solid transparent` }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=wT().borderMid; e.currentTarget.style.background=wT().borderLight }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='transparent' }}>
                {krSaved && <span style={{ color:wT().success, fontWeight:700, display:'inline-flex', alignItems:'center' }}><Icon name="check" size={11} /></span>}
                <span style={{ ...TYPO.subhead, color:wT().text, fontWeight:600 }}>{parseFloat(currentVal)||0}{kr.unit}</span>
                <span style={{ ...TYPO.footnote, fontWeight:500, color:wT().textMuted }}>/ {kr.target}{kr.unit}</span>
                <span style={{ color:wT().textFaint, display:'inline-flex', alignItems:'center' }}><Icon name="pencil" size={10} /></span>
              </div>
            )}
          </div>
          <span style={{ display:'inline-flex', gap:1, flexShrink:0 }}>{[1,2,3,4,5].map(n => <Icon key={n} name="star" size={13} style={{ color: n<=stars ? wT().warn : wT().borderMid }} />)}</span>
          {!open && weather > 0 && <span style={{ color: WEATHER_CFG[weather]?.color, display:'inline-flex' }}><Icon name={WEATHER_CFG[weather]?.icon} size={16} /></span>}
          <span style={{ color:wT().textFaint, transform:open?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s', display:'inline-flex', alignItems:'center' }}><Icon name="chevronD" size={14} /></span>
        </div>
        <div style={{ height:4, borderRadius:RADIUS.xs, background:wT().borderLight, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:pctColor, borderRadius:RADIUS.xs, transition:'width 0.4s' }} />
        </div>
        {!open && (good||more) && (
          <div style={{ display:'flex', gap:SPACING.md, marginTop:5, flexWrap:'wrap' }}>
            {good && <div style={{ ...TYPO.footnote, fontWeight:500, color:wT().textSub, display:'flex', gap:3, alignItems:'center' }}><span style={{ color:wT().success, display:'inline-flex' }}><Icon name="check" size={11} /></span><span>{good.slice(0,50)}{good.length>50?'…':''}</span></div>}
            {more && <div style={{ ...TYPO.footnote, fontWeight:500, color:wT().textSub, display:'flex', gap:3, alignItems:'center' }}><span style={{ color:wT().danger, display:'inline-flex' }}><Icon name="alert" size={11} /></span><span>{more.slice(0,50)}{more.length>50?'…':''}</span></div>}
          </div>
        )}
      </div>

      {open && (
        <div style={{ padding:'12px 14px', background:wT().bgCard2 }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:SPACING.lg, marginBottom:SPACING.md, padding:'10px 12px', background:wT().bgCard, borderRadius:RADIUS.sm, border:`1px solid ${wT().border}` }}>
            <div style={{ borderRight:`1px solid ${wT().border}`, paddingRight:SPACING.lg }}>
              <div style={{ ...TYPO.caption, color:wT().textMuted, textTransform:'uppercase', marginBottom:5 }}>KR達成評価（自動）</div>
              <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm }}>
                <span style={{ display:'inline-flex', gap:2 }}>{[1,2,3,4,5].map(n => <Icon key={n} name="star" size={18} style={{ color: n<=stars ? wT().warn : wT().borderMid }} />)}</span>
                <div>
                  <div style={{ ...TYPO.subhead, fontWeight:700, color:starCfg.color }}>{starCfg.label}</div>
                  <div style={{ ...TYPO.caption, fontWeight:500, color:wT().textMuted }}>達成率 {pct}%</div>
                </div>
              </div>
            </div>
            <div>
              <div style={{ ...TYPO.caption, color:wT().textMuted, textTransform:'uppercase', marginBottom:5 }}>今週の体感・主観</div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {WEATHER_CFG.slice(1).map(w => {
                  const isActive = w.score === weather
                  return (
                    <div key={w.score} onClick={()=>setWeather(isActive?0:w.score)} style={{ display:'flex', alignItems:'center', gap:SPACING.xs, padding:'4px 10px', borderRadius:RADIUS.xs, cursor:'pointer', transition:'all 0.15s', background:isActive?`${w.color}15`:'transparent', border:`1px solid ${isActive?w.color+'60':wT().borderMid}` }}>
                      <span style={{ color:w.color, display:'inline-flex' }}><Icon name={w.icon} size={16} /></span>
                      <span style={{ ...TYPO.footnote, fontWeight:isActive?700:400, color:isActive?w.color:wT().textMuted }}>{w.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {/* KR編集セクション */}
          <div style={{ marginBottom:SPACING.md, padding:'10px 12px', background:wT().bgCard, borderRadius:RADIUS.sm, border:`1px solid ${krEditing?`${wT().warn}66`:wT().border}`, transition:'border-color 0.15s' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:krEditing?SPACING.sm:0 }}>
              <div style={{ ...TYPO.caption, color:wT().warn, textTransform:'uppercase', display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="pencil" size={11} /> KR設定</div>
              {!krEditing && (
                <button onClick={() => setKrEditing(true)} style={{ ...TYPO.caption, fontWeight:600, padding:'3px 10px', borderRadius:RADIUS.xs, border:`1px solid ${wT().warn}4d`, background:wT().warnBg, color:wT().warn, cursor:'pointer', fontFamily:'inherit' }}>編集</button>
              )}
            </div>
            {!krEditing ? (
              <div style={{ display:'flex', gap:SPACING.lg, alignItems:'center', marginTop:SPACING.xs+2, fontSize:TYPO.subhead.fontSize, color:wT().textSub, flexWrap:'wrap' }}>
                <span>タイトル: <b style={{ color:wT().text }}>{kr.title}</b></span>
                <span>現在値: <b style={{ color:pctColor }}>{parseFloat(currentVal)||0}{kr.unit}</b></span>
                <span>目標: <b style={{ color:wT().text }}>{kr.target}{kr.unit}</b></span>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom:SPACING.xs+2 }}>
                  <div style={{ ...TYPO.caption, fontWeight:500, color:wT().textMuted, marginBottom:3 }}>タイトル</div>
                  <input value={krTitle} onChange={e=>setKrTitle(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs, padding:'7px 9px', color:wT().text, fontSize:TYPO.subhead.fontSize, outline:'none', fontFamily:'inherit' }} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:SPACING.sm, marginBottom:SPACING.sm }}>
                  <div>
                    <div style={{ ...TYPO.caption, fontWeight:500, color:wT().textMuted, marginBottom:3 }}>現在値</div>
                    <input type="number" value={currentVal} onChange={e=>setCurrentVal(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs, padding:'7px 9px', color:pctColor, fontSize:TYPO.body.fontSize, fontWeight:700, outline:'none', fontFamily:'inherit' }} />
                  </div>
                  <div>
                    <div style={{ ...TYPO.caption, fontWeight:500, color:wT().textMuted, marginBottom:3 }}>目標値</div>
                    <input type="number" value={krTarget} onChange={e=>setKrTarget(e.target.value)} style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs, padding:'7px 9px', color:wT().text, fontSize:TYPO.body.fontSize, fontWeight:700, outline:'none', fontFamily:'inherit' }} />
                  </div>
                  <div>
                    <div style={{ ...TYPO.caption, fontWeight:500, color:wT().textMuted, marginBottom:3 }}>単位</div>
                    <input value={krUnit} onChange={e=>setKrUnit(e.target.value)} placeholder="件, %, 万円..." style={{ width:'100%', boxSizing:'border-box', background:wT().borderLight, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs, padding:'7px 9px', color:wT().text, fontSize:TYPO.subhead.fontSize, outline:'none', fontFamily:'inherit' }} />
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:SPACING.xs+2 }}>
                  <button onClick={() => { setKrEditing(false); setKrTitle(kr.title||''); setCurrentVal(String(kr.current??'')); setKrTarget(String(kr.target??'')); setKrUnit(kr.unit||'') }}
                    style={{ padding:'4px 10px', borderRadius:RADIUS.xs, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:TYPO.caption.fontSize, cursor:'pointer', fontFamily:'inherit' }}>キャンセル</button>
                  <button onClick={saveKRFull} disabled={krSaving}
                    style={{ padding:'4px 14px', borderRadius:RADIUS.xs, background:krSaved?wT().success:wT().warn, border:'none', color:'#fff', fontSize:TYPO.caption.fontSize, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:4 }}>
                    {krSaved?<><Icon name="check" size={11} /> 保存済み</>:krSaving?'保存中...':'KRを保存'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:SPACING.sm, marginBottom:SPACING.sm, minWidth:0 }}>
            <div style={{ minWidth:0 }}>
              <div style={{ ...TYPO.caption, color:wT().success, background:`${wT().success}1a`, padding:'3px 8px', borderRadius:RADIUS.xs, marginBottom:SPACING.xs, display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="check" size={11} /> Good — うまくいったこと</div>
              <textarea value={good} onChange={e=>setGood(e.target.value)} rows={3} placeholder="進んでいること・良かったこと" style={taS} onFocus={e=>e.target.style.borderColor=`${wT().success}66`} onBlur={e=>e.target.style.borderColor=wT().border} />
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ ...TYPO.caption, color:wT().danger, background:wT().dangerBg, padding:'3px 8px', borderRadius:RADIUS.xs, marginBottom:SPACING.xs, display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="alert" size={11} /> More — 課題・改善点</div>
              <textarea value={more} onChange={e=>setMore(e.target.value)} rows={3} placeholder="うまくいっていないこと・課題" style={taS} onFocus={e=>e.target.style.borderColor=`${wT().danger}66`} onBlur={e=>e.target.style.borderColor=wT().border} />
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm, marginBottom:SPACING.sm }}>
            <div style={{ flex:1, height:1, background:wT().border }} />
            <span style={{ ...TYPO.caption, fontWeight:500, color:wT().textMuted, display:'inline-flex', alignItems:'center', gap:3 }}><Icon name="chevronD" size={11} /> Moreへの対応</span>
            <div style={{ flex:1, height:1, background:wT().border }} />
          </div>
          <div style={{ marginBottom:SPACING.sm+2 }}>
            <div style={{ ...TYPO.caption, color:wT().info, background:`${wT().info}1a`, padding:'3px 8px', borderRadius:RADIUS.xs, marginBottom:SPACING.xs, display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="target" size={11} /> 来週の注力アクション</div>
            <textarea value={focus} onChange={e=>setFocus(e.target.value)} rows={2} placeholder="Moreに対してどう動くか・何に力を入れるか" style={taS} onFocus={e=>e.target.style.borderColor=`${wT().info}66`} onBlur={e=>e.target.style.borderColor=wT().border} />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:SPACING.sm }}>
            <button onClick={()=>setOpen(false)} style={{ padding:'5px 12px', borderRadius:RADIUS.xs, background:'transparent', border:`1px solid ${wT().borderMid}`, color:wT().textSub, fontSize:TYPO.footnote.fontSize, cursor:'pointer', fontFamily:'inherit' }}>閉じる</button>
            <button onClick={saveReview} disabled={saving} style={{ padding:'5px 16px', borderRadius:RADIUS.xs, background:saved?wT().success:wT().info, border:'none', color:'#fff', fontSize:TYPO.footnote.fontSize, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'background 0.3s', display:'inline-flex', alignItems:'center', gap:4 }}>
              {saved?<><Icon name="check" size={11} /> 保存済み（週次MTGに反映）</>:saving?'保存中...':'保存して週次MTGに反映'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── タスクポップオーバー ──────────────────────────────────────────────────────
function TaskPopover({ report, members, wT, onClose, onTaskCountChange, kaTitle, objectiveTitle, completedBy }) {
  const reportId = report?.id
  const kaKey = computeKAKey(report)
  const [tasks, setTasks] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState({})
  const ref = useRef(null)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  useEffect(() => {
    if (!kaKey) return
    supabase.from('ka_tasks').select('*').eq('ka_key', kaKey).order('id')
      .then(({data}) => { setTasks(data||[]); setLoaded(true) })
  }, [kaKey])

  useEffect(() => {
    if (loaded && onTaskCountChange) {
      const saved = tasks.filter(t => t.id)
      onTaskCountChange({ done: saved.filter(t => t.done).length, total: saved.length })
    }
  }, [tasks, loaded]) // eslint-disable-line

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const addTask = async () => {
    const d = { title:'', assignee:null, due_date:null, done:false, report_id:reportId, ka_key:kaKey }
    const {data:ins} = await supabase.from('ka_tasks').insert(d).select().single()
    if (ins) setTasks(p => [...p, ins])
  }
  const updateTask = (key, f, v) => {
    setTasks(p => p.map(t => t.id===key ? {...t,[f]:v} : t))
  }
  const removeTask = async (key) => {
    await supabase.from('ka_tasks').delete().eq('id', key)
    setTasks(p => p.filter(x => x.id!==key))
  }
  const toggleDone = async (key) => {
    const t = tasks.find(x => x.id===key)
    const nd = !t.done
    await supabase.from('ka_tasks').update({ done:nd }).eq('id', key)
    setTasks(p => p.map(x => x.id===key ? {...x,done:nd} : x))
  }
  const saveTask = async (key) => {
    const t = tasksRef.current.find(x => x.id===key)
    if (!t) return
    setSaving(p => ({...p, [key]: true}))
    const d = { title:t.title||'', assignee:t.assignee||null, due_date:t.due_date||null, done:t.done }
    await supabase.from('ka_tasks').update(d).eq('id', t.id)
    setSaving(p => { const n = {...p}; delete n[key]; return n })
  }
  const doneCount = tasks.filter(t=>t.done).length

  return (
    <div ref={ref} style={{ position:'absolute', top:'100%', right:0, zIndex:100, width:420, background:wT().bgCard, border:`1px solid ${wT().borderMid}`, borderRadius:RADIUS.md, boxShadow:SHADOWS.lg, padding:SPACING.md }}>
      <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm, marginBottom:SPACING.sm }}>
        <span style={{ ...TYPO.caption, color:wT().accent, display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="workspace" size={11} /> タスク {doneCount}/{tasks.length}</span>
        <button onClick={addTask} style={{ marginLeft:SPACING.xs, background:wT().accentBg, border:`1px solid ${wT().accent}4d`, borderRadius:RADIUS.xs, color:wT().accent, padding:'2px 6px', cursor:'pointer', fontFamily:'inherit', display:'inline-flex', alignItems:'center' }}><Icon name="plus" size={11} /></button>
        <button onClick={onClose} style={{ marginLeft:'auto', background:'transparent', border:'none', color:wT().textFaint, cursor:'pointer', display:'inline-flex', alignItems:'center' }}><Icon name="cross" size={14} /></button>
      </div>
      {!loaded && <div style={{ ...TYPO.footnote, fontWeight:500, color:wT().textMuted, padding:SPACING.sm }}>読み込み中...</div>}
      {tasks.map(t => {
        const key = t.id; const tc = avatarColor(t.assignee); const isSaving = saving[key]
        return (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:SPACING.sm, padding:'5px 8px', borderRadius:RADIUS.xs, marginBottom:SPACING.xs, background:t.done?wT().borderLight:wT().bgCard, border:`1px solid ${t.done?wT().border:wT().borderMid}`, opacity:t.done?0.6:1 }}>
            <div onClick={()=>toggleDone(key)} style={{ width:16, height:16, borderRadius:RADIUS.xs, border:`1.5px solid ${t.done?wT().success:wT().borderMid}`, background:t.done?wT().success:'transparent', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {t.done && <span style={{ color:'#fff', display:'inline-flex' }}><Icon name="check" size={10} /></span>}
            </div>
            <input value={t.title} onChange={e=>updateTask(key,'title',e.target.value)} placeholder="タスク内容" style={{ flex:1, background:'transparent', border:'none', color:t.done?wT().textMuted:wT().text, fontSize:TYPO.subhead.fontSize, outline:'none', fontFamily:'inherit', textDecoration:t.done?'line-through':'none' }}/>
            <select value={t.assignee||''} onChange={e=>updateTask(key,'assignee',e.target.value)} style={{ background:wT().bgCard2||wT().bgCard, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs, padding:'2px 6px', color:t.assignee?tc:wT().textMuted, fontSize:TYPO.footnote.fontSize, cursor:'pointer', fontFamily:'inherit', outline:'none', flexShrink:0, maxWidth:80 }}>
              <option value="">担当</option>
              {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <input type="date" value={t.due_date||''} onChange={e=>updateTask(key,'due_date',e.target.value)} style={{ background:wT().bgCard2||wT().bgCard, border:`1px solid ${wT().border}`, borderRadius:RADIUS.xs, padding:'2px 6px', color:t.due_date?wT().text:wT().textMuted, fontSize:TYPO.footnote.fontSize, outline:'none', fontFamily:'inherit', flexShrink:0, maxWidth:110 }}/>
            <button onClick={()=>saveTask(key)} disabled={isSaving} style={{ padding:'2px 8px', borderRadius:RADIUS.xs, border:'none', background:isSaving?wT().textMuted:wT().accent, color:'#fff', fontSize:TYPO.caption.fontSize, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>{isSaving?'...':'保存'}</button>
            <button onClick={()=>removeTask(key)} style={{ width:18, height:18, borderRadius:RADIUS.xs, border:'none', background:'transparent', color:wT().textFaint, cursor:'pointer', flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center' }}><Icon name="cross" size={12} /></button>
          </div>
        )
      })}
    </div>
  )
}

// ─── KAインライン行 ──────────────────────────────────────────────────────────
function MyKARow({ report, onSave, onDelete, wT, members, myName: completedBy, objectiveTitle }) {
  const [good,         setGood]         = useState(report.good || '')
  const [more,         setMore]         = useState(report.more || '')
  const [focusOutput,  setFocusOutput]  = useState(report.focus_output || '')
  const [status,       setStatus]       = useState(report.status || 'normal')
  const [ownerDraft,   setOwnerDraft]   = useState(report.owner || '')
  const [kaTitle,      setKaTitle]      = useState(report.ka_title || '')
  const [editingTitle, setEditingTitle] = useState(false)
  const [showTasks,    setShowTasks]    = useState(false)
  const [taskCount,    setTaskCount]    = useState({ done:0, total:0 })
  const lastEnterRef   = useRef(0)

  const autoSave = useAutoSave('weekly_reports', report.id, { enabled: true })
  const cfg = STATUS_CFG[status] || STATUS_CFG.normal
  const ownerMember = members?.find(m => m.name === (ownerDraft||report.owner))
  const STATUS_ORDER = ['normal','focus','good','more']

  const myKAKey = computeKAKey(report)
  useEffect(() => {
    if (!myKAKey) return
    supabase.from('ka_tasks').select('id,done').eq('ka_key', myKAKey)
      .then(({data}) => {
        if (data) setTaskCount({ done:data.filter(t=>t.done).length, total:data.length })
      })
  }, [myKAKey])

  useEffect(() => {
    const ff = autoSave.focusedField
    if (ff !== 'good' && report.good !== undefined) setGood(report.good || '')
    if (ff !== 'more' && report.more !== undefined) setMore(report.more || '')
    if (ff !== 'focus_output' && report.focus_output !== undefined) setFocusOutput(report.focus_output || '')
    if (ff !== 'status') setStatus(report.status || 'normal')
    if (ff !== 'owner') setOwnerDraft(report.owner || '')
    if (ff !== 'ka_title') setKaTitle(report.ka_title || '')
  }, [report.good, report.more, report.focus_output, report.status, report.owner, report.ka_title])

  const handleFieldChange = (field, value, setter) => {
    setter(value)
    autoSave.save(field, value)
    onSave({ ...report, [field]: value })
  }

  const cycleStatus = () => {
    const idx = STATUS_ORDER.indexOf(status)
    const next = STATUS_ORDER[(idx+1) % STATUS_ORDER.length]
    setStatus(next)
    autoSave.save('status', next)
    onSave({ ...report, status: next })
  }

  // KA のタイトル/オーナー変更時に既存タスクの ka_key を追従更新
  const syncTaskKaKey = async (oldKey, newKey) => {
    if (!oldKey || !newKey || oldKey === newKey) return
    await supabase.from('ka_tasks').update({ ka_key: newKey }).eq('ka_key', oldKey)
  }

  // マイOKR は 週次MTG の今週 + 翌週のビューなので、同じ KA の対応する
  // 他方の週の行にも同じフィールドを反映させる (週次MTG 側と同期させる)
  // Postgres では owner の NULL と '' が別物扱いのため、候補取得→ JS 側で
  // 正規化比較して UPDATE 対象 id を決める
  const syncSiblingWeeks = async (field, value) => {
    const { data: candidates } = await supabase.from('weekly_reports')
      .select('id, owner')
      .eq('kr_id', report.kr_id)
      .eq('ka_title', report.ka_title || '')
      .eq('objective_id', report.objective_id)
      .neq('id', report.id)
    const targetOwner = (report.owner || '').trim()
    const ids = (candidates || [])
      .filter(r => (r.owner || '').trim() === targetOwner)
      .map(r => r.id)
    if (ids.length === 0) return
    await supabase.from('weekly_reports').update({ [field]: value }).in('id', ids)
  }

  const handleOwnerChange = (val) => {
    setOwnerDraft(val)
    autoSave.save('owner', val)
    onSave({ ...report, owner: val })
    const oldKey = computeKAKey(report)
    const newKey = computeKAKey({ ...report, owner: val })
    syncTaskKaKey(oldKey, newKey)
    syncSiblingWeeks('owner', val)
  }

  const handleTitleBlur = () => {
    setEditingTitle(false)
    autoSave.setFocusedField(null)
    if (kaTitle.trim() && kaTitle !== report.ka_title) {
      const newTitle = kaTitle.trim()
      autoSave.saveNow('ka_title', newTitle)
      onSave({ ...report, ka_title: newTitle })
      const oldKey = computeKAKey(report)
      const newKey = computeKAKey({ ...report, ka_title: newTitle })
      syncTaskKaKey(oldKey, newKey)
      syncSiblingWeeks('ka_title', newTitle)
    }
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setKaTitle(report.ka_title)
      setEditingTitle(false)
      autoSave.setFocusedField(null)
      return
    }
    if (e.key === 'Enter') {
      const now = Date.now()
      if (now - lastEnterRef.current < 500) {
        e.preventDefault()
        setKaTitle(prev => prev.replace(/\n$/, ''))
        setTimeout(() => e.target?.blur(), 0)
      }
      lastEnterRef.current = now
    }
  }

  const cellS = { padding:'6px 8px', borderBottom:`1px solid ${wT().border}`, verticalAlign:'top', fontSize:TYPO.subhead.fontSize }
  const taS = { width:'100%', boxSizing:'border-box', background:'transparent', border:'1px solid transparent', borderRadius:RADIUS.xs, padding:'4px 6px', color:wT().text, fontSize:TYPO.footnote.fontSize, outline:'none', fontFamily:'inherit', resize:'none', lineHeight:1.5, minHeight:36, transition:'border-color 0.15s' }

  return (
    <tr>
      {/* 担当 */}
      <td style={{ ...cellS, width:90 }}>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <Avatar name={ownerDraft||report.owner} avatarUrl={ownerMember?.avatar_url} size={20} wT={wT} />
          <select value={ownerDraft} onChange={e=>handleOwnerChange(e.target.value)}
            onFocus={()=>autoSave.setFocusedField('owner')} onBlur={()=>autoSave.setFocusedField(null)}
            style={{ flex:1, background:'transparent', border:'none', color:ownerDraft?avatarColor(ownerDraft):wT().textMuted, fontSize:TYPO.footnote.fontSize, cursor:'pointer', fontFamily:'inherit', outline:'none', fontWeight:600, minWidth:0, maxWidth:60 }}>
            <option value="">--</option>
            {members?.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>
      </td>
      {/* KAタイトル */}
      <td style={{ ...cellS, minWidth:120 }}>
        {editingTitle ? (
          <textarea autoFocus value={kaTitle} onChange={e=>setKaTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            rows={2}
            style={{ width:'100%', boxSizing:'border-box', background:wT().bgCard2||wT().bgCard, border:`1px solid ${wT().info}80`, borderRadius:RADIUS.xs, padding:'4px 6px', color:wT().text, fontSize:TYPO.subhead.fontSize, fontWeight:600, outline:'none', fontFamily:'inherit', resize:'vertical', lineHeight:1.5 }} />
        ) : (
          <div onClick={() => { setEditingTitle(true); autoSave.setFocusedField('ka_title') }}
            style={{ fontSize:TYPO.subhead.fontSize, fontWeight:600, color:wT().text, cursor:'text', lineHeight:1.4, minHeight:20, whiteSpace:'pre-wrap' }}>
            {kaTitle||report.ka_title||'(無題)'}
          </div>
        )}
      </td>
      {/* ステータス */}
      <td style={{ ...cellS, width:70, textAlign:'center' }}>
        <span onClick={cycleStatus}
          style={{ ...TYPO.caption, padding:'3px 7px', borderRadius:RADIUS.pill, cursor:'pointer', background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, whiteSpace:'nowrap', display:'inline-block' }}>
          {cfg.label}
        </span>
      </td>
      {/* Good */}
      <td style={cellS}>
        <textarea value={good}
          onChange={e=>handleFieldChange('good', e.target.value, setGood)}
          onFocus={e=>{autoSave.setFocusedField('good');e.target.style.borderColor=`${wT().success}66`;e.target.rows=4}}
          onBlur={e=>{autoSave.setFocusedField(null);autoSave.saveNow('good',good);e.target.style.borderColor='transparent';e.target.rows=2}}
          rows={2} placeholder="Good"
          style={{ ...taS, color:good?wT().text:wT().textFaint }} />
      </td>
      {/* More */}
      <td style={cellS}>
        <textarea value={more}
          onChange={e=>handleFieldChange('more', e.target.value, setMore)}
          onFocus={e=>{autoSave.setFocusedField('more');e.target.style.borderColor=`${wT().danger}66`;e.target.rows=4}}
          onBlur={e=>{autoSave.setFocusedField(null);autoSave.saveNow('more',more);e.target.style.borderColor='transparent';e.target.rows=2}}
          rows={2} placeholder="More"
          style={{ ...taS, color:more?wT().text:wT().textFaint }} />
      </td>
      {/* Focus */}
      <td style={cellS}>
        <textarea value={focusOutput}
          onChange={e=>handleFieldChange('focus_output', e.target.value, setFocusOutput)}
          onFocus={e=>{autoSave.setFocusedField('focus_output');e.target.style.borderColor=`${wT().info}66`;e.target.rows=4}}
          onBlur={e=>{autoSave.setFocusedField(null);autoSave.saveNow('focus_output',focusOutput);e.target.style.borderColor='transparent';e.target.rows=2}}
          rows={2} placeholder="Focus"
          style={{ ...taS, color:focusOutput?wT().text:wT().textFaint }} />
      </td>
      {/* Tasks + Delete */}
      <td style={{ ...cellS, width:70, textAlign:'center', position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', gap:SPACING.xs, justifyContent:'center' }}>
          <span onClick={()=>setShowTasks(p=>!p)} style={{ fontSize:TYPO.footnote.fontSize, color:wT().accent, cursor:'pointer', fontWeight:600, padding:'2px 6px', borderRadius:RADIUS.xs, background:showTasks?wT().accentBg:'transparent' }}>
            {`${taskCount.done}/${taskCount.total}`}
          </span>
          <button onClick={()=>onDelete(report.id)} style={{ width:18, height:18, borderRadius:RADIUS.xs, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', background:wT().dangerBg, color:wT().danger, flexShrink:0 }}><Icon name="cross" size={11} /></button>
        </div>
        {showTasks && <TaskPopover report={report} members={members} wT={wT} onClose={()=>setShowTasks(false)} onTaskCountChange={setTaskCount} kaTitle={report.ka_title} objectiveTitle={objectiveTitle} completedBy={completedBy} />}
      </td>
      {/* 自動保存インジケーター */}
      <td style={{ ...cellS, width:20, padding:'6px 2px' }}>
        {autoSave.saving && <span style={{ color:wT().info, display:'inline-flex' }}><Icon name="refresh" size={11} /></span>}
        {autoSave.saved && <span style={{ color:wT().success, display:'inline-flex' }}><Icon name="check" size={11} /></span>}
      </td>
    </tr>
  )
}

// KAテーブルヘッダー
function KATableHeader({ wT }) {
  const thS = { padding:'4px 8px', fontSize:TYPO.caption.fontSize, fontWeight:600, color:wT().textMuted, textAlign:'left', borderBottom:`1px solid ${wT().border}` }
  return (
    <thead>
      <tr>
        <th style={{ ...thS, width:90 }}>担当</th>
        <th style={{ ...thS, minWidth:120 }}>KA</th>
        <th style={{ ...thS, width:70, textAlign:'center' }}>状態</th>
        <th style={thS}>Good</th>
        <th style={thS}>More</th>
        <th style={thS}>Focus</th>
        <th style={{ ...thS, width:70, textAlign:'center' }}>タスク</th>
        <th style={{ ...thS, width:20 }}></th>
      </tr>
    </thead>
  )
}

// ─── メインページ ──────────────────────────────────────────────────────────────
export default function MyOKRPage({ user, levels, members, themeKey = 'dark', fiscalYear = '2026', onAIFeedback, showMemberPicker = false }) {
  const { isMobile, isTablet } = useResponsive()
  // テーマは lib/themeTokens.js で一元管理
  const W_THEMES = {
    dark:  { ...COMMON_TOKENS.dark },
    light: { ...COMMON_TOKENS.light },
  }
  const wT = () => W_THEMES[themeKey] || W_THEMES.dark

  const myMember = members.find(m => m.email === user?.email)
  const myName   = myMember?.name || user?.email || ''
  // 週次+個人ビュー: 左のメンバー一覧で選んだ人の OKR を表示する (null=自分)。
  // 年間+個人と同じ「メンバーを選ぶ → その人の OKR」UX に揃える。
  // showMemberPicker=false (マイページ等) では常に自分の OKR のみ。
  const [selectedMember, setSelectedMember] = useState(null)
  const viewName = (showMemberPicker && selectedMember) || myName
  const viewMember = members.find(m => m.name === viewName) || myMember

  const [objectives, setObjectives] = useState([])
  const [keyResults, setKeyResults] = useState([])
  const [kaReports,  setKaReports]  = useState([])
  const [kaTasks,    setKaTasks]    = useState({}) // { reportId: [tasks] } - kept for potential future use
  const [reviews,    setReviews]    = useState({})
  const [loading,    setLoading]    = useState(true)
  const [activeObjId,setActiveObjId]= useState(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('myOKR_activeObjId')
    return saved && saved !== 'null' ? Number(saved) : null
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (activeObjId == null) localStorage.removeItem('myOKR_activeObjId')
    else localStorage.setItem('myOKR_activeObjId', String(activeObjId))
  }, [activeObjId])
  const [activeLevelId,setActiveLevelId]= useState(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('myOKR_activeLevelId')
    return saved && saved !== 'null' ? Number(saved) : null
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (activeLevelId == null) localStorage.removeItem('myOKR_activeLevelId')
    else localStorage.setItem('myOKR_activeLevelId', String(activeLevelId))
  }, [activeLevelId])
  // 現在のQを自動判定（4月=Q1, 7月=Q2, 10月=Q3, 1月=Q4）
  const getCurrentQ = () => { const m = new Date().getMonth(); return m >= 3 && m <= 5 ? 'q1' : m >= 6 && m <= 8 ? 'q2' : m >= 9 && m <= 11 ? 'q3' : 'q4' }
  const [activePeriod,setActivePeriod]=useState(getCurrentQ())

  // 現在の週（月曜日）を動的に保持。日付変更を検知して自動更新
  const [currentWeek, setCurrentWeek] = useState(() => getMondayOf(new Date()))
  useEffect(() => {
    const id = setInterval(() => {
      const w = getMondayOf(new Date())
      setCurrentWeek(prev => prev === w ? prev : w)
    }, 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // 翌週の月曜日を計算（YYYY-MM-DD）
  const nextWeek = (() => {
    const [y, m, d] = currentWeek.split('-').map(Number)
    const next = new Date(Date.UTC(y, m - 1, d + 7))
    return next.toISOString().split('T')[0]
  })()

  // 「今週」or「翌週」の選択（前週の金曜日に翌週の Good/More を書きたいケース対応）
  const [weekMode, setWeekMode] = useState('this') // 'this' | 'next'
  const selectedWeek = weekMode === 'next' ? nextWeek : currentWeek

  useEffect(() => {
    if (!viewName) return
    const load = async () => {
      setLoading(true)
      // 今週と翌週のみを対象とする (週次MTG の内容を引用するビュー)
      //   DB 上の weekly_reports から selectedWeek / currentWeek / nextWeek に
      //   絞って取得し、過去週の取り残しは表示しない
      const weeksToLoad = Array.from(new Set([currentWeek, nextWeek])).filter(Boolean)

      // ① 自分がOwner/KR担当/KA担当のデータを並行取得
      const [{ data: myObjs }, { data: myKRs }, { data: myKAs }, { data: myAssignedTasks }] = await Promise.all([
        supabase.from('objectives').select('id,title,level_id,period,owner,archived_at').eq('owner', viewName).order('period').range(0, 49999).then(r => ({ ...r, data: (r.data || []).filter(o => !o.archived_at) })),
        supabase.from('key_results').select('*').eq('owner', viewName).range(0, 49999),
        supabase.from('weekly_reports').select('*').eq('owner', viewName).neq('status', 'done').in('week_start', weeksToLoad).range(0, 49999),
        supabase.from('ka_tasks').select('*').eq('assignee', viewName).eq('done', false).range(0, 49999),
      ])
      // ★ 年度フィルタを適用
      const filterByFY = (objs) => (objs || []).filter(o => {
        if (fiscalYear === '2026') return !o.period.includes('_')
        return o.period.startsWith(`${fiscalYear}_`)
      })
      const ownedObjs = filterByFY(myObjs)

      // ①-b 他人のKAで自分がタスク担当のものも取得 (今週と翌週のみ)
      const assignedReportIds = [...new Set((myAssignedTasks || []).map(t => t.report_id).filter(Boolean))]
      const myKAIds = new Set((myKAs || []).map(r => r.id))
      const missingReportIds = assignedReportIds.filter(id => !myKAIds.has(id))
      let assignedKAs = []
      if (missingReportIds.length > 0) {
        const { data } = await supabase.from('weekly_reports').select('*')
          .in('id', missingReportIds).neq('status', 'done').in('week_start', weeksToLoad)
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
        const { data } = await supabase.from('objectives').select('id,title,level_id,period,owner').in('id', missingObjIds).range(0, 49999)
        extraObjs = filterByFY(data)
      }
      const filteredObjs = [...ownedObjs, ...extraObjs].filter((o,i,arr) => arr.findIndex(x => x.id === o.id) === i)

      // ③ 自分がOwnerのObjectiveに紐づく全KRも取得
      const objIds = filteredObjs.map(o => o.id)
      let krsForObjs = []
      if (objIds.length > 0) {
        const { data } = await supabase.from('key_results').select('*').in('objective_id', objIds).range(0, 49999)
        krsForObjs = data || []
      }
      const normalizeKR = kr => kr.current === undefined && kr.current_value !== undefined ? { ...kr, current: kr.current_value } : kr
      // アーカイブ済み KR は非表示
      const allMyKRs = [...(myKRs||[]), ...krsForObjs].filter(kr => !kr.archived_at).map(normalizeKR).filter((kr,i,arr)=>arr.findIndex(k=>k.id===kr.id)===i)
      const krIds = allMyKRs.map(k=>k.id)
      let revData = []
      if (krIds.length > 0) {
        const { data } = await supabase.from('kr_weekly_reviews').select('*').in('kr_id', krIds).eq('week_start', selectedWeek)
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

      // ★ 週コピーで同じKAが複数週に存在する場合の重複排除
      //   優先順位:
      //     1. 選択中の週 (selectedWeek = 今週 or 翌週) と一致する行
      //     2. 次点: 選択中の週より未来は除外し、過去で最も新しい週
      //     3. どれもなければ (まれ) 最新週の行
      //   これにより、将来の空行に今週の内容が隠されるのを防ぐ
      const kaByKey = {}
      for (const ka of allMyKAs) {
        const key = `${ka.kr_id}_${ka.ka_title}_${ka.owner}_${ka.objective_id}`
        const cur = kaByKey[key]
        if (!cur) { kaByKey[key] = ka; continue }
        const curWs = cur.week_start || ''
        const newWs = ka.week_start || ''
        const curIsSelected = curWs === selectedWeek
        const newIsSelected = newWs === selectedWeek
        if (newIsSelected && !curIsSelected) { kaByKey[key] = ka; continue }
        if (curIsSelected && !newIsSelected) { continue }
        // どちらも選択週と一致しない場合: 選択週以前で最新を優先
        const curIsFuture = curWs > selectedWeek
        const newIsFuture = newWs > selectedWeek
        if (!newIsFuture && curIsFuture) { kaByKey[key] = ka; continue }
        if (newIsFuture && !curIsFuture) { continue }
        // 両方過去 or 両方未来: より新しい方
        if (newWs > curWs) { kaByKey[key] = ka }
      }
      const dedupedKAs = Object.values(kaByKey)

      setObjectives(filteredObjs)
      setKeyResults(allMyKRs)
      setKaReports(dedupedKAs)
      setKaTasks(allTasksMap)
      setReviews(revMap)
      setLoading(false)
    }
    load()
  }, [viewName, fiscalYear, currentWeek, selectedWeek])

  const selectedObj = activeObjId ? objectives.find(o=>o.id===Number(activeObjId)) : null
  const objKRs = activeObjId ? keyResults.filter(kr=>Number(kr.objective_id)===Number(activeObjId)) : []
  const objKAs = activeObjId ? kaReports.filter(r=>Number(r.objective_id)===Number(activeObjId)) : []
  const visibleObjs = objectives.filter(o => {
    if (activePeriod !== 'all' && rawPeriod(o.period) !== activePeriod) return false
    return true
  })

  const handleKASave = (updated) => setKaReports(p=>p.map(r=>r.id===updated.id?updated:r))

  // KA を追加: 選択週 (今週 or 翌週) の weekly_reports に新規行を insert
  //   owner は閲覧中メンバー (自分のマイOKR なら自分)
  const handleKAAdd = async (kr) => {
    if (!kr || !activeObjId) return
    const obj = selectedObj
    const levelId = obj?.level_id
    const payload = {
      week_start: selectedWeek,
      level_id: levelId,
      objective_id: activeObjId,
      kr_id: kr.id,
      kr_title: kr.title,
      ka_title: '新しいKA',
      owner: viewName || '',
      status: 'normal',
    }
    // sort_order 付きで試し、カラムが無ければフォールバック
    const currentKAs = kaReports.filter(r => Number(r.kr_id) === Number(kr.id))
    const maxOrder = currentKAs.reduce((m, r) => Math.max(m, r.sort_order || 0), 0)
    let res = await supabase.from('weekly_reports')
      .insert({ ...payload, sort_order: maxOrder + 1 }).select().single()
    if (res.error) {
      if (/sort_order/i.test(res.error.message || '')) {
        res = await supabase.from('weekly_reports').insert(payload).select().single()
      }
      if (res.error) { alert('KA追加失敗: ' + res.error.message); return }
    }
    if (res.data) setKaReports(p => [...p, res.data])
  }
  // KA 削除: 同じ ka_key を持つ他週の行もまとめて削除
  //   (マイOKR は重複排除で 1 KA = 1 行表示しているが、DB には複数週分あるので一括削除)
  //   注: Postgres では null と '' が別物扱いなので、どちらのケースも拾う
  const handleKADelete = async (id) => {
    if (!window.confirm('この KA を全週分 まとめて削除しますか？')) return
    const target = kaReports.find(r => r.id === id)
    if (!target) {
      await supabase.from('weekly_reports').delete().eq('id', id)
      setKaReports(p=>p.filter(r=>r.id!==id))
      return
    }
    // kr_id + ka_title + objective_id で候補を絞り、owner は null/'' を両方許容
    let q = supabase.from('weekly_reports').select('id, owner, ka_title')
      .eq('kr_id', target.kr_id)
      .eq('objective_id', target.objective_id)
      .eq('ka_title', target.ka_title || '')
    const { data: candidates } = await q
    const targetOwner = (target.owner || '').trim()
    // owner を正規化 (null / 空白 を空文字扱いで比較)
    const sameIds = (candidates || [])
      .filter(r => (r.owner || '').trim() === targetOwner)
      .map(r => r.id)
    if (sameIds.length === 0) sameIds.push(id)
    const { error } = await supabase.from('weekly_reports').delete().in('id', sameIds)
    if (error) { alert('削除失敗: ' + error.message); return }
    const kaKey = computeKAKey(target)
    setKaReports(p => p.filter(r => computeKAKey(r) !== kaKey))
  }

  const periodTabs = [['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['all','通期']]

  // 組織図サイドバー
  const roots = levels.filter(l => !l.parent_id)
  // 自分のObjectiveがある組織のみハイライト
  const myLevelIds = new Set(objectives.map(o => Number(o.level_id)))
  function renderSb(level, indent=0) {
    const isActive = Number(activeLevelId)===Number(level.id)
    const hasMyObj = myLevelIds.has(Number(level.id))
    return (
      <div key={level.id}>
        <div onClick={()=>{ setActiveLevelId(isActive?null:level.id); setActiveObjId(null) }}
          style={{ display:'flex', alignItems:'center', gap:SPACING.sm, padding:'6px 8px', paddingLeft:(isActive?5:8)+indent*14, borderRadius:RADIUS.xs, cursor:'pointer', marginBottom:2, borderLeft:`3px solid ${isActive?wT().accent:'transparent'}`, background:isActive?wT().accentBg:'transparent', opacity:hasMyObj?1:0.5 }}>
          <span style={{display:'inline-flex'}}><DataIcon value={level.icon} size={13}/></span>
          <span style={{ fontSize:TYPO.footnote.fontSize, flex:1, fontWeight:isActive?700:hasMyObj?600:400, color:isActive?wT().accentText:hasMyObj?wT().textSub:wT().textFaint }}>{level.name}</span>
          {hasMyObj && <span style={{ width:6, height:6, borderRadius:'50%', background:isActive?wT().accent:wT().success, flexShrink:0 }} />}
        </div>
        {levels.filter(l=>Number(l.parent_id)===Number(level.id)).map(c=>renderSb(c, indent+1))}
      </div>
    )
  }

  if (loading) return <div style={{ padding:SPACING['3xl']+8, color:wT().info, fontSize:TYPO.headline.fontSize }}>読み込み中...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:wT().bg, color:wT().text }}>

      {/* ヘッダー (iOS 風グラスバー) */}
      <div style={{
        padding:'14px 20px', borderBottom:`1px solid ${wT().border}`,
        display:'flex', alignItems:'center', gap:SPACING.md, flexShrink:0,
        background: wT().headerBg,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      }}>
        {/* ユーザーアバター（閲覧中メンバーの画像 or イニシャル） */}
        {viewMember?.avatar_url ? (
          <img
            src={viewMember.avatar_url}
            alt={viewName}
            style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover', border:`2px solid ${avatarColor(viewName)}60`, flexShrink:0 }}
          />
        ) : (
          <div style={{ width:36, height:36, borderRadius:'50%', background:`${avatarColor(viewName)}25`, border:`2px solid ${avatarColor(viewName)}60`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:TYPO.headline.fontSize, fontWeight:700, color:avatarColor(viewName), flexShrink:0 }}>
            {viewName.slice(0,2)}
          </div>
        )}
        <div>
          <div style={{ fontSize:TYPO.caption.fontSize, fontWeight:500, color:wT().textMuted, marginBottom:1 }}>{viewMember?.role || 'メンバー'}</div>
          <div style={{ fontSize:TYPO.title3.fontSize, fontWeight:700 }}>{viewName} のOKR</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:SPACING.sm }}>
          <div style={{ fontSize:TYPO.footnote.fontSize, fontWeight:700, padding:'3px 10px', borderRadius:RADIUS.pill, background: fiscalYear==='2026'?wT().infoBg:wT().warnBg, color: fiscalYear==='2026'?wT().info:wT().warn, border:`1px solid ${fiscalYear==='2026'?`${wT().info}4d`:`${wT().warn}4d`}`, display:'inline-flex', alignItems:'center', gap:5 }}>
            <Icon name="calendar" size={12} /> {fiscalYear}年度
          </div>
          {/* 今週/翌週 切り替えトグル */}
          <div style={{ display:'flex', gap:0, background:wT().bgCard2 || wT().bgSoft, borderRadius:RADIUS.pill, padding:2, border:`1px solid ${wT().borderMid}` }}>
            <button onClick={()=>setWeekMode('this')}
              style={{
                fontSize:TYPO.footnote.fontSize, fontWeight:700, padding:'4px 12px', borderRadius:RADIUS.pill, border:'none', cursor:'pointer', fontFamily:'inherit',
                background: weekMode==='this' ? wT().success : 'transparent',
                color: weekMode==='this' ? '#fff' : wT().textMuted,
                transition:'all 0.15s',
              }}>今週</button>
            <button onClick={()=>setWeekMode('next')}
              style={{
                fontSize:TYPO.footnote.fontSize, fontWeight:700, padding:'4px 12px', borderRadius:RADIUS.pill, border:'none', cursor:'pointer', fontFamily:'inherit',
                background: weekMode==='next' ? wT().warn : 'transparent',
                color: weekMode==='next' ? '#fff' : wT().textMuted,
                transition:'all 0.15s',
              }}>翌週</button>
          </div>
          <div style={{
            fontSize:TYPO.subhead.fontSize, fontWeight:800, padding:'5px 12px', borderRadius:RADIUS.pill,
            background: weekMode==='next' ? `${wT().warn}1f` : `${wT().success}1f`,
            color: weekMode==='next' ? wT().warn : wT().success,
            border: `1px solid ${weekMode==='next' ? `${wT().warn}80` : `${wT().success}59`}`,
            display:'flex', alignItems:'center', gap:5,
          }}>
            <Icon name="pencil" size={12} />
            {weekMode==='next' ? '翌週を記入中' : '今週を記入中'} {formatWeekLabel(selectedWeek)}
          </div>
        </div>
      </div>

      {/* 期間タブ (iOS SegmentedControl) */}
      <div style={{ display:'flex', gap:SPACING.sm, padding:'10px 20px', borderBottom:`1px solid ${wT().border}`, flexShrink:0, alignItems:'center' }}>
        <span style={{ fontSize:TYPO.footnote.fontSize, color:wT().textMuted, fontWeight:700 }}>期間</span>
        <SegmentedControl T={wT()} value={activePeriod} onChange={key => { setActivePeriod(key); setActiveObjId(null) }}
          items={periodTabs.map(([key, label]) => ({ key, label }))} size="sm" />
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* メンバー一覧サイドバー (選択した人の OKR を表示。年間+個人と同じUX)
            showMemberPicker のときだけ表示 (マイページでは自分のみで不要) */}
        {!isMobile && showMemberPicker && (
          <div style={{ width: isTablet ? 150 : 190, flexShrink:0, borderRight:`1px solid ${wT().border}`, padding:'10px 8px', overflowY:'auto', background:wT().bgSidebar }}>
            <div style={{ ...TYPO.caption, color:wT().textMuted, textTransform:'uppercase', marginBottom:SPACING.sm, paddingLeft:SPACING.sm }}>メンバー</div>
            {(members || []).map(m => {
              const active = m.name === viewName
              return (
                <div key={m.id} onClick={()=>{ setSelectedMember(m.name); setActiveObjId(null) }}
                  style={{ display:'flex', alignItems:'center', gap:SPACING.sm, padding:'6px 8px', borderRadius:RADIUS.sm, cursor:'pointer', marginBottom:2,
                    background: active?wT().navActiveBg:'transparent', border: active?`1px solid ${wT().accent}`:'1px solid transparent', transition:'all 0.15s' }}>
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt={m.name} style={{ width:24, height:24, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />
                  ) : (
                    <div style={{ width:24, height:24, borderRadius:'50%', background:`${avatarColor(m.name)}25`, border:`1.5px solid ${avatarColor(m.name)}50`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:avatarColor(m.name), flexShrink:0 }}>{m.name.slice(0,2)}</div>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:TYPO.footnote.fontSize, fontWeight: active?700:500, color: active?wT().navActiveText:wT().text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</div>
                    {m.role && <div style={{ fontSize:9, color:wT().textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.role}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Objective一覧 */}
        <div style={{ width: isMobile ? '100%' : isTablet ? 220 : 260, flexShrink: isMobile ? 1 : 0, borderRight: isMobile ? 'none' : `1px solid ${wT().border}`, overflowY:'auto', padding: isMobile ? 8 : 10, background:wT().bg, display: isMobile && activeObjId ? 'none' : 'block', flex: isMobile ? 1 : 'none' }}>
          <div style={{ ...TYPO.caption, color:wT().textMuted, textTransform:'uppercase', marginBottom:SPACING.sm, display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="target" size={11} /> マイObjective（{visibleObjs.length}件）</div>
          {visibleObjs.length === 0 && (
            <div style={{ fontSize:TYPO.subhead.fontSize, color:wT().textFaintest, fontStyle:'italic', padding:'10px 4px' }}>Objectiveがありません</div>
          )}
          {visibleObjs.map(obj => {
            const isActive = Number(activeObjId) === Number(obj.id)
            const level = levels.find(l=>Number(l.id)===Number(obj.level_id))
            const objKRsCount = keyResults.filter(kr=>Number(kr.objective_id)===Number(obj.id)).length
            const objKAsCount = kaReports.filter(r=>Number(r.objective_id)===Number(obj.id)).length
            const myKRs = keyResults.filter(kr=>Number(kr.objective_id)===Number(obj.id))
            const avgPct = myKRs.length > 0 ? Math.round(myKRs.reduce((s,kr)=>s+calcPct(kr.current,kr.target,kr.lower_is_better),0)/myKRs.length) : 0
            const pctColor = avgPct>=100?wT().accent:avgPct>=60?wT().success:avgPct>=30?wT().warn:wT().danger
            return (
              <div key={obj.id} onClick={()=>setActiveObjId(isActive?null:obj.id)} style={{
                padding:isActive?'12px 14px 12px 11px':'12px 14px', borderRadius:RADIUS.md, marginBottom:SPACING.sm, cursor:'pointer',
                border:`1px solid ${wT().border}`,
                borderLeft: isActive ? `3px solid ${wT().accent}` : `1px solid ${wT().border}`,
                background: isActive
                  ? `linear-gradient(120deg, ${wT().accentBg} 0%, transparent 100%)`
                  : wT().bgCard,
                boxShadow: isActive ? SHADOWS.sm : SHADOWS.xs,
                transition:'all 0.2s ease',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm, marginBottom:SPACING.sm }}>
                  <span style={{
                    ...TYPO.caption, fontWeight:700, padding:'2px 8px', borderRadius:RADIUS.xs,
                    background:wT().accentBg, color:wT().accentText,
                  }}>{periodLabel(obj.period)}</span>
                  {level && <span style={{ fontSize:TYPO.caption.fontSize, fontWeight:500, color:wT().textMuted }}><DataIcon value={level.icon} size={11}/> {level.name}</span>}
                </div>
                <div style={{ fontSize:TYPO.body.fontSize, fontWeight:700, lineHeight:1.4, marginBottom:SPACING.sm, color:wT().text, letterSpacing:'-0.01em' }}>{obj.title}</div>
                <div style={{ height:5, borderRadius:RADIUS.pill, background:wT().borderLight, overflow:'hidden', marginBottom:7 }}>
                  <div style={{
                    height:'100%', width:`${Math.min(avgPct,100)}%`,
                    background:`linear-gradient(90deg, ${pctColor} 0%, ${pctColor}cc 100%)`,
                    borderRadius:RADIUS.pill, transition:'width 0.4s',
                  }} />
                </div>
                <div style={{ display:'flex', gap:SPACING.sm, fontSize:TYPO.caption.fontSize, color:wT().textMuted, alignItems:'center' }}>
                  <span style={{ color:pctColor, fontWeight:800, fontSize:TYPO.subhead.fontSize }}>{avgPct}%</span>
                  <span style={{ padding:'1px 7px', borderRadius:RADIUS.pill, background:wT().borderLight, fontWeight:700 }}>KR {objKRsCount}</span>
                  <span style={{ padding:'1px 7px', borderRadius:RADIUS.pill, background: objKAsCount>0?wT().accentBg:wT().borderLight, color:objKAsCount>0?wT().accent:wT().textFaint, fontWeight:700 }}>KA {objKAsCount}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 右：KR + KA詳細 */}
        <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '10px' : '14px 16px', background:wT().bgCard2, display: isMobile && !activeObjId ? 'none' : 'block' }}>
          {isMobile && activeObjId && (
            <button onClick={() => setActiveObjId(null)} style={{ marginBottom: SPACING.sm, padding: '6px 12px', borderRadius: RADIUS.xs, border: `1px solid ${wT().border}`, background: 'transparent', color: wT().textSub, fontSize: TYPO.subhead.fontSize, cursor: 'pointer', fontFamily: 'inherit', display:'inline-flex', alignItems:'center', gap:4 }}><Icon name="chevronL" size={12} /> Objective一覧に戻る</button>
          )}
          {!selectedObj ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:SPACING.sm+2, color:wT().textFaint }}>
              <Icon name="target" size={36} stroke={1.4} />
              <div style={{ fontSize:TYPO.subhead.fontSize }}>{isMobile ? 'Objectiveを選択' : '左のObjectiveをクリックしてください'}</div>
            </div>
          ) : (
            <>
              {(() => {
                return (
                  <div style={{
                    position:'relative', overflow:'hidden',
                    padding:'14px 18px',
                    background:`linear-gradient(120deg, ${wT().successBg}, rgba(34,211,238,.05))`,
                    border:`1px solid ${wT().border}`,
                    borderRadius:RADIUS.lg, marginBottom:SPACING.lg,
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:SPACING.sm, marginBottom:SPACING.xs }}>
                      <span style={{ ...TYPO.caption, fontWeight:700, padding:'2px 8px', borderRadius:RADIUS.pill, background:wT().successBg, color:wT().success }}>{periodLabel(selectedObj.period)}</span>
                      <span style={{ ...TYPO.caption, color:wT().success, letterSpacing:'0.06em', textTransform:'uppercase', fontWeight:700 }}>Objective</span>
                    </div>
                    <div style={{ ...TYPO.title3, fontWeight:700, color:wT().text, lineHeight:1.4 }}>{selectedObj.title}</div>
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
                    const msg = `${viewName}さんの今週のOKR進捗についてフィードバックをください。\n\nObjective: ${selectedObj.title}\n\n${krSummary}${kaSummary ? '\n\nKA一覧:\n' + kaSummary : ''}\n\n良かった点・改善点・来週へのアドバイス・励ましの言葉を日本語で簡潔にお願いします。`
                    onAIFeedback(msg)
                  }} style={{ display:'flex', alignItems:'center', gap:SPACING.sm+2, width:'100%', padding:'12px 14px', borderRadius:RADIUS.md, border:'1px solid rgba(37,99,235,.18)', background:'linear-gradient(135deg, rgba(37,99,235,.06), rgba(34,211,238,.06))', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='linear-gradient(135deg, rgba(37,99,235,.11), rgba(34,211,238,.11))'}
                    onMouseLeave={e=>e.currentTarget.style.background='linear-gradient(135deg, rgba(37,99,235,.06), rgba(34,211,238,.06))'}>
                    <div style={{ width:28, height:28, borderRadius:RADIUS.sm, background:'linear-gradient(135deg, #3b82f6, #1e3a8a)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', flexShrink:0, boxShadow:'0 2px 6px rgba(30,58,138,.24)' }}><Icon name="sparkle" size={16} /></div>
                    <div style={{ textAlign:'left' }}>
                      <div style={{ ...TYPO.subhead, fontWeight:700, color:wT().accentText }}>AIコーチにフィードバックをもらう</div>
                      <div style={{ fontSize:TYPO.caption.fontSize, fontWeight:500, color:wT().textSub, marginTop:1 }}>現在のKR・KA状況をもとにアドバイスをもらえます</div>
                    </div>
                    <span style={{ marginLeft:'auto', color:wT().accentText, display:'inline-flex', alignItems:'center' }}><Icon name="arrowRight" size={12} /></span>
                  </button>
                </div>
              )}

              {objKRs.length > 0 && (
                <div style={{ marginBottom:SPACING.lg }}>
                  <div style={{ ...TYPO.caption, color:wT().textMuted, textTransform:'uppercase', marginBottom:SPACING.sm, display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="target" size={11} /> Key Results（{objKRs.length}件）</div>
                  {objKRs.map(kr => {
                    const krKAs = objKAs.filter(r => Number(r.kr_id) === Number(kr.id))
                    return (
                      <div key={kr.id} style={{ marginBottom:SPACING.lg }}>
                        <KRCard kr={kr} myName={myName} members={members} wT={wT} currentWeek={selectedWeek} onKRUpdated={() => {
                          // KR更新後にデータをリロード
                          supabase.from('key_results').select('*').eq('objective_id', activeObjId).then(({ data }) => {
                            if (data) setKeyResults(prev => {
                              const otherKRs = prev.filter(k => Number(k.objective_id) !== Number(activeObjId))
                              return [...otherKRs, ...data]
                            })
                          })
                        }} />
                        <div style={{ marginLeft:SPACING.md, borderLeft:`2px solid ${wT().border}`, paddingLeft:SPACING.sm+2, marginTop:SPACING.xs }}>
                          {krKAs.length > 0 && (
                            <>
                              <div style={{ fontSize:TYPO.caption.fontSize, color:wT().textMuted, fontWeight:600, marginBottom:SPACING.xs, display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="workspace" size={11} /> KA（{krKAs.length}件）</div>
                              <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto' }}>
                                <KATableHeader wT={wT} />
                                <tbody>
                                  {krKAs.map(r => (
                                    <MyKARow key={r.id} report={r} onSave={handleKASave} onDelete={handleKADelete} wT={wT} members={members} myName={myName} objectiveTitle={selectedObj?.title} />
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                          <div onClick={() => handleKAAdd(kr)} style={{
                            display:'inline-flex', alignItems:'center', gap:SPACING.xs, padding:'4px 8px', cursor:'pointer',
                            color:wT().accentText, fontSize:TYPO.footnote.fontSize, fontWeight:600,
                            border:`1px dashed ${wT().borderMid}`, borderRadius:RADIUS.xs,
                            marginTop: krKAs.length > 0 ? SPACING.sm : SPACING.xs,
                          }}>
                            <Icon name="plus" size={13} /> このKRにKAを追加
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {objKRs.length === 0 && (
                <div style={{ fontSize:TYPO.subhead.fontSize, color:wT().textFaint, fontStyle:'italic', padding:'10px 4px', marginBottom:SPACING.md }}>このObjectiveにKRがありません</div>
              )}

              {(() => {
                const krIds = new Set(objKRs.map(kr => Number(kr.id)))
                const unlinkedKAs = objKAs.filter(r => !r.kr_id || !krIds.has(Number(r.kr_id)))
                if (unlinkedKAs.length === 0) return null
                return (
                  <div>
                    <div style={{ ...TYPO.caption, color:wT().textMuted, textTransform:'uppercase', marginBottom:SPACING.sm, display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="workspace" size={11} /> その他のKA（{unlinkedKAs.length}件）</div>
                    <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto' }}>
                      <KATableHeader wT={wT} />
                      <tbody>
                        {unlinkedKAs.map(r => (
                          <MyKARow key={r.id} report={r} onSave={handleKASave} onDelete={handleKADelete} wT={wT} members={members} myName={myName} objectiveTitle={selectedObj?.title} />
                        ))}
                      </tbody>
                    </table>
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

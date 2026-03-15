'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const DARK_T = {
  bg:'#090d18', bgCard:'#0e1420', bgCard2:'#111828', bgSidebar:'#0e1420',
  border:'rgba(255,255,255,0.07)', borderLight:'rgba(255,255,255,0.04)',
  borderMid:'rgba(255,255,255,0.1)', text:'#e8eaf0', textSub:'#a0a8be',
  textMuted:'#606880', textFaint:'#404660', textFaintest:'#303450', headerBg:'#090d18',
}
const LIGHT_T = {
  bg:'#f0f2f7', bgCard:'#ffffff', bgCard2:'#f7f8fc', bgSidebar:'#ffffff',
  border:'rgba(0,0,0,0.08)', borderLight:'rgba(0,0,0,0.05)',
  borderMid:'rgba(0,0,0,0.12)', text:'#1a1f36', textSub:'#4a5270',
  textMuted:'#7080a0', textFaint:'#90a0bc', textFaintest:'#b0bcd0', headerBg:'#ffffff',
}
const W_THEMES = { dark: DARK_T, light: LIGHT_T }

function getMondayOf(date) {
  const d = new Date(date); const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return d.toISOString().split('T')[0]
}
function formatWeekLabel(w) { const d = new Date(w); return `${d.getMonth()+1}/${d.getDate()}` }
function getPastWeeks(n=10) {
  const weeks=[],today=new Date()
  for(let i=0;i<n;i++){const d=new Date(today);d.setDate(d.getDate()-i*7);weeks.push(getMondayOf(d))}
  return [...new Set(weeks)].sort((a,b)=>b.localeCompare(a))
}
function getDepth(levelId,levels){
  let d=0,cur=levels.find(l=>Number(l.id)===Number(levelId))
  while(cur&&cur.parent_id){d++;cur=levels.find(l=>Number(l.id)===Number(cur.parent_id))}
  return d
}
const AVATAR_COLORS=['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#54a0ff','#5f27cd']
function avatarColor(name){
  if(!name)return'#606880';let h=0
  for(let i=0;i<name.length;i++)h=name.charCodeAt(i)+((h<<5)-h)
  return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]
}
const LAYER_COLORS={0:'#ff6b6b',1:'#4d9fff',2:'#00d68f',3:'#ffd166'}
const STATUS_CFG={
  focus:{label:'🎯 注力',color:'#4d9fff',bg:'rgba(77,159,255,0.12)',border:'rgba(77,159,255,0.3)'},
  good:{label:'✅ Good',color:'#00d68f',bg:'rgba(0,214,143,0.1)',border:'rgba(0,214,143,0.3)'},
  more:{label:'🔺 More',color:'#ff6b6b',bg:'rgba(255,107,107,0.1)',border:'rgba(255,107,107,0.3)'},
  normal:{label:'未分類',color:'#606880',bg:'rgba(255,255,255,0.04)',border:'rgba(255,255,255,0.1)'},
}
const STATUS_ORDER=['normal','focus','good','more']
function getPeriodLabel(p){
  if(!p)return'';const b=p.includes('_')?p.split('_').pop():p
  return{annual:'通期',q1:'Q1',q2:'Q2',q3:'Q3',q4:'Q4'}[b]||p
}

function Avatar({name,avatarUrl,size=22}){
  if(!name)return null;const color=avatarColor(name)
  if(avatarUrl)return <img src={avatarUrl} alt={name} title={name} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0,border:`1.5px solid ${color}60`}}/>
  return <div title={name} style={{width:size,height:size,borderRadius:'50%',background:`${color}25`,border:`1.5px solid ${color}60`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.36,fontWeight:700,color,flexShrink:0}}>{name.slice(0,2)}</div>
}

function KACard({report,onSave,onDelete,members,wT,canEdit}){
  const[open,setOpen]=useState(false)
  const[good,setGood]=useState(report.good||'')
  const[more,setMore]=useState(report.more||'')
  const[focusOutput,setFocusOutput]=useState(report.focus_output||'')
  const[status,setStatus]=useState(report.status||'normal')
  const[saving,setSaving]=useState(false)
  const[saved,setSaved]=useState(false)
  const[tasks,setTasks]=useState([])
  const[tasksLoaded,setTasksLoaded]=useState(false)
  const[editingTitle,setEditingTitle]=useState(false)
  const[kaTitle,setKaTitle]=useState(report.ka_title||'')
  const[titleSaving,setTitleSaving]=useState(false)

  const cfg=STATUS_CFG[status]||STATUS_CFG.normal
  const ownerMember=members?.find(m=>m.name===report.owner)

  useEffect(()=>{
    if(!open||tasksLoaded)return
    supabase.from('ka_tasks').select('*').eq('report_id',report.id).order('id').then(({data})=>{setTasks(data||[]);setTasksLoaded(true)})
  },[open])

  const addTask=()=>setTasks(p=>[...p,{_tmp:Date.now(),title:'',assignee:'',due_date:'',done:false,report_id:report.id}])
  const updateTask=(key,field,val)=>setTasks(p=>p.map(t=>(t.id||t._tmp)===key?{...t,[field]:val}:t))
  const removeTask=async(key)=>{const task=tasks.find(t=>(t.id||t._tmp)===key);if(task?.id)await supabase.from('ka_tasks').delete().eq('id',task.id);setTasks(p=>p.filter(t=>(t.id||t._tmp)!==key))}
  const toggleDone=async(key)=>{const task=tasks.find(t=>(t.id||t._tmp)===key);const nd=!task.done;if(task?.id)await supabase.from('ka_tasks').update({done:nd}).eq('id',task.id);setTasks(p=>p.map(t=>(t.id||t._tmp)===key?{...t,done:nd}:t))}
  const cycleStatus=(e)=>{e.stopPropagation();const idx=STATUS_ORDER.indexOf(status);setStatus(STATUS_ORDER[(idx+1)%STATUS_ORDER.length])}

  const saveTitleInline=async()=>{
    if(!kaTitle.trim()||kaTitle===report.ka_title){setEditingTitle(false);return}
    setTitleSaving(true)
    await supabase.from('weekly_reports').update({ka_title:kaTitle.trim()}).eq('id',report.id)
    setTitleSaving(false);setEditingTitle(false)
    onSave({...report,ka_title:kaTitle.trim(),good,more,focus_output:focusOutput,status})
  }

  const save=async(e)=>{
    e&&e.stopPropagation();setSaving(true)
    await supabase.from('weekly_reports').update({good,more,focus_output:focusOutput,status}).eq('id',report.id)
    for(const t of tasks){
      const data={title:t.title||'',assignee:t.assignee||null,due_date:t.due_date||null,done:t.done,report_id:report.id}
      if(t.id){await supabase.from('ka_tasks').update(data).eq('id',t.id)}
      else if(t.title?.trim()){const{data:ins}=await supabase.from('ka_tasks').insert([data]).select().single();if(ins)setTasks(p=>p.map(tk=>tk._tmp===t._tmp?ins:tk))}
    }
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),1500)
    onSave({...report,ka_title:kaTitle,good,more,focus_output:focusOutput,status})
  }

  const taS={width:'100%',boxSizing:'border-box',background:wT().borderLight,border:`1px solid ${wT().border}`,borderRadius:7,padding:'7px 9px',color:wT().text,fontSize:12,outline:'none',fontFamily:'inherit',resize:'none',lineHeight:1.55}
  const fl=(c,b)=>({fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:5,display:'inline-flex',alignItems:'center',gap:4,marginBottom:3,color:c,background:b})
  const done=tasks.filter(t=>t.done).length

  return(
    <div onClick={()=>!open&&setOpen(true)} style={{background:wT().bgCard,border:`1px solid ${open?'#4d9fff50':wT().border}`,borderRadius:10,marginBottom:8,overflow:'hidden',cursor:open?'default':'pointer',transition:'border-color 0.15s'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px'}} onClick={()=>setOpen(p=>!p)}>
        <Avatar name={report.owner} avatarUrl={ownerMember?.avatar_url} size={24}/>
        <div style={{flex:1,minWidth:0}} onClick={e=>e.stopPropagation()}>
          {editingTitle?(
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <input autoFocus value={kaTitle} onChange={e=>setKaTitle(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')saveTitleInline();if(e.key==='Escape'){setKaTitle(report.ka_title);setEditingTitle(false)}}}
                style={{flex:1,background:wT().bgCard2,border:'1px solid #4d9fff80',borderRadius:6,padding:'4px 8px',color:wT().text,fontSize:13,fontWeight:600,outline:'none',fontFamily:'inherit'}}/>
              <button onClick={saveTitleInline} disabled={titleSaving} style={{padding:'3px 10px',borderRadius:5,background:'#4d9fff',border:'none',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',flexShrink:0}}>{titleSaving?'…':'✓'}</button>
              <button onClick={()=>{setKaTitle(report.ka_title);setEditingTitle(false)}} style={{padding:'3px 8px',borderRadius:5,background:'transparent',border:`1px solid ${wT().borderMid}`,color:wT().textMuted,fontSize:11,cursor:'pointer',flexShrink:0}}>✕</button>
            </div>
          ):(
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:13,fontWeight:600,color:wT().text,lineHeight:1.3}}>{kaTitle}</span>
              {canEdit&&(
                <button onClick={e=>{e.stopPropagation();setEditingTitle(true)}} title="KAタイトルを編集"
                  style={{width:18,height:18,borderRadius:4,border:`1px solid ${wT().borderMid}`,background:wT().bgCard2,color:wT().textMuted,cursor:'pointer',fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,opacity:0.7}}
                  onMouseEnter={e=>{e.currentTarget.style.opacity='1';e.currentTarget.style.borderColor='#4d9fff';e.currentTarget.style.color='#4d9fff'}}
                  onMouseLeave={e=>{e.currentTarget.style.opacity='0.7';e.currentTarget.style.borderColor=wT().borderMid;e.currentTarget.style.color=wT().textMuted}}>✎</button>
              )}
            </div>
          )}
          {report.kr_title&&<div style={{fontSize:10,color:'#4d9fff',background:'rgba(77,159,255,0.08)',border:'1px solid rgba(77,159,255,0.2)',borderRadius:4,padding:'1px 6px',display:'inline-block',marginTop:3,maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>📊 {report.kr_title}</div>}
        </div>
        <span onClick={cycleStatus} style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:99,cursor:'pointer',flexShrink:0,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,whiteSpace:'nowrap'}}>{cfg.label}</span>
        {report.owner&&<span style={{fontSize:11,color:avatarColor(report.owner),fontWeight:600,flexShrink:0}}>{report.owner}</span>}
        <button onClick={e=>{e.stopPropagation();onDelete(report.id)}} style={{width:22,height:22,borderRadius:4,border:'none',cursor:'pointer',fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(255,107,107,0.08)',color:'#ff6b6b',flexShrink:0}}>✕</button>
        <span style={{color:wT().textFaint,fontSize:11,transform:open?'rotate(180deg)':'rotate(0deg)',transition:'transform 0.2s',display:'inline-block',flexShrink:0}}>▾</span>
      </div>
      {!open&&(good||more)&&(
        <div style={{display:'flex',gap:10,padding:'0 12px 8px 44px',flexWrap:'wrap'}}>
          {good&&<div style={{display:'flex',alignItems:'flex-start',gap:4,fontSize:11,color:wT().textSub,lineHeight:1.4,maxWidth:280}}><span style={{color:'#00d68f',fontWeight:700,fontSize:10,flexShrink:0,marginTop:1}}>✅</span><span>{good.slice(0,60)}{good.length>60?'…':''}</span></div>}
          {more&&<div style={{display:'flex',alignItems:'flex-start',gap:4,fontSize:11,color:wT().textSub,lineHeight:1.4,maxWidth:280}}><span style={{color:'#ff6b6b',fontWeight:700,fontSize:10,flexShrink:0,marginTop:1}}>🔺</span><span>{more.slice(0,60)}{more.length>60?'…':''}</span></div>}
        </div>
      )}
      {open&&(
        <div style={{padding:'0 12px 12px'}} onClick={e=>e.stopPropagation()}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8,minWidth:0}}>
            <div><div style={fl('#00d68f','rgba(0,214,143,0.1)')}>✅ Good</div><textarea value={good} onChange={e=>setGood(e.target.value)} rows={3} placeholder="うまくいったこと" style={taS}/></div>
            <div><div style={fl('#ff6b6b','rgba(255,107,107,0.1)')}>🔺 More</div><textarea value={more} onChange={e=>setMore(e.target.value)} rows={3} placeholder="課題・改善点" style={taS}/></div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 0',marginBottom:8}}>
            <div style={{flex:1,height:1,background:wT().border}}/><span style={{fontSize:10,color:wT().textMuted,whiteSpace:'nowrap'}}>↓ Moreへの対応</span><div style={{flex:1,height:1,background:wT().border}}/>
          </div>
          <div style={{marginBottom:10}}>
            <div style={fl('#4d9fff','rgba(77,159,255,0.1)')}>🎯 注力アクション</div>
            <textarea value={focusOutput} onChange={e=>setFocusOutput(e.target.value)} rows={2} placeholder="Moreに対してどう動くか" style={taS}/>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{...fl('#a855f7','rgba(168,85,247,0.1)'),marginBottom:6}}>📋 タスク {done}/{tasks.length}</div>
            {tasks.map(t=>{
              const key=t.id||t._tmp;const tc=avatarColor(t.assignee)
              return(
                <div key={key} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:7,marginBottom:4,background:t.done?wT().borderLight:wT().bgCard,border:`1px solid ${t.done?wT().border:wT().borderMid}`,opacity:t.done?0.6:1}}>
                  <div onClick={()=>toggleDone(key)} style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${t.done?'#00d68f':wT().borderMid}`,background:t.done?'#00d68f':'transparent',cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>{t.done&&<span style={{fontSize:9,color:'#fff',fontWeight:700}}>✓</span>}</div>
                  <input value={t.title} onChange={e=>updateTask(key,'title',e.target.value)} placeholder="タスク内容" style={{flex:1,background:'transparent',border:'none',color:t.done?wT().textMuted:wT().text,fontSize:12,outline:'none',fontFamily:'inherit',textDecoration:t.done?'line-through':'none'}}/>
                  <select value={t.assignee||''} onChange={e=>updateTask(key,'assignee',e.target.value)} style={{background:wT().bgCard2,border:`1px solid ${wT().border}`,borderRadius:5,padding:'2px 6px',color:t.assignee?tc:wT().textMuted,fontSize:11,cursor:'pointer',fontFamily:'inherit',outline:'none',flexShrink:0,maxWidth:80}}>
                    <option value="">担当者</option>
                    {members.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  <input type="date" value={t.due_date||''} onChange={e=>updateTask(key,'due_date',e.target.value)} style={{background:wT().bgCard2,border:`1px solid ${wT().border}`,borderRadius:5,padding:'2px 6px',color:t.due_date?wT().text:wT().textMuted,fontSize:11,outline:'none',fontFamily:'inherit',flexShrink:0,maxWidth:110}}/>
                  <button onClick={()=>removeTask(key)} style={{width:18,height:18,borderRadius:3,border:'none',background:'transparent',color:wT().textFaint,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>✕</button>
                </div>
              )
            })}
            <div onClick={addTask} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:7,border:`1px dashed ${wT().borderMid}`,cursor:'pointer',color:wT().textMuted,fontSize:11,marginTop:2}}>
              <span style={{fontSize:14,lineHeight:1}}>+</span> タスクを追加
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:8,borderTop:`1px solid ${wT().border}`}}>
            <span style={{fontSize:10,color:wT().textFaintest,marginRight:'auto'}}>💾 Tabキーで次のフィールドへ</span>
            <button onClick={()=>setOpen(false)} style={{padding:'5px 12px',borderRadius:6,background:'transparent',border:`1px solid ${wT().borderMid}`,color:wT().textSub,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>閉じる</button>
            <button onClick={save} disabled={saving} style={{padding:'5px 16px',borderRadius:6,background:saved?'#00d68f':'#4d9fff',border:'none',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'background 0.3s'}}>
              {saved?'✓ 保存済み':saving?'保存中...':'保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function KRBlock({kr,reports,onAddKA,onSaveKA,onDeleteKA,members,objectives,wT,weekStart,levelId,objId,canEditKA}){
  const krReports=reports.filter(r=>Number(r.kr_id)===Number(kr.id))
  const pct=kr.target?Math.min(Math.round((kr.current/kr.target)*100),150):0
  const pctColor=pct>=100?'#00d68f':pct>=60?'#4d9fff':'#ff6b6b'
  const krStars=(()=>{if(pct>=130)return 5;if(pct>=110)return 4;if(pct>=100)return 3;if(pct>=80)return 2;if(pct>=60)return 1;return 0})()
  const[review,setReview]=useState(null)
  const[weather,setWeather]=useState(0)
  const[good,setGood]=useState('')
  const[more,setMore]=useState('')
  const[focus,setFocus]=useState('')
  const[reviewOpen,setReviewOpen]=useState(false)
  const[reviewSaving,setReviewSaving]=useState(false)
  const[reviewSaved,setReviewSaved]=useState(false)

  const WEATHER_CFG=[
    {score:0,icon:'—',label:'未選択',color:'#606880',bg:'rgba(255,255,255,0.05)'},
    {score:1,icon:'⛈',label:'嵐',color:'#8090b0',bg:'rgba(128,144,176,0.12)'},
    {score:2,icon:'🌧',label:'雨',color:'#4d9fff',bg:'rgba(77,159,255,0.12)'},
    {score:3,icon:'☁️',label:'曇り',color:'#a0a8be',bg:'rgba(160,168,190,0.12)'},
    {score:4,icon:'🌤',label:'晴れのち曇り',color:'#ffd166',bg:'rgba(255,209,102,0.15)'},
    {score:5,icon:'☀️',label:'快晴',color:'#ff9f43',bg:'rgba(255,159,67,0.12)'},
  ]

  useEffect(()=>{
    supabase.from('kr_weekly_reviews').select('*').eq('kr_id',kr.id).eq('week_start',weekStart).maybeSingle()
      .then(({data})=>{if(data){setReview(data);setWeather(data.weather||0);setGood(data.good||'');setMore(data.more||'');setFocus(data.focus||'')}})
  },[kr.id,weekStart])

  const saveReview=async()=>{
    setReviewSaving(true)
    const payload={kr_id:kr.id,week_start:weekStart,weather,good,more,focus,updated_at:new Date().toISOString()}
    if(review?.id){await supabase.from('kr_weekly_reviews').update(payload).eq('id',review.id)}
    else{const{data}=await supabase.from('kr_weekly_reviews').insert([payload]).select().single();if(data)setReview(data)}
    setReviewSaving(false);setReviewSaved(true);setTimeout(()=>setReviewSaved(false),1500)
  }

  const addKA=async()=>{
    await supabase.from('weekly_reports').insert([{week_start:weekStart,level_id:levelId,objective_id:objId,kr_id:kr.id,kr_title:kr.title,ka_title:'新しいKA',status:'normal'}])
    onAddKA()
  }

  const taS={width:'100%',boxSizing:'border-box',background:wT().borderLight,border:`1px solid ${wT().border}`,borderRadius:7,padding:'7px 9px',color:wT().text,fontSize:12,outline:'none',fontFamily:'inherit',resize:'none',lineHeight:1.55}
  const hasReview=weather>0||good||more||focus
  const krOwnerMember=members?.find(m=>m.name===kr.owner)

  return(
    <div style={{marginBottom:20,border:`1px solid ${wT().border}`,borderRadius:10,overflow:'hidden'}}>
      <div onClick={()=>setReviewOpen(p=>!p)} style={{padding:'10px 14px',background:wT().bgCard,borderLeft:`4px solid ${pctColor}`,cursor:'pointer',userSelect:'none'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
          <div style={{fontSize:11,fontWeight:700,color:pctColor,background:`${pctColor}15`,padding:'2px 7px',borderRadius:4,flexShrink:0}}>{pct}%</div>
          <span style={{fontSize:13,fontWeight:600,color:wT().text,lineHeight:1.4,flex:1}}>{kr.title}</span>
          <span style={{fontSize:11,color:wT().textMuted,flexShrink:0}}>{kr.current}{kr.unit} / {kr.target}{kr.unit}</span>
          {kr.owner&&<Avatar name={kr.owner} avatarUrl={krOwnerMember?.avatar_url} size={20}/>}
          <span style={{fontSize:13,letterSpacing:1,flexShrink:0}}>{'★'.repeat(krStars)}{'☆'.repeat(5-krStars)}</span>
          {!reviewOpen&&weather>0&&<span style={{fontSize:18,lineHeight:1}}>{WEATHER_CFG[weather]?.icon}</span>}
          <span style={{fontSize:11,color:wT().textFaint,transform:reviewOpen?'rotate(180deg)':'rotate(0)',transition:'transform 0.2s',display:'inline-block',flexShrink:0}}>▾</span>
        </div>
        <div style={{height:4,borderRadius:2,background:wT().borderLight,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${Math.min(pct,100)}%`,background:pctColor,borderRadius:2}}/>
        </div>
        {!reviewOpen&&hasReview&&(
          <div style={{display:'flex',gap:12,marginTop:6,flexWrap:'wrap'}}>
            {good&&<div style={{fontSize:11,color:wT().textSub,display:'flex',gap:4}}><span style={{color:'#00d68f',fontWeight:700,fontSize:10}}>✅</span><span>{good.slice(0,50)}{good.length>50?'…':''}</span></div>}
            {more&&<div style={{fontSize:11,color:wT().textSub,display:'flex',gap:4}}><span style={{color:'#ff6b6b',fontWeight:700,fontSize:10}}>🔺</span><span>{more.slice(0,50)}{more.length>50?'…':''}</span></div>}
          </div>
        )}
      </div>

      {reviewOpen&&(
        <div style={{padding:'12px 14px',background:wT().bgCard2,borderBottom:`1px solid ${wT().border}`}} onClick={e=>e.stopPropagation()}>
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:16,marginBottom:14,padding:'10px 12px',background:wT().bgCard,borderRadius:8,border:`1px solid ${wT().border}`}}>
            <div style={{borderRight:`1px solid ${wT().border}`,paddingRight:16}}>
              <div style={{fontSize:10,color:wT().textMuted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>KR達成評価（自動）</div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{fontSize:22,letterSpacing:2}}>{'★'.repeat(krStars)}<span style={{color:wT().borderMid,fontSize:22}}>{'★'.repeat(5-krStars)}</span></div>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:pctColor}}>{['60%未満','60%台','80%台','100%達成','110%超','130%以上'][krStars]}</div>
                  <div style={{fontSize:10,color:wT().textMuted}}>達成率 {pct}%</div>
                </div>
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:wT().textMuted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>今週の体感・主観</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {WEATHER_CFG.slice(1).map(w=>{
                  const isActive=w.score===weather
                  return(
                    <div key={w.score} onClick={()=>setWeather(isActive?0:w.score)}
                      style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:8,cursor:'pointer',transition:'all 0.15s',userSelect:'none',background:isActive?w.bg:'transparent',border:`1px solid ${isActive?w.color+'70':wT().borderMid}`,transform:isActive?'scale(1.06)':'scale(1)'}}>
                      <span style={{fontSize:20,lineHeight:1}}>{w.icon}</span>
                      <span style={{fontSize:11,fontWeight:isActive?700:500,color:isActive?w.color:wT().textMuted}}>{w.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8,minWidth:0}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:10,fontWeight:700,color:'#00d68f',background:'rgba(0,214,143,0.1)',padding:'3px 8px',borderRadius:5,marginBottom:4,display:'inline-block'}}>✅ Good — うまくいったこと</div>
              <textarea value={good} onChange={e=>setGood(e.target.value)} rows={3} placeholder="進んでいること・良かったこと" style={taS} onFocus={e=>e.target.style.borderColor='rgba(0,214,143,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:10,fontWeight:700,color:'#ff6b6b',background:'rgba(255,107,107,0.1)',padding:'3px 8px',borderRadius:5,marginBottom:4,display:'inline-block'}}>🔺 More — 課題・改善点</div>
              <textarea value={more} onChange={e=>setMore(e.target.value)} rows={3} placeholder="うまくいっていないこと・課題" style={taS} onFocus={e=>e.target.style.borderColor='rgba(255,107,107,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
            <div style={{flex:1,height:1,background:wT().border}}/><span style={{fontSize:10,color:wT().textMuted}}>↓ Moreへの対応</span><div style={{flex:1,height:1,background:wT().border}}/>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:'#4d9fff',background:'rgba(77,159,255,0.1)',padding:'3px 8px',borderRadius:5,marginBottom:4,display:'inline-block'}}>🎯 今週の注力アクション</div>
            <textarea value={focus} onChange={e=>setFocus(e.target.value)} rows={2} placeholder="Moreに対してどう動くか" style={taS} onFocus={e=>e.target.style.borderColor='rgba(77,159,255,0.4)'} onBlur={e=>e.target.style.borderColor=wT().border}/>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
            <button onClick={()=>setReviewOpen(false)} style={{padding:'5px 12px',borderRadius:6,background:'transparent',border:`1px solid ${wT().borderMid}`,color:wT().textSub,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>閉じる</button>
            <button onClick={saveReview} disabled={reviewSaving} style={{padding:'5px 16px',borderRadius:6,background:reviewSaved?'#00d68f':'#4d9fff',border:'none',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'background 0.3s'}}>
              {reviewSaved?'✓ 保存済み':reviewSaving?'保存中...':'保存'}
            </button>
          </div>
        </div>
      )}

      <div style={{padding:'10px 12px',background:wT().bgCard2}}>
        <div style={{fontSize:10,color:wT().textMuted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>📋 KA一覧</div>
        {krReports.map(r=>(
          <KACard key={r.id} report={r} onSave={onSaveKA} onDelete={onDeleteKA} members={members} wT={wT} canEdit={canEditKA(r.owner)}/>
        ))}
        <div onClick={addKA} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:7,border:`1px dashed ${wT().borderMid}`,cursor:'pointer',color:wT().textMuted,fontSize:11,marginTop:4}}>
          <span style={{fontSize:14,lineHeight:1}}>+</span> このKRにKAを追加
        </div>
      </div>
    </div>
  )
}

export default function WeeklyMTGPage({levels,themeKey='dark',fiscalYear='2026',user}){
  const wT=()=>W_THEMES[themeKey]||W_THEMES.dark
  const weeks=getPastWeeks(10)
  const[weekIdx,setWeekIdx]=useState(0)
  const[reports,setReports]=useState([])
  const[objectives,setObjectives]=useState([])
  const[keyResults,setKeyResults]=useState([])
  const[members,setMembers]=useState([])
  const[loading,setLoading]=useState(false)
  const[activeLevelId,setActiveLevelId]=useState(null)
  const[activeObjId,setActiveObjId]=useState(null)
  const[activePeriod,setActivePeriod]=useState('all')
  const currentWeek=weeks[weekIdx]

  useEffect(()=>{
    supabase.from('objectives').select('id,title,level_id,period,owner').order('level_id').then(({data})=>setObjectives(data||[]))
    supabase.from('key_results').select('*').order('objective_id').then(({data})=>setKeyResults(data||[]))
    supabase.from('members').select('id,name,role,level_id,email,avatar_url').order('name').then(({data})=>setMembers(data||[]))
  },[])

  useEffect(()=>{
    if(!currentWeek)return
    setLoading(true)
    supabase.from('weekly_reports').select('*').eq('week_start',currentWeek).order('id').then(({data})=>{setReports(data||[]);setLoading(false)})
  },[currentWeek])

  const reload=async()=>{const{data}=await supabase.from('weekly_reports').select('*').eq('week_start',currentWeek).order('id');setReports(data||[])}
  const handleSave=(updated)=>setReports(p=>p.map(r=>r.id===updated.id?updated:r))
  const handleDelete=async(id)=>{if(!window.confirm('削除しますか？'))return;await supabase.from('weekly_reports').delete().eq('id',id);setReports(p=>p.filter(r=>r.id!==id))}

  const myMember=members.find(m=>m.email===user?.email)
  const myName=myMember?.name||''
  const canEditKA=useCallback((ownerName)=>!!(myName&&ownerName&&myName===ownerName),[myName])

  const visibleLevels=activeLevelId?levels.filter(l=>Number(l.id)===Number(activeLevelId)):levels
  const visibleObjs=objectives.filter(o=>{
    const levelOk=visibleLevels.some(l=>Number(l.id)===Number(o.level_id));if(!levelOk)return false
    if(activePeriod==='all')return fiscalYear==='2026'?!o.period.includes('_'):o.period.startsWith(`${fiscalYear}_`)
    const pk=fiscalYear==='2026'?activePeriod:`${fiscalYear}_${activePeriod}`;return o.period===pk
  })

  const selectedObj=activeObjId?objectives.find(o=>o.id===Number(activeObjId)):null
  const selectedObjKRs=activeObjId?keyResults.filter(kr=>Number(kr.objective_id)===Number(activeObjId)):[]
  const depth=selectedObj?getDepth(selectedObj.level_id,levels):0
  const objColor=LAYER_COLORS[depth]||'#a0a8be'
  const objOwnerMember=selectedObj?members.find(m=>m.name===selectedObj.owner):null

  const roots=levels.filter(l=>!l.parent_id)
  function renderSb(level,indent=0){
    const d=getDepth(level.id,levels);const color=LAYER_COLORS[d]||'#a0a8be';const isActive=Number(activeLevelId)===Number(level.id)
    return(
      <div key={level.id}>
        <div onClick={()=>{setActiveLevelId(isActive?null:level.id);setActiveObjId(null)}}
          style={{display:'flex',alignItems:'center',gap:6,padding:`6px 8px`,paddingLeft:8+indent*14,borderRadius:7,cursor:'pointer',marginBottom:2,border:`1px solid ${isActive?color+'40':'transparent'}`,background:isActive?`${color}18`:'transparent'}}>
          <span style={{fontSize:13}}>{level.icon}</span>
          <span style={{fontSize:11,flex:1,fontWeight:isActive?700:500,color:isActive?color:wT().textSub}}>{level.name}</span>
        </div>
        {levels.filter(l=>Number(l.parent_id)===Number(level.id)).map(c=>renderSb(c,indent+1))}
      </div>
    )
  }

  const periodTabs=[['all','すべて'],['annual','通期'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4']]

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:wT().bg,color:wT().text,fontFamily:'system-ui,sans-serif'}}>
      <div style={{padding:'11px 16px',borderBottom:`1px solid ${wT().border}`,display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap'}}>
        <div style={{fontSize:16,fontWeight:700}}>週次KA確認</div>
        <div style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:99,background:fiscalYear==='2026'?'rgba(77,159,255,0.15)':'rgba(255,159,67,0.15)',color:fiscalYear==='2026'?'#4d9fff':'#ff9f43',border:`1px solid ${fiscalYear==='2026'?'rgba(77,159,255,0.3)':'rgba(255,159,67,0.3)'}`}}>📅 {fiscalYear}年度</div>
        {myMember&&(
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'3px 8px',borderRadius:99,background:`${avatarColor(myName)}15`,border:`1px solid ${avatarColor(myName)}30`}}>
            <Avatar name={myName} avatarUrl={myMember?.avatar_url} size={18}/>
            <span style={{fontSize:11,color:avatarColor(myName),fontWeight:600}}>{myName}</span>
            <span style={{fontSize:10,color:wT().textMuted}}>としてログイン中</span>
          </div>
        )}
        <div style={{display:'flex',gap:4,alignItems:'center',marginLeft:8}}>
          {weeks.slice(0,6).map((w,i)=>(
            <button key={w} onClick={()=>setWeekIdx(i)} style={{padding:'4px 10px',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:600,background:weekIdx===i?'rgba(77,159,255,0.18)':'transparent',border:`1px solid ${weekIdx===i?'rgba(77,159,255,0.45)':wT().borderMid}`,color:weekIdx===i?'#4d9fff':wT().textSub}}>
              {formatWeekLabel(w)}{i===0?'（今週）':''}
            </button>
          ))}
        </div>
        <span style={{marginLeft:'auto',fontSize:11,color:wT().textMuted}}>{currentWeek}</span>
      </div>

      <div style={{display:'flex',gap:4,padding:'7px 16px',borderBottom:`1px solid ${wT().border}`,flexShrink:0,alignItems:'center'}}>
        <span style={{fontSize:11,color:wT().textMuted,fontWeight:700,marginRight:4}}>期間：</span>
        {periodTabs.map(([key,lbl])=>(
          <button key={key} onClick={()=>{setActivePeriod(key);setActiveObjId(null)}} style={{padding:'4px 12px',borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,background:activePeriod===key?(key==='all'?wT().borderMid:'rgba(77,159,255,0.15)'):'transparent',border:`1px solid ${activePeriod===key?(key==='all'?wT().border:'rgba(77,159,255,0.4)'):wT().borderMid}`,color:activePeriod===key?(key==='all'?wT().text:'#4d9fff'):wT().textMuted}}>{lbl}</button>
        ))}
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{width:155,flexShrink:0,borderRight:`1px solid ${wT().border}`,padding:'10px 8px',overflowY:'auto',background:wT().bgSidebar}}>
          <div style={{fontSize:10,color:wT().textMuted,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8,paddingLeft:8}}>部署</div>
          <div onClick={()=>{setActiveLevelId(null);setActiveObjId(null)}} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',borderRadius:7,cursor:'pointer',marginBottom:2,border:`1px solid ${!activeLevelId?'rgba(77,159,255,0.3)':'transparent'}`,background:!activeLevelId?'rgba(77,159,255,0.12)':'transparent'}}>
            <span>🏢</span><span style={{fontSize:11,flex:1,fontWeight:!activeLevelId?700:500,color:!activeLevelId?'#4d9fff':wT().textSub}}>全部署</span>
          </div>
          {roots.map(r=>renderSb(r,0))}
        </div>

        <div style={{width:260,flexShrink:0,borderRight:`1px solid ${wT().border}`,overflowY:'auto',padding:10,background:wT().bg}}>
          <div style={{fontSize:10,color:'#4d9fff',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>🎯 Objective（{visibleObjs.length}件）</div>
          {visibleObjs.length===0&&<div style={{fontSize:12,color:wT().textFaintest,fontStyle:'italic',padding:'10px 4px'}}>Objectiveがありません</div>}
          {visibleObjs.map(obj=>{
            const isActive=Number(activeObjId)===Number(obj.id)
            const d=getDepth(obj.level_id,levels);const color=LAYER_COLORS[d]||'#a0a8be'
            const level=levels.find(l=>Number(l.id)===Number(obj.level_id))
            const krCount=keyResults.filter(kr=>Number(kr.objective_id)===Number(obj.id)).length
            const kaCount=reports.filter(r=>Number(r.objective_id)===Number(obj.id)).length
            const ownerMember=members.find(m=>m.name===obj.owner)
            return(
              <div key={obj.id} onClick={()=>setActiveObjId(isActive?null:obj.id)}
                style={{padding:'10px 12px',borderRadius:9,marginBottom:7,cursor:'pointer',border:`1px solid ${isActive?color+'60':wT().border}`,background:isActive?`${color}10`:wT().bgCard,transition:'all 0.12s'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:99,background:`${color}18`,color}}>{getPeriodLabel(obj.period)}</span>
                  {level&&<span style={{fontSize:10,color:wT().textMuted}}>{level.icon} {level.name}</span>}
                  {obj.owner&&<div style={{marginLeft:'auto'}}><Avatar name={obj.owner} avatarUrl={ownerMember?.avatar_url} size={18}/></div>}
                </div>
                <div style={{fontSize:12,fontWeight:600,lineHeight:1.4,marginBottom:6,color:isActive?wT().text:wT().textSub}}>{obj.title}</div>
                <div style={{display:'flex',gap:8,fontSize:10,color:wT().textMuted}}>
                  <span>KR {krCount}件</span>
                  <span style={{color:kaCount>0?'#4d9fff':wT().textFaint}}>KA {kaCount}件</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'14px 16px',background:wT().bgCard2}}>
          {!selectedObj?(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',flexDirection:'column',gap:10,color:wT().textFaint}}>
              <div style={{fontSize:36}}>🎯</div>
              <div style={{fontSize:13}}>左のObjectiveをクリックしてください</div>
            </div>
          ):(
            <>
              <div style={{padding:'12px 14px',background:`${objColor}0e`,border:`1px solid ${objColor}30`,borderLeft:`4px solid ${objColor}`,borderRadius:10,marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99,background:`${objColor}20`,color:objColor}}>{getPeriodLabel(selectedObj.period)}</span>
                  <span style={{fontSize:10,color:wT().textMuted}}>Objective</span>
                  {selectedObj.owner&&(
                    <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
                      <Avatar name={selectedObj.owner} avatarUrl={objOwnerMember?.avatar_url} size={22}/>
                      <span style={{fontSize:12,color:avatarColor(selectedObj.owner),fontWeight:600}}>{selectedObj.owner}</span>
                    </div>
                  )}
                </div>
                <div style={{fontSize:14,fontWeight:700,color:wT().text,lineHeight:1.5}}>{selectedObj.title}</div>
              </div>
              {selectedObjKRs.length===0&&<div style={{textAlign:'center',padding:30,color:wT().textFaint,fontSize:12}}>KRが登録されていません。OKRページからKRを追加してください。</div>}
              {loading&&<div style={{textAlign:'center',padding:20,color:'#4d9fff',fontSize:13}}>読み込み中...</div>}
              {!loading&&selectedObjKRs.map(kr=>(
                <KRBlock key={kr.id} kr={kr} reports={reports} onAddKA={reload} onSaveKA={handleSave} onDeleteKA={handleDelete}
                  members={members} objectives={objectives} wT={wT} weekStart={currentWeek}
                  levelId={selectedObj.level_id} objId={selectedObj.id} canEditKA={canEditKA}/>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

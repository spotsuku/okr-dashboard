'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ══════════════════════════════════════════════════
// テーマ定義
// ══════════════════════════════════════════════════
const THEMES = {
  dark: {
    bg:          '#07091280',
    bgCard:      '#131b2e',    // ← 濃い青系カード背景
    bgCard2:     '#1a2540',    // ← カード内セクション背景
    bgInput:     'rgba(255,255,255,0.08)',
    bgHover:     'rgba(255,255,255,0.06)',
    bgTable:     'rgba(255,255,255,0.06)',
    border:      'rgba(255,255,255,0.18)',   // ← 大幅に強化
    borderMid:   'rgba(255,255,255,0.28)',   // ← 大幅に強化
    borderEdit:  'rgba(77,159,255,0.6)',
    text:        '#eef0f8',
    textSub:     '#cdd2e8',
    textMuted:   '#8b95b8',
    textFaint:   '#505870',
    textFaintest:'#363d55',
    inputBg:     '#131b2e',
    inputText:   '#eef0f8',
    selectBg:    '#1a2540',
  },
  light: {
    bg:         '#f0f2f7',
    bgCard:     '#ffffff',
    bgCard2:    '#f7f8fc',
    bgInput:    'rgba(0,0,0,0.04)',
    bgHover:    'rgba(0,0,0,0.03)',
    bgTable:    'rgba(0,0,0,0.03)',
    border:     'rgba(0,0,0,0.09)',
    borderMid:  'rgba(0,0,0,0.15)',
    borderEdit: 'rgba(37,99,235,0.5)',
    text:       '#1a1f36',
    textSub:    '#374151',
    textMuted:  '#4b5563',
    textFaint:  '#6b7280',
    textFaintest:'#9ca3af',
    inputBg:    '#ffffff',
    inputText:  '#1a1f36',
    selectBg:   '#ffffff',
  },
}

// グローバルテーマ参照（コンテキスト不要の簡易実装）
let _T = THEMES.dark
const T = () => _T

// ══════════════════════════════════════════════════
// 定数
// ══════════════════════════════════════════════════
const STATUS_OPTS = [
  { value: 'active',    label: '🔵 現役',     bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
  { value: 'expanding', label: '🟡 拡充中',   bg: 'rgba(202,138,4,0.15)',   color: '#ca8a04', border: 'rgba(202,138,4,0.3)' },
  { value: 'future',    label: '🟣 追加予定', bg: 'rgba(168,85,247,0.15)',  color: '#a855f7', border: 'rgba(168,85,247,0.3)' },
]
const EMP_BADGE = {
  '業務委託':        { bg: 'rgba(99,102,241,0.15)',  color: '#6366f1' },
  '正社員':          { bg: 'rgba(16,185,129,0.15)',  color: '#10b981' },
  '業務委託→正社員': { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
  '正社員予定':      { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b' },
}
const EMP_OPTS = ['業務委託', '正社員', '業務委託→正社員', '正社員予定']
const TASK_STATUS_OPTS = ['same', 'new', 'del']
const AVATAR_COLORS = ['#4d9fff','#00d68f','#ff6b6b','#ffd166','#a855f7','#ff9f43','#be185d','#0891b2','#ea580c','#9333ea']

// levelsのnameから色を推定
const DEPT_COLOR_RULES = [
  { match: 'コミュニティ', color: '#1a56db' },
  { match: 'ユース',       color: '#059669' },
  { match: 'パートナー',   color: '#7c3aed' },
  { match: '経営',         color: '#d97706' },
]
function getDeptColor(name) {
  const rule = DEPT_COLOR_RULES.find(r => name && name.includes(r.match))
  return rule ? rule.color : '#4d9fff'
}
function getStatusBadge(status) {
  return STATUS_OPTS.find(s => s.value === status) || STATUS_OPTS[0]
}
function getEmpBadge(emp) {
  const key = Object.keys(EMP_BADGE).find(k => emp && emp.includes(k)) || '業務委託'
  return EMP_BADGE[key]
}
function avatarColor(name) {
  if (!name) return '#606880'
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ══════════════════════════════════════════════════
// 共通UIパーツ
// ══════════════════════════════════════════════════
function Avatar({ name, size = 36 }) {
  const color = avatarColor(name)
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: `${color}28`, border: `1.5px solid ${color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 800, color, flexShrink: 0 }}>
      {name ? name[0] : '?'}
    </div>
  )
}
function InlineInput({ value, onChange, placeholder = '', style = {} }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '4px 8px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit', width: '100%', ...style }} />
  )
}

// 担当（サポート）複数選択コンポーネント
function SupportSelect({ value, onChange, memberNames, borderColor }) {
  const selected = value ? value.split('・').map(s => s.trim()).filter(Boolean) : []
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)

  const toggle = (name) => {
    const next = selected.includes(name)
      ? selected.filter(s => s !== name)
      : [...selected, name]
    onChange(next.join('・'))
  }

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 180) })
    }
    setOpen(p => !p)
  }

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={triggerRef} style={{ position: 'relative' }}>
      <div onClick={handleOpen}
        style={{ background: T().inputBg, border: `1px solid ${borderColor || T().borderEdit}`, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: T().inputText, minHeight: 26, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
        {selected.length === 0
          ? <span style={{ color: T().textFaintest }}>（なし）</span>
          : selected.map(n => (
            <span key={n} style={{ background: `${avatarColor(n)}22`, color: avatarColor(n), borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 700 }}>{n}</span>
          ))
        }
        <span style={{ marginLeft: 'auto', color: T().textFaintest, fontSize: 9 }}>▾</span>
      </div>
      {open && (
        <div style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999, background: T().bgCard, border: `1px solid ${T().borderMid}`, borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: 220, overflowY: 'auto' }}>
          {memberNames.map(name => {
            const isSel = selected.includes(name)
            return (
              <div key={name} onClick={() => toggle(name)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', background: isSel ? `${avatarColor(name)}15` : 'transparent', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T().bgHover }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? `${avatarColor(name)}15` : 'transparent' }}
              >
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${isSel ? avatarColor(name) : T().borderMid}`, background: isSel ? avatarColor(name) : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSel && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                </div>
                <Avatar name={name} size={16} />
                <span style={{ fontSize: 12, color: isSel ? avatarColor(name) : T().text, fontWeight: isSel ? 700 : 400 }}>{name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SaveBtn({ saving, saved, onClick, label = '保存' }) {
  return (
    <button onClick={onClick} disabled={saving}
      style={{ padding: '6px 18px', borderRadius: 7, border: 'none', background: saved ? '#00d68f' : '#4d9fff', color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.3s' }}>
      {saved ? '✓ 保存済み' : saving ? '保存中...' : label}
    </button>
  )
}

// ══════════════════════════════════════════════════
// JDデフォルトデータ（Supabase org_member_jd が空の場合のフォールバック）
// ══════════════════════════════════════════════════
const JD_DEFAULT = {
  '加藤翼':   { avatar_color:['#1a56db','#ddeeff'], versions:[
    { period:'2025年6月 〜現在', role:'コミュニティ事業責任者', emp:'業務委託', working:'週2日', role_desc:'NEO福岡の１年間の運営を統括する\nNEOが複数拠点でコミュニティ運営できる仕組みを構築する', responsibility:'コミュニティ事業部の成果責任\n事業部のコスト管理', meetings:'・NEO立上げ本部定例（毎週土曜 9:00〜10:30）\n・コミュニティ事業定例（毎週水曜13:00〜14:00）\n・チェックイン定例（毎週月曜朝）', tasks:[{cat:'コミュニティ',task:'NEOのコミュニティの基本設計と改善',status:'same'},{cat:'プログラム',task:'アワードの企画設計・PM計画書',status:'new'}]},
  ]},
  '森朝香':   { avatar_color:['#059669','#d1fae5'], versions:[
    { period:'2025年7月 〜現在', role:'コミュニティマネージャー (教育責任者)', emp:'業務委託', working:'週5（常時）', role_desc:'コミュニティチーム実行責任者（教育責任者業務含む）\n年間プログラムの受講生の受講状況の管理', responsibility:'アカデミア生からヒーローを創出する\n受講生に対するイベントの開催', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週2〜3回）\n・毎朝チェックイン', tasks:[{cat:'コミュニティ運営',task:'アカデミア生のカルテ情報の設計・最新アップデート',status:'same'},{cat:'コミュニティ運営',task:'Playful研修の企画・開発・営業・運営',status:'new'}]},
  ]},
  '面川文香': { avatar_color:['#be185d','#fce7f3'], versions:[
    { period:'2026年2月 〜現在', role:'企業伴走 兼 総務', emp:'正社員', working:'週5', role_desc:'企業伴走チームとして企業会員への密なコミュニケーション支援\n総務・事務局業務の中心担当', responsibility:'企業会員のNEO活用促進\n総務・事務局業務の実行責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例（週2〜3回）\n・毎朝チェックイン', tasks:[{cat:'企業伴走',task:'会員企業への適切な量・質・頻度でのコミュニケーション',status:'same'},{cat:'総務',task:'総務（事務作業・HP更新・郵送物管理・問い合わせ対応・経理連携）',status:'same'}]},
  ]},
  '古野絢太': { avatar_color:['#0891b2','#cffafe'], versions:[
    { period:'2026年4月 〜現在', role:'企業伴走 兼 事務局長補佐', emp:'業務委託', working:'週3〜4日', role_desc:'企業会員への密な伴走支援\n事務局長補佐として組織全体の業務管理補助', responsibility:'担当企業会員のサクセス支援\n事務局長補佐業務の実行', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・NEO地域定例\n・毎朝チェックイン', tasks:[{cat:'企業伴走',task:'企業カルテの情報管理・企業公開情報のリサーチ・アップデート',status:'same'},{cat:'事務局補佐',task:'事務局長補佐（全体PM・資料作成・会議フィードバック）',status:'same'}]},
  ]},
  '鬼木良輔': { avatar_color:['#b45309','#fef3c7'], versions:[
    { period:'2025年10月 〜現在', role:'カスタマーサクセスチーム マネージャー', emp:'業務委託', working:'週2〜3日', role_desc:'NEO福岡のカスタマーサクセスチームのマネジメント\n会員企業のサクセスロードマップ設計・実行', responsibility:'CSチームの成果責任（会員企業のサクセス・継続率）\n研修サービスの品質・売上責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・CS定例（週1〜2回）\n・担当企業との個別MTG（月1〜2回）', tasks:[{cat:'CS戦略',task:'会員企業のサクセスロードマップ企画・実行・改善',status:'same'},{cat:'研修',task:'NEO合同AI研修の企画・運営・改善',status:'same'}]},
  ]},
  '増田雄太朗': { avatar_color:['#7c3aed','#ede9fe'], versions:[
    { period:'2026年1月 〜現在', role:'マーケティングマネージャー （正社員）', emp:'正社員', working:'週5', role_desc:'正社員として全社マーケティングを統括', responsibility:'マーケティング全般の成果責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・マーケ定例（週1〜2回）', tasks:[{cat:'マーケ戦略',task:'年間・四半期ごとのマーケティング計画（KPI設計・チャネル戦略）策定',status:'same'},{cat:'集客',task:'各イベントの集客戦略・広告運用（SNS広告・パートナー連携）',status:'same'}]},
  ]},
  '菅雅也':   { avatar_color:['#dc2626','#fee2e2'], versions:[
    { period:'2025年7月 〜現在', role:'クリエイティブマネージャー', emp:'業務委託', working:'週3〜4日', role_desc:'NEO福岡の動画・クリエイティブ制作全般のディレクション', responsibility:'NEO福岡のクリエイティブ品質の責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・広報チーム定例（週1回）', tasks:[{cat:'動画制作',task:'NEO福岡の動画制作・監修・年間動画企画',status:'same'},{cat:'広報',task:'インスタ投稿戦略のアドバイス',status:'same'}]},
  ]},
  '中島啓太': { avatar_color:['#0f766e','#ccfbf1'], versions:[
    { period:'2025年7月 〜現在', role:'クラブパートナーシップ ダイレクター', emp:'業務委託', working:'週2〜3日', role_desc:'提携スポーツクラブとの戦略深化', responsibility:'提携クラブとの長期関係維持・拡大', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・パートナー定例（週1回）', tasks:[{cat:'パートナー開発',task:'提携スポーツチームとの中長期戦略の作成・合意形成',status:'same'},{cat:'プログラム連携',task:'アカデミア（HR）カリキュラム企画・スポーツ連携座組み企画',status:'same'}]},
  ]},
  '中道稔':   { avatar_color:['#ea580c','#ffedd5'], versions:[
    { period:'2026年4月 〜8月', role:'イベントチームリーダー', emp:'業務委託', working:'週4〜5日', role_desc:'イベントチームリーダーとしてイベント全般を統括', responsibility:'イベント品質・NPS向上責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・イベント定例（週1〜2回）', tasks:[{cat:'イベント運営',task:'現地イベントロジ作成・運営実務準備',status:'same'},{cat:'チームリード',task:'イベントチームのリーダーシップ・指示出し',status:'new'}]},
    { period:'2026年9月 〜（予定）', role:'イベントチームリーダー （正社員）', emp:'正社員予定', working:'週5', role_desc:'正社員として安定的にイベントチームを統括', responsibility:'イベントチームの長期的な品質・体制確立', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・イベント定例（週1〜2回）', tasks:[{cat:'イベント運営',task:'現地イベントロジ作成・運営実務準備',status:'same'},{cat:'チームリード',task:'イベント振り返り・改善提案',status:'same'}]},
  ]},
  '元美和':   { avatar_color:['#9333ea','#f3e8ff'], versions:[
    { period:'2026年3月 〜現在', role:'コミュニティプロデューサー （NEO九州未来評議会専任）', emp:'業務委託', working:'週3〜4日', role_desc:'NEO九州未来評議会の企画・運営・拡大', responsibility:'NEO九州未来評議会の参加企業数・満足度の向上責任', meetings:'・毎週土曜 9:00〜10:30 定例参加\n・評議会準備定例（月2〜3回）', tasks:[{cat:'評議会運営',task:'NEO九州未来評議会の当日進行設計・台本作成・ファシリテーション補助',status:'same'},{cat:'評議会拡大',task:'新規参加候補リスト作成・紹介ルート開拓・法人営業',status:'same'}]},
  ]},
}

// ══════════════════════════════════════════════════
// データ取得フック
// ══════════════════════════════════════════════════
function useOrgData(fiscalYear) {
  const [levels, setLevels] = useState([])
  const [teamMeta, setTeamMeta] = useState({})
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [jdRows, setJdRows] = useState({})
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('connecting')

  const reload = useCallback(async () => {
    setLoading(true)
    const [
      { data: lvls },
      { data: meta },
      { data: mems },
      { data: taskData },
      { data: jdData },
    ] = await Promise.all([
      supabase.from('levels').select('*').order('id'),
      supabase.from('org_team_meta').select('*'),
      supabase.from('members').select('*').order('name'),
      supabase.from('org_tasks').select('*').order('id'),
      supabase.from('org_member_jd').select('*').order('version_idx'),
    ])

    const validLvls = (lvls || []).filter(l =>
      fiscalYear === '2026'
        ? (!l.fiscal_year || l.fiscal_year === '2026')
        : l.fiscal_year === fiscalYear
    )
    setLevels(validLvls)
    const metaMap = {}
    ;(meta || []).forEach(m => { metaMap[m.level_id] = m })
    setTeamMeta(metaMap)
    setMembers(mems || [])
    setTasks(taskData && taskData.length > 0 ? taskData : [])

    const rowMap = {}
    ;(jdData || []).forEach(row => {
      if (!rowMap[row.member_id]) rowMap[row.member_id] = []
      rowMap[row.member_id].push(row)
    })
    Object.keys(rowMap).forEach(k => rowMap[k].sort((a, b) => a.version_idx - b.version_idx))
    setJdRows(rowMap)
    setLoading(false)
  }, [fiscalYear])

  // Supabase Realtime
  useEffect(() => {
    reload()
    const channel = supabase
      .channel('org_realtime_' + fiscalYear)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_tasks' }, payload => {
        if (payload.eventType === 'INSERT') {
          // ローカルで既に追加済みの場合は重複させない
          setTasks(prev => prev.some(t => t.id === payload.new.id) ? prev : [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new : t))
        } else if (payload.eventType === 'DELETE') {
          setTasks(prev => prev.filter(t => t.id !== payload.old.id))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, payload => {
        if (payload.eventType === 'INSERT') { setMembers(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'))) }
        else if (payload.eventType === 'UPDATE') setMembers(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
        else if (payload.eventType === 'DELETE') setMembers(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_member_jd' }, payload => {
        setJdRows(prev => {
          const next = { ...prev }
          if (payload.eventType === 'DELETE') {
            const mid = payload.old.member_id
            next[mid] = (next[mid] || []).filter(r => r.id !== payload.old.id)
          } else {
            const row = payload.new
            const mid = row.member_id
            const existing = [...(next[mid] || [])]
            const idx = existing.findIndex(r => r.id === row.id)
            if (idx >= 0) existing[idx] = row; else existing.push(row)
            existing.sort((a, b) => a.version_idx - b.version_idx)
            next[mid] = existing
          }
          return next
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_team_meta' }, payload => {
        setTeamMeta(prev => {
          const next = { ...prev }
          if (payload.eventType === 'DELETE') delete next[payload.old.level_id]
          else next[payload.new.level_id] = payload.new
          return next
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'levels' }, () => { reload() })
      .subscribe(status => {
        setSyncStatus(status === 'SUBSCRIBED' ? 'synced' : status === 'CHANNEL_ERROR' ? 'error' : 'connecting')
      })
    return () => { supabase.removeChannel(channel) }
  }, [fiscalYear]) // eslint-disable-line

  return { levels, teamMeta, members, tasks, jdRows, loading, syncStatus, reload, setLevels, setTeamMeta, setMembers, setTasks, setJdRows }
}

// ══════════════════════════════════════════════════
// タブ1: 組織図（levelsテーブルから動的生成）
// ══════════════════════════════════════════════════
function OrgChart({ levels, teamMeta, members, onMemberClick, isAdmin, onTeamMetaUpdate }) {
  const [editingMeta, setEditingMeta] = useState(null)
  const [metaBuf, setMetaBuf] = useState({})
  const [saving, setSaving] = useState(false)

  // ツリー構造：root(parent_id=null) → 事業部 → チーム
  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === Number(id))

  // 事業部 = rootの直下、チーム = 事業部の直下
  const depts = roots.flatMap(root => getChildren(root.id).map(dept => ({
    ...dept,
    teams: getChildren(dept.id),
    rootName: root.name,
  })))

  // メンバーのlevel_ids対応（兼務含む）
  const getMembersForLevel = levelId =>
    members.filter(m => {
      const ids = Array.isArray(m.level_ids) ? m.level_ids.map(Number) : (m.level_id ? [Number(m.level_id)] : [])
      return ids.includes(Number(levelId))
    })

  const saveTeamMeta = async (levelId) => {
    setSaving(true)
    await supabase.from('org_team_meta').upsert([{ level_id: levelId, ...metaBuf }], { onConflict: 'level_id' })
    onTeamMetaUpdate(levelId, metaBuf)
    setSaving(false); setEditingMeta(null)
  }

  if (depts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: T().textFaintest, border: `1px dashed ${T().border}`, borderRadius: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🏗</div>
        <div style={{ fontSize: 15 }}>この年度の組織データがありません</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>OKRページの「組織を管理」から追加してください</div>
      </div>
    )
  }

  return (
    <div>
      {depts.map(dept => {
        const color = getDeptColor(dept.name)
        return (
          <div key={dept.id} style={{ marginBottom: 24, border: `2px solid ${color}60`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ background: `linear-gradient(135deg, ${color}18, ${color}06)`, borderBottom: `2px solid ${color}80`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 16, fontWeight: 700, color }}>{dept.icon} {dept.name}</span>
              <span style={{ fontSize: 11, color: T().textFaint, marginLeft: 'auto' }}>{dept.teams.length}チーム</span>
            </div>
            {dept.teams.length === 0 ? (
              <div style={{ padding: '20px', fontSize: 12, color: T().textFaintest, fontStyle: 'italic', background: T().bgCard }}> チームがありません（OKRページの「組織を管理」から追加）</div>
            ) : (
              <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 12, background: T().bgCard }}>
                {dept.teams.map(team => {
                  const meta = teamMeta[team.id] || {}
                  const sb = getStatusBadge(meta.status || 'active')
                  const teamMembers = getMembersForLevel(team.id)
                  const isEditing = editingMeta === team.id

                  return (
                    <div key={team.id} style={{ background: T().bgCard2, border: `1px solid ${color}55`, borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T().text, flex: 1, lineHeight: 1.4 }}>{team.icon} {team.name}</span>
                        {isEditing ? (
                          <select value={metaBuf.status} onChange={e => setMetaBuf(p => ({ ...p, status: e.target.value }))}
                            style={{ background: T().selectBg, border: `1px solid ${T().borderMid}`, borderRadius: 5, padding: '2px 6px', color: T().text, fontSize: 10, outline: 'none', fontFamily: 'inherit' }}>
                            {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, flexShrink: 0, background: sb.bg, color: sb.color, border: `1px solid ${sb.border}` }}>{sb.label}</span>
                        )}
                      </div>

                      {isEditing ? (
                        <div style={{ marginBottom: 10 }}>
                          <input value={metaBuf.desc_text} onChange={e => setMetaBuf(p => ({ ...p, desc_text: e.target.value }))}
                            placeholder="チームの説明"
                            style={{ width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '5px 8px', color: T().inputText, fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button onClick={() => saveTeamMeta(team.id)} disabled={saving}
                              style={{ padding: '3px 10px', borderRadius: 5, background: '#4d9fff', border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓ 保存</button>
                            <button onClick={() => setEditingMeta(null)}
                              style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, fontSize: 10, cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      ) : (
                        meta.desc_text && <p style={{ fontSize: 11, color: T().textFaint, margin: '0 0 10px', lineHeight: 1.5 }}>{meta.desc_text}</p>
                      )}

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {teamMembers.map(m => (
                          <div key={m.id} onClick={() => onMemberClick(m.name)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: `${avatarColor(m.name)}18`, border: `1px solid ${avatarColor(m.name)}40`, fontSize: 11, fontWeight: 600, color: avatarColor(m.name), cursor: 'pointer', transition: 'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = `${avatarColor(m.name)}30`}
                            onMouseLeave={e => e.currentTarget.style.background = `${avatarColor(m.name)}18`}
                          >
                            <Avatar name={m.name} size={18} />
                            {m.name}
                          </div>
                        ))}
                        {teamMembers.length === 0 && <span style={{ fontSize: 10, color: T().textFaintest, fontStyle: 'italic' }}>メンバーなし</span>}
                      </div>

                      {isAdmin && !isEditing && (
                        <button onClick={() => { setMetaBuf({ status: meta.status || 'active', desc_text: meta.desc_text || '' }); setEditingMeta(team.id) }}
                          style={{ marginTop: 8, fontSize: 10, color: '#4d9fff', background: 'transparent', border: '1px dashed rgba(77,159,255,0.35)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✎ チーム情報を編集
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════
// タブ2: 業務一覧（管理者は編集・並び替え可）
// ══════════════════════════════════════════════════
function TaskList({ tasks, setTasks, members, onMemberClick, isAdmin }) {
  const [filterDept, setFilterDept] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editBuf, setEditBuf] = useState({})
  const [addingTeam, setAddingTeam] = useState(null)
  const [newBuf, setNewBuf] = useState({ task: '', owner: '', support: '' })
  const [saving, setSaving] = useState(false)
  // ドラッグ状態
  const dragId = useRef(null)
  const dragOverId = useRef(null)

  const memberNames = members.map(m => m.name)
  const allDepts = [...new Set(tasks.map(t => t.dept))]
  const allOwners = [...new Set(tasks.map(t => t.owner).filter(o => o && o !== '（未定）'))]

  // sort_orderでソート（なければidでソート）
  const sortedTasks = [...tasks].sort((a, b) =>
    (a.sort_order ?? a.id) - (b.sort_order ?? b.id)
  )
  // アーカイブ済みを分離
  const activeTasks = sortedTasks.filter(t => !t.is_archived)
  const archivedTasks = sortedTasks.filter(t => t.is_archived)
  const baseFiltered = (showArchived ? archivedTasks : activeTasks)
  const filtered = baseFiltered.filter(t =>
    (!filterDept || t.dept === filterDept) &&
    (!filterOwner || t.owner === filterOwner || (t.support && t.support.includes(filterOwner))) &&
    (!query || t.task.includes(query) || t.team.includes(query))
  )
  const grouped = {}
  filtered.forEach(t => {
    if (!grouped[t.dept]) grouped[t.dept] = {}
    if (!grouped[t.dept][t.team]) grouped[t.dept][t.team] = []
    grouped[t.dept][t.team].push(t)
  })

  const saveEdit = async (t) => {
    setSaving(true)
    const updated = { ...t, ...editBuf }
    await supabase.from('org_tasks').upsert([updated])
    setTasks(prev => prev.map(x => x.id === t.id ? updated : x))
    setSaving(false); setEditingId(null)
  }
  const deleteTask = async (t) => {
    if (!window.confirm(`「${t.task}」を削除しますか？`)) return
    await supabase.from('org_tasks').delete().eq('id', t.id)
    setTasks(prev => prev.filter(x => x.id !== t.id))
  }
  const addTask = async (dept, team) => {
    if (!newBuf.task.trim()) return
    const maxOrder = Math.max(0, ...tasks.filter(t => t.dept === dept && t.team === team).map(t => t.sort_order ?? t.id))
    const row = { dept, team, ...newBuf, sort_order: maxOrder + 1 }
    const { data } = await supabase.from('org_tasks').insert([row]).select().single()
    setTasks(prev => [...prev, data || { ...row, id: Date.now() }])
    setNewBuf({ task: '', owner: '', support: '' }); setAddingTeam(null)
  }

  // ドラッグ&ドロップで並び替え（同一チーム内のみ）
  const handleDragStart = (e, taskId) => {
    dragId.current = taskId
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.style.opacity = '0.5'
  }
  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1'
    dragId.current = null
    dragOverId.current = null
  }
  const handleDragOver = (e, taskId) => {
    e.preventDefault()
    dragOverId.current = taskId
  }
  const handleDrop = async (e, dept, team) => {
    e.preventDefault()
    const fromId = dragId.current
    const toId = dragOverId.current
    if (!fromId || !toId || fromId === toId) return

    // 同チーム内のタスクだけ対象
    const teamTasks = sortedTasks.filter(t => t.dept === dept && t.team === team)
    const fromIdx = teamTasks.findIndex(t => t.id === fromId)
    const toIdx = teamTasks.findIndex(t => t.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    // 並び替え
    const reordered = [...teamTasks]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    // sort_orderを再割り当て
    const updates = reordered.map((t, i) => ({ ...t, sort_order: i + 1 }))
    setTasks(prev => {
      const others = prev.filter(t => !(t.dept === dept && t.team === team))
      return [...others, ...updates].sort((a, b) => (a.sort_order ?? a.id) - (b.sort_order ?? b.id))
    })

    // DB更新（バッチ）
    await Promise.all(updates.map(t =>
      supabase.from('org_tasks').update({ sort_order: t.sort_order }).eq('id', t.id)
    ))
    dragId.current = null
    dragOverId.current = null
  }

  const archiveTask = async (t) => {
    await supabase.from('org_tasks').update({ is_archived: true }).eq('id', t.id)
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_archived: true } : x))
  }
  const restoreTask = async (t) => {
    await supabase.from('org_tasks').update({ is_archived: false }).eq('id', t.id)
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_archived: false } : x))
  }

  const sel = { background: T().selectBg, border: `1px solid ${T().border}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: T().text, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }

  if (tasks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: T().textFaintest, border: `1px dashed ${T().border}`, borderRadius: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15 }}>業務データがありません</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Supabase の org_tasks テーブルにデータを追加してください</div>
      </div>
    )
  }

  return (
    <div>
      {/* フィルター */}
      <div style={{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T().textFaint }}>フィルター</span>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={sel}>
          <option value="">事業部：すべて</option>
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={sel}>
          <option value="">担当者：すべて</option>
          {allOwners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 業務・チームで検索..."
          style={{ ...sel, width: 200 }}
          onFocus={e => e.target.style.borderColor = '#4d9fff'}
          onBlur={e => e.target.style.borderColor = T().border}
        />
        <span style={{ fontSize: 11, color: T().textFaint, marginLeft: 'auto' }}>{filtered.length}件</span>
        <button onClick={() => setShowArchived(p => !p)}
          style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${showArchived ? 'rgba(255,159,67,0.4)' : T().border}`, background: showArchived ? 'rgba(255,159,67,0.12)' : 'transparent', color: showArchived ? '#ff9f43' : T().textMuted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          {showArchived ? '📦 アーカイブ表示中' : `📦 アーカイブ (${archivedTasks.length})`}
        </button>
        {isAdmin && !showArchived && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,209,102,0.15)', color: '#ffd166', border: '1px solid rgba(255,209,102,0.3)', fontWeight: 700 }}>
            👑 管理者モード　⠿ドラッグで並び替え可
          </span>
        )}
        {showArchived && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,159,67,0.12)', color: '#ff9f43', border: '1px solid rgba(255,159,67,0.3)', fontWeight: 700 }}>
            📦 アーカイブ済みのみ表示
          </span>
        )}
        {(filterDept || filterOwner || query) && <button onClick={() => { setFilterDept(''); setFilterOwner(''); setQuery('') }} style={{ ...sel, color: '#4d9fff', border: '1px solid rgba(77,159,255,0.3)' }}>クリア</button>}
      </div>

      {Object.entries(grouped).map(([dept, teams]) => {
        const color = getDeptColor(dept)
        return (
          <div key={dept} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 14px', background: `${color}12`, border: `1px solid ${color}55`, borderRadius: 8, borderLeft: `4px solid ${color}` }}>
              <span style={{ fontSize: 14, fontWeight: 700, color }}>{dept}</span>
            </div>
            {Object.entries(teams).map(([team, teamTasks]) => {
              const isAddingHere = addingTeam?.dept === dept && addingTeam?.team === team
              return (
                <div key={team} style={{ marginBottom: 16, marginLeft: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T().textMuted, marginBottom: 8 }}>└ {team}</div>
                  <div style={{ border: `1px solid ${T().border}`, borderRadius: 8, background: T().bgCard, position: 'relative' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDrop(e, dept, team)}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: T().bgTable }}>
                          {isAdmin && <th style={{ width: 24, borderBottom: `1px solid ${T().border}` }} />}
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, width: 110, borderBottom: `1px solid ${T().border}` }}>責任者</th>
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, borderBottom: `1px solid ${T().border}` }}>業務内容</th>
                          <th style={{ padding: '7px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, width: 120, borderBottom: `1px solid ${T().border}` }}>担当（サポート）</th>
                          {isAdmin && <th style={{ width: 80, borderBottom: `1px solid ${T().border}` }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {teamTasks.map((t, i) => {
                          const isEditing = editingId === t.id
                          const ownerColor = avatarColor(t.owner)
                          return (
                            <tr key={t.id}
                              draggable={isAdmin && !isEditing && !showArchived}
                              onDragStart={isAdmin && !showArchived ? e => handleDragStart(e, t.id) : undefined}
                              onDragEnd={isAdmin && !showArchived ? handleDragEnd : undefined}
                              onDragOver={isAdmin && !showArchived ? e => handleDragOver(e, t.id) : undefined}
                              style={{
                                borderBottom: i < teamTasks.length - 1 ? `1px solid ${T().border}` : 'none',
                                background: isEditing ? 'rgba(77,159,255,0.06)' : showArchived ? 'rgba(255,159,67,0.04)' : 'transparent',
                                cursor: isAdmin && !isEditing && !showArchived ? 'grab' : 'default',
                                transition: 'background 0.1s',
                                opacity: showArchived ? 0.75 : 1,
                              }}>
                              {/* ドラッグハンドル */}
                              {isAdmin && (
                                <td style={{ padding: '0 4px 0 8px', color: T().textFaintest, fontSize: 14, userSelect: 'none', cursor: 'grab' }}>
                                  ⠿
                                </td>
                              )}
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? (
                                  <select value={editBuf.owner ?? t.owner} onChange={e => setEditBuf(b => ({ ...b, owner: e.target.value }))}
                                    style={{ width: '100%', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 5, padding: '4px 6px', color: T().inputText, fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                                    <option value="">（未定）</option>
                                    {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                ) : t.owner && t.owner !== '（未定）' ? (
                                  <span onClick={() => onMemberClick(t.owner)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: `${ownerColor}18`, color: ownerColor, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    <Avatar name={t.owner} size={16} />{t.owner}
                                  </span>
                                ) : <span style={{ fontSize: 11, color: T().textFaintest }}>{t.owner || '（未定）'}</span>}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? <InlineInput value={editBuf.task ?? t.task} onChange={v => setEditBuf(b => ({ ...b, task: v }))} /> : <span style={{ fontSize: 12, color: T().textSub, lineHeight: 1.5 }}>{t.task}</span>}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {isEditing ? (
                                  <SupportSelect
                                    value={editBuf.support ?? t.support ?? ''}
                                    onChange={v => setEditBuf(b => ({ ...b, support: v }))}
                                    memberNames={memberNames.filter(n => n !== (editBuf.owner ?? t.owner))}
                                  />
                                ) : t.support ? (
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {t.support.split('・').filter(Boolean).map(n => (
                                      <span key={n} style={{ fontSize: 11, color: T().textFaint, padding: '2px 7px', background: T().bgInput, borderRadius: 5 }}>{n}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </td>
                              {isAdmin && (
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                  {isEditing ? (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => saveEdit(t)} style={{ padding: '3px 10px', borderRadius: 5, background: '#4d9fff', border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                                      <button onClick={() => setEditingId(null)} style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, fontSize: 10, cursor: 'pointer' }}>✕</button>
                                    </div>
                                  ) : showArchived ? (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => restoreTask(t)} style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.3)', color: '#00d68f', fontSize: 10, fontWeight: 700, cursor: 'pointer' }} title="業務一覧に戻す">↩ 復元</button>
                                      <button onClick={() => deleteTask(t)} style={{ padding: '3px 8px', borderRadius: 5, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', fontSize: 10, cursor: 'pointer' }} title="完全削除">✕</button>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => { setEditingId(t.id); setEditBuf({}) }} style={{ padding: '3px 8px', borderRadius: 5, background: 'rgba(77,159,255,0.1)', border: '1px solid rgba(77,159,255,0.25)', color: '#4d9fff', fontSize: 10, cursor: 'pointer' }} title="編集">✎</button>
                                      <button onClick={() => archiveTask(t)} style={{ padding: '3px 8px', borderRadius: 5, background: 'rgba(255,159,67,0.08)', border: '1px solid rgba(255,159,67,0.25)', color: '#ff9f43', fontSize: 10, cursor: 'pointer' }} title="アーカイブ">📦</button>
                                      <button onClick={() => deleteTask(t)} style={{ padding: '3px 8px', borderRadius: 5, background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)', color: '#ff6b6b', fontSize: 10, cursor: 'pointer' }} title="完全削除">✕</button>
                                    </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                        {isAdmin && isAddingHere && (
                          <tr style={{ background: 'rgba(0,214,143,0.05)', borderTop: '1px dashed rgba(0,214,143,0.25)' }}>
                            {isAdmin && <td />}
                            <td style={{ padding: '8px 12px' }}>
                              <select value={newBuf.owner} onChange={e => setNewBuf(b => ({ ...b, owner: e.target.value }))}
                                style={{ width: '100%', background: T().inputBg, border: '1px solid rgba(0,214,143,0.4)', borderRadius: 5, padding: '4px 6px', color: T().inputText, fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                                <option value="">（未定）</option>
                                {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px' }}><InlineInput value={newBuf.task} onChange={v => setNewBuf(b => ({ ...b, task: v }))} placeholder="業務内容" style={{ borderColor: 'rgba(0,214,143,0.4)' }} /></td>
                            <td style={{ padding: '8px 12px' }}>
                              <SupportSelect
                                value={newBuf.support}
                                onChange={v => setNewBuf(b => ({ ...b, support: v }))}
                                memberNames={memberNames.filter(n => n !== newBuf.owner)}
                                borderColor="rgba(0,214,143,0.4)"
                              />
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => addTask(dept, team)} style={{ padding: '3px 10px', borderRadius: 5, background: '#00d68f', border: 'none', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>追加</button>
                                <button onClick={() => { setAddingTeam(null); setNewBuf({ task: '', owner: '', support: '' }) }} style={{ padding: '3px 8px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, fontSize: 10, cursor: 'pointer' }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {isAdmin && !isAddingHere && !showArchived && (
                      <div onClick={() => { setAddingTeam({ dept, team }); setNewBuf({ task: '', owner: '', support: '' }) }}
                        style={{ padding: '8px 12px', fontSize: 11, color: '#00d68f', cursor: 'pointer', background: 'rgba(0,214,143,0.04)', borderTop: '1px dashed rgba(0,214,143,0.15)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        ＋ 業務を追加
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════
// タブ3: メンバーJD（追加・削除・兼務設定付き）
// ══════════════════════════════════════════════════
function MemberJDTab({ members, setMembers, levels, tasks, jdRows, setJdRows, isAdmin, initialName, onClearJump }) {
  const [selectedName, setSelectedName] = useState(initialName || null)
  const [verIdx, setVerIdx] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    if (initialName) { setSelectedName(initialName); setVerIdx(null) }
  }, [initialName])

  if (selectedName) {
    const memberRow = members.find(m => m.name === selectedName)
    const jdBase = JD_DEFAULT[selectedName] || { avatar_color: [avatarColor(selectedName), '#111828'], versions: [] }
    return (
      <MemberDetail
        memberRow={memberRow}
        jdBase={jdBase}
        jdRows={jdRows}
        setJdRows={setJdRows}
        verIdx={verIdx}
        setVerIdx={setVerIdx}
        onBack={() => { setSelectedName(null); setVerIdx(null); onClearJump && onClearJump() }}
        isAdmin={isAdmin}
        levels={levels}
        members={members}
        setMembers={setMembers}
        tasks={tasks}
      />
    )
  }

  return (
    <div>
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => setShowAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, background: '#00d68f', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ＋ メンバーを追加
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {members.map(m => {
          const jdBase = JD_DEFAULT[m.name] || { avatar_color: [avatarColor(m.name), '#111828'], versions: [] }
          const [fg, bg] = jdBase.avatar_color
          // DBのjdRowsがあれば最新バージョンを表示、なければJD_DEFAULTの最終版
          const dbRows = jdRows[m.name] || []
          const latestDbRow = dbRows[dbRows.length - 1]
          const fallbackLv = jdBase.versions[jdBase.versions.length - 1]
          const lv = latestDbRow ? { role: latestDbRow.role, emp: latestDbRow.emp, working: latestDbRow.working } : fallbackLv
          const totalVersions = dbRows.length > 0 ? dbRows.length : jdBase.versions.length
          const empB = lv ? getEmpBadge(lv.emp) : EMP_BADGE['業務委託']
          const levelIds = Array.isArray(m.level_ids) ? m.level_ids.map(Number) : (m.level_id ? [Number(m.level_id)] : [])
          const teamNames = levelIds.map(id => levels.find(l => Number(l.id) === id)?.name).filter(Boolean)

          return (
            <div key={m.id} onClick={() => { setSelectedName(m.name); setVerIdx(null) }}
              style={{ background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 12, padding: 18, cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = fg + '60' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = T().border }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Avatar name={m.name} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T().text }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: T().textFaint, marginTop: 2 }}>{m.role || '—'}</div>
                </div>
                {totalVersions > 0 && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, background: 'rgba(77,159,255,0.1)', color: '#4d9fff', border: '1px solid rgba(77,159,255,0.2)', fontWeight: 700, flexShrink: 0 }}>
                    v{totalVersions}
                  </span>
                )}
              </div>
              {lv?.role && <div style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: fg, color: bg, marginBottom: 10, lineHeight: 1.4 }}>{lv.role}</div>}
              {teamNames.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {teamNames.map(t => (
                    <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(77,159,255,0.12)', color: '#4d9fff', border: '1px solid rgba(77,159,255,0.2)' }}>{t}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {lv?.emp && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 700, background: empB.bg, color: empB.color }}>{lv.emp.split('→')[0]}</span>}
                {lv?.working && <span style={{ fontSize: 10, color: T().textFaint }}>{lv.working}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {showAddModal && (
        <AddMemberModal levels={levels} onClose={() => setShowAddModal(false)}
          onAdded={newM => { setMembers(prev => [...prev, newM]); setShowAddModal(false) }} />
      )}
    </div>
  )
}

// ── メンバー追加モーダル ──────────────────────────────────────────────────────
function AddMemberModal({ levels, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [email, setEmail] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const roots = levels.filter(l => !l.parent_id)
  const getDepts = rootId => levels.filter(l => Number(l.parent_id) === Number(rootId))
  const getTeams = deptId => levels.filter(l => Number(l.parent_id) === Number(deptId))
  const toggleId = id => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const save = async () => {
    if (!name.trim()) { setError('名前は必須です'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from('members').insert([{
      name: name.trim(), role: roleTitle.trim() || null, email: email.trim() || null,
      level_id: selectedIds[0] || null, level_ids: selectedIds,
    }]).select().single()
    if (err) { setError('保存に失敗しました: ' + err.message); setSaving(false); return }
    onAdded(data)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: T().bgCard, border: `1px solid ${T().borderMid}`, borderRadius: 16, padding: 26, width: '100%', maxWidth: 500, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 28px 80px rgba(0,0,0,0.5)', color: T().text }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T().text }}>＋ メンバーを追加</h3>
          <button onClick={onClose} style={{ background: T().bgInput, border: 'none', color: T().textMuted, width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {[
          { label: '名前 *', val: name, set: setName, ph: '例: 田中 花子' },
          { label: '役職・ロール', val: roleTitle, set: setRoleTitle, ph: '例: コミュニティマネージャー' },
          { label: 'メールアドレス', val: email, set: setEmail, ph: '例: tanaka@example.com' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 5 }}>{f.label}</div>
            <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
              style={{ width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().border}`, borderRadius: 8, padding: '9px 12px', color: T().inputText, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 8 }}>所属チーム（複数選択可・兼務対応）</div>
          {roots.map(root => (
            getDepts(root.id).map(dept => {
              const teams = getTeams(dept.id)
              if (teams.length === 0) return null
              const color = getDeptColor(dept.name)
              return (
                <div key={dept.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6 }}>{dept.icon} {dept.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 10 }}>
                    {teams.map(team => {
                      const isSel = selectedIds.includes(team.id)
                      return (
                        <div key={team.id} onClick={() => toggleId(team.id)}
                          style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: isSel ? 700 : 400, background: isSel ? 'rgba(77,159,255,0.2)' : T().bgInput, border: `1px solid ${isSel ? 'rgba(77,159,255,0.5)' : T().border}`, color: isSel ? '#4d9fff' : T().textMuted, transition: 'all 0.15s' }}>
                          {isSel ? '✓ ' : ''}{team.icon} {team.name}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          ))}
        </div>

        {error && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(255,107,107,0.1)', borderRadius: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${T().borderMid}`, color: T().textMuted, borderRadius: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={save} disabled={saving || !name.trim()}
            style={{ background: !name.trim() ? 'rgba(0,214,143,0.3)' : '#00d68f', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: !name.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? '追加中...' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── メンバー詳細（JD + 兼務設定 + 削除） ─────────────────────────────────────
function MemberDetail({ memberRow, jdBase, jdRows, setJdRows, verIdx, setVerIdx, onBack, isAdmin, levels, members, setMembers, tasks }) {
  const memberName = memberRow?.name || ''
  const [fg, bg] = jdBase.avatar_color || [avatarColor(memberName), '#111828']

  // ── バージョン管理 ────────────────────────────────
  // DBのjdRowsを正とする。空ならJD_DEFAULTをシード候補として使用
  const dbRows = jdRows[memberName] || []
  // 表示用バージョン配列: DBがあればDB優先、なければJD_DEFAULT
  const versions = dbRows.length > 0
    ? dbRows.map(row => ({
        period: row.period || '',
        role: row.role || '',
        emp: row.emp || '',
        working: row.working || '',
        role_desc: row.role_desc || '',
        responsibility: row.responsibility || '',
        meetings: row.meetings || '',
        tasks: row.tasks ? (typeof row.tasks === 'string' ? JSON.parse(row.tasks) : row.tasks) : [],
        _dbId: row.id,
        _vi: row.version_idx,
      }))
    : (jdBase.versions || [])

  const effectiveVerIdx = verIdx !== null ? Math.min(verIdx, Math.max(0, versions.length - 1)) : Math.max(0, versions.length - 1)
  const displayVer = versions[effectiveVerIdx] || {}
  const empB = getEmpBadge(displayVer.emp || '')

  const [editing, setEditing] = useState(false)
  const [editVer, setEditVer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingNewVersion, setAddingNewVersion] = useState(false)
  const [editingTeams, setEditingTeams] = useState(false)
  const [selectedIds, setSelectedIds] = useState(
    Array.isArray(memberRow?.level_ids) ? memberRow.level_ids.map(Number) : (memberRow?.level_id ? [Number(memberRow.level_id)] : [])
  )
  const [savingTeams, setSavingTeams] = useState(false)

  const EV = editing ? editVer : displayVer

  const roots = levels.filter(l => !l.parent_id)
  const getDepts = rootId => levels.filter(l => Number(l.parent_id) === Number(rootId))
  const getTeams = deptId => levels.filter(l => Number(l.parent_id) === Number(deptId))
  const toggleId = id => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const saveTeams = async () => {
    setSavingTeams(true)
    await supabase.from('members').update({ level_id: selectedIds[0] || null, level_ids: selectedIds }).eq('id', memberRow.id)
    setMembers(prev => prev.map(m => m.id === memberRow.id ? { ...m, level_id: selectedIds[0] || null, level_ids: selectedIds } : m))
    setSavingTeams(false); setEditingTeams(false)
  }

  // JD新規作成（DBが空の場合）
  const startCreateJD = () => {
    // JD_DEFAULTがあればそれをシードとして使う
    const seed = jdBase.versions?.[0] || {}
    setEditVer({ period: seed.period || '', role: seed.role || '', emp: seed.emp || '業務委託', working: seed.working || '', role_desc: seed.role_desc || '', responsibility: seed.responsibility || '', meetings: seed.meetings || '', tasks: JSON.parse(JSON.stringify(seed.tasks || [])) })
    setAddingNewVersion(false)
    setEditing(true)
  }

  // 新バージョン追加（最新バージョンをベースにコピー）
  const startAddVersion = () => {
    const latest = versions[versions.length - 1] || {}
    setEditVer({
      period: '',
      role: latest.role || '',
      emp: latest.emp || '業務委託',
      working: latest.working || '',
      role_desc: latest.role_desc || '',
      responsibility: latest.responsibility || '',
      meetings: latest.meetings || '',
      tasks: JSON.parse(JSON.stringify((latest.tasks || []).map(t => ({ ...t, status: 'same' })))),
    })
    setAddingNewVersion(true)
    setEditing(true)
  }

  // 既存バージョン編集
  const startEdit = () => {
    setEditVer({ ...displayVer, tasks: JSON.parse(JSON.stringify(displayVer.tasks || [])) })
    setAddingNewVersion(false)
    setEditing(true)
  }

  // 保存: 新バージョン or 既存バージョン更新
  const saveEdit = async () => {
    setSaving(true)
    const vi = addingNewVersion ? versions.length : effectiveVerIdx
    const payload = {
      member_id: memberName, version_idx: vi,
      period: editVer.period || '',
      role: editVer.role || '', emp: editVer.emp || '', working: editVer.working || '',
      role_desc: editVer.role_desc || '', responsibility: editVer.responsibility || '',
      meetings: editVer.meetings || '', tasks: JSON.stringify(editVer.tasks || []),
    }
    const { data } = await supabase.from('org_member_jd').upsert([payload], { onConflict: 'member_id,version_idx' }).select().single()
    // jdRowsを更新
    setJdRows(prev => {
      const existing = [...(prev[memberName] || [])]
      const idx = existing.findIndex(r => r.version_idx === vi)
      const newRow = data || { ...payload, id: Date.now() }
      if (idx >= 0) existing[idx] = newRow
      else existing.push(newRow)
      existing.sort((a, b) => a.version_idx - b.version_idx)
      return { ...prev, [memberName]: existing }
    })
    if (addingNewVersion) setVerIdx(vi)
    setSaved(true); setTimeout(() => setSaved(false), 1500); setSaving(false); setEditing(false); setAddingNewVersion(false)
  }

  // バージョン削除
  const deleteVersion = async (vi) => {
    if (!window.confirm(`V${vi + 1}を削除しますか？`)) return
    await supabase.from('org_member_jd').delete().eq('member_id', memberName).eq('version_idx', vi)
    setJdRows(prev => {
      const remaining = (prev[memberName] || []).filter(r => r.version_idx !== vi)
      // version_idxを詰め直す
      const reindexed = remaining.map((r, i) => ({ ...r, version_idx: i }))
      // DBのversion_idxも更新
      reindexed.forEach(async (r, i) => {
        if (r.version_idx !== remaining[i]?.version_idx) {
          await supabase.from('org_member_jd').update({ version_idx: i }).eq('member_id', memberName).eq('id', r.id)
        }
      })
      return { ...prev, [memberName]: reindexed }
    })
    setVerIdx(Math.max(0, vi - 1))
  }

  const deleteMember = async () => {
    if (!window.confirm(`「${memberName}」を削除しますか？`)) return
    await supabase.from('members').delete().eq('id', memberRow.id)
    setMembers(prev => prev.filter(m => m.id !== memberRow.id)); onBack()
  }
  const updateTask = (i, f, v) => setEditVer(p => { const t = [...p.tasks]; t[i] = { ...t[i], [f]: v }; return { ...p, tasks: t } })
  const addTask = () => setEditVer(p => ({ ...p, tasks: [...p.tasks, { cat: '', task: '', status: 'new' }] }))
  const removeTask = i => setEditVer(p => ({ ...p, tasks: p.tasks.filter((_, idx) => idx !== i) }))

  const box = { background: T().bgCard, border: `1px solid ${T().border}`, borderRadius: 10, padding: 16 }
  const ta = { width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 6, padding: '8px 10px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }

  return (
    <div>
      {/* 操作バー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', border: `1px solid ${T().border}`, background: T().bgInput, borderRadius: 7, fontSize: 12, cursor: 'pointer', color: T().textMuted, fontFamily: 'inherit' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(77,159,255,0.1)'; e.currentTarget.style.color = '#4d9fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = T().bgInput; e.currentTarget.style.color = T().textMuted }}
        >← メンバー一覧に戻る</button>

        {isAdmin && !editing && versions.length === 0 && (
          <button onClick={startCreateJD} style={{ padding: '7px 16px', border: '1px solid rgba(0,214,143,0.35)', background: 'rgba(0,214,143,0.1)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#00d68f', fontFamily: 'inherit' }}>
            ＋ JDを作成する
          </button>
        )}
        {isAdmin && !editing && versions.length > 0 && (
          <>
            <button onClick={startEdit} style={{ padding: '7px 16px', border: '1px solid rgba(255,209,102,0.35)', background: 'rgba(255,209,102,0.1)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#ffd166', fontFamily: 'inherit' }}>
              👑 このバージョンを編集
            </button>
            <button onClick={startAddVersion} style={{ padding: '7px 16px', border: '1px solid rgba(77,159,255,0.35)', background: 'rgba(77,159,255,0.1)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#4d9fff', fontFamily: 'inherit' }}>
              ＋ 新バージョンを追加
            </button>
          </>
        )}
        {isAdmin && editing && (
          <>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: addingNewVersion ? 'rgba(77,159,255,0.15)' : 'rgba(255,209,102,0.15)', color: addingNewVersion ? '#4d9fff' : '#ffd166', border: `1px solid ${addingNewVersion ? 'rgba(77,159,255,0.3)' : 'rgba(255,209,102,0.3)'}` }}>
              {addingNewVersion ? '＋ 新バージョン作成中' : `V${effectiveVerIdx + 1} 編集中`}
            </span>
            <SaveBtn saving={saving} saved={saved} onClick={saveEdit} label="保存する" />
            <button onClick={() => { setEditing(false); setAddingNewVersion(false) }} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${T().borderMid}`, background: 'transparent', color: T().textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          </>
        )}
        {isAdmin && memberRow && (
          <button onClick={deleteMember} style={{ marginLeft: 'auto', padding: '7px 14px', border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#ff6b6b', fontFamily: 'inherit' }}>
            🗑 メンバー削除
          </button>
        )}
      </div>

      {/* プロフィールヘッダー */}
      <div style={{ background: `linear-gradient(135deg, ${fg}, ${fg}bb)`, borderRadius: 12, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        <Avatar name={memberRow?.name} size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>{memberRow?.name || '（名前なし）'}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{memberRow?.role || '—'}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {editing ? (
              <>
                {addingNewVersion && (
                  <input value={editVer.period || ''} onChange={e => setEditVer(p => ({ ...p, period: e.target.value }))}
                    placeholder="期間 例: 2026年4月 〜現在"
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 5, padding: '3px 10px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit', minWidth: 200 }} />
                )}
                <input value={EV.role || ''} onChange={e => setEditVer(p => ({ ...p, role: e.target.value }))}
                  placeholder="役職"
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 5, padding: '3px 10px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit', minWidth: 180 }} />
                <select value={EV.emp || '業務委託'} onChange={e => setEditVer(p => ({ ...p, emp: e.target.value }))}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, padding: '3px 8px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}>
                  {EMP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <input value={EV.working || ''} onChange={e => setEditVer(p => ({ ...p, working: e.target.value }))} placeholder="稼働量"
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, padding: '3px 8px', color: '#fff', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: 100 }} />
              </>
            ) : (
              <>
                {EV.role && <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700 }}>{EV.role}</span>}
                {EV.emp && <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: empB.bg, color: empB.color, fontWeight: 700 }}>{EV.emp}</span>}
                {EV.working && <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.15)', color: '#fff' }}>{EV.working}</span>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 兼務チーム設定 */}
      {isAdmin && memberRow && (
        <div style={{ ...box, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editingTeams ? 12 : 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#606880', letterSpacing: '2px', textTransform: 'uppercase' }}>▶ 所属チーム（兼務設定）</div>
            {!editingTeams && <button onClick={() => setEditingTeams(true)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,209,102,0.3)', background: 'rgba(255,209,102,0.08)', color: '#ffd166', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>👑 変更</button>}
          </div>
          {editingTeams ? (
            <div>
              {roots.map(root =>
                getDepts(root.id).map(dept => {
                  const teams = getTeams(dept.id)
                  if (teams.length === 0) return null
                  const color = getDeptColor(dept.name)
                  return (
                    <div key={dept.id} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 5 }}>{dept.icon} {dept.name}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 10 }}>
                        {teams.map(team => {
                          const isSel = selectedIds.includes(team.id)
                          return (
                            <div key={team.id} onClick={() => toggleId(team.id)}
                              style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: isSel ? 700 : 400, background: isSel ? 'rgba(77,159,255,0.2)' : T().bgInput, border: `1px solid ${isSel ? 'rgba(77,159,255,0.5)' : T().border}`, color: isSel ? '#4d9fff' : T().textMuted, transition: 'all 0.15s' }}>
                              {isSel ? '✓ ' : ''}{team.icon} {team.name}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={saveTeams} disabled={savingTeams}
                  style={{ padding: '6px 18px', borderRadius: 7, border: 'none', background: '#4d9fff', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {savingTeams ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setEditingTeams(false)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${T().borderMid}`, background: 'transparent', color: T().textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {selectedIds.length > 0 ? selectedIds.map(id => {
                const lv = levels.find(l => Number(l.id) === id)
                return lv ? <span key={id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(77,159,255,0.12)', color: '#4d9fff', border: '1px solid rgba(77,159,255,0.25)' }}>{lv.icon} {lv.name}</span> : null
              }) : <span style={{ fontSize: 11, color: T().textFaintest, fontStyle: 'italic' }}>チーム未設定</span>}
            </div>
          )}
        </div>
      )}

      {/* バージョンタブ */}
      {versions.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4, alignItems: 'flex-end' }}>
          {versions.map((v, i) => {
            const isA = i === effectiveVerIdx && !addingNewVersion
            const label = v.period || `V${i + 1}`
            return (
              <button key={i} onClick={() => { setVerIdx(i); setEditing(false); setAddingNewVersion(false) }}
                style={{ padding: '8px 16px', fontSize: 11, fontWeight: isA ? 700 : 500, color: isA ? bg : T().textFaint, background: isA ? fg : T().bgCard2, border: `1px solid ${isA ? fg : T().border}`, borderRadius: '6px 6px 0 0', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                V{i + 1}: {label}
              </button>
            )
          })}
          {isAdmin && addingNewVersion && (
            <div style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, color: '#00d68f', background: 'rgba(0,214,143,0.15)', border: '1px solid #00d68f', borderRadius: '6px 6px 0 0', whiteSpace: 'nowrap' }}>
              ✎ 新バージョン作成中
            </div>
          )}
        </div>
      )}

      {versions.length === 0 && !editing && (
        <div style={{ ...box, marginBottom: 16, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
          <div style={{ fontSize: 14, color: T().textMuted, marginBottom: 6 }}>JDデータがまだ登録されていません</div>
          {isAdmin && (
            <div style={{ fontSize: 12, color: T().textFaintest }}>上の「＋ JDを作成する」ボタンから登録できます</div>
          )}
        </div>
      )}

      {/* 新規JD作成フォーム（versionsが空の場合） */}
      {versions.length === 0 && editing && (
        <div style={{ marginBottom: 16 }}>
          {/* period入力 */}
          <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 期間・役職</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 4 }}>期間</div>
                <input value={editVer.period || ''} onChange={e => setEditVer(p => ({ ...p, period: e.target.value }))}
                  placeholder="例: 2026年4月 〜現在"
                  style={{ width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 6, padding: '6px 8px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 4 }}>役職名</div>
                <input value={editVer.role || ''} onChange={e => setEditVer(p => ({ ...p, role: e.target.value }))}
                  placeholder="例: コミュニティマネージャー"
                  style={{ width: '100%', boxSizing: 'border-box', background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 6, padding: '6px 8px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 4 }}>雇用形態</div>
                <select value={editVer.emp || '業務委託'} onChange={e => setEditVer(p => ({ ...p, emp: e.target.value }))}
                  style={{ width: '100%', background: T().selectBg, border: `1px solid ${T().border}`, borderRadius: 6, padding: '6px 8px', color: T().text, fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
                  {EMP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: T().textFaint, marginBottom: 4 }}>稼働量</div>
              <input value={editVer.working || ''} onChange={e => setEditVer(p => ({ ...p, working: e.target.value }))}
                placeholder="例: 週3〜4日"
                style={{ width: 150, background: T().inputBg, border: `1px solid ${T().borderEdit}`, borderRadius: 6, padding: '6px 8px', color: T().inputText, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* 役割・責任範囲 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={box}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 役割</div>
              <textarea value={editVer.role_desc || ''} onChange={e => setEditVer(p => ({ ...p, role_desc: e.target.value }))} rows={5} placeholder="1行に1つ記載してください" style={ta} />
            </div>
            <div style={box}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 責任範囲</div>
              <textarea value={editVer.responsibility || ''} onChange={e => setEditVer(p => ({ ...p, responsibility: e.target.value }))} rows={5} placeholder="1行に1つ記載してください" style={ta} />
            </div>
          </div>

          {/* 主要定例 */}
          <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 主要定例</div>
            <textarea value={editVer.meetings || ''} onChange={e => setEditVer(p => ({ ...p, meetings: e.target.value }))} rows={4} placeholder="・定例名（頻度）" style={ta} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <SaveBtn saving={saving} saved={saved} onClick={saveEdit} label="JDを保存する" />
            <button onClick={() => setEditing(false)} style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${T().borderMid}`, background: 'transparent', color: T().textMuted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          </div>
        </div>
      )}

      {versions.length > 0 && (
        <>
          {/* 役割・責任範囲 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={box}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 役割</div>
              {editing ? <textarea value={EV.role_desc || ''} onChange={e => setEditVer(p => ({ ...p, role_desc: e.target.value }))} rows={5} style={ta} /> : (
                <div style={{ fontSize: 12, color: T().textMuted, lineHeight: 1.8, background: `${fg}12`, padding: 12, borderRadius: 8 }}>
                  {EV.role_desc ? EV.role_desc.split('\n').map((l, i) => <div key={i}>• {l}</div>) : <span style={{ color: T().textFaintest }}>—</span>}
                </div>
              )}
            </div>
            <div style={box}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 責任範囲</div>
              {editing ? <textarea value={EV.responsibility || ''} onChange={e => setEditVer(p => ({ ...p, responsibility: e.target.value }))} rows={5} style={ta} /> : (
                <div style={{ fontSize: 12, color: T().textMuted, lineHeight: 1.8, background: T().bgInput, padding: 12, borderRadius: 8 }}>
                  {EV.responsibility ? EV.responsibility.split('\n').map((l, i) => <div key={i}>• {l}</div>) : <span style={{ color: T().textFaintest }}>—</span>}
                </div>
              )}
            </div>
          </div>

          {/* 主要定例 */}
          <div style={{ ...box, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>▶ 主要定例</div>
            {editing ? <textarea value={EV.meetings || ''} onChange={e => setEditVer(p => ({ ...p, meetings: e.target.value }))} rows={4} style={ta} /> : (
              EV.meetings ? <div style={{ fontSize: 12, color: T().textMuted, lineHeight: 1.8, whiteSpace: 'pre-line', background: T().bgInput, padding: 12, borderRadius: 8 }}>{EV.meetings}</div> : <span style={{ fontSize: 12, color: T().textFaintest }}>—</span>
            )}
          </div>

          {/* 業務内容一覧 — org_tasks から owner でフィルタ（業務一覧タブと常に同期） */}
          {(() => {
            const memberName = memberRow?.name
            const ownerTasks = (tasks || []).filter(t => t.owner === memberName)
            const supportTasks = (tasks || []).filter(t => t.support && t.support.includes(memberName) && t.owner !== memberName)
            // チームごとにグループ化
            const grouped = {}
            ownerTasks.forEach(t => {
              const key = t.team || t.dept || '—'
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(t)
            })
            return (
              <div style={{ ...box, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase' }}>
                    ▶ 担当業務一覧（{ownerTasks.length}件）
                    <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: 'rgba(77,159,255,0.1)', color: '#4d9fff' }}>業務一覧と同期</span>
                  </div>
                </div>

                {ownerTasks.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: T().textFaintest, fontStyle: 'italic' }}>
                    業務一覧タブでこのメンバーを責任者に設定すると、ここに反映されます
                  </div>
                ) : (
                  Object.entries(grouped).map(([team, teamTasks]) => {
                    const color = getDeptColor(teamTasks[0]?.dept || '')
                    return (
                      <div key={team} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 3, height: 12, background: color, borderRadius: 2, display: 'inline-block' }} />
                          {team}
                        </div>
                        <div style={{ border: `1px solid ${T().border}`, borderRadius: 8, overflow: 'hidden', background: T().bgCard }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: T().bgTable }}>
                                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, borderBottom: `1px solid ${T().border}` }}>業務内容</th>
                                <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, color: T().textFaint, width: 110, borderBottom: `1px solid ${T().border}` }}>担当（サポート）</th>
                              </tr>
                            </thead>
                            <tbody>
                              {teamTasks.map((t, i) => (
                                <tr key={t.id} style={{ borderBottom: i < teamTasks.length - 1 ? `1px solid ${T().border}` : 'none' }}>
                                  <td style={{ padding: '8px 12px', fontSize: 12, color: T().textSub, lineHeight: 1.5 }}>{t.task}</td>
                                  <td style={{ padding: '8px 12px' }}>
                                    {t.support ? (
                                      <span style={{ fontSize: 11, color: T().textFaint, padding: '2px 7px', background: T().bgInput, borderRadius: 5 }}>{t.support}</span>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })
                )}

                {/* サポート業務（担当欄に名前が入っているもの） */}
                {supportTasks.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '1px', marginBottom: 8 }}>
                      サポート業務（{supportTasks.length}件）
                    </div>
                    <div style={{ border: `1px solid ${T().border}`, borderRadius: 8, overflow: 'hidden', background: T().bgCard }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {supportTasks.map((t, i) => (
                            <tr key={t.id} style={{ borderBottom: i < supportTasks.length - 1 ? `1px solid ${T().border}` : 'none', background: T().bgHover }}>
                              <td style={{ padding: '7px 12px' }}>
                                <span style={{ fontSize: 10, color: T().textFaint, padding: '2px 6px', background: T().bgInput, borderRadius: 4 }}>{t.team}</span>
                              </td>
                              <td style={{ padding: '7px 12px', fontSize: 12, color: T().textMuted, lineHeight: 1.5 }}>{t.task}</td>
                              <td style={{ padding: '7px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <Avatar name={t.owner} size={16} />
                                  <span style={{ fontSize: 11, color: avatarColor(t.owner) }}>{t.owner}</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* 役職推移タイムライン（リッチ可視化） */}
          <div style={box}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, letterSpacing: '2px', textTransform: 'uppercase' }}>▶ 役職推移タイムライン</div>
              <span style={{ fontSize: 10, color: T().textFaintest }}>{versions.length}バージョン</span>
            </div>

            {/* 雇用形態変遷グラフ */}
            {versions.length > 1 && (
              <div style={{ marginBottom: 20, padding: '12px 16px', background: T().bgCard2, borderRadius: 8, border: `1px solid ${T().border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T().textFaint, marginBottom: 10 }}>雇用形態・稼働量の推移</div>
                <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', borderRadius: 6, overflow: 'hidden', height: 32 }}>
                  {versions.map((v, i) => {
                    const empB = getEmpBadge(v.emp || '')
                    const isLast = i === versions.length - 1
                    return (
                      <div key={i} onClick={() => { setVerIdx(i); setEditing(false) }}
                        style={{ flex: 1, background: i === effectiveVerIdx ? empB.color : `${empB.color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#fff', borderRight: isLast ? 'none' : '2px solid rgba(255,255,255,0.15)', transition: 'all 0.15s', position: 'relative', minWidth: 0 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 6px' }}>V{i + 1}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
                  {versions.map((v, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: i === effectiveVerIdx ? T().text : T().textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>
                      {v.emp ? v.emp.split('→')[0] : '—'}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {[...new Set(versions.map(v => v.emp).filter(Boolean))].map(emp => {
                    const b = getEmpBadge(emp)
                    return <span key={emp} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: b.bg, color: b.color }}>{emp}</span>
                  })}
                </div>
              </div>
            )}

            {/* バージョン縦並びタイムライン */}
            <div style={{ position: 'relative', paddingLeft: 32 }}>
              <div style={{ position: 'absolute', left: 10, top: 8, bottom: 8, width: 2, background: `${fg}30`, borderRadius: 1 }} />
              {versions.map((v, i) => {
                const isLatest = i === versions.length - 1
                const isCurrent = i === effectiveVerIdx
                const empB = getEmpBadge(v.emp || '')
                const taskCount = (v.tasks || []).filter(t => t.status !== 'del').length
                // 前バージョンとの差分
                const prev = i > 0 ? versions[i - 1] : null
                const roleChanged = prev && prev.role !== v.role
                const empChanged = prev && prev.emp !== v.emp

                return (
                  <div key={i} style={{ position: 'relative', marginBottom: i < versions.length - 1 ? 4 : 0 }}>
                    {/* タイムラインドット */}
                    <div style={{ position: 'absolute', left: -26, top: 16, width: 14, height: 14, borderRadius: '50%', background: isLatest ? fg : (isCurrent ? fg : T().bgCard2), border: `2px solid ${isLatest || isCurrent ? fg : T().borderMid}`, boxShadow: isLatest ? `0 0 10px ${fg}80` : 'none', zIndex: 1 }} />
                    {/* コネクタライン */}
                    {i < versions.length - 1 && (
                      <div style={{ position: 'absolute', left: -20, top: 30, width: 2, height: 'calc(100% - 10px)', background: `${fg}20` }} />
                    )}

                    <div onClick={() => { setVerIdx(i); setEditing(false) }}
                      style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 8, background: isCurrent ? `${fg}12` : T().bgCard2, border: `1px solid ${isCurrent ? fg + '50' : T().border}`, transition: 'all 0.15s' }}
                      onMouseEnter={e => { if (!isCurrent) { e.currentTarget.style.background = T().bgHover; e.currentTarget.style.borderColor = fg + '30' } }}
                      onMouseLeave={e => { if (!isCurrent) { e.currentTarget.style.background = T().bgCard2; e.currentTarget.style.borderColor = T().border } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                            {isLatest && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: fg, color: bg }}>最新</span>}
                            <span style={{ fontSize: 11, color: isCurrent ? fg : T().textFaint, fontWeight: isCurrent ? 700 : 400 }}>
                              V{i + 1} {v.period && `— ${v.period}`}
                            </span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: isCurrent ? T().text : T().textMuted, lineHeight: 1.4 }}>
                            {roleChanged && <span style={{ fontSize: 10, marginRight: 6, padding: '1px 6px', borderRadius: 3, background: 'rgba(255,209,102,0.15)', color: '#ffd166' }}>役職変更</span>}
                            {v.role || '（役職未設定）'}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: empB.bg, color: empB.color, fontWeight: 700 }}>
                              {empChanged && '↑ '}{v.emp || '—'}
                            </span>
                            {v.working && <span style={{ fontSize: 10, color: T().textFaint }}>{v.working}</span>}
                            {taskCount > 0 && <span style={{ fontSize: 10, color: T().textFaintest, marginLeft: 4 }}>業務 {taskCount}件</span>}
                          </div>
                        </div>
                        {/* 管理者：バージョン削除ボタン */}
                        {isAdmin && versions.length > 1 && dbRows.length > 0 && (
                          <button onClick={e => { e.stopPropagation(); deleteVersion(i) }}
                            style={{ padding: '3px 7px', borderRadius: 5, background: 'transparent', border: `1px solid ${T().border}`, color: T().textFaintest, fontSize: 10, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
                            ✕
                          </button>
                        )}
                      </div>

                      {/* JD_DEFAULTからDBへのシード促進メッセージ */}
                      {dbRows.length === 0 && isAdmin && i === versions.length - 1 && (
                        <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(77,159,255,0.08)', borderRadius: 6, fontSize: 10, color: '#4d9fff', border: '1px dashed rgba(77,159,255,0.25)' }}>
                          💡 このデータはデフォルト値です。「このバージョンを編集」から保存するとDBに記録されます
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* 新バージョン追加プレースホルダー */}
              {isAdmin && !editing && versions.length > 0 && (
                <div onClick={startAddVersion}
                  style={{ position: 'relative', padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: `1px dashed rgba(0,214,143,0.3)`, background: 'rgba(0,214,143,0.04)', display: 'flex', alignItems: 'center', gap: 8, color: '#00d68f', fontSize: 12 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,214,143,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,214,143,0.04)'}
                >
                  <div style={{ position: 'absolute', left: -26, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: '50%', border: '2px dashed rgba(0,214,143,0.5)', background: T().bgCard }} />
                  ＋ 新しいバージョンを追加
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// メインページ
// ══════════════════════════════════════════════════
export default function OrgPage({ themeKey = 'dark', user, fiscalYear = '2026' }) {
  // グローバルテーマを更新
  _T = THEMES[themeKey] || THEMES.dark

  const [activeTab, setActiveTab] = useState('chart')
  const [jumpMemberName, setJumpMemberName] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const { levels, teamMeta, members, tasks, jdRows, loading, syncStatus, setLevels, setTeamMeta, setMembers, setTasks, setJdRows } = useOrgData(fiscalYear)

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.email) return
      const { data } = await supabase.from('members').select('is_admin').eq('email', user.email).single()
      if (data?.is_admin) setIsAdmin(true)
    }
    checkAdmin()
  }, [user])

  const handleMemberClick = name => { setJumpMemberName(name); setActiveTab('members') }
  const handleTeamMetaUpdate = (levelId, meta) => setTeamMeta(prev => ({ ...prev, [levelId]: { ...(prev[levelId] || {}), ...meta } }))

  const tabs = [
    { id: 'chart',   icon: '🏗', label: '組織図' },
    { id: 'tasks',   icon: '📋', label: '業務一覧' },
    { id: 'members', icon: '👤', label: 'メンバーJD' },
  ]


  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T().bg, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T().bg, color: T().text, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#4d9fff', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>Organization</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T().text }}>🏢 組織</div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: fiscalYear === '2026' ? 'rgba(77,159,255,0.15)' : 'rgba(255,159,67,0.15)', color: fiscalYear === '2026' ? '#4d9fff' : '#ff9f43', border: `1px solid ${fiscalYear === '2026' ? 'rgba(77,159,255,0.3)' : 'rgba(255,159,67,0.3)'}` }}>{fiscalYear}年度</span>
            {isAdmin && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(255,209,102,0.15)', color: '#ffd166', border: '1px solid rgba(255,209,102,0.3)', fontWeight: 700 }}>👑 管理者</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 13, color: T().textFaint }}>NEO福岡の組織図・業務一覧・メンバー別JDを確認できます</div>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
              background: syncStatus === 'synced' ? 'rgba(0,214,143,0.12)' : syncStatus === 'error' ? 'rgba(255,107,107,0.12)' : 'rgba(255,209,102,0.12)',
              color: syncStatus === 'synced' ? '#00d68f' : syncStatus === 'error' ? '#ff6b6b' : '#ffd166',
              border: `1px solid ${syncStatus === 'synced' ? 'rgba(0,214,143,0.3)' : syncStatus === 'error' ? 'rgba(255,107,107,0.3)' : 'rgba(255,209,102,0.3)'}`,
            }}>
              {syncStatus === 'synced' ? '🟢 リアルタイム同期中' : syncStatus === 'error' ? '🔴 同期エラー' : '🟡 接続中...'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${T().border}`, marginBottom: 24 }}>
          {tabs.map(t => {
            const isA = activeTab === t.id
            return (
              <button key={t.id}
                onClick={() => { setActiveTab(t.id); if (t.id !== 'members') setJumpMemberName(null) }}
                style={{ padding: '10px 24px', fontSize: 13, fontWeight: isA ? 700 : 500, color: isA ? '#4d9fff' : T().textFaint, borderBottom: `3px solid ${isA ? '#4d9fff' : 'transparent'}`, marginBottom: -2, cursor: 'pointer', border: 'none', background: isA ? 'rgba(77,159,255,0.08)' : 'transparent', borderRadius: '8px 8px 0 0', transition: 'all 0.15s', fontFamily: 'inherit' }}>
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'chart' && (
          <OrgChart levels={levels} teamMeta={teamMeta} members={members} onMemberClick={handleMemberClick} isAdmin={isAdmin} onTeamMetaUpdate={handleTeamMetaUpdate} />
        )}
        {activeTab === 'tasks' && (
          <TaskList tasks={tasks} setTasks={setTasks} members={members} onMemberClick={handleMemberClick} isAdmin={isAdmin} />
        )}
        {activeTab === 'members' && (
          <MemberJDTab
            members={members} setMembers={setMembers}
            levels={levels}
            tasks={tasks}
            jdRows={jdRows} setJdRows={setJdRows}
            isAdmin={isAdmin}
            initialName={jumpMemberName}
            onClearJump={() => setJumpMemberName(null)}
          />
        )}
      </div>
    </div>
  )
}

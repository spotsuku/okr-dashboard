'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { cardStyle, pillStyle, btnPrimary, btnSecondary, btnGhost, btnDanger, inputStyle, btnBrand } from '../lib/iosStyles'

// ─── 日付ユーティリティ (JST) ─────────────────────────
function toJSTDateStr(d) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return jst.toISOString().split('T')[0]
}
function getMondayJSTStr(d = new Date()) {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const wd = jst.getUTCDay()
  const diff = wd === 0 ? -6 : 1 - wd
  const mon = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + diff))
  return mon.toISOString().split('T')[0]
}
// week_start (YYYY-MM-DD) に offsetWeeks 足した週のラベル (例: "4/14週")
function formatWeekLabel(weekStartStr, offsetWeeks = 0) {
  const [y, m, d] = weekStartStr.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d + offsetWeeks * 7)
  const dt = new Date(t)
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}週`
}
// period の正規化 (アプリ標準: "YYYY_q1" 等の接頭辞を除去 → "q1")。
// MyOKRPage / okrData と同じ規則。これを通さず生比較すると接頭辞付き期間が
// スコープから漏れる (記入カードに KA が出ない不具合の原因)。
function rawPeriod(period) { return period?.includes('_') ? period.split('_').pop() : period }
// 現在のQ判定 (4-6月=q1 / 7-9=q2 / 10-12=q3 / 1-3=q4)
function getCurrentQuarter() {
  const m = new Date().getMonth()
  if (m >= 3 && m <= 5) return 'q1'
  if (m >= 6 && m <= 8) return 'q2'
  if (m >= 9 && m <= 11) return 'q3'
  return 'q4'
}
// 今週のMondayから offset日後のJST 00:00 のタイムスタンプ
function weekdayDeadlineMs(offset) {
  const [y, m, d] = getMondayJSTStr().split('-').map(Number)
  // JST 00:00 = UTC前日15:00
  return Date.UTC(y, m - 1, d + offset, -9, 0, 0)
}
function formatCountdown(deadlineMs) {
  const diff = deadlineMs - Date.now()
  if (diff <= 0) {
    const pastHours = Math.floor((-diff) / 3600000)
    const pastDays = Math.floor(pastHours / 24)
    if (pastDays > 0) return { text: `${pastDays}日 超過`, overdue: true, urgent: true }
    return { text: `${pastHours}時間 超過`, overdue: true, urgent: true }
  }
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(hrs / 24)
  if (days > 0) return { text: `あと ${days}日${hrs % 24}時間`, overdue: false, urgent: days === 0 && hrs < 24 }
  return { text: `あと ${hrs}時間`, overdue: false, urgent: true }
}

const MODE_CONFIG = {
  kr: {
    title: 'KR記入モード',
    iconName: 'target',
    cta: '今週のKRを振り返り確認しよう！',
    deadlineLabel: '木曜 00:00 JST まで',
    deadlineOffset: 3,  // 月曜+3 = 木曜
    // accent/accentBg は mode 別アクセント。T が無い module スコープのため
    // 近似トークン値 (kr=info/accent, ka=success) を直値で保持。
    accent: '#0284c7',
    accentBg: 'rgba(2,132,199,0.14)',
  },
  ka: {
    title: 'KA記入モード',
    iconName: 'note',
    cta: 'KAの振り返りと注力事項を確認しよう！',
    deadlineLabel: '金曜 00:00 JST まで',
    deadlineOffset: 4,  // 月曜+4 = 金曜
    accent: '#059669',
    accentBg: 'rgba(5,150,105,0.14)',
  },
}

// 天気 (KR 自信度): icon は Icon name に変更
const WEATHER_OPTIONS = [
  { v: 0, icon: 'circle', label: '未設定' },
  { v: 1, icon: 'rain',   label: '雨' },
  { v: 2, icon: 'cloud',  label: '曇り' },
  { v: 3, icon: 'partly', label: '晴れ時々曇り' },
  { v: 4, icon: 'sun',    label: '晴れ' },
  { v: 5, icon: 'sun',    label: '快晴' },
]

// KA ステータス選択肢 (MyCoachPage と同じ値・色味で揃える)
// label の emoji は Icon に置換、color は近似トークン直値
const KA_STATUS_OPTIONS = [
  { key: 'focus',  iconName: 'target', label: 'Focus', color: '#0284c7' },
  { key: 'good',   iconName: 'check',  label: 'Good',  color: '#059669' },
  { key: 'more',   iconName: 'flag',   label: 'More',  color: '#e11d48' },
  { key: 'normal', iconName: null,     label: '未着手', color: '#8E8E93' },
  { key: 'done',   iconName: 'check',  label: '完了',   color: '#7a8599' },
]

// ─── メインコンポーネント ───────────────────────────
export default function FocusFillModal({ open, onClose, T, viewingName, myName, isAdmin = false, initialMode = 'kr', levels = [] }) {
  const isViewingSelf = viewingName === myName
  const canEdit = isViewingSelf || isAdmin   // 管理者は他メンバーも編集可
  const [mode, setMode] = useState(initialMode)
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState({ kr: [], ka: [] })      // カード一覧
  const [index, setIndex] = useState({ kr: 0, ka: 0 })        // 各モードの現在位置
  const [draft, setDraft] = useState({ good: '', more: '', focus: '', weather: 0, current: 0, refUrls: [] })
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)               // 記入済みも含めて表示
  const [completed, setCompleted] = useState({ kr: false, ka: false })
  const [objMap, setObjMap] = useState({})
  // 先週の Good/More/Focus を参照表示するためのマップ
  // KR: kr_id → kr_weekly_reviews row (先週分)
  // KA: ka_key (or `${kr_id}|${ka_title}`) → weekly_reports row (先週分)
  const [prevKrMap, setPrevKrMap] = useState({})
  const [prevKaMap, setPrevKaMap] = useState({})
  const [swipeDelta, setSwipeDelta] = useState(0)  // D: スワイプ時のX移動量
  // フィルタ:
  //   periodFilter: 'auto' (現Q+通期, 既定) | 'q1' | 'q2' | 'q3' | 'q4' | 'annual' | 'all'
  //   deptFilter:   'all'  (既定) | 事業部の level_id (string)
  const [periodFilter, setPeriodFilter] = useState('auto')
  const [deptFilter,   setDeptFilter]   = useState('all')

  // levels を id→level の map に
  const levelMap = useMemo(() => {
    const m = {}; (levels || []).forEach(l => { m[String(l.id)] = l }); return m
  }, [levels])
  // level_id → "部署 · チーム" ラベル
  const deptLabelOf = useCallback((levelId) => {
    if (!levelId) return ''
    const lv = levelMap[String(levelId)]
    if (!lv) return ''
    const parent = lv.parent_id ? levelMap[String(lv.parent_id)] : null
    if (parent) return `${parent.name} · ${lv.name}`
    return lv.name
  }, [levelMap])
  // level_id から所属する「事業部」(=ルート直下のレベル) の id を返す
  const deptIdOf = useCallback((levelId) => {
    if (!levelId) return null
    const lv = levelMap[String(levelId)]
    if (!lv) return null
    return lv.parent_id ? String(lv.parent_id) : String(lv.id)
  }, [levelMap])
  // 事業部の選択肢 (= parent_id が root (= depth 0 = 全社) の levels)
  // 旧: filter(l => !l.parent_id) では root 自身 (= 全社) しか取れず、本来の事業部が漏れる
  const deptOptions = useMemo(() => {
    const rootIds = new Set((levels || []).filter(l => !l.parent_id).map(l => Number(l.id)))
    return (levels || [])
      .filter(l => l.parent_id && rootIds.has(Number(l.parent_id)))
      .map(l => ({ id: String(l.id), name: l.name }))
  }, [levels])

  // KR は今週金曜のレビュー会議に反映 → weekStart = 今週月曜
  const krWeekStart = useMemo(() => getMondayJSTStr(), [])
  // KA は基本は翌月曜の週次キックオフに反映。ただし翌週レコードが未作成の場合は今週にフォールバック。
  // kaWeekStart は load() 内で実データを見て動的に決定 (state)。
  const [kaWeekStart, setKaWeekStart] = useState(() => getMondayJSTStr())
  const weekStartOf = (kind) => (kind === 'kr' ? krWeekStart : kaWeekStart)
  // 会議日 ラベル (反映先)
  const meetingLabel = useCallback((kind) => {
    const [y, m, d] = (kind === 'kr' ? krWeekStart : kaWeekStart).split('-').map(Number)
    // KR → weekStart+4(金), KA → weekStart+0(月)
    const offset = kind === 'kr' ? 4 : 0
    const dt = new Date(Date.UTC(y, m - 1, d + offset))
    const wd = ['日', '月', '火', '水', '木', '金', '土'][dt.getUTCDay()]
    const name = kind === 'kr' ? 'KRレビュー会議' : '週次キックオフ'
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}(${wd}) の${name}`
  }, [krWeekStart, kaWeekStart])
  const krDeadline = useMemo(() => weekdayDeadlineMs(MODE_CONFIG.kr.deadlineOffset), [])
  const kaDeadline = useMemo(() => weekdayDeadlineMs(MODE_CONFIG.ka.deadlineOffset), [])

  // ─── データ取得 ───
  const load = useCallback(async () => {
    if (!viewingName) return
    setLoading(true)

    // KA 候補週: 今週と翌週
    const currentMon = getMondayJSTStr()
    const [cy, cm, cd] = currentMon.split('-').map(Number)
    const nextMon = new Date(Date.UTC(cy, cm - 1, cd + 7)).toISOString().split('T')[0]
    // 先週分 (参考表示用): KR は krWeekStart -7日 / KA は currentMon -7日
    const [py, pm, pd] = krWeekStart.split('-').map(Number)
    const prevKrWeekStart = new Date(Date.UTC(py, pm - 1, pd - 7)).toISOString().split('T')[0]
    const prevMon = new Date(Date.UTC(cy, cm - 1, cd - 7)).toISOString().split('T')[0]

    const [krsRes, krReviewsRes, kasRes, objsRes, prevKrReviewsRes, prevKasRes] = await Promise.all([
      supabase.from('key_results').select('id, title, target, current, unit, owner, objective_id, archived_at').eq('owner', viewingName).range(0, 49999),
      supabase.from('kr_weekly_reviews').select('*').eq('week_start', krWeekStart).range(0, 49999),
      supabase.from('weekly_reports').select('id, ka_title, kr_id, kr_title, level_id, objective_id, owner, status, good, more, focus_output, week_start, reference_urls, ka_key')
        .eq('owner', viewingName).in('week_start', [currentMon, nextMon]).neq('status', 'done').range(0, 49999),
      supabase.from('objectives').select('id, title, period, level_id').is('archived_at', null).range(0, 49999),
      // 先週分の参照 (読み取り専用、入力エリア上部に表示)
      supabase.from('kr_weekly_reviews').select('*').eq('week_start', prevKrWeekStart).range(0, 49999),
      supabase.from('weekly_reports').select('kr_id, ka_title, good, more, focus_output, ka_key')
        .eq('owner', viewingName).eq('week_start', prevMon).range(0, 49999),
    ])

    // 先週マップ: KR は kr_id をキーに、KA は ka_key 優先 (なければ kr_id|ka_title)
    setPrevKrMap(Object.fromEntries((prevKrReviewsRes.data || []).map(r => [String(r.kr_id), r])))
    const prevKaMapBuilt = {}
    ;(prevKasRes.data || []).forEach(r => {
      const key = r.ka_key || `${r.kr_id}|${(r.ka_title || '').trim()}`
      if (!prevKaMapBuilt[key]) prevKaMapBuilt[key] = r
    })
    setPrevKaMap(prevKaMapBuilt)

    // KA の対象週を決定
    // ・今日が月曜 & 今週分が存在 → 今週 (その日のキックオフ向け)
    // ・それ以外 → 翌週 (次のキックオフ向け)
    //   翌週レコードが未作成なら今週からコピーして自動作成
    const jstDay = new Date(Date.now() + 9 * 3600 * 1000).getUTCDay()
    let allKas = kasRes.data || []
    let nextWeekKas = allKas.filter(k => k.week_start === nextMon)
    const currentWeekKas = allKas.filter(k => k.week_start === currentMon)

    let chosenKaWeek
    if (jstDay === 1 && currentWeekKas.length > 0) {
      chosenKaWeek = currentMon
    } else {
      chosenKaWeek = nextMon
      // 翌週レコードが無く、今週レコードがあれば編集権限者の場合自動コピー
      if (nextWeekKas.length === 0 && currentWeekKas.length > 0 && canEdit) {
        const copies = currentWeekKas.map(r => ({
          week_start: nextMon, level_id: r.level_id, objective_id: r.objective_id,
          kr_id: r.kr_id, kr_title: r.kr_title, ka_title: r.ka_title,
          owner: r.owner, status: 'normal',
        }))
        const { data: inserted, error: insErr } = await supabase.from('weekly_reports').insert(copies).select()
        if (!insErr && inserted) {
          nextWeekKas = inserted
          allKas = [...allKas, ...inserted]
        } else if (insErr) {
          // コピー失敗時は今週にフォールバック
          chosenKaWeek = currentMon
        }
      } else if (nextWeekKas.length === 0 && currentWeekKas.length > 0 && !canEdit) {
        // 閲覧のみユーザーは作成できないので今週を見せる
        chosenKaWeek = currentMon
      }
    }
    if (chosenKaWeek !== kaWeekStart) setKaWeekStart(chosenKaWeek)
    const chosenKas = allKas.filter(k => k.week_start === chosenKaWeek)

    // archived_at 列が無い古い環境向けフォールバック (列なしで再取得)
    let krsData = krsRes.data
    if (krsRes.error && /archived_at|column/i.test(krsRes.error.message || '')) {
      const r = await supabase.from('key_results').select('id, title, target, current, unit, owner, objective_id').eq('owner', viewingName).range(0, 49999)
      krsData = r.data
    }
    // アーカイブ済み KR は記入モーダルに表示しない
    const krs = (krsData || []).filter(kr => !kr.archived_at)
    const krReviewsMap = Object.fromEntries((krReviewsRes.data || []).map(r => [r.kr_id, r]))
    const om = {}; (objsRes.data || []).forEach(o => { om[o.id] = o }); setObjMap(om)

    // 期間フィルタ:
    //   'auto'       → 現Q + 通期 (既定)
    //   'q1'..'q4'   → そのQのみ
    //   'annual'     → 通期のみ
    //   'all'        → すべて
    const curQ = getCurrentQuarter()
    const inPeriod = (objId) => {
      const p = rawPeriod(om[objId]?.period)
      if (!p) return false
      if (periodFilter === 'all') return true
      if (periodFilter === 'auto') return p === curQ || p === 'annual'
      return p === periodFilter
    }
    // 事業部フィルタ:
    //   'all' → すべて
    //   それ以外 → その事業部 (level_id) 配下の objective のみ
    const inDept = (objId) => {
      if (deptFilter === 'all') return true
      const lvId = om[objId]?.level_id
      return deptIdOf(lvId) === deptFilter
    }
    const inScope = (objId) => inPeriod(objId) && inDept(objId)

    // KR キュー: 今Q + 通期、かつ (showAll=OFF → 未記入のみ / showAll=ON → 全件)
    const krQueue = krs
      .filter(kr => inScope(kr.objective_id))
      .filter(kr => {
        if (showAll) return true
        const r = krReviewsMap[kr.id]
        if (!r) return true
        const allTextEmpty = !((r.good || '').trim() || (r.more || '').trim() || (r.focus || '').trim() || (r.focus_output || '').trim())
        const weatherUnset = (r.weather || 0) === 0
        return allTextEmpty && weatherUnset  // 完全空白のみ対象
      })
      .map(kr => ({
        kind: 'kr',
        kr,
        review: krReviewsMap[kr.id] || null,
        objective: om[kr.objective_id] || null,
      }))

    // KA キュー: 今Q + 通期、かつ (showAll=OFF → 未記入のみ / showAll=ON → 全件)
    const kaQueue = chosenKas
      .filter(ka => inScope(ka.objective_id))
      .filter(ka => {
        if (showAll) return true
        return !((ka.good || '').trim() || (ka.more || '').trim() || (ka.focus_output || '').trim())
      })
      .map(ka => ({
        kind: 'ka',
        ka,
        objective: om[ka.objective_id] || null,
      }))

    // ── 一時診断ログ (KA記入0件の原因調査用。原因確定後に削除する) ──
    console.warn('[KA-DIAG]', JSON.stringify({
      viewingName, currentMon, nextMon, chosenKaWeek,
      allKas: allKas.length,
      currentWeekKas: currentWeekKas.length,
      nextWeekKas: nextWeekKas.length,
      chosenKas: chosenKas.length,
      kaQueue: kaQueue.length,
      periodFilter, deptFilter, curQ,
      sample: chosenKas.slice(0, 6).map(k => ({
        ws: k.week_start, owner: k.owner, objId: k.objective_id,
        period: om[k.objective_id]?.period, rawP: rawPeriod(om[k.objective_id]?.period),
        inScope: inScope(k.objective_id),
        good: (k.good || '').slice(0, 8), more: (k.more || '').slice(0, 8), fo: (k.focus_output || '').slice(0, 8),
        status: k.status, kr_id: k.kr_id, title: (k.ka_title || '').slice(0, 16),
      })),
    }))

    setQueue({ kr: krQueue, ka: kaQueue })
    setIndex({ kr: 0, ka: 0 })
    setCompleted({ kr: krQueue.length === 0, ka: kaQueue.length === 0 })
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingName, krWeekStart, showAll, periodFilter, deptFilter, deptIdOf])  // kaWeekStart は load 内で動的決定するため依存から外す

  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => { if (open) setMode(initialMode) }, [open, initialMode])

  // ─── 現在のカードが変わったら draft を初期化 ───
  const currentCard = queue[mode]?.[index[mode]]
  useEffect(() => {
    if (!currentCard) {
      setDraft({ good: '', more: '', focus: '', weather: 0, current: 0, refUrls: [] })
      return
    }
    if (currentCard.kind === 'kr') {
      const r = currentCard.review
      setDraft({
        good: r?.good || '',
        more: r?.more || '',
        focus: r?.focus || '',
        weather: r?.weather || 0,
        current: currentCard.kr.current ?? 0,
        refUrls: Array.isArray(r?.reference_urls) ? r.reference_urls : [],
      })
    } else {
      const ka = currentCard.ka
      setDraft({
        good: ka.good || '',
        more: ka.more || '',
        focus: ka.focus_output || '',  // KA側では focus_output カラム
        weather: 0,  // KAには weather なし
        current: 0,  // KA には current なし
        refUrls: Array.isArray(ka.reference_urls) ? ka.reference_urls : [],
      })
    }
  }, [currentCard?.kind, currentCard?.kr?.id, currentCard?.ka?.id])

  // ─── 保存 ───
  async function handleSaveNext() {
    if (!currentCard) return
    if (!canEdit) return   // 本人 or 管理者のみ保存可
    const filled = (draft.good || '').trim() || (draft.more || '').trim() || (draft.focus || '').trim()
    // KR の進捗変更も「書いた」とみなす
    const progressChanged = currentCard.kind === 'kr'
      && Number(draft.current) !== Number(currentCard.kr.current ?? 0)
    if (!filled && !progressChanged) {
      // 空のまま保存はスキップ扱い
      return moveNext()
    }

    // 参考URL クリーンアップ (URL未入力は除外)
    const cleanUrls = (draft.refUrls || [])
      .map(u => ({ label: (u.label || '').trim(), url: (u.url || '').trim() }))
      .filter(u => u.url)

    setSaving(true)
    if (currentCard.kind === 'kr') {
      const payload = {
        kr_id: currentCard.kr.id,
        week_start: krWeekStart,
        weather: Number(draft.weather) || 0,
        good: draft.good || '',
        more: draft.more || '',
        focus: draft.focus || '',
        reference_urls: cleanUrls,
      }
      // upsert on (kr_id, week_start)
      const { error } = await supabase.from('kr_weekly_reviews')
        .upsert(payload, { onConflict: 'kr_id,week_start' })
      if (error) { setSaving(false); alert('KR保存エラー: ' + error.message); return }
      // KR の進捗 (current) 更新
      const newCurrent = Number(draft.current)
      const prevCurrent = Number(currentCard.kr.current ?? 0)
      if (!isNaN(newCurrent) && newCurrent !== prevCurrent) {
        const { error: e2 } = await supabase.from('key_results')
          .update({ current: newCurrent }).eq('id', currentCard.kr.id)
        if (e2) { setSaving(false); alert('KR進捗保存エラー: ' + e2.message); return }
        currentCard.kr.current = newCurrent
      }
    } else {
      const payload = {
        good: draft.good || '',
        more: draft.more || '',
        focus_output: draft.focus || '',
        reference_urls: cleanUrls,
      }
      const { error } = await supabase.from('weekly_reports')
        .update(payload).eq('id', currentCard.ka.id)
      if (error) { setSaving(false); alert('KA保存エラー: ' + error.message); return }
    }
    setSaving(false)
    moveNext()
  }

  function moveNext() {
    const q = queue[mode]
    const nextIdx = index[mode] + 1
    if (nextIdx >= q.length) {
      setCompleted(c => ({ ...c, [mode]: true }))
    } else {
      setIndex(i => ({ ...i, [mode]: nextIdx }))
    }
  }

  // KA ステータス変更
  //   newStatus='done' の場合はキューから即時除外して次のカードへ進む
  async function handleKaStatusChange(newStatus) {
    if (!currentCard || currentCard.kind !== 'ka' || !canEdit) return
    const ka = currentCard.ka
    const prevStatus = ka.status || 'normal'
    if (prevStatus === newStatus) return
    // 楽観更新: DOM のステータスバッジを先に切り替える
    ka.status = newStatus
    const { error } = await supabase.from('weekly_reports')
      .update({ status: newStatus }).eq('id', ka.id)
    if (error) {
      ka.status = prevStatus
      alert('ステータス変更エラー: ' + error.message)
      return
    }
    if (newStatus === 'done') {
      // 完了したKAはキューから外して次に進む
      const curIdx = index.ka
      const newQ = queue.ka.filter((_, i) => i !== curIdx)
      setQueue(prev => ({ ...prev, ka: newQ }))
      if (newQ.length === 0) {
        setCompleted(c => ({ ...c, ka: true }))
      } else if (curIdx >= newQ.length) {
        setIndex(i => ({ ...i, ka: newQ.length - 1 }))
      }
      // curIdx < newQ.length の場合は index 据え置きで次のカードが自然に出る
    } else {
      // 再描画用にキューを浅コピー
      setQueue(prev => ({ ...prev, ka: [...prev.ka] }))
    }
  }

  function moveBack() {
    setIndex(i => ({ ...i, [mode]: Math.max(0, i[mode] - 1) }))
    setCompleted(c => ({ ...c, [mode]: false }))
  }

  function skipCard() {
    // キューの末尾に移動
    const q = [...queue[mode]]
    const cur = q.splice(index[mode], 1)[0]
    q.push(cur)
    setQueue(prev => ({ ...prev, [mode]: q }))
    // indexはそのままで次のカードが表示される
    if (index[mode] >= q.length - 1) {
      setIndex(i => ({ ...i, [mode]: 0 }))
    }
  }

  // ─── D: スワイプジェスチャ ───
  const touchStartX = useMemo(() => ({ x: 0 }), [])
  const onTouchStart = (e) => {
    // textarea/button/input に触れた場合は無視
    const tag = e.target?.tagName?.toLowerCase()
    if (tag === 'textarea' || tag === 'input' || tag === 'button' || tag === 'select') return
    touchStartX.x = e.touches[0].clientX
    setSwipeDelta(0)
  }
  const onTouchMove = (e) => {
    if (!touchStartX.x) return
    const delta = e.touches[0].clientX - touchStartX.x
    setSwipeDelta(delta)
  }
  const onTouchEnd = () => {
    const THRESHOLD = 80
    const delta = swipeDelta
    touchStartX.x = 0
    setSwipeDelta(0)
    if (Math.abs(delta) < THRESHOLD) return
    if (delta < -THRESHOLD) {
      // 左スワイプ: 保存して次へ (本人 or 管理者)
      if (canEdit && !saving) handleSaveNext()
    } else if (delta > THRESHOLD) {
      // 右スワイプ: 戻る
      if (!saving) moveBack()
    }
  }

  if (!open) return null

  const cfg = MODE_CONFIG[mode]
  const q = queue[mode]
  const current = q[index[mode]]
  const remaining = Math.max(0, q.length - index[mode])
  const done = Math.max(0, q.length - remaining)
  const total = q.length
  const progressPct = total === 0 ? 100 : Math.round((done / total) * 100)
  const deadline = mode === 'kr' ? krDeadline : kaDeadline
  const countdown = formatCountdown(deadline)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.35)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: SPACING.xl,
      animation: 'focusFillFade 0.2s ease',
    }}>
      <style>{`
        @keyframes focusFillFade { from {opacity:0} to {opacity:1} }
        @keyframes focusFillSlide { from {transform:translateY(20px); opacity:0} to {transform:translateY(0); opacity:1} }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, borderRadius: RADIUS.xl,
        width: '100%', maxWidth: 720, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: SHADOWS.xl,
        animation: 'focusFillSlide 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* ─── モード切替タブ ─── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          borderBottom: `1px solid ${T.border}`, background: T.sectionBg,
          padding: `${SPACING.sm + 2}px ${SPACING.md + 2}px 0 ${SPACING.md + 2}px`, gap: 0, flexWrap: 'wrap',
        }}>
          {['kr', 'ka'].map(m => {
            const isActive = mode === m
            const mc = MODE_CONFIG[m]
            const count = queue[m]?.length || 0
            return (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: `${SPACING.sm}px ${SPACING.md + 2}px ${SPACING.sm + 2}px ${SPACING.md + 2}px`, border: 'none',
                background: isActive ? T.bgCard : 'transparent',
                borderRadius: `${RADIUS.sm}px ${RADIUS.sm}px 0 0`,
                borderBottom: isActive ? `2px solid ${mc.accent}` : '2px solid transparent',
                color: isActive ? T.text : T.textMuted,
                ...TYPO.callout, cursor: 'pointer', fontFamily: 'inherit',
                marginBottom: -1,
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs + 2,
              }}>
                <Icon name={mc.iconName} size={14} />
                {mc.title}
                {count > 0 && <span style={{
                  marginLeft: SPACING.xs + 2, padding: '1px 7px', borderRadius: RADIUS.pill,
                  background: mc.accent, color: '#fff', ...TYPO.caption, fontWeight: 700,
                }}>{count}</span>}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          {/* 期間フィルタ */}
          <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
            title="期間で絞り込み" style={{
              ...TYPO.caption, fontWeight: 700, color: T.textSub, background: T.bgCard,
              border: `1px solid ${T.border}`, borderRadius: RADIUS.xs,
              padding: `${SPACING.xs - 1}px ${SPACING.sm}px`, marginRight: SPACING.xs + 2, marginBottom: SPACING.xs + 2,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <option value="auto">自動 (現Q+通期)</option>
            <option value="q1">Q1</option>
            <option value="q2">Q2</option>
            <option value="q3">Q3</option>
            <option value="q4">Q4</option>
            <option value="annual">通期</option>
            <option value="all">全期間</option>
          </select>
          {/* 事業部フィルタ */}
          {deptOptions.length > 0 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              title="事業部で絞り込み" style={{
                ...TYPO.caption, fontWeight: 700, color: T.textSub, background: T.bgCard,
                border: `1px solid ${T.border}`, borderRadius: RADIUS.xs,
                padding: `${SPACING.xs - 1}px ${SPACING.sm}px`, marginRight: SPACING.xs + 2, marginBottom: SPACING.xs + 2,
                cursor: 'pointer', fontFamily: 'inherit', maxWidth: 180,
              }}>
              <option value="all">全事業部</option>
              {deptOptions.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          {/* 全件表示 トグル */}
          <button onClick={() => setShowAll(v => !v)} style={{
            ...TYPO.caption, fontWeight: 700, color: showAll ? '#fff' : T.textSub,
            background: showAll ? cfg.accent : 'transparent',
            border: `1px solid ${showAll ? cfg.accent : T.border}`,
            borderRadius: RADIUS.xs, padding: `${SPACING.xs - 1}px ${SPACING.sm + 2}px`, marginRight: SPACING.xs + 2, marginBottom: SPACING.xs + 2,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }} title="記入済みカードも含めて見直す">
            <Icon name="note" size={11} />
            {showAll ? '全件表示 ON' : '全件表示'}
          </button>
          {/* 閲覧中のユーザー + 権限バッジ */}
          <div style={{
            ...TYPO.caption, fontWeight: 700, color: T.textMuted, padding: `${SPACING.xs}px ${SPACING.sm}px`,
            background: canEdit ? (isViewingSelf ? T.accentBg : T.warnBg) : 'rgba(122,133,153,0.12)',
            borderRadius: RADIUS.xs, marginRight: SPACING.sm, marginBottom: SPACING.xs + 2,
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}>
            <Icon name={isViewingSelf ? 'pencil' : isAdmin ? 'star' : 'eye'} size={11} />
            {isViewingSelf ? `${viewingName} (自分)`
              : isAdmin ? `${viewingName} (管理者編集)`
              : `${viewingName} (閲覧のみ)`}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textMuted,
            cursor: 'pointer', fontFamily: 'inherit', padding: `${SPACING.xs - 2}px ${SPACING.sm + 2}px`,
            marginBottom: SPACING.xs + 2,
            display: 'inline-flex', alignItems: 'center',
          }}><Icon name="cross" size={20} /></button>
        </div>

        {/* ─── CTA + 進捗 + 締切 ─── */}
        <div style={{ padding: `${SPACING.md + 2}px ${SPACING.xl}px`, borderBottom: `1px solid ${T.border}`, background: cfg.accentBg }}>
          <div style={{ ...TYPO.title3, color: cfg.accent, marginBottom: SPACING.xs + 2 }}>
            {cfg.cta}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, ...TYPO.footnote, fontWeight: 600, color: T.textSub }}>
            <div style={{ flex: 1 }}>
              <div style={{
                height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: RADIUS.pill, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${progressPct}%`, background: cfg.accent,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ marginTop: SPACING.xs, fontWeight: 600 }}>
                {done} / {total} 完了 (残り{remaining}件)
              </div>
            </div>
            <div style={{
              padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.xs,
              background: countdown.overdue ? T.dangerBg :
                          countdown.urgent ? T.warnBg : 'rgba(255,255,255,0.3)',
              color: countdown.overdue ? T.danger : countdown.urgent ? T.warn : T.text,
              fontWeight: 700, ...TYPO.footnote, whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}>
              <Icon name={countdown.overdue ? 'alert' : countdown.urgent ? 'alert' : 'clock'} size={12} />
              {cfg.deadlineLabel.split(' ')[0]} · {countdown.text}
            </div>
          </div>
        </div>

        {/* ─── カード本体 (スワイプ対応) ─── */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            flex: 1, overflowY: 'auto', padding: SPACING['2xl'], minHeight: 0,
            transform: `translateX(${swipeDelta}px)`,
            transition: swipeDelta === 0 ? 'transform 0.2s ease' : 'none',
            opacity: Math.abs(swipeDelta) > 120 ? 0.5 : 1,
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: T.textMuted }}>読み込み中...</div>
          ) : completed[mode] || q.length === 0 ? (
            <CompletionScreen T={T} mode={mode} q={q} onClose={onClose}
              showAll={showAll} onShowAll={() => setShowAll(true)} />
          ) : current ? (
            <CardView T={T} card={current} draft={draft} setDraft={setDraft} cfg={cfg}
              readOnly={!canEdit} deptLabelOf={deptLabelOf}
              weekStart={weekStartOf(current.kind)}
              meetingText={meetingLabel(current.kind)}
              prevRecord={
                current.kind === 'kr'
                  ? prevKrMap[String(current.kr?.id)]
                  : prevKaMap[current.ka?.ka_key || `${current.ka?.kr_id}|${(current.ka?.ka_title || '').trim()}`]
              }
              onKaStatusChange={handleKaStatusChange} />
          ) : null}
        </div>

        {/* ─── フッター操作 ─── */}
        {!loading && !completed[mode] && q.length > 0 && (
          <div style={{
            display: 'flex', gap: SPACING.sm, padding: `${SPACING.md}px ${SPACING.xl}px`,
            borderTop: `1px solid ${T.border}`, background: T.sectionBg,
            alignItems: 'center',
          }}>
            <button onClick={skipCard} disabled={saving || q.length <= 1} style={{
              ...btnSecondary({ T, size: 'md' }), border: `1px solid ${T.borderMid}`,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              opacity: q.length <= 1 ? 0.5 : 1,
            }}><Icon name="chevronR" size={13} /> 後で</button>
            <button onClick={moveBack} disabled={saving || index[mode] === 0} style={{
              ...btnSecondary({ T, size: 'md' }), border: `1px solid ${T.borderMid}`,
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              opacity: index[mode] === 0 ? 0.4 : 1,
            }}><Icon name="chevronL" size={13} /> 戻る</button>
            <div style={{ flex: 1, ...TYPO.caption, fontWeight: 700, color: T.textFaint, textAlign: 'center', display: 'none' }} className="swipe-hint">
              スワイプで戻る / 右スワイプで保存
            </div>
            <div style={{ flex: 1 }} />
            {canEdit ? (
              <button onClick={handleSaveNext} disabled={saving} style={{
                ...btnPrimary({ T, size: 'lg', color: cfg.accent }),
                cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}>
                <Icon name={index[mode] === q.length - 1 ? 'trophy' : 'check'} size={14} />
                {saving ? '保存中...' : (index[mode] === q.length - 1 ? '保存して完了' : '保存して次へ')}
              </button>
            ) : (
              <button onClick={moveNext} disabled={index[mode] === q.length - 1} style={{
                ...btnPrimary({ T, size: 'lg' }),
                opacity: index[mode] === q.length - 1 ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}>次へ <Icon name="arrowRight" size={14} /></button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── カード表示 ────────────────────────────────────────
function CardView({ T, card, draft, setDraft, cfg, readOnly = false, deptLabelOf, weekStart, meetingText, onKaStatusChange, prevRecord = null }) {
  const isKR = card.kind === 'kr'
  const kr = card.kr
  const ka = card.ka
  const obj = card.objective
  const title = isKR ? kr.title : (ka.ka_title || '(無題)')
  const deptLabel = obj ? deptLabelOf?.(obj.level_id) : ''
  const isAnnual = rawPeriod(obj?.period) === 'annual'
  // 週ラベル (絶対日のみ)
  // KR: good/more = weekStart週、focus = weekStart+1週
  // KA: good/more = weekStart-1週、focus = weekStart週
  const goodMoreOffset = isKR ? 0 : -1
  const focusOffset = isKR ? 1 : 0
  const goodMoreWk = formatWeekLabel(weekStart, goodMoreOffset)
  const focusWk = formatWeekLabel(weekStart, focusOffset)

  // 進捗更新の現在値 (UI表示用)
  const curVal = isKR ? Number(draft.current) || 0 : 0
  const tgtVal = isKR ? (Number(kr.target) || 0) : 0
  const curPct = tgtVal ? Math.round((curVal / tgtVal) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
      {/* 反映先会議 */}
      {meetingText && (
        <div style={{
          ...TYPO.footnote, fontWeight: 700, color: cfg.accent,
          background: cfg.accentBg, padding: `${SPACING.xs + 2}px ${SPACING.sm + 2}px`,
          borderRadius: RADIUS.xs, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs, alignSelf: 'flex-start',
        }}><Icon name="arrowRight" size={12} /> {meetingText} に反映</div>
      )}
      {/* コンテキスト: 部署·チーム → Objective → タイトル */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, flexWrap: 'wrap', marginBottom: SPACING.xs }}>
          {/* 期間バッジ (通期 / Q1〜Q4 を一目で分ける) — 期間別カラーは data palette */}
          {obj && (() => {
            const periodBase = (obj.period || '').toString().includes('_')
              ? obj.period.split('_').pop()
              : obj.period
            const periodCfg = {
              annual: { label: '通期', bg: 'rgba(142,142,147,0.18)', fg: '#6b7280', border: 'rgba(142,142,147,0.40)' },
              q1:     { label: 'Q1',  bg: 'rgba(0,122,255,0.18)',   fg: '#1d4ed8', border: 'rgba(0,122,255,0.45)' },
              q2:     { label: 'Q2',  bg: 'rgba(52,199,89,0.18)',   fg: '#0a8f5a', border: 'rgba(52,199,89,0.45)' },
              q3:     { label: 'Q3',  bg: 'rgba(255,149,0,0.18)',   fg: '#c2410c', border: 'rgba(255,149,0,0.45)' },
              q4:     { label: 'Q4',  bg: 'rgba(175,82,222,0.18)',  fg: '#7e22ce', border: 'rgba(175,82,222,0.45)' },
            }[periodBase] || { label: (obj.period || '?').toUpperCase(), bg: 'rgba(0,0,0,0.06)', fg: T.textSub, border: 'rgba(0,0,0,0.10)' }
            return (
              <span style={{
                ...TYPO.footnote, fontWeight: 800, padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.sm,
                background: periodCfg.bg, color: periodCfg.fg,
                border: `1px solid ${periodCfg.border}`,
                letterSpacing: '0.04em',
              }}>{periodCfg.label}</span>
            )
          })()}
          {deptLabel && (
            <span style={{
              ...pillStyle({ color: T.textSub, size: 'sm' }), gap: SPACING.xs,
              background: 'rgba(122,133,153,0.15)', color: T.textSub, letterSpacing: 0.3,
            }}><Icon name="building" size={11} /> {deptLabel}</span>
          )}
          {obj && (
            <span style={{ ...TYPO.caption, color: T.textMuted, fontWeight: 700, letterSpacing: 0.5 }}>
              OBJECTIVE {obj.title && <span style={{ color: T.textSub, fontWeight: 500, marginLeft: SPACING.xs }}>{obj.title}</span>}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACING.sm, marginBottom: SPACING.xs + 2 }}>
          <span style={{
            ...TYPO.caption, fontWeight: 700, padding: `${SPACING.xs - 1}px ${SPACING.sm}px`, borderRadius: RADIUS.pill,
            background: cfg.accentBg, color: cfg.accent,
          }}>{isKR ? 'KR' : 'KA'}</span>
          <div style={{ ...TYPO.title3, fontSize: 17, color: T.text, lineHeight: 1.4 }}>
            {title}
          </div>
        </div>
        {isKR && kr.target != null && kr.target !== '' && (
          <div style={{ ...TYPO.footnote, color: T.textMuted }}>
            目標 {kr.target}{kr.unit || ''} · 現在 {curVal}{kr.unit || ''} ({curPct}%)
          </div>
        )}
        {!isKR && ka.kr_title && (
          <div style={{ ...TYPO.footnote, color: T.textMuted }}>
            所属KR: {ka.kr_title}
          </div>
        )}
        {/* KA ステータス切替 (完了にすると一覧から非表示) */}
        {!isKR && (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, marginTop: SPACING.sm, flexWrap: 'wrap' }}>
            <span style={{ ...TYPO.caption, color: T.textMuted, fontWeight: 700, marginRight: 2 }}>状態</span>
            {KA_STATUS_OPTIONS.map(opt => {
              const active = (ka.status || 'normal') === opt.key
              return (
                <button key={opt.key}
                  onClick={() => !readOnly && onKaStatusChange?.(opt.key)}
                  disabled={readOnly}
                  title={opt.key === 'done' ? '完了にすると次回からこのKAは表示されません' : undefined}
                  style={{
                    ...TYPO.caption, padding: `${SPACING.xs - 1}px ${SPACING.sm + 1}px`, borderRadius: RADIUS.pill,
                    background: active ? `${opt.color}22` : 'transparent',
                    color: active ? opt.color : T.textFaint,
                    border: `1px solid ${active ? opt.color : T.border}`,
                    fontWeight: 700, fontFamily: 'inherit',
                    cursor: readOnly ? 'not-allowed' : 'pointer',
                    opacity: readOnly ? 0.6 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                  }}>
                  {opt.iconName && <Icon name={opt.iconName} size={11} />}{opt.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* KR のみ: 進捗更新 */}
      {isKR && (
        <div>
          <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.textSub, marginBottom: SPACING.xs + 2, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
            <Icon name="chart" size={13} /> 今週時点の進捗を更新
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
            <input type="number"
              value={draft.current}
              onChange={e => !readOnly && setDraft(d => ({ ...d, current: e.target.value }))}
              readOnly={readOnly}
              style={{
                ...inputStyle({ T }), width: 120,
                background: T.sectionBg, border: `1px solid ${T.borderMid}`,
                fontWeight: 700,
              }} />
            <span style={{ ...TYPO.callout, color: T.textSub }}>{kr.unit || ''}</span>
            <span style={{ ...TYPO.footnote, color: T.textMuted }}>
              / 目標 {kr.target || 0}{kr.unit || ''} ({curPct}%)
            </span>
          </div>
        </div>
      )}

      {/* KR のみ: 天気 */}
      {isKR && (
        <div>
          <div style={{ ...TYPO.footnote, fontWeight: 700, color: T.textSub, marginBottom: SPACING.xs + 2, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
            <Icon name="partly" size={13} /> {goodMoreWk} の体感・主観
          </div>
          <div style={{ display: 'flex', gap: SPACING.xs }}>
            {WEATHER_OPTIONS.slice(1).map(w => (
              <button key={w.v}
                onClick={() => !readOnly && setDraft(d => ({ ...d, weather: w.v }))}
                disabled={readOnly}
                style={{
                  flex: 1, padding: `${SPACING.sm + 2}px ${SPACING.xs}px`,
                  background: Number(draft.weather) === w.v ? cfg.accentBg : 'transparent',
                  border: `1px solid ${Number(draft.weather) === w.v ? cfg.accent : T.border}`,
                  borderRadius: RADIUS.sm, cursor: readOnly ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  color: T.text, ...TYPO.caption, fontWeight: 700, opacity: readOnly ? 0.6 : 1,
                }}>
                <Icon name={w.icon} size={18} />
                <span>{w.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 先週の記入を参考表示 (社員からの要望: 漏れ確認のため) */}
      <PrevReferenceBlock T={T} prev={prevRecord} isKR={isKR} weekStart={weekStart} />

      {/* 3 フィールド (絶対日のみ) */}
      <FieldRow T={T} iconName="check" label={`${goodMoreWk} good — 良かったこと・続けたいこと`}
        color={T.success} readOnly={readOnly}
        value={draft.good} onChange={v => setDraft(d => ({ ...d, good: v }))}
        placeholder="例: 評議会で3社のクロージングが確定した" />
      <FieldRow T={T} iconName="flag" label={`${goodMoreWk} more — 課題・改善点`}
        color={T.danger} readOnly={readOnly}
        value={draft.more} onChange={v => setDraft(d => ({ ...d, more: v }))}
        placeholder="例: 午前中の集中が切れがちだった" />
      <FieldRow T={T} iconName="target" label={`${focusWk} focus — ${isKR ? '注力アクション' : 'Moreへの対応策'}`}
        color={T.accent} readOnly={readOnly}
        value={draft.focus} onChange={v => setDraft(d => ({ ...d, focus: v }))}
        placeholder="例: 月曜朝90分はSlack offで提案書作成に集中" />

      {/* 参考URL (任意・複数・ラベル付き) */}
      <RefUrlsEditor T={T} value={draft.refUrls || []}
        onChange={urls => setDraft(d => ({ ...d, refUrls: urls }))}
        readOnly={readOnly} />
    </div>
  )
}

// ─── 参考URL エディタ (label + url の複数入力) ───────────────
function RefUrlsEditor({ T, value, onChange, readOnly }) {
  const list = value || []
  const add = () => onChange([...list, { label: '', url: '' }])
  const remove = (i) => onChange(list.filter((_, j) => j !== i))
  const update = (i, field, v) => onChange(list.map((u, j) => j === i ? { ...u, [field]: v } : u))
  return (
    <div style={{
      padding: `${SPACING.md}px ${SPACING.md + 2}px`, background: T.sectionBg, borderRadius: RADIUS.md,
      border: `1px solid ${T.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <div style={{ ...TYPO.subhead, fontWeight: 700, color: T.textSub, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
          <Icon name="link" size={13} /> 参考URL (任意)
        </div>
        {!readOnly && (
          <button type="button" onClick={add} style={{
            padding: `${SPACING.xs - 1}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.xs,
            background: 'transparent', color: T.accent, border: `1px solid ${T.accent}40`,
            ...TYPO.caption, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><Icon name="plus" size={11} /> 追加</button>
        )}
      </div>
      {list.length === 0 ? (
        <div style={{ ...TYPO.caption, fontWeight: 700, color: T.textFaint }}>
          {readOnly ? '(なし)' : 'URL を貼り付けると会議メモなどへリンクできます'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
          {list.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: SPACING.xs + 2, alignItems: 'center' }}>
              <input type="text" value={u.label || ''}
                onChange={e => !readOnly && update(i, 'label', e.target.value)}
                placeholder="ラベル"
                disabled={readOnly}
                style={{
                  ...inputStyle({ T }), flex: '0 0 130px', padding: `${SPACING.xs + 2}px ${SPACING.sm + 1}px`, ...TYPO.footnote,
                }} />
              <input type="url" value={u.url || ''}
                onChange={e => !readOnly && update(i, 'url', e.target.value)}
                placeholder="https://..."
                disabled={readOnly}
                style={{
                  ...inputStyle({ T }), flex: 1, padding: `${SPACING.xs + 2}px ${SPACING.sm + 1}px`, ...TYPO.footnote,
                }} />
              {!readOnly && (
                <button type="button" onClick={() => remove(i)} style={{
                  flexShrink: 0, padding: `${SPACING.xs}px ${SPACING.sm}px`, borderRadius: RADIUS.xs,
                  background: 'transparent', color: T.danger, border: `1px solid ${T.danger}30`,
                  ...TYPO.caption, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center',
                }}><Icon name="cross" size={11} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 先週の good/more/focus を読み取り専用で表示
// 社員からの要望: 「先週の記入が見えていると今週の漏れ確認に使える」
function PrevReferenceBlock({ T, prev, isKR, weekStart }) {
  const [open, setOpen] = useState(true)
  if (!prev) return null
  const good = (prev.good || '').trim()
  const more = (prev.more || '').trim()
  const focus = (prev.focus || prev.focus_output || '').trim()
  const allEmpty = !good && !more && !focus
  // 先週ラベル (= weekStart - 7日)
  const [y, m, d] = (weekStart || '').split('-').map(Number)
  const prevD = new Date(Date.UTC(y || 2026, (m || 1) - 1, (d || 1) - 7))
  const sundayD = new Date(prevD); sundayD.setUTCDate(prevD.getUTCDate() + 6)
  const label = `${prevD.getUTCMonth() + 1}/${prevD.getUTCDate()}〜${sundayD.getUTCMonth() + 1}/${sundayD.getUTCDate()}`

  if (allEmpty) {
    return (
      <div style={{
        ...TYPO.footnote, color: T.textMuted, padding: `${SPACING.xs + 2}px ${SPACING.md}px`,
        background: T.sectionBg, borderRadius: RADIUS.sm,
        fontStyle: 'italic',
        display: 'flex', alignItems: 'center', gap: SPACING.xs,
      }}>
        <Icon name="calendar" size={12} /> 先週 ({label}) は未記入でした
      </div>
    )
  }

  return (
    <div style={{
      background: T.sectionBg, borderRadius: RADIUS.sm, padding: `${SPACING.sm}px ${SPACING.md}px ${SPACING.sm + 2}px`,
      border: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2,
    }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          ...TYPO.footnote, fontWeight: 700, color: T.textSub,
          display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, padding: 0,
          fontFamily: 'inherit', textAlign: 'left',
        }}>
        <Icon name={open ? 'chevronD' : 'chevronR'} size={11} style={{ color: T.textMuted }} />
        <Icon name="calendar" size={12} />
        <span>先週 ({label}) の記入 — 参考</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs, marginTop: 2 }}>
          {good && <PrevLine T={T} iconName="check" label="good" text={good} color={T.success} />}
          {more && <PrevLine T={T} iconName="flag" label="more" text={more} color={T.danger} />}
          {focus && <PrevLine T={T} iconName="target" label="focus" text={focus} color={T.accent} />}
        </div>
      )}
    </div>
  )
}

function PrevLine({ T, iconName, label, text, color }) {
  return (
    <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start' }}>
      <span style={{
        ...TYPO.caption, fontWeight: 700, color, flexShrink: 0,
        padding: `2px ${SPACING.xs + 3}px`, borderRadius: RADIUS.xs, background: `${color}15`,
        whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
      }}><Icon name={iconName} size={10} />{label}</span>
      <span style={{ ...TYPO.subhead, fontWeight: 500, color: T.textSub, lineHeight: 1.5, whiteSpace: 'pre-wrap', flex: 1, minWidth: 0 }}>{text}</span>
    </div>
  )
}

function FieldRow({ T, iconName, label, color, value, onChange, placeholder, readOnly = false }) {
  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: SPACING.xs, ...TYPO.footnote, fontWeight: 700,
        color, background: `${color}18`, borderRadius: RADIUS.xs,
        padding: `${SPACING.xs - 1}px ${SPACING.sm}px`, marginBottom: SPACING.xs,
      }}><Icon name={iconName} size={12} />{label}</div>
      <textarea
        value={value} onChange={e => onChange(e.target.value)}
        readOnly={readOnly}
        rows={3} placeholder={readOnly ? '' : placeholder}
        style={{
          ...inputStyle({ T }),
          ...TYPO.callout, fontWeight: 500, lineHeight: 1.6,
          background: T.sectionBg, border: `1px solid ${T.borderMid}`,
          resize: 'vertical', minHeight: 72,
          cursor: readOnly ? 'default' : 'text',
        }}
      />
    </div>
  )
}

// ─── 完了画面 ────────────────────────────────────────
function CompletionScreen({ T, mode, q, onClose, showAll, onShowAll }) {
  const mc = MODE_CONFIG[mode]
  const isEmpty = q.length === 0
  return (
    <div style={{ textAlign: 'center', padding: `${SPACING['3xl'] + 8}px ${SPACING.xl}px` }}>
      <div style={{ marginBottom: SPACING.md, color: isEmpty ? T.accent : T.warn, display: 'flex', justifyContent: 'center' }}>
        <Icon name={isEmpty ? 'sparkle' : 'trophy'} size={48} stroke={1.4} />
      </div>
      <div style={{ ...TYPO.title2, color: T.text, marginBottom: SPACING.xs + 2 }}>
        {isEmpty ? '記入すべき項目はありません' : '完璧です！お疲れさまでした'}
      </div>
      <div style={{ ...TYPO.subhead, fontWeight: 500, color: T.textMuted, marginBottom: SPACING['2xl'] }}>
        {isEmpty
          ? `${mc.title}の未記入項目はありません。`
          : `${q.length}件の ${mode === 'kr' ? 'KR' : 'KA'} レビューを完成しました。`}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: SPACING.sm, flexWrap: 'wrap' }}>
        {!showAll && onShowAll && (
          <button onClick={onShowAll} style={{
            ...btnSecondary({ T, size: 'lg' }), border: `1px solid ${mc.accent}`,
            color: mc.accent,
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><Icon name="note" size={13} /> 記入済みも含めて見直す</button>
        )}
        <button onClick={onClose} style={{
          ...btnPrimary({ T, size: 'lg', color: mc.accent }),
        }}>閉じる</button>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { useCurrentOrg } from './orgContext'
import { MEETINGS, WEEKLY_MTG_MEETINGS } from './meetings'

// ─────────────────────────────────────────────────────────────
// SaaS 化 Phase 5b: 組織別の会議リストを DB から読み込むインフラ
//
// 既存 lib/meetings.js の固定リスト MEETINGS / WEEKLY_MTG_MEETINGS と互換な形式で
// organization_meetings テーブルから会議リストを取得する。
//
// テーブル未作成 / seed 未投入 / 取得失敗 のフォールバックとして既存定数を使うので、
// SQL 未適用環境でも壊れない。
// ─────────────────────────────────────────────────────────────

// modules から legacy weeklyMTG.flow を推定する。
// DB の target_filter に flow が抜けていても、modules 構成から「KA重点 / KR重点」
// を妥当に決められるようフォールバックする。
// (例: program-regular の DB 行が target_filter:{scope,requiresProgram} だけで
//  flow を持っていなかったため KR重点扱いになっていた問題への対策)
function inferFlowFromModules(modules) {
  if (!Array.isArray(modules) || modules.length === 0) return null
  const types = modules.map(m => m?.type).filter(Boolean)
  // KA 系モジュールが含まれていれば KA 重点
  if (types.some(t => t === 'ka_review' || t === 'ka_loop')) return 'ka'
  // KR 系のみなら KR 重点
  if (types.some(t => t === 'kr_review' || t === 'kr_loop')) return 'kr'
  return null
}

// DB の organization_meetings 行を、既存 MEETINGS と互換な形式に変換
function rowToMeeting(row) {
  // weeklyMTG (旧 target_filter) を組み立て。target_filter に flow が無くても
  // modules 構成から推定して補完する。
  const baseFilter = row.key !== 'morning' ? (row.target_filter || {}) : null
  const wkly = baseFilter
    ? (baseFilter.flow ? baseFilter : { ...baseFilter, flow: inferFlowFromModules(row.modules) || baseFilter.flow })
    : null
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    icon: row.icon,
    color: row.color,
    modules: row.modules || [],
    target_filter: row.target_filter,
    day_of_week: row.day_of_week,
    // 既存 MEETINGS との互換フィールド
    schedule: dayOfWeekToLabel(row.day_of_week),
    weeklyMTG: wkly,
  }
}

function dayOfWeekToLabel(dow) {
  if (dow == null) return '任意'
  return ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'][dow] || '任意'
}

// React Hook: 現在組織の会議リスト (フォールバック付き)
export function useOrganizationMeetings() {
  const { currentOrg, loading: orgLoading } = useCurrentOrg()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState('fallback')  // 'db' | 'fallback' | 'empty'

  useEffect(() => {
    if (orgLoading) return
    let alive = true

    if (!currentOrg?.id) {
      // 組織未読込時は空
      setMeetings([])
      setSource('empty')
      setLoading(false)
      return
    }

    setLoading(true)
    supabase.from('organization_meetings')
      .select('id, key, title, icon, color, modules, target_filter, day_of_week, sort_order')
      .eq('organization_id', currentOrg.id)
      .is('archived_at', null)
      .order('sort_order')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          // テーブル未作成: NEO福岡だけは旧固定リストにフォールバック (既存運用保護)
          // それ以外の新規組織は空配列で開始 (= 自分で会議を作る)
          console.warn('[orgMeetings] table missing:', error.message)
          if (currentOrg.slug === 'neo-fukuoka') {
            setMeetings(MEETINGS); setSource('fallback')
          } else {
            setMeetings([]); setSource('empty')
          }
        } else if (!data || data.length === 0) {
          // テーブルにレコードなし: NEO福岡だけ旧固定リスト、他は空
          if (currentOrg.slug === 'neo-fukuoka') {
            setMeetings(MEETINGS); setSource('fallback')
          } else {
            setMeetings([]); setSource('empty')
          }
        } else {
          setMeetings(data.map(rowToMeeting))
          setSource('db')
        }
        setLoading(false)
      })

    return () => { alive = false }
  }, [currentOrg?.id, currentOrg?.slug, orgLoading])

  return { meetings, loading, source }
}

// React Hook: WeeklyMTG 用 (= 朝会以外の会議)
export function useWeeklyMTGMeetings() {
  const { meetings, loading, source } = useOrganizationMeetings()
  // DB 取得時は modules が空でない会議 = 週次MTG 系。フォールバック時は既存定義に従う。empty は空配列。
  const list = source === 'db'
    ? meetings.filter(m => m.key !== 'morning')
    : source === 'fallback'
      ? WEEKLY_MTG_MEETINGS
      : []
  return { meetings: list, loading, source }
}

// 単一の会議を key で取得 (= 既存 getMeeting の代替)
export function useMeeting(key) {
  const { meetings, loading } = useOrganizationMeetings()
  const meeting = meetings.find(m => m.key === key) || null
  return { meeting, loading }
}

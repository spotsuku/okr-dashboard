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

// DB の organization_meetings 行を、既存 MEETINGS と互換な形式に変換
function rowToMeeting(row) {
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
    // 既存 weeklyMTG プロパティの代替 (target_filter にマージ)
    weeklyMTG: row.modules?.length && row.key !== 'morning' ? (row.target_filter || {}) : null,
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
  const [source, setSource] = useState('fallback')  // 'db' | 'fallback'

  useEffect(() => {
    if (orgLoading) return
    let alive = true

    if (!currentOrg?.id) {
      // 組織未読込時は既存 MEETINGS をフォールバック
      setMeetings(MEETINGS)
      setSource('fallback')
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
        if (error || !data || data.length === 0) {
          // テーブル未作成 / seed 未投入時のフォールバック
          if (error) console.warn('[orgMeetings] fallback to MEETINGS:', error.message)
          setMeetings(MEETINGS)
          setSource('fallback')
        } else {
          setMeetings(data.map(rowToMeeting))
          setSource('db')
        }
        setLoading(false)
      })

    return () => { alive = false }
  }, [currentOrg?.id, orgLoading])

  return { meetings, loading, source }
}

// React Hook: WeeklyMTG 用 (= 朝会以外の会議)
export function useWeeklyMTGMeetings() {
  const { meetings, loading, source } = useOrganizationMeetings()
  // DB 取得時は modules が空でない会議 = 週次MTG 系。フォールバック時は既存定義に従う
  const list = source === 'db'
    ? meetings.filter(m => m.key !== 'morning')
    : WEEKLY_MTG_MEETINGS
  return { meetings: list, loading, source }
}

// 単一の会議を key で取得 (= 既存 getMeeting の代替)
export function useMeeting(key) {
  const { meetings, loading } = useOrganizationMeetings()
  const meeting = meetings.find(m => m.key === key) || null
  return { meeting, loading }
}

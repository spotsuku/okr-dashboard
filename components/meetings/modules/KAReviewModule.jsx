'use client'
import ModuleSkeleton from './_skeleton'

// KA 確認モジュール
// Phase 5c で実装予定: WeeklyMTGFacilitation の KA 順送りステップを抽出。
// target_filter (= scope/parentLevelName/teamName) に従って KA を一覧表示し、
// ステータス (focus/good/more/done) を更新できる。
export default function KAReviewModule(props) {
  return <ModuleSkeleton
    icon="📋"
    label="KA 確認"
    desc="今週フォーカス KA のステータス更新 + good/more/focus 記入"
    {...props}
  />
}

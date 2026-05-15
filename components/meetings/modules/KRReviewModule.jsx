'use client'
import ModuleSkeleton from './_skeleton'

// KR 確認モジュール
// Phase 5c で実装予定: WeeklyMTGFacilitation の KR レビューステップを抽出。
// KR 進捗 (current/target) の更新と KPT (Good/More/Focus) 記入。
// kr_weekly_reviews テーブルに記録。
export default function KRReviewModule(props) {
  return <ModuleSkeleton
    icon="🎯"
    label="KR 確認"
    desc="KR の進捗 (current/target) 更新 + 週次 KPT (Good/More/Focus)"
    {...props}
  />
}

'use client'
import ModuleSkeleton from './_skeleton'

// 個人報告モジュール
// Phase 5c で実装予定: MorningMeetingPage の Step 1 (個別報告) を抽出。
// 各メンバーの「昨日の振り返り (KPT)」と「今日のタスク」を順送りで表示。
export default function IndividualReportModule(props) {
  return <ModuleSkeleton
    icon="👤"
    label="個人報告"
    desc="メンバー全員の昨日の振り返り (KPT) + 今日のタスクを順番に確認"
    {...props}
  />
}

'use client'
import ModuleSkeleton from './_skeleton'

// 共有事項モジュール
// Phase 5c で実装予定: ConfirmationsTab の kind='share' 部分を抽出。
// 一方向の共有 (返信不要)。会議中に追加、Slack 通知も可能。
export default function SharedItemsModule(props) {
  return <ModuleSkeleton
    icon="📢"
    label="共有事項"
    desc="一方向の共有 (返信不要)。会議中に追加すると Slack へ通知"
    {...props}
  />
}

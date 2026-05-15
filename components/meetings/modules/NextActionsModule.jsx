'use client'
import ModuleSkeleton from './_skeleton'

// ネクストアクションモジュール
// Phase 5c で実装予定: 会議で出たアクションをタスク化する UI。
// ka_tasks に INSERT (= KA 紐付け任意の思いつきタスク扱い)。
// assignee は会議参加者から選択。
export default function NextActionsModule(props) {
  return <ModuleSkeleton
    icon="➡️"
    label="ネクストアクション"
    desc="会議で出たアクションをタスク化 (ka_tasks に登録、担当者指定)"
    {...props}
  />
}

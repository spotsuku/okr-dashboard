'use client'
import ModuleSkeleton from './_skeleton'

// 確認事項モジュール
// Phase 5c で実装予定: ConfirmationsTab の kind='confirmation' 部分を抽出。
// 双方向の確認/返信スレッド。属人化解消の独自機能。
export default function ConfirmationsModule(props) {
  return <ModuleSkeleton
    icon="❓"
    label="確認事項"
    desc="双方向の確認/返信スレッド。属人化解消・ブロッカー可視化"
    {...props}
  />
}

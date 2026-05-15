// 会議モジュールのレジストリ
// Phase 5c で各モジュールの実体実装が完了したら、ここに登録される。
// 現状は skeleton のみ (= 動作プレースホルダー)。
// Phase 5d の MeetingShell が type 文字列からコンポーネントを引くために使う。

import IndividualReportModule from '../../components/meetings/modules/IndividualReportModule'
import KAReviewModule         from '../../components/meetings/modules/KAReviewModule'
import KRReviewModule         from '../../components/meetings/modules/KRReviewModule'
import SharedItemsModule      from '../../components/meetings/modules/SharedItemsModule'
import ConfirmationsModule    from '../../components/meetings/modules/ConfirmationsModule'
import NextActionsModule      from '../../components/meetings/modules/NextActionsModule'

// type 文字列 → React コンポーネント
export const MODULE_COMPONENTS = {
  individual_report: IndividualReportModule,
  ka_review:         KAReviewModule,
  kr_review:         KRReviewModule,
  shared_items:      SharedItemsModule,
  confirmations:     ConfirmationsModule,
  next_actions:      NextActionsModule,
}

// type 文字列 → メタ情報 (ラベル / アイコン / 説明)
export const MODULE_META = {
  individual_report: { label: '個人報告',         icon: '👤', desc: '振り返り + 今日のタスク確認' },
  ka_review:         { label: 'KA 確認',          icon: '📋', desc: '今週フォーカス KA のステータス更新' },
  kr_review:         { label: 'KR 確認',          icon: '🎯', desc: 'KR の進捗 / KPT (Good/More/Focus)' },
  shared_items:      { label: '共有事項',         icon: '📢', desc: '一方向の共有 (kind=share)' },
  confirmations:     { label: '確認事項',         icon: '❓', desc: '双方向の確認/返信 (kind=confirmation)' },
  next_actions:      { label: 'ネクストアクション', icon: '➡️', desc: '会議で出たアクションをタスク化' },
}

// 利用可能なモジュール一覧 (CRUD UI で「追加できるモジュール」を表示するのに使う)
export const AVAILABLE_MODULES = Object.keys(MODULE_META).map(type => ({
  type,
  ...MODULE_META[type],
}))

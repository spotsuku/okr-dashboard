'use client'
import ConfirmationsTab from '../../ConfirmationsTab'

// 確認事項モジュール
// 既存 ConfirmationsTab を lockedKind="confirmation" で embed。
// 双方向の確認/返信スレッド。会議中に新規作成可、defaultMeetingKey で会議に紐付け。
export default function ConfirmationsModule({ meeting, config, weekStart, T, members, viewingName, myName }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <ConfirmationsTab
        T={T}
        myName={myName || viewingName}
        members={members}
        viewingName={viewingName || myName}
        lockedKind="confirmation"
        allowCompose
        defaultMeetingKey={meeting?.key}
      />
    </div>
  )
}

'use client'
import ConfirmationsTab from '../../ConfirmationsTab'

// 共有事項モジュール
// 既存 ConfirmationsTab を lockedKind="share" で embed。
// 一方向の共有 (返信不要)。会議中に追加可、defaultMeetingKey で会議に紐付け。
export default function SharedItemsModule({ meeting, config, weekStart, T, members, viewingName, myName }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <ConfirmationsTab
        T={T}
        myName={myName || viewingName}
        members={members}
        viewingName={viewingName || myName}
        lockedKind="share"
        allowCompose
        defaultMeetingKey={meeting?.key}
      />
    </div>
  )
}

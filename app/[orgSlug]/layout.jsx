// myAI ライセンスゲート: 組織ダッシュボード (/{orgSlug}/...) でのみウィジェットを起動。
// ランディング (/) や API ルートには干渉しない。
//
// トライアル制御は <MyAIWidgetScript> 内で行う (useLicense() で trial_active を見て
// 30日無料期間中は widget.js を読み込まない)。
import MyAIWidgetScript from '../../components/MyAIWidgetScript'

const PRODUCT_ID = 'b9ef4b24-d047-4819-b328-07cdb3310924'

export default function OrgLayout({ children }) {
  return (
    <>
      {children}
      <MyAIWidgetScript productId={PRODUCT_ID} />
    </>
  )
}

// myAI ライセンスゲート: 組織ダッシュボード (/{orgSlug}/...) でのみウィジェットを起動。
// ランディング (/) や API ルートには干渉しない。
import Script from 'next/script'

export default function OrgLayout({ children }) {
  return (
    <>
      {children}
      <Script
        src="https://my-ai.community/widget.js"
        data-product-id="b9ef4b24-d047-4819-b328-07cdb3310924"
        strategy="afterInteractive"
      />
    </>
  )
}

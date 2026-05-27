import { ImageResponse } from 'next/og'

// iOS「ホーム画面に追加」用の apple-touch-icon。
// 旧アイコンは余白＋リングが主役で小さく表示すると「O」に見えたため、
// 全面ブランドグラデ＋大きな「AI」のフルブリードに変更。
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: 108,
          fontWeight: 800,
          letterSpacing: -6,
          backgroundColor: '#2563eb',
          backgroundImage: 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 52%, #22d3ee 100%)',
        }}
      >
        AI
      </div>
    ),
    { ...size },
  )
}

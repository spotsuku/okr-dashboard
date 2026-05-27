import { COMMON_TOKENS, FONT_STACK } from '../lib/themeTokens'

export const metadata = {
  title: 'AI WorkSpace',
  description: 'AI WorkSpace - OKR / KR / タスク / 振り返り / AIコーチを統合したワークスペース',
  appleWebApp: {
    capable: true,
    title: 'AI WorkSpace',
    statusBarStyle: 'default',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

// Glass テーマ: body にスカイ→ミントのソフトラディアルグラデを敷く
// 各画面の root は背景 transparent でこのグラデが透ける構造
const GLASS_BG = COMMON_TOKENS.light.bgGradient

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
        {/* Inter + Noto Sans JP (Glass テーマで使用) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body style={{
        margin: 0, padding: 0, overflowX: 'hidden',
        background: GLASS_BG,
        backgroundAttachment: 'fixed',
        minHeight: '100vh',
        fontFamily: FONT_STACK,
        fontFeatureSettings: '"palt" 1',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
        color: COMMON_TOKENS.light.text,
      }}>{children}</body>
    </html>
  )
}

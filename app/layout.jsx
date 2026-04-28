export const metadata = {
  title: 'OKR Dashboard',
  description: '社内OKR管理ダッシュボード',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

// iOS/iPadOS 風のシステムフォントスタック (San Francisco を最優先)
const FONT_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"SF Pro Text"',
  '"SF Pro Display"',
  '"Hiragino Kaku Gothic ProN"',
  '"Hiragino Sans"',
  '"Yu Gothic Medium"',
  '"Meiryo"',
  'system-ui',
  'sans-serif',
].join(', ')

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{
        margin: 0, padding: 0, overflowX: 'hidden',
        fontFamily: FONT_STACK,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
      }}>{children}</body>
    </html>
  )
}

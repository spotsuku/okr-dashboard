export const metadata = {
  title: 'OKR Dashboard',
  description: '社内OKR管理ダッシュボード',
}

// レスポンシブ用 viewport (これが無いとモバイルが 980px 仮想ビューポートで描画して
// レイアウト崩れ + isMobile 検出が効かなくなる)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, padding: 0, overflowX: 'hidden' }}>{children}</body>
    </html>
  )
}

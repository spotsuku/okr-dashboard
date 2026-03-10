export const metadata = {
  title: 'OKR Dashboard',
  description: '社内OKR管理ダッシュボード',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}

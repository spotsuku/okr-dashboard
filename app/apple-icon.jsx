import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'

// iOS「ホーム画面に追加」用の apple-touch-icon。
// ダッシュボードと同じロゴ(public/icon.png)を使う。ただし元画像は余白が広く、
// 小さく丸くマスクされると輪(O)に見えるため、白背景の上にロゴを拡大配置して
// 余白をトリミングし、ロゴがくっきり出るようにする。
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function AppleIcon() {
  const logo = await readFile(join(process.cwd(), 'public', 'icon.png'))
  const src = `data:image/png;base64,${logo.toString('base64')}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
        }}
      >
        {/* container(180)より大きく描いて中央寄せ → 周囲の余白がトリミングされる */}
        <img src={src} width="232" height="232" />
      </div>
    ),
    { ...size },
  )
}

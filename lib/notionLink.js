// Notion URL を開くヘルパー
// iOS (iPad/iPhone) では Universal Link が Notion app の "ホーム" に飛んでしまう問題があるため、
// notion:// カスタムスキームで直接ページを開く → 1.5秒内にアプリへ遷移しなければ Safari でフォールバック

function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPad (iOS 13+) はデスクトップUAのためタッチ対応で判定
  return /iPad|iPhone|iPod/.test(ua) ||
         (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document)
}

export function openNotionUrl(url) {
  if (!url || typeof window === 'undefined') return

  if (!isIOS()) {
    // デスクトップ・Android: 通常の新タブで開く
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  // iOS: notion:// で直接アプリを起動 (ページIDを保持したまま)
  // https://www.notion.so/...  →  notion://www.notion.so/...
  const notionUrl = url.replace(/^https?:\/\//i, 'notion://')

  // アプリが無い/起動できない場合に備え、Safariでも開けるよう1.5秒後にフォールバック
  let fell = false
  const fallbackTimer = setTimeout(() => {
    if (fell) return
    fell = true
    window.open(url, '_blank', 'noopener,noreferrer')
  }, 1500)

  // タブが非表示になった = アプリに遷移したと判断してフォールバック中止
  const onHide = () => {
    if (document.hidden) {
      fell = true
      clearTimeout(fallbackTimer)
      document.removeEventListener('visibilitychange', onHide)
    }
  }
  document.addEventListener('visibilitychange', onHide)

  // notion:// スキームを発火
  window.location.href = notionUrl
}

'use client'
// OnboardingTour
// 初回ログイン時に表示するスポットライト形式のツアー。
// 画面上の特定要素を data-tour="..." 属性で識別し、暗いオーバーレイで周囲を覆って
// 該当要素だけ明るく強調 + 吹き出し説明を表示する。
//
// 表示条件:
//   - localStorage 'onboarding_v1_completed' === '1' でない
//   - 完了/スキップで '1' をセット
//
// 操作:
//   - 「次へ」「戻る」「スキップ」「完了」ボタン
//   - キーボード: ArrowRight=次へ, ArrowLeft=戻る, Escape=スキップ
//
// 各ステップの target は data-tour 属性で特定。要素が存在しないステップは skip される。
import * as React from 'react'

const STORAGE_KEY = 'onboarding_v1_completed'

const STEPS = [
  {
    target: '[data-tour="brand"]',
    page: 'portal',
    title: 'いま開いている組織はここ',
    body: 'ヘッダー左に「AI WORKSPACE / 〔組織名〕」が表示されます。複数組織に所属しているなら、左端の組織アイコン列から切り替えできます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="nav-portal"]',
    page: 'portal',
    title: 'ホーム',
    body: 'よく使うリンクやお知らせをまとめたホーム画面です。まずはここから一日を始めましょう。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="nav-mycoach"]',
    page: 'mycoach',
    title: 'ワークスペース',
    body: 'AI コーチと対話しながら、日々の仕事やタスクを整理できる作業スペースです。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="nav-okr"]',
    page: 'okr',
    title: 'OKR',
    body: '組織・チーム・個人の目標 (OKR) を確認・管理できます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="nav-weekly"]',
    page: 'weekly',
    title: '週次MTG',
    body: '週次ミーティングの進行と、KR / KA の進捗確認をここで行います。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="nav-morning"]',
    page: 'morning',
    title: '朝会',
    body: '朝会の進行をサポート。今日の予定や共有事項をチームで確認できます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="nav-orgjd"]',
    page: 'orgjd',
    title: '組織',
    body: 'メンバーや組織体制 (JD) を確認・管理できます。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="year"]',
    title: '対象年度を切り替え',
    body: '見ている期間 (年度) を切り替えできます。来期の準備に切り替えたい時はここから。',
    placement: 'bottom',
  },
  {
    target: '[data-tour="user-menu"]',
    title: '設定・サービス紹介はここ',
    body: '右上のアイコンメニューから、Google 連携 / プライバシー / 利用規約 / サービス紹介 / ログアウトにアクセスできます。',
    placement: 'bottom-end',
  },
  {
    target: null,
    page: 'mycoach',
    title: '準備完了 🎉',
    body: '早速ワークスペースで仕事を開始しましょう。',
    placement: 'center',
  },
]

export default function OnboardingTour({ onNavigate }) {
  const [active, setActive] = React.useState(false)
  const [idx, setIdx] = React.useState(0)
  const [rect, setRect] = React.useState(null)

  // 初期表示判定
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return
    } catch { /* noop */ }
    // 少し遅らせて Dashboard の描画完了を待つ
    const t = setTimeout(() => setActive(true), 800)
    return () => clearTimeout(t)
  }, [])

  // 「ツアーをもう一度見る」: ユーザーメニュー等から発火される手動再生イベント。
  // 完了/スキップ済み (localStorage='1') でも、いつでも最初から見直せる。
  React.useEffect(() => {
    function startTour() { setIdx(0); setActive(true) }
    window.addEventListener('okr:start-tour', startTour)
    return () => window.removeEventListener('okr:start-tour', startTour)
  }, [])

  // ステップに対応するタブへ実際に移動する
  React.useEffect(() => {
    if (!active) return
    const step = STEPS[idx]
    if (step.page && typeof onNavigate === 'function') onNavigate(step.page)
  }, [active, idx, onNavigate])

  // ステップ対象を画面内へスクロール (モバイルの横スクロールナビ等で
  // 対象ボタンが画面外にあるとハイライトがずれるため)
  React.useEffect(() => {
    if (!active) return
    const step = STEPS[idx]
    if (!step.target) return
    const el = document.querySelector(step.target)
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [active, idx])

  // 対象要素の位置を取得 (リサイズ / スクロール対応)
  React.useEffect(() => {
    if (!active) return
    const step = STEPS[idx]
    function compute() {
      if (!step.target) { setRect(null); return }
      const el = document.querySelector(step.target)
      if (!el) { setRect(null); return }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    const interval = setInterval(compute, 500) // 念のため定期更新
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
      clearInterval(interval)
    }
  }, [active, idx])

  // キーボード操作
  React.useEffect(() => {
    if (!active) return
    function onKey(e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      else if (e.key === 'Escape') { e.preventDefault(); finish(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, idx])

  if (!active) return null

  // 表示可能なステップだけを対象にする。対象要素が DOM に無い/非表示の
  // ステップ (フィーチャーフラグで隠れたタブ・モバイルで非表示の要素など) はスキップ。
  const showable = STEPS.map((_, i) => i).filter(i => stepShowable(STEPS[i]))
  const step = STEPS[idx]
  const total = showable.length
  const pos = showable.indexOf(idx)
  const isLast = pos === -1 || pos === total - 1
  const isFirst = pos <= 0

  function next() {
    const nextIdx = showable.find(i => i > idx)
    if (nextIdx === undefined) finish(false)
    else setIdx(nextIdx)
  }
  function prev() {
    const before = showable.filter(i => i < idx)
    if (before.length) setIdx(before[before.length - 1])
  }
  function finish(skipped) {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* noop */ }
    setActive(false)
  }

  // ハイライトのパディング (要素より少し大きく見せる)
  const PAD = 6
  const highlight = rect ? {
    top: Math.max(0, rect.top - PAD),
    left: Math.max(0, rect.left - PAD),
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  } : null

  // 吹き出しの位置計算 (狭い画面では画面幅に合わせて縮める)
  const TOOLTIP_W = Math.min(320, (typeof window !== 'undefined' ? window.innerWidth : 360) - 32)
  const TOOLTIP_GAP = 14
  let tooltipStyle = { position: 'fixed', zIndex: 100000, width: TOOLTIP_W }
  if (!highlight) {
    // center
    tooltipStyle = {
      ...tooltipStyle,
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  } else if (step.placement === 'bottom-end') {
    tooltipStyle = {
      ...tooltipStyle,
      top: highlight.top + highlight.height + TOOLTIP_GAP,
      right: Math.max(16, window.innerWidth - (highlight.left + highlight.width)),
    }
  } else {
    // bottom default
    let left = highlight.left + highlight.width / 2 - TOOLTIP_W / 2
    left = Math.max(16, Math.min(window.innerWidth - TOOLTIP_W - 16, left))
    tooltipStyle = {
      ...tooltipStyle,
      top: highlight.top + highlight.height + TOOLTIP_GAP,
      left,
    }
  }

  return (
    <>
      {/* オーバーレイ: 4分割 (上/下/左/右) または 中央時はフル */}
      {highlight ? (
        <>
          <div onClick={next} style={overlayStyle({
            top: 0, left: 0, width: '100vw', height: highlight.top,
          })} />
          <div onClick={next} style={overlayStyle({
            top: highlight.top, left: 0, width: highlight.left, height: highlight.height,
          })} />
          <div onClick={next} style={overlayStyle({
            top: highlight.top, left: highlight.left + highlight.width,
            width: `calc(100vw - ${highlight.left + highlight.width}px)`, height: highlight.height,
          })} />
          <div onClick={next} style={overlayStyle({
            top: highlight.top + highlight.height, left: 0,
            width: '100vw', height: `calc(100vh - ${highlight.top + highlight.height}px)`,
          })} />
          {/* ハイライト枠 */}
          <div style={{
            position: 'fixed', zIndex: 99999,
            top: highlight.top, left: highlight.left,
            width: highlight.width, height: highlight.height,
            borderRadius: 10,
            boxShadow: '0 0 0 3px rgba(14,165,233,.9), 0 0 0 8px rgba(14,165,233,.25), 0 8px 24px rgba(14,165,233,.25)',
            pointerEvents: 'none',
            transition: 'all .3s cubic-bezier(.16,1,.3,1)',
          }} />
        </>
      ) : (
        <div onClick={next} style={overlayStyle({
          top: 0, left: 0, width: '100vw', height: '100vh',
        })} />
      )}

      {/* 吹き出し */}
      <div style={{
        ...tooltipStyle,
        background: 'rgba(255,255,255,.96)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(15,23,42,.08)',
        borderRadius: 14,
        boxShadow: '0 12px 40px rgba(15,23,42,.18)',
        padding: 20,
        fontFamily: '"Inter", "Noto Sans JP", system-ui, sans-serif',
        color: '#0f172a',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 8px', borderRadius: 99,
            background: 'rgba(14,165,233,.12)', color: '#0369a1',
          }}>STEP {(pos < 0 ? 0 : pos) + 1} / {total}</span>
          <button onClick={() => finish(true)} style={{
            border: 'none', background: 'transparent',
            color: '#94a3b8', cursor: 'pointer',
            fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
            padding: '2px 6px',
          }}>スキップ</button>
        </div>

        <div style={{
          fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em',
          color: '#0f172a', marginBottom: 8,
        }}>{step.title}</div>
        <div style={{
          fontSize: 13, lineHeight: 1.7, color: '#475569',
          marginBottom: 16,
        }}>{step.body}</div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10,
        }}>
          {!isFirst && (
            <button onClick={prev} style={{
              padding: '8px 14px', borderRadius: 99,
              background: 'transparent', color: '#475569',
              border: '1px solid rgba(15,23,42,.12)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>← 戻る</button>
          )}
          {isFirst && <div />}
          <button onClick={next} style={{
            padding: '10px 18px', borderRadius: 99,
            background: 'linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)',
            color: '#fff', border: '1px solid #2563eb',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 14px rgba(37,99,235,.32)',
          }}>
            {isLast ? '完了' : '次へ →'}
          </button>
        </div>

        {/* キーヒント */}
        <div style={{
          marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(15,23,42,.08)',
          fontSize: 10, color: '#94a3b8', textAlign: 'center',
        }}>
          <Kbd>←</Kbd> <Kbd>→</Kbd> で操作 · <Kbd>Esc</Kbd> でスキップ
        </div>
      </div>
    </>
  )
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 16, padding: '0 4px',
      fontSize: 10, fontWeight: 600,
      background: 'rgba(255,255,255,.7)',
      border: '1px solid rgba(15,23,42,.1)',
      borderRadius: 3, fontFamily: 'ui-monospace, monospace',
      color: '#475569',
    }}>{children}</span>
  )
}

// 対象要素が DOM に存在し、表示されている (サイズを持つ) ステップだけを見せる。
// フィーチャーフラグで隠れたタブやモバイルで非表示の要素のステップは自動スキップ。
function stepShowable(step) {
  if (!step.target) return true // center ステップ (target なし) は常に表示
  if (typeof document === 'undefined') return true
  const el = document.querySelector(step.target)
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function overlayStyle(s) {
  return {
    position: 'fixed', zIndex: 99998,
    background: 'rgba(15,23,42,.6)',
    cursor: 'pointer',
    ...s,
  }
}

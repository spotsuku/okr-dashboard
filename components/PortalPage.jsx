'use client'
import { useState, useMemo } from 'react'
import { COMMON_TOKENS, IOS_SHADOW } from '../lib/themeTokens'
import { LargeTitle, SearchBar, DashboardTile } from './iosUI'

// ─── ダッシュボード定義 ─────────────────────────────────
const DASHBOARDS = [
  { id: 'okr',         title: 'OKR ダッシュボード',         description: 'OKR・KA・タスク管理',          icon: '🎯', color: '#007AFF', internal: true,  group: 'main',     keywords: 'okr ka タスク 目標' },

  { id: 'cs',          title: 'CS ダッシュボード',          description: '顧客対応・満足度管理',           icon: '🤝', color: '#34C759', url: 'https://neo-cs.vercel.app/',                       group: 'business', keywords: 'cs 顧客 満足度' },
  { id: 'sales',       title: '営業ダッシュボード',         description: '営業活動・商談管理',             icon: '💰', color: '#FF9500', url: 'https://sales-dashboard-jade-chi.vercel.app/dashboard', group: 'business', keywords: 'sales 営業 商談' },
  { id: 'community',   title: 'コミュニティ ダッシュボード', description: 'NEOポータル',                    icon: '🏛',  color: '#FF3B30', url: 'https://community-dashboard-5abc3.web.app/events',  group: 'business', keywords: 'community コミュニティ' },
  { id: 'youth',       title: 'ユース ダッシュボード',      description: 'ユース活動管理',                 icon: '🌱', color: '#FFCC00', url: 'https://neo-youth.vercel.app/dashboard',           group: 'business', keywords: 'youth ユース' },

  { id: 'seisaku',     title: '制作物管理',                 description: '制作物の進行・管理',             icon: '🎨', color: '#5AC8FA', url: 'https://seisaku-kanri-blond.vercel.app/',           group: 'tools',    keywords: '制作 デザイン' },
  { id: 'budget',      title: '予算管理 ダッシュボード',     description: '予算策定・実績管理',             icon: '📊', color: '#AF52DE', url: 'https://neobudget-liard.vercel.app/#',              group: 'tools',    keywords: '予算 管理 実績' },
  { id: 'invitation',  title: 'イベント招待 ダッシュボード', description: 'イベント招待・参加管理',         icon: '✉️', color: '#FF2D55', url: 'https://invitation-ruby-psi.vercel.app/',           group: 'tools',    keywords: 'invitation イベント招待' },
]

// テーマは lib/themeTokens.js で一元管理
const THEMES = {
  dark:  { ...COMMON_TOKENS.dark,  cardHover: 'rgba(255,255,255,0.04)' },
  light: { ...COMMON_TOKENS.light, cardHover: 'rgba(0,0,0,0.02)' },
}

const GROUPS = [
  { key: 'main',     label: '主要',           sub: '全社管理'   },
  { key: 'business', label: '事業ダッシュボード', sub: '事業部別の運営状況' },
  { key: 'tools',    label: '管理ツール',      sub: '業務サポート系' },
]

export default function PortalPage({ user, onNavigate, themeKey = 'dark' }) {
  const T = THEMES[themeKey] || THEMES.dark
  const [search, setSearch] = useState('')

  const handleClick = (db) => {
    if (db.internal) onNavigate('mycoach')
    else if (db.url) window.open(db.url, '_blank')
  }

  // 検索フィルタ
  const filtered = useMemo(() => {
    if (!search.trim()) return DASHBOARDS
    const q = search.toLowerCase()
    return DASHBOARDS.filter(db =>
      db.title.toLowerCase().includes(q) ||
      db.description.toLowerCase().includes(q) ||
      db.keywords.toLowerCase().includes(q)
    )
  }, [search])

  // 時間帯による挨拶
  const greet = (() => {
    const h = new Date().getHours()
    if (h < 5)  return 'お疲れ様です'
    if (h < 11) return 'おはようございます'
    if (h < 18) return 'こんにちは'
    return 'こんばんは'
  })()

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg, position: 'relative' }}>
      {/* グローバル装飾 (上部にぼんやり広がる青のグロウ) */}
      <div aria-hidden style={{
        position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)',
        width: 800, height: 600,
        background: `radial-gradient(ellipse, ${T.accent}18 0%, transparent 60%)`,
        pointerEvents: 'none', filter: 'blur(40px)',
      }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 32px', position: 'relative' }}>

        {/* ─── ヒーロー: 大きいガラスカード ─── */}
        <div style={{
          marginTop: 20, marginBottom: 24,
          padding: '28px 28px 24px',
          background: `linear-gradient(135deg, ${T.accent}f5 0%, ${T.accent}c0 60%, ${T.accent}80 100%)`,
          borderRadius: 24,
          color: '#FFFFFF',
          position: 'relative', overflow: 'hidden',
          boxShadow: `
            0 1px 2px rgba(0,0,0,0.06),
            0 8px 24px rgba(0,122,255,0.20),
            0 24px 56px rgba(0,122,255,0.18)
          `,
        }}>
          {/* 装飾グラデーションオーブ */}
          <div aria-hidden style={{
            position: 'absolute', top: -80, right: -60, width: 280, height: 280,
            background: 'radial-gradient(circle, rgba(255,255,255,0.30) 0%, transparent 60%)',
            borderRadius: '50%', pointerEvents: 'none',
          }} />
          <div aria-hidden style={{
            position: 'absolute', bottom: -100, left: -40, width: 240, height: 240,
            background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 65%)',
            borderRadius: '50%', pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
              opacity: 0.85, textTransform: 'uppercase', marginBottom: 8,
            }}>NEO Management</div>
            <div style={{
              fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em',
              lineHeight: 1.15, marginBottom: 6,
            }}>{greet}</div>
            {user?.email && (
              <div style={{ fontSize: 14, opacity: 0.92 }}>
                {user.email} としてログイン中
              </div>
            )}
          </div>
        </div>

        {/* ─── 検索バー ─── */}
        <div style={{ marginBottom: 22 }}>
          <SearchBar T={T} value={search} onChange={setSearch}
            placeholder="ダッシュボードを検索..."
            onCancel={() => setSearch('')} />
        </div>

        {/* ─── グループ別ダッシュボード ─── */}
        {GROUPS.map(g => {
          const items = filtered.filter(db => db.group === g.key)
          if (items.length === 0) return null
          return (
            <section key={g.key} style={{ marginBottom: 28 }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '0 4px 12px',
              }}>
                <h2 style={{
                  fontSize: 18, fontWeight: 800, color: T.text, margin: 0,
                  letterSpacing: '-0.01em',
                }}>{g.label}</h2>
                <span style={{ fontSize: 12, color: T.textMuted }}>{g.sub}</span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 14,
              }}>
                {items.map(db => (
                  <DashboardTile key={db.id} T={T}
                    icon={db.icon}
                    title={db.title}
                    sub={db.description}
                    color={db.color}
                    onClick={() => handleClick(db)}
                    status={db.internal ? 'アプリ内で開く' : '別タブで開く'} />
                ))}
              </div>
            </section>
          )
        })}

        {filtered.length === 0 && (
          <div style={{
            padding: '40px 20px', textAlign: 'center', color: T.textMuted,
            fontSize: 13, background: T.bgCard, borderRadius: 14,
            boxShadow: IOS_SHADOW,
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
            「{search}」に一致するダッシュボードがありません
          </div>
        )}
      </div>
    </div>
  )
}

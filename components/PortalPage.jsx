'use client'
import { COMMON_TOKENS, IOS_SHADOW } from '../lib/themeTokens'

// ─── ダッシュボード定義 ─────────────────────────────────
const DASHBOARDS = [
  {
    id: 'okr',
    title: 'OKRダッシュボード',
    description: 'OKR・KA・タスク管理',
    icon: '🎯',
    color: '#4d9fff',
    internal: true,
  },
  {
    id: 'cs',
    title: 'CSダッシュボード',
    description: '顧客対応・満足度管理',
    icon: '🤝',
    color: '#00d68f',
    url: 'https://neo-cs.vercel.app/',
  },
  {
    id: 'sales',
    title: '営業ダッシュボード',
    description: '営業活動・商談管理',
    icon: '💰',
    color: '#ff9f43',
    url: 'https://sales-dashboard-jade-chi.vercel.app/dashboard',
  },
  {
    id: 'seisaku',
    title: '制作物管理',
    description: '制作物の進行・管理',
    icon: '🎨',
    color: '#06b6d4',
    url: 'https://seisaku-kanri-blond.vercel.app/',
  },
  {
    id: 'budget',
    title: '予算管理ダッシュボード',
    description: '予算策定・実績管理',
    icon: '📊',
    color: '#a855f7',
    url: 'https://neobudget-liard.vercel.app/#',
  },
  {
    id: 'community',
    title: 'コミュニティダッシュボード',
    description: 'NEOポータル',
    icon: '🏛',
    color: '#ff6b6b',
    url: 'https://community-dashboard-5abc3.web.app/events',
  },
  {
    id: 'youth',
    title: 'ユースダッシュボード',
    description: 'ユース活動管理',
    icon: '🌱',
    color: '#ffd166',
    url: 'https://neo-youth.vercel.app/dashboard',
  },
  {
    id: 'invitation',
    title: 'イベント招待ダッシュボード',
    description: 'イベント招待・参加管理',
    icon: '✉️',
    color: '#ec4899',
    url: 'https://invitation-ruby-psi.vercel.app/',
  },
]

// テーマは lib/themeTokens.js で一元管理。固有フィールドだけここで上書き
const THEMES = {
  dark:  { ...COMMON_TOKENS.dark,  cardHover: 'rgba(255,255,255,0.04)' },
  light: { ...COMMON_TOKENS.light, cardHover: 'rgba(0,0,0,0.02)' },
}

export default function PortalPage({ user, onNavigate, themeKey = 'dark' }) {
  const T = THEMES[themeKey] || THEMES.dark

  const handleClick = (db) => {
    if (db.internal) {
      onNavigate('mycoach')
    } else if (db.url) {
      window.open(db.url, '_blank')
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* ヘッダー */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: T.accent, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>NEO Management</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: T.text, margin: 0, marginBottom: 8 }}>NEO 運営DB</h1>
          <p style={{ fontSize: 14, color: T.textMuted, margin: 0 }}>
            {user?.email && <span>{user.email} としてログイン中</span>}
          </p>
        </div>

        {/* ダッシュボードグリッド */}
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>📊 ダッシュボード</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {DASHBOARDS.map(db => {
            const isAvailable = db.internal || db.url
            return (
              <div
                key={db.id}
                onClick={() => handleClick(db)}
                style={{
                  background: T.bgCard,
                  border: `1px solid ${T.border}`,
                  borderRadius: 16,
                  padding: '24px 20px',
                  cursor: isAvailable ? 'pointer' : 'default',
                  opacity: isAvailable ? 1 : 0.5,
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: IOS_SHADOW,
                }}
                onMouseEnter={e => { if (isAvailable) { e.currentTarget.style.borderColor = db.color + '60'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 8px rgba(0,0,0,0.05), 0 12px 32px ${db.color}22` } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = IOS_SHADOW }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: db.color }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${db.color}15`, border: `1px solid ${db.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22,
                  }}>
                    {db.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{db.title}</div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>{db.description}</div>
                  </div>
                </div>

                {db.internal ? (
                  <div style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>アプリ内で開く →</div>
                ) : db.url ? (
                  <div style={{ fontSize: 11, color: T.textMuted }}>別タブで開く ↗</div>
                ) : (
                  <div style={{ fontSize: 11, color: T.textMuted, fontStyle: 'italic' }}>URL未設定</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

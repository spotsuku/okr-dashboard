'use client'
import { useState } from 'react'
import MorningMeetingImport from './MorningMeetingImport'

// ─── ダッシュボード定義 ─────────────────────────────────
const DASHBOARDS = [
  {
    id: 'okr',
    title: 'OKRダッシュボード',
    description: 'OKR・KA・タスク管理',
    icon: '🎯',
    color: '#4d9fff',
    internal: true, // アプリ内遷移
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
    title: 'セールスダッシュボード',
    description: '営業活動・商談管理',
    icon: '💰',
    color: '#ff9f43',
    url: 'https://sales-dashboard-jade-chi.vercel.app/',
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
]

const THEMES = {
  dark: {
    bg: '#0F1117', bgCard: '#1A1D27', border: 'rgba(255,255,255,0.10)',
    text: '#E8ECF0', textSub: '#B0BAC8', textMuted: '#7a8599',
    accent: '#4d9fff', cardHover: 'rgba(255,255,255,0.04)',
  },
  light: {
    bg: '#EEF2F5', bgCard: '#FFFFFF', border: '#E2E8F0',
    text: '#2D3748', textSub: '#4A5568', textMuted: '#718096',
    accent: '#3B82C4', cardHover: 'rgba(0,0,0,0.02)',
  },
}

export default function PortalPage({ user, onNavigate, themeKey = 'dark', members = [], T: TOuter }) {
  const T = THEMES[themeKey] || THEMES.dark
  const [showMorningImport, setShowMorningImport] = useState(false)
  const morningMeetingUrl = process.env.NEXT_PUBLIC_MORNING_MEETING_URL

  const handleClick = (db) => {
    if (db.internal) {
      onNavigate('mycoach')
    } else if (db.url) {
      window.open(db.url, '_blank')
    } else {
      // URL未設定
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        {/* ヘッダー */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: T.accent, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>NEO Management</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: T.text, margin: 0, marginBottom: 8 }}>NEO 運営DB</h1>
          <p style={{ fontSize: 14, color: T.textMuted, margin: 0 }}>
            {user?.email && <span>{user.email} としてログイン中</span>}
          </p>
        </div>

        {/* 朝会セクション */}
        <div style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
          padding: '18px 20px', marginBottom: 28, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#ff9f43' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: '#ff9f4315',
              border: '1px solid #ff9f4330', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 22, flexShrink: 0,
            }}>🌅</div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>朝会</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                Notion で朝会を進行し、終わったらタスクをワンクリックで取り込みます
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => morningMeetingUrl ? window.open(morningMeetingUrl, '_blank') : alert('NEXT_PUBLIC_MORNING_MEETING_URL を環境変数に設定してください')}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
                  background: T.bg, color: T.text, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >📝 Notionで朝会を開く ↗</button>
              <button
                onClick={() => setShowMorningImport(true)}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: '#ff9f43', color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(255,159,67,0.3)',
                }}
              >📋 朝会タスクを取り込む</button>
            </div>
          </div>
        </div>

        {/* タスク取り込みモーダル */}
        <MorningMeetingImport
          open={showMorningImport}
          onClose={() => setShowMorningImport(false)}
          members={members}
          T={TOuter || { bgCard: T.bgCard, text: T.text, textMuted: T.textMuted, borderMid: T.border, borderLight: T.border }}
        />

        {/* ダッシュボードグリッド */}
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
                  borderRadius: 14,
                  padding: '24px 20px',
                  cursor: isAvailable ? 'pointer' : 'default',
                  opacity: isAvailable ? 1 : 0.5,
                  transition: 'all 0.15s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => { if (isAvailable) { e.currentTarget.style.borderColor = db.color + '60'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${db.color}15` } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
              >
                {/* アクセントライン */}
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

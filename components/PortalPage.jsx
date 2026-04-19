'use client'
import { useState } from 'react'
import MeetingImport from './MeetingImport'
import { MEETINGS, MEETING_URLS } from '../lib/meetings'

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
  const [importMeetingKey, setImportMeetingKey] = useState(null)

  const handleClick = (db) => {
    if (db.internal) {
      onNavigate('mycoach')
    } else if (db.url) {
      window.open(db.url, '_blank')
    }
  }

  const openMeetingNotion = (m) => {
    const url = MEETING_URLS[m.key]
    if (!url) {
      alert(`${m.title} のURLが環境変数に設定されていません (NEXT_PUBLIC_${m.key.toUpperCase().replace(/-/g,'_')}_URL)`)
      return
    }
    window.open(url, '_blank')
  }

  const currentMeeting = importMeetingKey ? MEETINGS.find(m => m.key === importMeetingKey) : null

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

        {/* 会議グリッド */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>📋 定例会議</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {MEETINGS.map(m => (
              <div key={m.key} style={{
                background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12,
                padding: '12px 14px', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: m.color }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: `${m.color}15`,
                    border: `1px solid ${m.color}30`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 18, flexShrink: 0,
                  }}>{m.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{m.schedule}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => openMeetingNotion(m)}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: 7, border: `1px solid ${T.border}`,
                      background: T.bg, color: T.text, fontSize: 10.5, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >📝 Notion ↗</button>
                  <button
                    onClick={() => setImportMeetingKey(m.key)}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: 7, border: 'none',
                      background: m.color, color: '#fff', fontSize: 10.5, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >📋 取り込み</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 取り込みモーダル */}
        {currentMeeting && (
          <MeetingImport
            open={!!importMeetingKey}
            onClose={() => setImportMeetingKey(null)}
            meetingKey={currentMeeting.key}
            meetingTitle={currentMeeting.title}
            members={members}
            T={TOuter || { bgCard: T.bgCard, text: T.text, textMuted: T.textMuted, borderMid: T.border, borderLight: T.border }}
          />
        )}

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

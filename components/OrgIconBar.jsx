'use client'
// Slack 風の左サイドバー (Phase 4 SaaS化)
//   - 縦に並んだ組織アイコン (頭文字 + カラー)
//   - 各アイコンクリック → router.push('/{slug}')
//   - 最下部に "+" で組織新規作成
//
// Dashboard.jsx を無改変にするため、AppRoot 側でこれを Dashboard の左にラップする。
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentOrg } from '../lib/orgContext'
import CreateOrgModal from './CreateOrgModal'

// slug を安定したカラーへ (簡易ハッシュ)
const PALETTE = [
  '#4d9fff', '#00d68f', '#ffd166', '#ff6b6b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
  '#22c55e', '#eab308',
]
function colorFromSlug(slug) {
  if (!slug) return PALETTE[0]
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
function initialOf(name, slug) {
  const s = (name || slug || '?').trim()
  // 日本語1文字 / 英語2文字
  if (/^[\x00-\x7F]+$/.test(s)) return s.slice(0, 2).toUpperCase()
  return s.charAt(0)
}

export default function OrgIconBar({ userEmail }) {
  const { currentOrg, orgs } = useCurrentOrg()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)

  // 組織が 1 つだけならバーは表示しない (画面幅節約)。0 でも非表示。
  if (!orgs || orgs.length < 2) {
    return (
      <>
        {/* 単一組織でも "+" だけは出しておくと多テナント拡張への入り口になる */}
        {orgs && orgs.length >= 1 && (
          <div style={barWrap}>
            <div style={{ flex: 1 }} />
            <AddButton onClick={() => setCreateOpen(true)} />
          </div>
        )}
        <CreateOrgModal
          open={createOpen} onClose={() => setCreateOpen(false)}
          onCreated={(org) => { setCreateOpen(false); if (org?.slug) router.push(`/${org.slug}`) }}
          userEmail={userEmail}
        />
      </>
    )
  }

  return (
    <>
      <div style={barWrap}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8 }}>
          {orgs.map(o => {
            const active = currentOrg?.slug === o.slug
            const color = colorFromSlug(o.slug)
            return (
              <button
                key={o.slug}
                onClick={() => { if (!active) router.push(`/${o.slug}`) }}
                title={`${o.name} (${o.role})`}
                style={{
                  position: 'relative',
                  width: 40, height: 40, borderRadius: active ? 12 : 20,
                  background: active ? color : `${color}30`,
                  color: active ? '#fff' : color,
                  border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-radius 0.18s ease, background 0.18s ease',
                  outline: active ? `2px solid ${color}` : 'none',
                  outlineOffset: active ? 2 : 0,
                }}
              >
                {initialOf(o.name, o.slug)}
                {active && (
                  <span style={{
                    position: 'absolute', left: -8, top: 8, bottom: 8, width: 3,
                    background: '#fff', borderRadius: '0 2px 2px 0',
                  }} />
                )}
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1 }} />
        <AddButton onClick={() => setCreateOpen(true)} />
      </div>
      <CreateOrgModal
        open={createOpen} onClose={() => setCreateOpen(false)}
        onCreated={(org) => { setCreateOpen(false); if (org?.slug) router.push(`/${org.slug}`) }}
        userEmail={userEmail}
      />
    </>
  )
}

function AddButton({ onClick }) {
  return (
    <button onClick={onClick} title="新しい組織を作成" style={{
      width: 40, height: 40, borderRadius: 20, marginBottom: 10,
      background: 'rgba(255,255,255,0.06)', color: '#9ca3af',
      border: '1.5px dashed rgba(255,255,255,0.18)', cursor: 'pointer',
      fontSize: 22, fontWeight: 400, fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s ease',
    }} onMouseEnter={(e) => {
      e.currentTarget.style.background = 'rgba(77,159,255,0.18)'
      e.currentTarget.style.color = '#4d9fff'
      e.currentTarget.style.borderColor = '#4d9fff'
    }} onMouseLeave={(e) => {
      e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
      e.currentTarget.style.color = '#9ca3af'
      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
    }}>＋</button>
  )
}

const barWrap = {
  width: 56, flexShrink: 0,
  background: '#1c1c1e',
  borderRight: '1px solid rgba(255,255,255,0.08)',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  padding: '0 0 4px 0',
}

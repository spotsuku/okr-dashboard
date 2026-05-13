'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { COMMON_TOKENS, IOS_SHADOW } from '../lib/themeTokens'
import { LargeTitle, SearchBar, DashboardTile } from './iosUI'
import { isDemoMode } from '../lib/demoMocks'
import { useCurrentOrg } from '../lib/orgContext'

// ─── ダッシュボード定義 ─────────────────────────────────
// 内蔵 OKR + NEO の外部サービスダッシュボード (本番のみ)。
// demo 環境では external=true のものを非表示にする (本番URL露出防止)。
// orgSlugs が指定されているエントリは、その組織でのみ表示される
//   (NEO福岡 固有のリンクは ['neo-fukuoka'] で限定)
// ユーザー追加分は「カスタムリンク」(localStorage) に登録される。
const DASHBOARDS = [
  { id: 'okr',         title: 'OKR ダッシュボード',         description: 'OKR・KA・タスク管理',          icon: 'target',     color: '#007AFF', internal: true, group: 'main',     keywords: 'okr ka タスク 目標' },

  { id: 'sales',       title: '営業ダッシュボード',         description: '営業活動・商談管理',             icon: 'trendingUp', color: '#FF9500', url: 'https://sales-dashboard-jade-chi.vercel.app/dashboard', external: true, group: 'business', keywords: 'sales 営業 商談',  orgSlugs: ['neo-fukuoka'] },
  { id: 'community',   title: 'コミュニティ ダッシュボード', description: 'NEOポータル',                    icon: 'building',   color: '#FF3B30', url: 'https://community-dashboard-5abc3.web.app/events',      external: true, group: 'business', keywords: 'community コミュニティ', orgSlugs: ['neo-fukuoka'] },
  { id: 'youth',       title: 'ユース ダッシュボード',      description: 'ユース活動管理',                 icon: 'sprout',     color: '#FFCC00', url: 'https://neo-youth.vercel.app/dashboard',                external: true, group: 'business', keywords: 'youth ユース',          orgSlugs: ['neo-fukuoka'] },

  { id: 'seisaku',     title: '制作物管理',                 description: '制作物の進行・管理',             icon: 'palette',    color: '#5AC8FA', url: 'https://seisaku-kanri-blond.vercel.app/',               external: true, group: 'tools',    keywords: '制作 デザイン',         orgSlugs: ['neo-fukuoka'] },
  { id: 'budget',      title: '予算管理 ダッシュボード',     description: '予算策定・実績管理',             icon: 'chartPie',   color: '#AF52DE', url: 'https://neobudget-liard.vercel.app/#',                  external: true, group: 'tools',    keywords: '予算 管理 実績',        orgSlugs: ['neo-fukuoka'] },
  { id: 'invitation',  title: 'イベント招待 ダッシュボード', description: 'イベント招待・参加管理',         icon: 'envelope',   color: '#FF2D55', url: 'https://invitation-ruby-psi.vercel.app/',               external: true, group: 'tools',    keywords: 'invitation イベント招待', orgSlugs: ['neo-fukuoka'] },
]

// テーマは lib/themeTokens.js で一元管理
const THEMES = {
  dark:  { ...COMMON_TOKENS.dark,  cardHover: 'rgba(255,255,255,0.04)' },
  light: { ...COMMON_TOKENS.light, cardHover: 'rgba(0,0,0,0.02)' },
}

const GROUPS = [
  { key: 'main',     label: '主要',             sub: '全社管理'         },
  { key: 'business', label: '事業ダッシュボード', sub: '事業部別の運営状況' },
  { key: 'tools',    label: '管理ツール',        sub: '業務サポート系'    },
  { key: 'custom',   label: 'カスタムリンク',    sub: 'よく使うURLを登録' },
]

const CUSTOM_LINK_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#5AC8FA', '#AF52DE', '#FF2D55', '#FFCC00']
const CUSTOM_LINKS_KEY = (email) => `portal_custom_links_v1_${email || 'guest'}`

function loadCustomLinks(email) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_LINKS_KEY(email))
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function saveCustomLinks(email, links) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(CUSTOM_LINKS_KEY(email), JSON.stringify(links)) } catch { /* noop */ }
}
function normalizeUrl(input) {
  const t = (input || '').trim()
  if (!t) return ''
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

export default function PortalPage({ user, onNavigate, themeKey = 'dark' }) {
  const T = THEMES[themeKey] || THEMES.dark
  const { currentOrg } = useCurrentOrg()
  const orgSlug = currentOrg?.slug || null
  const [search, setSearch] = useState('')
  const [customLinks, setCustomLinks] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formTitle, setFormTitle] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formError, setFormError] = useState('')

  // localStorage から読み込み (ユーザーごと)
  useEffect(() => {
    setCustomLinks(loadCustomLinks(user?.email))
  }, [user?.email])

  const persistLinks = useCallback((next) => {
    setCustomLinks(next)
    saveCustomLinks(user?.email, next)
  }, [user?.email])

  function openAddDialog() {
    setEditingId(null); setFormTitle(''); setFormUrl(''); setFormError(''); setShowAdd(true)
  }
  function openEditDialog(link) {
    setEditingId(link.id); setFormTitle(link.title); setFormUrl(link.url); setFormError(''); setShowAdd(true)
  }
  function submitForm() {
    const title = formTitle.trim()
    const url = normalizeUrl(formUrl)
    if (!title) { setFormError('タイトルを入力してください'); return }
    if (!url)   { setFormError('URLを入力してください'); return }
    try { new URL(url) } catch { setFormError('URLの形式が正しくありません'); return }
    if (editingId) {
      persistLinks(customLinks.map(l => l.id === editingId ? { ...l, title, url } : l))
    } else {
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const color = CUSTOM_LINK_COLORS[customLinks.length % CUSTOM_LINK_COLORS.length]
      persistLinks([...customLinks, { id, title, url, color }])
    }
    setShowAdd(false)
  }
  function deleteLink(id) {
    if (!window.confirm('このリンクを削除しますか？')) return
    persistLinks(customLinks.filter(l => l.id !== id))
  }

  const handleClick = (db) => {
    if (db.internal) onNavigate('mycoach')
    else if (db.url) window.open(db.url, '_blank', 'noopener,noreferrer')
  }

  // 検索フィルタ (内蔵 + カスタム)
  // demo 環境では external=true を非表示 (本番URL露出防止)
  // orgSlugs が指定された項目は、現在の組織がリストに含まれる場合のみ表示 (SaaS化)
  const demo = isDemoMode()
  const allItems = useMemo(() => [
    ...DASHBOARDS
      .filter(d => !demo || !d.external)
      .filter(d => !d.orgSlugs || (orgSlug && d.orgSlugs.includes(orgSlug))),
    ...customLinks.map(l => ({
      id: l.id, title: l.title, description: l.url, icon: 'link', color: l.color || '#007AFF',
      url: l.url, group: 'custom', keywords: `${l.title} ${l.url}`, custom: true,
    })),
  ], [customLinks, demo, orgSlug])

  const filtered = useMemo(() => {
    if (!search.trim()) return allItems
    const q = search.toLowerCase()
    return allItems.filter(db =>
      db.title.toLowerCase().includes(q) ||
      (db.description || '').toLowerCase().includes(q) ||
      (db.keywords || '').toLowerCase().includes(q)
    )
  }, [search, allItems])

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
          // カスタムは0件でも常時表示 (追加ボタン用)
          if (items.length === 0 && g.key !== 'custom') return null
          return (
            <section key={g.key} style={{ marginBottom: 28 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 4px 12px',
              }}>
                <h2 style={{
                  fontSize: 18, fontWeight: 800, color: T.text, margin: 0,
                  letterSpacing: '-0.01em',
                }}>{g.label}</h2>
                <span style={{ fontSize: 12, color: T.textMuted }}>{g.sub}</span>
                {g.key === 'custom' && (
                  <button onClick={openAddDialog} style={{
                    marginLeft: 'auto',
                    padding: '6px 14px', borderRadius: 8,
                    background: T.accent, color: '#fff', border: 'none',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>＋ URLを追加</button>
                )}
              </div>
              {items.length === 0 && g.key === 'custom' ? (
                <div style={{
                  padding: '20px 16px', textAlign: 'center', color: T.textMuted,
                  fontSize: 12, background: T.bgCard, borderRadius: 14,
                  border: `1px dashed ${T.border}`, lineHeight: 1.7,
                }}>
                  好きなURLをここに登録できます。<br />
                  社内ツールや業務でよく使うサイトを「＋ URLを追加」から登録してください。
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 14,
                }}>
                  {items.map(db => (
                    <div key={db.id} style={{ position: 'relative' }}>
                      <DashboardTile T={T}
                        icon={db.icon}
                        title={db.title}
                        sub={db.description}
                        color={db.color}
                        onClick={() => handleClick(db)}
                        status={db.internal ? 'アプリ内で開く' : '別タブで開く'} />
                      {db.custom && (
                        <div style={{
                          position: 'absolute', top: 8, right: 8,
                          display: 'flex', gap: 4,
                        }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditDialog(customLinks.find(l => l.id === db.id)) }}
                            title="編集"
                            style={{
                              width: 26, height: 26, borderRadius: 6,
                              background: T.bgCard, color: T.textSub,
                              border: `1px solid ${T.border}`, cursor: 'pointer',
                              fontSize: 12, fontFamily: 'inherit',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>✎</button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteLink(db.id) }}
                            title="削除"
                            style={{
                              width: 26, height: 26, borderRadius: 6,
                              background: T.bgCard, color: T.danger,
                              border: `1px solid ${T.danger}40`, cursor: 'pointer',
                              fontSize: 12, fontFamily: 'inherit',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>×</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}

        {filtered.length === 0 && search && (
          <div style={{
            padding: '40px 20px', textAlign: 'center', color: T.textMuted,
            fontSize: 13, background: T.bgCard, borderRadius: 14,
            boxShadow: IOS_SHADOW,
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
            「{search}」に一致する項目がありません
          </div>
        )}
      </div>

      {/* ─── 追加 / 編集モーダル ─── */}
      {showAdd && (
        <div
          onClick={() => setShowAdd(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: T.bgCard, borderRadius: 16,
              padding: 24, maxWidth: 460, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
              {editingId ? 'リンクを編集' : '好きなURLを登録'}
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
              業務でよく使うサイトをホームに表示できます。
              タイトルとURLを入力してください。
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.textSub }}>タイトル</span>
              <input
                type="text" value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="例: 社内Wiki"
                style={{
                  padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.sectionBg,
                  color: T.text, fontSize: 13, fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.textSub }}>URL</span>
              <input
                type="url" value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="例: https://example.com"
                style={{
                  padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.sectionBg,
                  color: T.text, fontSize: 13, fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </label>

            {formError && (
              <div style={{
                padding: '8px 12px', borderRadius: 6,
                background: `${T.danger}1a`, color: T.danger,
                fontSize: 12, fontWeight: 600,
              }}>⚠️ {formError}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => setShowAdd(false)} style={{
                flex: 1, padding: '10px 16px', borderRadius: 8,
                background: 'transparent', color: T.textSub,
                border: `1px solid ${T.border}`, cursor: 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              }}>キャンセル</button>
              <button onClick={submitForm} style={{
                flex: 1, padding: '10px 16px', borderRadius: 8,
                background: T.accent, color: '#fff', border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit',
              }}>{editingId ? '保存' : '追加'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

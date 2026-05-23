'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { COMMON_TOKENS, TYPO, SPACING, RADIUS, SHADOWS, GLASS, BRAND_GRADIENT } from '../lib/themeTokens'
import { cardStyle, btnGhost, btnBrand, btnSecondary } from '../lib/iosStyles'
import Icon from './Icon'

// ─── テーマは lib/themeTokens.js で一元管理 ─────────────────────
const THEMES = {
  dark:  { ...COMMON_TOKENS.dark,  cardHover: 'rgba(255,255,255,0.04)' },
  light: { ...COMMON_TOKENS.light, cardHover: 'rgba(0,0,0,0.02)' },
}

// ─── カスタムリンク (localStorage 永続化) ─────────────────────────
// カスタムリンクは「アイコン色」で見分ける。色トークンキーで保存し描画時に T から解決する。
const LINK_COLOR_KEYS = ['accent', 'success', 'warn', 'danger', 'purple', 'indigo']
const CUSTOM_LINKS_KEY = (email) => `portal_custom_links_v1_${email || 'guest'}`

// 色キーから { bg, fg } を解決 (アイコンタイルの淡色背景 + 前景色)。purple/indigo は固定 hex (トークン未定義のため)
function linkColorTokens(T, key) {
  switch (key) {
    case 'success': return { bg: T.successSoft, fg: T.success }
    case 'warn':    return { bg: T.warnSoft,    fg: T.warn }
    case 'danger':  return { bg: T.dangerSoft,  fg: T.danger }
    case 'purple':  return { bg: 'rgba(168,85,247,.14)', fg: '#7c3aed' }
    case 'indigo':  return { bg: 'rgba(99,102,241,.14)', fg: '#4f46e5' }
    case 'accent':
    default:        return { bg: T.accentSoft, fg: T.accentText }
  }
}

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
// URL からホスト部分を取り出して mono 表示する (https:// やパスを削る)
function displayUrl(url) {
  try { return new URL(url).host } catch { return (url || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '') }
}

export default function PortalPage({ user, onNavigate, themeKey = 'dark', members = [], T: passedT }) {
  const T = passedT || THEMES[themeKey] || THEMES.dark

  // カスタムリンク state
  const [customLinks, setCustomLinks] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formTitle, setFormTitle] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formColor, setFormColor] = useState('accent')
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
    setEditingId(null); setFormTitle(''); setFormUrl(''); setFormColor('accent'); setFormError(''); setShowAdd(true)
  }
  function openEditDialog(link) {
    setEditingId(link.id); setFormTitle(link.title); setFormUrl(link.url)
    setFormColor(link.color && LINK_COLOR_KEYS.includes(link.color) ? link.color : 'accent')
    setFormError(''); setShowManage(false); setShowAdd(true)
  }
  function submitForm() {
    const title = formTitle.trim()
    const url = normalizeUrl(formUrl)
    if (!title) { setFormError('表示名を入力してください'); return }
    if (!url)   { setFormError('URLを入力してください'); return }
    try { new URL(url) } catch { setFormError('URLの形式が正しくありません'); return }
    if (editingId) {
      persistLinks(customLinks.map(l => l.id === editingId ? { ...l, title, url, color: formColor } : l))
    } else {
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      persistLinks([...customLinks, { id, title, url, color: formColor }])
    }
    setShowAdd(false)
  }
  function deleteLink(id) {
    persistLinks(customLinks.filter(l => l.id !== id))
  }

  // 表示名 (members から解決、無ければ email)
  const displayName = useMemo(() => {
    const m = members.find(mm => mm.email === user?.email)
    return m?.name || user?.email || 'ゲスト'
  }, [members, user?.email])
  const avatarUrl = useMemo(() => {
    const m = members.find(mm => mm.email === user?.email)
    return user?.avatarUrl || m?.avatar_url || null
  }, [members, user?.email, user?.avatarUrl])
  const initial = (displayName || 'U').trim().charAt(0)

  // 日付 "M/D(曜)"
  const dateLabel = (() => {
    const d = new Date()
    const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
    return `${d.getMonth() + 1}/${d.getDate()}(${wd})`
  })()

  // 統計値はこのページのpropsからは取得できないため "—" でグレースフルに表示する (捏造しない)
  const myStats = [
    { lbl: '今日のタスク', val: '—', color: T.warn },
    { lbl: '期限切れ',     val: '—', color: T.danger },
    { lbl: '未読メール',   val: '—', color: T.accentText },
  ]
  const companyStats = [
    { lbl: 'KR達成率',       val: '—', color: T.success },
    { lbl: 'タスク完了率',   val: '—', color: T.accentText },
    { lbl: '未対応確認事項', val: '—', color: T.warn },
  ]

  // ─── 共通スタイル断片 ──────────────────────────────
  const destCard = {
    ...cardStyle({ T, padding: 24 }),
    borderRadius: RADIUS.xl,
    display: 'flex', flexDirection: 'column', gap: 14,
    cursor: 'pointer',
  }
  const openPill = {
    position: 'absolute', top: 24, right: 24,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 11px', fontSize: 11.5, fontWeight: 600,
    background: GLASS.light, border: `1px solid ${T.border}`,
    borderRadius: RADIUS.pill, color: T.textSub,
  }
  const statRow = {
    display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10,
    paddingTop: 14, borderTop: `1px solid ${T.border}`, marginTop: 'auto',
  }
  const statLbl = {
    fontSize: 10.5, color: T.textMuted, fontWeight: 600,
    letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 2,
  }

  function DestCard({ kind, icon, title, desc, stats, onClick }) {
    const tileBg = kind === 'company'
      ? 'linear-gradient(135deg,#10b981,#059669)'
      : BRAND_GRADIENT.cta
    const tileShadow = kind === 'company'
      ? '0 4px 12px rgba(5,150,105,.28)'
      : '0 4px 12px rgba(37,99,235,.28)'
    return (
      <div role="button" tabIndex={0} onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
        style={destCard}>
        <span style={openPill}>開く <Icon name="arrowRight" size={11} /></span>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: tileBg,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: tileShadow,
          }}>
            <Icon name={icon} size={22} stroke={1.8} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.005em', margin: '0 0 4px', color: T.text }}>{title}</h2>
            <div style={{ fontSize: 12.5, color: T.textSub, lineHeight: 1.6 }}>{desc}</div>
          </div>
        </div>
        <div style={statRow}>
          {stats.map(s => (
            <div key={s.lbl}>
              <div style={statLbl}>{s.lbl}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.01em', color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── インフォカード (最近の動き / お知らせ) ────────────
  function InfoCard({ icon, iconColor, title, emptyText }) {
    return (
      <div style={{ ...cardStyle({ T, padding: 0 }), borderRadius: RADIUS.lg }}>
        <div style={{ padding: '11px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <h4 style={{ fontSize: 12.5, fontWeight: 700, margin: 0, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name={icon} size={13} style={{ color: iconColor }} /> {title}
          </h4>
        </div>
        <div style={{ padding: '22px 14px', textAlign: 'center', color: T.textMuted, fontSize: 12, lineHeight: 1.7 }}>
          {emptyText}
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg, position: 'relative' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 28px 80px', position: 'relative' }}>

        {/* ─── Welcome strip ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{
              width: 48, height: 48, borderRadius: 14, objectFit: 'cover', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(30,58,138,.28)',
            }} />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg,#3b82f6,#1e3a8a)',
              color: '#fff', fontSize: 18, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 4px 12px rgba(30,58,138,.28)',
            }}>{initial}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 2px', color: T.text }}>
              おかえりなさい、{displayName}さん
            </h1>
            <div style={{ fontSize: 12.5, color: T.textSub, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>{dateLabel}</span>
            </div>
          </div>
        </div>

        {/* ─── Destination grid (2 cards) ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
          <DestCard
            kind="me"
            icon="user"
            title="マイページ"
            desc="今日のタスク・自分の目標・振り返り。業務を一括で見渡せる、毎日の起点になる画面。"
            stats={myStats}
            onClick={() => onNavigate('mycoach')}
          />
          <DestCard
            kind="company"
            icon="chart"
            title="全社ダッシュボード"
            desc="事業部の進捗・KR の達成状況・タスク完了率を一目で。経営層・マネージャー向けのサマリー画面。"
            stats={companyStats}
            onClick={() => onNavigate('summary')}
          />
        </div>

        {/* ─── カスタムリンク ─── */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '8px 0 14px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="link" size={13} style={{ color: T.accent }} /> カスタムリンク
          </h3>
          <span style={{ fontSize: 11.5, color: T.textMuted }}>
            よく使うツール・社内ドキュメント・外部サービスをここに追加できます
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => setShowManage(true)}
              style={{ ...btnGhost({ T, size: 'sm' }), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="settings" size={12} /> 管理
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {customLinks.map(l => {
            const c = linkColorTokens(T, l.color)
            return (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                style={{
                  ...cardStyle({ T, padding: 14 }), borderRadius: RADIUS.md,
                  display: 'flex', alignItems: 'center', gap: 10,
                  textDecoration: 'none', color: 'inherit', cursor: 'pointer',
                }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, background: c.bg, color: c.fg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name="link" size={16} stroke={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                  <div style={{ fontSize: 10.5, color: T.textMuted, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl(l.url)}</div>
                </div>
                <span style={{ color: T.textMuted, flexShrink: 0 }}><Icon name="external" size={11} stroke={1.8} /></span>
              </a>
            )
          })}

          {/* 追加カード (点線) */}
          <button onClick={openAddDialog}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: 14, background: T.sectionBg,
              border: `1.5px dashed ${T.borderMid}`, borderRadius: RADIUS.md,
              color: T.textSub, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            <Icon name="plus" size={13} stroke={2.2} /> リンクを追加
          </button>
        </div>

        {/* ─── 情報グリッド ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18 }}>
          <InfoCard icon="clock" iconColor={T.accent} title="最近の動き" emptyText="最近の動きはありません" />
          <InfoCard icon="bell" iconColor={T.warn} title="お知らせ" emptyText="新しいお知らせはありません" />
        </div>
      </div>

      {/* ─── 追加 / 編集モーダル ─── */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
          }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: 'calc(100vw - 40px)',
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
              boxShadow: SHADOWS.xl, overflow: 'hidden',
            }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1, color: T.text }}>
                {editingId ? 'カスタムリンクを編集' : 'カスタムリンクを追加'}
              </h4>
              <button onClick={() => setShowAdd(false)} aria-label="閉じる"
                style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.border}`, background: T.sectionBg, color: T.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cross" size={13} stroke={2} />
              </button>
            </div>

            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, marginBottom: 4, display: 'block' }}>表示名</label>
                <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="例: 経費精算"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: 'inherit', color: T.text, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, marginBottom: 4, display: 'block' }}>URL</label>
                <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, background: T.sectionBg, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: 'inherit', color: T.text, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, marginBottom: 4, display: 'block' }}>アイコン色</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {LINK_COLOR_KEYS.slice(0, 5).map(key => {
                    const c = linkColorTokens(T, key)
                    const active = formColor === key
                    return (
                      <span key={key} onClick={() => setFormColor(key)} role="button" aria-label={key}
                        style={{ width: 24, height: 24, borderRadius: 6, background: c.bg, cursor: 'pointer', border: active ? `2px solid ${c.fg}` : '2px solid transparent' }} />
                    )
                  })}
                </div>
              </div>
              {formError && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: T.dangerSoft, color: T.danger, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="alert" size={14} /> {formError}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: T.sectionBg }}>
              <button onClick={() => setShowAdd(false)} style={btnSecondary({ T, size: 'md' })}>キャンセル</button>
              <button onClick={submitForm} style={btnBrand({ size: 'md' })}>{editingId ? '保存する' : '追加する'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 管理モーダル (編集 / 削除) ─── */}
      {showManage && (
        <div onClick={() => setShowManage(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.4)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
          }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: 'calc(100vw - 40px)',
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
              boxShadow: SHADOWS.xl, overflow: 'hidden',
            }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, flex: 1, color: T.text }}>カスタムリンクを管理</h4>
              <button onClick={() => setShowManage(false)} aria-label="閉じる"
                style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.border}`, background: T.sectionBg, color: T.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="cross" size={13} stroke={2} />
              </button>
            </div>
            <div style={{ padding: '8px 0', maxHeight: '60vh', overflowY: 'auto' }}>
              {customLinks.length === 0 ? (
                <div style={{ padding: '24px 18px', textAlign: 'center', color: T.textMuted, fontSize: 12, lineHeight: 1.7 }}>
                  登録済みのリンクはありません。<br />「リンクを追加」から登録してください。
                </div>
              ) : customLinks.map(l => {
                const c = linkColorTokens(T, l.color)
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="link" size={14} stroke={1.8} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                      <div style={{ fontSize: 10.5, color: T.textMuted, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl(l.url)}</div>
                    </div>
                    <button onClick={() => openEditDialog(l)} title="編集"
                      style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: T.sectionBg, color: T.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="pencil" size={13} />
                    </button>
                    <button onClick={() => deleteLink(l.id)} title="削除"
                      style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.danger}40`, background: T.sectionBg, color: T.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8, background: T.sectionBg }}>
              <button onClick={() => { setShowManage(false); openAddDialog() }} style={{ ...btnBrand({ size: 'md' }), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="plus" size={13} stroke={2.2} /> リンクを追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

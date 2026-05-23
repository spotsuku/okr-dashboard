'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { MEETINGS } from '../lib/meetings'
import { renderTextWithLinks } from '../lib/renderTextWithLinks'
import Icon, { DataIcon } from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS, GLASS } from '../lib/themeTokens'
import { btnPrimary, btnBrand, btnSecondary, inputStyle, accentRingStyle } from '../lib/iosStyles'

// 共有・確認タブ
//   kind = 'confirmation' (確認) / 'share' (共有)
//   to_name = '' で全体宛
//   meeting_keys[] / reference_urls JSONB をサポート
//
// Props: { T, myName, members, viewingName, companyWide }
//   companyWide=true の場合は全社を一覧表示 (受信/送信タブなし・新規作成不可)

export default function ConfirmationsTab({
  T, myName, members = [], viewingName,
  companyWide = false, allowCompose = false,
  lockedKind = null,             // 'share' | 'confirmation' | null  (指定時は kindFilter を固定)
  defaultMeetingKey = null,      // ComposeModal で初期チェックされる会議 key
}) {
  // 表示対象: 他メンバーのページを見ている場合はそのメンバー、自分のページなら自分
  const targetName = viewingName || myName
  const isViewingSelf = !viewingName || viewingName === myName

  const [tab, setTab] = useState('received') // 'received' | 'sent'
  const [kindFilter, setKindFilter] = useState(lockedKind || 'all') // 'all' | 'confirmation' | 'share'
  // lockedKind 変更時に強制反映
  useEffect(() => { if (lockedKind) setKindFilter(lockedKind) }, [lockedKind])
  const [showResolved, setShowResolved] = useState(false)
  const [items, setItems] = useState([])
  const [replies, setReplies] = useState({}) // confirmation_id → [replies]
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)
  const [replyingId, setReplyingId] = useState(null)
  // 受信/送信 それぞれの件数 (バッジ表示用)
  const [counts, setCounts] = useState({ receivedOpen: 0, receivedAll: 0, sentAll: 0 })

  const load = useCallback(async () => {
    if (!companyWide && !targetName) return
    setLoading(true)
    let q = supabase.from('member_confirmations')
      .select('*').order('created_at', { ascending: false })
    if (!companyWide) {
      if (tab === 'received') {
        // 自分宛 + 全体宛 (to_name='') を含める
        q = q.or(`to_name.eq.${targetName},to_name.eq.`)
      } else {
        q = q.eq('from_name', targetName)
      }
    }
    if (!showResolved) q = q.eq('status', 'open')
    if (kindFilter !== 'all') q = q.eq('kind', kindFilter)
    const { data } = await q
    let result = data || []
    // 会議キー指定があれば絞り込み (会議未指定 or 指定キーを含むもののみ)
    if (defaultMeetingKey) {
      result = result.filter(it => {
        const mks = Array.isArray(it.meeting_keys) ? it.meeting_keys : []
        return mks.length === 0 || mks.includes(defaultMeetingKey)
      })
    }
    setItems(result)

    // 返信をまとめて取得
    if (data && data.length > 0) {
      const ids = data.map(d => d.id)
      const { data: reps } = await supabase
        .from('member_confirmation_replies')
        .select('*').in('confirmation_id', ids).order('created_at', { ascending: true })
      const m = {}
      for (const r of (reps || [])) {
        if (!m[r.confirmation_id]) m[r.confirmation_id] = []
        m[r.confirmation_id].push(r)
      }
      setReplies(m)
    } else {
      setReplies({})
    }
    setLoading(false)
  }, [targetName, tab, showResolved, companyWide, kindFilter, defaultMeetingKey])

  // 件数バッジ用に受信 open / 受信 全 / 送信 全 を並行で取得
  const loadCounts = useCallback(async () => {
    if (companyWide || !targetName) return
    const [recvOpen, recvAll, sentAll] = await Promise.all([
      supabase.from('member_confirmations').select('id', { count: 'exact', head: true })
        .eq('to_name', targetName).eq('status', 'open'),
      supabase.from('member_confirmations').select('id', { count: 'exact', head: true })
        .eq('to_name', targetName),
      supabase.from('member_confirmations').select('id', { count: 'exact', head: true })
        .eq('from_name', targetName),
    ])
    setCounts({
      receivedOpen: recvOpen.count || 0,
      receivedAll:  recvAll.count  || 0,
      sentAll:      sentAll.count  || 0,
    })
  }, [targetName, companyWide])

  useEffect(() => { load(); loadCounts() }, [load, loadCounts])

  // Realtime: 確認事項 + 返信 の変更を即反映 (件数も再取得)
  useEffect(() => {
    const ch = supabase.channel('confirmations_' + (companyWide ? 'all' : (targetName || 'anon')))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_confirmations' }, () => { load(); loadCounts() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_confirmation_replies' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [targetName, load, loadCounts, companyWide])

  const resolve = async (id) => {
    const { error } = await supabase.from('member_confirmations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert('確認済み化に失敗: ' + error.message); return }
    load()
  }

  const unresolve = async (id) => {
    const { error } = await supabase.from('member_confirmations')
      .update({ status: 'open', resolved_at: null }).eq('id', id)
    if (error) { alert('再オープンに失敗: ' + error.message); return }
    load()
  }

  const remove = async (id) => {
    if (!window.confirm('この確認事項を削除しますか?')) return
    const { error } = await supabase.from('member_confirmations').delete().eq('id', id)
    if (error) { alert('削除失敗: ' + error.message); return }
    load()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.bg }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 16px' }}>
        {/* ヘッダ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg - 2, flexWrap: 'wrap' }}>
          {/* accent-bg アイコンタイル */}
          <div style={{
            width: 30, height: 30, borderRadius: RADIUS.sm + 1,
            background: T.accentBg, color: T.accentText,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name={lockedKind === 'confirmation' ? 'inbox' : 'msg'} size={16} />
          </div>
          <div>
            <h1 style={{ ...TYPO.title2, color: T.text, margin: 0 }}>
              {lockedKind === 'share' ? '共有事項' : lockedKind === 'confirmation' ? '確認事項' : '共有・確認'}
            </h1>
            <div style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted, marginTop: 2 }}>
              {companyWide
                ? '全社の共有・確認事項'
                : isViewingSelf ? 'メンバー間の共有・確認事項を送受信' : `${targetName}さんの共有・確認 (閲覧)`}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {(!companyWide || allowCompose) && (
            <button onClick={() => setComposing(true)} style={{
              ...btnBrand({ size: 'sm' }),
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="plus" size={14} /> 新規作成</button>
          )}
        </div>

        {/* 新規作成モーダル */}
        {composing && (!companyWide || allowCompose) && (
          <ComposeModal T={T} myName={myName} members={members}
            presetKind={lockedKind || 'confirmation'}
            presetMeetingKeys={defaultMeetingKey ? [defaultMeetingKey] : []}
            onClose={() => setComposing(false)}
            onSaved={() => { setComposing(false); load() }} />
        )}

        {/* フィルタバー */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md, flexWrap: 'wrap',
        }}>
          {/* 受信/送信 セグメント (グループ化されたピル) */}
          {!companyWide && (
            <div style={{
              display: 'inline-flex', padding: 3, gap: 2,
              background: T.bgSoft, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm + 1,
            }}>
              {[
                // 受信は「未確認 件数 / 全件数」を表示 (未確認があれば赤バッジ)
                { key: 'received', label: '受信',
                  countMain: showResolved ? counts.receivedAll : counts.receivedOpen,
                  hasAlert: counts.receivedOpen > 0 },
                // 送信は全件数
                { key: 'sent', label: '送信',
                  countMain: counts.sentAll, hasAlert: false },
              ].map(t => {
                const active = tab === t.key
                return (
                  <button key={t.key} onClick={() => setTab(t.key)} style={{
                    padding: `${SPACING.xs + 1}px ${SPACING.md + 2}px`, borderRadius: RADIUS.xs, border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? T.bgCard : 'transparent',
                    color:      active ? T.text   : T.textSub,
                    boxShadow: active ? SHADOWS.xs : 'none',
                    ...TYPO.subhead, fontWeight: active ? 700 : 500,
                    display: 'inline-flex', alignItems: 'center', gap: SPACING.xs + 1,
                  }}>
                    <span>{t.label}</span>
                    <span style={{
                      padding: '1px 7px', borderRadius: RADIUS.pill,
                      background: active
                        ? (t.hasAlert ? T.danger : T.accent)
                        : (t.hasAlert ? T.danger : T.border),
                      color: (active || t.hasAlert) ? '#fff' : T.textMuted,
                      ...TYPO.caption, fontWeight: 700, minWidth: 16, textAlign: 'center',
                    }}>{t.countMain}</span>
                  </button>
                )
              })}
            </div>
          )}
          {companyWide && (
            <div style={{ ...TYPO.footnote, color: T.textSub, padding: '3px 4px' }}>
              件数: <strong style={{ color: T.text }}>{items.length}</strong>
            </div>
          )}
          {/* 右側: 種別 ghost ボタン + 確認済みチェック */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, flexWrap: 'wrap' }}>
            {/* 種別フィルタ (lockedKind 指定時は非表示) */}
            {!lockedKind && (
              <div style={{ display: 'flex', gap: SPACING.xs + 2 }}>
                {[
                  { key: 'all',          label: 'すべて', iconName: 'check' },
                  { key: 'share',        label: '共有', iconName: 'msg' },
                  { key: 'confirmation', label: '確認', iconName: 'inbox' },
                ].map(k => {
                  const a = kindFilter === k.key
                  return (
                    <button key={k.key} onClick={() => setKindFilter(k.key)} style={{
                      ...btnSecondary({ T, size: 'sm' }),
                      background: a ? T.accentBg : T.bgSoft,
                      color: a ? T.accentText : T.text,
                      border: `1px solid ${a ? T.accent + '4d' : T.border}`,
                      display: 'inline-flex', alignItems: 'center', gap: SPACING.xs + 1,
                    }}>{k.iconName && <Icon name={k.iconName} size={12} />}{k.label}</button>
                  )
                })}
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, ...TYPO.footnote, fontWeight: 500, color: T.textSub, cursor: 'pointer' }}>
              <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} style={{ accentColor: T.accent }} />
              確認済みも表示
            </label>
          </div>
        </div>

        {/* リスト */}
        {loading ? (
          <div style={{ padding: SPACING['3xl'], textAlign: 'center', color: T.textMuted, ...TYPO.subhead }}>読み込み中...</div>
        ) : items.length === 0 ? (
          <div style={{
            padding: SPACING['3xl'] + SPACING.sm, textAlign: 'center', color: T.textMuted, ...TYPO.subhead,
            background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: RADIUS.md,
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: SPACING.sm + 2 }}><Icon name="inbox" size={28} /></div>
            {companyWide ? '確認事項はありません'
              : tab === 'received' ? '自分宛の確認事項はありません' : '送信した確認事項はありません'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
            {items.map(it => (
              <ConfirmationCard key={it.id} T={T} item={it} tab={tab}
                companyWide={companyWide}
                replies={replies[it.id] || []} myName={myName} members={members}
                isReplying={replyingId === it.id}
                onStartReply={() => setReplyingId(it.id)}
                onCancelReply={() => setReplyingId(null)}
                onReplied={() => { setReplyingId(null); load() }}
                onResolve={() => resolve(it.id)}
                onUnresolve={() => unresolve(it.id)}
                onRemove={() => remove(it.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 確認事項カード ─────────────────────────────────────────────
function ConfirmationCard({ T, item, tab, companyWide = false, replies, myName, members, isReplying, onStartReply, onCancelReply, onReplied, onResolve, onUnresolve, onRemove }) {
  const isResolved = item.status === 'resolved'
  const isReceived = tab === 'received'
  const counterparty = isReceived ? item.from_name : (item.to_name || '全体')
  const counterpartyMember = members.find(m => m.name === counterparty)
  const isShare = item.kind === 'share'
  const refUrls = Array.isArray(item.reference_urls) ? item.reference_urls : []
  const meetingKeys = Array.isArray(item.meeting_keys) ? item.meeting_keys : []
  const meetingTitles = meetingKeys
    .map(k => MEETINGS.find(mm => mm.key === k))
    .filter(Boolean)
  const isToAll = !item.to_name

  return (
    <div style={{
      background: isResolved ? T.sectionBg : T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: RADIUS.lg, padding: `${SPACING.md + 2}px ${SPACING.lg}px`,
      backdropFilter: GLASS.blur,
      WebkitBackdropFilter: GLASS.blur,
      boxShadow: isResolved ? SHADOWS.none : `${SHADOWS.xs}, ${SHADOWS.glassInset}`,
      opacity: isResolved ? 0.6 : 1,
      transition: 'all 0.2s ease',
    }}>
      {/* ヘッダ行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm, flexWrap: 'wrap' }}>
        {/* 小アイコンタイル (accent) */}
        <div style={{
          width: 22, height: 22, borderRadius: RADIUS.xs, flexShrink: 0,
          background: isShare ? T.warnBg : T.accentBg,
          color: isShare ? T.warn : T.accentText,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name={isShare ? 'msg' : 'inbox'} size={13} /></div>
        {/* 種別ラベル */}
        <span style={{ ...TYPO.subhead, fontWeight: 600, color: T.text }}>{isShare ? '共有' : '確認'}</span>
        {companyWide ? (
          <>
            <span style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted }}>
              from <b style={{ color: T.textSub }}>{item.from_name}</b>
            </span>
            <span style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}>
              → to <b style={{ color: T.textSub, display: 'inline-flex', alignItems: 'center', gap: 2 }}>{isToAll ? <><Icon name="org" size={11} />全体</> : item.to_name}</b>
            </span>
          </>
        ) : (
          <>
            <span style={{ ...TYPO.footnote, fontWeight: 500, color: T.textMuted, display: 'inline-flex', alignItems: 'center', gap: SPACING.xs }}>
              {isReceived ? 'from' : 'to'}
              <b style={{ color: T.textSub, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {isToAll ? <><Icon name="org" size={11} />全体</> : (counterpartyMember?.name || counterparty)}
              </b>
              {!isToAll && counterpartyMember?.role && (
                <span style={{ color: T.textFaint }}>({counterpartyMember.role})</span>
              )}
            </span>
          </>
        )}
        {/* 会議タグ (scope ピル) */}
        {meetingTitles.map(m => (
          <span key={m.key} style={{
            padding: '2px 8px 2px 5px', borderRadius: RADIUS.xs - 1,
            background: T.accentBg, color: T.accentText,
            ...TYPO.footnote, fontWeight: 600,
            border: `1px solid ${T.accent}2e`,
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><DataIcon value={m.icon} size={11} fallback="note" /> {m.title}</span>
        ))}
        <span style={{ ...TYPO.caption, fontWeight: 600, color: T.textMuted, marginLeft: 'auto', fontFamily: 'ui-monospace, monospace', letterSpacing: 0 }}>
          {formatRelTime(item.created_at)}
        </span>
        {isResolved && (
          <span style={{
            padding: '1px 6px', borderRadius: RADIUS.pill,
            background: T.successBg, color: T.success,
            ...TYPO.caption, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><Icon name="check" size={10} />確認済み</span>
        )}
      </div>

      {/* 本文 */}
      <div style={{
        ...TYPO.body, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.55,
        paddingLeft: 30, marginBottom: SPACING.sm + 2,
      }}>{renderTextWithLinks(item.content, { color: T.accent })}</div>

      {/* 参考URL */}
      {refUrls.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.xs + 2, marginTop: SPACING.xs + 2, paddingLeft: 30 }}>
          {refUrls.map((u, i) => {
            const href = u.url?.match(/^https?:\/\//) ? u.url : (u.url ? `https://${u.url}` : '#')
            return (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                padding: '3px 9px', borderRadius: RADIUS.xs,
                background: T.accentBg, color: T.accent,
                ...TYPO.footnote, fontWeight: 700, textDecoration: 'none',
                border: `1px solid ${T.accent}30`,
              }}><Icon name="link" size={12} /> {u.label || u.url}</a>
            )
          })}
        </div>
      )}

      {/* 返信スレッド */}
      {replies.length > 0 && (
        <div style={{ marginTop: SPACING.sm + 2, marginLeft: 30, paddingLeft: SPACING.md, borderLeft: `2px solid ${T.border}` }}>
          {replies.map(r => (
            <div key={r.id} style={{ marginBottom: SPACING.sm, ...TYPO.subhead, fontWeight: 500 }}>
              <div style={{ ...TYPO.caption, fontWeight: 700, color: T.textMuted, marginBottom: 2 }}>
                <b style={{ color: T.textSub }}>{r.from_name}</b> ・ {formatRelTime(r.created_at)}
              </div>
              <div style={{ color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{renderTextWithLinks(r.content, { color: T.accent })}</div>
            </div>
          ))}
        </div>
      )}

      {/* 返信入力フォーム */}
      {isReplying && (
        <div style={{ paddingLeft: 30 }}>
          <ReplyForm T={T} confirmationId={item.id} myName={myName}
            onCancel={onCancelReply} onSaved={onReplied} />
        </div>
      )}

      {/* アクション行 */}
      <div style={{ display: 'flex', gap: SPACING.xs + 2, marginTop: SPACING.sm + 2, paddingLeft: 30, flexWrap: 'wrap' }}>
        {!isReplying && (
          <button onClick={onStartReply} style={btnSt(T)}><Icon name="msg" size={12} /> 返信</button>
        )}
        {isReceived && !isResolved && (
          <button onClick={onResolve} style={{
            ...btnSt(T),
            background: T.successBg, color: T.success,
            border: `1px solid ${T.success}40`,
          }}><Icon name="check" size={12} /> 確認済みにする</button>
        )}
        {isReceived && isResolved && (
          <button onClick={onUnresolve} style={btnSt(T)}><Icon name="refresh" size={12} /> 再オープン</button>
        )}
        {!isReceived && (
          <button onClick={onRemove} style={btnSt(T, T.danger)}><Icon name="trash" size={12} /> 削除</button>
        )}
      </div>
    </div>
  )
}

function btnSt(T, color) {
  return {
    padding: `${SPACING.xs + 1}px ${SPACING.md}px`, borderRadius: RADIUS.xs,
    background: color ? 'transparent' : T.bgSoft,
    color: color || T.text,
    border: `1px solid ${color ? color + '40' : T.border}`,
    ...TYPO.footnote, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
  }
}

function formatRelTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = (now - d) / 1000 // sec
  if (diff < 60) return 'たった今'
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`
}

// ─── 返信フォーム ──────────────────────────────────────────────
function ReplyForm({ T, confirmationId, myName, onCancel, onSaved }) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!content.trim() || saving) return
    setSaving(true)
    const { error } = await supabase.from('member_confirmation_replies').insert({
      confirmation_id: confirmationId, from_name: myName, content: content.trim(),
    })
    setSaving(false)
    if (error) { alert('返信失敗: ' + error.message); return }
    onSaved()
  }

  return (
    <div style={{ marginTop: SPACING.sm + 2 }}>
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder="返信を入力 (Ctrl+Enterで送信)"
        rows={3}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() } }}
        style={{
          ...inputStyle({ T }), ...TYPO.subhead, fontWeight: 500,
          background: T.bg, borderRadius: RADIUS.xs, resize: 'vertical',
        }} />
      <div style={{ display: 'flex', gap: SPACING.xs + 2, marginTop: SPACING.xs + 2, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={saving} style={btnSt(T)}>キャンセル</button>
        <button onClick={save} disabled={!content.trim() || saving} style={{
          ...btnPrimary({ T, size: 'sm' }),
          background: content.trim() ? undefined : T.border,
          cursor: content.trim() && !saving ? 'pointer' : 'not-allowed',
        }}>{saving ? '送信中…' : '送信'}</button>
      </div>
    </div>
  )
}

// ─── 新規作成モーダル ────────────────────────────────────────────
function ComposeModal({ T, myName, members, onClose, onSaved, presetTo = '', presetKind = 'confirmation', presetMeetingKeys = [] }) {
  const [kind, setKind] = useState(presetKind)               // 'confirmation' | 'share'
  const [toName, setToName] = useState(presetTo)             // 空文字 = 全体宛
  const [toAll,  setToAll]  = useState(presetTo === '__ALL__' ? true : !presetTo && presetKind === 'share')
  const [content, setContent] = useState('')
  const [meetingKeys, setMeetingKeys] = useState(presetMeetingKeys || [])
  const [refUrls, setRefUrls] = useState([])                 // [{ label, url }]
  const [saving, setSaving] = useState(false)

  const canSave = (toAll || toName) && content.trim() && !saving

  const toggleMeeting = (key) => {
    setMeetingKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }
  const addUrl    = () => setRefUrls(prev => [...prev, { label: '', url: '' }])
  const removeUrl = (i) => setRefUrls(prev => prev.filter((_, j) => j !== i))
  const updateUrl = (i, field, val) => setRefUrls(prev => prev.map((u, j) => j === i ? { ...u, [field]: val } : u))

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const cleanUrls = refUrls
      .map(u => ({ label: (u.label || '').trim(), url: (u.url || '').trim() }))
      .filter(u => u.url)
    const { data, error } = await supabase.from('member_confirmations')
      .insert({
        from_name: myName,
        to_name: toAll ? '' : toName,
        content: content.trim(),
        kind,
        meeting_keys: meetingKeys,
        reference_urls: cleanUrls,
      })
      .select().single()
    setSaving(false)
    if (error) { alert('送信失敗: ' + error.message); return }
    // Slack 通知 (失敗は握りつぶす、UI は通知なくても成立する)
    fetch('/api/integrations/confirmations/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation_id: data.id }),
    }).catch(() => {})
    onSaved()
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.35)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      animation: 'composeModalFade 0.2s ease',
    }}>
      <style>{`
        @keyframes composeModalFade { from {opacity:0} to {opacity:1} }
        @keyframes composeModalSlide { from {transform:translateY(20px); opacity:0} to {transform:translateY(0); opacity:1} }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, borderRadius: RADIUS.xl,
        padding: SPACING['2xl'], width: '100%', maxWidth: 540,
        boxShadow: SHADOWS.xl,
        animation: 'composeModalSlide 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg + 2 }}>
          <div style={{
            ...accentRingStyle({ color: T.accent, size: 40 }),
          }}><Icon name={kind === 'share' ? 'msg' : 'inbox'} size={18} /></div>
          <div style={{ ...TYPO.title2, color: T.text }}>
            {kind === 'share' ? '共有事項を送る' : '確認事項を送る'}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'rgba(120,120,128,0.16)', border: 'none',
            width: 30, height: 30, borderRadius: RADIUS.pill,
            color: T.textMuted, cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit', lineHeight: 1,
          }}><Icon name="cross" size={16} /></button>
        </div>

        {/* 種別 */}
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{ ...TYPO.footnote, color: T.textMuted, marginBottom: SPACING.xs }}>種別</div>
          <div style={{ display: 'flex', gap: SPACING.xs + 2 }}>
            {[
              { key: 'confirmation', label: '確認', iconName: 'inbox' },
              { key: 'share',        label: '共有', iconName: 'msg' },
            ].map(k => {
              const a = kind === k.key
              return (
                <button key={k.key} onClick={() => setKind(k.key)} style={{
                  padding: `${SPACING.xs + 3}px ${SPACING.md + 2}px`, borderRadius: RADIUS.xs, border: `1px solid ${a ? T.accent : T.border}`,
                  background: a ? T.accentBg : 'transparent',
                  color: a ? T.accent : T.textSub,
                  ...TYPO.subhead, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                }}><Icon name={k.iconName} size={13} />{k.label}</button>
              )
            })}
          </div>
        </div>

        {/* 宛先 (個別 or 全体) */}
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{ ...TYPO.footnote, color: T.textMuted, marginBottom: SPACING.xs }}>宛先</div>
          <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, ...TYPO.subhead, fontWeight: 500, color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={toAll} onChange={e => { setToAll(e.target.checked); if (e.target.checked) setToName('') }} />
              <Icon name="org" size={13} /> 全体宛
            </label>
            {!toAll && (
              <select value={toName} onChange={e => setToName(e.target.value)}
                style={{ ...inputSt(T), flex: 1, minWidth: 200 }}>
                <option value="">-- メンバーを選択 --</option>
                {members.filter(m => m.name !== myName).map(m => (
                  <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* 内容 */}
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{ ...TYPO.footnote, color: T.textMuted, marginBottom: SPACING.xs }}>内容</div>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder={kind === 'share' ? '共有したい内容を入力...' : '確認したい内容を入力...'}
            rows={4}
            autoFocus
            style={{ ...inputSt(T), resize: 'vertical' }} />
        </div>

        {/* 会議選択 (複数可) */}
        <div style={{ marginBottom: SPACING.md }}>
          <div style={{ ...TYPO.footnote, color: T.textMuted, marginBottom: SPACING.xs + 2 }}>
            どの会議で {kind === 'share' ? '共有' : '確認'} する？ (複数選択可・任意)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACING.xs + 2 }}>
            {MEETINGS.map(m => {
              const a = meetingKeys.includes(m.key)
              return (
                <button key={m.key} type="button" onClick={() => toggleMeeting(m.key)} style={{
                  padding: `${SPACING.xs}px ${SPACING.sm + 2}px`, borderRadius: RADIUS.pill,
                  border: `1px solid ${a ? T.accent : T.border}`,
                  background: a ? T.accentBg : 'transparent',
                  color: a ? T.accent : T.textSub,
                  ...TYPO.caption, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}><DataIcon value={m.icon} size={12} fallback="note" /> {m.title}</button>
              )
            })}
          </div>
        </div>

        {/* 参考URL (複数・ラベル付き) */}
        <div style={{ marginBottom: SPACING.lg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.xs + 2, marginBottom: SPACING.xs + 2 }}>
            <div style={{ ...TYPO.footnote, color: T.textMuted }}>参考URL (任意・複数可)</div>
            <button type="button" onClick={addUrl} style={{
              padding: '2px 10px', borderRadius: RADIUS.xs,
              background: 'transparent', color: T.accent, border: `1px solid ${T.accent}40`,
              ...TYPO.caption, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
            }}><Icon name="plus" size={11} /> 追加</button>
          </div>
          {refUrls.length === 0 ? (
            <div style={{ ...TYPO.caption, fontWeight: 700, color: T.textFaint, padding: '4px 0' }}>
              「追加」を押してURL欄を作成
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
              {refUrls.map((u, i) => (
                <div key={i} style={{ display: 'flex', gap: SPACING.xs + 2, alignItems: 'center' }}>
                  <input type="text" value={u.label} onChange={e => updateUrl(i, 'label', e.target.value)}
                    placeholder="ラベル (例: 議事録)"
                    style={{ ...inputSt(T), flex: '0 0 130px', fontSize: TYPO.footnote.fontSize }} />
                  <input type="url" value={u.url} onChange={e => updateUrl(i, 'url', e.target.value)}
                    placeholder="https://..."
                    style={{ ...inputSt(T), flex: 1, fontSize: TYPO.footnote.fontSize }} />
                  <button type="button" onClick={() => removeUrl(i)} style={{
                    flexShrink: 0, padding: '4px 8px', borderRadius: RADIUS.xs,
                    background: 'transparent', color: T.danger, border: `1px solid ${T.danger}30`,
                    ...TYPO.caption, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center',
                  }}><Icon name="cross" size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={btnSt(T)}>キャンセル</button>
          <button onClick={save} disabled={!canSave} style={{
            ...btnPrimary({ T, size: 'md' }),
            background: canSave ? undefined : T.border,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}>{saving ? '送信中…' : '送信'}</button>
        </div>
      </div>
    </div>
  )
}

function inputSt(T) {
  return {
    ...inputStyle({ T }),
    padding: `${SPACING.sm}px ${SPACING.sm + 2}px`, fontSize: TYPO.body.fontSize,
    background: T.bg, borderRadius: RADIUS.xs,
  }
}

// ダッシュボードの Box 用 (export)
export { ComposeModal }

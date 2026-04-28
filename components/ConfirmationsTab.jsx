'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// 📬 メンバー間の確認事項タブ
//   受信: 自分宛の未解決/解決済
//   送信: 自分が送ったもの
//   新規作成 / 返信 / 解決化
// Props: { T, myName, members, viewingName, companyWide }
//   companyWide=true の場合は全社の確認事項を一覧表示 (受信/送信タブなし・新規作成不可)

export default function ConfirmationsTab({ T, myName, members = [], viewingName, companyWide = false, allowCompose = false }) {
  // 表示対象: 他メンバーのページを見ている場合はそのメンバー、自分のページなら自分
  const targetName = viewingName || myName
  const isViewingSelf = !viewingName || viewingName === myName

  const [tab, setTab] = useState('received') // 'received' | 'sent'
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
      const column = tab === 'received' ? 'to_name' : 'from_name'
      q = q.eq(column, targetName)
    }
    if (!showResolved) q = q.eq('status', 'open')
    const { data } = await q
    setItems(data || [])

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
  }, [targetName, tab, showResolved, companyWide])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text, margin: 0 }}>📬 確認</h2>
          <div style={{ fontSize: 11, color: T.textMuted }}>
            {companyWide
              ? '全社の確認事項 (全メンバー間)'
              : isViewingSelf ? 'メンバー間の確認事項を送受信' : `${targetName}さんの確認事項 (閲覧)`}
          </div>
          <div style={{ flex: 1 }} />
          {(!companyWide || allowCompose) && (
            <button onClick={() => setComposing(true)} style={{
              padding: '6px 14px', borderRadius: 7,
              background: T.accent, color: '#fff', border: 'none',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>＋ 新規作成</button>
          )}
        </div>

        {/* 新規作成モーダル */}
        {composing && (!companyWide || allowCompose) && (
          <ComposeModal T={T} myName={myName} members={members}
            onClose={() => setComposing(false)}
            onSaved={() => { setComposing(false); load() }} />
        )}

        {/* タブ + フィルタ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap',
          padding: '8px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8,
        }}>
          {!companyWide && [
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
                padding: '5px 12px', borderRadius: 6, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
                background: active ? T.accent : 'transparent',
                color:      active ? '#fff'    : T.textSub,
                fontSize: 12, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <span>{t.label}</span>
                <span style={{
                  padding: '1px 7px', borderRadius: 99,
                  background: active
                    ? 'rgba(255,255,255,0.25)'
                    : (t.hasAlert ? '#ff6b6b' : T.border),
                  color: active
                    ? '#fff'
                    : (t.hasAlert ? '#fff' : T.textMuted),
                  fontSize: 10, fontWeight: 800, minWidth: 16, textAlign: 'center',
                }}>{t.countMain}</span>
              </button>
            )
          })}
          {companyWide && (
            <div style={{ fontSize: 11, color: T.textSub, padding: '3px 4px' }}>
              件数: <strong style={{ color: T.text }}>{items.length}</strong>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.textMuted, cursor: 'pointer' }}>
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
            確認済みも表示
          </label>
        </div>

        {/* リスト */}
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: T.textMuted, fontSize: 12 }}>読み込み中...</div>
        ) : items.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 12,
            background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: 10,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
            {companyWide ? '確認事項はありません'
              : tab === 'received' ? '自分宛の確認事項はありません' : '送信した確認事項はありません'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
  const counterparty = isReceived ? item.from_name : item.to_name
  const counterpartyMember = members.find(m => m.name === counterparty)

  return (
    <div style={{
      background: isResolved
        ? T.sectionBg
        : (!companyWide && isReceived)
          ? `linear-gradient(180deg, ${T.bgCard} 0%, ${T.accent}06 100%)`
          : T.bgCard,
      border: `1px solid ${isResolved ? T.border : ((!companyWide && isReceived) ? T.accent + '33' : T.border)}`,
      borderLeft: (!companyWide && isReceived && !isResolved) ? `4px solid ${T.accent}` : `1px solid ${T.border}`,
      borderRadius: 12, padding: '14px 16px',
      boxShadow: isResolved ? 'none' : '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
      opacity: isResolved ? 0.6 : 1,
      transition: 'all 0.2s ease',
    }}>
      {/* ヘッダ行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {companyWide ? (
          <>
            <span style={{ fontSize: 11, color: T.textMuted }}>from</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{item.from_name}</span>
            <span style={{ fontSize: 11, color: T.textMuted }}>→ to</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{item.to_name}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14 }}>{isReceived ? '📥' : '📤'}</span>
            <span style={{ fontSize: 11, color: T.textMuted }}>{isReceived ? 'from' : 'to'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
              {counterpartyMember?.name || counterparty}
            </span>
            {counterpartyMember?.role && (
              <span style={{ fontSize: 9, color: T.textFaint }}>({counterpartyMember.role})</span>
            )}
          </>
        )}
        <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 'auto' }}>
          {formatRelTime(item.created_at)}
        </span>
        {isResolved && (
          <span style={{
            padding: '1px 6px', borderRadius: 99,
            background: T.successBg, color: T.success,
            fontSize: 9, fontWeight: 700,
          }}>✓ 確認済み</span>
        )}
      </div>

      {/* 本文 */}
      <div style={{
        fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.6,
        padding: '6px 2px',
      }}>{item.content}</div>

      {/* 返信スレッド */}
      {replies.length > 0 && (
        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${T.border}` }}>
          {replies.map(r => (
            <div key={r.id} style={{ marginBottom: 8, fontSize: 12 }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>
                <b style={{ color: T.textSub }}>{r.from_name}</b> ・ {formatRelTime(r.created_at)}
              </div>
              <div style={{ color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* 返信入力フォーム */}
      {isReplying && (
        <ReplyForm T={T} confirmationId={item.id} myName={myName}
          onCancel={onCancelReply} onSaved={onReplied} />
      )}

      {/* アクションボタン */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {!isReplying && (
          <button onClick={onStartReply} style={btnSt(T)}>💬 返信</button>
        )}
        {isReceived && !isResolved && (
          <button onClick={onResolve} style={btnSt(T, T.success)}>✓ 確認済みにする</button>
        )}
        {isReceived && isResolved && (
          <button onClick={onUnresolve} style={btnSt(T)}>↻ 再オープン</button>
        )}
        {!isReceived && (
          <button onClick={onRemove} style={btnSt(T, T.danger)}>削除</button>
        )}
      </div>
    </div>
  )
}

function btnSt(T, color) {
  return {
    padding: '5px 12px', borderRadius: 6,
    background: 'transparent', color: color || T.textSub,
    border: `1px solid ${color ? color + '60' : T.border}`,
    fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
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
    <div style={{ marginTop: 10 }}>
      <textarea value={content} onChange={e => setContent(e.target.value)}
        placeholder="返信を入力 (Ctrl+Enterで送信)"
        rows={3}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() } }}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12,
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
          color: T.text, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
        }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={saving} style={btnSt(T)}>キャンセル</button>
        <button onClick={save} disabled={!content.trim() || saving} style={{
          padding: '5px 14px', borderRadius: 6,
          background: content.trim() ? T.accent : T.border, color: '#fff', border: 'none',
          fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
          cursor: content.trim() && !saving ? 'pointer' : 'not-allowed',
        }}>{saving ? '送信中…' : '送信'}</button>
      </div>
    </div>
  )
}

// ─── 新規作成モーダル ────────────────────────────────────────────
function ComposeModal({ T, myName, members, onClose, onSaved, presetTo = '' }) {
  const [toName, setToName] = useState(presetTo)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = toName && content.trim() && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const { data, error } = await supabase.from('member_confirmations')
      .insert({ from_name: myName, to_name: toName, content: content.trim() })
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.bgCard, border: `1px solid ${T.borderMid}`, borderRadius: 12,
        padding: 22, width: '100%', maxWidth: 520,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 20 }}>📬</span>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>確認事項を送る</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: T.textSub,
            fontSize: 22, cursor: 'pointer', padding: '0 8px',
          }}>×</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>宛先</div>
          <select value={toName} onChange={e => setToName(e.target.value)} style={inputSt(T)}>
            <option value="">-- メンバーを選択 --</option>
            {members.filter(m => m.name !== myName).map(m => (
              <option key={m.id} value={m.name}>{m.name}{m.role ? ` (${m.role})` : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>内容</div>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="確認したい内容を入力..."
            rows={5}
            autoFocus
            style={{ ...inputSt(T), resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={btnSt(T)}>キャンセル</button>
          <button onClick={save} disabled={!canSave} style={{
            padding: '7px 18px', borderRadius: 7,
            background: canSave ? T.accent : T.border, color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}>{saving ? '送信中…' : '送信'}</button>
        </div>
      </div>
    </div>
  )
}

function inputSt(T) {
  return {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13,
    background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
    color: T.text, fontFamily: 'inherit', outline: 'none',
  }
}

// ダッシュボードの Box 用 (export)
export { ComposeModal }

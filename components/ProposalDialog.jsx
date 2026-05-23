'use client'
// カレンダー予定の作成/更新/削除を承認するダイアログ。
// カレンダーAI と MyCOO の両方から利用される共有コンポーネント。
import { useState } from 'react'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { btnSecondary, btnBrand, btnDanger } from '../lib/iosStyles'

function jstHHMM(iso) {
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
}

function shortDate(iso) {
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const dow = ['日', '月', '火', '水', '木', '金', '土'][jst.getUTCDay()]
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${dow})`
}

// RRULE を人間語に (代表的なパターンのみ)
function formatRecurrence(rrules, startIso) {
  if (!rrules || rrules.length === 0) return ''
  const rule = rrules[0].replace(/^RRULE:/, '')
  const params = Object.fromEntries(
    rule.split(';').map(p => {
      const [k, v] = p.split('=')
      return [k, v]
    })
  )
  const freq = params.FREQ
  const count = params.COUNT
  const until = params.UNTIL
  const byday = params.BYDAY  // MO,TU,WE,TH,FR,SA,SU (-1TH = 最終木曜)
  const dayMap = { MO: '月', TU: '火', WE: '水', TH: '木', FR: '金', SA: '土', SU: '日' }
  const startTime = startIso ? jstHHMM(startIso) : ''
  let txt = ''
  if (freq === 'DAILY') txt = `毎日 ${startTime}`
  else if (freq === 'WEEKLY') {
    const days = (byday || '').split(',').map(d => {
      const m = d.match(/^(-?\d+)?([A-Z]{2})$/)
      if (!m) return d
      const prefix = m[1] === '-1' ? '最終' : (m[1] || '')
      return `${prefix}${dayMap[m[2]] || m[2]}曜`
    }).join('・')
    txt = `毎週 ${days || ''} ${startTime}`.trim()
  }
  else if (freq === 'MONTHLY') {
    const days = (byday || '').split(',').map(d => {
      const m = d.match(/^(-?\d+)?([A-Z]{2})$/)
      if (!m) return d
      const prefix = m[1] === '-1' ? '最終' : (m[1] ? `第${m[1]}` : '')
      return `${prefix}${dayMap[m[2]] || m[2]}曜`
    }).join('・')
    txt = `毎月 ${days || ''} ${startTime}`.trim()
  }
  else txt = rule
  if (count) txt += ` × ${count}回`
  else if (until) txt += ` (〜${until.slice(0, 8)})`
  return txt
}

function Row({ T, k, v }) {
  return (
    <div style={{ display: 'flex', gap: SPACING.sm + 2, marginBottom: 6 }}>
      <div style={{ width: 70, color: T.textMuted, ...TYPO.footnote, fontWeight: 600, flexShrink: 0 }}>{k}</div>
      <div style={{ flex: 1, color: T.text, wordBreak: 'break-word' }}>{v}</div>
    </div>
  )
}

// 1 件分の提案の中身を描画 (複数提案時はインデックスヘッダ付き)
function ProposalBody({ T, proposal, index, total }) {
  const { type, plan } = proposal
  const recurrenceText = formatRecurrence(plan.recurrence, plan.start_iso)
  const isMulti = total > 1
  const verb = type === 'create' ? '作成' : type === 'update' ? '更新' : '削除'
  return (
    <div style={{
      marginBottom: isMulti && index < total - 1 ? SPACING.lg - 2 : 0,
      paddingBottom: isMulti && index < total - 1 ? SPACING.lg - 2 : 0,
      borderBottom: isMulti && index < total - 1 ? `1px dashed ${T.border}` : 'none',
    }}>
      {isMulti && (
        <div style={{
          ...TYPO.footnote, fontWeight: 700, color: T.accent, marginBottom: 6,
        }}>予定 {index + 1} / {total} ({verb})</div>
      )}
      {type === 'create' && (
        <>
          <Row T={T} k="件名" v={plan.summary} />
          <Row T={T} k="日時" v={`${jstHHMM(plan.start_iso)} – ${jstHHMM(plan.end_iso)} (${shortDate(plan.start_iso)})`} />
          {recurrenceText && <Row T={T} k="繰り返し" v={recurrenceText} />}
          <Row T={T} k="招待"
               v={(plan.attendee_names || []).length === 0 ? '(なし)' :
                  (plan.attendee_names || []).map(n =>
                    plan.unresolved_names?.includes(n) ? `${n} (⚠ メール未解決)` : n
                  ).join(', ')} />
          {plan.attendee_emails && plan.attendee_emails.length > 0 && (
            <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted, marginLeft: 80 }}>
              → {plan.attendee_emails.join(', ')}
            </div>
          )}
          <Row T={T} k="Meet" v={plan.add_meet
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.success }}><Icon name="check" size={13} /> Google Meet リンクを発行</span>
            : '—'} />
          {plan.description && <Row T={T} k="説明" v={plan.description} />}
          {!isMulti && (
            <div style={{
              marginTop: SPACING.sm + 2, padding: SPACING.sm, background: T.warnBg, color: T.warn,
              ...TYPO.footnote, fontWeight: 600, borderRadius: RADIUS.xs,
              display: 'flex', alignItems: 'flex-start', gap: 4,
            }}>
              <Icon name="alert" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>承認すると招待メールが招待者に自動送信されます。件名は仮押さえとして「[仮]」が先頭に付きます。</span>
            </div>
          )}
        </>
      )}
      {type === 'update' && (
        <>
          <Row T={T} k="event_id" v={plan.event_id} />
          {plan.summary && <Row T={T} k="件名" v={plan.summary} />}
          {(plan.start_iso || plan.end_iso) && (
            <Row T={T} k="日時" v={`${plan.start_iso ? jstHHMM(plan.start_iso) : '?'} – ${plan.end_iso ? jstHHMM(plan.end_iso) : '?'}`} />
          )}
          {recurrenceText && <Row T={T} k="繰り返し" v={recurrenceText} />}
          {plan.attendee_names && <Row T={T} k="招待" v={plan.attendee_names.join(', ')} />}
          {plan.description && <Row T={T} k="説明" v={plan.description} />}
        </>
      )}
      {type === 'delete' && (
        <Row T={T} k="event_id" v={plan.event_id} />
      )}
      {/* 複数提案時はまとめ警告を末尾に 1 回だけ表示 */}
      {isMulti && index === total - 1 && (
        <div style={{
          marginTop: SPACING.sm + 2, padding: SPACING.sm,
          background: proposal.type === 'delete' ? T.dangerBg : T.warnBg,
          color: proposal.type === 'delete' ? T.danger : T.warn,
          ...TYPO.footnote, fontWeight: 600, borderRadius: RADIUS.xs,
          display: 'flex', alignItems: 'flex-start', gap: 4,
        }}>
          <Icon name="alert" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>承認すると {total} 件すべてが順次実行され、招待メール/通知が自動送信されます。仮押さえ予定の件名先頭には「[仮]」が付きます。</span>
        </div>
      )}
    </div>
  )
}

// 確認ダイアログ (作成/更新/削除、複数提案を一括承認可)
export default function ProposalDialog({ T, proposals, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const handle = async () => {
    setBusy(true)
    try { await onConfirm() } finally { setBusy(false) }
  }
  const n = proposals.length
  const hasDelete = proposals.some(p => p.type === 'delete')
  const allSameType = proposals.every(p => p.type === proposals[0].type)
  const verb = !allSameType ? '変更' : proposals[0].type === 'create' ? '作成'
             : proposals[0].type === 'update' ? '更新' : '削除'
  const title = n === 1 ? `予定の${verb}を承認しますか？` : `${n} 件の予定の${verb}を承認しますか？`
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: T.bgCard, borderRadius: RADIUS.lg, width: 'min(560px, 92vw)',
        border: `1px solid ${T.border}`, boxShadow: SHADOWS.xl,
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
      }}>
        <div style={{
          padding: `${SPACING.md + 2}px ${SPACING.lg + 2}px`, borderBottom: `1px solid ${T.border}`,
          ...TYPO.headline, color: T.text,
        }}>{title}</div>
        <div style={{ padding: SPACING.lg + 2, overflowY: 'auto', ...TYPO.subhead, fontWeight: 500, color: T.text, lineHeight: 1.7 }}>
          {proposals.map((p, idx) => (
            <ProposalBody key={idx} T={T} proposal={p} index={idx} total={n} />
          ))}
        </div>
        <div style={{
          padding: SPACING.md, borderTop: `1px solid ${T.border}`,
          display: 'flex', gap: SPACING.sm, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} disabled={busy} style={btnSecondary({ T, size: 'md' })}>キャンセル</button>
          <button onClick={handle} disabled={busy} style={{
            ...(hasDelete ? btnDanger({ T, size: 'md' }) : btnBrand({ size: 'md' })),
            cursor: busy ? 'wait' : 'pointer',
          }}>{busy ? '実行中…' : (n === 1 ? '承認して実行' : `${n} 件まとめて承認`)}</button>
        </div>
      </div>
    </div>
  )
}

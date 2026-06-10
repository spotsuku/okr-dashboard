'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import MeetingEditModal from './MeetingEditModal'
import Icon, { DataIcon } from './Icon'
import { TYPO, SPACING, RADIUS } from '../lib/themeTokens'

// ─────────────────────────────────────────────────────────────
// 組織設定 → 会議設定セクション
//
// organization_meetings の一覧を表示し、各会議の「対象範囲 / フォーカス」を要約表示。
// 追加 / 編集 / 削除 (アーカイブ) が可能 (owner/admin)。
// 会議の進行は週次MTG画面の WeeklyMTGFacilitation (旧ファシリUI) で行う。
// ─────────────────────────────────────────────────────────────

// target_filter から対象範囲ラベルを生成
function scopeLabel(tf) {
  if (!tf) return '全社'
  switch (tf.scope) {
    case 'specific-team':   return `${tf.teamName || 'チーム'}（特定チーム）`
    case 'custom':          return `${(tf.levelNames || []).join(' / ') || '選択チーム/部署'}`
    case 'teams-of':        return `${tf.parentLevelName || '部署'} 配下のチーム`
    case 'all-teams':       return '全チーム合同'
    case 'all-departments': return '全部署合同'
    case 'all-levels':      return '全社・全階層'
    default:                return '全社'
  }
}

// target_filter.flow からフォーカスラベルを生成
function flowLabel(tf) {
  if (tf?.withDiscussion) return 'マネージャー'
  switch (tf?.flow) {
    case 'ka':    return 'KA重点'
    case 'sales': return '営業フォーカス'
    case 'kr':    return 'KR重点'
    default:      return 'KR重点'
  }
}

export default function OrgMeetingsSection({ T, orgId, canManage }) {
  const [meetings, setMeetings]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState(null)
  const [editMeeting, setEditMeeting]       = useState(null)  // { meeting } or { meeting: null } for new

  // 会議一覧を取得 (= 再読込可)
  const reloadMeetings = useCallback(async () => {
    if (!orgId) return
    const { data, error } = await supabase.from('organization_meetings')
      .select('id, key, title, icon, color, modules, target_filter, day_of_week, sort_order')
      .eq('organization_id', orgId)
      .is('archived_at', null)
      .order('sort_order')
    if (error) setErr(error.message)
    setMeetings(data || [])
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    let alive = true
    setLoading(true)
    supabase.from('organization_meetings')
      .select('id, key, title, icon, color, modules, target_filter, day_of_week, sort_order')
      .eq('organization_id', orgId)
      .is('archived_at', null)
      .order('sort_order')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) setErr(error.message)
        setMeetings(data || [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [orgId])

  // 会議削除 (archived_at をセット = ソフトデリート)
  const handleDelete = async (meeting) => {
    if (!window.confirm(`「${meeting.title}」をアーカイブしますか?\n(進行中の会議セッションには影響しません)`)) return
    const { error } = await supabase.from('organization_meetings')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', meeting.id)
    if (error) { alert('削除失敗: ' + error.message); return }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('org-meetings-updated'))
    }
    reloadMeetings()
  }

  if (!orgId) return null

  const sectionStyle = {
    padding: SPACING.lg - 2,
    marginBottom: SPACING.md,
    background: T.sectionBg,
    border: `1px solid ${T.border}`,
    borderRadius: RADIUS.md,
  }

  return (
    <>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm + 2 }}>
          <Icon name="calendar" size={16} style={{ color: T.text }} />
          <span style={{ ...TYPO.callout, color: T.text }}>会議設定</span>
        </div>
        <div style={{ ...TYPO.footnote, color: T.textMuted, marginBottom: SPACING.sm + 2 }}>
          組織の会議体一覧。各会議は「対象範囲」と「フォーカス」で構成され、進行ステップは自動生成されます。
          {!canManage && '（編集には owner/admin 権限が必要）'}
        </div>

        {/* 新規追加ボタン */}
        {canManage && (
          <div style={{ marginBottom: SPACING.sm + 2 }}>
            <button onClick={() => setEditMeeting({ meeting: null })} style={{
              padding: '6px 14px', borderRadius: RADIUS.sm,
              border: `1px dashed ${T.accent}`,
              background: T.accentBg, color: T.accent,
              ...TYPO.subhead, cursor: 'pointer', fontFamily: 'inherit',
            }}>+ 新規会議を追加</button>
          </div>
        )}

        {loading && <div style={{ ...TYPO.footnote, color: T.textMuted }}>読み込み中…</div>}
        {err && <div style={{ ...TYPO.footnote, color: T.danger }}>エラー: {err}</div>}
        {!loading && meetings.length === 0 && (
          <div style={{ ...TYPO.footnote, color: T.textFaint, padding: SPACING.sm + 2, textAlign: 'center' }}>
            会議が登録されていません。「+ 新規会議を追加」から作成してください。
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xs + 2 }}>
          {meetings.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: SPACING.sm + 2,
              padding: '8px 12px',
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: RADIUS.sm,
                background: `${m.color || T.accent}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}><DataIcon value={m.icon} size={14} fallback="note" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYPO.callout, color: T.text }}>{m.title}</div>
                <div style={{ ...TYPO.caption, fontWeight: 600, letterSpacing: 'normal', color: T.textMuted, display: 'flex', gap: SPACING.xs, flexWrap: 'wrap', marginTop: 2 }}>
                  <span style={{ padding: '1px 6px', background: T.sectionBg, borderRadius: RADIUS.xs - 2 }}>
                    <Icon name="user" size={11} /> {scopeLabel(m.target_filter)}
                  </span>
                  <span style={{ padding: '1px 6px', background: T.sectionBg, borderRadius: RADIUS.xs - 2 }}>
                    {flowLabel(m.target_filter)}
                  </span>
                </div>
              </div>
              {canManage && (
                <>
                  <button onClick={() => setEditMeeting({ meeting: m })} title="編集" style={{
                    padding: '4px 10px', borderRadius: RADIUS.xs,
                    border: `1px solid ${T.border}`,
                    background: T.bgCard, color: T.text,
                    ...TYPO.footnote, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center',
                  }}><Icon name="pencil" size={13} /></button>
                  <button onClick={() => handleDelete(m)} title="アーカイブ" style={{
                    padding: '4px 10px', borderRadius: RADIUS.xs,
                    border: `1px solid ${T.border}`,
                    background: T.bgCard, color: T.danger,
                    ...TYPO.footnote, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center',
                  }}><Icon name="trash" size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 編集 / 新規追加モーダル */}
      {editMeeting && (
        <MeetingEditModal
          T={T}
          orgId={orgId}
          meeting={editMeeting.meeting}
          onClose={() => setEditMeeting(null)}
          onSaved={() => { reloadMeetings(); setEditMeeting(null) }}
        />
      )}
    </>
  )
}

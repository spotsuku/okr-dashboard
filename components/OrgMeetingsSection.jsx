'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { MODULE_META } from '../lib/meetings/moduleRegistry'
import MeetingShell from './meetings/MeetingShell'
import MeetingEditModal from './MeetingEditModal'

// ─────────────────────────────────────────────────────────────
// 組織設定 → 会議設定セクション (Phase 5e)
//
// organization_meetings の一覧を表示し、各会議のモジュール構成をプレビュー。
// 「プレビュー」ボタンで MeetingShell をフルスクリーンモーダルで起動。
//
// 編集 / 追加 / 削除 / drag&drop 並び替えは Phase 5e の本格実装で
// (現状は read-only + プレビューのみ)。
// ─────────────────────────────────────────────────────────────

export default function OrgMeetingsSection({ T, orgId, canManage }) {
  const [meetings, setMeetings]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [err, setErr]             = useState(null)
  const [previewMeeting, setPreviewMeeting] = useState(null)
  const [editMeeting, setEditMeeting]       = useState(null)  // { meeting } or { meeting: null } for new
  const [members, setMembers]     = useState([])
  const [levels, setLevels]       = useState([])

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

  // 初回ロード: 会議一覧 + members + levels
  useEffect(() => {
    if (!orgId) return
    let alive = true
    setLoading(true)

    Promise.all([
      supabase.from('organization_meetings')
        .select('id, key, title, icon, color, modules, target_filter, day_of_week, sort_order')
        .eq('organization_id', orgId)
        .is('archived_at', null)
        .order('sort_order'),
      supabase.from('members')
        .select('id, name, email, level_id')
        .eq('organization_id', orgId),
      supabase.from('levels')
        .select('id, name, parent_id, icon')
        .eq('organization_id', orgId),
    ]).then(([mtgRes, memRes, lvlRes]) => {
      if (!alive) return
      if (mtgRes.error) setErr(mtgRes.error.message)
      setMeetings(mtgRes.data || [])
      setMembers(memRes.data || [])
      setLevels(lvlRes.data || [])
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
    reloadMeetings()
  }

  if (!orgId) return null

  const sectionStyle = {
    padding: 14,
    marginBottom: 12,
    background: T.sectionBg,
    border: `1px solid ${T.border}`,
    borderRadius: 10,
  }

  return (
    <>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🗓️</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>会議設定</span>
          <span style={{ fontSize: 10, color: T.textMuted, padding: '1px 6px', background: T.bgCard, borderRadius: 99 }}>
            Phase 5e (プレビュー)
          </span>
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
          組織の会議体一覧。各会議は「個人報告 / KA確認 / KR確認 / 共有事項 / 確認事項 / ネクストアクション」のモジュールを組み合わせて構成されます。
          {!canManage && '（編集には owner/admin 権限が必要）'}
        </div>

        {/* 新規追加ボタン */}
        {canManage && (
          <div style={{ marginBottom: 10 }}>
            <button onClick={() => setEditMeeting({ meeting: null })} style={{
              padding: '6px 14px', borderRadius: 7,
              border: `1px dashed ${T.accent}`,
              background: `${T.accent}10`, color: T.accent,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>+ 新規会議を追加</button>
          </div>
        )}

        {loading && <div style={{ fontSize: 11, color: T.textMuted }}>読み込み中…</div>}
        {err && <div style={{ fontSize: 11, color: T.danger }}>エラー: {err}</div>}
        {!loading && meetings.length === 0 && (
          <div style={{ fontSize: 11, color: T.textFaint, padding: 10, textAlign: 'center' }}>
            会議が登録されていません。supabase_organization_meetings.sql を実行してください。
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {meetings.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: `${m.color || T.accent}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>{m.icon || '📋'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{m.title}</div>
                <div style={{ fontSize: 10, color: T.textMuted, display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                  {(m.modules || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((mod, i) => {
                    const meta = MODULE_META[mod.type] || { icon: '?', label: mod.type }
                    return (
                      <span key={i} style={{
                        padding: '1px 5px', background: T.sectionBg, borderRadius: 4,
                      }}>{meta.icon} {meta.label}</span>
                    )
                  })}
                </div>
              </div>
              <button onClick={() => setPreviewMeeting(m)} title="プレビュー" style={{
                padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: T.bgCard, color: T.text,
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}>👁</button>
              {canManage && (
                <>
                  <button onClick={() => setEditMeeting({ meeting: m })} title="編集" style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: `1px solid ${T.border}`,
                    background: T.bgCard, color: T.text,
                    fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  }}>✏️</button>
                  <button onClick={() => handleDelete(m)} title="アーカイブ" style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: `1px solid ${T.border}`,
                    background: T.bgCard, color: T.danger,
                    fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  }}>🗑️</button>
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

      {/* MeetingShell プレビューモーダル */}
      {previewMeeting && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewMeeting(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div style={{
            width: '90vw', maxWidth: 1200,
            height: '90vh',
            background: T.bg,
            borderRadius: 16,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <MeetingShell
              meeting={previewMeeting}
              weekStart={getThisMonday()}
              T={T}
              members={members}
              levels={levels}
              onExit={() => setPreviewMeeting(null)}
            />
          </div>
        </div>
      )}
    </>
  )
}

// JST 基準で今週月曜の YYYY-MM-DD を返す
function getThisMonday() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 3600 * 1000)
  const day = jst.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + diff))
  return mon.toISOString().split('T')[0]
}

'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { mgmtSupabase, isMgmtConfigured } from '../lib/mgmtSupabase'

// ─── 工数管理タブ (経営ダッシュボード neo-mg と双方向リアルタイム同期) ───
//
// 仕様: docs/workforce-sync-spec.md (neo_mg リポジトリ)
// テーブル: workforce_versions
// 同期対象: version_id=0 (autosave / 下書き行)
//
// 役割は固定6: 営業 / 運営 / CS / 企画 / 総務 / PR
// 事業 (BIZ) は動的: snapshot.businesses 配列に従う

const ROLES = ['営業', '運営', 'CS', '企画', '総務', 'PR']

const ROLE_COLORS = {
  '営業': '#FF3B30',
  '運営': '#007AFF',
  'CS':   '#34C759',
  '企画': '#FF9500',
  '総務': '#5856D6',
  'PR':   '#FF2D92',
}

const SAVE_DEBOUNCE_MS = 1500
const ECHO_GUARD_MS    = 3000

function normalizeRole(r) {
  // 旧データの「納品」ロールを「運営」に変換
  return r === '納品' ? '運営' : r
}

function emptyAlloc() {
  const o = {}
  for (const r of ROLES) o[r] = 0
  return o
}

function ensureMember(m) {
  // members[].allocMatrix が無い・キーが欠けている場合の補完
  return {
    ...m,
    ability: m.ability ?? 1.0,
    allocMatrix: m.allocMatrix || {},
  }
}

// 計算ヘルパ
function memberAllocFTE(m, biz, role) {
  const v = m.allocMatrix?.[biz]?.[role] || 0
  return (v / 100) * (m.ability || 1.0)
}
function investedFTE(members, biz, role) {
  return members.reduce((s, m) => s + memberAllocFTE(m, biz, role), 0)
}

export default function WorkforceTab({ T }) {
  const [view, setView] = useState('visual')  // 'numeric' | 'visual'
  const [snapshot, setSnapshot] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const lastSavedSelfAt = useRef(0)  // echo 防止用 (自分の保存タイムスタンプ)
  const saveTimer = useRef(null)
  const pendingRef = useRef(null)    // 最新スナップショット (debounce 中の保存対象)

  // ─── 初期読込 + リアルタイム購読 ───
  useEffect(() => {
    if (!isMgmtConfigured) {
      setLoading(false)
      setError('環境変数 NEXT_PUBLIC_MGMT_SUPABASE_URL / NEXT_PUBLIC_MGMT_SUPABASE_ANON_KEY が未設定です。Vercel の環境変数に neo-mg の Supabase URL と anon key を設定してください。')
      return
    }
    let cancelled = false

    ;(async () => {
      try {
        // 下書き (version_id=0) を優先、無ければ採用中
        let { data, error: e } = await mgmtSupabase
          .from('workforce_versions')
          .select('snapshot, saved_at, version_id, is_current, name')
          .eq('version_id', 0)
          .maybeSingle()
        if (e) throw new Error(e.message)
        if (!data) {
          const cur = await mgmtSupabase
            .from('workforce_versions')
            .select('snapshot, saved_at, version_id, is_current, name')
            .eq('is_current', true)
            .maybeSingle()
          if (cur.error) throw new Error(cur.error.message)
          data = cur.data
        }
        if (cancelled) return
        if (!data) {
          setError('経営ダッシュボードに保存データがありません')
        } else {
          setSnapshot(data.snapshot || null)
          setSavedAt(data.saved_at || null)
        }
      } catch (e) {
        if (!cancelled) setError(`読込失敗: ${e.message || e}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    // リアルタイム購読
    const channel = mgmtSupabase
      .channel('okrdash_workforce_sync')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'workforce_versions',
        filter: 'version_id=eq.0',
      }, (payload) => {
        const row = payload.new
        if (!row || !row.snapshot) return
        // echo 防止: 直前に自分が保存したなら反映スキップ
        const incomingTs = new Date(row.saved_at || row.updated_at || 0).getTime()
        if (Math.abs(incomingTs - lastSavedSelfAt.current) < ECHO_GUARD_MS) return
        setSnapshot(row.snapshot)
        setSavedAt(row.saved_at || row.updated_at || null)
      })
      .subscribe()

    return () => {
      cancelled = true
      try { mgmtSupabase.removeChannel(channel) } catch { /* noop */ }
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // ─── 保存 (debounced) ───
  const scheduleSave = useCallback((nextSnap) => {
    pendingRef.current = nextSnap
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const snap = pendingRef.current
      if (!snap) return
      setSaving(true)
      try {
        const { data, error: e } = await mgmtSupabase
          .from('workforce_versions')
          .update({ snapshot: snap, saved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('version_id', 0)
          .select('saved_at')
          .single()
        if (e) throw new Error(e.message)
        const ts = new Date(data?.saved_at || Date.now()).getTime()
        lastSavedSelfAt.current = ts
        setSavedAt(data?.saved_at || new Date().toISOString())
        setError('')
      } catch (e) {
        setError(`保存失敗: ${e.message || e}`)
      } finally {
        setSaving(false)
      }
    }, SAVE_DEBOUNCE_MS)
  }, [])

  // セル編集 (member × biz × role の % を更新)
  const updateCell = useCallback((memberName, biz, role, value) => {
    const num = Math.max(0, Math.min(100, Number(value) || 0))
    setSnapshot(prev => {
      if (!prev) return prev
      const members = (prev.members || []).map(m => {
        if (m.name !== memberName) return m
        const matrix = { ...(m.allocMatrix || {}) }
        const bizCell = { ...(matrix[biz] || {}) }
        bizCell[role] = num
        matrix[biz] = bizCell
        return { ...m, allocMatrix: matrix }
      })
      const next = { ...prev, members }
      scheduleSave(next)
      return next
    })
  }, [scheduleSave])

  // 必要月工数 (requiredFTE) の編集
  const updateRequired = useCallback((biz, role, value) => {
    const num = Math.max(0, Number(value) || 0)
    setSnapshot(prev => {
      if (!prev) return prev
      const requiredFTE = { ...(prev.requiredFTE || {}) }
      requiredFTE[biz] = { ...(requiredFTE[biz] || {}) }
      requiredFTE[biz][role] = num
      const next = { ...prev, requiredFTE }
      scheduleSave(next)
      return next
    })
  }, [scheduleSave])

  // ─── レンダリング ───
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>経営ダッシュボードから読み込み中...</div>
  }

  if (error && !snapshot) {
    return (
      <div style={{
        padding: 20, background: T.dangerBg, border: `1px solid ${T.danger}40`,
        borderRadius: 10, color: T.danger, fontSize: 13, lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠️ 連携エラー</div>
        {error}
      </div>
    )
  }

  if (!snapshot) {
    return <div style={{ padding: 20, color: T.textMuted, fontSize: 13 }}>データなし</div>
  }

  const members = (snapshot.members || []).map(ensureMember)
  const businesses = snapshot.businesses || []
  const requiredFTE = snapshot.requiredFTE || {}

  return (
    <div>
      {/* ─── ヘッダー: ビュー切替 + 同期状態 ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex', background: T.sectionBg, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: 3,
        }}>
          {[
            { id: 'visual',  label: '👥 担当可視化' },
            { id: 'numeric', label: '📝 数値記入' },
          ].map(t => {
            const a = view === t.id
            return (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                padding: '7px 16px', borderRadius: 6, border: 'none',
                background: a ? T.accent : 'transparent',
                color: a ? '#fff' : T.textSub,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}>{t.label}</button>
            )
          })}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: saving ? T.warn : T.success,
          }} />
          {saving ? '保存中…' : (savedAt ? `経営ダッシュボード同期済 (${new Date(savedAt).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })})` : '同期待機中')}
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 12, padding: 10, background: T.dangerBg, border: `1px solid ${T.danger}40`,
          borderRadius: 8, color: T.danger, fontSize: 11,
        }}>⚠️ {error}</div>
      )}

      {/* ─── 役割色凡例 ─── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, fontSize: 11, color: T.textMuted, flexWrap: 'wrap' }}>
        <span>役割色:</span>
        {ROLES.map(r => (
          <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: ROLE_COLORS[r] }} />
            <span>{r}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>単位: 人月 (1.0=フルタイム1人月)</span>
      </div>

      {view === 'numeric' ? (
        <NumericView T={T} members={members} businesses={businesses} requiredFTE={requiredFTE}
          updateCell={updateCell} updateRequired={updateRequired} />
      ) : (
        <VisualView T={T} members={members} businesses={businesses} requiredFTE={requiredFTE} />
      )}
    </div>
  )
}

// ─── 数値記入ビュー ─────────────────────────────────────
function NumericView({ T, members, businesses, requiredFTE, updateCell, updateRequired }) {
  // 列: メンバー (sticky) + (biz × role) で合計 businesses.length * 6 列

  const cellW = 56
  const memberColW = 130

  const totalFTE = (biz, role) => investedFTE(members, biz, role)

  return (
    <div style={{
      border: `1px solid ${T.border}`, borderRadius: 10,
      background: T.bgCard, overflow: 'auto', maxHeight: '70vh',
    }}>
      <table style={{
        borderCollapse: 'separate', borderSpacing: 0,
        fontSize: 11, color: T.text, width: 'max-content',
      }}>
        <thead>
          {/* 事業名行 */}
          <tr>
            <th style={{ ...thSticky(T, memberColW), zIndex: 5, background: T.bgCard2, fontWeight: 800 }}>メンバー</th>
            {businesses.map(biz => (
              <th key={biz} colSpan={ROLES.length} style={{
                ...thHead(T), background: T.sectionBg, fontWeight: 800,
                borderLeft: `2px solid ${T.borderMid}`, padding: '8px 6px',
              }}>{biz}</th>
            ))}
          </tr>
          {/* 役割行 */}
          <tr>
            <th style={{ ...thSticky(T, memberColW), top: 30, zIndex: 5, background: T.bgCard2 }} />
            {businesses.map(biz => ROLES.map((role, ri) => (
              <th key={`${biz}-${role}`} style={{
                ...thHead(T), top: 30, width: cellW, minWidth: cellW,
                background: ROLE_COLORS[role], color: '#fff', fontWeight: 700,
                borderLeft: ri === 0 ? `2px solid ${T.borderMid}` : `1px solid ${T.border}`,
              }}>{role}</th>
            )))}
          </tr>
          {/* 必要月工数 */}
          <tr>
            <th style={{ ...thSticky(T, memberColW), top: 60, zIndex: 5, background: T.bgCard2, fontSize: 10, fontWeight: 700, color: T.textSub, textAlign: 'right', padding: '4px 8px' }}>必要月工数 →</th>
            {businesses.map(biz => ROLES.map((role, ri) => {
              const v = requiredFTE?.[biz]?.[role] ?? 0
              return (
                <td key={`req-${biz}-${role}`} style={{
                  ...tdCell(T), top: 60, position: 'sticky',
                  borderLeft: ri === 0 ? `2px solid ${T.borderMid}` : `1px solid ${T.border}`,
                  background: T.bgCard2, padding: 0,
                }}>
                  <input type="number" min={0} step={0.5} value={v}
                    onChange={e => updateRequired(biz, role, e.target.value)}
                    style={inputCellSt(T)} />
                </td>
              )
            }))}
          </tr>
          {/* 投入月工数 */}
          <tr>
            <th style={{ ...thSticky(T, memberColW), top: 88, zIndex: 5, background: T.bgCard2, fontSize: 10, fontWeight: 700, color: T.textSub, textAlign: 'right', padding: '4px 8px' }}>投入月工数 →</th>
            {businesses.map(biz => ROLES.map((role, ri) => {
              const v = totalFTE(biz, role)
              return (
                <td key={`inv-${biz}-${role}`} style={{
                  ...tdCell(T), top: 88, position: 'sticky',
                  borderLeft: ri === 0 ? `2px solid ${T.borderMid}` : `1px solid ${T.border}`,
                  background: T.bgCard2, fontWeight: 700, color: T.textSub,
                }}>{v.toFixed(2)}</td>
              )
            }))}
          </tr>
          {/* 充足度 */}
          <tr>
            <th style={{ ...thSticky(T, memberColW), top: 116, zIndex: 5, background: T.bgCard2, fontSize: 10, fontWeight: 700, color: T.textSub, textAlign: 'right', padding: '4px 8px' }}>充足度 →</th>
            {businesses.map(biz => ROLES.map((role, ri) => {
              const req = requiredFTE?.[biz]?.[role]
              const inv = totalFTE(biz, role)
              const ratio = req ? inv / req : null
              const color = ratio == null ? T.textFaint
                : ratio >= 1 ? T.success
                : ratio >= 0.7 ? T.warn
                : T.danger
              return (
                <td key={`ful-${biz}-${role}`} style={{
                  ...tdCell(T), top: 116, position: 'sticky',
                  borderLeft: ri === 0 ? `2px solid ${T.borderMid}` : `1px solid ${T.border}`,
                  background: T.bgCard2, fontWeight: 800, color,
                }}>{ratio == null ? '—' : `${Math.round(ratio * 100)}%`}</td>
              )
            }))}
          </tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.name}>
              <td style={{ ...tdSticky(T, memberColW), background: T.bgCard, fontWeight: 700, padding: '6px 10px', textAlign: 'left' }}>{m.name}</td>
              {businesses.map(biz => ROLES.map((role, ri) => {
                const v = m.allocMatrix?.[biz]?.[role] ?? 0
                return (
                  <td key={`${m.name}-${biz}-${role}`} style={{
                    ...tdCell(T),
                    borderLeft: ri === 0 ? `2px solid ${T.borderMid}` : `1px solid ${T.border}`,
                    background: v > 0 ? `${ROLE_COLORS[role]}18` : T.bgCard,
                    padding: 0,
                  }}>
                    <input type="number" min={0} max={100} step={5} value={v}
                      onChange={e => updateCell(m.name, biz, role, e.target.value)}
                      style={inputCellSt(T, v > 0)} />
                  </td>
                )
              }))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── 担当可視化ビュー (横スクロール・配分%でアイコンサイズ可変) ──────
function VisualView({ T, members, businesses, requiredFTE }) {
  // メンバー名の頭1文字でアバター表示。配分%に応じて 36〜76px に変化。
  const iconSizeFor = (sum) => {
    const clamped = Math.max(0, Math.min(100, sum))
    return Math.round(36 + (clamped / 100) * 40)  // 36 → 76
  }

  const COLUMN_W = 290  // 1事業あたりの列幅

  return (
    <div style={{
      display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden',
      paddingBottom: 8, scrollSnapType: 'x proximity',
    }}>
      {businesses.map(biz => {
        const roleTotalsRaw = ROLES.map(role => ({
          role, inv: investedFTE(members, biz, role), req: requiredFTE?.[biz]?.[role] ?? 0,
        }))
        const totalReq = roleTotalsRaw.reduce((s, r) => s + r.req, 0)
        const totalInv = roleTotalsRaw.reduce((s, r) => s + r.inv, 0)
        const overall = totalReq > 0 ? totalInv / totalReq : null

        // この事業に1%以上配分されているメンバー (配分大きい順)
        const memberRows = members.map(m => {
          const cells = ROLES.map(role => ({ role, pct: m.allocMatrix?.[biz]?.[role] || 0 }))
            .filter(c => c.pct > 0)
          const sum = cells.reduce((s, c) => s + c.pct, 0)
          // 主役割 = 最大%のロール (アイコン背景色)
          const primary = cells.slice().sort((a, b) => b.pct - a.pct)[0]?.role || ROLES[0]
          return { name: m.name, cells, sum, primary }
        }).filter(r => r.sum > 0)
          .sort((a, b) => b.sum - a.sum)

        const overallColor = overall == null ? T.textMuted
          : overall >= 1 ? T.success
          : overall >= 0.7 ? T.warn
          : T.danger

        return (
          <div key={biz} style={{
            flex: '0 0 auto', width: COLUMN_W, scrollSnapAlign: 'start',
            border: `1px solid ${T.border}`, borderRadius: 12,
            background: T.bgCard, padding: 14, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{biz}</div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 12, fontWeight: 800, color: overallColor }}>
                {overall == null ? '—' : `${Math.round(overall * 100)}%`}
              </div>
              <div style={{ fontSize: 10, color: T.textMuted }}>
                ({totalInv.toFixed(1)}/{totalReq.toFixed(1)})
              </div>
            </div>

            {memberRows.length === 0 ? (
              <div style={{ fontSize: 11, color: T.textMuted, padding: '8px 0' }}>担当未設定</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {memberRows.map(r => {
                  const size = iconSizeFor(r.sum)
                  return (
                    <div key={r.name} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 10,
                      background: T.sectionBg,
                    }}>
                      <div style={{
                        flexShrink: 0, width: size, height: size, borderRadius: '50%',
                        background: ROLE_COLORS[r.primary], color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: Math.max(11, Math.round(size * 0.34)), fontWeight: 800,
                        boxShadow: `0 2px 6px ${ROLE_COLORS[r.primary]}50`,
                      }}>{(r.name || '').charAt(0)}</div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 13, fontWeight: 700, color: T.text,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{r.name}</span>
                          <span style={{
                            flexShrink: 0,
                            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                            background: T.bgCard, color: T.textSub,
                          }}>合計 {r.sum}%</span>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {r.cells.map(c => (
                            <span key={c.role} style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                              background: ROLE_COLORS[c.role], color: '#fff',
                            }}>{c.role} {c.pct}%</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── スタイルヘルパ ─────────────────────────────────────
function thSticky(T, w) {
  return {
    position: 'sticky', left: 0, top: 0, zIndex: 4,
    width: w, minWidth: w,
    padding: '8px 10px', textAlign: 'center',
    borderBottom: `1px solid ${T.border}`, borderRight: `2px solid ${T.borderMid}`,
    fontSize: 11, color: T.text,
  }
}
function thHead(T) {
  return {
    position: 'sticky', top: 0, zIndex: 3,
    padding: '4px 0', textAlign: 'center',
    borderBottom: `1px solid ${T.border}`,
    fontSize: 10, color: T.text,
  }
}
function tdSticky(T, w) {
  return {
    position: 'sticky', left: 0, zIndex: 2,
    width: w, minWidth: w,
    padding: '6px 10px', borderRight: `2px solid ${T.borderMid}`,
    borderBottom: `1px solid ${T.border}`,
    fontSize: 12, color: T.text, textAlign: 'right',
  }
}
function tdCell(T) {
  return {
    width: 56, minWidth: 56, height: 28,
    padding: '0 4px', textAlign: 'center',
    borderBottom: `1px solid ${T.border}`,
    fontSize: 11, color: T.text,
  }
}
function inputCellSt(T, hasValue) {
  return {
    width: '100%', height: 28, border: 'none', outline: 'none',
    background: 'transparent', textAlign: 'center',
    fontSize: 11, fontFamily: 'inherit',
    color: hasValue ? T.text : T.textMuted, fontWeight: hasValue ? 700 : 400,
  }
}

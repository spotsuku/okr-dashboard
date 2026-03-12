'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function MemberPage() {
  const [members, setMembers] = useState([])
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { type: 'add' | 'edit', member? }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [{ data: lvls }, { data: mems }] = await Promise.all([
      supabase.from('levels').select('*').order('id'),
      supabase.from('members').select('*').order('id'),
    ])
    if (lvls) setLevels(lvls)
    if (mems) setMembers(mems)
    setLoading(false)
  }

  const handleSave = async (form) => {
    if (form.id) {
      await supabase.from('members').update({
        name: form.name, role: form.role, level_id: form.level_id, email: form.email,
      }).eq('id', form.id)
    } else {
      await supabase.from('members').insert([{
        name: form.name, role: form.role, level_id: form.level_id, email: form.email,
      }])
    }
    setModal(null)
    loadData()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('このメンバーを削除しますか？')) return
    await supabase.from('members').delete().eq('id', id)
    loadData()
  }

  const LAYER_COLORS = { 0: '#ff6b6b', 1: '#4d9fff', 2: '#00d68f' }
  const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }

  function getDepth(levelId) {
    let depth = 0
    let cur = levels.find(l => l.id === levelId)
    while (cur && cur.parent_id) { depth++; cur = levels.find(l => l.id === cur.parent_id) }
    return depth
  }

  const roots = levels.filter(l => !l.parent_id)
  const getChildren = id => levels.filter(l => Number(l.parent_id) === id)
  const getLevelMembers = id => members.filter(m => m.level_id === id)
  const getLayerColor = id => LAYER_COLORS[getDepth(id)] || '#a0a8be'

  function getInitial(name) {
    return name ? name.charAt(0) : '?'
  }

  function LevelSection({ levelId, depth = 0 }) {
    const level = levels.find(l => l.id === levelId)
    const children = getChildren(levelId)
    const mems = getLevelMembers(levelId)
    const color = getLayerColor(levelId)
    const label = LAYER_LABELS[depth] || ''
    if (!level) return null

    return (
      <div style={{ marginBottom: 28 }}>
        {/* セクションヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 14, fontWeight: 700, color }}>{level.name}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: `${color}18`, color, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 11, color: '#404660' }}>{mems.length}名</span>
        </div>

        {/* メンバーカード */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: children.length ? 24 : 0 }}>
          {mems.map(m => (
            <MemberCard key={m.id} member={m} color={color} initial={getInitial(m.name)}
              onEdit={() => setModal({ type: 'edit', member: m })}
              onDelete={() => handleDelete(m.id)} />
          ))}
          {/* 追加ボタン */}
          <div onClick={() => setModal({ type: 'add', levelId })} style={{
            width: 160, minHeight: 110, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 14,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, cursor: 'pointer', color: '#404660', transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 22 }}>＋</span>
            <span style={{ fontSize: 11 }}>メンバー追加</span>
          </div>
        </div>

        {/* 子レベル（インデント） */}
        {children.length > 0 && (
          <div style={{ marginLeft: 24, paddingLeft: 20, borderLeft: `2px solid ${color}25` }}>
            {children.map(c => <LevelSection key={c.id} levelId={c.id} depth={depth + 1} />)}
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div style={{ padding: 40, color: '#4d9fff', fontSize: 14 }}>読み込み中...</div>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>組織図</div>
        <div style={{ fontSize: 13, color: '#606880' }}>メンバーの所属・役割を一覧で確認できます</div>
      </div>

      {roots.map(r => <LevelSection key={r.id} levelId={r.id} depth={0} />)}

      {/* モーダル */}
      {modal && (
        <MemberModal
          initial={modal.member}
          levels={levels}
          defaultLevelId={modal.levelId}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function MemberCard({ member, color, initial, onEdit, onDelete }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 160, background: hover ? '#1a2438' : '#111828',
        border: `1px solid ${hover ? color + '50' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14, padding: '18px 16px', textAlign: 'center',
        borderTop: `3px solid ${color}`, transition: 'all 0.2s', cursor: 'default',
        boxShadow: hover ? `0 8px 24px ${color}15` : 'none', position: 'relative',
      }}
    >
      {/* 操作ボタン（ホバー時） */}
      {hover && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
          <button onClick={onEdit} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#a0a8be', width: 22, height: 22, borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
          <button onClick={onDelete} style={{ background: 'rgba(255,107,107,0.1)', border: 'none', color: '#ff6b6b', width: 22, height: 22, borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}
      {/* アバター */}
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${color}20`, border: `2px solid ${color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 18, fontWeight: 700, color }}>
        {initial}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#dde0ec', marginBottom: 4 }}>{member.name}</div>
      <div style={{ fontSize: 11, color, marginBottom: 4, fontWeight: 600 }}>{member.role}</div>
      {member.email && <div style={{ fontSize: 10, color: '#404660', wordBreak: 'break-all' }}>{member.email}</div>}
    </div>
  )
}

function MemberModal({ initial, levels, defaultLevelId, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '')
  const [role, setRole] = useState(initial?.role || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [levelId, setLevelId] = useState(String(initial?.level_id || defaultLevelId || ''))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim() || !levelId) return
    setSaving(true)
    await onSave({ id: initial?.id, name, role, email, level_id: parseInt(levelId) })
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#141926', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 26, width: '100%', maxWidth: 440, boxShadow: '0 28px 80px rgba(0,0,0,0.65)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{initial ? 'メンバーを編集' : 'メンバーを追加'}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#a0a8be', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {[
          { label: '名前', val: name, set: setName, ph: '例: 田中 花子' },
          { label: '役職', val: role, set: setRole, ph: '例: 事業部長' },
          { label: 'メールアドレス', val: email, set: setEmail, ph: '例: tanaka@example.com' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 13 }}>
            <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>{f.label}</div>
            <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#e8eaf0', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#606880', marginBottom: 5 }}>所属</div>
          <select value={levelId} onChange={e => setLevelId(e.target.value)}
            style={{ width: '100%', background: '#1a2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#e8eaf0', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', cursor: 'pointer' }}>
            <option value="">選択してください</option>
            {levels.map(l => <option key={l.id} value={String(l.id)}>{l.icon} {l.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#a0a8be', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>キャンセル</button>
          <button onClick={save} disabled={saving || !name.trim()} style={{ background: '#4d9fff', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  )
}

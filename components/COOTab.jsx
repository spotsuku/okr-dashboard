'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useFeatureFlag, MODULE_KEYS } from '../lib/featureFlags'
import { useCurrentOrg } from '../lib/orgContext'
import Icon from './Icon'
import { TYPO, SPACING, RADIUS, SHADOWS } from '../lib/themeTokens'
import { btnSecondary, btnBrand, inputStyle, glassBarStyle, accentRingStyle } from '../lib/iosStyles'

function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => typeof window === 'undefined' ? false : window.innerWidth < bp)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return m
}

export default function COOTab({
  T, myName, viewingName, isAdmin, onOpenSettings,
  chatState, setChatState,
}) {
  // SaaS化: coo_knowledge モジュール OFF テナントは何も描画しない (二重防御)
  const cooEnabled = useFeatureFlag(MODULE_KEYS.COO_KNOWLEDGE)
  const { currentOrg } = useCurrentOrg()
  const isMobile = useIsMobile()
  const owner = viewingName || myName

  // chatState が親から渡されていれば使う (タブ移動で消えない)
  // 渡されていなければ COOTab 内ローカル state でフォールバック
  const [localState, setLocalState] = useState({ history: [], historyLoaded: false, mode: 'coach' })
  const useParent = !!setChatState
  const stateBag = useParent ? chatState : localState
  const setStateBag = useParent ? setChatState : setLocalState

  const history = stateBag.history
  const historyLoaded = stateBag.historyLoaded
  const mode = stateBag.mode

  const setHistory = (updater) => setStateBag(prev => ({
    ...prev,
    history: typeof updater === 'function' ? updater(prev.history) : updater,
  }))
  const setHistoryLoaded = (v) => setStateBag(prev => ({ ...prev, historyLoaded: v }))
  const setMode = (v) => setStateBag(prev => ({ ...prev, mode: v }))

  // input/busy/err/lastUserMsg はタブを離れている間に意味を失うのでローカル
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lastUserMsg, setLastUserMsg] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history, busy])

  // 履歴ロード (myName 確定後に1回だけ。タブ移動・リロード後も復元される)
  useEffect(() => {
    if (!myName || historyLoaded) return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('coaching_chats')
        .select('role, content, metadata, created_at')
        .eq('owner', myName)
        .eq('kind', 'coo')
        .order('created_at', { ascending: true })
        .limit(200)
      if (!alive) return
      // テーブル/カラム未作成 (42P01 / 42703) はサイレント無視
      if (error && error.code !== '42P01' && error.code !== '42703') {
        console.warn('coo chat history load error:', error)
      }
      if (data && data.length > 0) {
        setHistory(data.map(r => ({
          role: r.role,
          content: r.content,
          actions: r.metadata?.actions || [],
        })))
      }
      setHistoryLoaded(true)
    })()
    return () => { alive = false }
  }, [myName, historyLoaded])

  // メッセージを履歴テーブルに保存 (失敗は console.warn 留め)
  const saveMessage = async (role, content, metadata) => {
    if (!myName || !content) return
    try {
      await supabase.from('coaching_chats').insert({
        owner: myName, kind: 'coo', role, content,
        metadata: metadata || null,
      })
    } catch (e) {
      console.warn('coo chat save error:', e)
    }
  }

  // 履歴クリア (DB からも削除)
  const clearHistory = async () => {
    if (history.length === 0) return
    if (!window.confirm('ぺろっぺとの会話履歴をすべて削除しますか?')) return
    try {
      await supabase.from('coaching_chats')
        .delete().eq('owner', myName).eq('kind', 'coo')
    } catch (e) {
      console.warn('coo chat clear error:', e)
    }
    setHistory([])
  }

  const send = async (override) => {
    const msg = (override ?? input).trim()
    if (!msg || busy) return
    const isRetry = override != null
    if (!isRetry) setInput('')
    setErr('')
    setLastUserMsg(msg)
    if (!isRetry) {
      setHistory(prev => [...prev, { role: 'user', content: msg }])
      saveMessage('user', msg)  // 発言を即保存
    }
    setBusy(true)
    try {
      const r = await fetch('/api/integrations/coo/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner, message: msg, mode,
          history: history.map(h => ({ role: h.role, content: h.content })),
          organization_id: currentOrg?.id,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      const aiContent = j.text || '(応答なし)'
      const actions = j.actions || []
      setHistory(prev => [...prev, {
        role: 'assistant', content: aiContent, actions,
      }])
      saveMessage('assistant', aiContent, { actions, mode })
      // エラーメッセージは履歴に残さない (再質問を促す)
    } catch (e) {
      setErr(e.message || 'エラー')
    } finally {
      setBusy(false)
    }
  }

  // SaaS化: coo_knowledge OFF テナントは早期 return (ナビでも非表示済み、二重防御)
  if (!cooEnabled) return null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.bg }}>
      {/* ヘッダー (iOS グラスバー) */}
      <div style={{
        ...glassBarStyle({ T }),
        padding: `${SPACING.md}px ${SPACING.lg + 2}px`,
        display: 'flex', alignItems: 'center', gap: SPACING.sm + 2, flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <div style={accentRingStyle({ color: T.success, size: 36 })}>
          <Icon name="ai" size={20} />
        </div>
        <div>
          <div style={{ ...TYPO.title3, fontSize: 15, color: T.text }}>ぺろっぺ</div>
          <div style={{ ...TYPO.footnote, color: T.textMuted }}>三木CEOの右腕 AIコーチ</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 2, background: T.sectionBg, padding: 3, borderRadius: RADIUS.sm }}>
          {[
            { key: 'coach', icon: 'target', label: 'コーチ', desc: 'GROWで深掘り' },
            { key: 'speed', icon: 'bolt', label: 'スピード', desc: '即答' },
          ].map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              title={m.desc}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
                padding: '6px 12px', borderRadius: RADIUS.xs, border: 'none', cursor: 'pointer',
                background: mode === m.key ? T.bgCard : 'transparent',
                color: mode === m.key ? T.text : T.textSub,
                boxShadow: mode === m.key ? SHADOWS.sm : 'none',
                ...TYPO.subhead, fontWeight: 700, fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}><Icon name={m.icon} size={13} />{m.label}</button>
          ))}
        </div>
        {isAdmin && (
          <button onClick={onOpenSettings} title="ぺろっぺ設定 (admin)" style={{
            ...btnSecondary({ T, size: 'sm' }),
            display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
          }}><Icon name="settings" size={13} />設定</button>
        )}
        <button onClick={clearHistory} disabled={busy || history.length === 0} style={{
          ...btnSecondary({ T, size: 'sm' }),
          cursor: (busy || history.length === 0) ? 'not-allowed' : 'pointer',
          opacity: (busy || history.length === 0) ? 0.5 : 1,
        }}>クリア</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: SPACING.lg - 2, maxWidth: 880, margin: '0 auto', width: '100%' }}>
        {history.length === 0 && (
          <div style={{
            padding: SPACING.xl, background: T.sectionBg, borderRadius: RADIUS.md,
            ...TYPO.body, color: T.textMuted, lineHeight: 1.8,
          }}>
            <div style={{ ...TYPO.title1, fontSize: 22, color: T.text, marginBottom: SPACING.sm + 2, display: 'flex', alignItems: 'center', gap: SPACING.sm }}><Icon name="ai" size={22} /> こんにちは、{owner}さん</div>
            仕事のこと、なんでも壁打ちしてください。<br />
            今日のあなたの OKR・タスク・直近の振り返りを見ながら、コーチングします。
            <div style={{ marginTop: SPACING.lg - 2, ...TYPO.subhead, fontWeight: 500 }}>
              <strong>例:</strong>
              <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
                <li>「あの案件が進まない、どうしたらいい?」</li>
                <li>「○○さん今忙しい? タスクお願いしていい?」</li>
                <li>「来週の OKR 会議で何を議論すべき?」</li>
                <li>「私の今期の重点を教えて」</li>
              </ul>
            </div>
          </div>
        )}
        {history.map((h, i) => (
          <div key={i} style={{
            marginBottom: SPACING.md, padding: `${SPACING.sm + 2}px ${SPACING.lg - 2}px`, borderRadius: RADIUS.md,
            background: h.role === 'user' ? T.accentBg : T.sectionBg,
            border: `1px solid ${h.role === 'user' ? T.accent + '40' : T.border}`,
            ...TYPO.body, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.7,
          }}>
            <div style={{ ...TYPO.caption, color: T.textMuted, marginBottom: SPACING.xs + 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
              {h.role === 'user'
                ? (<><Icon name="user" size={11} />{owner}さん</>)
                : (<><Icon name="ai" size={11} />ぺろっぺ</>)}
            </div>
            {h.content}
            {h.actions && h.actions.length > 0 && (
              <div style={{ marginTop: SPACING.xs + 2, ...TYPO.caption, fontWeight: 500, letterSpacing: 0, color: T.textMuted, fontStyle: 'italic' }}>
                参照: {h.actions.map(a => a.tool).join(' → ')}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ padding: SPACING.sm + 2, ...TYPO.subhead, fontWeight: 500, color: T.textMuted, display: 'flex', alignItems: 'center', gap: SPACING.xs }}>
            <Icon name="ai" size={14} /> 考え中…
          </div>
        )}
        {err && (
          <div style={{
            padding: SPACING.md, ...TYPO.subhead, fontWeight: 500, color: T.danger,
            background: T.dangerBg, border: `1px solid ${T.danger}40`,
            borderRadius: RADIUS.sm, lineHeight: 1.6,
          }}>
            <div style={{ marginBottom: SPACING.sm, display: 'flex', alignItems: 'center', gap: SPACING.xs }}><Icon name="alert" size={13} /> {err}</div>
            {lastUserMsg && (
              <button onClick={() => send(lastUserMsg)} disabled={busy} style={{
                ...btnSecondary({ T, size: 'sm' }),
                display: 'inline-flex', alignItems: 'center', gap: SPACING.xs,
              }}><Icon name="refresh" size={13} /> 再試行</button>
            )}
          </div>
        )}
      </div>

      <div style={{
        padding: SPACING.md, borderTop: `1px solid ${T.border}`,
        display: 'flex', gap: SPACING.sm, flexShrink: 0, background: T.bgCard,
        maxWidth: 880, margin: '0 auto', width: '100%', boxSizing: 'border-box',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
          }}
          placeholder="自然文で質問・相談 (Ctrl+Enter送信)"
          rows={2}
          disabled={busy}
          style={{
            ...inputStyle({ T }),
            flex: 1, width: 'auto', background: T.bg,
            ...TYPO.body,
            resize: 'vertical',
          }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{
          ...btnBrand({ size: 'md' }),
          padding: '0 18px',
          ...(busy ? { background: T.border, boxShadow: 'none' } : {}),
          cursor: busy ? 'not-allowed' : 'pointer', minWidth: 80,
        }}>送信</button>
      </div>
    </div>
  )
}

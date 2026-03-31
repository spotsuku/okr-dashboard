'use client'
import { useState, useRef, useCallback } from 'react'
import { supabase } from './supabase'

/**
 * 800msデバウンス自動保存フック
 * @param {string} tableName - Supabaseテーブル名
 * @param {number|string} id - レコードID
 * @param {object} options - { enabled: boolean }
 * @returns {{ save, saving, saved, error, focusedField, setFocusedField }}
 */
export function useAutoSave(tableName, id, options = {}) {
  const { enabled = true } = options
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [focusedField, setFocusedField] = useState(null)
  const timerRef = useRef(null)
  const pendingRef = useRef({})
  const savedTimerRef = useRef(null)

  const flush = useCallback(async () => {
    if (!id || !enabled) return
    const fields = { ...pendingRef.current }
    if (!Object.keys(fields).length) return
    pendingRef.current = {}
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from(tableName).update(fields).eq('id', id)
    setSaving(false)
    if (err) {
      setError(err)
      console.error(`AutoSave error (${tableName}#${id}):`, err)
    } else {
      setSaved(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 1500)
    }
  }, [tableName, id, enabled])

  const save = useCallback((fieldName, value) => {
    if (!enabled) return
    pendingRef.current[fieldName] = value
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 800)
  }, [flush, enabled])

  // 即時保存（フォーカスアウト時など）
  const saveNow = useCallback((fieldName, value) => {
    if (!enabled) return
    if (fieldName) pendingRef.current[fieldName] = value
    if (timerRef.current) clearTimeout(timerRef.current)
    flush()
  }, [flush, enabled])

  return { save, saveNow, saving, saved, error, focusedField, setFocusedField }
}

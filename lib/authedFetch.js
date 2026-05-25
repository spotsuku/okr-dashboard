'use client'
// クライアント: Supabase のアクセストークンを Authorization ヘッダに付けて fetch する。
// AI/コスト系 API (lib/apiGuard でガード) を呼ぶ際に使用。
import { supabase } from './supabase'

export async function authedFetch(url, options = {}) {
  let token = null
  try {
    const { data } = await supabase.auth.getSession()
    token = data?.session?.access_token || null
  } catch {}
  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

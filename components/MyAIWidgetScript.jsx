'use client'
import { useState, useEffect } from 'react'
import Script from 'next/script'
import { useParams } from 'next/navigation'
import { supabase } from '../lib/supabase'

// myAI ウィジェット (widget.js) はライセンス未登録ユーザーに対して
// myAI 側のロックモーダルを発火する。トライアル中 (30日以内) は
// 読み込まずに myAI 側のロックを抑制する。
//
// 条件付きロード:
// - grandfathered (NEO福岡など永久無料組織) → 読み込まない
// - トライアル中 + キー未登録 → 読み込まない
// - トライアル切れ + キー未登録 → 読み込む (myAI 側でロック)
// - キー登録済 → 読み込む (myAI 連携継続)
//
// LicenseProvider に依存しないように self-contained で /api/license/status を叩く。
export default function MyAIWidgetScript({ productId }) {
  const params = useParams()
  const slug = typeof params?.orgSlug === 'string' ? params.orgSlug : ''
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!slug) return
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive || !user?.email) return
      const { data: org } = await supabase.from('organizations')
        .select('id').eq('slug', slug).maybeSingle()
      if (!alive || !org?.id) return
      const r = await fetch(
        `/api/license/status?organization_id=${org.id}&requester_email=${encodeURIComponent(user.email)}`,
        { credentials: 'include' }
      )
      const j = await r.json().catch(() => null)
      if (alive && j) setStatus(j)
    })()
    return () => { alive = false }
  }, [slug])

  if (!status) return null
  if (status.grandfathered) return null
  if (status.trial_active && !status.has_key) return null
  return (
    <Script
      src="https://my-ai.community/widget.js"
      data-product-id={productId}
      strategy="afterInteractive"
    />
  )
}

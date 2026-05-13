'use client'
// /[orgSlug] : Slack 風の組織別ダッシュボード URL
// 例: /neo-fukuoka?page=portal&fy=2026
import { useParams } from 'next/navigation'
import AppRoot from '../../components/AppRoot'

export default function OrgPage() {
  const params = useParams()
  const slug = typeof params?.orgSlug === 'string' ? params.orgSlug : ''
  return <AppRoot urlSlug={slug} />
}

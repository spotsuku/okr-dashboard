'use client'
// ルート "/" : 認証 → デフォルト組織の /{slug} へ自動リダイレクト
import AppRoot from '../components/AppRoot'

export default function Page() {
  return <AppRoot />
}

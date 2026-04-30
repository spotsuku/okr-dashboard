// 経営ダッシュボード (neo-mg) 側の Supabase に接続するクライアント
// 工数管理データ (workforce_versions テーブル) の読み書き / リアルタイム購読に使う
//
// 必要な環境変数:
//   NEXT_PUBLIC_MGMT_SUPABASE_URL       — neo_mg Supabase の URL
//   NEXT_PUBLIC_MGMT_SUPABASE_ANON_KEY  — anon key (RLS allow_all のため公開可)
//
// 仕様: docs/workforce-sync-spec.md (neo_mg リポジトリ内)

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_MGMT_SUPABASE_URL || ''
const key = process.env.NEXT_PUBLIC_MGMT_SUPABASE_ANON_KEY || ''

export const mgmtSupabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: false } })
  : null

export const isMgmtConfigured = !!(url && key)

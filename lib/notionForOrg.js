// ─────────────────────────────────────────────────────────────
// Notion 設定を per-org で解決するヘルパー (Phase 4: SaaS化)
//
// 優先順位 (高 → 低):
//   1. organizations.notion_api_key / notion_db_ids[meetingKey]
//   2. process.env.NOTION_API_KEY / NOTION_<KEY>_DB_ID (移行期間 fallback)
//
// 使い方 (API ルート側):
//   import { getAdminClient } from '../_shared'
//   import { resolveNotionConfig } from '../../../lib/notionForOrg'
//   const cfg = await resolveNotionConfig(orgId, meetingKey, getAdminClient)
//   if (!cfg.apiKey || !cfg.dbId) return json({ error: '...' }, 400)
//   // cfg.apiKey, cfg.dbId を使って Notion API 叩く
// ─────────────────────────────────────────────────────────────

// meetingKey → 環境変数名 (移行期間 fallback 用)
const ENV_DB_ID_KEYS = {
  'morning':            'NOTION_MORNING_MEETING_DB_ID',
  'kickoff-partner':    'NOTION_KICKOFF_PARTNER_DB_ID',
  'kickoff-youth':      'NOTION_KICKOFF_YOUTH_DB_ID',
  'kickoff-community':  'NOTION_KICKOFF_COMMUNITY_DB_ID',
  'sales':              'NOTION_KICKOFF_PARTNER_DB_ID',  // sales は partner と同じ DB
  'manager':            'NOTION_MANAGER_DB_ID',
  'director':           'NOTION_DIRECTOR_DB_ID',
  'planning':           'NOTION_PLANNING_DB_ID',
  'board':              'NOTION_BOARD_DB_ID',           // 無ければ PLANNING に fallback
  'program-regular':    'NOTION_PROGRAM_REGULAR_DB_ID',
}

function envDbIdFor(meetingKey) {
  const envName = ENV_DB_ID_KEYS[meetingKey]
  if (!envName) return null
  const v = process.env[envName]
  if (v) return v
  // board 専用 fallback
  if (meetingKey === 'board') return process.env.NOTION_PLANNING_DB_ID || null
  return null
}

// Supabase の organizations テーブルから org の Notion 設定を取得
// supabaseAdmin: getAdminClient() で取った Supabase クライアント
async function fetchOrgNotionConfig(orgId, supabaseAdmin) {
  if (!orgId) return { apiKey: null, dbIds: {} }
  try {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('notion_api_key, notion_db_ids')
      .eq('id', orgId)
      .maybeSingle()
    if (error) return { apiKey: null, dbIds: {} }
    return {
      apiKey: data?.notion_api_key || null,
      dbIds:  (data?.notion_db_ids && typeof data.notion_db_ids === 'object') ? data.notion_db_ids : {},
    }
  } catch {
    return { apiKey: null, dbIds: {} }
  }
}

// API ルートから呼ぶメイン関数
// resolveNotionConfig(orgId, meetingKey, supabaseAdmin)
//   → { apiKey, dbId, source }
//     source: 'org' (両方 org 由来) / 'mixed' (片方 fallback) / 'env' (両方 env 由来)
export async function resolveNotionConfig(orgId, meetingKey, supabaseAdmin) {
  const orgCfg = supabaseAdmin
    ? await fetchOrgNotionConfig(orgId, supabaseAdmin)
    : { apiKey: null, dbIds: {} }

  const apiKey = orgCfg.apiKey || process.env.NOTION_API_KEY || null
  const dbId   = (meetingKey && orgCfg.dbIds[meetingKey]) || envDbIdFor(meetingKey) || null

  const orgHasApi = !!orgCfg.apiKey
  const orgHasDb  = !!(meetingKey && orgCfg.dbIds[meetingKey])
  let source = 'env'
  if (orgHasApi && orgHasDb) source = 'org'
  else if (orgHasApi || orgHasDb) source = 'mixed'

  return { apiKey, dbId, source }
}

// meetingKey 無しでも API key だけ欲しいケース (notion-import 等)
export async function resolveNotionApiKey(orgId, supabaseAdmin) {
  const orgCfg = supabaseAdmin
    ? await fetchOrgNotionConfig(orgId, supabaseAdmin)
    : { apiKey: null, dbIds: {} }
  return orgCfg.apiKey || process.env.NOTION_API_KEY || null
}

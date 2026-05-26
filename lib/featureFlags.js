'use client'
import { useCurrentOrg } from './orgContext'

// ─────────────────────────────────────────────────────────────
// 機能 (モジュール) の組織別 ON/OFF を扱う feature flag インフラ
//
// 背景: SaaS化 Phase C で「コア / Standard / Add-on / 自社固有」を
//   モジュール単位で組織ごとに有効化できるようにする。
//   SAAS_STRATEGY.md / MODULE_MIGRATION_PLAN.md を参照。
//
// データソース:
//   organizations.enabled_modules (jsonb) - キー = モジュール名、値 = boolean
//   organizations.plan            (text)   - 'free_trial' / 'standard' /
//                                            'standard_plus' / 'enterprise'
//
// orgContext.js が currentOrg.enabled_modules / currentOrg.plan を
// 引いてきている前提。SELECT に含まれていない場合は全 flag false 扱い
// (= 既存挙動を維持) なので、SQL 未適用環境でも安全に読める。
// ─────────────────────────────────────────────────────────────

// モジュールキーの一覧 (型補助 + 誤入力検出用)
export const MODULE_KEYS = {
  GOOGLE_INTEGRATION:  'google_integration',
  AI_CHAT:             'ai_chat',
  MEETING_INTEGRATION: 'meeting_integration',
  OKR_FULL:            'okr_full',
  MILESTONES:          'milestones',
  COO_KNOWLEDGE:       'coo_knowledge',
  WORKFORCE:           'workforce',
  PORTAL_NEO:          'portal_neo',
}

// プラン
export const PLANS = {
  FREE_TRIAL:    'free_trial',
  STANDARD:      'standard',
  STANDARD_PLUS: 'standard_plus',
  ENTERPRISE:    'enterprise',
}

// クライアント側 (React) ─────────────────────────────────────

export function useFeatureFlag(moduleKey) {
  const { currentOrg } = useCurrentOrg()
  return !!currentOrg?.enabled_modules?.[moduleKey]
}

export function useFeatureFlags() {
  const { currentOrg } = useCurrentOrg()
  return currentOrg?.enabled_modules || {}
}

export function usePlan() {
  const { currentOrg } = useCurrentOrg()
  return currentOrg?.plan || PLANS.FREE_TRIAL
}

// 表示制御の JSX ラッパー
//   使い方: <FeatureGate flag={MODULE_KEYS.PORTAL_NEO}>...</FeatureGate>
export function FeatureGate({ flag, children, fallback = null }) {
  const enabled = useFeatureFlag(flag)
  return enabled ? children : fallback
}

// サーバー側 (API route 等) ─────────────────────────────────

// supabase は API 側で生成済みのクライアントを渡す前提
// (service-role / anon どちらでも、enabled_modules の SELECT が通れば OK)
export async function isModuleEnabled(supabase, orgId, moduleKey) {
  if (!supabase || !orgId || !moduleKey) return false
  const { data, error } = await supabase
    .from('organizations')
    .select('enabled_modules')
    .eq('id', orgId)
    .maybeSingle()
  if (error || !data) return false
  return !!data.enabled_modules?.[moduleKey]
}

// 複数キーを一括取得 (API 内で複数判定する場合用)
export async function getModuleFlags(supabase, orgId) {
  if (!supabase || !orgId) return {}
  const { data, error } = await supabase
    .from('organizations')
    .select('enabled_modules, plan')
    .eq('id', orgId)
    .maybeSingle()
  if (error || !data) return {}
  return {
    enabled_modules: data.enabled_modules || {},
    plan: data.plan || PLANS.FREE_TRIAL,
  }
}

'use client'
import { useCurrentOrg } from './orgContext'

// ─────────────────────────────────────────────────────────────
// 層ラベル (経営 / 事業部 / チーム) の組織別カスタマイズ
//
// 旧: 各コンポーネントで `const LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }` を
//     ハードコード。
// 新: `organizations.level_labels` JSON ({l1, l2, l3}) から動的に取得。
//     新テナントは組織設定で自由に変更できる (例: 「会社」「部」「チーム」など)。
//
// 設定がない場合は日本企業標準のデフォルト値にフォールバック。
// ─────────────────────────────────────────────────────────────

export const DEFAULT_LAYER_LABELS = { 0: '経営', 1: '事業部', 2: 'チーム' }

// 現在組織の層ラベル (depth → 表示名) を返す React Hook
export function useLayerLabels() {
  const { currentOrg } = useCurrentOrg()
  const ll = currentOrg?.level_labels
  if (!ll) return DEFAULT_LAYER_LABELS
  return {
    0: ll.l1 || '経営',
    1: ll.l2 || '事業部',
    2: ll.l3 || 'チーム',
  }
}

// 非 React 環境用: level_labels JSON を引数で受け取って変換
export function getLayerLabels(levelLabels) {
  if (!levelLabels) return DEFAULT_LAYER_LABELS
  return {
    0: levelLabels.l1 || '経営',
    1: levelLabels.l2 || '事業部',
    2: levelLabels.l3 || 'チーム',
  }
}

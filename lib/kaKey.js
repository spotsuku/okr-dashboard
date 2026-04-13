// ka_key: 週を跨いで同じKAを識別するためのキー
// 形式: "{kr_id}|{ka_title}|{owner}|{objective_id}"
// 使い方: ka_tasks の ka_key カラムに保存し、同じKAのタスクを集約する
export function computeKAKey(r) {
  if (!r) return null
  return `${r.kr_id ?? ''}|${r.ka_title ?? ''}|${r.owner ?? ''}|${r.objective_id ?? ''}`
}

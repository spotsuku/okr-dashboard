// 共有: メンバー名 → 安定したアバター色 (全ページ共通の唯一の正)
// パレットは組織ページ(OrgPage)の定義をアプリ標準として採用。
const PALETTE = ['#5A8A7A', '#3D6B5E', '#5DCAA5', '#E8875A', '#6B8DB5', '#B07D9E', '#C4956A', '#5B9EA6', '#8B7EC8', '#D4816B']
export const AVATAR_COLORS = PALETTE
export function avatarColor(name = '') {
  const s = String(name || '')
  if (!s) return '#94a3b8'
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

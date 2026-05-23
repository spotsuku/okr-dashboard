// 共有: メンバー名 → 安定したアバター色 (OKR/タスク等で共通利用)
const PALETTE = ['#5A8A7A', '#E8875A', '#6B8DB5', '#B07D9E', '#C4956A', '#5B9EA6', '#8B7EC8', '#D4816B']
export function avatarColor(name = '') {
  const s = String(name || '')
  if (!s) return PALETTE[0]
  const h = [...s].reduce((acc, ch) => ch.charCodeAt(0) + ((acc << 5) - acc), 0)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

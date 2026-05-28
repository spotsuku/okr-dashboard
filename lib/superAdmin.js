// ────────────────────────────────────────────────────────────────
// スーパー管理者 (運営) 判定 — サーバー専用
//
// 環境変数 SUPER_ADMIN_EMAILS にカンマ/空白区切りで列挙したメールアドレスを
// 「運営 (組織横断の分析を見られる人)」として扱う。
//   例: SUPER_ADMIN_EMAILS="ops@example.com, founder@example.com"
//
// 未設定なら誰も super 管理者にならない (= 安全側のデフォルト)。
// クライアントに一覧を晒さないため、判定は必ずサーバー側で行う。
// ────────────────────────────────────────────────────────────────

export function parseSuperAdminEmails() {
  const raw = process.env.SUPER_ADMIN_EMAILS || ''
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isSuperAdmin(email) {
  if (!email) return false
  return parseSuperAdminEmails().includes(String(email).trim().toLowerCase())
}

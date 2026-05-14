// Resend REST API で招待メールを送る (サーバー側専用)。
//
// 必須 env:
//   RESEND_API_KEY      : Resend のシークレット (re_xxx)
//   INVITE_FROM_EMAIL   : 認証済みドメインの送信元アドレス (例: "NEO運営DB <noreply@your-domain>")
//
// 任意 env:
//   INVITE_BASE_URL     : サインインURLのベース (デフォルト: https://okr-dashboard-taupe.vercel.app)
//
// 設定が無い場合は { skipped: true, reason } を返し、API ルートは
// メンバー作成自体は成功させたまま「メール送信のみスキップ」を返す方針。

const DEFAULT_BASE_URL = 'https://okr-dashboard-taupe.vercel.app'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export async function sendInviteEmail({
  toEmail,
  toName,
  organizationName,
  organizationSlug,
  inviterEmail,
  role,
}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.INVITE_FROM_EMAIL
  if (!apiKey) return { skipped: true, reason: 'RESEND_API_KEY 未設定' }
  if (!from)   return { skipped: true, reason: 'INVITE_FROM_EMAIL 未設定' }
  if (!toEmail || !organizationSlug) {
    return { skipped: true, reason: 'toEmail / organizationSlug が空' }
  }

  const baseUrl = (process.env.INVITE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
  const signInUrl = `${baseUrl}/${encodeURIComponent(organizationSlug)}`

  const orgLabel = organizationName || organizationSlug
  const roleLabel = role === 'owner' ? 'オーナー'
                  : role === 'admin' ? '管理者'
                  : 'メンバー'

  const subject = `[${orgLabel}] OKRダッシュボードへの招待`

  const greet = toName ? `${toName} さん` : `${toEmail} さん`
  const text = [
    `${greet}`,
    ``,
    `${inviterEmail} さんから「${orgLabel}」のOKRダッシュボードに招待されました。`,
    `あなたのロール: ${roleLabel}`,
    ``,
    `下記URLを開き、表示されるログイン画面で「${toEmail}」でサインインしてください。`,
    `初回はパスワードを設定するメールが届きます。`,
    ``,
    `${signInUrl}`,
    ``,
    `--`,
    `OKR ダッシュボード`,
  ].join('\n')

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="margin: 0 0 18px; font-size: 18px; font-weight: 700;">
    「${escapeHtml(orgLabel)}」のOKRダッシュボードへの招待
  </h2>
  <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.7;">
    ${escapeHtml(greet)}
  </p>
  <p style="margin: 0 0 14px; font-size: 14px; line-height: 1.7;">
    <strong>${escapeHtml(inviterEmail)}</strong> さんから「<strong>${escapeHtml(orgLabel)}</strong>」のOKRダッシュボードに招待されました。<br/>
    あなたのロール: <strong>${escapeHtml(roleLabel)}</strong>
  </p>
  <p style="margin: 0 0 18px; font-size: 14px; line-height: 1.7;">
    下記ボタンからサインイン画面を開き、<strong>${escapeHtml(toEmail)}</strong> でサインインしてください。
  </p>
  <div style="margin: 0 0 24px;">
    <a href="${escapeHtml(signInUrl)}"
       style="display: inline-block; padding: 12px 22px; border-radius: 8px;
              background: #4d9fff; color: #ffffff; font-weight: 700;
              font-size: 14px; text-decoration: none;">
      サインイン画面を開く →
    </a>
  </div>
  <p style="margin: 0 0 6px; font-size: 12px; color: #6b7280;">
    URL をコピーして開く場合:
  </p>
  <p style="margin: 0 0 24px; font-size: 12px; color: #4d9fff; word-break: break-all;">
    <a href="${escapeHtml(signInUrl)}" style="color: #4d9fff;">${escapeHtml(signInUrl)}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
  <p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.6;">
    このメールは ${escapeHtml(inviterEmail)} の操作によって自動送信されました。<br/>
    心当たりがない場合は、お手数ですがこのメールを破棄してください。
  </p>
</div>`.trim()

  let res
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from, to: [toEmail], subject, text, html,
      }),
    })
  } catch (e) {
    return { ok: false, error: `Resend fetch 失敗: ${e.message || e}` }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, status: res.status, error: `Resend ${res.status}: ${body.slice(0, 300)}` }
  }
  const json = await res.json().catch(() => ({}))
  return { ok: true, id: json.id || null, signInUrl }
}

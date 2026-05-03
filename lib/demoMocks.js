// ─────────────────────────────────────────────────────────────
// Demo モード用のモックレスポンス
// API ルートの先頭で if (await shouldMock(owner)) return demoResponse(...)
// を追加することで、Google系/Slack系の外部API呼び出しを
// ダミーデータで代替する。
//
// ただしユーザーが自分のGoogleアカウントを連携した場合は実データを返す
// (DEMO_MODE 中でも実連携があれば mock せず通常フロー)
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
    || process.env.DEMO_MODE === 'true'
}

// owner (members.name) が google 連携済みかチェック
async function hasRealGoogleIntegration(owner) {
  if (!owner) return false
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    // owner -> member.email -> user_integrations(service='google') を確認
    const { data: m } = await sb.from('members').select('email').eq('name', owner).maybeSingle()
    if (!m?.email) return false
    const { data: ig } = await sb.from('user_integrations')
      .select('access_token').eq('user_email', m.email).eq('service', 'google').maybeSingle()
    return !!ig?.access_token
  } catch { return false }
}

/**
 * DEMO_MODE で mock を返すべきかどうか。
 *   - DEMO_MODE 無効 → false (通常動作)
 *   - DEMO_MODE 有効 + 実連携あり → false (実データを返す)
 *   - DEMO_MODE 有効 + 実連携なし → true (mock)
 */
export async function shouldMock(owner) {
  if (!isDemoMode()) return false
  const real = await hasRealGoogleIntegration(owner)
  return !real
}

export function demoResponse(kind) {
  const now = new Date()
  const todayIso = now.toISOString()
  const inHours = (h) => new Date(now.getTime() + h * 3600 * 1000).toISOString()

  switch (kind) {
    case 'gmail/threads': {
      // 実APIと同じフォーマット (gmail/threads/route.js を参照)
      // Humano Robotics Inc. のデモコンテキスト
      const mk = (i, hAgo, from, subject, snippet, category = 'to_me', replied = false) => {
        const ts = now.getTime() - hAgo * 3600 * 1000
        return {
          id: `demo-mail-${i}`,
          threadId: `demo-thread-${i}`,
          internalDate: ts,
          from,
          fromRaw: `${from} <demo${i}@humano-robotics.demo>`,
          subject,
          snippet,
          date: new Date(ts).toUTCString(),
          messageIdHeader: `<demo-${i}@humano-robotics.demo>`,
          category,
          labelIds: ['INBOX'],
          replied,
          repliedAt: replied ? new Date(ts + 30 * 60 * 1000).toISOString() : null,
        }
      }
      const items = [
        mk(1,  1,  '佐藤 健一郎 (ロボット研究部)',     '【至急】H7 試作機 関節モジュール EOL 部品の代替検討',     '取引先より H7 の右肩アクチュエータに使用している減速機が来月EOLとの連絡。代替候補3件を比較表にまとめましたので確認ください。', 'to_me', false),
        mk(2,  3,  '高橋 真奈美 (営業部)',             '【商談】Tier1 製造業A社 ヒューマノイド導入PoC 提案',      '先方より H7 を3台レンタルし、組立工程に半年間導入したいと打診あり。15時から会議室Aで方針MTG設定済み。', 'to_me', false),
        mk(3,  5,  '中村 蒼太 (AI開発部)',             '次世代 LLM 動作計画モデルの評価結果',                       '社内ベンチマーク (HRBench-2026) で前モデル比 +18% 改善。資料を Drive に置いたので Q3 ロードマップで議論したい。', 'cc_me', false),
        mk(4,  7,  '山田 智子 (CFO)',                  'Q1 着地見込みの最終確認',                                    'マネジメントMTG前に Q1 売上 2.3億 / 営業損失 △0.4億 で着地見込み。コメント反映よろしくお願いします。', 'to_me', false),
        mk(5,  10, '株式会社 NEDO テック (取引先)',     '【契約】共同研究契約書 第2版 ご確認のお願い',                 '先日いただいたコメントを反映した第2版を添付しました。来週水曜までに法務確認お願いします。', 'to_me', false),
        mk(6,  14, '人事部 採用チーム',                'ロボット制御エンジニア候補者 一次面接調整',                  '〇〇大博士後期1年の候補者2名、来週金曜午後で日程候補を3つ提示します。ご都合いかがでしょうか。', 'to_me', false),
        mk(7,  20, '藤田 雄介 (機構設計部)',           '【更新】H7 BOM v2.4 リリース',                              'H7 試作 #08 以降に適用する BOM v2.4 を Drive にアップしました。コスト △6.2% を達成。詳細は資料参照。', 'cc_me', true),
        mk(8,  28, 'Google Calendar',                  '招待: 経営会議 (5月) @ 5月15日 14:00 - 16:00',               '会議室「Saturn」にて。アジェンダ: 1) Q1振り返り 2) Q2着地見込み 3) Series B 進捗', 'invite', false),
        mk(9,  32, 'AWS Billing',                       'Your AWS Invoice for April is now available',               'Total: $4,287.92. Click here to view detailed billing breakdown for the AWS account.', 'notification', false),
        mk(10, 40, 'GitHub',                            '[humano-robotics/control-stack] PR #482 reviewed',           'matsuda-eng requested changes on your pull request. View on GitHub.', 'notification', false),
      ]
      return { items, myEmail: 'guest@humano-robotics.demo' }
    }
    case 'gmail/message':
      return {
        id: 'demo-mail-1',
        from: '佐藤 健一郎 (ロボット研究部) <satoh@humano-robotics.demo>',
        to: 'guest@humano-robotics.demo',
        subject: '【至急】H7 試作機 関節モジュール EOL 部品の代替検討',
        body: 'お疲れさまです、佐藤です。\n\n標題の件、取引先より H7 の右肩アクチュエータに使用している減速機 (HRG-22A) が 7月末で EOL になると正式な連絡がありました。\n\n代替候補として以下3件を比較しています:\n  1. HRG-25B (同メーカー、後継品) — 価格 +12%、トルク +5%、互換性◎\n  2. NRX-180  (他社品)        — 価格 -8%、トルク同等、再評価必要\n  3. 内製 v2  (機構部 試作中)  — 量産時期未定、長期視野\n\n比較表は Drive の "H7/部品/EOL対応" に置いています。\nQ2 中の意思決定が必要なため、5/15 の経営会議までに方針を固めたいです。\n\nお手すきの際にご確認をお願いします。',
        timestamp: inHours(-1),
      }
    case 'calendar/events':
    case 'calendar/multi-events': {
      const startToday = new Date(now); startToday.setHours(9, 0, 0, 0)
      const events = []
      for (let day = 0; day < 5; day++) {
        const base = new Date(startToday); base.setDate(base.getDate() + day)
        events.push({
          id: `demo-evt-${day}-1`,
          summary: 'デモ朝会',
          start: { dateTime: new Date(base.getTime() + 0).toISOString() },
          end:   { dateTime: new Date(base.getTime() + 30 * 60 * 1000).toISOString() },
          attendees: [],
        })
        events.push({
          id: `demo-evt-${day}-2`,
          summary: '【デモ】お客様商談',
          start: { dateTime: new Date(base.getTime() + 4 * 3600 * 1000).toISOString() },
          end:   { dateTime: new Date(base.getTime() + 5 * 3600 * 1000).toISOString() },
          attendees: [],
        })
      }
      return { events, members: [{ name: 'ゲスト', email: 'guest@demo.local', events }] }
    }
    case 'drive/list':
      return {
        folder: { id: 'demo-folder-root', name: 'Sample ドライブ', isRoot: true },
        breadcrumb: [{ id: 'demo-folder-root', name: 'Sample ドライブ', isRoot: true }],
        items: [
          { id: 'demo-folder-1', name: '01_営業資料',   mimeType: 'application/vnd.google-apps.folder', isFolder: true,  modifiedTime: inHours(-72) },
          { id: 'demo-folder-2', name: '02_開発',       mimeType: 'application/vnd.google-apps.folder', isFolder: true,  modifiedTime: inHours(-48) },
          { id: 'demo-doc-1',    name: '【デモ】事業計画書.docx', mimeType: 'application/vnd.google-apps.document', isFolder: false, modifiedTime: inHours(-12), owner: '山田 太郎' },
          { id: 'demo-doc-2',    name: '【デモ】月次レポート.pdf', mimeType: 'application/pdf',                     isFolder: false, modifiedTime: inHours(-24), owner: '田中 一郎' },
          { id: 'demo-doc-3',    name: '【デモ】KPI集計.xlsx',     mimeType: 'application/vnd.google-apps.spreadsheet', isFolder: false, modifiedTime: inHours(-6), owner: '高橋 由美' },
        ],
      }
    case 'drive/search':
      return {
        query: '',
        items: [
          { id: 'demo-doc-1', name: '【デモ】事業計画書.docx', mimeType: 'application/vnd.google-apps.document', isFolder: false, modifiedTime: inHours(-12), owner: '山田 太郎' },
          { id: 'demo-doc-2', name: '【デモ】月次レポート.pdf', mimeType: 'application/pdf', isFolder: false, modifiedTime: inHours(-24), owner: '田中 一郎' },
        ],
      }
    case 'drive/file':
      return {
        id: 'demo-doc-1',
        name: '【デモ】事業計画書',
        text: 'これはデモモードのサンプル文書です。\n実際の Google Drive とは連携していません。\n\n## 事業計画\n第1四半期は新規顧客獲得に注力する...',
      }
    case 'slack/notify':
      return { ok: true, demo: true, message: 'デモモードのため Slack 通知はスキップされました' }
    case 'noop':
    default:
      return { ok: true, demo: true }
  }
}

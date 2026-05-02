// ─────────────────────────────────────────────────────────────
// Demo モード用のモックレスポンス
// API ルートの先頭で if (isDemoMode()) return demoResponse(...)
// を追加することで、Google系/Slack系/Notion系の外部API呼び出しを
// ダミーデータで代替する。
// ─────────────────────────────────────────────────────────────

export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
    || process.env.DEMO_MODE === 'true'
}

export function demoResponse(kind) {
  const now = new Date()
  const todayIso = now.toISOString()
  const inHours = (h) => new Date(now.getTime() + h * 3600 * 1000).toISOString()

  switch (kind) {
    case 'gmail/threads':
      return {
        threads: [
          { id: 'demo-mail-1', snippet: 'デモ取引先様: 来月の発注について確認させてください', from: 'partner@example.com', subject: '【デモ】来月発注の件', timestamp: inHours(-2), unread: true },
          { id: 'demo-mail-2', snippet: '社内会議の議事録を共有します。ご確認ください。', from: 'yamada@example.demo', subject: '【デモ】定例議事録 5/1', timestamp: inHours(-6), unread: false },
          { id: 'demo-mail-3', snippet: '見積もりお送りします', from: 'vendor@example.com', subject: '【デモ】お見積り送付', timestamp: inHours(-25), unread: true },
        ],
      }
    case 'gmail/message':
      return {
        id: 'demo-mail-1',
        from: 'partner@example.com',
        to: 'guest@demo.local',
        subject: '【デモ】来月発注の件',
        body: 'これはデモモードのサンプルメールです。実際の Gmail とは連携していません。\n\n来月の発注内容についてご相談したく、ご都合の良い日程を教えてください。',
        timestamp: inHours(-2),
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

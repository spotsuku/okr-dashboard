// NEO運営の会議リスト
// 各会議ごとに3つの環境変数を設定して利用:
//   NOTION_API_KEY              (共通)
//   NOTION_<KEY>_DB_ID          (サーバーサイド: Notion DB ID)
//   NEXT_PUBLIC_<KEY>_URL       (クライアントサイド: DB公開URL)
//
// weeklyMTG 項目は WeeklyMTG ページのファシリ／一覧モードで使用:
//   scope       : 'teams-of' (指定事業部配下の全チーム) / 'all-teams' (全チーム合同)
//                 / 'all-departments' (全事業部合同)
//   parentLevelName : scope='teams-of' の時に使う事業部名（levels.name 完全一致）
//   flow        : 'ka' = KA重点フロー / 'kr' = KR重点フロー
//   withDiscussion : true の会議は KR 順送りの後に「課題・依頼事項」ステップを挟む
//   levelSelect / levelName / viewMode : 旧レガシーキー (一覧モード用に残置)

export const MEETINGS = [
  { key: 'morning',              title: '朝会',                              schedule: '平日毎日', icon: '🌅', color: '#ff9f43' },

  // ── KA重点会議：事業部配下の全チーム KA 順送り ────────
  { key: 'kickoff-partner',      title: '週次キックオフ（パートナー事業部）', schedule: '月曜',     icon: '🚀', color: '#4d9fff',
    weeklyMTG: { scope: 'teams-of', parentLevelName: 'パートナー事業部', flow: 'ka',
      levelName: 'パートナー事業部', viewMode: 'ka' } },
  { key: 'kickoff-youth',        title: '週次キックオフ（ユース事業部）',     schedule: '月曜',     icon: '🌱', color: '#ffd166',
    weeklyMTG: { scope: 'teams-of', parentLevelName: 'ユース事業部', flow: 'ka',
      levelName: 'ユース事業部', viewMode: 'ka' } },
  { key: 'kickoff-community',    title: '週次キックオフ（コミュニティ事業部）',schedule: '月曜',     icon: '🏛️', color: '#ff6b6b',
    weeklyMTG: { scope: 'teams-of', parentLevelName: 'コミュニティ事業部', flow: 'ka',
      levelName: 'コミュニティ事業部', viewMode: 'ka' } },

  // ── KR重点会議 ───────────────────────────────────────
  { key: 'sales',                title: '営業定例',                          schedule: '火曜',     icon: '💰', color: '#FF9500',
    weeklyMTG: { scope: 'specific-team', teamName: 'セールス', flow: 'sales',
      levelName: 'セールス', viewMode: 'ka' } },
  { key: 'manager',              title: 'マネージャー定例',                  schedule: '水曜',     icon: '👔', color: '#00d68f',
    weeklyMTG: { scope: 'all-teams', flow: 'kr', withDiscussion: true,
      levelSelect: 'department', viewMode: 'kr' } },
  { key: 'director',             title: 'ディレクター確認会議',              schedule: '金曜',     icon: '📊', color: '#a855f7',
    weeklyMTG: { scope: 'all-teams', flow: 'kr',
      levelName: null, viewMode: 'kr' } },
  { key: 'planning',             title: '経営企画会議',                      schedule: '木曜',     icon: '📋', color: '#ffd166',
    weeklyMTG: { scope: 'all-departments', flow: 'kr',
      levelName: null, viewMode: 'kr' } },
  // 役員会議は会議リストから非表示（ペンディング）
]

// クライアントサイドの URL ルックアップ
// （process.env.NEXT_PUBLIC_X は Next.js ビルド時に静的置換されるため、こう書く必要がある）
export const MEETING_URLS = {
  'morning':            process.env.NEXT_PUBLIC_MORNING_MEETING_URL,
  'kickoff-partner':    process.env.NEXT_PUBLIC_KICKOFF_PARTNER_URL,
  'kickoff-youth':      process.env.NEXT_PUBLIC_KICKOFF_YOUTH_URL,
  'kickoff-community':  process.env.NEXT_PUBLIC_KICKOFF_COMMUNITY_URL,
  // 営業定例は週次キックオフ（パートナー事業部）と同じ Notion DB を使う
  'sales':              process.env.NEXT_PUBLIC_KICKOFF_PARTNER_URL,
  'manager':            process.env.NEXT_PUBLIC_MANAGER_URL,
  'director':           process.env.NEXT_PUBLIC_DIRECTOR_URL,
  'planning':           process.env.NEXT_PUBLIC_PLANNING_URL,
}

// 営業定例 で表示する 営業ダッシュボードの URL
export const SALES_DASHBOARD_URL = 'https://sales-dashboard-jade-chi.vercel.app/dashboard'

// サーバーサイド: meetingKey から Notion DB ID を取得
export function getMeetingDbId(key) {
  const map = {
    'morning':            process.env.NOTION_MORNING_MEETING_DB_ID,
    'kickoff-partner':    process.env.NOTION_KICKOFF_PARTNER_DB_ID,
    'kickoff-youth':      process.env.NOTION_KICKOFF_YOUTH_DB_ID,
    'kickoff-community':  process.env.NOTION_KICKOFF_COMMUNITY_DB_ID,
    // 営業定例は週次キックオフ（パートナー事業部）と同じ Notion DB を使う
    'sales':              process.env.NOTION_KICKOFF_PARTNER_DB_ID,
    'manager':            process.env.NOTION_MANAGER_DB_ID,
    'director':           process.env.NOTION_DIRECTOR_DB_ID,
    'planning':           process.env.NOTION_PLANNING_DB_ID,
  }
  return map[key]
}

export function getMeeting(key) {
  return MEETINGS.find(m => m.key === key) || null
}

// WeeklyMTG で使える会議のみフィルタ (weeklyMTG 定義があるもの)
export const WEEKLY_MTG_MEETINGS = MEETINGS.filter(m => m.weeklyMTG)

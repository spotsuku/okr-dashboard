// NEO運営の会議リスト
// 各会議ごとに3つの環境変数を設定して利用:
//   NOTION_API_KEY              (共通)
//   NOTION_<KEY>_DB_ID          (サーバーサイド: Notion DB ID)
//   NEXT_PUBLIC_<KEY>_URL       (クライアントサイド: DB公開URL)
//
// weeklyMTG 項目は WeeklyMTG ページの会議別ビューで使用:
//   levelName: levels.name の完全一致でフィルタ (例: 'パートナー事業部')
//   levelSelect: 'department' = 事業部を選択してその配下、null = 固定
//   viewMode: 'kr' = KR重点、'ka' = KA重点、'both' = 両方表示

export const MEETINGS = [
  { key: 'morning',              title: '朝会',                              schedule: '平日毎日', icon: '🌅', color: '#ff9f43' },
  { key: 'kickoff-partner',      title: '週次キックオフ（パートナー事業部）', schedule: '月曜',     icon: '🚀', color: '#4d9fff',
    weeklyMTG: { levelName: 'パートナー事業部', viewMode: 'ka' } },
  { key: 'kickoff-youth',        title: '週次キックオフ（ユース事業部）',     schedule: '月曜',     icon: '🌱', color: '#ffd166',
    weeklyMTG: { levelName: 'ユース事業部', viewMode: 'ka' } },
  { key: 'kickoff-community',    title: '週次キックオフ（コミュニティ事業部）',schedule: '月曜',     icon: '🏛️', color: '#ff6b6b',
    weeklyMTG: { levelName: 'コミュニティ事業部', viewMode: 'ka' } },
  { key: 'manager',              title: 'マネージャー定例',                  schedule: '水曜',     icon: '👔', color: '#00d68f',
    weeklyMTG: { levelSelect: 'department', viewMode: 'kr' } },
  { key: 'director',             title: 'ディレクター確認会議',              schedule: '金曜',     icon: '📊', color: '#a855f7',
    weeklyMTG: { levelName: null, viewMode: 'kr' } },
  { key: 'executive',            title: '役員会議',                          schedule: '木曜',     icon: '🏛️', color: '#ff6b6b',
    weeklyMTG: { levelName: null, viewMode: 'kr' } },
  { key: 'planning',             title: '経営企画会議',                      schedule: '金曜',     icon: '📋', color: '#ffd166',
    weeklyMTG: { levelName: '経営企画部', viewMode: 'kr' } },
]

// クライアントサイドの URL ルックアップ
// （process.env.NEXT_PUBLIC_X は Next.js ビルド時に静的置換されるため、こう書く必要がある）
export const MEETING_URLS = {
  'morning':            process.env.NEXT_PUBLIC_MORNING_MEETING_URL,
  'kickoff-partner':    process.env.NEXT_PUBLIC_KICKOFF_PARTNER_URL,
  'kickoff-youth':      process.env.NEXT_PUBLIC_KICKOFF_YOUTH_URL,
  'kickoff-community':  process.env.NEXT_PUBLIC_KICKOFF_COMMUNITY_URL,
  'manager':            process.env.NEXT_PUBLIC_MANAGER_URL,
  'director':           process.env.NEXT_PUBLIC_DIRECTOR_URL,
  'executive':          process.env.NEXT_PUBLIC_EXECUTIVE_URL,
  'planning':           process.env.NEXT_PUBLIC_PLANNING_URL,
}

// サーバーサイド: meetingKey から Notion DB ID を取得
export function getMeetingDbId(key) {
  const map = {
    'morning':            process.env.NOTION_MORNING_MEETING_DB_ID,
    'kickoff-partner':    process.env.NOTION_KICKOFF_PARTNER_DB_ID,
    'kickoff-youth':      process.env.NOTION_KICKOFF_YOUTH_DB_ID,
    'kickoff-community':  process.env.NOTION_KICKOFF_COMMUNITY_DB_ID,
    'manager':            process.env.NOTION_MANAGER_DB_ID,
    'director':           process.env.NOTION_DIRECTOR_DB_ID,
    'executive':          process.env.NOTION_EXECUTIVE_DB_ID,
    'planning':           process.env.NOTION_PLANNING_DB_ID,
  }
  return map[key]
}

export function getMeeting(key) {
  return MEETINGS.find(m => m.key === key) || null
}

// WeeklyMTG で使える会議のみフィルタ (weeklyMTG 定義があるもの)
export const WEEKLY_MTG_MEETINGS = MEETINGS.filter(m => m.weeklyMTG)

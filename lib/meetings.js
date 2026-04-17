// NEO運営の会議リスト
// 各会議ごとに3つの環境変数を設定して利用:
//   NOTION_API_KEY              (共通)
//   NOTION_<KEY>_DB_ID          (サーバーサイド: Notion DB ID)
//   NEXT_PUBLIC_<KEY>_URL       (クライアントサイド: DB公開URL)

export const MEETINGS = [
  { key: 'morning',         title: '朝会',                 schedule: '平日毎日', icon: '🌅', color: '#ff9f43' },
  { key: 'weekly-kickoff',  title: '週次キックオフ',       schedule: '月曜',     icon: '🚀', color: '#4d9fff' },
  { key: 'manager',         title: 'マネージャー定例',     schedule: '水曜',     icon: '👔', color: '#00d68f' },
  { key: 'director',        title: 'ディレクター確認会議', schedule: '金曜',     icon: '📊', color: '#a855f7' },
  { key: 'executive',       title: '役員会議',             schedule: '木曜',     icon: '🏛️', color: '#ff6b6b' },
  { key: 'planning',        title: '経営企画会議',         schedule: '金曜',     icon: '📋', color: '#ffd166' },
]

// クライアントサイドの URL ルックアップ
// （process.env.NEXT_PUBLIC_X は Next.js ビルド時に静的置換されるため、こう書く必要がある）
export const MEETING_URLS = {
  'morning':         process.env.NEXT_PUBLIC_MORNING_MEETING_URL,
  'weekly-kickoff':  process.env.NEXT_PUBLIC_WEEKLY_KICKOFF_URL,
  'manager':         process.env.NEXT_PUBLIC_MANAGER_URL,
  'director':        process.env.NEXT_PUBLIC_DIRECTOR_URL,
  'executive':       process.env.NEXT_PUBLIC_EXECUTIVE_URL,
  'planning':        process.env.NEXT_PUBLIC_PLANNING_URL,
}

// サーバーサイド: meetingKey から Notion DB ID を取得
export function getMeetingDbId(key) {
  const map = {
    'morning':         process.env.NOTION_MORNING_MEETING_DB_ID,
    'weekly-kickoff':  process.env.NOTION_WEEKLY_KICKOFF_DB_ID,
    'manager':         process.env.NOTION_MANAGER_DB_ID,
    'director':        process.env.NOTION_DIRECTOR_DB_ID,
    'executive':       process.env.NOTION_EXECUTIVE_DB_ID,
    'planning':        process.env.NOTION_PLANNING_DB_ID,
  }
  return map[key]
}

export function getMeeting(key) {
  return MEETINGS.find(m => m.key === key) || null
}

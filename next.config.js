/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 14.2+: Router CacheのstaleTimeを0にして
    // ページ遷移時に常に最新コンポーネントを使用する
    staleTimes: {
      dynamic: 0,  // 動的ページのキャッシュ無効
      static: 0,   // 静的ページのキャッシュ無効
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        // JSバンドルファイルも明示的にno-cacheに
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
    ]
  },
}
module.exports = nextConfig

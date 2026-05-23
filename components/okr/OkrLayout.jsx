'use client'
// OKR 共通レイアウトシェル — 全4ビュー共通の枠。
//   [左サイドバー 240px (固定・全高) | 右カラム(ヘッダ → タブ → 本体)]
// 幅・サイドバーサイズ・フル幅化をここで一元管理する。
export default function OkrLayout({ T, sidebar, header, tabs, children, sidebarWidth = 240, contentPadding = '20px 24px 80px' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', width: '100%', background: T.bg, color: T.text, overflow: 'hidden' }}>
      {sidebar != null && (
        <div style={{ width: sidebarWidth, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: 'auto', background: T.bgSidebar }}>
          {sidebar}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {header != null && <div style={{ flexShrink: 0 }}>{header}</div>}
        {tabs != null && <div style={{ flexShrink: 0 }}>{tabs}</div>}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0, padding: contentPadding }}>
          {children}
        </div>
      </div>
    </div>
  )
}

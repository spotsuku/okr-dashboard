// components.jsx — shared UI primitives for the redesigned workspace
// Loaded via <script type="text/babel">. Exposes components on window so
// the screen files (also Babel scripts) can use them.

const { useState, useEffect, useRef, useMemo } = React;

/* ============================================================
   Icon — small line set
   ============================================================ */
const ICON_PATHS = {
  home:      'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  workspace: 'M4 6h16M4 12h16M4 18h10',
  target:    'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m0-4a5 5 0 1 1 0-10 5 5 0 0 1 0 10m0-3a2 2 0 1 1 0-4 2 2 0 0 1 0 4',
  calendar:  'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1m-1 5h16M9 3v4m6-4v4',
  morning:   'M12 4v2m0 12v2M4 12H2m20 0h-2M5.5 5.5 4 4m16 16-1.5-1.5M5.5 18.5 4 20m16-16-1.5 1.5M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10',
  org:       'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6m-6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6m12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6M9.5 9 7 13m7.5-4 2.5 4',
  search:    'M11 19a8 8 0 1 1 5.3-2L21 21M11 17a6 6 0 1 1 0-12 6 6 0 0 1 0 12',
  plus:      'M12 5v14M5 12h14',
  check:     'm5 12 5 5L20 7',
  circle:    'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18',
  half:      'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18M12 3v18',
  arrowRight:'M5 12h14m-6-6 6 6-6 6',
  arrowUp:   'M12 19V5m-6 6 6-6 6 6',
  external:  'M14 4h6v6m0-6L10 14M5 5h5m4 9v5H5V8h5',
  bolt:      'm13 3-9 12h7l-1 6 9-12h-7z',
  flag:      'M5 3v18m0-18 14 4-3 4 3 4-14 0',
  msg:       'M21 12a8 8 0 1 1-3.4-6.5L21 4l-.8 4.3A8 8 0 0 1 21 12',
  star:      'm12 4 2.5 5.5L20 10l-4 4 1 5.5-5-2.8-5 2.8 1-5.5-4-4 5.5-.5z',
  mail:      'M3 7h18v10H3zM3 7l9 7 9-7',
  clock:     'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m0-13v5l3 2',
  drive:     'M8 4h8l5 9-4 7H7L3 13z',
  link:      'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1m1 7a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  user:      'M12 13a4 4 0 1 1 0-8 4 4 0 0 1 0 8M4 21c0-4 4-7 8-7s8 3 8 7',
  settings:  'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6m7 3 1.7-1-1.7-3-1.9.6a7 7 0 0 0-1.7-1L15 5h-6l-.4 2.6a7 7 0 0 0-1.7 1L5 8l-1.7 3 1.7 1L5 14l-1.7 1 1.7 3 1.9-.6a7 7 0 0 0 1.7 1L9 21h6l.4-2.6a7 7 0 0 0 1.7-1l1.9.6 1.7-3-1.7-1z',
  bell:      'M6 16V10a6 6 0 1 1 12 0v6l2 2H4zM10 21h4',
  ai:        'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6 7.7 7.7m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8',
  cmd:       'M9 6a3 3 0 1 1-3 3h12a3 3 0 1 1-3 3V6m0 12a3 3 0 1 1-3-3V9a3 3 0 1 1 3-3',
  more:      'M6 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0m7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0m7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  filter:    'M4 5h16l-6 8v6l-4-2v-4z',
  chevronR:  'm9 6 6 6-6 6',
  chevronD:  'm6 9 6 6 6-6',
  inbox:     'M3 13h6l1 2h4l1-2h6m-18 0V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v7m-18 0v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5',
  building:  'M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M3 21h18M10 8h1M10 12h1M10 16h1M14 8h1M14 12h1M14 16h1',
  rocket:    'M5 19c0-3 1-6 4-9l5-5a8 8 0 0 1 5-2 8 8 0 0 1-2 5l-5 5c-3 3-6 4-9 4zm5-9a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  refresh:   'M3 12a9 9 0 0 1 15-6.7L21 8m0-5v5h-5m4 5a9 9 0 0 1-15 6.7L3 17m0 5v-5h5',
  trash:     'M5 7h14M10 11v6m4-6v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
  pencil:    'm4 20 1-4L17 4l3 3L8 19zM14 7l3 3',
};
function Icon({ name, size = 16, stroke = 1.6, className = '', style = {} }) {
  const d = ICON_PATHS[name] || '';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke}
         strokeLinecap="round" strokeLinejoin="round"
         className={className} style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ============================================================
   Avatar — initials with deterministic color from name
   ============================================================ */
const AVATAR_COLORS = [
  '#a78bfa', '#60a5fa', '#34d399', '#f59e0b', '#f472b6',
  '#22d3ee', '#fb7185', '#84cc16', '#f97316', '#818cf8',
];
function hash(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function Avatar({ name = '?', size = 24, ring = false }) {
  const ch = (String(name).trim()[0] || '?');
  const color = AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
      background: color, color: '#fff',
      fontSize: Math.max(10, size * 0.42), fontWeight: 600, letterSpacing: 0,
      flexShrink: 0,
      boxShadow: ring ? '0 0 0 2px var(--card)' : 'none',
    }}>{ch}</div>
  );
}

/* ============================================================
   Pill / Tag
   ============================================================ */
const TONE_BG = { neutral: 'var(--sunken)', accent: 'var(--accent-soft)', success: 'var(--success-soft)', warn: 'var(--warn-soft)', danger: 'var(--danger-soft)', info: 'var(--info-soft)' };
const TONE_FG = { neutral: 'var(--sub)',    accent: 'var(--accent-text)', success: 'var(--success)',   warn: 'var(--warn)',     danger: 'var(--danger)',     info: 'var(--info)' };
function Pill({ children, tone = 'neutral', dot = false, style = {} }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 99,
      background: TONE_BG[tone], color: TONE_FG[tone],
      fontSize: 11, fontWeight: 500, lineHeight: 1.4,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor' }} />}
      {children}
    </span>
  );
}

/* ============================================================
   ProgressBar — color hops by ratio
   ============================================================ */
function ProgressBar({ value = 0, max = 100, height = 4, showLabel = false }) {
  const pct = Math.max(0, Math.min(150, max ? (value / max) * 100 : 0));
  const color = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : pct >= 30 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height, background: 'var(--sunken)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: Math.min(100, pct) + '%', height: '100%', background: color, transition: 'width .3s' }} />
      </div>
      {showLabel && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', minWidth: 32, textAlign: 'right' }}>{Math.round(pct)}%</span>}
    </div>
  );
}

/* ============================================================
   StatusBadge — focus / good / more / done
   ============================================================ */
const STATUS = {
  focus: { tone: 'accent',  label: 'Focus', mark: '◎' },
  good:  { tone: 'success', label: 'Good',  mark: '✓' },
  more:  { tone: 'warn',    label: 'More',  mark: '▲' },
  done:  { tone: 'neutral', label: 'Done',  mark: '✓' },
  none:  { tone: 'neutral', label: '—',     mark: '—' },
};
function StatusBadge({ status = 'none', size = 'sm' }) {
  const s = STATUS[status] || STATUS.none;
  return <Pill tone={s.tone}>{s.mark}<span style={{ marginLeft: 2 }}>{s.label}</span></Pill>;
}

/* ============================================================
   Card — refined container (no left-border accents)
   ============================================================ */
function Card({ children, padding = 16, style = {}, hover = false, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding, cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color .12s, box-shadow .12s, transform .12s',
      ...style,
    }}
      onMouseEnter={hover ? (e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,.04)'; } : undefined}
      onMouseLeave={hover ? (e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; } : undefined}
    >{children}</div>
  );
}

/* ============================================================
   Section header — caption + optional action
   ============================================================ */
function SectionHeader({ caption, title, action, style = {} }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {caption && <div className="t-caption">{caption}</div>}
        {title && <div className="t-title3" style={{ color: 'var(--text)' }}>{title}</div>}
      </div>
      {action}
    </div>
  );
}

/* ============================================================
   Button
   ============================================================ */
function Button({ children, variant = 'secondary', size = 'md', icon, iconRight, onClick, style = {} }) {
  const pad = size === 'sm' ? '4px 10px' : size === 'lg' ? '10px 18px' : '6px 12px';
  const fz = size === 'sm' ? 11 : size === 'lg' ? 14 : 12;
  const styles = {
    primary:   { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' },
    secondary: { background: 'var(--card)',   color: 'var(--text)', border: '1px solid var(--border-strong)' },
    ghost:     { background: 'transparent',   color: 'var(--sub)',  border: '1px solid transparent' },
    soft:      { background: 'var(--accent-soft)', color: 'var(--accent-text)', border: '1px solid transparent' },
    danger:    { background: 'var(--danger)', color: '#fff', border: '1px solid var(--danger)' },
  }[variant];
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, fontSize: fz, fontWeight: 500,
      borderRadius: 8, letterSpacing: 0,
      transition: 'background .12s, border-color .12s',
      ...styles, ...style,
    }}>
      {icon && <Icon name={icon} size={fz + 2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={fz + 2} />}
    </button>
  );
}

/* ============================================================
   Kbd
   ============================================================ */
function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', minWidth: 18, height: 18,
      padding: '0 5px', fontSize: 10.5, fontWeight: 600, color: 'var(--muted)',
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 4,
      fontFamily: 'ui-monospace, monospace',
    }}>{children}</span>
  );
}

/* ============================================================
   Sidebar (Slack-style org icon bar, 56px, dark)
   ============================================================ */
function Sidebar({ activeOrg = 'N' }) {
  const orgs = [
    { id: 'neo', label: 'N', active: true, name: 'NEO 運営DB' },
    { id: 'spt', label: 'S', name: 'スポーツ事業' },
    { id: 'edu', label: 'E', name: 'エデュケーション' },
  ];
  return (
    <aside style={{
      width: 56, flexShrink: 0, height: '100%',
      background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '12px 0',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {orgs.map((o, i) => (
          <div key={o.id} style={{
            position: 'relative', width: 36, height: 36, borderRadius: 10,
            background: o.active ? 'var(--accent)' : 'rgba(255,255,255,.08)',
            color: o.active ? '#fff' : 'var(--sidebar-text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
            transition: 'background .12s',
          }}>
            {o.active && <div style={{
              position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)',
              width: 3, height: 18, borderRadius: 99, background: '#fff',
            }} />}
            {o.label}
          </div>
        ))}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          border: '1px dashed rgba(255,255,255,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,.4)', cursor: 'pointer',
        }}><Icon name="plus" size={14} /></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,.5)', cursor: 'pointer',
        }}><Icon name="settings" size={16} /></div>
      </div>
    </aside>
  );
}

/* ============================================================
   Header — top app bar
   ============================================================ */
function Header({ active = 'workspace' }) {
  const items = [
    { id: 'portal',    label: 'ホーム',     icon: 'home' },
    { id: 'workspace', label: 'ワークスペース', icon: 'workspace' },
    { id: 'okr',       label: 'OKR',        icon: 'target' },
    { id: 'weekly',    label: '週次MTG',    icon: 'calendar' },
    { id: 'morning',   label: '朝会',       icon: 'morning' },
    { id: 'org',       label: '組織',       icon: 'org' },
  ];
  return (
    <header style={{
      height: 56, flexShrink: 0, paddingLeft: 20, paddingRight: 20,
      borderBottom: '1px solid var(--border)', background: 'var(--card)',
      display: 'flex', alignItems: 'center', gap: 24,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 10, borderRight: '1px solid var(--border)', height: 36 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--card)', fontSize: 12, fontWeight: 700 }}>N</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.08em' }}>NEO MANAGEMENT</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>NEO 運営DB</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {items.map(it => {
          const a = it.id === active;
          return (
            <div key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 8,
              background: a ? 'var(--bg-soft)' : 'transparent',
              color: a ? 'var(--text)' : 'var(--sub)',
              fontSize: 12.5, fontWeight: a ? 600 : 500,
              cursor: 'pointer',
            }}>
              <Icon name={it.icon} size={14} />
              {it.label}
            </div>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Global search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: 32, padding: '0 10px', minWidth: 200,
        background: 'var(--bg-soft)', border: '1px solid var(--border)',
        borderRadius: 8, color: 'var(--muted)', fontSize: 12,
      }}>
        <Icon name="search" size={14} />
        <span>検索 …</span>
        <div style={{ flex: 1 }} />
        <Kbd>⌘</Kbd><Kbd>K</Kbd>
      </div>

      {/* Year */}
      <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-soft)' }}>
        <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--muted)' }}>2025年度</div>
        <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text)', background: 'var(--card)', borderLeft: '1px solid var(--border)' }}>2026年度</div>
      </div>

      {/* AI */}
      <button style={{
        width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
        background: 'var(--card)', color: 'var(--sub)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}><Icon name="ai" size={15} /></button>

      {/* User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Avatar name="三木智弘" size={28} />
      </div>
    </header>
  );
}

/* ============================================================
   AppShell — frame with sidebar + header + main slot
   ============================================================ */
function AppShell({ theme = 'indigo', activeNav, children }) {
  return (
    <div className="app-frame" data-theme={theme}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header active={activeNav} />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   QuickAddBar — persistent task capture (Workspace key feature)
   ============================================================ */
function QuickAddBar({ compact = false, style = {} }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: compact ? '6px 10px' : '10px 14px',
      ...style,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        background: 'var(--accent-soft)', color: 'var(--accent-text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="plus" size={14} stroke={2} />
      </div>
      <span style={{ color: 'var(--muted)', fontSize: 13 }}>
        タスクを追加 — 例: 「明日 提案書をクライアントに送る」
      </span>
      <div style={{ flex: 1 }} />
      <Pill tone="neutral" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}>
        <Icon name="calendar" size={11} /> 今日
      </Pill>
      <Pill tone="neutral" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}>
        <Icon name="target" size={11} /> KR紐付け
      </Pill>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontSize: 11 }}>
        <Kbd>T</Kbd>
      </div>
    </div>
  );
}

/* ============================================================
   Expose
   ============================================================ */
Object.assign(window, {
  Icon, Avatar, Pill, ProgressBar, StatusBadge, Card, SectionHeader, Button, Kbd,
  Sidebar, Header, AppShell, QuickAddBar,
});

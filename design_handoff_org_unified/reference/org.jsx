// screens/org.jsx — 組織ページのリデザイン（Glass トンマナ統一 + オンボーディング）
// 6 サブタブ: 組織図 / 工数管理 / 業務一覧 / 業務マニュアル / メンバーJD / ユーザー管理
// 重要 UX: 初回ログインユーザーが「次に何をすればいいか」迷わないこと

function OrgPage({ initialTab = 'orgchart', showOnboarding = true }) {
  const [tab, setTab] = React.useState(initialTab);
  const [onboarding, setOnboarding] = React.useState(showOnboarding);
  return (
    <div data-theme="glass" style={{
      width: '100%', minHeight: '100%',
      fontFamily: '"Inter", "Noto Sans JP", system-ui, sans-serif',
      color: 'var(--text)', fontFeatureSettings: '"palt" 1',
      background:
        'radial-gradient(900px 600px at 0% 0%, rgba(226,232,240,.5), transparent 55%),' +
        'linear-gradient(180deg, #fbfcfe 0%, #f5f7fa 100%)',
    }}>
      <OrgHeader />
      <div style={{ padding: '0 28px 80px', maxWidth: 1400, margin: '0 auto' }}>
        <OrgTitleStrip />
        {onboarding && <OnboardingChecklist onTabChange={setTab} onDismiss={() => setOnboarding(false)} />}
        <OrgTabs value={tab} onChange={setTab} />
        <div style={{ marginTop: 20 }}>
          {tab === 'orgchart' && <OrgChartTab />}
          {tab === 'capacity' && <CapacityTab />}
          {tab === 'tasks'    && <TasksTab />}
          {tab === 'manual'   && <ManualTab />}
          {tab === 'jd'       && <MemberJDTab />}
          {tab === 'users'    && <UsersTab />}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ヘッダ（LP / 他ページと統一）
   ============================================================ */
function OrgHeader() {
  return (
    <header style={{
      padding: '14px 28px',
      display: 'flex', alignItems: 'center', gap: 14,
      borderBottom: '1px solid rgba(15,23,42,.06)',
      background: 'rgba(255,255,255,.7)',
      backdropFilter: 'blur(18px) saturate(160%)',
      position: 'sticky', top: 0, zIndex: 30,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #2563eb, #22d3ee)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.08em' }}>AI WORKSPACE</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>テスト組織</span>
        </div>
      </div>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 18 }}>
        {[
          { id: 'home', label: 'ホーム', icon: 'home' },
          { id: 'ws',   label: 'ワークスペース', icon: 'workspace' },
          { id: 'okr',  label: 'OKR', icon: 'target' },
          { id: 'mtg',  label: '週次MTG', icon: 'calendar' },
          { id: 'morn', label: '朝会', icon: 'morning' },
          { id: 'org',  label: '組織', icon: 'org', active: true },
        ].map(it => (
          <div key={it.id} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, fontSize: 12.5,
            fontWeight: it.active ? 600 : 500,
            color: it.active ? 'var(--accent-text)' : 'var(--sub)',
            background: it.active ? 'var(--accent-soft)' : 'transparent',
            cursor: 'pointer',
          }}>
            <Icon name={it.icon} size={13} />
            {it.label}
          </div>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: 32, padding: '0 12px', minWidth: 220,
        background: 'rgba(255,255,255,.6)', border: '1px solid var(--border)',
        borderRadius: 8, color: 'var(--muted)', fontSize: 12,
      }}>
        <Icon name="search" size={13} /> 検索…
        <span style={{ flex: 1 }} />
        <Kbd>⌘K</Kbd>
      </div>
      <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,.5)' }}>
        <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--muted)' }}>2025年度</div>
        <div style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: 'linear-gradient(120deg,#2563eb,#22d3ee)', color: '#fff' }}>2026年度</div>
      </div>
    </header>
  );
}

/* ============================================================
   タイトル + コンテキストアクション
   ============================================================ */
function OrgTitleStrip() {
  return (
    <div style={{ padding: '24px 0 16px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(37,99,235,.12), rgba(34,211,238,.12))',
        border: '1px solid rgba(37,99,235,.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name="building" size={28} style={{ color: 'var(--accent-text)' }} />
      </div>
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 4px' }}>組織</h1>
        <div style={{ fontSize: 12.5, color: 'var(--sub)', marginBottom: 8 }}>
          2026年度 · 組織図 · 業務一覧 · 業務マニュアル · メンバー別 JD
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--success)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--success)', boxShadow: '0 0 0 3px rgba(5,150,105,.15)' }} />
          リアルタイム同期中
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, background: 'var(--warn-soft)', color: 'var(--warn)', border: '1px solid rgba(217,119,6,.25)', borderRadius: 99 }}>
          管理者
        </span>
        <button style={btnGhost()}><Icon name="settings" size={13} /> プログラム管理</button>
        <button style={btnPrimary()}><Icon name="building" size={13} /> 組織を管理</button>
      </div>
    </div>
  );
}

function btnPrimary() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', fontSize: 12.5, fontWeight: 600,
    background: 'linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)',
    color: '#fff', border: '1px solid #2563eb',
    borderRadius: 8, cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(37,99,235,.28), inset 0 1px 0 rgba(255,255,255,.25)',
  };
}
function btnGhost() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', fontSize: 12.5, fontWeight: 500,
    background: 'rgba(255,255,255,.7)', color: 'var(--text)',
    border: '1px solid rgba(15,23,42,.1)', borderRadius: 8, cursor: 'pointer',
    backdropFilter: 'blur(8px)',
  };
}

/* ============================================================
   オンボーディングチェックリスト（初回ユーザー向け）
   ============================================================ */
function OnboardingChecklist({ onTabChange, onDismiss }) {
  const steps = [
    { id: 'members', tab: 'users',    title: 'メンバーを招待', desc: 'Slack User ID を同期して、チームメンバーを揃えましょう', done: true,  count: '15人' },
    { id: 'chart',   tab: 'orgchart', title: '組織図を作る',   desc: '事業部・チーム・責任者を設定。Slack 通知の宛先にもなります', done: true,  count: '4事業部' },
    { id: 'jd',      tab: 'jd',       title: 'メンバー JD を入力', desc: '誰が何を担当しているかを明示すると、業務一覧が自動補完されます', done: false, count: '0/15' },
    { id: 'tasks',   tab: 'tasks',    title: '業務一覧を整理', desc: 'チームごとの業務を入力すると、工数管理が使えるようになります', done: false, count: '0件' },
    { id: 'manual',  tab: 'manual',   title: '業務マニュアル', desc: '新メンバーが入ったときの「迷い」を減らします', done: false, count: '未着手' },
  ];
  const doneCount = steps.filter(s => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const nextStep = steps.find(s => !s.done);
  return (
    <div style={{
      marginTop: 8, marginBottom: 16,
      background: 'rgba(255,255,255,.78)',
      backdropFilter: 'blur(20px) saturate(160%)',
      border: '1px solid rgba(15,23,42,.06)',
      borderRadius: 16,
      boxShadow: '0 4px 18px rgba(15,23,42,.05), 0 1px 0 rgba(255,255,255,.7) inset',
      overflow: 'hidden',
    }}>
      {/* ヘッダ */}
      <div style={{
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(120deg, rgba(37,99,235,.08), rgba(34,211,238,.08))',
        borderBottom: '1px solid rgba(15,23,42,.06)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #2563eb, #22d3ee)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(37,99,235,.3)',
        }}>
          <Icon name="rocket" size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>組織のセットアップ</span>
            <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>{doneCount} / {steps.length} 完了</span>
          </div>
          <div style={{ marginTop: 4, height: 4, background: 'rgba(15,23,42,.06)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg, #2563eb, #22d3ee)', transition: 'width .3s' }} />
          </div>
        </div>
        {nextStep && (
          <button onClick={() => onTabChange(nextStep.tab)} style={btnPrimary()}>
            次は「{nextStep.title}」へ <Icon name="arrowRight" size={12} stroke={2.4} />
          </button>
        )}
        <button onClick={onDismiss} style={{
          padding: 6, background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: 14,
        }} aria-label="閉じる">✕</button>
      </div>
      {/* ステップグリッド */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: 'rgba(15,23,42,.06)' }}>
        {steps.map((s, i) => (
          <button key={s.id} onClick={() => onTabChange(s.tab)} style={{
            padding: '14px 14px 12px',
            background: '#fff',
            border: 'none', cursor: 'pointer',
            textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6,
            fontFamily: 'inherit',
            position: 'relative',
            transition: 'background .12s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,.04)'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 99,
                background: s.done ? 'var(--success)' : 'transparent',
                border: s.done ? '1.5px solid var(--success)' : '1.5px dashed rgba(15,23,42,.2)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {s.done && <Icon name="check" size={11} stroke={3} />}
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>
                STEP {i + 1}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: s.done ? 'var(--success)' : 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                {s.count}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.title}</div>
            <div style={{ fontSize: 11, color: 'var(--sub)', lineHeight: 1.5 }}>{s.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   サブタブ（統一スタイル）
   ============================================================ */
function OrgTabs({ value, onChange }) {
  const tabs = [
    { id: 'orgchart', label: '組織図',     icon: 'building' },
    { id: 'capacity', label: '工数管理',   icon: 'chart' },
    { id: 'tasks',    label: '業務一覧',   icon: 'check' },
    { id: 'manual',   label: '業務マニュアル', icon: 'refresh' },
    { id: 'jd',       label: 'メンバーJD', icon: 'user' },
    { id: 'users',    label: 'ユーザー管理', icon: 'org' },
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: 4,
      background: 'rgba(255,255,255,.55)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(15,23,42,.06)',
      borderRadius: 12,
      width: 'fit-content',
    }}>
      {tabs.map(t => {
        const active = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', fontSize: 12.5, fontWeight: active ? 600 : 500,
            color: active ? 'var(--accent-text)' : 'var(--sub)',
            background: active ? '#fff' : 'transparent',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: active ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
            transition: 'background .12s, color .12s',
          }}>
            <Icon name={t.icon} size={13} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   組織図タブ — Glass トーンの department カード
   ============================================================ */
function OrgChartTab() {
  const depts = [
    {
      name: 'パートナー事業部', icon: 'rocket', accent: '#2563eb',
      slack: true,
      teams: [
        { name: 'セールス', desc: 'NEO九州未来評議会の企画とセールス。運営準備や当日運営はイベントチームと連携する。', members: ['三木智弘', '三木浩江', '元美和'], lead: '三木智弘' },
        { name: 'CS', desc: 'NEO アカデミア参加企業が活用方針とゴールを達成できるように伴走する', members: ['三木智弘', '森朝香', '古野絢太', '鬼木良輔'], lead: '三木智弘' },
      ],
    },
    {
      name: 'ユース事業部', icon: 'bolt', accent: '#d97706',
      slack: true,
      teams: [
        { name: 'コンテンツ', desc: 'SNS・web・紙媒体までユース向けのコンテンツを製作', members: ['國武麻友子', '増田雄太朗'], lead: '國武麻友子' },
        { name: '集客', desc: 'ユースの母集団形成、アカデミア応募までを一気通貫で担う', members: ['三木浩江', '森朝香'], lead: '三木浩江' },
        { name: '団体連携', desc: 'ユース募集のための各種団体との連携', members: ['三木浩江', '元美和'], lead: null },
      ],
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {depts.map((d, i) => <DeptCard key={i} {...d} />)}
      <AddDeptCTA />
    </div>
  );
}

function DeptCard({ name, icon, accent, slack, teams }) {
  return (
    <div style={glassCard({ padding: 0, overflow: 'hidden' })}>
      <div style={{
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: `linear-gradient(120deg, ${accent}15, transparent)`,
        borderBottom: '1px solid rgba(15,23,42,.06)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `linear-gradient(135deg, ${accent}, ${accent}88)`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 2px 8px ${accent}40`,
        }}>
          <Icon name={icon} size={18} stroke={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{teams.length} チーム</div>
        </div>
        {slack && (
          <span style={{
            padding: '3px 10px', fontSize: 11, fontWeight: 600,
            background: 'var(--success-soft)', color: 'var(--success)',
            border: '1px solid rgba(5,150,105,.2)', borderRadius: 99,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <Icon name="link" size={10} /> Slack 設定済み
          </span>
        )}
      </div>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {teams.map((t, i) => <TeamCard key={i} accent={accent} {...t} />)}
        <AddTeamCard />
      </div>
    </div>
  );
}

function TeamCard({ name, desc, members, lead, accent }) {
  return (
    <div style={{
      padding: 14,
      background: '#fff',
      border: '1px solid rgba(15,23,42,.06)',
      borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{name}</span>
        <span style={{ flex: 1 }} />
        <span style={{
          padding: '2px 8px', fontSize: 10, fontWeight: 600,
          background: 'var(--success-soft)', color: 'var(--success)',
          border: '1px solid rgba(5,150,105,.2)', borderRadius: 99,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 99, background: 'var(--success)' }} />
          現役
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--sub)', lineHeight: 1.55, minHeight: 36 }}>{desc}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {members.map((m, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px 3px 4px',
            background: 'rgba(15,23,42,.04)', border: '1px solid rgba(15,23,42,.06)',
            borderRadius: 6, fontSize: 11,
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: 4,
              background: `linear-gradient(135deg, ${accent}, ${accent}88)`,
              color: '#fff', fontSize: 9, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{m[0]}</span>
            {m}
          </span>
        ))}
      </div>
      <div style={{ paddingTop: 10, borderTop: '1px dashed rgba(15,23,42,.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="flag" size={11} style={{ color: 'var(--muted)' }} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>責任者</span>
        {lead ? (
          <span style={{
            padding: '2px 8px 2px 4px',
            background: 'var(--accent-soft)', borderRadius: 6,
            fontSize: 11, fontWeight: 500, color: 'var(--accent-text)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--accent)', color: '#fff', fontSize: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{lead[0]}</span>
            {lead}
          </span>
        ) : (
          <span style={{
            padding: '2px 8px', fontSize: 11, color: 'var(--warn)',
            background: 'var(--warn-soft)', borderRadius: 6,
            border: '1px dashed rgba(217,119,6,.4)',
          }}>未設定 — クリックして指定</span>
        )}
        <span style={{ flex: 1 }} />
        <button style={{
          padding: '3px 8px', fontSize: 11, color: 'var(--sub)',
          background: 'transparent', border: '1px solid rgba(15,23,42,.08)',
          borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
        }}>編集</button>
      </div>
    </div>
  );
}

function AddTeamCard() {
  return (
    <button style={{
      padding: 14,
      background: 'transparent', border: '1.5px dashed rgba(15,23,42,.15)',
      borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
      minHeight: 160,
      color: 'var(--muted)',
    }}>
      <Icon name="plus" size={18} />
      <span style={{ fontSize: 12, fontWeight: 500 }}>チームを追加</span>
    </button>
  );
}

function AddDeptCTA() {
  return (
    <button style={{
      padding: '18px 24px',
      background: 'rgba(255,255,255,.5)',
      border: '1.5px dashed rgba(37,99,235,.3)',
      borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      color: 'var(--accent-text)',
      fontSize: 13, fontWeight: 600,
    }}>
      <Icon name="plus" size={14} stroke={2.4} />
      事業部を追加する
    </button>
  );
}

function glassCard(extra = {}) {
  return {
    background: 'rgba(255,255,255,.78)',
    backdropFilter: 'blur(20px) saturate(160%)',
    border: '1px solid rgba(15,23,42,.06)',
    borderRadius: 14,
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 4px 14px rgba(15,23,42,.04)',
    padding: 16,
    ...extra,
  };
}

/* ============================================================
   工数管理タブ — 担当可視化 / 数値記入の 2 モード（色設計を整える）
   ============================================================ */
function CapacityTab() {
  const [mode, setMode] = React.useState('visual'); // 'visual' | 'numeric'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          display: 'inline-flex', padding: 3,
          background: 'rgba(255,255,255,.6)', border: '1px solid var(--border)',
          borderRadius: 9,
        }}>
          {[
            { id: 'visual',  label: '担当可視化', icon: 'team' },
            { id: 'numeric', label: '数値記入',   icon: 'pencil' },
          ].map(o => {
            const a = mode === o.id;
            return (
              <button key={o.id} onClick={() => setMode(o.id)} style={{
                padding: '6px 12px', fontSize: 12, fontWeight: a ? 600 : 500,
                background: a ? '#fff' : 'transparent',
                color: a ? 'var(--text)' : 'var(--sub)',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                boxShadow: a ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
              }}>
                <Icon name={o.icon} size={12} />
                {o.label}
              </button>
            );
          })}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--success)' }} />
          経営ダッシュボード同期済 (23:38)
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>単位: 人月 (1.0 = フルタイム1人月)</span>
      </div>

      {/* 役割色凡例 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '8px 14px', background: 'rgba(255,255,255,.4)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.06em' }}>役割色</span>
        {[
          { l: '営業', c: '#ef4444' },
          { l: '運営', c: '#2563eb' },
          { l: 'CS',   c: '#10b981' },
          { l: '企画', c: '#f59e0b' },
          { l: '総務', c: '#8b5cf6' },
          { l: 'PR',   c: '#ec4899' },
        ].map((r, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--sub)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: r.c }} />
            {r.l}
          </span>
        ))}
      </div>

      {mode === 'visual' ? <CapacityVisual /> : <CapacityNumeric />}
    </div>
  );
}

function CapacityVisual() {
  const programs = [
    {
      name: 'NEO アカデミア', pct: 89, used: 10.2, total: 11.5,
      members: [
        { n: '森朝香',     total: 80, roles: [{ l: '運営', v: 50, c: '#2563eb' }, { l: 'CS', v: 30, c: '#10b981' }] },
        { n: '國武麻友子', total: 60, roles: [{ l: '運営', v: 50, c: '#2563eb' }, { l: 'PR', v: 10, c: '#ec4899' }] },
        { n: '古野絢太',   total: 50, roles: [{ l: 'CS',   v: 50, c: '#10b981' }] },
      ],
    },
    {
      name: 'イベント', pct: 52, used: 4.9, total: 9.5,
      members: [
        { n: '國武麻友子', total: 40, roles: [{ l: '運営', v: 30, c: '#2563eb' }, { l: 'PR', v: 10, c: '#ec4899' }] },
        { n: '面川文香',   total: 40, roles: [{ l: '運営', v: 30, c: '#2563eb' }, { l: '総務', v: 10, c: '#8b5cf6' }] },
        { n: '中道稔',     total: 30, roles: [{ l: '運営', v: 30, c: '#2563eb' }] },
      ],
    },
    {
      name: '研修', pct: 95, used: 8.1, total: 8.5,
      members: [
        { n: '中道稔',       total: 70, roles: [{ l: '営業', v: 50, c: '#ef4444' }, { l: '運営', v: 20, c: '#2563eb' }] },
        { n: '増田雄太朗',   total: 50, roles: [{ l: '営業', v: 50, c: '#ef4444' }] },
        { n: '三木智弘',     total: 40, roles: [{ l: '営業', v: 30, c: '#ef4444' }, { l: '企画', v: 10, c: '#f59e0b' }] },
      ],
    },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {programs.map((p, i) => (
        <div key={i} style={glassCard({ padding: 16 })}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
            <span style={{
              fontSize: 18, fontWeight: 700,
              color: p.pct >= 100 ? 'var(--danger)' : p.pct >= 80 ? 'var(--success)' : 'var(--warn)',
              fontFamily: 'ui-monospace, monospace',
            }}>{p.pct}% <span style={{ fontSize: 11, color: 'var(--muted)' }}>({p.used}/{p.total})</span></span>
          </div>
          {p.members.map((m, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: j < p.members.length - 1 ? '1px solid rgba(15,23,42,.05)' : 'none' }}>
              <div style={{
                width: 30, height: 30, borderRadius: 99,
                background: m.roles[0].c, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{m.n[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{m.n}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>合計 {m.total}%</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {m.roles.map((r, k) => (
                    <span key={k} style={{
                      padding: '1px 6px', fontSize: 9.5, fontWeight: 600,
                      background: r.c + '20', color: r.c,
                      borderRadius: 4,
                    }}>{r.l} {r.v}%</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CapacityNumeric() {
  const members = [
    { n: '三木智弘', total: 100, cells: [0, 0, 10, 10, 0, 0, 0, 0, 0, 10, 0, 0, 30, 0] },
    { n: '三木浩江', total: 100, cells: [30, 0, 0, 0, 0, 10, 20, 0, 0, 0, 0, 0, 40, 0] },
    { n: '森朝香',   total: 100, cells: [0, 50, 30, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 10] },
    { n: '古野絢太', total: 90,  cells: [0, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10] },
  ];
  const programs = ['NEOアカデミア', 'イベント'];
  const roles = ['営業', '運営', 'CS', '企画', '総務', 'PR'];
  return (
    <div style={glassCard({ padding: 0, overflow: 'hidden' })}>
      <div style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: 'rgba(15,23,42,.03)' }}>
              <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--sub)', borderRight: '1px solid rgba(15,23,42,.06)', position: 'sticky', left: 0, background: '#fff', minWidth: 180 }}>メンバー</th>
              {programs.map(p => (
                <th key={p} colSpan={roles.length} style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text)', borderRight: '1px solid rgba(15,23,42,.06)' }}>{p}</th>
              ))}
            </tr>
            <tr style={{ background: 'rgba(15,23,42,.02)' }}>
              <th style={{ padding: '6px 14px', position: 'sticky', left: 0, background: '#fff' }}></th>
              {programs.flatMap((_, pi) => roles.map((r, ri) => (
                <th key={`${pi}-${ri}`} style={{ padding: '6px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', borderRight: ri === roles.length - 1 ? '1px solid rgba(15,23,42,.06)' : 'none' }}>{r}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(15,23,42,.05)' }}>
                <td style={{ padding: '10px 14px', position: 'sticky', left: 0, background: '#fff', borderRight: '1px solid rgba(15,23,42,.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{m.n}</span>
                    <span style={{
                      padding: '1px 7px', fontSize: 10, fontWeight: 600,
                      background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 99,
                    }}>合計 {m.total}%</span>
                  </div>
                </td>
                {m.cells.map((c, j) => (
                  <td key={j} style={{
                    padding: '8px 6px', textAlign: 'center', fontFamily: 'ui-monospace, monospace',
                    fontSize: 11, color: c === 0 ? 'var(--muted)' : 'var(--text)',
                    background: c >= 30 ? 'rgba(37,99,235,.08)' : c > 0 ? 'rgba(37,99,235,.04)' : 'transparent',
                    fontWeight: c > 0 ? 600 : 400,
                  }}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   業務一覧タブ
   ============================================================ */
function TasksTab() {
  const tasks = [
    { lead: '元美和',   text: 'NEO九州未来評議会の当日運営をイベントチームと連携', support: ['元美和', '中道稔'], note: 1 },
    { lead: '古野絢太', text: '「NEO合同AI研修」の事業企画・改善', support: ['三木智弘'] },
    { lead: '元美和',   text: '参加企業フォローアップ・ゲスト登壇者対応', support: [] },
    { lead: '古野絢太', text: 'NEO合同AI研修の営業企画・セールス', support: ['中道稔'] },
    { lead: '元美和',   text: '新規参加候補リスト作成', support: ['三木浩江'] },
    { lead: '古野絢太', text: 'AI研修の参加者満足度向上のフォローアップ', support: [] },
    { lead: '元美和',   text: '会費管理・出欠管理・会場手配・レポート作成・ポータル投稿管理', support: [] },
    { lead: '古野絢太', text: '企業向け研修提案資料の作成・商談・プレゼン対応', support: [] },
    { lead: '元美和',   text: '台本作成・ファシリテーション', support: ['中道稔'] },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>フィルター</span>
        <select style={selectStyle()}><option>事業部: すべて</option></select>
        <select style={selectStyle()}><option>担当者: すべて</option></select>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', background: 'rgba(255,255,255,.6)',
          border: '1px solid var(--border)', borderRadius: 8, minWidth: 220,
        }}>
          <Icon name="search" size={12} style={{ color: 'var(--muted)' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>業務・チームで検索…</span>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tasks.length} 件</span>
        <button style={btnGhost()}><Icon name="trash" size={12} /> アーカイブ (7)</button>
        <span style={{
          padding: '5px 10px', fontSize: 11, fontWeight: 600,
          background: 'var(--warn-soft)', color: 'var(--warn)',
          border: '1px solid rgba(217,119,6,.2)', borderRadius: 8,
        }}>
          🔥 管理者モード · ドラッグで並び替え可
        </span>
      </div>

      <div style={glassCard({ padding: 0, overflow: 'hidden' })}>
        <div style={{
          padding: '10px 18px',
          background: 'linear-gradient(120deg, rgba(5,150,105,.08), transparent)',
          borderBottom: '1px solid rgba(15,23,42,.06)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="rocket" size={14} style={{ color: 'var(--success)' }} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>パートナー事業部</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 8 }}>└ セールス</span>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '160px 1fr 180px 80px',
          padding: '8px 18px', background: 'rgba(15,23,42,.02)',
          fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.05em',
        }}>
          <span>責任者</span>
          <span>業務内容</span>
          <span>担当 (サポート)</span>
          <span></span>
        </div>
        {tasks.map((t, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '160px 1fr 180px 80px',
            padding: '10px 18px', alignItems: 'center',
            borderBottom: i < tasks.length - 1 ? '1px solid rgba(15,23,42,.05)' : 'none',
            gap: 10,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 8px 3px 4px',
              background: '#fff6ed', borderRadius: 6, fontSize: 11.5, fontWeight: 500,
              width: 'fit-content',
            }}>
              <span style={{ width: 16, height: 16, borderRadius: 3, background: 'linear-gradient(135deg,#fb923c,#f97316)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.lead[0]}</span>
              <span style={{ color: '#9a3412' }}>{t.lead}</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5 }}>{t.text}</span>
              {t.note && <span style={{ padding: '0 6px', fontSize: 9.5, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 99 }}>📎{t.note}</span>}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {t.support.map((s, j) => (
                <span key={j} style={{
                  padding: '2px 7px', fontSize: 10.5, color: 'var(--muted)',
                  background: 'rgba(15,23,42,.04)', borderRadius: 99,
                }}>{s}</span>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
              <button style={iconBtn()}><Icon name="pencil" size={11} /></button>
              <button style={iconBtn()}><Icon name="link" size={11} /></button>
              <button style={iconBtn('danger')}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function selectStyle() {
  return {
    padding: '5px 10px', fontSize: 12,
    background: 'rgba(255,255,255,.6)',
    border: '1px solid var(--border)', borderRadius: 8,
    fontFamily: 'inherit', color: 'var(--text)',
    cursor: 'pointer',
  };
}
function iconBtn(tone) {
  return {
    width: 22, height: 22, borderRadius: 5,
    background: tone === 'danger' ? 'var(--danger-soft)' : 'rgba(15,23,42,.05)',
    color: tone === 'danger' ? 'var(--danger)' : 'var(--sub)',
    border: 'none', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

/* ============================================================
   業務マニュアルタブ — 空状態の改善
   ============================================================ */
function ManualTab() {
  const [selected, setSelected] = React.useState(null);
  const teams = [
    { dept: 'パートナー事業部', accent: '#2563eb', items: ['セールス', 'CS'] },
    { dept: 'ユース事業部',     accent: '#d97706', items: ['コンテンツ', '集客', '団体連携'] },
    { dept: 'コミュニティ事業部', accent: '#10b981', items: ['イベント', '教育', 'プロジェクト'] },
    { dept: '経営企画部',       accent: '#8b5cf6', items: ['広報', 'プログラム企画', '基金', '総務', '採用・育成'] },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14 }}>
      <div style={glassCard({ padding: 14 })}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 10px', background: 'rgba(15,23,42,.04)',
          borderRadius: 7, marginBottom: 10,
        }}>
          <Icon name="search" size={12} style={{ color: 'var(--muted)' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>チームを検索…</span>
        </div>
        {teams.map((t, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px', fontSize: 11.5, fontWeight: 700, color: t.accent,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: t.accent }} />
              {t.dept}
            </div>
            {t.items.map((it, j) => (
              <button key={j} onClick={() => setSelected({ team: it, dept: t.dept, accent: t.accent })} style={{
                width: '100%', textAlign: 'left',
                padding: '6px 24px', fontSize: 12.5, color: 'var(--sub)',
                background: selected && selected.team === it ? 'var(--accent-soft)' : 'transparent',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                marginBottom: 1,
              }}>{it}</button>
            ))}
          </div>
        ))}
      </div>
      <div style={glassCard({ padding: 0, minHeight: 480, overflow: 'hidden' })}>
        {selected ? <ManualDetail selected={selected} /> : <ManualEmpty />}
      </div>
    </div>
  );
}

function ManualEmpty() {
  return (
    <div style={{
      height: '100%', minHeight: 480,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      padding: 40, textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(37,99,235,.12), rgba(34,211,238,.12))',
        border: '1px solid rgba(37,99,235,.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--accent-text)',
      }}>
        <Icon name="refresh" size={28} stroke={1.6} />
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>左のチームを選んでください</div>
        <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.7, maxWidth: 360 }}>
          チームごとに「フェーズ別の業務マニュアル」を管理できます。<br/>
          新メンバーが入ったときの「迷い」をぐっと減らします。
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 380 }}>
        {['新メンバーオンボーディング', '月次定例の進め方', 'クライアント対応', 'イベント運営'].map((t, i) => (
          <span key={i} style={{
            padding: '4px 10px', fontSize: 11, color: 'var(--sub)',
            background: 'rgba(255,255,255,.7)', border: '1px solid var(--border)',
            borderRadius: 99,
          }}>{t}</span>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>テンプレ例から始めることもできます</div>
    </div>
  );
}

function ManualDetail({ selected }) {
  return (
    <div>
      <div style={{
        padding: '14px 18px',
        background: `linear-gradient(120deg, ${selected.accent}15, transparent)`,
        borderBottom: '1px solid rgba(15,23,42,.06)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: selected.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={14} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.team}</div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{selected.dept}</div>
        </div>
      </div>
      <div style={{ padding: 18, fontSize: 12.5, color: 'var(--sub)' }}>
        フェーズ別マニュアルがここに表示されます（編集可）。
      </div>
    </div>
  );
}

/* ============================================================
   メンバー JD タブ — Glass カード化
   ============================================================ */
function MemberJDTab() {
  const members = [
    { n: '三木智弘', role: '代表取締役', main: '代表取締役', mainColor: '#fb923c', tags: ['全社', 'CS', 'プログラム企画', '基金', '総務', 'プロジェクト', 'イベント', '教育', 'セールス'], type: '正社員', time: 'フルタイム' },
    { n: '三木浩江', role: '執行役員 副社長', main: '執行役員 副社長', mainColor: '#10b981', tags: ['全社', 'セールス', '集客', '団体連携', '広報'], type: '正社員', time: 'フルタイム' },
    { n: '森朝香',   role: 'パートナー事業部 兼 コミュニティ事業部 マネージャー (教育責任者)', mainColor: '#059669', tags: ['コミュニティ事業部', 'CS', 'イベント', '教育', 'プログラム企画', '集客'], type: '正社員', time: 'フルタイム' },
    { n: '古野絢太', role: 'パートナー事業部 リーダー', main: 'パートナー事業部 リーダー 兼 事務局長補佐', mainColor: '#fb923c', tags: ['パートナー事業部', 'CS', 'プロジェクト', '総務'], type: '正社員予定', time: 'フルタイム' },
    { n: '面川文香', role: 'コミュニティ事業部 イベントチーム 兼 総務', main: 'コミュニティ事業部 イベントチーム 兼 総務', mainColor: '#a855f7', tags: ['コミュニティ事業部', '総務', 'イベント', '採用・育成'], type: '正社員', time: 'フルタイム' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{members.length} 人のメンバー</span>
        <button style={btnPrimary()}><Icon name="plus" size={12} /> メンバーを追加</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {members.map((m, i) => (
          <div key={i} style={glassCard({ padding: 16, background: '#fff' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 10,
                background: `linear-gradient(135deg, ${m.mainColor}40, ${m.mainColor}20)`,
                color: m.mainColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700,
                border: `1px solid ${m.mainColor}30`,
              }}>{m.n[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.n}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {m.role}
                </div>
              </div>
            </div>
            <div style={{
              padding: '6px 10px', marginBottom: 10,
              background: m.mainColor + '15',
              color: m.mainColor,
              border: `1px solid ${m.mainColor}30`,
              borderRadius: 7, fontSize: 11.5, fontWeight: 600,
              lineHeight: 1.4,
            }}>{m.main || m.role}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {m.tags.slice(0, 6).map((t, j) => (
                <span key={j} style={{
                  padding: '2px 7px', fontSize: 10,
                  background: 'var(--accent-soft)', color: 'var(--accent-text)',
                  borderRadius: 4,
                }}>{t}</span>
              ))}
              {m.tags.length > 6 && (
                <span style={{ padding: '2px 7px', fontSize: 10, color: 'var(--muted)' }}>+{m.tags.length - 6}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, borderTop: '1px solid rgba(15,23,42,.05)' }}>
              <span style={{ padding: '2px 7px', fontSize: 10, background: 'rgba(15,23,42,.05)', color: 'var(--sub)', borderRadius: 4 }}>{m.type}</span>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{m.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   ユーザー管理タブ
   ============================================================ */
function UsersTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={glassCard({ padding: 16 })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="msg" size={18} style={{ color: 'var(--muted)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Slack User ID 同期</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55 }}>
              Slack ワークスペースのユーザーを email マッチで members.slack_user_id に一括設定。<br/>
              通知は SLACK_WEBHOOK_URL 経由で投稿、メンションは同期済 ID で実メンションになる。
            </div>
          </div>
          <button style={btnPrimary()}>Slack User ID 同期</button>
        </div>
      </div>

      <div style={glassCard({ padding: 16 })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Icon name="msg" size={16} style={{ color: 'var(--muted)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>共有・確認事項の通知チャンネル</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              ダッシュボードから投稿された 共有/確認 事項を、ここに登録した Slack Incoming Webhook で投稿します。
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value="https://hooks.slack.com/services/T.../B.../..." readOnly style={{
            flex: 1, padding: '7px 12px', fontSize: 12, fontFamily: 'ui-monospace, monospace',
            background: 'rgba(15,23,42,.03)', border: '1px solid var(--border)',
            borderRadius: 7, color: 'var(--sub)',
          }} />
          <button style={btnGhost()}>保存</button>
          <button style={btnGhost()}>テスト送信</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { l: 'AUTH アカウント総数', v: '15', c: 'var(--accent-text)' },
          { l: '組織図と連携済み',   v: '15', c: 'var(--success)' },
          { l: '未紐付け',           v: '0',  c: 'var(--warn)' },
        ].map((s, i) => (
          <div key={i} style={glassCard({ padding: 14 })}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.05em', marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.c, fontFamily: 'ui-monospace, monospace' }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={glassCard({ padding: 16 })}>
        <div style={{
          padding: '8px 12px', marginBottom: 10,
          background: 'rgba(15,23,42,.03)', border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="search" size={12} style={{ color: 'var(--muted)' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>名前・メール・ロールで検索 (例: 元 / mickey / マネージャー)</span>
        </div>
        <div style={{
          padding: '10px 12px',
          background: 'var(--warn-soft)', border: '1px solid rgba(217,119,6,.25)',
          borderRadius: 8, marginBottom: 12,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: 99, flexShrink: 0,
            background: 'var(--warn)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
          }}>!</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
              2 件のメンバーは members.email が設定されていますが、AUTH ユーザーが存在しません。
            </div>
            <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 3 }}>
              加藤翼 (tsubasa_kato@neoa.jp) / 菅雅也 (m_suga@neoa.jp)<br/>
              本人にダッシュボードでログインしてもらうか、AUTH 側で手動作成して紐付けてください。
            </div>
          </div>
        </div>
        <div style={{
          padding: 14, background: '#fff', border: '1px solid rgba(15,23,42,.06)',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 99, background: 'linear-gradient(135deg,#fb923c,#f97316)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>三</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>三木智弘</span>
              <span style={{ padding: '1px 7px', fontSize: 10, fontWeight: 600, background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 99 }}>管理者</span>
              <span style={{ padding: '1px 7px', fontSize: 10, fontWeight: 600, background: 'rgba(15,23,42,.06)', color: 'var(--sub)', borderRadius: 99 }}>代表取締役</span>
              <span style={{ flex: 1 }} />
              <span style={{ padding: '1px 7px', fontSize: 10, fontWeight: 600, background: 'var(--success-soft)', color: 'var(--success)', borderRadius: 99 }}>✓ 組織図連携済み</span>
              <span style={{ padding: '1px 7px', fontSize: 10, fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 99 }}>自分</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 12 }}>
              <span>✉ t_miki@neoa.jp</span>
              <span>最終ログイン: 2026/05/22 23:26</span>
              <span>登録日: 2026/03/10 14:35</span>
            </div>
          </div>
          <button style={btnGhost()}>紐付け変更</button>
          <button style={btnGhost()}>ロール変更</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Add icon paths to components.jsx Icon (extend at runtime)
   ============================================================ */
(function ensureIcons() {
  const extra = {
    chart:    'M3 21h18M5 21V11m4 10V8m4 13V13m4 8V5m4 16V10',
    flag:     'M5 3v18m0-15 14 4-3 4 3 4-14 0',
    handshake:'M4 12 8 8l4 4 4-4 4 4M4 12l8 8 8-8',
  };
  if (typeof window !== 'undefined' && window.ICON_PATHS) {
    Object.assign(window.ICON_PATHS, extra);
  }
})();

Object.assign(window, { OrgPage });

/* ============================================================
   Strategy card for the canvas
   ============================================================ */
function OrgStrategy() {
  const points = [
    { n: '01', title: 'トンマナ統一 — Glass パレットへ', body: '緑/オレンジ/水色のベタピル、白だけの背景、紫の管理ボタン等を廃止。全タブを Glass トーン（半透明カード + backdrop-blur + ブランドグラデ）で統一。' },
    { n: '02', title: 'オンボーディングチェックリスト', body: '初回ログイン時に上部に表示。「メンバー招待 / 組織図 / JD / 業務一覧 / マニュアル」の 5 ステップを 1 行表示。完了状況のプログレスバー + 次のステップへの誘導ボタン。' },
    { n: '03', title: '空状態を「これから書く場所」に', body: '業務マニュアルの空状態は「左のチームを選んでください」だけでなく、テンプレ候補 4 枚を提示して心理的ハードルを下げる。' },
    { n: '04', title: '責任者未設定をオレンジで促す', body: 'チームカード下部の「責任者」が未設定なら、警告色のダッシュ枠で「未設定 — クリックして指定」を表示。' },
    { n: '05', title: '工数管理の色設計を整える', body: '役割色を 6 色固定（営業=赤、運営=青、CS=緑、企画=橙、総務=紫、PR=ピンク）、凡例を上部に常時表示。数値テーブルは塗りで濃度を表現。' },
    { n: '06', title: 'メンバー JD カードの統一', body: 'バラバラの色帯を、メンバーの「メインカラー」1 色に集約。役割タグはアクセント色の小チップで統一。' },
  ];
  return (
    <div style={{
      width: '100%', height: '100%', padding: 28, overflow: 'auto',
      background: '#fff', fontFamily: 'Inter, "Noto Sans JP", system-ui, sans-serif',
    }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#a1a1aa', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          DESIGN STRATEGY · 組織ページのリデザイン
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#18181b', letterSpacing: '-0.005em', marginBottom: 4 }}>
          機能ごとに散らばっていたトンマナを Glass で統一
        </div>
        <div style={{ fontSize: 13, color: '#52525b', lineHeight: 1.6, maxWidth: 740 }}>
          現状は 6 タブそれぞれが別物のように見える（緑/オレンジ/水色のベタピル、白だけのテーブル、紫の管理者ボタン、絵文字＋色のピル）。
          全タブを Glass パレット + ブランドグラデで統一し、加えて初回ユーザー向けにセットアップチェックリストを上部に常駐させる。
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {points.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 16px', background: '#fafafa', borderRadius: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#a1a1aa', fontFamily: 'ui-monospace, monospace', minWidth: 28 }}>{p.n}</div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#18181b', marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: '#52525b', lineHeight: 1.55 }}>{p.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { OrgStrategy });

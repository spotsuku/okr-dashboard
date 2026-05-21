"use client"
// screens/landing.jsx — AI WorkSpace 新規ユーザー向け LP
// Chatwork の構成を参考に、AI WorkSpace 用に再設計
import * as React from 'react'

const NAV = [
  { label: '特徴・機能', href: '#features' },
  { label: '料金プラン', href: '#pricing' },
  { label: 'よくある質問', href: '#faq' },
];

function LandingPage() {
  return (
    <div data-theme="glass" className="lp-frame" style={{
      width: '100%', minHeight: '100vh',
      fontFamily: '"Inter", "Noto Sans JP", -apple-system, system-ui, sans-serif',
      color: 'var(--text)', fontFeatureSettings: '"palt" 1',
      background:
        'radial-gradient(1200px 800px at 8% 0%, rgba(186,230,253,.55), transparent 60%),' +
        'radial-gradient(1100px 900px at 100% 22%, rgba(187,247,208,.45), transparent 60%),' +
        'radial-gradient(900px 700px at 80% 100%, rgba(224,242,254,.6), transparent 60%),' +
        'linear-gradient(180deg, #f6fafd 0%, #eef4f9 100%)',
    }}>
      <style>{`
        .lp-frame {
          box-sizing: border-box;
          --bg:            #f3f6fa;
          --bg-soft:       rgba(255,255,255,.55);
          --card:          rgba(255,255,255,.74);
          --sunken:        rgba(255,255,255,.5);
          --border:        rgba(15,23,42,.08);
          --border-strong: rgba(15,23,42,.16);
          --text:          #0f172a;
          --sub:           #475569;
          --muted:         #94a3b8;
          --accent:        #0ea5e9;
          --accent-hover:  #0284c7;
          --accent-soft:   rgba(14,165,233,.14);
          --accent-text:   #0369a1;
          --success:       #059669;
          --success-soft:  rgba(5,150,105,.14);
          --warn:          #d97706;
          --warn-soft:     rgba(217,119,6,.14);
          --danger:        #e11d48;
          --danger-soft:   rgba(225,29,72,.12);
          --info:          #0284c7;
          --info-soft:     rgba(2,132,199,.14);
        }
        .lp-frame *, .lp-frame *::before, .lp-frame *::after { box-sizing: border-box; }
        .lp-section { padding: 96px 24px; }
        .lp-container { max-width: 1180px; margin: 0 auto; }
        .lp-h2 { font-size: 36px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; }
        .lp-h2-sub { font-size: 14px; font-weight: 600; color: var(--accent-text); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 12px; }
        .lp-card {
          background: rgba(255,255,255,.7);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid rgba(15,23,42,.06);
          border-radius: 18px;
          box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 4px 18px rgba(15,23,42,.04);
        }
        .lp-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 22px; font-size: 14px; font-weight: 600;
          border-radius: 99px; cursor: pointer; transition: transform .12s, box-shadow .12s, background .12s;
          letter-spacing: 0.01em;
        }
        .lp-btn:hover { transform: translateY(-1px); }
        .lp-btn-primary {
          background: linear-gradient(120deg, #2563eb 0%, #22d3ee 100%);
          color: #fff; border: 1px solid #2563eb;
          box-shadow: 0 4px 14px rgba(37,99,235,.32), inset 0 1px 0 rgba(255,255,255,.3);
        }
        .lp-btn-primary:hover { box-shadow: 0 6px 22px rgba(37,99,235,.4); }
        .lp-btn-ghost {
          background: rgba(255,255,255,.7); color: var(--text);
          border: 1px solid rgba(15,23,42,.1);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        }
        .lp-btn-ghost:hover { background: #fff; }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .lp-marquee { display: flex; gap: 56px; animation: marquee 40s linear infinite; width: max-content; }
        .lp-link { color: var(--accent-text); font-weight: 500; text-decoration: none; }
        .lp-link:hover { text-decoration: underline; }
        @media (max-width: 900px) {
          .lp-section { padding: 64px 20px; }
          .lp-h2 { font-size: 28px; }
        }
      `}</style>
      <LPHeader />
      <LPHero />
      <LPWhat />
      <LPFeatureBig id="features" />
      <LPFeatureSmall />
      <LPReasons />
      <LPCTA />
      <LPPricing />
      <LPFAQ />
      <LPFooter />
    </div>
  );
}

/* ============================================================
   ヘッダ — sticky
   ============================================================ */
function LPHeader() {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(255,255,255,.7)',
      backdropFilter: 'blur(18px) saturate(160%)',
      WebkitBackdropFilter: 'blur(18px) saturate(160%)',
      borderBottom: '1px solid rgba(15,23,42,.06)',
    }}>
      <div style={{
        maxWidth: 1180, margin: '0 auto',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 28,
      }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/icon.png" width="32" height="32" alt="AI WorkSpace" style={{ borderRadius: 7, boxShadow: '0 2px 6px rgba(37,99,235,.18)' }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.005em' }}>AI WorkSpace</span>
        </a>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 22, marginLeft: 12 }}>
          {NAV.map(n => (
            <a key={n.label} href={n.href} style={{
              fontSize: 13, fontWeight: 500, color: 'var(--sub)',
              textDecoration: 'none',
            }}>{n.label}</a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', fontSize: 11.5, fontWeight: 600,
          background: 'var(--warn-soft)', color: 'var(--warn)',
          border: '1px solid rgba(217,119,6,.3)', borderRadius: 99,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--warn)' }} />
          現在 無料公開中
        </span>
        <a href="/signin" style={{ fontSize: 13, fontWeight: 500, color: 'var(--sub)', textDecoration: 'none' }}>ログイン</a>
        <a href="/signin" className="lp-btn lp-btn-primary" style={{ padding: '8px 18px', fontSize: 13 }}>無料ではじめる</a>
      </div>
    </header>
  );
}

/* ============================================================
   ヒーロー — メインビジュアル
   ============================================================ */
function LPHero() {
  return (
    <section style={{ padding: '76px 24px 64px', position: 'relative', overflow: 'hidden' }}>
      <div className="lp-container" style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 56, alignItems: 'center' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '5px 14px 5px 6px', marginBottom: 22,
            background: 'rgba(255,255,255,.7)',
            border: '1px solid rgba(15,23,42,.08)', borderRadius: 99,
            fontSize: 12, color: 'var(--sub)', fontWeight: 500,
          }}>
            <span style={{
              padding: '2px 8px', background: 'var(--accent)', color: '#fff',
              fontSize: 10.5, fontWeight: 700, borderRadius: 99,
              letterSpacing: '0.04em',
            }}>NEW</span>
            タスク・メール・カレンダー・会議・振り返り・目標管理を 1 つで運用する業務 OS
          </div>
          <h1 style={{
            fontSize: 56, fontWeight: 700, lineHeight: 1.15,
            letterSpacing: '-0.025em', color: 'var(--text)',
            margin: '0 0 22px 0',
          }}>
            今日、何をすれば<br/>
            良いか<span style={{
              background: 'linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text', color: 'transparent',
            }}>迷わない</span>。<br/>
            チームの仕事を整える AI。
          </h1>
          <p style={{
            fontSize: 16, lineHeight: 1.75, color: 'var(--sub)',
            margin: '0 0 32px 0', maxWidth: 540,
          }}>
            AI WorkSpace は、タスク・メール・カレンダー・会議・振り返り・目標管理を 1 つにまとめた
            業務運用 OS です。AI が今日やるべきことを毎朝整理し、
            メンバー全員が同じ景色を見て働けます。
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 22 }}>
            <a href="/signin" className="lp-btn lp-btn-primary">
              無料ではじめる
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
            </a>
            <a href="/tour" className="lp-btn lp-btn-ghost">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5l5 7-5 7M14 5h5v14h-5" /></svg>
              3分で分かるツアー
            </a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
              クレジットカード不要
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
              3分で利用開始
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
              Google アカウント連携
            </span>
          </div>
        </div>
        {/* 右: プロダクトモックアップ */}
        <HeroMockup />
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div style={{ position: 'relative', perspective: 1400 }}>
      {/* 後ろに浮かぶ補助カード */}
      <div className="lp-card" style={{
        position: 'absolute', top: -32, right: -24, width: 240,
        padding: 14, transform: 'rotate(3deg) translateZ(0)',
        zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m0-4a5 5 0 1 1 0-10 5 5 0 0 1 0 10" /></svg>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>今期の目標</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10, lineHeight: 1.4 }}>
          NEO を九州に広げ、信頼を確立する
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'var(--sunken)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: '34%', height: '100%', background: 'var(--accent)' }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sub)' }}>34%</span>
        </div>
      </div>
      {/* 前のメインカード（タスク） */}
      <div className="lp-card" style={{
        position: 'relative', padding: 20, zIndex: 2,
        transform: 'rotate(-1.5deg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <img src="/icon.png" width="32" height="32" alt="" style={{ borderRadius: 7, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>おはようございます、佐藤さん</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>今日のタスク 7 件 · 重要度高 2 件</div>
          </div>
          <span style={{
            padding: '3px 8px', background: 'var(--success-soft)', color: 'var(--success)',
            fontSize: 10, fontWeight: 600, borderRadius: 99,
          }}>● 稼働中</span>
        </div>
        <div style={{
          padding: '10px 12px', marginBottom: 12,
          background: 'rgba(14,165,233,.06)',
          border: '1px solid rgba(14,165,233,.18)',
          borderRadius: 9,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: 5,
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>
            明日 11時 クライアントに提案資料を送る
            <span style={{ color: 'var(--accent-text)' }}> #目標2</span>
          </span>
        </div>
        {[
          { t: '新規提案資料を最終レビューして送付', kr: '目標2', d: '今日', focus: true },
          { t: 'Q2 マーケティング会議 アジェンダ作成', kr: '目標3', d: '今日' },
          { t: '製品デモのシナリオをチームと確認',  kr: '目標4', d: '13:30' },
          { t: '新人オンボーディング資料の更新',     d: '今日' },
          { t: '顧客アンケート集計レポートの提出',   d: '5/14', overdue: true },
        ].map((it, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 4px', borderBottom: '1px solid rgba(15,23,42,.06)',
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: 99,
              border: `1.5px solid ${it.overdue ? 'var(--danger)' : 'var(--border-strong)'}`,
              flexShrink: 0,
            }} />
            <span style={{ flex: 1, fontSize: 11.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.t}</span>
            {it.focus && (
              <span style={{ padding: '1px 7px', fontSize: 9.5, fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 99 }}>Focus</span>
            )}
            {it.kr && <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>{it.kr}</span>}
            <span style={{ fontSize: 10, color: it.overdue ? 'var(--danger)' : 'var(--muted)', fontFamily: 'ui-monospace, monospace', minWidth: 40, textAlign: 'right' }}>{it.d}</span>
          </div>
        ))}
      </div>
      {/* 右下に振り返りバッジ */}
      <div className="lp-card" style={{
        position: 'absolute', bottom: -28, right: -36, width: 200,
        padding: 14, zIndex: 3, transform: 'rotate(4deg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 99,
            background: 'radial-gradient(circle at 30% 25%, #fde68a 0%, #f59e0b 45%, #b45309 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 3px rgba(245,158,11,.16), 0 2px 6px rgba(180,83,9,.25), inset 0 -1px 2px rgba(124,45,18,.3), inset 0 1px 2px rgba(255,255,255,.5)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 4 2.5 5.5L20 10l-4 4 1 5.5-5-2.8-5 2.8 1-5.5-4-4 5.5-.5z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7c2d12' }}>振り返り皆勤</div>
            <div style={{ fontSize: 9.5, color: '#92400e', fontWeight: 600 }}>あと 14日</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 4, background: 'var(--sunken)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: '36%', height: '100%', background: 'var(--warn)' }} />
          </div>
          <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--sub)', fontFamily: 'ui-monospace, monospace' }}>8/22日</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ロゴストリップ — 流れる
   ============================================================ */
function LPLogoStrip() {
  const logos = [
    'NEO 運営DB', 'スポーツ事業', 'エデュケーション',
    '九州コミュニティ', 'パートナーズ', 'プレイフル',
    'アカデミア', '評議会', 'ベンチャーズ',
  ];
  return (
    <section style={{ padding: '40px 0 64px', overflow: 'hidden' }}>
      <div style={{ maxWidth: 720, margin: '0 auto 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          全社で導入が進む 9 組織
        </div>
      </div>
      <div style={{ position: 'relative', maskImage: 'linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)' }}>
        <div className="lp-marquee">
          {[...logos, ...logos].map((name, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 18px',
              background: 'rgba(255,255,255,.6)',
              border: '1px solid rgba(15,23,42,.06)', borderRadius: 99,
              fontSize: 13, fontWeight: 600, color: 'var(--sub)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: 'linear-gradient(135deg, #cbd5e1, #94a3b8)',
                color: '#fff', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{name[0]}</span>
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   What is AI WorkSpace
   ============================================================ */
function LPWhat() {
  return (
    <section className="lp-section" id="about">
      <div className="lp-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 56, alignItems: 'center' }}>
        <div>
          <div className="lp-h2-sub">ABOUT</div>
          <h2 className="lp-h2" style={{ margin: '0 0 18px 0' }}>
            「今日、何をやれば<br/>良いか分からない」を<br/>無くすための業務 OS
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--sub)', margin: '0 0 18px 0' }}>
            タスク・メール・カレンダー・会議・振り返り・目標管理を 1 つのワークスペースに集約。
            AI が情報を整理し、毎朝「今日の優先タスク」を提示します。
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--sub)', margin: '0 0 22px 0' }}>
            進捗・振り返り・目標の状態がチーム全員に見える化されるため、
            会議や報告のための仕事が減り、本来の業務に集中できます。
          </p>
          <a href="#features" className="lp-link" style={{ fontSize: 14 }}>
            機能の詳細を見る →
          </a>
        </div>
        <div className="lp-card" style={{ padding: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 1fr', gap: 0,
            borderRadius: 12, overflow: 'hidden',
            background: 'rgba(255,255,255,.5)', minHeight: 360,
          }}>
            {/* mini sidebar */}
            <div style={{ background: 'rgba(15,23,42,.86)', padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: 'task',  label: 'タスク', active: true },
                { icon: 'mail',  label: 'メール' },
                { icon: 'cal',   label: 'カレンダー' },
                { icon: 'team',  label: '会議' },
                { icon: 'review', label: '振り返り' },
                { icon: 'okr',   label: '目標管理' },
              ].map((it, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 6,
                  background: it.active ? 'rgba(14,165,233,.2)' : 'transparent',
                  color: it.active ? '#fff' : 'rgba(255,255,255,.55)',
                  fontSize: 11.5, fontWeight: it.active ? 600 : 500,
                }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: it.active ? 'var(--accent)' : 'rgba(255,255,255,.15)' }} />
                  {it.label}
                </div>
              ))}
            </div>
            {/* mini main */}
            <div style={{ padding: '18px 18px', background: '#fff' }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>今日やること <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 11 }}>7</span></div>
              {[
                { t: '新規提案資料を最終レビュー', focus: true, d: '今日' },
                { t: 'Q2 マーケ会議 アジェンダ作成', d: '今日' },
                { t: '製品デモのシナリオ確認',     d: '13:30' },
                { t: '新人オンボーディング更新',   d: '今日' },
                { t: '顧客アンケート集計レポート', d: '5/14', overdue: true },
              ].map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f4f4f5' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, border: `1.5px solid ${it.overdue ? 'var(--danger)' : '#d8d8dd'}`, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.t}</span>
                  {it.focus && <span style={{ padding: '1px 6px', fontSize: 9, fontWeight: 600, background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 99 }}>Focus</span>}
                  <span style={{ fontSize: 9.5, color: it.overdue ? 'var(--danger)' : '#a1a1aa', fontFamily: 'ui-monospace, monospace' }}>{it.d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   大きな機能 — Big features
   ============================================================ */
function LPFeatureBig({ id }) {
  return (
    <section className="lp-section" id={id} style={{ background: 'rgba(255,255,255,.4)', borderTop: '1px solid rgba(15,23,42,.06)', borderBottom: '1px solid rgba(15,23,42,.06)' }}>
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div className="lp-h2-sub">FEATURES</div>
          <h2 className="lp-h2" style={{ margin: '0 auto 16px', maxWidth: 720 }}>
            主要 6 機能で、業務運用を 1 つにまとめる
          </h2>
          <p style={{ fontSize: 15, color: 'var(--sub)', lineHeight: 1.7, maxWidth: 620, margin: '0 auto' }}>
            タスクから振り返りまで、業務に必要な情報を 1 つのワークスペースで完結。
            個別ツールを行き来する必要がありません。
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <BigFeatureCard
            tone="accent"
            label="タスク管理"
            title="思いついた瞬間に、自然文で投函"
            body="「明日 11時 クライアントに提案資料を送る #目標2」のように一文で書くだけで、AI が日付・目標・担当を解析してタスク化します。"
            bullets={['自然文によるクイック追加', '目標・プロジェクトに自動紐付け', 'メール・カレンダーから取り込み']}
            mockup={<TaskMockup />}
          />
          <BigFeatureCard
            tone="success"
            label="目標管理"
            title="目標を意識して、毎週の行動を書く"
            body="チーム・個人の目標が画面上部に常に表示され、進捗と週次アクションを同じ画面で記入できます。「何のための行動か」が視界から消えません。"
            bullets={['年間・四半期・週次の 3 ビューを統一', 'Good / More / Focus の週次振り返り', 'メンバー / 部門の階層を 1 画面で']}
            mockup={<OKRMockup />}
          />
          <BigFeatureCard
            tone="warn"
            label="振り返り"
            title="連続記入 X 日 — 書きたくなる KPT"
            body="ストリーク可視化、KPT 各列に対応した今日の問い、達成間近のバッジ。「書かないと怒られる」設計から「書きたくなる」体験へ。"
            bullets={['日次 KPT・1on1・月次バッジ', '今日の問い 3 問が自動生成', '皆勤バッジで継続を可視化']}
            mockup={<ReflectionMockup />}
          />
          <BigFeatureCard
            tone="info"
            label="会議管理"
            title="アジェンダから議事録まで、一貫"
            body="会議のアジェンダ、議事録、決定事項とアクションアイテムを 1 つのテンプレで。議論したことがそのままタスクになります。"
            bullets={['アジェンダテンプレ', '決定事項→タスクのワンクリック化', '週次・月次会議の橋渡し']}
            mockup={<MeetingMockup />}
          />
          <BigFeatureCard
            tone="accent"
            label="組織管理"
            title="メンバー・部門・役割を見える化"
            body="メンバー一覧、部門階層、役割・権限を 1 つのツリーで管理。「誰が何を担当しているか」が一目でわかります。"
            bullets={['部門階層ツリー', 'メンバー担当の見える化', '役割ベースのアクセス制御']}
            mockup={<OrgMockup />}
          />
          <BigFeatureCard
            tone="info"
            label="AI コーチ MyCOO"
            title="毎朝、AI が「今日のあなた」を整える"
            body="メール・カレンダー・タスクから優先度を AI が判断し、今日着手すべき 3 件を提示。目標からの逆算で「やらないこと」も提案します。"
            bullets={['朝の優先タスク自動提示', '目標からの逆算で取捨選択', '振り返りの問いも AI 生成']}
            mockup={<AIMockup />}
          />
        </div>
      </div>
    </section>
  );
}

function BigFeatureCard({ tone, label, title, body, bullets, mockup }) {
  const toneColors = {
    accent:  { bg: 'rgba(14,165,233,.12)', fg: 'var(--accent-text)' },
    info:    { bg: 'rgba(37,99,235,.12)',  fg: '#1d4ed8' },
    success: { bg: 'rgba(5,150,105,.12)',  fg: 'var(--success)' },
    warn:    { bg: 'rgba(217,119,6,.12)',  fg: 'var(--warn)' },
  }[tone];
  return (
    <div className="lp-card" style={{ padding: 28, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'inline-block', alignSelf: 'flex-start',
        padding: '4px 12px', marginBottom: 16,
        background: toneColors.bg, color: toneColors.fg,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        borderRadius: 99,
      }}>{label}</div>
      <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 12px 0', lineHeight: 1.35 }}>{title}</h3>
      <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--sub)', margin: '0 0 14px 0' }}>{body}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={toneColors.fg} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 3, flexShrink: 0 }}><path d="m5 12 5 5L20 7" /></svg>
            {b}
          </li>
        ))}
      </ul>
      <div style={{
        marginTop: 'auto', padding: 12,
        background: 'rgba(255,255,255,.5)',
        border: '1px solid rgba(15,23,42,.05)',
        borderRadius: 12,
      }}>
        {mockup}
      </div>
    </div>
  );
}

function TaskMockup() {
  return (
    <div style={{ padding: 8, background: '#fff', borderRadius: 8, border: '1px solid #ebebee' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', background: 'rgba(14,165,233,.06)',
        border: '1px solid rgba(14,165,233,.2)', borderRadius: 7,
      }}>
        <div style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        </div>
        <span style={{ fontSize: 11.5, color: '#18181b', flex: 1 }}>
          明日 11時 クライアントに提案資料を送る
          <span style={{ color: 'var(--accent-text)' }}> #目標2</span>
          <span style={{ display: 'inline-block', width: 1, height: 11, background: 'var(--accent)', verticalAlign: 'middle', marginLeft: 2, animation: 'blink 1s infinite' }} />
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ padding: '2px 8px', fontSize: 10, background: 'var(--info-soft)', color: 'var(--info)', borderRadius: 99 }}>📅 明日 11:00</span>
        <span style={{ padding: '2px 8px', fontSize: 10, background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 99 }}>🎯 目標2 売上</span>
      </div>
    </div>
  );
}

function OKRMockup() {
  return (
    <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #ebebee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ padding: '1px 6px', fontSize: 9, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 99, letterSpacing: '0.06em' }}>目標</span>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>サービスを全国に広げ、顧客の信頼を獲得</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--sunken)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: '34%', height: '100%', background: 'var(--accent)' }} />
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--sub)' }}>34%</span>
      </div>
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #ebebee' }}>
        {[
          { s: 'good',  l: '✓', t: '商談化率 +8pt' },
          { s: 'focus', l: '◎', t: '今週の提案 3 件を集中' },
          { s: 'more',  l: '▲', t: '受注決裁プロセス改善' },
        ].map((k, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 10.5 }}>
            <span style={{
              width: 14, height: 14, borderRadius: 4,
              background: { good: 'var(--success-soft)', focus: 'var(--accent-soft)', more: 'var(--warn-soft)' }[k.s],
              color:      { good: 'var(--success)',      focus: 'var(--accent-text)', more: 'var(--warn)'      }[k.s],
              fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{k.l}</span>
            <span style={{ color: '#18181b' }}>{k.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReflectionMockup() {
  return (
    <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #ebebee' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>2</span>
        <span style={{ fontSize: 11, color: 'var(--sub)' }}>日</span>
        <span style={{ marginLeft: 'auto', padding: '1px 7px', fontSize: 9, fontWeight: 700, background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 99 }}>⚡継続中</span>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--sub)', lineHeight: 1.55, marginBottom: 10 }}>
        今日も書いて <b>3日</b> にしましょう。あと <b style={{ color: 'var(--warn)' }}>14日</b> で皆勤バッジ。
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 2 }}>
        {Array.from({ length: 28 }).map((_, i) => {
          const day = i + 1;
          const state = day > 19 ? 'fut' : (day === 18 || day === 19) ? 'on' : 'off';
          return (
            <div key={i} style={{
              aspectRatio: '1 / 1', borderRadius: 2,
              background: state === 'on' ? 'var(--accent)' : state === 'off' ? '#f4f4f5' : 'transparent',
              border: state === 'fut' ? 'none' : '1px solid #ebebee',
              opacity: state === 'fut' ? 0.3 : 1,
            }} />
          );
        })}
      </div>
    </div>
  );
}

function AIMockup() {
  return (
    <div style={{ padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ebebee' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 99, flexShrink: 0,
          background: 'conic-gradient(from 180deg, #0ea5e9, #059669, #f59e0b, #0ea5e9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 17, height: 17, borderRadius: 99, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8" /></svg>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-text)', letterSpacing: '0.06em' }}>MyCOO</div>
          <div style={{ fontSize: 11.5, color: '#18181b', lineHeight: 1.55, marginTop: 2 }}>
            今日は <b>提案資料の仕上げ</b> から取り掛かることをお勧めします。
            14:00 の定例 MTG までに 90 分集中できそうです。
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
        <span style={{ padding: '3px 8px', fontSize: 10, background: 'var(--bg-soft)', border: '1px solid #ebebee', borderRadius: 99, color: 'var(--sub)' }}>提案資料から始める</span>
        <span style={{ padding: '3px 8px', fontSize: 10, background: 'var(--bg-soft)', border: '1px solid #ebebee', borderRadius: 99, color: 'var(--sub)' }}>他の選択肢を見る</span>
      </div>
    </div>
  );
}

function MeetingMockup() {
  return (
    <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #ebebee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ padding: '1px 7px', fontSize: 9.5, fontWeight: 700, background: 'rgba(37,99,235,.12)', color: '#1d4ed8', borderRadius: 99, letterSpacing: '0.06em' }}>会議</span>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1, color: '#18181b' }}>Q2 マーケティング定例</span>
        <span style={{ fontSize: 9.5, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>5/21 14:00</span>
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 4 }}>アジェンダ</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
        {['Q2 進捗確認', '新キャンペーン提案', '6月のリソース調整'].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#18181b' }}>
            <span style={{ width: 14, height: 14, fontSize: 8, fontWeight: 700, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}.</span>
            {t}
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 8, borderTop: '1px dashed #ebebee' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--success)', letterSpacing: '0.06em', marginBottom: 4 }}>決定 → タスク化</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#18181b' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round"><path d="m5 12 5 5L20 7" /></svg>
          来週水曜までにキャンペーン案を共有 — @佐藤
        </div>
      </div>
    </div>
  );
}

function OrgMockup() {
  const tree = [
    { lvl: 0, n: '株式会社サンプル', count: 38 },
    { lvl: 1, n: 'プロダクト本部', count: 14 },
    { lvl: 2, n: 'エンジニアリング', count: 8, active: true },
    { lvl: 2, n: 'デザイン', count: 4 },
    { lvl: 1, n: '営業本部', count: 12 },
    { lvl: 1, n: 'コーポレート', count: 12 },
  ];
  return (
    <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #ebebee' }}>
      {tree.map((d, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 6px',
          paddingLeft: 6 + d.lvl * 12,
          background: d.active ? 'rgba(14,165,233,.08)' : 'transparent',
          borderRadius: 5,
          marginBottom: 1,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={d.active ? 'var(--accent-text)' : 'var(--muted)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {d.lvl === 0
              ? <path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M3 21h18M10 8h4M10 12h4M10 16h4" />
              : <path d="M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6m-6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6m12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
            }
          </svg>
          <span style={{ flex: 1, fontSize: 11, fontWeight: d.active ? 600 : 500, color: d.active ? 'var(--accent-text)' : '#18181b' }}>{d.n}</span>
          <span style={{ fontSize: 9.5, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>{d.count}人</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   小さい機能アイコン
   ============================================================ */
function LPFeatureSmall() {
  const feats = [
    { i: 'task',   l: 'タスク' },
    { i: 'mail',   l: 'メール' },
    { i: 'cal',    l: 'カレンダー' },
    { i: 'team',   l: '会議' },
    { i: 'org',    l: '組織' },
    { i: 'review', l: '振り返り' },
    { i: 'okr',    l: '目標管理' },
    { i: 'ai',     l: 'AI コーチ MyCOO' },
    { i: 'badge',  l: 'バッジ' },
    { i: '1on1',   l: '1on1' },
    { i: 'search', l: '横断検索' },
    { i: 'api',    l: 'API 連携' },
  ];
  return (
    <section className="lp-section" style={{ paddingTop: 64 }}>
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>他にも使える便利機能</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
          {feats.map((f, i) => (
            <div key={i} className="lp-card" style={{
              padding: 16, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8, textAlign: 'center',
            }}>
              <SmallFeatureIcon kind={f.i} />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{f.l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SmallFeatureIcon({ kind }) {
  const paths = {
    task:   <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h8M8 14h5"/></>,
    org:    <><circle cx="12" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M12 7v4m0 0H6v6m6-6h6v6"/></>,
    okr:    <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></>,
    cal:    <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></>,
    mail:   <><rect x="3" y="6" width="18" height="13" rx="2"/><path d="m3 7 9 7 9-7"/></>,
    team:   <><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 2-3.5 4-3.5s3 1 3 3"/></>,
    review: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 17M3 22v-5h5"/></>,
    badge:  <><path d="m12 4 2.5 5.5L20 10l-4 4 1 5.5-5-2.8-5 2.8 1-5.5-4-4 5.5-.5z"/></>,
    '1on1': <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 1.5-3.5 3-3.5s3 1.5 3 3.5"/></>,
    ai:     <><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6 7.7 7.7m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1"/><circle cx="12" cy="12" r="4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
    mobile: <><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></>,
    api:    <><path d="M16 5a3 3 0 1 1 3 3h-3v-3zm0 0v6M11 13a3 3 0 1 0-3 3h3v-3z"/></>,
  };
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 10,
      background: 'linear-gradient(135deg, #e0f2fe, #bfdbfe)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--accent-text)',
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>
    </div>
  );
}

/* ============================================================
   選ばれる理由
   ============================================================ */
function LPReasons() {
  const reasons = [
    {
      n: '01',
      icon: 'shield',
      title: 'AI が「今日やること」を整える',
      body: 'メール・カレンダー・タスクを AI が横断的に読み、今日の優先 3 件を毎朝提示。「迷う時間」が消えます。',
    },
    {
      n: '02',
      icon: 'layers',
      title: '業務情報が 1 つの画面に集約',
      body: 'タスク・OKR・カレンダー・メール・振り返りを 1 つのワークスペースで。ツールを行き来する必要がありません。',
    },
    {
      n: '03',
      icon: 'team',
      title: 'チーム全員が同じ景色を見て働ける',
      body: '個人の進捗・振り返り・目標の状態は自動でチームに見える化。報告会議を減らし、判断のスピードが上がります。',
    },
  ];
  return (
    <section className="lp-section" style={{ background: 'rgba(255,255,255,.4)', borderTop: '1px solid rgba(15,23,42,.06)', borderBottom: '1px solid rgba(15,23,42,.06)' }}>
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div className="lp-h2-sub">WHY AI WORKSPACE</div>
          <h2 className="lp-h2" style={{ margin: 0 }}>
            AI WorkSpace が選ばれる 3 つの理由
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {reasons.map((r, i) => (
            <div key={i} className="lp-card" style={{ padding: 28 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: 'var(--accent-text)',
                letterSpacing: '0.1em', marginBottom: 14,
              }}>POINT {r.n}</div>
              <div style={{
                width: 48, height: 48, borderRadius: 12, marginBottom: 18,
                background: 'linear-gradient(120deg, #2563eb 0%, #22d3ee 100%)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(37,99,235,.32)',
              }}>
                <ReasonIcon kind={r.icon} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px 0', letterSpacing: '-0.005em' }}>{r.title}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--sub)', margin: 0 }}>{r.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReasonIcon({ kind }) {
  const paths = {
    shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
    layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    team:   <><circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 2-3.5 4-3.5s3 1 3 3"/></>,
  };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>
  );
}

/* ============================================================
   大きな CTA バナー
   ============================================================ */
function LPCTA() {
  return (
    <section style={{ padding: '64px 24px' }}>
      <div className="lp-container">
        <div style={{
          position: 'relative', overflow: 'hidden',
          padding: '52px 56px',
          borderRadius: 24,
          background: 'linear-gradient(120deg, #1e40af 0%, #2563eb 45%, #22d3ee 100%)',
          color: '#fff',
        }}>
          {/* 装飾 */}
          <div style={{
            position: 'absolute', top: -60, right: -60, width: 240, height: 240,
            background: 'radial-gradient(circle, rgba(255,255,255,.18), transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: -80, left: -40, width: 220, height: 220,
            background: 'radial-gradient(circle, rgba(187,247,208,.25), transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 40 }}>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '4px 12px', marginBottom: 14,
                background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)',
                borderRadius: 99, fontSize: 11.5, fontWeight: 600,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: '#fde68a' }} />
                現在 すべての機能を無料公開中
              </div>
              <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 12px 0' }}>
                3 分で、明日の朝が変わる。
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: 'rgba(255,255,255,.85)', margin: 0 }}>
                クレジットカード不要。Google アカウントですぐ始められます。
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
              <a href="/signin" className="lp-btn" style={{
                background: '#fff', color: '#2563eb',
                padding: '14px 28px', fontSize: 15,
                boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                fontWeight: 700,
              }}>
                無料ではじめる
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
              </a>
              <button className="lp-btn" style={{
                background: 'rgba(255,255,255,.12)', color: '#fff',
                border: '1px solid rgba(255,255,255,.3)',
                padding: '12px 24px', fontSize: 13,
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                fontWeight: 500,
              }}>
                資料をダウンロード
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   導入事例
   ============================================================ */
function LPCases() {
  const cases = [
    {
      org: '九州コミュニティ', industry: 'NPO / 教育',
      quote: '部門の主要案件の進捗が、Slack の流れに埋もれずに毎朝把握できるように。',
      pic: '三木智弘 / 代表取締役',
      metrics: [{ k: '会議時間', v: '-42%' }, { k: 'タスク取りこぼし', v: '0件 / 月' }],
    },
    {
      org: 'プレイフルアカデミア', industry: '人材育成',
      quote: '毎日の振り返りが習慣化。バッジが楽しみで、自分の成長を実感できます。',
      pic: '面川文香 / イベント担当',
      metrics: [{ k: '振り返り記入率', v: '94%' }, { k: '皆勤バッジ獲得', v: '8人' }],
    },
    {
      org: 'NEO 評議会', industry: 'コンサル',
      quote: '目標を意識して週次アクションを書く設計が秀逸。週次 MTG が「次の行動」中心の議論になりました。',
      pic: '中島啓太 / 経営企画 顧問',
      metrics: [{ k: '目標達成率', v: '+31pt' }, { k: '週次記入率', v: '100%' }],
    },
  ];
  return (
    <section className="lp-section" id="cases">
      <div className="lp-container">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <div className="lp-h2-sub">CASE STUDIES</div>
            <h2 className="lp-h2" style={{ margin: 0 }}>導入事例</h2>
          </div>
          <a href="#" className="lp-link" style={{ fontSize: 14 }}>すべての事例を見る →</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {cases.map((c, i) => (
            <div key={i} className="lp-card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'linear-gradient(135deg, #cbd5e1, #94a3b8)',
                  color: '#fff', fontWeight: 700, fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{c.org[0]}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.org}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{c.industry}</div>
                </div>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)', margin: '0 0 14px 0', flex: 1, fontWeight: 500 }}>
                「{c.quote}」
              </p>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>— {c.pic}</div>
              <div style={{ display: 'flex', gap: 10, paddingTop: 14, borderTop: '1px dashed rgba(15,23,42,.1)' }}>
                {c.metrics.map((m, j) => (
                  <div key={j} style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{m.k}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-text)', fontFeatureSettings: '"tnum"', letterSpacing: '-0.01em' }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   料金プラン
   ============================================================ */
function LPPricing() {
  const plans = [
    {
      name: 'Free',
      desc: '今だけ主要機能を無料公開',
      price: '0',
      unit: '円',
      sub: '主要機能 / メンバー数無制限',
      cta: '無料ではじめる',
      featured: true,
      bullets: [
        'タスク・メール・カレンダー・会議・振り返り・目標管理',
        'AI コーチ MyCOO（月 20 回まで）',
        'メンバー数 無制限',
        'Google カレンダー・Gmail 連携',
      ],
      notes: [
        'モバイルアプリは Business 以上で提供',
        '一部機能は今後 有料プランに移行する可能性があります',
      ],
    },
    {
      name: 'Business',
      desc: '本格運用に',
      price: '今後 発表',
      sub: '正式版リリース時に通知します',
      cta: '通知を受け取る',
      bullets: [
        'Free のすべて + モバイルアプリ',
        'OKR 機能(高度な目標管理)',
        '会議カスタマイズ(テンプレと集計)',
        'AI コーチ MyCOO 無制限',
        '監査ログ',
        'SSO(SAML)',
        '優先サポート',
      ],
      future: true,
    },
    {
      name: 'Enterprise',
      desc: '大規模組織向け',
      price: 'お問い合わせ',
      sub: 'カスタマイズ / オンプレ対応',
      cta: '相談する',
      bullets: [
        'Business のすべて',
        '専用環境（オンプレ可）',
        'カスタム連携 / API',
        '専任カスタマーサクセス',
      ],
      future: true,
    },
  ];
  return (
    <section className="lp-section" id="pricing" style={{ background: 'rgba(255,255,255,.4)', borderTop: '1px solid rgba(15,23,42,.06)', borderBottom: '1px solid rgba(15,23,42,.06)' }}>
      <div className="lp-container">
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="lp-h2-sub">PRICING</div>
          <h2 className="lp-h2" style={{ margin: '0 0 12px 0' }}>料金プラン</h2>
          <p style={{ fontSize: 15, color: 'var(--sub)', margin: 0 }}>
            現在、AI WorkSpace は <b style={{ color: 'var(--warn)' }}>主要機能を無料公開中</b> です。
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {plans.map((p, i) => (
            <div key={i} className="lp-card" style={{
              padding: 30, position: 'relative',
              border: p.featured ? '2px solid var(--accent)' : '1px solid rgba(15,23,42,.06)',
              transform: p.featured ? 'scale(1.03)' : 'scale(1)',
              boxShadow: p.featured ? '0 10px 30px rgba(2,132,199,.18)' : undefined,
              opacity: p.future ? 0.85 : 1,
            }}>
              {p.featured && (
                <div style={{
                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                  padding: '4px 14px',
                  background: 'linear-gradient(120deg, #2563eb, #22d3ee)',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  borderRadius: 99, letterSpacing: '0.04em',
                  boxShadow: '0 4px 12px rgba(2,132,199,.3)',
                }}>NOW FREE — 期間限定</div>
              )}
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>{p.desc}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                {p.unit ? (
                  <>
                    <span style={{ fontSize: 14, color: 'var(--sub)' }}>¥</span>
                    <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', fontFeatureSettings: '"tnum"' }}>{p.price}</span>
                    <span style={{ fontSize: 14, color: 'var(--sub)' }}>{p.unit !== '円' && p.unit}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{p.price}</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 22 }}>{p.sub}</div>
              {p.featured ? (
                <a href="/signin" className="lp-btn lp-btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}>
                  {p.cta}
                </a>
              ) : (
                <button className="lp-btn lp-btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}>
                  {p.cta}
                </button>
              )}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.bullets.map((b, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={p.featured ? 'var(--accent)' : 'var(--success)'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}><path d="m5 12 5 5L20 7" /></svg>
                    {b}
                  </li>
                ))}
              </ul>
              {p.notes && p.notes.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0 0', display: 'flex', flexDirection: 'column', gap: 5, borderTop: '1px dashed rgba(15,23,42,.1)', paddingTop: 12 }}>
                  {p.notes.map((n, k) => (
                    <li key={k} style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ marginTop: 1, flexShrink: 0 }}>※</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FAQ
   ============================================================ */
function LPFAQ() {
  const faqs = [
    {
      q: '本当に無料で全機能が使えますか？',
      a: 'はい。現在 AI WorkSpace はベータ期間として、すべての機能を無料で公開しています。今後 Business / Enterprise プランがリリースされる際は、事前にメールでお知らせします。Free プランで利用を続けることも可能です。',
    },
    {
      q: '導入するには何が必要ですか？',
      a: 'Google アカウントがあれば、3 分で利用を開始できます。クレジットカード登録は不要です。チームで使う場合は、メンバーをメールで招待するだけで自動的にワークスペースに参加できます。',
    },
    {
      q: 'Google カレンダー / Gmail 以外との連携はできますか？',
      a: 'Slack と Notion との連携を順次リリース予定です。API も公開しているため、独自ツールとの連携も可能です。',
    },
    {
      q: 'AI（MyCOO）は何のモデルを使っていますか？',
      a: '最新の Claude 系モデルを採用しています。タスクの優先度判断や振り返りの問い生成など、用途ごとに最適化したプロンプトを社内で運用しています。データは学習に使用されません。',
    },
    {
      q: 'スマートフォンでも使えますか？',
      a: 'iOS / Android のアプリを提供しています。タスク追加・通知・KPT 記入はモバイルアプリから行えます。',
    },
    {
      q: 'セキュリティはどうなっていますか？',
      a: 'すべての通信は TLS 1.3 で暗号化、保存データは AES-256 で暗号化されています。SOC 2 取得に向けて準備中です。',
    },
  ];
  return (
    <section className="lp-section" id="faq">
      <div className="lp-container" style={{ maxWidth: 820 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="lp-h2-sub">FAQ</div>
          <h2 className="lp-h2" style={{ margin: 0 }}>よくある質問</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {faqs.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} defaultOpen={i === 0} />)}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a, defaultOpen }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className="lp-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', padding: '18px 22px',
        background: 'transparent', border: 0, cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'left',
      }}>
        <span style={{
          width: 24, height: 24, borderRadius: 99,
          background: open ? 'var(--accent)' : 'var(--accent-soft)',
          color: open ? '#fff' : 'var(--accent-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
          transition: 'background .15s',
        }}>Q</span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{q}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s', flexShrink: 0 }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div style={{ padding: '0 22px 20px 60px', fontSize: 13.5, lineHeight: 1.8, color: 'var(--sub)' }}>
          {a}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   フッター
   ============================================================ */
function LPFooter() {
  return (
    <footer style={{ background: 'rgba(15,23,42,.04)', borderTop: '1px solid rgba(15,23,42,.06)', padding: '56px 24px 24px' }}>
      <div className="lp-container">
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 36, marginBottom: 40 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <img src="/icon.png" width="28" height="28" alt="AI WorkSpace" style={{ borderRadius: 6 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>AI WorkSpace</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.7, margin: '0 0 14px 0', maxWidth: 320 }}>
              タスク・メール・カレンダー・会議・振り返り・目標管理を 1 つにまとめた業務運用 OS。
              AI が今日の優先タスクを毎朝整理します。
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {['x', 'fb', 'note'].map((s, i) => (
                <div key={i} style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'rgba(255,255,255,.7)',
                  border: '1px solid rgba(15,23,42,.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--sub)', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer',
                }}>{s}</div>
              ))}
            </div>
          </div>
          {[
            { h: 'プロダクト', l: ['特徴・機能', '料金プラン', 'ダウンロード'] },
            { h: 'リソース',   l: ['ヘルプ', 'API ドキュメント', 'お役立ち資料', '公式ブログ'] },
            { h: '会社情報',   l: ['会社概要', '採用情報', 'プライバシーポリシー', 'お問い合わせ'] },
          ].map((c, i) => (
            <div key={i}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>{c.h}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.l.map((it, j) => (
                  <a key={j} href="#" style={{ fontSize: 13, color: 'var(--sub)', textDecoration: 'none' }}>{it}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 24, borderTop: '1px solid rgba(15,23,42,.06)',
          fontSize: 12, color: 'var(--muted)',
        }}>
          <span>© 2026 AI WorkSpace</span>
          <div style={{ display: 'flex', gap: 18 }}>
            <a href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>利用規約</a>
            <a href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>プライバシー</a>
            <a href="#" style={{ color: 'var(--muted)', textDecoration: 'none' }}>セキュリティ</a>
          </div>
        </div>
      </div>
    </footer>
  );
}



export default LandingPage

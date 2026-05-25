"use client"
import * as React from 'react'
import { useState, useEffect } from 'react'
import Icon from './Icon'
// screens/tour.jsx — 3分で分かるツアー
// 8ステップのスライドショー形式。各ステップで主要機能を簡潔に紹介

const TOUR_STEPS = [
  {
    kind: 'intro',
    title: 'AI WorkSpace を 3 分で',
    sub: 'タスク・目標・振り返り・会議・組織・AI コーチを 1 つにまとめた業務 OS',
    body: '8 つのステップで、AI WorkSpace で何ができるかを一気に体験できます。',
  },
  {
    n: '01', label: 'タスク管理', tone: 'accent',
    title: '自然文で書くだけで、タスクになる',
    body: '「明日 11時 クライアントに提案資料を送る」のように普通の日本語で書くと、AI が日付・目標・担当を解析。チャットに書くような感覚でタスクが溜まります。',
    mockup: 'task',
  },
  {
    n: '02', label: '目標管理', tone: 'success',
    title: '目標は常に画面の一番上に',
    body: 'チームと個人の目標が画面上部にスティッキー表示。週次アクションを書きながら、「何のための行動か」を意識し続けられます。',
    mockup: 'goal',
  },
  {
    n: '03', label: '振り返り', tone: 'warn',
    title: '今日も書きたくなる KPT',
    body: '連続記入のストリーク表示、Keep / Problem / Try それぞれに対応する今日の問い。「書かないと怒られる」設計から「書きたくなる」体験に。',
    mockup: 'reflection',
  },
  {
    n: '04', label: '会議管理', tone: 'info',
    title: 'アジェンダから議事録、タスクまで一貫',
    body: '会議のアジェンダと議事録を 1 つのテンプレで管理。決定事項をクリック 1 つでタスク化し、議論したことがそのまま動き出します。',
    mockup: 'meeting',
  },
  {
    n: '05', label: '組織管理', tone: 'accent',
    title: '誰が何を担当しているか、一目で',
    body: '部門階層と担当が 1 つのツリーで見える化。役割ベースで権限を制御でき、新メンバーも迷いません。',
    mockup: 'org',
  },
  {
    n: '06', label: 'AI コーチ MyCOO', tone: 'info',
    title: '毎朝、AI が「今日のあなた」を整える',
    body: 'メール・カレンダー・タスクから優先度を AI が判断し、今日着手すべき 3 件を提示。目標からの逆算で「やらないこと」も提案します。',
    mockup: 'ai',
  },
  {
    kind: 'cta',
    title: '今すぐ、3 分ではじめる',
    sub: 'クレジットカード不要 · Google アカウントですぐに使い始められます',
  },
];

function TourPage() {
  const [idx, setIdx] = React.useState(0);
  const total = TOUR_STEPS.length;
  const step = TOUR_STEPS[idx];
  const next = () => setIdx(i => Math.min(total - 1, i + 1));
  const prev = () => setIdx(i => Math.max(0, i - 1));
  const goto = (i) => setIdx(i);

  // キーボード操作
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // localStorage で位置保存（リロード対応）
  React.useEffect(() => {
    const saved = parseInt(localStorage.getItem('tourIdx') || '0', 10);
    if (!isNaN(saved) && saved >= 0 && saved < total) setIdx(saved);
  }, []);
  React.useEffect(() => { localStorage.setItem('tourIdx', String(idx)); }, [idx]);

  const isIntro = step.kind === 'intro';
  const isCta = step.kind === 'cta';

  return (
    <div data-theme="glass" style={{
      width: '100%', minHeight: '100vh',
      fontFamily: '"Inter", "Noto Sans JP", system-ui, sans-serif',
      color: 'var(--text)', fontFeatureSettings: '"palt" 1',
      background:
        'radial-gradient(1200px 800px at 8% 0%, rgba(186,230,253,.55), transparent 60%),' +
        'radial-gradient(1100px 900px at 100% 22%, rgba(187,247,208,.45), transparent 60%),' +
        'radial-gradient(900px 700px at 80% 100%, rgba(224,242,254,.6), transparent 60%),' +
        'linear-gradient(180deg, #f6fafd 0%, #eef4f9 100%)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <style>{`
        [data-theme="glass"] {
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
          --info:          #0284c7;
          --info-soft:     rgba(2,132,199,.14);
        }
        .tour-card {
          background: rgba(255,255,255,.78);
          backdrop-filter: blur(22px) saturate(160%);
          -webkit-backdrop-filter: blur(22px) saturate(160%);
          border: 1px solid rgba(15,23,42,.06);
          border-radius: 22px;
          box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 6px 28px rgba(15,23,42,.06);
        }
        .tour-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 22px; font-size: 14px; font-weight: 600;
          border-radius: 99px; cursor: pointer; border: none;
          font-family: inherit; transition: transform .12s, box-shadow .12s;
        }
        .tour-btn:hover { transform: translateY(-1px); }
        .tour-btn-primary {
          background: linear-gradient(120deg, #2563eb 0%, #22d3ee 100%);
          color: #fff;
          box-shadow: 0 4px 14px rgba(37,99,235,.32), inset 0 1px 0 rgba(255,255,255,.3);
        }
        .tour-btn-ghost {
          background: rgba(255,255,255,.7); color: var(--text);
          border: 1px solid rgba(15,23,42,.1);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tour-slide { animation: fadeIn .35s cubic-bezier(.16,1,.3,1); }
        .tour-mock-wrap {
          background: rgba(255,255,255,.5);
          border: 1px solid rgba(15,23,42,.05);
          border-radius: 14px;
          padding: 16px;
        }
      `}</style>

      {/* Top bar */}
      <header style={{
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', gap: 14,
        borderBottom: '1px solid rgba(15,23,42,.06)',
        background: 'rgba(255,255,255,.6)',
        backdropFilter: 'blur(18px)',
      }}>
        <a href="/lp" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/icon.png" width="28" height="28" alt="AI WorkSpace" style={{ borderRadius: 6 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>AI WorkSpace</span>
        </a>
        <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-text)', letterSpacing: '0.04em' }}>
          3 分で分かるツアー
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
          {idx + 1} / {total}
        </span>
        <a href="/lp" style={{
          fontSize: 12, color: 'var(--sub)', textDecoration: 'none',
          padding: '6px 10px', borderRadius: 7,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>閉じる <Icon name="cross" size={12} /></a>
      </header>

      {/* Progress dots */}
      <div style={{
        padding: '14px 28px 0',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {TOUR_STEPS.map((_, i) => (
          <button key={i} onClick={() => goto(i)} style={{
            flex: 1, height: 4, padding: 0, border: 0, borderRadius: 99,
            background: i < idx ? 'var(--accent)' :
                        i === idx ? 'linear-gradient(90deg, var(--accent), rgba(14,165,233,.3))' :
                        'rgba(15,23,42,.08)',
            cursor: 'pointer',
            transition: 'background .25s',
          }} />
        ))}
      </div>

      {/* Slide content */}
      <div key={idx} className="tour-slide" style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 28px',
      }}>
        {isIntro ? <IntroSlide step={step} onNext={next} />
         : isCta ? <CtaSlide step={step} onPrev={prev} />
         : <StepSlide step={step} idx={idx} total={total - 2} />}
      </div>

      {/* Bottom controls */}
      {!isIntro && !isCta && (
        <footer style={{
          padding: '16px 28px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button className="tour-btn tour-btn-ghost" onClick={prev}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            戻る
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
            <Kbd2>←</Kbd2> <Kbd2>→</Kbd2> でも移動できます
          </div>
          <button className="tour-btn tour-btn-primary" onClick={next}>
            次へ
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </footer>
      )}
    </div>
  );
}

function Kbd2({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, padding: '0 5px',
      fontSize: 10.5, fontWeight: 600, color: 'var(--sub)',
      background: 'rgba(255,255,255,.7)', border: '1px solid rgba(15,23,42,.1)',
      borderRadius: 4, fontFamily: 'ui-monospace, monospace',
    }}>{children}</span>
  );
}

function IntroSlide({ step, onNext }) {
  return (
    <div className="tour-card" style={{
      padding: 56, maxWidth: 720, textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', background: 'var(--warn-soft)', color: 'var(--warn)',
        border: '1px solid rgba(217,119,6,.3)', borderRadius: 99,
        fontSize: 11.5, fontWeight: 600,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--warn)' }} />
        現在 主要機能を無料公開中
      </div>
      <h1 style={{
        fontSize: 44, fontWeight: 700, letterSpacing: '-0.02em',
        lineHeight: 1.25, margin: 0, color: 'var(--text)',
      }}>{step.title}</h1>
      <p style={{
        fontSize: 16, color: 'var(--sub)', lineHeight: 1.75, margin: 0, maxWidth: 540,
      }}>{step.sub}</p>
      <p style={{
        fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, margin: '6px 0 0', maxWidth: 540,
      }}>{step.body}</p>
      <button className="tour-btn tour-btn-primary" onClick={onNext} style={{ marginTop: 14, padding: '14px 28px', fontSize: 15 }}>
        ツアーをはじめる
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </button>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
        <span>所要時間 約 3 分</span>
        <span>·</span>
        <span>8 ステップ</span>
        <span>·</span>
        <span>キーボードで移動可</span>
      </div>
    </div>
  );
}

function CtaSlide({ step, onPrev }) {
  return (
    <div className="tour-card" style={{
      padding: 0, maxWidth: 720, width: '100%',
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        padding: 56, textAlign: 'center',
        background: 'linear-gradient(120deg, #1e40af 0%, #2563eb 45%, #22d3ee 100%)',
        color: '#fff', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 240, height: 240,
          background: 'radial-gradient(circle, rgba(255,255,255,.18), transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: -80, left: -40, width: 220, height: 220,
          background: 'radial-gradient(circle, rgba(187,247,208,.25), transparent 70%)',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 12px', marginBottom: 18,
            background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)',
            borderRadius: 99, fontSize: 11.5, fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#fde68a' }} />
            ツアー完了 <Icon name="sparkle" size={13} />
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25, margin: '0 0 12px 0' }}>
            {step.title}
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.88)', margin: '0 0 32px 0', lineHeight: 1.7 }}>
            {step.sub}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/signin" className="tour-btn" style={{
              background: '#fff', color: '#2563eb',
              padding: '14px 28px', fontSize: 15, fontWeight: 700,
              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
              textDecoration: 'none',
            }}>
              無料ではじめる
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
            </a>
            <a href="/lp" className="tour-btn" style={{
              background: 'rgba(255,255,255,.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,.3)',
              padding: '14px 24px', fontSize: 13, fontWeight: 500,
              backdropFilter: 'blur(8px)', textDecoration: 'none',
            }}>
              サービスページに戻る
            </a>
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
        <button className="tour-btn tour-btn-ghost" onClick={onPrev}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          ツアーをもう一度見る
        </button>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          クレジットカード不要 · 3 分で利用開始
        </span>
      </div>
    </div>
  );
}

function StepSlide({ step, idx, total }) {
  const toneFg = {
    accent:  'var(--accent-text)',
    success: 'var(--success)',
    warn:    'var(--warn)',
    info:    '#1d4ed8',
  }[step.tone];
  const toneBg = {
    accent:  'rgba(14,165,233,.12)',
    success: 'rgba(5,150,105,.12)',
    warn:    'rgba(217,119,6,.12)',
    info:    'rgba(37,99,235,.12)',
  }[step.tone];
  return (
    <div className="tour-card" style={{
      padding: 0, maxWidth: 1080, width: '100%',
      display: 'grid', gridTemplateColumns: '1fr 1.05fr',
      overflow: 'hidden', minHeight: 460,
    }}>
      {/* 左: テキスト */}
      <div style={{ padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: 'var(--muted)',
            fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em',
          }}>STEP {step.n}</span>
          <span style={{ width: 18, height: 1, background: 'var(--border)' }} />
          <span style={{
            padding: '3px 10px', background: toneBg, color: toneFg,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', borderRadius: 99,
          }}>{step.label}</span>
        </div>
        <h2 style={{
          fontSize: 30, fontWeight: 700, letterSpacing: '-0.015em',
          lineHeight: 1.3, margin: '0 0 18px 0', color: 'var(--text)',
        }}>{step.title}</h2>
        <p style={{
          fontSize: 14, lineHeight: 1.85, color: 'var(--sub)', margin: 0,
        }}>{step.body}</p>
      </div>
      {/* 右: モックアップ */}
      <div style={{
        padding: 32,
        background: 'linear-gradient(160deg, rgba(186,230,253,.25) 0%, rgba(187,247,208,.15) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderLeft: '1px solid rgba(15,23,42,.05)',
      }}>
        <div className="tour-mock-wrap" style={{ width: '100%', maxWidth: 420 }}>
          <StepMockup kind={step.mockup} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ステップごとのモックアップ（LP のものを拡大版で再利用）
   ============================================================ */
function StepMockup({ kind }) {
  if (kind === 'task') return <TaskTourMock />;
  if (kind === 'goal') return <GoalTourMock />;
  if (kind === 'reflection') return <ReflectionTourMock />;
  if (kind === 'meeting') return <MeetingTourMock />;
  if (kind === 'org') return <OrgTourMock />;
  if (kind === 'ai') return <AITourMock />;
  return null;
}

function TaskTourMock() {
  return (
    <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ebebee' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 10 }}>クイック追加</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 14px',
        background: 'rgba(14,165,233,.06)',
        border: '1px solid rgba(14,165,233,.25)', borderRadius: 9,
        marginBottom: 12,
      }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </div>
        <span style={{ fontSize: 13, color: '#18181b', flex: 1 }}>
          明日 11時 クライアントに提案資料を送る
          <span style={{ color: 'var(--accent-text)' }}> #目標2</span>
          <span style={{ display: 'inline-block', width: 1, height: 13, background: 'var(--accent)', verticalAlign: 'middle', marginLeft: 2, animation: 'blink 1s infinite' }} />
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: 11, background: 'var(--info-soft)', color: 'var(--info)', borderRadius: 99 }}><Icon name="calendar" size={11} /> 明日 11:00</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: 11, background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 99 }}><Icon name="target" size={11} /> 目標2 売上</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: 11, background: 'var(--success-soft)', color: 'var(--success)', borderRadius: 99 }}><Icon name="user" size={11} /> 自分</span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 6, paddingTop: 10, borderTop: '1px dashed #ebebee' }}>今日やること</div>
      {['新規提案資料を最終レビューして送付', 'Q2 マーケティング会議 アジェンダ作成', '製品デモのシナリオをチームと確認'].map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < 2 ? '1px solid #f4f4f5' : 'none' }}>
          <span style={{ width: 13, height: 13, borderRadius: 99, border: '1.5px solid #d8d8dd', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: '#18181b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>今日</span>
        </div>
      ))}
    </div>
  );
}

function GoalTourMock() {
  return (
    <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ebebee' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, padding: '10px 12px', background: 'rgba(5,150,105,.06)', border: '1px solid rgba(5,150,105,.2)', borderRadius: 9 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--success-soft)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ padding: '1px 7px', fontSize: 9.5, fontWeight: 700, background: 'var(--success-soft)', color: 'var(--success)', borderRadius: 99, letterSpacing: '0.06em' }}>目標</span>
            <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>Q2 · 通期</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#18181b', marginBottom: 6, lineHeight: 1.4 }}>
            サービスを全国に広げ、顧客の信頼を獲得する
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 4, background: 'var(--sunken)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: '34%', height: '100%', background: 'var(--success)' }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sub)' }}>34%</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8 }}>今週の Good / More / Focus</div>
      {[
        { s: 'good', mark: '✓', label: 'Good', t: '商談化率が +8pt' },
        { s: 'focus', mark: '◎', label: 'Focus', t: '今週は提案 3 件に集中' },
        { s: 'more', mark: '▲', label: 'More', t: '受注決裁プロセスの改善' },
      ].map((k, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < 2 ? '1px solid #f4f4f5' : 'none' }}>
          <span style={{
            width: 18, height: 18, borderRadius: 5,
            background: { good: 'var(--success-soft)', focus: 'var(--accent-soft)', more: 'var(--warn-soft)' }[k.s],
            color:      { good: 'var(--success)',      focus: 'var(--accent-text)', more: 'var(--warn)'      }[k.s],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
          }}>{k.mark}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', width: 40 }}>{k.label}</span>
          <span style={{ fontSize: 11.5, color: '#18181b' }}>{k.t}</span>
        </div>
      ))}
    </div>
  );
}

function ReflectionTourMock() {
  return (
    <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ebebee' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.06em' }}>連続記入</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 'auto', padding: '2px 9px', fontSize: 10, fontWeight: 700, background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 99 }}><Icon name="bolt" size={10} /> 継続中</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color: '#18181b' }}>2</span>
        <span style={{ fontSize: 13, color: 'var(--sub)' }}>日</span>
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>自己ベスト 11日</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 14 }}>
        今日も書いて <b style={{ color: '#18181b' }}>3日</b> にしましょう。
        あと <b style={{ color: 'var(--warn)' }}>14日</b> で皆勤バッジが手に入ります。
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 6, paddingTop: 10, borderTop: '1px dashed #ebebee' }}>今日の問い</div>
      {[
        { dot: 'var(--success)', label: 'Keep', q: '今日うまくいったことは？' },
        { dot: 'var(--warn)',    label: 'Problem', q: 'もっとうまくやれたことは？' },
        { dot: 'var(--info)',    label: 'Try', q: '明日試したい小さなことは？' },
      ].map((k, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < 2 ? '1px solid #f4f4f5' : 'none' }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: k.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', width: 56, letterSpacing: '0.05em' }}>{k.label.toUpperCase()}</span>
          <span style={{ fontSize: 11.5, color: '#18181b', flex: 1 }}>{k.q}</span>
        </div>
      ))}
    </div>
  );
}

function MeetingTourMock() {
  return (
    <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ebebee' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, background: 'rgba(37,99,235,.12)', color: '#1d4ed8', borderRadius: 99, letterSpacing: '0.06em' }}>会議</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#18181b', flex: 1 }}>Q2 マーケティング定例</span>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>5/21 14:00</span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 6 }}>アジェンダ</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {['Q2 進捗の確認', '新キャンペーンの提案', '6月のリソース調整'].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#18181b' }}>
            <span style={{ width: 16, height: 16, fontSize: 9, fontWeight: 700, color: 'var(--muted)', background: 'var(--sunken)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            {t}
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 10, borderTop: '1px dashed #ebebee' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', letterSpacing: '0.06em', marginBottom: 6 }}>決定 → タスク化</div>
        {['来週水曜までにキャンペーン案を共有 — @佐藤', 'デザインレビューを Slack で実施 — @鈴木'].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', fontSize: 11, color: '#18181b' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" style={{ marginTop: 2, flexShrink: 0 }}><path d="m5 12 5 5L20 7" /></svg>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrgTourMock() {
  const tree = [
    { lvl: 0, n: '株式会社サンプル', count: 38 },
    { lvl: 1, n: 'プロダクト本部', count: 14 },
    { lvl: 2, n: 'エンジニアリング', count: 8, active: true },
    { lvl: 2, n: 'デザイン', count: 4 },
    { lvl: 2, n: 'プロダクトマネジメント', count: 2 },
    { lvl: 1, n: '営業本部', count: 12 },
    { lvl: 1, n: 'コーポレート', count: 12 },
  ];
  return (
    <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ebebee' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 10 }}>組織階層</div>
      {tree.map((d, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px',
          paddingLeft: 8 + d.lvl * 14,
          background: d.active ? 'rgba(14,165,233,.08)' : 'transparent',
          borderRadius: 6,
          marginBottom: 1,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={d.active ? 'var(--accent-text)' : 'var(--muted)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {d.lvl === 0
              ? <path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M3 21h18M10 8h4M10 12h4M10 16h4" />
              : <path d="M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6m-6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6m12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
            }
          </svg>
          <span style={{ flex: 1, fontSize: 12, fontWeight: d.active ? 600 : 500, color: d.active ? 'var(--accent-text)' : '#18181b' }}>{d.n}</span>
          <span style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>{d.count}人</span>
        </div>
      ))}
    </div>
  );
}

function AITourMock() {
  return (
    <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #ebebee' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 99, flexShrink: 0,
          background: 'conic-gradient(from 180deg, #2563eb, #22d3ee, #059669, #2563eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 22, height: 22, borderRadius: 99, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8" /></svg>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-text)', letterSpacing: '0.06em' }}>MyCOO · 今朝の提案</div>
          <div style={{ fontSize: 12.5, color: '#18181b', lineHeight: 1.6, marginTop: 4 }}>
            今日は <b>提案資料の仕上げ</b> から取り掛かることをお勧めします。
            14:00 の定例 MTG までに 90 分集中できそうです。
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8, paddingTop: 10, borderTop: '1px dashed #ebebee' }}>今日着手すべき 3 件</div>
      {[
        { n: 1, t: '新規提案資料を最終レビューして送付', tag: '90分' },
        { n: 2, t: 'Q2 マーケティング会議 アジェンダ作成', tag: '30分' },
        { n: 3, t: '製品デモのシナリオをチームと確認', tag: '20分' },
      ].map((it) => (
        <div key={it.n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: it.n < 3 ? '1px solid #f4f4f5' : 'none' }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{it.n}</span>
          <span style={{ fontSize: 11.5, color: '#18181b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.t}</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>{it.tag}</span>
        </div>
      ))}
    </div>
  );
}



export default TourPage

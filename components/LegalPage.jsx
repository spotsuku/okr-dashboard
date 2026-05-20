'use client'
import { COMMON_TOKENS, SPACING, RADIUS, TYPO, SHADOWS } from '../lib/themeTokens'

const T = COMMON_TOKENS.light

export default function LegalPage({ title, lastUpdated, sections }) {
  return (
    <div style={{
      minHeight: '100vh',
      padding: `${SPACING['3xl']}px ${SPACING.lg}px`,
      display: 'flex', justifyContent: 'center',
    }}>
      <article style={{
        width: '100%', maxWidth: 820,
        background: T.bgCard,
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        border: `1px solid ${T.border}`,
        borderRadius: RADIUS.xl,
        boxShadow: SHADOWS.md,
        padding: `${SPACING['2xl']}px ${SPACING.xl}px`,
      }}>
        <header style={{ marginBottom: SPACING.xl, borderBottom: `1px solid ${T.borderLight}`, paddingBottom: SPACING.lg }}>
          <a href="/" style={{
            ...TYPO.footnote, color: T.accent, textDecoration: 'none', fontWeight: 700,
          }}>← トップへ戻る</a>
          <h1 style={{ ...TYPO.largeTitle, color: T.text, margin: `${SPACING.sm}px 0 0` }}>
            {title}
          </h1>
          {lastUpdated && (
            <p style={{ ...TYPO.footnote, color: T.textMuted, margin: `${SPACING.xs}px 0 0` }}>
              最終更新日: {lastUpdated}
            </p>
          )}
        </header>

        {sections.map((sec, i) => (
          <section key={i} style={{ marginBottom: SPACING.xl }}>
            <h2 style={{
              ...TYPO.title3, color: T.text,
              margin: `0 0 ${SPACING.sm}px`,
            }}>
              {i + 1}. {sec.heading}
            </h2>
            {sec.paragraphs?.map((p, j) => (
              <p key={j} style={{
                ...TYPO.body, color: T.textSub,
                margin: `0 0 ${SPACING.sm}px`, lineHeight: 1.8,
              }}>{p}</p>
            ))}
            {sec.list && (
              <ul style={{
                ...TYPO.body, color: T.textSub,
                paddingLeft: SPACING.lg, margin: `0 0 ${SPACING.sm}px`, lineHeight: 1.8,
              }}>
                {sec.list.map((item, k) => (
                  <li key={k} style={{ marginBottom: SPACING.xs }}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <footer style={{
          marginTop: SPACING['2xl'],
          paddingTop: SPACING.lg,
          borderTop: `1px solid ${T.borderLight}`,
          ...TYPO.footnote, color: T.textMuted,
          textAlign: 'center',
        }}>
          © {new Date().getFullYear()} AI WorkSpace / aiworkspace.jp
        </footer>
      </article>
    </div>
  )
}

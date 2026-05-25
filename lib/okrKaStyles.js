// OKR 週次 Good/More/Focus テーブルの寸法・体裁 (唯一の正)。
// 行ロジック(自動保存/並び替え)はビュー側のまま、見た目寸法だけ共通化する。
export function kaCellStyle(T) {
  return {
    padding: '8px 12px',
    borderBottom: `1px solid ${T.border}`,
    borderRight: `1px solid ${T.border}`,
    verticalAlign: 'top',
    fontSize: 12,
  }
}

export function kaTextareaStyle(T) {
  return {
    width: '100%', boxSizing: 'border-box',
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8,
    padding: '8px 10px', color: T.text, fontSize: 11.5,
    outline: 'none', fontFamily: 'inherit', resize: 'none',
    lineHeight: 1.5, minHeight: 48, overflow: 'hidden',
    transition: 'border-color 0.15s',
  }
}

export function kaHeaderCellStyle(T) {
  return {
    padding: '8px 12px', fontSize: 10.5, fontWeight: 700,
    color: T.textMuted, textAlign: 'left',
    borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
    letterSpacing: '0.04em',
  }
}

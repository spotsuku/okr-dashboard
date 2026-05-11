import React from 'react'

const URL_RE = /(https?:\/\/[^\s<>"']+)/g
const TRAIL_RE = /[.,;:!?)\]}」』]+$/

export function renderTextWithLinks(text, { color = '#007AFF' } = {}) {
  if (text == null || text === '') return text
  const parts = String(text).split(URL_RE)
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part
    const trail = (part.match(TRAIL_RE) || [''])[0]
    const url = trail ? part.slice(0, -trail.length) : part
    return React.createElement(
      React.Fragment,
      { key: i },
      React.createElement(
        'a',
        {
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
          onClick: (e) => e.stopPropagation(),
          style: { color, textDecoration: 'underline', wordBreak: 'break-all' },
        },
        url,
      ),
      trail,
    )
  })
}

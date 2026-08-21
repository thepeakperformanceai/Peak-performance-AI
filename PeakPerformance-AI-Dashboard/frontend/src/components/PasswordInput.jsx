import React, { useState } from 'react'

/**
 * Password field with a show/hide eye toggle.
 * Drop-in replacement for <input type="password" style={input} ... />.
 * Pass the same `style` object you used for other inputs; the wrapper keeps
 * the field full-width and places the eye button inside on the right.
 */
const EyeOpen = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export default function PasswordInput({ style, ...props }) {
  const [show, setShow] = useState(false)
  // reserve room on the right for the eye button; remove the input's own margin
  // (we put it on the wrapper) so spacing matches the other fields.
  const { marginBottom, ...inputStyleRest } = style || {}
  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: marginBottom ?? '12px' }}>
      <input
        {...props}
        type={show ? 'text' : 'password'}
        style={{ ...inputStyleRest, width: '100%', marginBottom: 0, paddingRight: 42 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
          background: 'none', border: 'none', padding: 4, cursor: 'pointer',
          color: '#8b99a6', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        tabIndex={-1}
      >
        {show ? <EyeOff /> : <EyeOpen />}
      </button>
    </div>
  )
}
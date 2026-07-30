import { useRef, useEffect } from 'react'

/**
 * Six single-character boxes that behave like one field.
 * Handles arrow keys, backspace across boxes, and pasting a whole code.
 */
export default function OtpInput({ value, onChange, onComplete, disabled }) {
  const refs = useRef([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  useEffect(() => { refs.current[0]?.focus() }, [])

  const setAt = (i, char) => {
    const next = value.padEnd(6, ' ').split('')
    next[i] = char
    const joined = next.join('').replace(/\s/g, '')
    onChange(joined)
    return joined
  }

  const handleChange = (i) => (e) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1)
    if (!char) return
    const joined = setAt(i, char)
    if (i < 5) refs.current[i + 1]?.focus()
    if (joined.length === 6) onComplete?.(joined)
  }

  const handleKeyDown = (i) => (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[i].trim()) {
        setAt(i, ' ')
      } else if (i > 0) {
        setAt(i - 1, ' ')
        refs.current[i - 1]?.focus()
      }
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    onChange(pasted)
    refs.current[Math.min(pasted.length, 5)]?.focus()
    if (pasted.length === 6) onComplete?.(pasted)
  }

  return (
    <div className="flex gap-2 justify-between" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={d.trim()}
          onChange={handleChange(i)}
          onKeyDown={handleKeyDown(i)}
          className="w-11 py-3 text-center text-lg font-semibold rounded-lg border border-gray-200
                     outline-none focus:border-pp-orange focus:ring-1 focus:ring-pp-orange disabled:bg-gray-50"
        />
      ))}
    </div>
  )
}
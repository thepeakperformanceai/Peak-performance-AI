import { passwordChecks } from '../utils/password'

function Req({ ok, children }) {
  return (
    <li className={ok ? 'text-green-600 flex items-center gap-1.5' : 'text-gray-400 flex items-center gap-1.5'}>
      <span>{ok ? '✓' : '○'}</span>{children}
    </li>
  )
}

// Live password requirements. Renders nothing until the user starts typing.
export default function PasswordChecklist({ value }) {
  if (!value) return null
  const c = passwordChecks(value)
  return (
    <ul className="text-[11px] space-y-1 pl-0.5">
      <Req ok={c.length}>At least 8 characters</Req>
      <Req ok={c.capital}>One capital letter (A–Z)</Req>
      <Req ok={c.special}>One special character (!@#$…)</Req>
    </ul>
  )
}
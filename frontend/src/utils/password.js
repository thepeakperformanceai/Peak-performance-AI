// One place that defines the password policy, mirrored by the backend's isStrongPassword().
export const PASSWORD_RULE =
  'Password must be at least 8 characters and include a capital letter and a special character.'

export const passwordChecks = (pw = '') => ({
  length:  pw.length >= 8,
  capital: /[A-Z]/.test(pw),
  special: /[^A-Za-z0-9]/.test(pw),
})

export const isStrongPassword = (pw = '') =>
  Object.values(passwordChecks(pw)).every(Boolean)
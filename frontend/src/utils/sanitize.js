const INJECTION_PATTERNS = [
  /ignore (all |previous |above )?instructions/gi,
  /system prompt/gi,
  /you are now/gi,
  /\[INST\]/g,
  /<<SYS>>/g,
  /<\|im_start\|>/g,
  /assistant:/gi,
  /human:/gi,
]

export const sanitizeInput = (text = '') => {
  if (typeof text !== 'string') return ''
  return INJECTION_PATTERNS
    .reduce((str, pattern) => str.replace(pattern, ''), text)
    .trim()
}

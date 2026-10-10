// Redactor de logs y de evidencias (05/10/2026). Las credenciales de portal viven SOLO en los fly
// secrets del worker; ni BD, ni Vercel, ni logs, ni traces. Este redactor es la última red: todo lo
// que sale del worker (líneas de log, mensaje de error, HTML de evidencia) pasa por aquí.

export const MARCA_REDACTADO = '[REDACTADO]'

/** Secretos de menos de 4 caracteres no se redactan (borrarían medio log); se avisa al cargarlos. */
const MIN_LONGITUD = 4

/** Nombres de variable cuyo VALOR es un secreto que nunca puede salir del worker. */
export function esVariableSecreta(nombre: string): boolean {
  return /^CRED_/.test(nombre) || /(SECRET|TOKEN|PASS|PASSWORD|KEY)/i.test(nombre)
}

/** Los valores secretos del entorno (CRED_* y similares), del más largo al más corto. */
export function secretosDelEntorno(env: Record<string, string | undefined>): string[] {
  const vals = new Set<string>()
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string' && v.length >= MIN_LONGITUD && esVariableSecreta(k)) vals.add(v)
  }
  return [...vals].sort((a, b) => b.length - a.length)
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Sustituye cada secreto (literal y en sus formas codificadas en URL / base64) por la marca, y
 * además cualquier `Authorization: Bearer …` y `password=…`/`"password":"…"` que aparezca aunque no
 * se conozca su valor.
 */
export function redactar(texto: string, secretos: readonly string[]): string {
  let out = String(texto)
  for (const s of secretos) {
    if (!s || s.length < MIN_LONGITUD) continue
    const formas = new Set([s, encodeURIComponent(s), b64(s)])
    for (const f of formas) out = out.replace(new RegExp(escaparRegex(f), 'g'), MARCA_REDACTADO)
  }
  out = out.replace(/(authorization\s*[:=]\s*["']?bearer\s+)[^\s"',;]+/gi, `$1${MARCA_REDACTADO}`)
  out = out.replace(/((?:password|passwd|contrase(?:ñ|n)a|pwd|pass)["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi, `$1${MARCA_REDACTADO}`)
  return out
}

/** HTML de evidencia: además de `redactar`, vacía el `value` de cualquier input de contraseña. */
export function redactarHtml(html: string, secretos: readonly string[]): string {
  const sinValores = String(html).replace(/<input\b[^>]*>/gi, (tag) =>
    /type\s*=\s*["']?password/i.test(tag) ? tag.replace(/\bvalue\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, `value="${MARCA_REDACTADO}"`) : tag,
  )
  return redactar(sinValores, secretos)
}

/** Crea una función de log que nunca deja pasar un secreto. */
export function crearRedactor(secretos: readonly string[]): (texto: string) => string {
  const copia = [...secretos].sort((a, b) => b.length - a.length)
  return (texto) => redactar(texto, copia)
}

function b64(s: string): string {
  // Sin Buffer (paquete puro): btoa sobre UTF-8.
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return typeof btoa === 'function' ? btoa(bin) : s
}

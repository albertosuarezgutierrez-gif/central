// URL base pública de la app, para construir redirects absolutos (p. ej. el callback tras la
// firma bancaria SCA). Prioriza NEXTAUTH_URL (valor explícito con protocolo); si no, usa el
// VERCEL_URL que Vercel inyecta SIN protocolo; y en local cae a localhost.
// (Sustituye a la expresión con precedencia rota `A ?? B ? C : D` que ignoraba el valor de
//  NEXTAUTH_URL y siempre construía la URL desde VERCEL_URL.)
export function baseUrl(): string {
  const explicit = process.env.NEXTAUTH_URL?.replace(/\/$/, '')
  if (explicit) return explicit
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`
  return 'http://localhost:3000'
}

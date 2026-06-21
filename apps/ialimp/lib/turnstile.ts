// Verificación server-side de Cloudflare Turnstile (CAPTCHA gratuito).
// Si no hay TURNSTILE_SECRET_KEY configurada, NO bloquea (modo preview sin
// claves): así la feature funciona antes de dar de alta el dominio en Cloudflare.
// En cuanto se añade la clave en Vercel, pasa a ser obligatorio.
export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true            // no configurado → no exige captcha
  if (!token) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip && ip !== 'unknown') body.append('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    return data?.success === true
  } catch {
    return false
  }
}

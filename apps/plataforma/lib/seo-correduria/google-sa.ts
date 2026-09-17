// lib/seo-correduria/google-sa.ts — token OAuth de una cuenta de servicio de Google
// (flujo JWT bearer, RS256) para leer Search Console sin usuario delante.
//
// El patrón de carga tolerante de la clave privada está copiado de `lib/enablebanking.ts`
// a propósito: allí no está exportada y compartirla acoplaría la correduría con la banca.
// `fetch` se inyecta (FetchLike) para que los tests no toquen la red.

import { SignJWT } from 'jose'
import { createPrivateKey, type KeyObject } from 'node:crypto'
import type { FetchLike } from './tipos.ts'

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type ConfigCuentaServicio = { clientEmail: string; privateKey: string; scope: string }

// Carga la clave privada desde el valor pegado en la env var, tolerando los estropicios
// típicos del copia-pega y devolviendo un KeyObject listo para firmar:
//  - comillas envolventes y saltos escapados (\n / \r\n) — el JSON de la cuenta de servicio
//    de Google trae la clave con `\n` literales;
//  - PEM en una sola línea (se reconstruye cabecera/pie + cuerpo base64 a 64);
//  - SIN cabecera PEM: cuerpo base64 suelto → DER (pkcs8/pkcs1/sec1) o PEM re-codificado.
export function cargarClavePrivada(raw: string): KeyObject {
  let s = raw.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1)
  s = s.replace(/\\r/g, '').replace(/\\n/g, '\n').trim()

  // Caso A: trae armadura PEM (-----BEGIN ... -----).
  if (s.includes('-----BEGIN')) {
    if (!s.includes('\n')) {
      const m = s.match(/-----BEGIN ([A-Z0-9 ]+?)-----\s*([\s\S]*?)\s*-----END \1-----/)
      if (m) {
        const body = (m[2].replace(/\s+/g, '').match(/.{1,64}/g) ?? []).join('\n')
        s = `-----BEGIN ${m[1].trim()}-----\n${body}\n-----END ${m[1].trim()}-----\n`
      }
    }
    return createPrivateKey(s)
  }

  // Caso B: sin armadura → cuerpo base64 suelto.
  const compact = s.replace(/\s+/g, '')
  const der = Buffer.from(compact, 'base64')
  // (1) ¿es base64 de un PEM completo? Al decodificar aparecerían las líneas -----BEGIN-----.
  const comoTexto = der.toString('utf8')
  if (comoTexto.includes('-----BEGIN')) return createPrivateKey(comoTexto)
  // (2) DER crudo: probar los tres formatos habituales.
  for (const type of ['pkcs8', 'pkcs1', 'sec1'] as const) {
    try { return createPrivateKey({ key: der, format: 'der', type }) } catch { /* siguiente */ }
  }
  // (3) Último intento: envolver el cuerpo como PKCS#8 PEM y dejar que OpenSSL lo intente.
  const pem = `-----BEGIN PRIVATE KEY-----\n${(compact.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`
  return createPrivateKey(pem)
}

/**
 * Firma la aserción JWT de la cuenta de servicio y la canjea por un `access_token`.
 * Claims: iss = clientEmail, aud = endpoint de token, scope, iat, exp = iat + 3600.
 */
export async function tokenCuentaServicio(
  cfg: ConfigCuentaServicio,
  fetch: FetchLike,
  ahora: number = Date.now(),
): Promise<string> {
  const key = cargarClavePrivada(cfg.privateKey)
  const iat = Math.floor(ahora / 1000)
  const assertion = await new SignJWT({ scope: cfg.scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(cfg.clientEmail)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(key)

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString()

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const cuerpo = await res.text()
  if (!res.ok) throw new Error(`google token ${res.status}: ${cuerpo.slice(0, 200)}`)

  const json = JSON.parse(cuerpo) as { access_token?: unknown }
  if (typeof json.access_token !== 'string' || !json.access_token) {
    throw new Error(`google token sin access_token: ${cuerpo.slice(0, 200)}`)
  }
  return json.access_token
}

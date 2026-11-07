import { randomUUID } from 'node:crypto'
import { leerContexto } from '@/lib/contexto'
import { registrarTraspaso } from '@/lib/db'
import { urlApp, saltoDisponible } from '@/lib/destinos'
import { leerSecreto } from '@/lib/secretos'
import { CATALOGO, esHerramienta, puedeAbrir, firmarTraspaso, envSecretoTraspaso, VIDA_TRASPASO_S } from '@central/core-herramientas'

// Salto a una herramienta (form POST desde la tarjeta). Comprueba en el panel y OTRA VEZ en BD (registrar_traspaso), firma un
// token de UN solo uso (60 s, secreto de ESA app) y lo entrega por POST autoenviado a <app>/api/auth/traspaso.
// La app destino vuelve a exigir SU usuario_empresas: el token no autoriza nada por sí solo.
export const dynamic = 'force-dynamic'

// Únicos errores de registrar_traspaso que significan «no tienes acceso»; cualquier otro fallo de BD es del servidor (503, no 403).
const ERRORES_DE_ACCESO = ['sin_acceso', 'herramienta_no_activa', 'sin_acceso_a_la_herramienta']

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const pagina = (cuerpo: string, status = 200) => new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Abriendo…</title>` +
  `<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px}button,a.btn{min-height:44px;padding:0 18px;font-size:16px}</style></head><body>${cuerpo}</body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } })
const error = (t: string, status: number) => pagina(`<p>${esc(t)}</p><p><a class="btn" href="/">Volver a Mi empresa</a></p>`, status)

export async function POST(req: Request) {
  const ctx = await leerContexto()
  if (!ctx?.cuenta) return error('Tu sesión ha caducado o no has elegido empresa.', 401)
  const form = await req.formData().catch(() => null)
  const h = form?.get('herramienta')
  if (!esHerramienta(h)) return error('Herramienta no válida.', 400)
  if (!puedeAbrir(ctx.cuenta.herramientas, { rol: ctx.cuenta.rol, concedidas: ctx.cuenta.concedidas }, h)) return error('No tienes acceso a esta herramienta en esta empresa.', 403)
  const base = urlApp(h)
  const aud = CATALOGO[h].app
  const secreto = leerSecreto(envSecretoTraspaso(aud))
  if (!saltoDisponible(h) || !base || !secreto) return error('El salto directo a esta herramienta aún no está conectado. Entra en ella con tu correo y un código.', 503)
  const jti = randomUUID()
  const ahora = new Date()
  let reg: { ref: string; email: string }
  try {
    reg = await registrarTraspaso(ctx.personaId, ctx.cuenta.id, h, jti, aud, new Date(ahora.getTime() + VIDA_TRASPASO_S * 1000))
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (ERRORES_DE_ACCESO.some((k) => msg.includes(k))) return error('No tienes acceso a esta herramienta en esta empresa.', 403)
    console.error('[empresa] fallo al registrar el traspaso:', msg.slice(0, 200))
    return error('No se pudo abrir la herramienta ahora mismo. Inténtalo de nuevo en unos minutos.', 503)
  }
  const token = await firmarTraspaso({ aud, sub: ctx.personaId, email: reg.email, ref: reg.ref, jti }, secreto, ahora)
  return pagina(`<form id="f" method="post" action="${esc(base)}/api/auth/traspaso"><input type="hidden" name="token" value="${esc(token)}">` +
    `<p>Abriendo ${esc(CATALOGO[h].nombre)}…</p><noscript><button type="submit">Continuar</button></noscript></form>` +
    `<script>document.getElementById('f').submit()</script>`)
}

// Canal de correo del código: envío OK, sin proveedor → 503, fallo del proveedor → 502, sin filtrar la existencia del correo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { solicitarCodigo, type RepoAcceso, type CanalCodigo } from '../lib/acceso.ts'
import { correoCodigoAcceso, obtenerCanalCorreo } from '../lib/canal-correo.ts'
import { resolverSolicitud } from '../lib/solicitar-acceso.ts'

process.env.CONTABILIDAD_SESSION_SECRET ??= 'secreto-de-prueba-contabilidad-0123456789'
const ENVS = ['RESEND_API_KEY', 'SMTP_USER', 'SMTP_PASSWORD', 'GMAIL_USER', 'GMAIL_APP_PASSWORD']

function repo(): { repo: RepoAcceso; envios: string[] } {
  const envios: string[] = []
  const r: RepoAcceso = {
    async contarRecientesPorEmail() { return 0 }, async contarRecientesPorIp() { return 0 },
    async crearOtp(f) { envios.push(f.envio) }, async ultimoOtp() { return null },
    async reservarIntento() { return false }, async gastarOtp() { return false },
    async usuarioPorEmail(e) { return e === 'duena@ejemplo.es' ? { id: 'u', nombre: 'Pilar', sv: 0 } : null },
    async empresasDeUsuario() { return [] },
  }
  return { repo: r, envios }
}

test('envío OK: usuario real recibe el código y la fila queda «enviado»', async () => {
  const { repo: r, envios } = repo()
  const enviados: { to: string; codigo: string }[] = []
  const canal: CanalCodigo = { conectado: true, enviar: async (c) => { enviados.push(c); return 'enviado' } }
  assert.deepEqual(await solicitarCodigo(r, canal, { email: 'Duena@Ejemplo.es', ip: '1.1.1.1' }), { ok: true, enviado: true })
  assert.equal(enviados.length, 1)
  assert.equal(enviados[0].to, 'duena@ejemplo.es')
  assert.match(enviados[0].codigo, /^\d{6}$/)
  assert.deepEqual(envios, ['enviado'])
})

test('fallo del proveedor: 502 envio_fallido y la fila queda «fallido»', async () => {
  const { repo: r, envios } = repo()
  const canal: CanalCodigo = { conectado: true, enviar: async () => 'fallido' }
  assert.deepEqual(await solicitarCodigo(r, canal, { email: 'duena@ejemplo.es', ip: '1.1.1.1' }), { ok: false, status: 502, error: 'envio_fallido' })
  assert.deepEqual(envios, ['fallido'])
})

test('no filtra existencia: un correo sin cuenta recibe la MISMA respuesta y no se le envía nada', async () => {
  const { repo: r } = repo()
  let llamadas = 0
  const canal: CanalCodigo = { conectado: true, enviar: async () => { llamadas += 1; return 'enviado' } }
  const real = await solicitarCodigo(r, canal, { email: 'duena@ejemplo.es', ip: '1.1.1.1' })
  const falso = await solicitarCodigo(r, canal, { email: 'nadie@ejemplo.es', ip: '1.1.1.1' })
  assert.deepEqual(falso, real)
  assert.equal(llamadas, 1)
})

test('sin proveedor configurado: obtenerCanalCorreo() = null y la ruta responde 503 canal_no_disponible (nunca 200)', async () => {
  const guardado = Object.fromEntries(ENVS.map((k) => [k, process.env[k]]))
  const nodeEnv = process.env.NODE_ENV
  try {
    for (const k of ENVS) delete process.env[k]
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    assert.equal(obtenerCanalCorreo(), null)
    const res = await resolverSolicitud(repo().repo, { email: 'duena@ejemplo.es', ip: '1.1.1.1' })
    assert.equal(res.status, 503)
    assert.deepEqual(res.body, { error: 'canal_no_disponible' })
  } finally {
    for (const [k, v] of Object.entries(guardado)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    ;(process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv
  }
})

test('la ruta traduce: envío OK → 200, fallo del proveedor → 502, topes → 429 con retry-after', async () => {
  const ok = await resolverSolicitud(repo().repo, { email: 'duena@ejemplo.es', ip: '1.1.1.1' }, () => ({ conectado: true, enviar: async () => 'enviado' }))
  assert.deepEqual([ok.status, ok.body], [200, { ok: true, enviado: true }])
  const mal = await resolverSolicitud(repo().repo, { email: 'duena@ejemplo.es', ip: '1.1.1.1' }, () => ({ conectado: true, enviar: async () => 'fallido' }))
  assert.deepEqual([mal.status, mal.body], [502, { error: 'envio_fallido' }])
  const topada = { ...repo().repo, contarRecientesPorIp: async () => 99 }
  const t = await resolverSolicitud(topada, { email: 'duena@ejemplo.es', ip: '1.1.1.1' }, () => ({ conectado: true, enviar: async () => 'enviado' }))
  assert.equal(t.status, 429); assert.ok(t.headers?.['retry-after'])
})

test('con proveedor configurado hay canal conectado (no se envía nada en el test)', () => {
  const g = process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = 're_prueba'
  try { assert.equal(obtenerCanalCorreo()?.conectado, true) } finally { if (g === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = g }
})

test('plantilla: código, caducidad, «si no lo has pedido», marca Grupo ASegura y logo PNG; el código se escapa', () => {
  const m = correoCodigoAcceso('123456')
  for (const t of [m.text, m.html]) { assert.match(t, /123456/); assert.match(t, /10 minutos/); assert.match(t, /Si no lo has pedido/) }
  assert.match(m.html, /logotipo-asegura-correo\.png/)
  assert.match(m.html, /Grupo ASegura/)
  assert.ok(!correoCodigoAcceso('<b>').html.includes('<b>'))
})

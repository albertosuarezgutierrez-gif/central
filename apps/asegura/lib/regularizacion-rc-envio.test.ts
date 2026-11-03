// Fila atascada en `enviando` y id inválido en `editar` (regularización de RC, 03/11/2026). `node --test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { avisarEnAppTrasCorreo, enviarYConfirmar, pedirPushRegularizacion } from './regularizacion-rc-envio.ts'

function deps(o: { enviar?: () => Promise<string>; confirmar?: () => Promise<number>; borrador?: () => Promise<unknown> }) {
  const c = { enviar: 0, confirmar: 0, borrador: 0, logs: [] as string[] }
  return {
    c,
    d: {
      enviar: async () => { c.enviar++; return (o.enviar ?? (async () => 'enviado'))() },
      confirmar: async () => { c.confirmar++; return (o.confirmar ?? (async () => 1))() },
      volverABorrador: async () => { c.borrador++; return (o.borrador ?? (async () => 1))() },
      log: (m: string) => { c.logs.push(m) },
    },
  }
}

test('camino feliz: enviado y confirmado, sin volver a borrador', async () => {
  const { c, d } = deps({})
  assert.equal(await enviarYConfirmar(d), 'enviada')
  assert.deepEqual([c.enviar, c.confirmar, c.borrador], [1, 1, 0])
})

test('el envío LANZA: la fila vuelve a borrador y se informa envio_fallido (no queda en enviando)', async () => {
  const { c, d } = deps({ enviar: async () => { throw new Error('resend caído') } })
  assert.equal(await enviarYConfirmar(d), 'envio_fallido')
  assert.equal(c.borrador, 1); assert.equal(c.confirmar, 0)
})

test('el envío lanza y volver a borrador también falla: no revienta, queda registrado', async () => {
  const { c, d } = deps({ enviar: async () => { throw new Error('x') }, borrador: async () => { throw new Error('bd') } })
  assert.equal(await enviarYConfirmar(d), 'envio_fallido')
  assert.ok(c.logs.some((l) => l.includes('borrador')))
})

test('sin proveedor / rechazado: vuelve a borrador', async () => {
  for (const [res, esperado] of [['sin_proveedor', 'canal_no_disponible'], ['rechazado', 'envio_fallido']] as const) {
    const { c, d } = deps({ enviar: async () => res })
    assert.equal(await enviarYConfirmar(d), esperado)
    assert.equal(c.borrador, 1)
  }
})

test('correo enviado y el UPDATE a pendiente falla una vez: se reintenta y queda enviada', async () => {
  let n = 0
  const { c, d } = deps({ confirmar: async () => { if (n++ === 0) throw new Error('timeout'); return 1 } })
  assert.equal(await enviarYConfirmar(d), 'enviada')
  assert.deepEqual([c.enviar, c.confirmar, c.borrador], [1, 2, 0])
})

test('correo enviado y el UPDATE falla dos veces: confirmacion_fallida, error registrado, NO vuelve a borrador (no reenviar)', async () => {
  const { c, d } = deps({ confirmar: async () => { throw new Error('bd caída') } })
  assert.equal(await enviarYConfirmar(d), 'confirmacion_fallida')
  assert.equal(c.confirmar, 2); assert.equal(c.borrador, 0); assert.equal(c.enviar, 1)
  assert.ok(c.logs.length >= 2)
})

test('la fila ya no estaba en enviando (UPDATE 0 filas): sin_cambios, sin reintentos', async () => {
  const { c, d } = deps({ confirmar: async () => 0 })
  assert.equal(await enviarYConfirmar(d), 'sin_cambios')
  assert.equal(c.confirmar, 1)
})

test('decidirRegularizacion usa enviarYConfirmar y crear anula la enviando atascada (sin reenviar)', () => {
  const src = readFileSync(new URL('./regularizacion-rc.ts', import.meta.url), 'utf8')
  assert.match(src, /enviarYConfirmar\(/)
  assert.match(src, /estado = 'enviando'\s+and caduca_at - make_interval/)
  assert.match(src, /set estado = 'anulada'[^`]*?estado = 'enviando'/)
})

test('editar: el id se valida con UUID estricto 8-4-4-4-12 (no solo 36 caracteres hex y guiones)', () => {
  const src = readFileSync(new URL('../app/api/operador/regularizacion-rc/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /\^\[0-9a-f-\]\{36\}\$/)
  assert.match(src, /const UUID = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i/)
  assert.match(src, /accion === 'editar'[\s\S]*?!UUID\.test\(id\)[\s\S]*?status: 422/)
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const viejo = /^[0-9a-f-]{36}$/i
  const malo = '-'.repeat(36)
  assert.ok(viejo.test(malo)); assert.ok(!UUID.test(malo))
  assert.ok(UUID.test('11111111-1111-4111-8111-111111111111'))
})

// ─── Aviso en la app (03/11/2026) ────────────────────────────────────────────

test('🪤 el push que FALLA no cambia el correo: enviada sigue enviada y nada vuelve a borrador', async () => {
  const { c, d } = deps({})
  const correo = await enviarYConfirmar(d)
  const push = await avisarEnAppTrasCorreo(correo, async () => { throw new Error('portal caído') }, () => {})
  assert.equal(correo, 'enviada')
  assert.deepEqual(push, { estado: 'no_se_pudo', causa: 'excepcion' })
  assert.equal(c.borrador, 0)
})

test('🪤 sin correo no hay push: ni con canal caído, ni con envío fallido, ni con confirmación fallida (enlace muerto)', async () => {
  for (const r of ['canal_no_disponible', 'envio_fallido', 'confirmacion_fallida', 'sin_cambios'] as const) {
    let llamado = false
    assert.equal(await avisarEnAppTrasCorreo(r, async () => { llamado = true; return { estado: 'sin_app' } }, () => {}), null)
    assert.equal(llamado, false, r)
  }
})

test('🪤 en regularizacion-rc.ts el push va DESPUÉS de enviarYConfirmar y el return de enviada no depende de él', () => {
  const src = readFileSync(new URL('./regularizacion-rc.ts', import.meta.url), 'utf8')
  const iEnvio = src.indexOf('await enviarYConfirmar(')
  const iPush = src.indexOf('avisarEnAppTrasCorreo(r,')
  assert.ok(iEnvio > 0 && iPush > iEnvio, 'el aviso en la app se pide tras el correo, con su resultado')
  assert.match(src, /return \{ estado: 'enviada', push \}/)
})

type Llamada = { url: string; init: RequestInit }
const TOKEN = 'b'.repeat(43)
function fetchFalso(status: number, cuerpo: unknown, llamadas: Llamada[]): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init })
    return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

test('🪤 sin secreto no se llama al portal: no_se_pudo', async () => {
  const ll: Llamada[] = []
  const r = await pedirPushRegularizacion({ clienteId: 'c', token: TOKEN }, { base: 'https://p.example', secreto: undefined, fetch: fetchFalso(200, {}, ll) })
  assert.deepEqual(r, { estado: 'no_se_pudo', causa: 'sin_secreto' })
  assert.equal(ll.length, 0)
})

test('🪤 la petición lleva motivo y ruta /datos/<token>, sin texto ni cifras; Bearer con el secreto', async () => {
  const ll: Llamada[] = []
  const r = await pedirPushRegularizacion({ clienteId: 'cli-1', token: TOKEN }, { base: 'https://p.example/', secreto: 's', fetch: fetchFalso(200, { estado: 'ok', enviados: 2, fallidos: 0, sinSuscripcion: false, omitidasPorPreferencia: 0 }, ll) })
  assert.deepEqual(r, { estado: 'enviado', dispositivos: 2 })
  assert.equal(ll[0].url, 'https://p.example/api/operador/push-cliente')
  assert.equal((ll[0].init.headers as Record<string, string>).Authorization, 'Bearer s')
  const cuerpo = JSON.parse(String(ll[0].init.body))
  assert.deepEqual(Object.keys(cuerpo).sort(), ['clienteId', 'motivo', 'url'])
  assert.equal(cuerpo.url, `/datos/${TOKEN}`)
})

test('respuestas del portal → estado para Telegram (sin app, preferencia, 401, portal caído)', async () => {
  const e = (status: number, cuerpo: unknown) => ({ base: 'https://p.example', secreto: 's', fetch: fetchFalso(status, cuerpo, []) })
  const a = { clienteId: 'c', token: TOKEN }
  assert.deepEqual(await pedirPushRegularizacion(a, e(200, { estado: 'ok', enviados: 0, fallidos: 0, sinSuscripcion: true, omitidasPorPreferencia: 0 })), { estado: 'sin_app' })
  assert.deepEqual(await pedirPushRegularizacion(a, e(200, { estado: 'ok', enviados: 0, fallidos: 0, sinSuscripcion: false, omitidasPorPreferencia: 1 })), { estado: 'preferencia' })
  assert.deepEqual(await pedirPushRegularizacion(a, e(200, { estado: 'ok', enviados: 0, fallidos: 1, sinSuscripcion: false, omitidasPorPreferencia: 0 })), { estado: 'no_se_pudo', causa: 'ningun_dispositivo_lo_acepto' })
  assert.deepEqual(await pedirPushRegularizacion(a, e(401, { error: 'No autorizado' })), { estado: 'no_se_pudo', causa: 'HTTP 401' })
  const caido = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
  assert.deepEqual(await pedirPushRegularizacion(a, { base: 'https://p.example', secreto: 's', fetch: caido }), { estado: 'no_se_pudo', causa: 'TypeError' })
  assert.deepEqual(await pedirPushRegularizacion(a, { base: 'http://p.example', secreto: 's', fetch: caido }), { estado: 'no_se_pudo', causa: 'url_portal_no_https' })
})

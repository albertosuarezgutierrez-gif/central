// Fila atascada en `enviando` y id inválido en `editar` (regularización de RC, 03/11/2026). `node --test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { enviarYConfirmar } from './regularizacion-rc-envio.ts'

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

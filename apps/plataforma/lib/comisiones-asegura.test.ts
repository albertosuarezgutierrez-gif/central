import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarComisiones, nombreCompania } from './comisiones-asegura.ts'

test('401 es secreto rechazado, no «sin comisiones»', () => {
  assert.deepEqual(interpretarComisiones(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarComisiones(403, null), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('sin_configurar se propaga tal cual: el puerto no está conectado', () => {
  assert.deepEqual(
    interpretarComisiones(200, { comisiones: { estado: 'sin_configurar' } }),
    { estado: 'sin_configurar' },
  )
})

test('un error de la BD de asegura llega con su motivo', () => {
  assert.deepEqual(
    interpretarComisiones(200, { comisiones: { estado: 'error' } }),
    { estado: 'error', motivo: 'asegura_error' },
  )
})

// 🚨 02/09/2026: `asegura_error` a secas era un callejón sin salida — decía que
// falló, no dónde, y la causa real (`credenciales`: la contraseña de
// prisma_seguros en el DATABASE_URL de Vercel ya no valía) solo estaba en los
// logs del pooler. La causa que clasifica asegura tiene que llegar hasta el aviso.
test('la causa de asegura viaja hasta el motivo (credenciales, permisos, esquema…)', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error', causa: 'credenciales' } })
  assert.deepEqual(r, { estado: 'error', motivo: 'asegura_error', causa: 'credenciales' })
})

test('sin causa NO se inventa una: el campo sencillamente no está', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error' } })
  assert.deepEqual(r, { estado: 'error', motivo: 'asegura_error' })
})

test('una causa que no es texto se ignora, no se pega tal cual', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error', causa: { url: 'postgres://u:p@h' } } })
  assert.deepEqual(r, { estado: 'error', motivo: 'asegura_error' })
})

test('una causa kilométrica se recorta: acaba en un Telegram', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error', causa: 'x'.repeat(500) } })
  assert.ok((r.estado === 'error' ? (r.causa ?? '') : '').length <= 40)
})

test('un devengo con mes mal formado se descarta en vez de contaminar el libro', () => {
  const r = interpretarComisiones(200, {
    comisiones: {
      estado: 'ok', periodos: [],
      devengos: [
        { companiaCodigo: 'C0109', mes: '2026-04', bruto: 120.88, recibos: 4 },
        { companiaCodigo: 'C0109', mes: 'abril', bruto: 999, recibos: 1 },
      ],
      cobertura: [],
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.devengos.length, 1)
    assert.equal(r.devengos[0].bruto, 120.88)
  }
})

test('los códigos DGS reales son C0058/C0109, no los numéricos del cima.ts retirado', () => {
  assert.equal(nombreCompania('C0058'), 'Mapfre')
  assert.equal(nombreCompania('C0109'), 'Allianz')
  assert.equal(nombreCompania('C0468'), 'Occident')
  // Un código desconocido devuelve el propio código: inventar un nombre sería
  // peor que decir que no se sabe cuál es.
  assert.equal(nombreCompania('C9999'), 'C9999')
})

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
// falló, no dónde. La pista que manda asegura tiene que llegar hasta el aviso.
test('la pista de asegura viaja hasta el motivo (schema, permisos, tabla…)', () => {
  const r = interpretarComisiones(200, {
    comisiones: { estado: 'error', motivo: 'bd', detalle: 'central/PrismaClientKnownRequestError/P2021/public.corredurias' },
  })
  assert.equal(r.estado, 'error')
  assert.equal(r.estado === 'error' ? r.motivo : null, 'asegura_error')
  assert.match(r.estado === 'error' ? (r.detalle ?? '') : '', /P2021/)
  assert.match(r.estado === 'error' ? (r.detalle ?? '') : '', /^bd · /)
})

test('sin pista NO se inventa una: el detalle sencillamente no está', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error' } })
  assert.deepEqual(r, { estado: 'error', motivo: 'asegura_error' })
})

test('una pista kilométrica se recorta: acaba en un Telegram', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error', motivo: 'bd', detalle: 'x'.repeat(5000) } })
  assert.ok((r.estado === 'error' ? (r.detalle ?? '') : '').length <= 200)
})

test('una pista que no es texto se ignora, no se pega tal cual', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'error', motivo: 'bd', detalle: { url: 'postgres://u:p@h' } } })
  assert.deepEqual(r, { estado: 'error', motivo: 'asegura_error', detalle: 'bd' })
})

test('una respuesta rara NO se convierte en cero comisiones', () => {
  // Es el fallo caro: un HTML de error o un JSON de otra forma acabando pintado
  // como «este mes no has cobrado nada».
  assert.deepEqual(interpretarComisiones(200, { pepe: 1 }), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarComisiones(500, null), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(
    interpretarComisiones(200, { comisiones: { estado: 'ok', periodos: 'no-es-lista' } }),
    { estado: 'error', motivo: 'respuesta_ilegible' },
  )
})

test('ok con listas vacías es ok: «no hay comisiones en la ventana»', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'ok', periodos: [], devengos: [], cobertura: [] } })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.deepEqual(r.periodos, [])
})

test('los importes nulos del periodo se conservan como null, no como 0', () => {
  const r = interpretarComisiones(200, {
    comisiones: {
      estado: 'ok',
      periodos: [{
        companiaCodigo: 'C0058', periodoInicio: '2026-07-01', periodoFin: '2026-07-31',
        liqBruto: null, liqRetencion: null, liqRemesa: null, liqHash: null, pagado: null,
      }],
      devengos: [], cobertura: [],
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') {
    assert.equal(r.periodos[0].liqBruto, null)
    assert.equal(r.periodos[0].liqRemesa, null)
  }
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

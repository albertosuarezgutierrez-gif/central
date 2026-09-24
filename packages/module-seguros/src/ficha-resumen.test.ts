import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarPolizaFicha, resumenFicha, type PolizaResumible } from './ficha-resumen.ts'

const HOY = new Date('2026-09-01T10:00:00Z')

function poliza(p: Partial<PolizaResumible> & { id: string }): PolizaResumible {
  return {
    viva: true,
    confirmadaCima: true,
    estado: 'activa',
    fechaVencimiento: null,
    recibos: null,
    ...p,
  }
}

function resumen(polizas: PolizaResumible[], extra?: {
  siniestros?: { abierto: boolean }[] | null
  documentos?: { estado: string }[] | null
}) {
  return resumenFicha({
    polizas,
    siniestros: extra?.siniestros ?? null,
    documentos: extra?.documentos ?? null,
    hoy: HOY,
  })
}

// ── Clasificación ────────────────────────────────────────────────────────────

test('las cuatro clases de póliza salen en el orden que manda el JSX original', () => {
  assert.equal(clasificarPolizaFicha(poliza({ id: 'a' })), 'viva')
  assert.equal(clasificarPolizaFicha(poliza({ id: 'b', confirmadaCima: false })), 'pendiente_cima')
  assert.equal(clasificarPolizaFicha(poliza({ id: 'c', estado: 'cancelada' })), 'cancelada')
  assert.equal(clasificarPolizaFicha(poliza({ id: 'd', viva: false })), 'historica')
})

test('«no viva» manda sobre todo lo demás: es histórica aunque esté cancelada o sin CIMA', () => {
  assert.equal(clasificarPolizaFicha(poliza({ id: 'e', viva: false, estado: 'cancelada' })), 'historica')
  assert.equal(clasificarPolizaFicha(poliza({ id: 'f', viva: false, confirmadaCima: false })), 'historica')
})

test('una CANCELADA no cuenta como viva — 42 de las 109 de CIMA lo están', () => {
  const r = resumen([
    poliza({ id: 'a' }),
    poliza({ id: 'b', estado: 'cancelada' }),
    poliza({ id: 'c', confirmadaCima: false }),
    poliza({ id: 'd', viva: false }),
  ])
  assert.deepEqual(r.conteo, { vivas: 1, pendientesCima: 1, canceladas: 1, historicas: 1, total: 4 })
})

// ── Recibos: la distinción que da sentido a todo el helper ───────────────────

test('NINGUNA póliza informa recibos → null, que la UI pinta «—» y no un 0', () => {
  const r = resumen([poliza({ id: 'a' }), poliza({ id: 'b' })])
  assert.equal(r.recibos.devueltos, null)
  assert.equal(r.recibos.pendientes, null)
  assert.equal(r.recibos.polizasSinInformar, 2)
  assert.equal(r.recibos.polizasSinRecibos, 0)
})

test('con alguna que informa y sin devoluciones es 0 — «se miró y no hay», que NO es lo mismo que null', () => {
  const r = resumen([
    poliza({ id: 'a', recibos: { total: 3, pendientes: 1, devueltos: 0 } }),
    poliza({ id: 'b' }),
  ])
  assert.equal(r.recibos.devueltos, 0)
  assert.notEqual(r.recibos.devueltos, null)
  assert.equal(r.recibos.pendientes, 1)
  // La suma es solo sobre las que informan, y se dice a cuántas no alcanza.
  assert.equal(r.recibos.polizasSinInformar, 1)
})

test('una póliza que informa «total: 0» se cuenta aparte: no se sabe si está pagada', () => {
  const r = resumen([
    poliza({ id: 'a', recibos: { total: 0, pendientes: 0, devueltos: 0 } }),
    poliza({ id: 'b', recibos: { total: 2, pendientes: 0, devueltos: 1 } }),
  ])
  assert.equal(r.recibos.polizasSinRecibos, 1)
  assert.equal(r.recibos.polizasSinInformar, 0)
  assert.equal(r.recibos.devueltos, 1)
})

// ── Siniestros y documentos: null vs 0 ───────────────────────────────────────

test('siniestros null es «no se han podido leer», nunca «ninguno abierto»', () => {
  assert.equal(resumen([], { siniestros: null }).siniestrosAbiertos, null)
  assert.equal(resumen([], { siniestros: [] }).siniestrosAbiertos, 0)
  assert.equal(
    resumen([], { siniestros: [{ abierto: true }, { abierto: false }, { abierto: true }] }).siniestrosAbiertos,
    2,
  )
})

test('documentos null es «no informados»; con lista, solo cuentan los «pedido»', () => {
  assert.equal(resumen([], { documentos: null }).documentosPendientes, null)
  assert.equal(resumen([], { documentos: [] }).documentosPendientes, 0)
  const r = resumen([], {
    documentos: [{ estado: 'pedido' }, { estado: 'recibido' }, { estado: 'revisado' }, { estado: 'pedido' }],
  })
  assert.equal(r.documentosPendientes, 2)
})

test('un estado de documento desconocido NO se cuenta como pedido', () => {
  assert.equal(resumen([], { documentos: [{ estado: 'vete_a_saber' }] }).documentosPendientes, 0)
})

// ── Próximo vencimiento ──────────────────────────────────────────────────────

test('entre varias vivas elige la de vencimiento futuro más cercano', () => {
  const r = resumen([
    poliza({ id: 'lejos', fechaVencimiento: '2027-03-01' }),
    poliza({ id: 'cerca', fechaVencimiento: '2026-10-16' }),
    poliza({ id: 'media', fechaVencimiento: '2026-12-01' }),
  ])
  assert.equal(r.proximo?.polizaId, 'cerca')
  assert.equal(r.proximo?.vencimiento, '2026-10-16')
  assert.equal(r.proximo?.diasHastaVencimiento, 45)
})

test('el límite de aviso es el vencimiento menos 30 días (LCS art. 22)', () => {
  const r = resumen([poliza({ id: 'a', fechaVencimiento: '2026-10-16' })])
  assert.equal(r.proximo?.limiteAviso, '2026-09-16')
})

test('a 45 días del vencimiento aún se puede oponer a la prórroga', () => {
  const r = resumen([poliza({ id: 'a', fechaVencimiento: '2026-10-16' })])
  assert.equal(r.proximo?.diasHastaLimiteAviso, 15)
  assert.equal(r.proximo?.enPlazo, true)
})

test('a 10 días ya NO: la póliza se prorroga sí o sí', () => {
  const r = resumen([poliza({ id: 'a', fechaVencimiento: '2026-09-11' })])
  assert.equal(r.proximo?.diasHastaVencimiento, 10)
  assert.equal(r.proximo?.diasHastaLimiteAviso, -20)
  assert.equal(r.proximo?.enPlazo, false)
})

test('el día exacto del límite todavía está en plazo', () => {
  // Vence el 01/10: el límite de oposición es HOY mismo.
  const r = resumen([poliza({ id: 'a', fechaVencimiento: '2026-10-01' })])
  assert.equal(r.proximo?.limiteAviso, '2026-09-01')
  assert.equal(r.proximo?.diasHastaLimiteAviso, 0)
  assert.equal(r.proximo?.enPlazo, true)
})

test('la que vence HOY sigue siendo la próxima: 0 días, no vencida', () => {
  const r = resumen([
    poliza({ id: 'hoy', fechaVencimiento: '2026-09-01' }),
    poliza({ id: 'luego', fechaVencimiento: '2026-09-20' }),
  ])
  assert.equal(r.proximo?.polizaId, 'hoy')
  assert.equal(r.proximo?.diasHastaVencimiento, 0)
})

test('si TODAS vencieron, enseña la última vencida con días negativos y fuera de plazo', () => {
  const r = resumen([
    poliza({ id: 'vieja', fechaVencimiento: '2019-05-01' }),
    poliza({ id: 'reciente', fechaVencimiento: '2026-08-20' }),
  ])
  assert.equal(r.proximo?.polizaId, 'reciente')
  assert.equal(r.proximo?.diasHastaVencimiento, -12)
  assert.equal(r.proximo?.enPlazo, false)
})

test('una futura manda sobre cualquier vencida, aunque la vencida sea de ayer', () => {
  const r = resumen([
    poliza({ id: 'ayer', fechaVencimiento: '2026-08-31' }),
    poliza({ id: 'manana', fechaVencimiento: '2026-09-02' }),
  ])
  assert.equal(r.proximo?.polizaId, 'manana')
  assert.equal(r.proximo?.diasHastaVencimiento, 1)
})

test('solo miran las VIVAS: una cancelada o histórica no puede ser el próximo vencimiento', () => {
  const r = resumen([
    poliza({ id: 'cancelada', estado: 'cancelada', fechaVencimiento: '2026-09-05' }),
    poliza({ id: 'sinCima', confirmadaCima: false, fechaVencimiento: '2026-09-06' }),
    poliza({ id: 'historica', viva: false, fechaVencimiento: '2026-09-07' }),
    poliza({ id: 'viva', fechaVencimiento: '2026-11-30' }),
  ])
  assert.equal(r.proximo?.polizaId, 'viva')
  assert.equal(r.vivasSinFechaVencimiento, 0)
})

test('todas las vivas sin fecha → no hay próximo y se dice cuántas no se saben', () => {
  const r = resumen([
    poliza({ id: 'a' }),
    poliza({ id: 'b' }),
    poliza({ id: 'c', estado: 'cancelada' }),
  ])
  assert.equal(r.proximo, null)
  // La cancelada NO cuenta: solo se cuentan las vivas sin fecha.
  assert.equal(r.vivasSinFechaVencimiento, 2)
})

test('una fecha basura no rompe: se trata como «sin fecha», no como un vencimiento inventado', () => {
  const r = resumen([
    poliza({ id: 'basura', fechaVencimiento: 'no-es-una-fecha' }),
    poliza({ id: 'vacia', fechaVencimiento: '' }),
    // 30 de febrero: `Date` lo desliza a marzo. Aquí es «sin fecha».
    poliza({ id: 'imposible', fechaVencimiento: '2026-02-30' }),
    poliza({ id: 'buena', fechaVencimiento: '2026-10-16' }),
  ])
  assert.equal(r.proximo?.polizaId, 'buena')
  assert.equal(r.vivasSinFechaVencimiento, 3)
})

test('una ficha vacía no afirma nada: cero pólizas, ningún próximo, recibos a null', () => {
  const r = resumen([])
  assert.deepEqual(r.conteo, { vivas: 0, pendientesCima: 0, canceladas: 0, historicas: 0, total: 0 })
  assert.equal(r.recibos.devueltos, null)
  assert.equal(r.recibos.pendientes, null)
  assert.equal(r.proximo, null)
  assert.equal(r.vivasSinFechaVencimiento, 0)
})

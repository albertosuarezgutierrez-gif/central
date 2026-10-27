import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agregarConversion, filaConversion, inicioMesMadrid, interpretarConversion, resumirConversion,
  type PolizaConversion, type TitularConversion,
} from './patrimonio-conversion.ts'
import { COSTE_LECTURA_FACTURA_EUR } from './patrimonio-coste-ia.ts'

// Fechas RELATIVAS al `ahora` inyectado (nunca el reloj real).
const AHORA = new Date('2026-10-27T10:00:00Z')
const iso = (d: string) => new Date(d).toISOString()

const vigente = (o: Partial<PolizaConversion> = {}): PolizaConversion => ({
  importRef: null, eiacXmlHash: 'h', estado: 'activa', sustituidaAt: null, mergedIntoPolizaId: null, creadaEn: iso('2026-10-01'), ...o,
})
const titular = (o: Partial<TitularConversion> = {}): TitularConversion => ({
  titularId: 't1', clienteId: 'c1', cliente: 'Ana', activoDesde: iso('2026-09-01'),
  inmuebles: 2, unidades: 0,
  lecturas: { facturasTotal: 5, facturasMes: 2, volcadosTotal: 1, volcadosMes: 1 },
  polizas: [vigente()], recibos: [{ fecha: iso('2026-08-01'), comisionBruta: '10.50' }], ...o,
})

test('pólizas en vigor por esCarteraEnVigor: cancelada, volcado histórico, sustituida y fusionada NO cuentan', () => {
  const f = filaConversion(titular({
    polizas: [
      vigente(),
      vigente({ estado: 'cancelada' }),
      vigente({ importRef: 'intranet:1', eiacXmlHash: null }),
      vigente({ sustituidaAt: iso('2026-09-30') }),
      vigente({ mergedIntoPolizaId: 'otra' }),
    ],
  }), AHORA)
  assert.equal(f.polizasEnVigor, 1)
})

test('pólizas nuevas = en vigor creadas desde que activó patrimonio', () => {
  const f = filaConversion(titular({ polizas: [vigente({ creadaEn: iso('2026-08-01') }), vigente({ creadaEn: iso('2026-09-15') }), vigente({ creadaEn: iso('2026-10-20') })] }), AHORA)
  assert.equal(f.polizasEnVigor, 3)
  assert.equal(f.polizasNuevas, 2)
})

test('pólizas sin leer = null (no 0); sin fecha de alta no se adivina "nuevas"', () => {
  assert.equal(filaConversion(titular({ polizas: null }), AHORA).polizasEnVigor, null)
  assert.equal(filaConversion(titular({ polizas: null }), AHORA).polizasNuevas, null)
  const f = filaConversion(titular({ polizas: [vigente({ creadaEn: null })] }), AHORA)
  assert.equal(f.polizasEnVigor, 1)
  assert.equal(f.polizasNuevas, null)
  assert.equal(filaConversion(titular({ polizas: [] }), AHORA).polizasEnVigor, 0) // revisado y no hay
})

test('comisión: suma de comision_bruta de los últimos 12 meses, ignorando los recibos más viejos', () => {
  const f = filaConversion(titular({
    recibos: [
      { fecha: iso('2026-08-01'), comisionBruta: '10.50' },
      { fecha: iso('2025-11-15'), comisionBruta: '4.5' },
      { fecha: iso('2025-10-01'), comisionBruta: '999' }, // fuera de la ventana de 12 meses
    ],
  }), AHORA)
  assert.deepEqual(f.comision, { euros: 15, recibos: 2, ilegibles: 0 })
})

test('comisión sin recibos / no leídos / ilegibles = null con su motivo, NUNCA 0', () => {
  const sin = filaConversion(titular({ recibos: [] }), AHORA)
  assert.equal(sin.comision, null); assert.equal(sin.comisionMotivo, 'sin_recibos')
  const solo_viejos = filaConversion(titular({ recibos: [{ fecha: iso('2024-01-01'), comisionBruta: '50' }] }), AHORA)
  assert.equal(solo_viejos.comision, null); assert.equal(solo_viejos.comisionMotivo, 'sin_recibos')
  const no = filaConversion(titular({ recibos: null }), AHORA)
  assert.equal(no.comision, null); assert.equal(no.comisionMotivo, 'no_leidos')
  const ile = filaConversion(titular({ recibos: [{ fecha: iso('2026-08-01'), comisionBruta: '1.234,56' }, { fecha: iso('2026-08-02'), comisionBruta: null }] }), AHORA)
  assert.equal(ile.comision, null); assert.equal(ile.comisionMotivo, 'ilegibles')
})

test('un recibo ilegible junto a otros legibles no se cuela como 0: se cuenta aparte', () => {
  const f = filaConversion(titular({ recibos: [{ fecha: iso('2026-08-01'), comisionBruta: '20' }, { fecha: iso('2026-08-02'), comisionBruta: 'abc' }] }), AHORA)
  assert.deepEqual(f.comision, { euros: 20, recibos: 1, ilegibles: 1 })
})

test('lecturas: facturas + volcados; sin columna volcado el total es SUELO (completas=false)', () => {
  const ok = filaConversion(titular(), AHORA)
  assert.equal(ok.lecturasMes, 3); assert.equal(ok.lecturasTotal, 6); assert.equal(ok.lecturasCompletas, true)
  const sinCol = filaConversion(titular({ lecturas: { facturasTotal: 5, facturasMes: 2, volcadosTotal: null, volcadosMes: null } }), AHORA)
  assert.equal(sinCol.lecturasTotal, 5); assert.equal(sinCol.lecturasCompletas, false)
  assert.equal(sinCol.costeTotal?.esSuelo, true)
  assert.equal(sinCol.costeTotal?.euros, Math.round(5 * COSTE_LECTURA_FACTURA_EUR * 100) / 100)
})

test('inmuebles/unidades null (columna de edificio sin aplicar) se conservan como «sin dato»', () => {
  const f = filaConversion(titular({ inmuebles: 3, unidades: null }), AHORA)
  assert.equal(f.inmuebles, 3); assert.equal(f.unidades, null)
})

test('orden: más pólizas en vigor primero, null al final', () => {
  const { filas } = agregarConversion([
    titular({ titularId: 'a', cliente: 'A', polizas: null }),
    titular({ titularId: 'b', cliente: 'B', polizas: [vigente()] }),
    titular({ titularId: 'c', cliente: 'C', polizas: [vigente(), vigente()] }),
  ], AHORA)
  assert.deepEqual(filas.map((f) => f.titularId), ['c', 'b', 'a'])
})

test('resumen: comisión = suma de las conocidas y dice cuántos titulares faltan; vacío = null', () => {
  const { resumen } = agregarConversion([
    titular({ titularId: 'a', recibos: [{ fecha: iso('2026-08-01'), comisionBruta: '10' }] }),
    titular({ titularId: 'b', recibos: [] }),
  ], AHORA)
  assert.equal(resumen.comisionEuros, 10); assert.equal(resumen.titularesSinComision, 1)
  const nada = resumirConversion([])
  assert.equal(nada.titulares, 0); assert.equal(nada.comisionEuros, null); assert.equal(nada.polizasEnVigor, null)
})

test('intérprete: 404, error HTTP, sin_configurar y titular incompleto no se colapsan a lista vacía', () => {
  assert.equal(interpretarConversion(404, null).estado, 'error')
  assert.equal(interpretarConversion(500, { causa: 'esquema' }).estado, 'error')
  assert.equal(interpretarConversion(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  assert.equal(interpretarConversion(200, { estado: 'ok', titulares: [{ titularId: 'x' }] }).estado, 'error')
  const l = interpretarConversion(200, { estado: 'ok', titulares: [] })
  assert.deepEqual(l, { estado: 'ok', titulares: [] })
})

test('intérprete: titular válido con polizas/recibos rotos queda en null (no lista recortada)', () => {
  const l = interpretarConversion(200, { estado: 'ok', titulares: [{
    titularId: 't', clienteId: 'c', cliente: 'Ana', activoDesde: '2026-09-01T00:00:00Z', inmuebles: 1, unidades: null,
    lecturas: { facturasTotal: 1, facturasMes: 0, volcadosTotal: null, volcadosMes: null },
    polizas: [{ estado: 'activa' }, 'basura'], recibos: 'no',
  }] })
  assert.equal(l.estado, 'ok')
  if (l.estado === 'ok') { assert.equal(l.titulares[0].polizas, null); assert.equal(l.titulares[0].recibos, null); assert.equal(l.titulares[0].unidades, null) }
})

test('inicioMesMadrid: 00:00 de Madrid del día 1, en invierno (UTC+1) y verano (UTC+2)', () => {
  assert.equal(inicioMesMadrid(new Date('2026-01-15T12:00:00Z')).toISOString(), '2025-12-31T23:00:00.000Z')
  assert.equal(inicioMesMadrid(new Date('2026-10-27T10:00:00Z')).toISOString(), '2026-09-30T22:00:00.000Z')
  // Tras la medianoche de Madrid ya es mes nuevo aunque en UTC siga siendo el anterior.
  assert.equal(inicioMesMadrid(new Date('2026-06-30T22:30:00Z')).toISOString(), '2026-06-30T22:00:00.000Z')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { conciliarConCima, emparejarConCima, prepararPolizaEmitida, sanearPrima, type CompaniaDgs, type ProyectoEmitido } from './emision.ts'

const catalogo: CompaniaDgs[] = [
  { codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: 'Mapfre', enCima: true, activa: true },
  { codigoDgs: 'C0613', nombreComun: 'Reale', nombreCima: null, enCima: true, activa: true },
  { codigoDgs: 'C0723', nombreComun: 'AXA', nombreCima: null, enCima: false, activa: true },
]
const proyecto = (p: Partial<ProyectoEmitido> = {}): ProyectoEmitido => ({
  projectIdCodeoscopic: '12345', producto: 'auto', codigoDgs: 'C0058', numeroPoliza: ' 000123-45 ', primaAnual: 680.494,
  emitidaEn: '2026-09-02T10:00:00Z', riesgo: { matricula: '1234ABC', version: 'X' }, ...p,
})

test('emisión D2: la fila lleva origen emitida_codeoscopic, código DGS y el NOMBRE exacto de CIMA', () => {
  const r = prepararPolizaEmitida({ correduriaId: 'c', clienteId: 'k', proyecto: proyecto(), catalogo })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.fila.origen, 'emitida_codeoscopic')
  assert.equal(r.fila.aseguradora, 'Mapfre')
  assert.equal(r.fila.codigoEntidadDgs, 'C0058')
  assert.equal(r.fila.numeroPoliza, '000123-45')
  assert.equal(r.fila.importRef, null)
  assert.equal(r.fila.idPolizaEntidad, null)
  assert.equal(r.fila.fechaInicio, '2026-09-02')
  assert.equal(r.fila.fechaVencimiento, '2027-09-02')
  assert.equal(r.fila.primaAnual, 680.49)
  assert.deepEqual((r.fila.datosEspecificos.codeoscopic as { projectId: string }).projectId, '12345')
  assert.equal(r.fila.datosEspecificos.matricula, '1234ABC')
  assert.ok(r.avisos.some((a) => /interinas/.test(a)))
})

test('emisión D2: sin nombre CIMA conocido o compañía fuera de CIMA se AVISA, no se inventa', () => {
  const reale = prepararPolizaEmitida({ correduriaId: 'c', clienteId: 'k', proyecto: proyecto({ codigoDgs: 'C0613' }), catalogo })
  assert.ok(reale.ok && reale.fila.aseguradora === 'Reale' && reale.avisos.some((a) => /sin nombre CIMA/.test(a)))
  const axa = prepararPolizaEmitida({ correduriaId: 'c', clienteId: 'k', proyecto: proyecto({ codigoDgs: 'C0723' }), catalogo })
  assert.ok(axa.ok && axa.avisos.some((a) => /no está adherida a CIMA/.test(a)))
  const desconocida = prepararPolizaEmitida({ correduriaId: 'c', clienteId: 'k', proyecto: proyecto({ codigoDgs: 'C9999' }), catalogo })
  assert.ok(desconocida.ok && desconocida.fila.aseguradora === 'C9999' && desconocida.avisos.some((a) => /no está en companias_dgs/.test(a)))
  const sinNumero = prepararPolizaEmitida({ correduriaId: 'c', clienteId: 'k', proyecto: proyecto({ numeroPoliza: null }), catalogo })
  assert.ok(sinNumero.ok && sinNumero.fila.numeroPoliza === null && sinNumero.avisos.some((a) => /no devolvió número/.test(a)))
})

test('emisión D2: no se acuña sin cliente, con producto desconocido, código inválido o fecha rota; la prima se sanea', () => {
  assert.equal(prepararPolizaEmitida({ correduriaId: 'c', clienteId: '', proyecto: proyecto(), catalogo }).ok, false)
  assert.equal(prepararPolizaEmitida({ correduriaId: 'c', clienteId: 'k', proyecto: proyecto({ producto: 'drones' }), catalogo }).ok, false)
  assert.equal(prepararPolizaEmitida({ correduriaId: 'c', clienteId: 'k', proyecto: proyecto({ codigoDgs: 'mapfre' }), catalogo }).ok, false)
  assert.equal(prepararPolizaEmitida({ correduriaId: 'c', clienteId: 'k', proyecto: proyecto({ emitidaEn: 'ayer' }), catalogo }).ok, false)
  assert.deepEqual(sanearPrima('x'), { valor: null, aviso: null })
  assert.equal(sanearPrima(-5).valor, 0)
  assert.equal(sanearPrima(1e12).valor, 99_999_999.99)
  assert.equal(sanearPrima(Number.NaN).valor, null)
})

test('emparejar D4: por número normalizado + código; respaldo DNI + código + fecha ±15 días; ambigüedad → review', () => {
  const c = (id: string, x: Partial<{ numeroPoliza: string | null; codigoEntidadDgs: string | null; dniHash: string | null; fechaInicio: string | null }> = {}) => ({
    id, numeroPoliza: '12345', codigoEntidadDgs: 'C0058', dniHash: 'h1', fechaInicio: '2026-09-02', origen: 'emitida_codeoscopic', ...x,
  })
  assert.deepEqual(emparejarConCima([c('a')], { numeroPoliza: ' 000123-45 ', codigoEntidadDgs: 'c0058', dniHash: null, fechaInicio: null }), { resultado: 'casa', polizaId: 'a', por: 'numero' })
  assert.deepEqual(emparejarConCima([c('a'), c('b')], { numeroPoliza: '12345', codigoEntidadDgs: 'C0058', dniHash: null, fechaInicio: null }).resultado, 'review')
  // Número provisional distinto pero mismo tomador, compañía y fecha cercana.
  assert.deepEqual(
    emparejarConCima([c('a', { numeroPoliza: 'PROV-1' })], { numeroPoliza: '99999', codigoEntidadDgs: 'C0058', dniHash: 'h1', fechaInicio: '2026-09-10' }),
    { resultado: 'casa', polizaId: 'a', por: 'dni_fecha' },
  )
  assert.equal(emparejarConCima([c('a', { numeroPoliza: 'PROV-1' })], { numeroPoliza: '99999', codigoEntidadDgs: 'C0058', dniHash: 'h1', fechaInicio: '2026-10-30' }).resultado, 'nueva')
  assert.equal(emparejarConCima([c('a')], { numeroPoliza: '12345', codigoEntidadDgs: 'C0109', dniHash: 'h1', fechaInicio: '2026-09-02' }).resultado, 'nueva')
  assert.equal(emparejarConCima([c('a')], { numeroPoliza: '12345', codigoEntidadDgs: null, dniHash: null, fechaInicio: null }).resultado, 'review')
})

test('conciliar D3: en una nuestra CIMA manda en estado/fechas/número/entidad, nosotros en riesgo y tomador; DNI distinto → review', () => {
  const nuestra = { origen: 'emitida_codeoscopic', clienteId: 'k1', dniHash: 'h1', datosEspecificos: { matricula: '1234ABC', codeoscopic: { projectId: '1' } }, primaAnual: 680.49 }
  const cima = { clienteId: 'k1', dniHash: 'h1', estado: 'activa', fechaInicio: '2026-09-05', fechaVencimiento: '2027-09-05', numeroPoliza: '123', idPolizaEntidad: 'E1', primaAnual: 700, datosEspecificos: { ramo: 'auto', matricula: 'OTRA' } }
  const r = conciliarConCima(nuestra, cima)
  assert.ok(r.resultado === 'update')
  if (r.resultado !== 'update') return
  assert.equal(r.cambios.idPolizaEntidad, 'E1')
  assert.equal(r.cambios.fechaVencimiento, '2027-09-05')
  assert.equal(r.cambios.clienteId, 'k1')
  assert.equal(r.cambios.primaAnual, 700)
  assert.equal(r.cambios.datosEspecificos.matricula, '1234ABC')
  assert.equal(r.cambios.datosEspecificos.ramo, 'auto')
  assert.equal((r.cambios.datosEspecificos.codeoscopic as { primaOfertada: number }).primaOfertada, 680.49)
  assert.deepEqual(r.conservado, ['datos_especificos', 'prima_ofertada', 'cliente_id'])

  // CIMA resolvió OTRO cliente: mismo DNI → se conserva el nuestro; DNI distinto → review.
  assert.equal(conciliarConCima(nuestra, { ...cima, clienteId: 'k2', dniHash: 'h1' }).resultado, 'update')
  assert.equal(conciliarConCima(nuestra, { ...cima, clienteId: 'k2', dniHash: 'h9' }).resultado, 'review')
  assert.equal(conciliarConCima(nuestra, { ...cima, clienteId: 'k2', dniHash: null }).resultado, 'review')

  // Una que NO es nuestra: CIMA manda en todo, como el legacy.
  const ajena = conciliarConCima({ ...nuestra, origen: 'gestionada_correduria' }, { ...cima, clienteId: 'k2', dniHash: 'h9' })
  assert.ok(ajena.resultado === 'update' && ajena.cambios.clienteId === 'k2' && ajena.conservado.length === 0)
})

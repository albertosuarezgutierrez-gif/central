// Vehículo de referencia de la oportunidad (01/11/2026). Fixtures SINTÉTICAS (solo catálogo; ninguna matrícula real).
// Cada brazo se ha visto FALLAR rompiendo lo que protege (y restaurado).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { avisoEsSupuesto, firmezaPrecioRpa, type VehiculoReferencia } from '@central/module-tarificacion'
import {
  MARCA_ELECCION_REFERENCIA,
  eleccionPorReferenciaParaTrabajo,
  infoConReferencia,
  ofertasConSupuestoReferencia,
  planPropagacion,
  referenciaDeEleccionHumana,
  referenciaDeResultadoOrigen,
  referenciaEfectiva,
  referenciasDeInfo,
  riesgoConReferencia,
  type FilaPropagacion,
} from './tarificador-vehiculo-referencia.ts'
import { cierrePuedeDispararPresupuesto, decidirDisparo } from './presupuesto-rpa-reglas.ts'

const vr = (o: Partial<VehiculoReferencia>): VehiculoReferencia => ({
  origen: 'mapfre', marca: null, modelo: null, version: null, carroceria: null, puertas: null, cc: null, cv: null, combustible: null, anio: null, ...o,
})
const LISTA_GENERALI = [
  { codigo: 'G1', etiqueta: 'FORTWO CABRIO' },
  { codigo: 'G2', etiqueta: 'FORFOUR' },
  { codigo: 'G3', etiqueta: 'FORTWO COUPE' },
]
const parada = (o: Partial<FilaPropagacion> = {}): FilaPropagacion => ({
  id: 't-generali', compania: 'generali', ramo: 'auto', estado: 'requiere_humano', modo: 'tarificar',
  error: { tipo: 'eleccion', en: '2026-11-01T10:00:00Z', opcionesVersion: LISTA_GENERALI }, riesgo: { ramo: 'auto' }, ...o,
})

test('info_riesgo: una casilla por origen; guardar pisa solo la suya y conserva el resto', () => {
  const info0 = { polizaId: null, datosVehiculo: { x: 1 } }
  const i1 = infoConReferencia(info0, vr({ origen: 'mapfre', version: 'SMART FORFOUR 5P' }))
  const i2 = infoConReferencia(i1, vr({ origen: 'humano', version: 'FORTWO COUPE' }))
  assert.deepEqual((i2 as Record<string, unknown>).datosVehiculo, { x: 1 })
  assert.deepEqual(referenciasDeInfo(i2).map((v) => v.origen), ['humano', 'mapfre'])
  // Una casilla con el origen cambiado (o con matrícula) no cuenta.
  assert.deepEqual(referenciasDeInfo({ vehiculoReferencia: { porOrigen: { humano: vr({ origen: 'allianz', modelo: 'X' }), mapfre: { ...vr({ modelo: 'X' }), matricula: 'Y' } } } }), [])
})

test('prioridad: humano > Mapfre > póliza > Allianz (la póliza se lee viva, no se guarda)', () => {
  const soloAllianz = infoConReferencia({}, vr({ origen: 'allianz', marca: 'SMART', modelo: 'FORTWO' }))
  const poliza = { marca: 'SMART', modelo: 'FORFOUR', version: 'PURE 1.1' }
  assert.equal(referenciaEfectiva(soloAllianz, null)?.origen, 'allianz')
  assert.equal(referenciaEfectiva(soloAllianz, poliza)?.origen, 'poliza')
  const conMapfre = infoConReferencia(soloAllianz, vr({ origen: 'mapfre', version: 'SMART FORFOUR 5P' }))
  assert.equal(referenciaEfectiva(conMapfre, poliza)?.origen, 'mapfre')
  assert.equal(referenciaEfectiva(infoConReferencia(conMapfre, vr({ origen: 'humano', version: 'FORTWO COUPE' })), poliza)?.origen, 'humano')
})

test('desde el ok de origen: Mapfre (confirmado + catálogo) y Allianz (catálogo); otras compañías/ramos nada', () => {
  const m = referenciaDeResultadoOrigen('mapfre', 'auto', { vehiculoConfirmado: { origen: 'mapfre', denominacion: 'SMART FORFOUR 5P', cv: 75, cc: 1124, puertas: 5, fechaInicio: null } })
  assert.equal(m?.origen, 'mapfre')
  assert.equal(m?.cv, 75)
  const mc = referenciaDeResultadoOrigen('mapfre', 'auto', { vehiculoConfirmado: { origen: 'mapfre', denominacion: 'SMART FORFOUR 5P', cv: 75, cc: 1124, puertas: 5, fechaInicio: null }, seleccionVehiculo: { marca: 'SMART', modelo: 'FORFOUR' } })
  assert.deepEqual([mc?.marca, mc?.modelo], ['SMART', 'FORFOUR'])
  assert.equal(referenciaDeResultadoOrigen('allianz', 'auto', { seleccionVehiculo: { marca: 'SMART', modelo: 'FORTWO', descripcion: 'PURE 52' } })?.origen, 'allianz')
  assert.equal(referenciaDeResultadoOrigen('generali', 'auto', { seleccionVehiculo: { marca: 'SMART', modelo: 'FORTWO' } }), null)
  assert.equal(referenciaDeResultadoOrigen('allianz', 'hogar', { seleccionVehiculo: { marca: 'SMART', modelo: 'FORTWO' } }), null)
})

test('elección humana → referencia humana: la etiqueta es la versión; el modelo NO se hereda de la previa (la marca sí)', () => {
  const h = referenciaDeEleccionHumana('FORTWO COUPE', vr({ origen: 'mapfre', marca: 'SMART', modelo: 'FORFOUR' }))
  assert.deepEqual([h?.origen, h?.marca, h?.modelo, h?.version], ['humano', 'SMART', null, 'FORTWO COUPE'])
  assert.equal(referenciaDeEleccionHumana('PURE 1234BCD', null), null)
})

test('entrega: el riesgo lleva la referencia solo en vehículo', () => {
  const v = vr({ modelo: 'FORFOUR' })
  assert.deepEqual(riesgoConReferencia({ ramo: 'auto' }, 'auto', v), { ramo: 'auto', vehiculoReferencia: v })
  const hogar = { ramo: 'hogar' }
  assert.equal(riesgoConReferencia(hogar, 'hogar', v), hogar)
  const sin = { ramo: 'auto' }
  assert.equal(riesgoConReferencia(sin, 'auto', null), sin)
})

test('parada por versión: casa con la referencia → elección DE SU lista + supuesto; un solo intento automático', () => {
  const ref = vr({ origen: 'mapfre', marca: 'SMART', modelo: 'FORFOUR', puertas: 5 })
  const d = eleccionPorReferenciaParaTrabajo(parada(), ref, { humano: false })
  assert.deepEqual(d.aplicar && d.eleccion, { codigo: 'G2', etiqueta: 'FORFOUR' })
  assert.match(d.aplicar ? d.supuesto : '', /vehículo según Mapfre/)
  // Ya tuvo una elección (persona, IA o referencia) → para una persona.
  for (const riesgo of [{ eleccionVersion: { codigo: 'G1' } }, { eleccionVersionIa: {} }, { [MARCA_ELECCION_REFERENCIA]: 'x' }]) {
    assert.equal(eleccionPorReferenciaParaTrabajo(parada({ riesgo }), ref, { humano: false }).aplicar, false)
  }
  // Sin referencia, sin lista, otro estado/ramo/modo → nada.
  assert.equal(eleccionPorReferenciaParaTrabajo(parada(), null, { humano: false }).aplicar, false)
  assert.equal(eleccionPorReferenciaParaTrabajo(parada({ error: { tipo: 'eleccion' } }), ref, { humano: false }).aplicar, false)
  assert.equal(eleccionPorReferenciaParaTrabajo(parada({ estado: 'error_definitivo' }), ref, { humano: false }).aplicar, false)
  assert.equal(eleccionPorReferenciaParaTrabajo(parada({ ramo: 'hogar' }), ref, { humano: false }).aplicar, false)
  assert.equal(eleccionPorReferenciaParaTrabajo(parada({ modo: 'emision' }), ref, { humano: false }).aplicar, false)
  assert.equal(eleccionPorReferenciaParaTrabajo(parada({ error: { tipo: 'captcha', opcionesVersion: LISTA_GENERALI } }), ref, { humano: false }).aplicar, false)
})

test('propagación de la elección humana: los DEMÁS parados por versión de la oportunidad, cada uno de SU lista', () => {
  const ref = referenciaDeEleccionHumana('FORTWO COUPE', vr({ marca: 'SMART' }))
  const filas: FilaPropagacion[] = [
    parada({ id: 'origen', compania: 'allianz' }),
    parada({ id: 'g' }),
    parada({ id: 'ya-humano', riesgo: { eleccionVersion: { codigo: 'G1', etiqueta: 'FORTWO CABRIO' } } }),
    parada({ id: 'ya-ia', riesgo: { eleccionVersion: { codigo: 'G2', etiqueta: 'FORFOUR' }, eleccionVersionIa: {} } }),
    parada({ id: 'captcha', error: { tipo: 'captcha' } }),
  ]
  const p = planPropagacion(filas, ref, 'origen')
  assert.deepEqual(p.map((x) => [x.id, x.eleccion.codigo]), [['g', 'G3'], ['ya-ia', 'G3']])
  assert.match(p[0]!.supuesto, /vehículo según elección en la bandeja/)
  assert.deepEqual(planPropagacion(filas, null, 'origen'), [])
})

test('el supuesto de la referencia va a los avisos de la oferta → precio estimado', () => {
  const s = 'Versión «FORFOUR» elegida por aproximación al vehículo de referencia (vehículo según Mapfre; supuesto); revisar en la emisión'
  const ofertas = [{ avisos: ['otro aviso'] }, { avisos: undefined }]
  const con = ofertasConSupuestoReferencia(ofertas, { [MARCA_ELECCION_REFERENCIA]: s })
  assert.deepEqual(con.map((o) => o.avisos), [['otro aviso', s], [s]])
  assert.deepEqual(ofertasConSupuestoReferencia(con, { [MARCA_ELECCION_REFERENCIA]: s }).map((o) => o.avisos), [['otro aviso', s], [s]])
  assert.deepEqual(ofertasConSupuestoReferencia(ofertas, {}), ofertas)
  assert.equal(avisoEsSupuesto(s), true)
  assert.equal(firmezaPrecioRpa({ compania: 'generali', ramo: 'auto', riesgo: { polizaAnteriorUltimos5: '12345' }, oferta: { polizaAnteriorTecleada: true, avisos: con[1]!.avisos as string[] } }), 'estimado')
})

test('cableado: entrega, ok de origen, oferta y bandeja usan la referencia', () => {
  const t = readFileSync(new URL('./tarificador.ts', import.meta.url), 'utf8')
  const entrega = t.slice(t.indexOf('export async function trabajoParaWorker'), t.indexOf('// ─── Resultado'))
  assert.match(entrega, /riesgo = riesgoConReferencia\(riesgo, f\.ramo, await leerReferenciaOportunidad\(prisma, f\.correduria_id, f\.oportunidad_id\)\)/)
  assert.match(t, /referenciaOk = \{ correduriaId: t\.correduria_id, oportunidadId: t\.oportunidad_id, ref: referenciaDeResultadoOrigen\(t\.compania, t\.ramo, r\.vehiculo\) \}/)
  assert.match(t, /if \(refOk\?\.ref\) await guardarReferenciaOportunidad\(/)
  assert.match(t, /ofertasConFirmezaRpa\(t\.compania, t\.ramo, riesgoEntregado, ofertasConSupuestoReferencia\(ofertas, rg\)\)/)
  const b = readFileSync(new URL('./tarificador-bandeja.ts', import.meta.url), 'utf8')
  assert.match(b, /propagar = \{ oportunidadId: f\.oportunidad_id, etiqueta: v\.eleccion\.etiqueta \}/)
  // Tras la transacción (la acción de la persona nunca depende de la propagación).
  assert.ok(b.indexOf('await propagarEleccionHumana(') > b.indexOf('const res = await prisma.$transaction'))
  const ruta = readFileSync(new URL('../app/api/operador/tarificador/bandeja/[id]/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /for \(const c of \[\.\.\.new Set\(propagados\.map\(\(x\) => x\.compania\)\)\][^\n]*\{\n\s*await lanzarPendientes\(correduria\.id, c\)/)
  const res = readFileSync(new URL('../app/api/tarificador/resultado/route.ts', import.meta.url), 'utf8')
  // 1º referencia, 2º IA: un solo intento automático.
  assert.match(res, /if \(\(await intentarEleccionPorReferencia\(trabajoId\)\)\.estado === 'aplicado'\) return\n\s*if \(eleccionIaActiva\(process\.env\) && \(await intentarEleccionVersionIa\(trabajoId\)\)/)
})

test('presupuesto: un cierre SIN precio también dispara (con los ok de los demás); lo abierto sigue esperando', () => {
  for (const e of ['ok', 'error_definitivo', 'requiere_humano', 'cancelado', 'atascado']) assert.equal(cierrePuedeDispararPresupuesto(e, null), true, e)
  for (const e of ['pendiente', 'en_curso', 'error_reintentable']) assert.equal(cierrePuedeDispararPresupuesto(e, 'tarificar'), false, e)
  assert.equal(cierrePuedeDispararPresupuesto('ok', 'exploracion'), false)
  // Mapfre ok + Allianz que acaba en error definitivo (el último en cerrarse) → borrador con el de Mapfre.
  assert.deepEqual(decidirDisparo([{ estado: 'ok', modo: null, tarificacionId: 'x' }, { estado: 'error_definitivo', modo: null, tarificacionId: null }]), { disparar: true })
  const rpa = readFileSync(new URL('./presupuesto-rpa.ts', import.meta.url), 'utf8')
  assert.match(rpa, /if \(!cierrePuedeDispararPresupuesto\(t\.estado, t\.modo\)\) return/)
  const res = readFileSync(new URL('../app/api/tarificador/resultado/route.ts', import.meta.url), 'utf8')
  assert.match(res, /!paradaVersion && cierrePuedeDispararPresupuesto\(r\.estadoTrabajo, null\)\) \{\n\s*const trabajoId = l\.r\.trabajoId\n\s*after\(\(\) => presupuestoTrasTrabajoRpa\(trabajoId\)/)
  const ban = readFileSync(new URL('../app/api/operador/tarificador/bandeja/[id]/route.ts', import.meta.url), 'utf8')
  assert.match(ban, /accion === 'cancelar' && r\.estado === 'aplicado'\) after\(\(\) => presupuestoTrasTrabajoRpa\(id\)/)
})

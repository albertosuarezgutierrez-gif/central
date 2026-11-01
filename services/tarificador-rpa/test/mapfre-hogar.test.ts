// Mapfre HOGAR (borrador, 15/10/2026): lector de prima con el formato del presupuesto, elección de fila de catastro, referencia
// catastral del riesgo y que el adaptador solo se registra con su flag (apagado). Fixtures SINTÉTICOS: ningún dato personal ni importe real.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validarFormularioHogar, type FormularioHogar } from '@central/module-tarificacion'
import { adaptadores } from '../src/adapters/index.ts'
import {
  MAPFRE_HOGAR_ACTIVO,
  datosTomadorDe,
  PROTECCIONES_MAPEADAS,
  SEL_HOGAR,
  ErrorMapaIncompleto,
  exigirDatosHogar,
  importeDePrimaHogar,
  indiceFilaCatastro,
  mapfreHogar,
  ofertasDesdePrimasHogar,
  partesFilaCatastro,
  primasDesdeTextoPrecio,
  referenciaCatastralDe,
  planVivienda,
  habitacionesYBanosPorM2,
  indiceOpcionDesplegable,
  primasDesdeTextoLibre,
  resumenPantallaPrecio,
} from '../src/adapters/mapfre/hogar.ts'

const RC = '0000000AA0000A0001BC'
const FORM = (rc?: string): FormularioHogar => ({
  ramo: 'hogar',
  tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '1980-01-02' },
  inmueble: { codigoPostal: '41001', municipio: null, nombreVia: 'Calle Ficticia', numero: '1', bloque: null, escalera: null, planta: '1', puerta: 'IZ', anioConstruccion: 1990, anioReforma: null, superficieM2: 80, ...(rc ? { referenciaCatastral: rc } : {}) },
  hogar: { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: false, capitalContinenteEur: null, capitalContenidoEur: null },
})

// Cuadro «PRIMA DEL SEGURO» con el formato del PDF (importes inventados).
const CUADRO = `PRIMA DEL SEGURO
HOGAR TÚ ELIGES HOGAR FAMILIAR HOGAR PLATINO
ANUAL
Prima total 100,10 € 200,20 € 1.300,30 €
Primer recibo 100,10 € 200,20 € 1.300,30 €
Sucesivos ** ** **
SEMESTRAL
Prima total 110,11 € 210,21 € 1.310,31 €
Primer recibo 55,06 € 105,11 € 655,16 €`

test('importeDePrimaHogar: formato del presupuesto (coma decimal, miles con punto, € detrás)', () => {
  assert.equal(importeDePrimaHogar('275,80 €'), 275.8)
  assert.equal(importeDePrimaHogar('1.234,56 €'), 1234.56)
  assert.equal(importeDePrimaHogar('**'), null)
  assert.equal(importeDePrimaHogar('275,8 €'), null)
  assert.equal(importeDePrimaHogar('275.80 €'), null)
  assert.equal(importeDePrimaHogar('0,00 €'), null)
})

test('primasDesdeTextoPrecio: una prima ANUAL por modalidad; semestral y trimestral se ignoran', () => {
  const p = primasDesdeTextoPrecio(CUADRO)
  assert.deepEqual(p.map((x) => [x.modalidad, x.primaAnualEur, x.primerReciboEur]), [
    ['HOGAR TÚ ELIGES', 100.1, 100.1],
    ['HOGAR FAMILIAR', 200.2, 200.2],
    ['HOGAR PLATINO', 1300.3, 1300.3],
  ])
})

test('primasDesdeTextoPrecio es fail-closed: sin cabecera, sin ANUAL o con un importe de menos → []', () => {
  assert.deepEqual(primasDesdeTextoPrecio('ANUAL Prima total 100,10 €'), [])
  assert.deepEqual(primasDesdeTextoPrecio('HOGAR TÚ ELIGES HOGAR FAMILIAR\nSEMESTRAL\nPrima total 1,00 € 2,00 €'), [])
  assert.deepEqual(primasDesdeTextoPrecio('HOGAR TÚ ELIGES HOGAR FAMILIAR HOGAR PLATINO\nANUAL\nPrima total 100,10 € 200,20 €'), [])
  assert.deepEqual(primasDesdeTextoPrecio(''), [])
})

test('ofertasDesdePrimasHogar: una oferta por modalidad, sin garantías inventadas', () => {
  const o = ofertasDesdePrimasHogar(primasDesdeTextoPrecio(CUADRO))
  assert.equal(o.length, 3)
  assert.equal(o[0]!.producto, 'Hogar · HOGAR TÚ ELIGES')
  assert.equal(o[0]!.fraccionamiento, 'anual')
  assert.deepEqual(o[0]!.coberturas, [])
  assert.ok(o[0]!.avisos.some((a) => /Garant/.test(a)))
})

test('referencia catastral: solo 20 caracteres (ya no obligatoria: se tarifica por CP)', () => {
  assert.equal(referenciaCatastralDe(FORM(RC)), RC)
  assert.equal(referenciaCatastralDe(FORM('0000000AA0000A')), null)
  assert.equal(referenciaCatastralDe(FORM()), null)
  // v0.3.0: la vivienda se tarifica por CP; la referencia ya NO es obligatoria (exploración 9a1ced53).
  assert.equal(exigirDatosHogar(FORM()).codigoPostal, '41001')
  assert.throws(() => exigirDatosHogar({ ...FORM(), inmueble: { ...FORM().inmueble, codigoPostal: '4100' } }), (e: Error & { tipo?: string }) => e.tipo === 'datos' && !e.message.includes('Ficticia'))
})

test('validarFormularioHogar conserva la referencia catastral normalizada y rechaza una mal formada', () => {
  const crudo = (rc: string) => ({ ...FORM(), inmueble: { ...FORM().inmueble, referenciaCatastral: rc } })
  const ok = validarFormularioHogar(crudo(' 0000000aa0000a0001bc '), new Date('2026-10-15T00:00:00Z'))
  assert.ok(ok.ok && ok.formulario.inmueble.referenciaCatastral === RC)
  const mal = validarFormularioHogar(crudo('XX'), new Date('2026-10-15T00:00:00Z'))
  assert.ok(!mal.ok && mal.errores.some((e) => e.startsWith('inmueble.referenciaCatastral')))
})

test('fila de catastro: una sola → 0; varias → la única que casa por escalera/planta/puerta; si no, requiere_humano con opciones', () => {
  const f = (s: string) => ({ descripcion: s })
  assert.deepEqual(partesFilaCatastro('CL FICTICIA 0001 Es:1 Pl:01 Pt:IZ'), { escalera: '1', planta: '01', puerta: 'IZ' })
  assert.equal(indiceFilaCatastro([f('CL X 0001 Es:1 Pl:02 Pt:DR')], { escalera: null, planta: '1', puerta: 'IZ' }), 0)
  const varias = [f('CL X 0001 Es:1 Pl:01 Pt:DR'), f('CL X 0001 Es:1 Pl:01 Pt:IZ'), f('CL X 0001 Es:1 Pl:02 Pt:IZ')]
  assert.equal(indiceFilaCatastro(varias, { escalera: null, planta: '1', puerta: 'Izquierda' }), 1)
  assert.throws(() => indiceFilaCatastro(varias, { escalera: null, planta: null, puerta: null }), (e: Error & { tipo?: string; opciones?: unknown[] }) => e.name === 'ErrorEleccionVersion' && e.tipo === 'eleccion' && e.opciones?.length === 3)
  assert.throws(() => indiceFilaCatastro([f('CL X Es:1 Pl:01 Pt:IZ'), f('CL X Es:2 Pl:01 Pt:IZ')], { escalera: null, planta: '1', puerta: 'IZ' }), (e: Error) => e.name === 'ErrorEleccionVersion')
  assert.throws(() => indiceFilaCatastro([], { escalera: null, planta: null, puerta: null }), (e: Error & { tipo?: string }) => e.tipo === 'datos')
})

test('registro SOLO bajo el flag (21/10/2026): apagado no está en el registro; en index.ts, un import y un registro condicionado', () => {
  assert.equal(MAPFRE_HOGAR_ACTIVO, false)
  assert.equal(adaptadores.obtener('mapfre', 'hogar'), null)
  assert.ok(!adaptadores.claves().some((k) => k.includes('mapfre') && k.includes('hogar')))
  const idx = readFileSync(new URL('../src/adapters/index.ts', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')
  assert.match(idx, /^if \(MAPFRE_HOGAR_ACTIVO\) adaptadores\.registrar\(mapfreHogar\)$/m, 'mapfreHogar se registra SOLO con `if (MAPFRE_HOGAR_ACTIVO)`')
  assert.equal((idx.match(/mapfreHogar/g) ?? []).length, 2, 'mapfreHogar: un import y un registro condicionado')
})

test('datosTomador (lo inyecta asegura): solo persona física; jurídica o ausente → nada que escribir (no se inventa)', () => {
  const base = { ramo: 'hogar' } as never as Parameters<typeof datosTomadorDe>[0]
  assert.deepEqual(datosTomadorDe(base), {})
  assert.deepEqual(datosTomadorDe({ ...base, datosTomador: { tipo: 'fisica', nombre: 'PRUEBA', apellido1: 'UNO', apellido2: null, fechaNacimiento: '1980-01-15' } }), { nombre: 'PRUEBA', apellido1: 'UNO', apellido2: null })
  assert.deepEqual(datosTomadorDe({ ...base, datosTomador: { tipo: 'juridica', razonSocial: 'EMPRESA PRUEBA' } }), {})
})

test('huecos explícitos: protecciones sin mapear (no se tocan); apagado, tarificar ni abre el navegador', async () => {
  assert.equal(SEL_HOGAR.referenciaCatastral, null)
  assert.equal(SEL_HOGAR.codigoPostal, 'input[name="cp"]') // `#cp` está duplicado (vivienda y tomador)
  assert.equal(SEL_HOGAR.codigoPostalTomador, 'input[name="cpTomador"]')
  assert.equal(PROTECCIONES_MAPEADAS, false)
  await assert.rejects(() => mapfreHogar.tarificar(null as never, FORM(RC), null as never), (e: Error & { tipo?: string }) => e.tipo === 'datos' && /apagado/.test(e.message))
  assert.equal(new ErrorMapaIncompleto('x').pideInventarioDom, true)
})

test('el borrador no nombra acciones de emisión ni de impresión como acción', () => {
  const src = readFileSync(new URL('../src/adapters/mapfre/hogar.ts', import.meta.url), 'utf8')
  const codigo = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**')).join('\n')
  assert.ok(!/imprimir|contratar|emitir|\.click\(|grabar/i.test(codigo.replace(/«[^»]*»/g, '')))
})

test('planVivienda: mapeo a los campos de «Datos de riesgo - Hogar» y supuestos declarados', () => {
  const p = planVivienda(FORM())
  assert.equal(p.opcionUso, 'habitual')
  assert.equal(p.opcionRegimen, 'propiedad')
  assert.deepEqual(p.tipoTextos, ['Piso o Apartamento'])
  assert.deepEqual(p.plantaTextos, ['Intermedia'])
  assert.equal(p.plantaPorDefecto, true)
  assert.deepEqual([p.habitaciones, p.banos], [3, 2]) // 80 m²
  for (const k of ['calidad_media', 'habitaciones_y_banos_por_m2', 'planta_intermedia', 'sin_medidas_proteccion']) assert.ok(p.supuestos.includes(k), k)
  const f = FORM()
  const baja = planVivienda({ ...f, inmueble: { ...f.inmueble, planta: 'BJ' } })
  assert.deepEqual(baja.plantaTextos, ['Baja', 'Planta baja'])
  assert.ok(!baja.supuestos.includes('planta_intermedia'))
  const casa = planVivienda({ ...f, hogar: { ...f.hogar, tipoVivienda: 'adosada', regimen: 'inquilino', uso: 'secundaria' } })
  assert.equal(casa.plantaTextos, null)
  assert.equal(casa.opcionUso, 'temporal')
  assert.equal(casa.opcionRegimen, 'inquilinoAlquiler')
  assert.ok(casa.supuestos.includes('uso_secundaria_como_temporal'))
})

test('planVivienda NO adivina: uso alquiler/turístico y madera → datos', () => {
  const f = FORM()
  const datos = (e: Error & { tipo?: string }) => e.tipo === 'datos'
  assert.throws(() => planVivienda({ ...f, hogar: { ...f.hogar, uso: 'alquiler' } }), datos)
  assert.throws(() => planVivienda({ ...f, hogar: { ...f.hogar, uso: 'turistico' } }), datos)
  assert.throws(() => planVivienda({ ...f, hogar: { ...f.hogar, conMadera: true } }), datos)
})

test('habitaciones y baños por m² (supuesto) en los umbrales', () => {
  assert.deepEqual(habitacionesYBanosPorM2(30), { habitaciones: 1, banos: 1 })
  assert.deepEqual(habitacionesYBanosPorM2(64), { habitaciones: 2, banos: 2 })
  assert.deepEqual(habitacionesYBanosPorM2(200), { habitaciones: 5, banos: 3 })
})

test('indiceOpcionDesplegable: única o nada (ambigua = null; "contiene" solo de la opción hacia el candidato)', () => {
  assert.equal(indiceOpcionDesplegable(['Casa', 'Piso o Apartamento'], ['Piso o Apartamento']), 1)
  assert.equal(indiceOpcionDesplegable(['Planta baja', 'Intermedia', 'Última'], ['Baja', 'Planta baja']), 0)
  assert.equal(indiceOpcionDesplegable(['Casa', 'Chalet adosado'], ['Casa independiente']), null)
  assert.equal(indiceOpcionDesplegable(['Baja', 'Planta baja'], ['Baja', 'Planta baja']), null)
  assert.equal(indiceOpcionDesplegable([], ['X']), null)
})

test('primasDesdeTextoLibre: encabezado HOGAR + prima etiquetada o importe «/año»; ambiguo o sin € → []', () => {
  const t = 'Modalidades\nHOGAR FAMILIAR\nPrima total: 210,50 €\nHOGAR PLATINO\n1.320,00 € / año\n55,00 € / mes'
  assert.deepEqual(primasDesdeTextoLibre(t).map((x) => [x.modalidad, x.primaAnualEur]), [['HOGAR FAMILIAR', 210.5], ['HOGAR PLATINO', 1320]])
  assert.deepEqual(primasDesdeTextoLibre('HOGAR FAMILIAR\nPrima total: 10,00 €\nPrima anual: 20,00 €'), [])
  assert.deepEqual(primasDesdeTextoLibre('HOGAR FAMILIAR\nSin precio'), [])
  assert.deepEqual(primasDesdeTextoLibre('HOGAR FAMILIAR\nPrima total: 275 euros'), [])
})

test('resumenPantallaPrecio: dice qué se vio sin datos personales (secretos, dígitos largos)', () => {
  const r = resumenPantallaPrecio({ url: 'https://wmediadores.mapfre.com/x/y?token=ABC', titulos: ['Modalidades', 'Presupuesto de JUAN PEREZ'], botones: ['VOLVER', 'IMPRIMIR 12345678'], invalidos: ['vc'], importes: 0 }, ['JUAN PEREZ'])
  assert.ok(r.includes('«Modalidades»') && r.includes('«VOLVER»') && r.includes('«vc»'))
  assert.ok(!r.includes('JUAN') && !r.includes('12345678') && !r.includes('token'))
})

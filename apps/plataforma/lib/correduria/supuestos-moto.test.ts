// INVARIANTE (15/10/2026): MOTO pasa a la fuente única `valoresQueViajan(..., 'moto')` SIN cambiar lo que viaja. Pedir
// precio cuesta 0,50€ y declara un riesgo: el cuerpo que va a Avant2 y el formulario del bot de moto tienen que ser
// IDÉNTICOS a los de antes para el mismo riesgo. Mismas tres capas que `supuestos-auto.test.ts`:
//   1. `inicialAntiguo` = COPIA CONGELADA del cálculo que hacía `CotizadorMoto.tsx` antes de este cambio (garaje, km,
//      compra, historial con topes en embebido / sin topes en completo, y seguro actual). Se compara con
//      `formularioInicial(valoresQueViajan(..., 'moto'))`.
//   2. `peticion` = los tramos de `pedirPrecioSinGuarda` y del formulario de `PrecioBots` que dependen de esos campos; un
//      cepo de fuente comprueba que la pantalla los sigue construyendo con esas mismas líneas.
//   3. Valores FIJOS por riesgo de ejemplo: si alguien cambia un supuesto, rojo aunque cambie a la vez copia y helper.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { kilometrosDesdeTexto, origenesHistorialManual, ultimosDigitosPoliza, type DatosVehiculoRiesgo, type HistorialDeclaradoRiesgo, type SeguroAnterior } from '@central/module-seguros'
import { garajeInicial } from '../supuestos-presupuesto.ts'
import { codigoCompania, historialDeclarado, type AnteriorParaTarificar } from '../seguro-anterior.ts'
import { formularioInicial, supuestosAlPedir, tieneSeguroSinDato, valoresQueViajan, type FormularioInicialAuto } from './supuestos-auto.ts'

type Opcion = { id: string; nombre: string }
type Companias = { codigoDgs: string; nombreComun: string; nombreCima: string | null }[] | null
type Caso = {
  nombre: string
  embebido: boolean
  datosRiesgo: DatosVehiculoRiesgo | null
  historialRiesgo: Partial<HistorialDeclaradoRiesgo> | null
  anterior: AnteriorParaTarificar | null
  garajes: Opcion[]
  companias: Companias
  matriculaAnterior?: string
}

// ── 1. Copia CONGELADA del cálculo viejo de `CotizadorMoto.tsx` (antes del 15/10/2026) ───────────────────────────────

function historialConTopesAntiguo<T extends { aniosAsegurado: number; aniosEnCompania: number; aniosSinSiniestros: number }>(leido: T, arriba: Partial<HistorialDeclaradoRiesgo> | null): T {
  const aseguradoArriba = arriba?.aniosAsegurado ?? null
  const enCompaniaArriba = arriba?.aniosEnCompania ?? null
  const asegurado = aseguradoArriba ?? leido.aniosAsegurado
  return {
    ...leido,
    aniosAsegurado: asegurado,
    aniosEnCompania: enCompaniaArriba ?? Math.min(leido.aniosEnCompania, asegurado),
    aniosSinSiniestros: Math.min(leido.aniosSinSiniestros, asegurado),
  }
}

function seguroActualEmbebidoAntiguo(e: {
  arriba: Partial<HistorialDeclaradoRiesgo> | null
  leido: { tiene: boolean; companiaCodigo: string; companiaLibre: string; poliza: string; aniosSinSiniestros: number; siniestrosUltimos5: number | null }
  conCatalogo: boolean
  codigoDe: (texto: string) => string | null
}) {
  const a = e.arriba ?? {}
  const l = e.leido
  const tieneArriba = a.tieneSeguroActual ?? null
  const companiaArriba = a.companiaActual ?? null
  let companiaCodigo = l.companiaCodigo
  let companiaLibre = l.companiaLibre
  let companiaNoReconocida: string | null = null
  if (companiaArriba !== null) {
    if (e.conCatalogo) {
      companiaCodigo = e.codigoDe(companiaArriba) ?? ''
      companiaLibre = ''
      if (companiaCodigo === '') companiaNoReconocida = companiaArriba
    } else {
      companiaCodigo = ''
      companiaLibre = companiaArriba
    }
  }
  const codigoParaPoliza = companiaCodigo || companiaLibre
  const polizaArriba = a.numeroPoliza ?? null
  const polizaFuente = polizaArriba ?? (l.poliza.trim() === '' ? null : l.poliza)
  const sinArriba = a.aniosSinSiniestros ?? null
  const s5Arriba = a.siniestrosUltimos5 ?? null
  const s5 = s5Arriba ?? l.siniestrosUltimos5
  return {
    tieneSeguroActual: tieneArriba ?? l.tiene,
    tieneSeguroSinDato: tieneArriba === null && !l.tiene,
    companiaCodigo,
    companiaLibre,
    companiaNoReconocida,
    polizaDigitos: polizaFuente === null ? '' : ultimosDigitosPoliza(polizaFuente, codigoParaPoliza) ?? '',
    aniosSinSiniestros: String(sinArriba ?? l.aniosSinSiniestros),
    siniestrosUltimos5: s5 === null ? '' : String(s5),
  }
}

function inicialAntiguo(c: Caso) {
  const { embebido, datosRiesgo, historialRiesgo, anterior, garajes, companias } = c
  const kmAnuales = datosRiesgo?.kmAnuales != null ? String(datosRiesgo.kmAnuales) : ''
  const inicioGaraje = garajeInicial(datosRiesgo?.garaje, garajes)
  const garajeDelRiesgo = inicioGaraje.delRiesgo ? inicioGaraje.id : null
  const garajeSinCasar = inicioGaraje.sinCasar
  const garaje = inicioGaraje.id
  const sa = anterior?.seguroAnterior ?? null
  const historialLeido = historialDeclarado(sa)
  const historialEmb = embebido ? historialConTopesAntiguo(historialLeido, historialRiesgo) : null
  const historial = historialEmb ?? historialLeido
  const seguroLeido = {
    tiene: anterior !== null,
    companiaCodigo: anterior && companias ? codigoCompania(companias, { codigoDgs: sa?.codigoDgs ?? null, nombre: anterior.aseguradora }) ?? '' : '',
    companiaLibre: companias === null ? sa?.codigoDgs ?? '' : '',
    poliza: anterior?.numeroPoliza?.trim() ?? '',
    aniosSinSiniestros: historial.aniosSinSiniestros,
    siniestrosUltimos5: historial.siniestrosUltimos5,
  }
  const seguroArriba = embebido
    ? seguroActualEmbebidoAntiguo({
        arriba: historialRiesgo,
        leido: seguroLeido,
        conCatalogo: companias !== null,
        codigoDe: (t) => {
          const cc = t.trim().toUpperCase()
          return companias ? codigoCompania(companias, { codigoDgs: /^[CM]\d{4}$/.test(cc) ? cc : null, nombre: t }) : null
        },
      })
    : null
  const formulario: FormularioInicialAuto = {
    garaje,
    kmAnuales,
    fechaCompra: embebido ? datosRiesgo?.fechaCompra ?? '' : '',
    tieneSeguroActual: seguroArriba?.tieneSeguroActual ?? seguroLeido.tiene,
    companiaActualCodigo: seguroArriba?.companiaCodigo ?? seguroLeido.companiaCodigo,
    companiaActualLibre: seguroArriba?.companiaLibre ?? seguroLeido.companiaLibre,
    polizaActualDigitos: seguroArriba?.polizaDigitos ?? seguroLeido.poliza,
    aniosAsegurado: String(historial.aniosAsegurado),
    aniosEnCompania: String(historial.aniosEnCompania),
    aniosSinSiniestros: seguroArriba?.aniosSinSiniestros ?? String(historial.aniosSinSiniestros),
    siniestrosUltimos5: seguroArriba?.siniestrosUltimos5 ?? (historial.siniestrosUltimos5 === null ? '' : String(historial.siniestrosUltimos5)),
  }
  return {
    formulario,
    garajeDelRiesgo,
    garajeSinCasar,
    companiaNoReconocida: seguroArriba?.companiaNoReconocida ?? null,
    tieneSeguroSinDato: seguroArriba?.tieneSeguroSinDato ?? false,
  }
}

function inicialNuevo(c: Caso) {
  const viajan = valoresQueViajan(
    { datosVehiculo: c.datosRiesgo, historialDeclarado: c.embebido ? c.historialRiesgo : null },
    { garajes: c.garajes, companias: c.companias },
    { anterior: c.anterior },
    c.embebido ? 'embebido' : 'completo',
    'moto',
  )
  return {
    formulario: formularioInicial(viajan),
    garajeDelRiesgo: viajan.garaje.origen === 'riesgo' ? viajan.garaje.valor : null,
    garajeSinCasar: viajan.garaje.sinCasar,
    companiaNoReconocida: viajan.compania.noReconocida,
    // La verificación solo existe en embebido.
    tieneSeguroSinDato: c.embebido ? tieneSeguroSinDato(viajan) : false,
    viajan,
  }
}

// ── 2. Lo que viaja: los tramos de `pedirPrecioSinGuarda` y del formulario de `PrecioBots` (moto) ────────────────────

const HOY = '2026-10-15'
function peticion(c: Caso, ini: ReturnType<typeof inicialAntiguo>) {
  const f = ini.formulario
  const sa = c.anterior?.seguroAnterior ?? null
  const matriculacion = c.datosRiesgo?.fechaMatriculacion ?? ''
  const kmLeidos = kilometrosDesdeTexto(f.kmAnuales)
  const fechaCompra = f.fechaCompra
  const compraInvalida = fechaCompra !== '' && matriculacion !== '' && fechaCompra < matriculacion
  const correccionesFinal: Record<string, unknown> = {
    ...(kmLeidos !== null ? { kmAnuales: kmLeidos } : {}),
    ...(fechaCompra !== '' && !compraInvalida ? { fechaCompra } : {}),
  }
  const companiaActualElegida = f.companiaActualCodigo || f.companiaActualLibre.trim()
  if (f.tieneSeguroActual) {
    correccionesFinal.aseguradoAntes = true
    correccionesFinal.companiaAnteriorCodigo = companiaActualElegida
    correccionesFinal.polizaAnterior = f.polizaActualDigitos.trim()
    if ((c.matriculaAnterior ?? '').trim()) correccionesFinal.matriculaAnterior = c.matriculaAnterior!.trim()
    correccionesFinal.aniosAsegurado = Number(f.aniosAsegurado)
    correccionesFinal.aniosEnCompania = Number(f.aniosEnCompania)
    correccionesFinal.aniosSinSiniestros = Number(f.aniosSinSiniestros)
    if (f.siniestrosUltimos5.trim() !== '') correccionesFinal.siniestrosUltimos5 = Number(f.siniestrosUltimos5)
    Object.assign(correccionesFinal, origenesHistorialManual({ seguro: sa, aniosAsegurado: Number(f.aniosAsegurado), aniosSinSiniestros: Number(f.aniosSinSiniestros), hoy: HOY }))
  }
  const garajeElegido = ini.garajeDelRiesgo !== null
  return {
    resueltos: { garaje: f.garaje, garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: kmLeidos, garaje: garajeElegido ? f.garaje : null } },
    correcciones: correccionesFinal,
    bots: { tieneSeguroActual: f.tieneSeguroActual, aniosAsegurado: f.aniosAsegurado, aniosSinSiniestros: f.aniosSinSiniestros, siniestrosUltimos5: f.siniestrosUltimos5 },
    verificacion: { faltaGaraje: !f.garaje, garajeSinCasar: ini.garajeSinCasar, companiaNoReconocida: ini.companiaNoReconocida, tieneSeguroSinDato: ini.tieneSeguroSinDato, compraInvalida },
  }
}

// ── Riesgos de moto de ejemplo ────────────────────────────────────────────────────────────────────────────────────────

const GARAJES_MOTO: Opcion[] = [
  { id: 'CommunalParking', nombre: 'Garaje comunitario' },
  { id: 'PrivateGarage', nombre: 'Garaje individual' },
  { id: 'Street', nombre: 'En la calle' },
]
// Dos «calle»: «PublicRoad» no se resuelve con certeza (se pregunta, nunca el comunitario por defecto).
const GARAJES_DOS_CALLES: Opcion[] = [...GARAJES_MOTO, { id: 'OpenAir', nombre: 'En la vía pública (aire libre)' }]
const COMPANIAS_MOTO = [
  { codigoDgs: 'C0058', nombreComun: 'Mapfre', nombreCima: null },
  { codigoDgs: 'C0613', nombreComun: 'Reale', nombreCima: null },
  // Solo casa por el nombre de CIMA: la fuente única no puede perder `nombreCima` por el camino.
  { codigoDgs: 'C0072', nombreComun: 'Generali España', nombreCima: 'GENERALI' },
]
const MOTO: DatosVehiculoRiesgo = {
  matricula: '1234KLM', marca: 'Honda', modelo: 'PCX', version: '125', codigoVehiculo: 'M777', marcaId: 'HM', modeloId: 'PCX', motorId: 'Gasoline',
  fechaMatriculacion: '2021-04-01', fechaCompra: null, kmAnuales: null, garaje: null, cpCirculacion: null, municipioCirculacion: null,
  municipioCirculacionId: null, remolqueLigero: null, tipoVehiculo: null, cilindradaCc: 125, confirmadoAt: null,
}
const SA: SeguroAnterior = { codigoDgs: null, fechaEfecto: '2019-05-01', aniosSinSiniestros: 6, siniestrosUltimos5: null, numeroPoliza: '999888777' }
const ANTERIOR: AnteriorParaTarificar = { oportunidadId: 'op1', etiqueta: '1234KLM · Honda PCX', aseguradora: 'Generali', numeroPoliza: '999888777', seguroAnterior: SA, prima: 180 }
const ARRIBA_VACIO: Partial<HistorialDeclaradoRiesgo> = { aniosAsegurado: null, aniosEnCompania: null, tieneSeguroActual: null, companiaActual: null, numeroPoliza: null, aniosSinSiniestros: null, siniestrosUltimos5: null }

const CASOS: Caso[] = [
  {
    nombre: 'A · con garaje que casa, km, compra e historial completo declarado arriba',
    embebido: true,
    datosRiesgo: { ...MOTO, garaje: 'PrivateGarage', kmAnuales: 4000, fechaCompra: '2022-02-01' },
    historialRiesgo: { aniosAsegurado: 8, aniosEnCompania: 3, tieneSeguroActual: true, companiaActual: 'C0058', numeroPoliza: '4840402030 01', aniosSinSiniestros: 5, siniestrosUltimos5: 0 },
    anterior: null, garajes: GARAJES_MOTO, companias: COMPANIAS_MOTO,
  },
  {
    nombre: 'B · sin garaje, sin km, sin fecha de compra y sin historial (de calle)',
    embebido: true, datosRiesgo: { ...MOTO }, historialRiesgo: ARRIBA_VACIO, anterior: null, garajes: GARAJES_MOTO, companias: COMPANIAS_MOTO,
  },
  {
    nombre: 'C · garaje del riesgo NO reconocido por el catálogo de moto («PublicRoad» con dos calles)',
    embebido: true, datosRiesgo: { ...MOTO, garaje: 'PublicRoad' }, historialRiesgo: ARRIBA_VACIO, anterior: null, garajes: GARAJES_DOS_CALLES, companias: COMPANIAS_MOTO,
  },
  {
    nombre: 'D · póliza leída (compañía por nombre de CIMA), sin años en compañía y asegurado declarado 3 (topes)',
    embebido: true,
    datosRiesgo: { ...MOTO, kmAnuales: 3000 }, historialRiesgo: { ...ARRIBA_VACIO, aniosAsegurado: 3 }, anterior: ANTERIOR, garajes: GARAJES_MOTO, companias: COMPANIAS_MOTO,
    matriculaAnterior: '9999XYZ',
  },
  {
    nombre: 'E · sin años en la compañía ni sin siniestros arriba; leído con 2 años limpios y siniestros sin dato',
    embebido: true,
    datosRiesgo: { ...MOTO, garaje: 'Street' },
    historialRiesgo: { ...ARRIBA_VACIO, tieneSeguroActual: true, companiaActual: 'La Mía Seguros', numeroPoliza: '12345678', aniosAsegurado: 6 },
    anterior: { ...ANTERIOR, seguroAnterior: { ...SA, aniosSinSiniestros: 2 } }, garajes: GARAJES_MOTO, companias: COMPANIAS_MOTO,
  },
  {
    nombre: 'F · pantalla completa: arriba NO cuenta, la compra del riesgo NO viaja; sin lista de compañías',
    embebido: false,
    datosRiesgo: { ...MOTO, kmAnuales: 5000, fechaCompra: '2022-06-01', garaje: 'CommunalParking' },
    historialRiesgo: { ...ARRIBA_VACIO, aniosAsegurado: 2, tieneSeguroActual: false },
    anterior: { ...ANTERIOR, seguroAnterior: { ...SA, codigoDgs: 'C0072', aniosSinSiniestros: 14 } }, garajes: GARAJES_MOTO, companias: null,
  },
  {
    nombre: 'G · pantalla completa sin riesgo, catálogo de garajes ilegible',
    embebido: false, datosRiesgo: null, historialRiesgo: null, anterior: null, garajes: [], companias: COMPANIAS_MOTO,
  },
  {
    nombre: 'H · sin fecha de compra NI de matriculación; compra anterior a la matriculación en otro riesgo no aplica',
    embebido: true, datosRiesgo: { ...MOTO, fechaMatriculacion: null, kmAnuales: 6000 }, historialRiesgo: null, anterior: null, garajes: GARAJES_MOTO, companias: COMPANIAS_MOTO,
  },
  {
    nombre: 'I · compra anterior a la matriculación (incoherente): no viaja y la verificación lo marca',
    embebido: true, datosRiesgo: { ...MOTO, fechaCompra: '2020-01-01' }, historialRiesgo: ARRIBA_VACIO, anterior: null, garajes: GARAJES_MOTO, companias: COMPANIAS_MOTO,
  },
]

// ── 3. Lo que viaja HOY, fijado (valores conocidos el 15/10/2026) ─────────────────────────────────────────────────────
const NADA = {}
const BOTS_DE_CALLE = { tieneSeguroActual: false, aniosAsegurado: '10', aniosSinSiniestros: '10', siniestrosUltimos5: '0' }
const ESPERADO: Record<string, { resueltos: unknown; correcciones: unknown; bots: unknown }> = {
  A: {
    resueltos: { garaje: 'PrivateGarage', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: 4000, garaje: 'PrivateGarage' } },
    correcciones: { kmAnuales: 4000, fechaCompra: '2022-02-01', aseguradoAntes: true, companiaAnteriorCodigo: 'C0058', polizaAnterior: '02030', aniosAsegurado: 8, aniosEnCompania: 3, aniosSinSiniestros: 5, siniestrosUltimos5: 0 },
    bots: { tieneSeguroActual: true, aniosAsegurado: '8', aniosSinSiniestros: '5', siniestrosUltimos5: '0' },
  },
  B: { resueltos: { garaje: 'CommunalParking', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: null, garaje: null } }, correcciones: NADA, bots: BOTS_DE_CALLE },
  C: { resueltos: { garaje: '', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: null, garaje: null } }, correcciones: NADA, bots: BOTS_DE_CALLE },
  D: {
    resueltos: { garaje: 'CommunalParking', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: 3000, garaje: null } },
    // 15/10/2026 (Alberto, como coche): 3 años sin siniestros y los siniestros en 5 años SIN DATO → ya no viaja un «0»
    // supuesto (antes `siniestrosUltimos5: 0`).
    correcciones: { kmAnuales: 3000, aseguradoAntes: true, companiaAnteriorCodigo: 'C0072', polizaAnterior: '88777', matriculaAnterior: '9999XYZ', aniosAsegurado: 3, aniosEnCompania: 3, aniosSinSiniestros: 3, bonusOrigen: 'documento', aniosAseguradoOrigen: 'documento' },
    bots: { tieneSeguroActual: true, aniosAsegurado: '3', aniosSinSiniestros: '3', siniestrosUltimos5: '' },
  },
  E: {
    resueltos: { garaje: 'Street', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: null, garaje: 'Street' } },
    correcciones: { aseguradoAntes: true, companiaAnteriorCodigo: '', polizaAnterior: '45678', aniosAsegurado: 6, aniosEnCompania: 6, aniosSinSiniestros: 2, bonusOrigen: 'documento', aniosAseguradoOrigen: 'documento' },
    bots: { tieneSeguroActual: true, aniosAsegurado: '6', aniosSinSiniestros: '2', siniestrosUltimos5: '' },
  },
  F: {
    resueltos: { garaje: 'CommunalParking', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: 5000, garaje: 'CommunalParking' } },
    correcciones: { kmAnuales: 5000, aseguradoAntes: true, companiaAnteriorCodigo: 'C0072', polizaAnterior: '999888777', aniosAsegurado: 14, aniosEnCompania: 10, aniosSinSiniestros: 14, siniestrosUltimos5: 0, bonusOrigen: 'documento', aniosAseguradoOrigen: 'documento' },
    bots: { tieneSeguroActual: true, aniosAsegurado: '14', aniosSinSiniestros: '14', siniestrosUltimos5: '0' },
  },
  G: { resueltos: { garaje: '', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: null, garaje: null } }, correcciones: NADA, bots: BOTS_DE_CALLE },
  H: { resueltos: { garaje: 'CommunalParking', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: 6000, garaje: null } }, correcciones: { kmAnuales: 6000 }, bots: { tieneSeguroActual: false, aniosAsegurado: '10', aniosSinSiniestros: '10', siniestrosUltimos5: '0' } },
  I: { resueltos: { garaje: 'CommunalParking', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: null, garaje: null } }, correcciones: NADA, bots: BOTS_DE_CALLE },
}

for (const c of CASOS) {
  test(`moto · equivalencia · ${c.nombre}: estado inicial y lo que viaja IDÉNTICOS a los de antes`, () => {
    const viejo = inicialAntiguo(c)
    // ÚNICO cambio intencionado (15/10/2026, Alberto, igual que coche): con menos de 5 años sin siniestros y los siniestros
    // en 5 años sin dato, ya NO se supone «0»: el campo nace vacío y no viaja nada (caso D; aquí 3 = 3 años asegurado,
    // la excepción: no se exige y no hay ✗).
    if (c.nombre.startsWith('D ·')) viejo.formulario = { ...viejo.formulario, siniestrosUltimos5: '' }
    const nuevo = inicialNuevo(c)
    const nuevoSinViajan = { formulario: nuevo.formulario, garajeDelRiesgo: nuevo.garajeDelRiesgo, garajeSinCasar: nuevo.garajeSinCasar, companiaNoReconocida: nuevo.companiaNoReconocida, tieneSeguroSinDato: nuevo.tieneSeguroSinDato }
    assert.deepEqual(nuevoSinViajan, viejo, 'estado inicial del cotizador de moto')
    assert.deepEqual(peticion(c, nuevoSinViajan), peticion(c, viejo), 'petición a Avant2 + formulario del bot de moto')
  })
  test(`moto · valores fijos · ${c.nombre}: lo que viaja hoy`, () => {
    const p = peticion(c, inicialNuevo(c))
    const e = ESPERADO[c.nombre[0]]
    assert.deepEqual({ resueltos: p.resueltos, correcciones: p.correcciones, bots: p.bots }, e)
  })
}

test('moto · la verificación ve lo mismo: garaje sin casar, compañía no reconocida, seguro sin dato y compra incoherente', () => {
  const v = (n: string) => peticion(CASOS.find((c) => c.nombre[0] === n)!, inicialNuevo(CASOS.find((c) => c.nombre[0] === n)!)).verificacion
  assert.deepEqual(v('C'), { faltaGaraje: true, garajeSinCasar: 'En la vía pública', companiaNoReconocida: null, tieneSeguroSinDato: true, compraInvalida: false })
  assert.equal(v('E').companiaNoReconocida, 'La Mía Seguros')
  assert.equal(v('I').compraInvalida, true)
  assert.equal(v('G').garajeSinCasar, null, 'catálogo ilegible: no se afirma que el garaje «no está en la lista»')
})

test('moto · las notas dicen con qué se cotiza (km = la media de asegura, no los 10.000 de coche)', () => {
  const b = inicialNuevo(CASOS[1]).viajan
  assert.equal(b.ramo, 'moto')
  assert.deepEqual([b.km.valor, b.km.origen, b.km.nota], [15000, 'supuesto', 'Sin dato · se cotizará con 15.000 km, la media (supuesto)'])
  assert.equal(inicialNuevo(CASOS[1]).formulario.kmAnuales, '', 'el campo nace vacío: no se convierte la media en dato')
  assert.equal(b.garaje.nota, 'Sin dato · se cotizará con Garaje comunitario (supuesto)')
  assert.equal(b.fechaCompra.nota, 'Sin dato · se cotizará con la de matriculación (01/04/2021) (supuesto)')
  // Pantalla completa: la compra del riesgo NO viaja → la fuente lo dice (no es «riesgo»).
  assert.equal(inicialNuevo(CASOS[5]).viajan.fechaCompra.origen, 'supuesto')
  // Como coche: con < 5 años limpios y sin dato, no se supone 0 (no viaja nada).
  const d = inicialNuevo(CASOS[3]).viajan.siniestrosUltimos5
  assert.deepEqual([d.valor, d.origen], [null, 'sin_dato'])
})

test('moto · supuestos al pedir: km (la media), compra, experiencia; nunca el carné de coche', () => {
  const b = inicialNuevo(CASOS[1])
  const f = b.formulario
  const s = supuestosAlPedir(b.viajan, {
    garaje: f.garaje, garajeElegido: false, kmSupuesto: 15000, fechaCompra: '', tieneSeguroActual: false,
    aniosAsegurado: f.aniosAsegurado, aniosEnCompania: f.aniosEnCompania, aniosSinSiniestros: f.aniosSinSiniestros, siniestrosUltimos5: f.siniestrosUltimos5,
    experienciaConduccion: '',
  })
  assert.deepEqual(s.map((x) => x.campo), ['garaje', 'km', 'fechaCompra', 'tieneSeguro', 'experienciaConduccion'])
  assert.equal(s.find((x) => x.campo === 'km')?.texto, 'Km al año: 15.000 km (la media)')
  // Todo declarado → sin supuestos ([] consta: «se pidió sin supuestos»).
  const a = inicialNuevo(CASOS[0])
  assert.deepEqual(supuestosAlPedir(a.viajan, {
    ...a.formulario, garajeElegido: true, kmSupuesto: null, experienciaConduccion: 'ThisMotorcycle',
  }), [])
})

// ── Cepos de FUENTE: la pantalla de moto arranca de la fuente única y arma la petición con las mismas líneas ──────────

const dir = new URL('.', import.meta.url)
const moto = readFileSync(new URL('../../app/(usuario)/correduria/cliente/[id]/moto-nuevo/CotizadorMoto.tsx', dir), 'utf8')
const oportunidad = (f: string) => readFileSync(new URL(`../../app/(usuario)/correduria/oportunidad/[id]/${f}`, dir), 'utf8')

test('fuente: el ✗ de siniestros en 5 años de moto es la regla ÚNICA (`exigeSiniestrosUltimos5`), como coche', () => {
  assert.match(moto, /const siniestros5SinDato = exigeSiniestrosUltimos5\(\{ aseguradoAntes: tieneSeguroActual, aniosAsegurado: numOVacio\(aniosAsegurado\), aniosSinSiniestros: numOVacio\(aniosSinSiniestros\) \}\)\s*&& siniestrosUltimos5\.trim\(\) === ''/)
  assert.match(moto, /siniestros5Pendiente: false,\s*siniestros5SinDato,/)
})

test('fuente: CotizadorMoto nace de `valoresQueViajan(..., \'moto\')` y no recalcula garaje/seguro/historial por su cuenta', () => {
  assert.match(moto, /const viajan = valoresQueViajan\(\s*\{ datosVehiculo: datosRiesgo, historialDeclarado: embebido \? historialRiesgo : null \},\s*\{ garajes, companias \},\s*\{ anterior \},\s*embebido \? 'embebido' : 'completo',\s*'moto',\s*\)/)
  assert.match(moto, /const ini = formularioInicial\(viajan\)/)
  for (const [estado, campo] of [['kmAnuales', 'kmAnuales'], ['tieneSeguroActual', 'tieneSeguroActual'], ['companiaActualCodigo', 'companiaActualCodigo'], ['companiaActualLibre', 'companiaActualLibre'],
    ['polizaActualDigitos', 'polizaActualDigitos'], ['aniosAsegurado', 'aniosAsegurado'], ['aniosEnCompania', 'aniosEnCompania'], ['aniosSinSiniestros', 'aniosSinSiniestros'], ['siniestrosUltimos5', 'siniestrosUltimos5']]) {
    assert.match(moto, new RegExp(`const \\[${estado}, set\\w+\\] = useState\\(ini\\.${campo}\\)`), estado)
  }
  assert.match(moto, /const \[garaje, setGaraje\] = useState\(\(\) => ini\.garaje\)/)
  assert.match(moto, /const fechaCompra = ini\.fechaCompra/)
  for (const viejo of ['garajeInicial(', 'seguroActualEmbebido(', 'historialConTopes(', 'historialDeclarado(', 'codigoCompania(']) {
    assert.ok(!moto.includes(viejo), `CotizadorMoto no debe recalcular con ${viejo}`)
  }
})

test('fuente: la petición de moto usa los mismos tramos que `peticion()` de este test', () => {
  for (const linea of [
    '...(kmLeidos !== null ? { kmAnuales: kmLeidos } : {}),',
    "...(fechaCompra !== '' && !compraInvalida ? { fechaCompra } : {}),",
    'correccionesFinal.companiaAnteriorCodigo = companiaActualElegida',
    'correccionesFinal.polizaAnterior = polizaActualDigitos.trim()',
    'correccionesFinal.aniosAsegurado = Number(aniosAsegurado)',
    'correccionesFinal.aniosEnCompania = Number(aniosEnCompania)',
    'correccionesFinal.aniosSinSiniestros = Number(aniosSinSiniestros)',
    "if (siniestrosUltimos5.trim() !== '') correccionesFinal.siniestrosUltimos5 = Number(siniestrosUltimos5)",
    'kmAnuales: kmLeidos,',
    'garaje: garajeElegido.current ? garaje : null,',
  ]) assert.ok(moto.includes(linea), linea)
  // El bot de moto recibe los mismos estados.
  assert.match(moto, /tieneSeguroActual: tieneSeguroBots,\s*aniosAsegurado,\s*aniosSinSiniestros,\s*siniestrosUltimos5,\s*companiaAnterior: companiaActualParaBots\(\{[^\n]*codigo: companiaActualCodigo[^\n]*\}\),\s*\}\}/)
  // «Sin seguro» solo si se declaró o se tocó la casilla (19/10/2026): sin dato y sin tocar viaja null, no false.
  assert.match(moto, /const tieneSeguroBots = tieneSeguroParaBots\(\{ tiene: tieneSeguroActual, sinDato: tieneSeguroSinDato\(viajan\), tocado: seguroTocado \}\)/)
  assert.match(moto, /onChange=\{\(e\) => \{ setSeguroTocado\(true\); setTieneSeguroActual\(e\.target\.checked\) \}\}/)
  // Y declara qué fue supuesto (solo moto nueva; asegura lo guarda en `tarificaciones.figuras.supuestos`).
  assert.match(moto, /supuestosPantalla: supuestosAlPedir\(viajan, \{/)
})

test('fuente: embebido sin copias — ni resumen de la moto, garaje/km/compra, ni del historial; las personas no se repiten', () => {
  assert.ok(!moto.includes('<ResumenCampo'), 'en embebido no queda ningún resumen de lo que se edita arriba')
  assert.ok(!moto.includes('<strong>Moto:</strong>'), 'la moto no se repite: está en «Datos del vehículo»')
  assert.match(moto, /title=\{embebido \? '1 · Condiciones de esta cotización' : '1 · La moto'\}/)
  assert.match(moto, /title=\{embebido \? '2b · Condiciones de cada interviniente' : '2b · Propietario y conductor del riesgo'\}/)
  assert.match(moto, /\) : embebido \? \(\s*\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*<div id="cotizador-seguro-actual" style=\{cardStyle\}>\s*<CardHeader\s*title="2c · Seguro en vigor"/)
  // Pantalla completa: sin cambios (los campos editables siguen ahí).
  for (const e of ['etiqueta="¿Dónde duerme?"', 'etiqueta="Kilómetros al año"', 'etiqueta="Compañía actual"', 'etiqueta="Últimos 5 dígitos de la póliza"', 'Sí, tiene un seguro de moto en vigor ahora mismo']) {
    assert.ok(moto.includes(e), e)
  }
})

test('fuente: «Datos del vehículo» e «Historial y bonificaciones» pintan el supuesto también en moto (misma fuente)', () => {
  assert.match(oportunidad('DatosVehiculo.tsx'), /op\.ramo === 'auto' \|\| op\.ramo === 'moto'\s*\? valoresQueViajan\([^\n]*'embebido', op\.ramo\)/)
  assert.match(oportunidad('HistorialRiesgo.tsx'), /\(op\.ramo === 'auto' \|\| op\.ramo === 'moto'\) && riesgo\.historial\s*\? valoresQueViajan\([\s\S]{0,400}'embebido',\s*op\.ramo,\s*\)/)
})

// INVARIANTE (15/10/2026): la fuente única `valoresQueViajan` NO cambia lo que viaja. Pedir precio cuesta 0,50€ y declara
// un riesgo: el cuerpo que va a Avant2 y el formulario de los bots tienen que ser IDÉNTICOS a los de antes para el mismo
// riesgo. Tres capas:
//   1. `inicialAntiguo` = COPIA CONGELADA del cálculo que hacía `AutoNuevo.tsx` antes de este cambio (garaje, km, compra,
//      historial con topes y seguro actual). Se compara campo a campo con `formularioInicial(valoresQueViajan(...))`.
//   2. `peticion` = los tramos de `cotizarSinGuarda` (y de los bots) que dependen de esos campos, copiados de la pantalla;
//      un cepo de fuente comprueba que la pantalla sigue construyendo la petición con esas mismas líneas.
//   3. Valores FIJOS conocidos hoy por riesgo de ejemplo: si alguien cambia un supuesto (el tope de 10, los 10.000 km, el
//      garaje comunitario…), esto se pone en rojo aunque cambie a la vez la copia y el helper.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { kilometrosDesdeTexto, origenesHistorialManual, ultimosDigitosPoliza, type DatosVehiculoRiesgo, type HistorialDeclaradoRiesgo, type SeguroAnterior } from '@central/module-seguros'
import { garajeInicial, garajeParaBot } from '../supuestos-presupuesto.ts'
import { codigoCompania, historialDeclarado, type AnteriorParaTarificar } from '../seguro-anterior.ts'
import { KM_AUTO_POR_DEFECTO, kmParaCotizar } from './km-auto.ts'
import { formularioInicial, notaCotizaraHistorial, tieneSeguroSinDato, valoresQueViajan, type FormularioInicialAuto } from './supuestos-auto.ts'

type Opcion = { id: string; nombre: string }
type Companias = { codigoDgs: string; nombreComun: string }[] | null
type Caso = {
  nombre: string
  embebido: boolean
  datosRiesgo: DatosVehiculoRiesgo | null
  historialRiesgo: Partial<HistorialDeclaradoRiesgo> | null
  anterior: AnteriorParaTarificar | null
  garajes: Opcion[]
  companias: Companias
  /** Lo propio de la cotización (no lo toca el helper): viaja igual antes y después. */
  matriculaAnterior?: string
  ocasional?: Record<string, unknown>
}

// ── 1. Copia CONGELADA del cálculo viejo (AutoNuevo.tsx antes del 15/10/2026, y `seguroActualEmbebido` de entonces) ──

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
  const inicioGaraje = garajeInicial(datosRiesgo?.garaje, garajes)
  const garajeDelRiesgo = inicioGaraje.delRiesgo ? inicioGaraje.id : null
  const garajeSinCasar = inicioGaraje.sinCasar
  const garaje = inicioGaraje.id
  const kmAnuales = datosRiesgo?.kmAnuales != null ? String(datosRiesgo.kmAnuales) : String(KM_AUTO_POR_DEFECTO)
  const kmDelRiesgo = datosRiesgo?.kmAnuales != null
  const fechaCompra = datosRiesgo?.fechaCompra ?? ''
  const sa = anterior?.seguroAnterior ?? null
  const aniosAseguradoArriba = embebido ? historialRiesgo?.aniosAsegurado ?? null : null
  const aniosEnCompaniaArriba = embebido ? historialRiesgo?.aniosEnCompania ?? null : null
  const historialLeido = historialDeclarado(sa)
  const aniosAseguradoEf = aniosAseguradoArriba ?? historialLeido.aniosAsegurado
  const historial = {
    ...historialLeido,
    aniosAsegurado: aniosAseguradoEf,
    aniosEnCompania: aniosEnCompaniaArriba ?? Math.min(historialLeido.aniosEnCompania, aniosAseguradoEf),
    aniosSinSiniestros: Math.min(historialLeido.aniosSinSiniestros, aniosAseguradoEf),
  }
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
    fechaCompra,
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
    kmDelRiesgo,
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
  )
  return {
    formulario: formularioInicial(viajan),
    garajeDelRiesgo: viajan.garaje.origen === 'riesgo' ? viajan.garaje.valor : null,
    garajeSinCasar: viajan.garaje.sinCasar,
    kmDelRiesgo: viajan.km.origen === 'riesgo',
    companiaNoReconocida: viajan.compania.noReconocida,
    // La verificación solo existe en embebido (fuera, la pantalla no la pinta).
    tieneSeguroSinDato: c.embebido ? tieneSeguroSinDato(viajan) : false,
    viajan,
  }
}

// ── 2. Lo que viaja: los tramos de `cotizarSinGuarda` y del formulario de los bots que dependen de esos campos ──────

const HOY = '2026-10-15'
function peticion(c: Caso, ini: ReturnType<typeof inicialAntiguo>) {
  const f = ini.formulario
  const sa = c.anterior?.seguroAnterior ?? null
  const matriculacion = c.datosRiesgo?.fechaMatriculacion ?? ''
  const correccionesFinal: Record<string, unknown> = {}
  const km = kmParaCotizar({ texto: f.kmAnuales, porDefecto: KM_AUTO_POR_DEFECTO, delRiesgo: ini.kmDelRiesgo, tocado: false })
  if (km.correccion !== null) correccionesFinal.kmAnuales = km.correccion
  const compraInvalida = f.fechaCompra !== '' && matriculacion !== '' && f.fechaCompra < matriculacion
  if (f.fechaCompra !== '' && !compraInvalida) correccionesFinal.fechaCompra = f.fechaCompra
  if (c.ocasional) correccionesFinal.conductorOcasional = c.ocasional
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
    resueltos: {
      garaje: f.garaje,
      garajeEsSupuesto: true,
      ...(km.supuesto !== null ? { kmAnualesSupuestos: km.supuesto } : {}),
      vehiculoRiesgo: { kmAnuales: km.paraRiesgo, garaje: garajeElegido ? f.garaje : null },
    },
    correcciones: correccionesFinal,
    bots: {
      garaje: garajeParaBot({ garajeRiesgo: c.datosRiesgo?.garaje, actual: f.garaje, elegido: garajeElegido, resueltoDelRiesgo: ini.garajeDelRiesgo }),
      tieneSeguroActual: f.tieneSeguroActual,
      aniosAsegurado: f.aniosAsegurado,
      aniosSinSiniestros: f.aniosSinSiniestros,
      siniestrosUltimos5: f.siniestrosUltimos5,
      companiaAnterior: (c.companias?.find((x) => x.codigoDgs === f.companiaActualCodigo)?.nombreComun ?? f.companiaActualLibre).trim() || null,
    },
    // Lo que la verificación usa para bloquear o avisar.
    verificacion: { garajeSinCasar: ini.garajeSinCasar, companiaNoReconocida: ini.companiaNoReconocida, tieneSeguroSinDato: ini.tieneSeguroSinDato },
    kmValido: kilometrosDesdeTexto(f.kmAnuales) !== null,
  }
}

// ── Riesgos de ejemplo ────────────────────────────────────────────────────────────────────────────────────────────────

const GARAJES: Opcion[] = [
  { id: 'CommunalParking', nombre: 'Garaje comunitario' },
  { id: 'PrivateGarage', nombre: 'Garaje individual' },
  { id: 'Street', nombre: 'En la calle' },
  { id: 'Other', nombre: 'Otro' },
]
// Con dos «calle» en el catálogo, «PublicRoad» no se resuelve con certeza (el caso real del 15/10/2026).
const GARAJES_DOS_CALLES: Opcion[] = [...GARAJES, { id: 'OpenAir', nombre: 'En la vía pública (aire libre)' }]
const COMPANIAS = [
  { codigoDgs: 'C0058', nombreComun: 'Mapfre' },
  { codigoDgs: 'C0613', nombreComun: 'Reale' },
  { codigoDgs: 'C0072', nombreComun: 'Generali' },
]
const VEHICULO: DatosVehiculoRiesgo = {
  matricula: '1234ABC', marca: 'SEAT', modelo: 'Ibiza', version: '1.0 TSI', codigoVehiculo: 'V123', marcaId: 'M1', modeloId: 'MO1', motorId: 'G',
  fechaMatriculacion: '2020-03-10', fechaCompra: null, kmAnuales: null, garaje: null, cpCirculacion: null, municipioCirculacion: null,
  municipioCirculacionId: null, remolqueLigero: null, tipoVehiculo: null, cilindradaCc: null, confirmadoAt: null,
}
const SA: SeguroAnterior = { codigoDgs: 'C0072', fechaEfecto: '2019-05-01', aniosSinSiniestros: 6, siniestrosUltimos5: null, numeroPoliza: '999888777' }
const ANTERIOR: AnteriorParaTarificar = { oportunidadId: 'op1', etiqueta: '1234ABC · SEAT Ibiza', aseguradora: 'Generali', numeroPoliza: '999888777', seguroAnterior: SA, prima: 410 }
const ARRIBA_VACIO: Partial<HistorialDeclaradoRiesgo> = { aniosAsegurado: null, aniosEnCompania: null, tieneSeguroActual: null, companiaActual: null, numeroPoliza: null, aniosSinSiniestros: null, siniestrosUltimos5: null }

const CASOS: Caso[] = [
  {
    nombre: 'A · completo en el riesgo: garaje que casa, km, compra e historial declarado arriba',
    embebido: true,
    datosRiesgo: { ...VEHICULO, garaje: 'PrivateGarage', kmAnuales: 12000, fechaCompra: '2021-01-15' },
    historialRiesgo: { aniosAsegurado: 8, aniosEnCompania: 3, tieneSeguroActual: true, companiaActual: 'C0058', numeroPoliza: '4840402030 01', aniosSinSiniestros: 5, siniestrosUltimos5: 0 },
    anterior: null, garajes: GARAJES, companias: COMPANIAS,
  },
  {
    nombre: 'B · sin garaje, sin km, sin fecha de compra y sin historial (de calle)',
    embebido: true,
    datosRiesgo: { ...VEHICULO }, historialRiesgo: ARRIBA_VACIO, anterior: null, garajes: GARAJES, companias: COMPANIAS,
  },
  {
    nombre: 'C · garaje del riesgo que NO casa con el catálogo («PublicRoad» con dos calles)',
    embebido: true,
    datosRiesgo: { ...VEHICULO, garaje: 'PublicRoad' }, historialRiesgo: ARRIBA_VACIO, anterior: null, garajes: GARAJES_DOS_CALLES, companias: COMPANIAS,
  },
  {
    nombre: 'D · póliza leída, sin años en compañía y con asegurado declarado 3 (topes)',
    embebido: true,
    datosRiesgo: { ...VEHICULO, kmAnuales: 10000 }, historialRiesgo: { ...ARRIBA_VACIO, aniosAsegurado: 3 }, anterior: ANTERIOR, garajes: GARAJES, companias: COMPANIAS,
    matriculaAnterior: '9999XYZ',
  },
  {
    nombre: 'E · con conductor ocasional y compañía declarada que no está en la lista',
    embebido: true,
    datosRiesgo: { ...VEHICULO, garaje: 'Street' },
    historialRiesgo: { ...ARRIBA_VACIO, tieneSeguroActual: true, companiaActual: 'La Mía Seguros', numeroPoliza: '12345678' },
    anterior: ANTERIOR, garajes: GARAJES, companias: COMPANIAS,
    ocasional: { dni: '12345678Z', nombre: 'Lucía', apellido1: 'Pérez', fechaNacimiento: '2004-02-01', sexo: 'mujer', estadoCivil: 'Single', telefono: '600000000', fechaCarnet: '2023-06-01' },
  },
  {
    nombre: 'F · pantalla completa (no embebido): lo de arriba NO cuenta; póliza leída entera; sin lista de compañías',
    embebido: false,
    datosRiesgo: { ...VEHICULO, kmAnuales: 8000 }, historialRiesgo: { ...ARRIBA_VACIO, aniosAsegurado: 2, tieneSeguroActual: false },
    anterior: ANTERIOR, garajes: GARAJES, companias: null,
  },
  {
    nombre: 'G · catálogo de garajes ilegible y riesgo sin vehículo',
    embebido: true, datosRiesgo: null, historialRiesgo: null, anterior: null, garajes: [], companias: COMPANIAS,
  },
]

// ── 3. Lo que viaja HOY, fijado (valores conocidos el 15/10/2026) ─────────────────────────────────────────────────────
const SIN_HISTORIAL = {}
const ESPERADO: Record<string, { resueltos: unknown; correcciones: unknown; bots: unknown }> = {
  A: {
    resueltos: { garaje: 'PrivateGarage', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: 12000, garaje: 'PrivateGarage' } },
    correcciones: { kmAnuales: 12000, fechaCompra: '2021-01-15', aseguradoAntes: true, companiaAnteriorCodigo: 'C0058', polizaAnterior: '02030', aniosAsegurado: 8, aniosEnCompania: 3, aniosSinSiniestros: 5, siniestrosUltimos5: 0 },
    bots: { garaje: 'PrivateGarage', tieneSeguroActual: true, aniosAsegurado: '8', aniosSinSiniestros: '5', siniestrosUltimos5: '0', companiaAnterior: 'Mapfre' },
  },
  B: {
    resueltos: { garaje: 'CommunalParking', garajeEsSupuesto: true, kmAnualesSupuestos: 10000, vehiculoRiesgo: { kmAnuales: null, garaje: null } },
    correcciones: SIN_HISTORIAL,
    bots: { garaje: null, tieneSeguroActual: false, aniosAsegurado: '10', aniosSinSiniestros: '10', siniestrosUltimos5: '0', companiaAnterior: null },
  },
  C: {
    resueltos: { garaje: '', garajeEsSupuesto: true, kmAnualesSupuestos: 10000, vehiculoRiesgo: { kmAnuales: null, garaje: null } },
    correcciones: SIN_HISTORIAL,
    bots: { garaje: 'PublicRoad', tieneSeguroActual: false, aniosAsegurado: '10', aniosSinSiniestros: '10', siniestrosUltimos5: '0', companiaAnterior: null },
  },
  D: {
    resueltos: { garaje: 'CommunalParking', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: 10000, garaje: null } },
    correcciones: { kmAnuales: 10000, aseguradoAntes: true, companiaAnteriorCodigo: 'C0072', polizaAnterior: '88777', matriculaAnterior: '9999XYZ', aniosAsegurado: 3, aniosEnCompania: 3, aniosSinSiniestros: 3, siniestrosUltimos5: 0, bonusOrigen: 'documento', aniosAseguradoOrigen: 'documento' },
    // Ojo (comportamiento de HOY, no se cambia aquí): 3 años sin siniestros declarados y «0 siniestros en 5 años» supuestos.
    bots: { garaje: null, tieneSeguroActual: true, aniosAsegurado: '3', aniosSinSiniestros: '3', siniestrosUltimos5: '0', companiaAnterior: 'Generali' },
  },
  E: {
    resueltos: { garaje: 'Street', garajeEsSupuesto: true, kmAnualesSupuestos: 10000, vehiculoRiesgo: { kmAnuales: null, garaje: 'Street' } },
    correcciones: {
      conductorOcasional: CASOS[4].ocasional, aseguradoAntes: true, companiaAnteriorCodigo: '', polizaAnterior: '45678',
      aniosAsegurado: 10, aniosEnCompania: 10, aniosSinSiniestros: 6, siniestrosUltimos5: 0, bonusOrigen: 'documento',
    },
    bots: { garaje: 'Street', tieneSeguroActual: true, aniosAsegurado: '10', aniosSinSiniestros: '6', siniestrosUltimos5: '0', companiaAnterior: null },
  },
  F: {
    resueltos: { garaje: 'CommunalParking', garajeEsSupuesto: true, vehiculoRiesgo: { kmAnuales: 8000, garaje: null } },
    correcciones: { kmAnuales: 8000, aseguradoAntes: true, companiaAnteriorCodigo: 'C0072', polizaAnterior: '999888777', aniosAsegurado: 10, aniosEnCompania: 10, aniosSinSiniestros: 6, siniestrosUltimos5: 0, bonusOrigen: 'documento' },
    bots: { garaje: null, tieneSeguroActual: true, aniosAsegurado: '10', aniosSinSiniestros: '6', siniestrosUltimos5: '0', companiaAnterior: 'C0072' },
  },
  G: {
    resueltos: { garaje: '', garajeEsSupuesto: true, kmAnualesSupuestos: 10000, vehiculoRiesgo: { kmAnuales: null, garaje: null } },
    correcciones: SIN_HISTORIAL,
    bots: { garaje: null, tieneSeguroActual: false, aniosAsegurado: '10', aniosSinSiniestros: '10', siniestrosUltimos5: '0', companiaAnterior: null },
  },
}

for (const c of CASOS) {
  test(`equivalencia · ${c.nombre}: el estado inicial y lo que viaja son IDÉNTICOS a los de antes`, () => {
    const viejo = inicialAntiguo(c)
    const nuevo = inicialNuevo(c)
    const nuevoSinViajan = { formulario: nuevo.formulario, garajeDelRiesgo: nuevo.garajeDelRiesgo, garajeSinCasar: nuevo.garajeSinCasar, kmDelRiesgo: nuevo.kmDelRiesgo, companiaNoReconocida: nuevo.companiaNoReconocida, tieneSeguroSinDato: nuevo.tieneSeguroSinDato }
    assert.deepEqual(nuevoSinViajan, viejo, 'estado inicial del cotizador')
    assert.deepEqual(peticion(c, nuevoSinViajan), peticion(c, viejo), 'petición a Avant2 + formulario de los bots')
  })
  test(`valores fijos · ${c.nombre}: lo que viaja hoy`, () => {
    const p = peticion(c, inicialNuevo(c))
    const e = ESPERADO[c.nombre[0]!]!
    assert.deepEqual(p.resueltos, e.resueltos, 'resueltos')
    assert.deepEqual(p.correcciones, e.correcciones, 'correcciones')
    assert.deepEqual(p.bots, e.bots, 'bots')
  })
}

// ── Orígenes y notas: lo que pintan «Datos del vehículo», «Historial y bonificaciones» y la verificación ─────────────

const v = (i: number) => inicialNuevo(CASOS[i]!).viajan

test('orígenes: dato del riesgo sin nota; supuesto con «Sin dato · se cotizará con X (supuesto)»', () => {
  const a = v(0)
  assert.deepEqual([a.garaje.origen, a.km.origen, a.fechaCompra.origen, a.aniosAsegurado.origen, a.aniosEnCompania.origen], ['riesgo', 'riesgo', 'riesgo', 'riesgo', 'riesgo'])
  assert.equal(a.garaje.nota, null)
  const b = v(1)
  assert.equal(b.garaje.origen, 'supuesto')
  assert.equal(b.garaje.nota, 'Sin dato · se cotizará con Garaje comunitario (supuesto)')
  assert.equal(b.km.nota, 'Sin dato · se cotizará con 10.000 km (supuesto)')
  assert.equal(b.fechaCompra.nota, 'Sin dato · se cotizará con la de matriculación (10/03/2020) (supuesto)')
  assert.equal(b.aniosAsegurado.nota, 'Sin dato · se cotizará con 10 años, el máximo; lo contrasta SINCO (supuesto)')
  assert.equal(b.tieneSeguro.origen, 'supuesto')
  assert.equal(b.tieneSeguro.valor, false)
})

test('«no se sabe» nunca es un valor: sin dato = null; garaje que no casa = riesgo_no_reconocido, vacío y se pregunta', () => {
  const c = v(2)
  assert.equal(c.garaje.origen, 'riesgo_no_reconocido')
  assert.equal(c.garaje.valor, null)
  assert.equal(c.garaje.nota, 'El riesgo dice «En la vía pública» pero no está en la lista de la compañía: elígelo')
  const g = v(6)
  assert.equal(g.garaje.origen, 'sin_dato')
  assert.equal(g.garaje.valor, null)
  assert.equal(g.fechaCompra.origen, 'sin_dato')
  assert.equal(g.fechaCompra.valor, null)
  assert.equal(g.compania.valor, null)
  assert.equal(g.poliza.valor, null)
})

test('años en compañía sin dato = min(10, años asegurado), SUPUESTO; lo declarado arriba manda', () => {
  const d = v(3)
  assert.equal(d.aniosAsegurado.origen, 'riesgo')
  assert.deepEqual([d.aniosEnCompania.valor, d.aniosEnCompania.origen], [3, 'supuesto'])
  assert.equal(d.aniosEnCompania.nota, 'Sin dato · se cotizará con 3 años, los años asegurado como mucho 10 (supuesto)')
  assert.deepEqual([d.aniosSinSiniestros.valor, d.aniosSinSiniestros.origen], [3, 'leido'])
  assert.match(d.aniosSinSiniestros.nota ?? '', /topado a los años asegurado/)
  assert.equal(v(0).aniosEnCompania.valor, 3, 'declarado arriba: 3')
})

test('compañía declarada que no está en la lista: se dice, no se inventa un código', () => {
  const e = v(4)
  assert.equal(e.compania.origen, 'riesgo_no_reconocido')
  assert.equal(e.compania.noReconocida, 'La Mía Seguros')
  assert.equal(e.compania.codigo, '')
})

test('historial: la nota de una fila sin dato dice con qué se cotiza, y que sin seguro en vigor no viaja', () => {
  assert.equal(notaCotizaraHistorial(v(1), 'aniosAsegurado'), 'Sin dato · solo viaja con seguro en vigor, y no consta que lo tenga (se cotiza «de calle»)')
  const conSeguro = inicialNuevo({ ...CASOS[1]!, historialRiesgo: { ...ARRIBA_VACIO, tieneSeguroActual: true } }).viajan
  assert.equal(notaCotizaraHistorial(conSeguro, 'aniosEnCompania'), 'Sin dato · se cotizará con 10 años, los años asegurado como mucho 10 (supuesto)')
  assert.equal(notaCotizaraHistorial(conSeguro, 'siniestrosUltimos5'), 'Sin dato · se cotizará con ninguno (supuesto)')
  const declaradoNo = inicialNuevo({ ...CASOS[1]!, historialRiesgo: { ...ARRIBA_VACIO, tieneSeguroActual: false } }).viajan
  assert.equal(notaCotizaraHistorial(declaradoNo, 'aniosAsegurado'), 'Sin dato · no viaja: declarado sin seguro en vigor')
  assert.equal(notaCotizaraHistorial(v(0), 'aniosAsegurado'), null, 'declarado: sin nota')
  assert.equal(notaCotizaraHistorial(v(3), 'aniosSinSiniestros'), 'Sin dato aquí · se cotizará con 3 años (lo leído de su póliza actual, topado a los años asegurado)')
})

// ── Cepo de fuente: la pantalla nace del helper y construye la petición con las líneas que copia `peticion` ──────────
test('fuente: AutoNuevo nace de `valoresQueViajan` + `formularioInicial` y sigue montando la petición igual', () => {
  const an = readFileSync(new URL('../../app/(usuario)/correduria/cliente/[id]/auto-nuevo/AutoNuevo.tsx', import.meta.url), 'utf8')
  assert.match(an, /const viajan = valoresQueViajan\(\s*\{ datosVehiculo: datosRiesgo, historialDeclarado: embebido \? historialRiesgo : null \},\s*\{ garajes, companias \},\s*\{ anterior \},\s*embebido \? 'embebido' : 'completo',\s*\)/)
  assert.match(an, /const ini = formularioInicial\(viajan\)/)
  for (const campo of ['garaje', 'kmAnuales', 'fechaCompra', 'tieneSeguroActual', 'companiaActualCodigo', 'companiaActualLibre', 'polizaActualDigitos', 'aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros', 'siniestrosUltimos5']) {
    assert.match(an, new RegExp(`useState\\((\\(\\) => )?ini\\.${campo}\\)`), `el estado de ${campo} nace del helper`)
  }
  const cotizar = an.slice(an.indexOf('async function cotizarSinGuarda('), an.indexOf('const r = await pedirCotizacionAuto('))
  for (const linea of [
    'const km = kmParaCotizar({ texto: kmAnuales, porDefecto: KM_AUTO_POR_DEFECTO, delRiesgo: kmDelRiesgo, tocado: kmTocado })',
    'if (km.correccion !== null) correccionesFinal.kmAnuales = km.correccion',
    "if (fechaCompra !== '' && !compraInvalida) correccionesFinal.fechaCompra = fechaCompra",
    'correccionesFinal.companiaAnteriorCodigo = companiaActualElegida',
    'correccionesFinal.polizaAnterior = polizaActualDigitos.trim()',
    'correccionesFinal.aniosAsegurado = Number(aniosAsegurado)',
    'correccionesFinal.aniosEnCompania = Number(aniosEnCompania)',
    'correccionesFinal.aniosSinSiniestros = Number(aniosSinSiniestros)',
    "if (siniestrosUltimos5.trim() !== '') correccionesFinal.siniestrosUltimos5 = Number(siniestrosUltimos5)",
  ]) assert.ok(cotizar.includes(linea), `cotizarSinGuarda ya no dice: ${linea}`)
  assert.match(an, /garaje: garajeParaBot\(\{ garajeRiesgo: datosRiesgo\?\.garaje, actual: garaje, elegido: garajeElegido\.current, resueltoDelRiesgo: garajeDelRiesgo \}\)/)
  assert.match(an, /const garajeElegido = useRef\(garajeDelRiesgo !== null\)/)
  assert.match(an, /const kmDelRiesgo = viajan\.km\.origen === 'riesgo'/)
})

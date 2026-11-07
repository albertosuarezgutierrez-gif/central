import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cuadroCompanias, esAsistencia, semaforoSiniestralidad, variacionPct,
  type PolizaCuadro, type SiniestroCuadro, type ProduccionCuadro,
} from './cuadro-compania.ts'

// Datos FICTICIOS. `hoy` e `anio` se INYECTAN: nada depende del reloj.
const HOY = '2031-06-15'
const A = 2031
const pol = (p: Partial<PolizaCuadro> = {}): PolizaCuadro => ({
  companiaCodigoDgs: 'C1', ramo: 'hogar', estado: 'activa', enVigorHoy: true,
  fechaEfectoInicial: '2029-03-01', fechaSituacion: null, prima: 100, ...p,
})
const sin = (p: Partial<SiniestroCuadro> = {}): SiniestroCuadro => ({
  companiaCodigoDgs: 'C1', fecha: `${A}-02-10`, tipo: '1312', indemnizacion: null, reserva: null, pagos: null, ...p,
})
const suma = (importe: number, recibos: number, ilegibles = 0) => ({ importe, recibos, ilegibles })
const prod = (p: Partial<ProduccionCuadro> = {}): ProduccionCuadro => ({
  companiaCodigoDgs: 'C1', npCobrada: suma(100, 1), carteraCobrada: suma(900, 5), comisionAplicada: suma(150, 6), ...p,
})
const una = (e: Parameters<typeof cuadroCompanias>[0]) => cuadroCompanias(e).companias[0]!

test('cartera año en curso = en vigor hoy, por ramo; prima ausente no suma 0', () => {
  const c = una({ anio: A, hoy: HOY, siniestros: [], produccion: [], polizas: [
    pol(), pol({ prima: null }), pol({ ramo: 'auto', prima: 50 }), pol({ enVigorHoy: false, estado: 'cancelada', fechaSituacion: `${A}-01-05` }),
  ] })
  assert.equal(c.cartera.reconstruida, false)
  assert.equal(c.cartera.polizas, 3)
  assert.equal(c.cartera.prima, 150)
  assert.equal(c.cartera.sinPrima, 1)
  assert.deepEqual(c.cartera.porRamo.find((r) => r.ramo === 'hogar'), { ramo: 'hogar', polizas: 2, prima: 100, sinPrima: 1 })
})

test('cartera sin ninguna prima conocida: prima null, no 0', () => {
  const c = una({ anio: A, hoy: HOY, siniestros: [], produccion: [], polizas: [pol({ prima: null })] })
  assert.equal(c.cartera.prima, null)
})

test('año cerrado: se reconstruye (efecto <= 31/12 y vigente o cancelada después del corte)', () => {
  const c = una({ anio: A - 1, hoy: HOY, siniestros: [], produccion: [], polizas: [
    pol(),                                                                                   // vigente desde 2029: dentro
    pol({ fechaEfectoInicial: `${A}-02-01` }),                                               // nacida después: fuera
    pol({ enVigorHoy: false, estado: 'cancelada', fechaSituacion: `${A}-03-01` }),           // baja posterior al corte: dentro
    pol({ enVigorHoy: false, estado: 'cancelada', fechaSituacion: `${A - 1}-05-01` }),       // baja antes del corte: fuera
    pol({ fechaEfectoInicial: null }),                                                       // sin efecto: no se puede colocar
  ] })
  assert.equal(c.cartera.reconstruida, true)
  assert.equal(c.cartera.fecha, `${A - 1}-12-31`)
  assert.equal(c.cartera.polizas, 2)
})

test('producción: nuevas del año, bajas del año, retención sobre la base de enero', () => {
  const polizas = [
    ...Array.from({ length: 8 }, () => pol()),                                                    // 8 vivas desde antes
    pol({ enVigorHoy: false, estado: 'cancelada', fechaSituacion: `${A}-04-01` }),               // base + baja
    pol({ enVigorHoy: false, estado: 'cancelada', fechaSituacion: `${A - 1}-04-01` }),           // ya baja antes: ni base
    pol({ fechaEfectoInicial: `${A}-05-01`, prima: 200 }),                                        // nueva
    pol({ fechaEfectoInicial: `${A}-06-01`, enVigorHoy: false, estado: 'cancelada', fechaSituacion: `${A}-06-10` }), // nueva y baja el mismo año
    pol({ enVigorHoy: false, estado: 'cancelada', fechaSituacion: null }),                       // baja sin fecha
  ]
  const p = una({ anio: A, hoy: HOY, siniestros: [], produccion: [], polizas }).produccion
  assert.equal(p.nuevas.polizas, 2)
  assert.equal(p.nuevas.prima, 300)
  assert.equal(p.bajas.polizas, 2)
  assert.equal(p.bajasSinFecha, 1)
  assert.equal(p.baseInicio, 9)
  assert.equal(p.bajasDeBase, 1)
  assert.equal(p.retencionPct, 88.89)
})

test('retención sin base = null, no 100 %', () => {
  const p = una({ anio: A, hoy: HOY, siniestros: [], produccion: [], polizas: [pol({ fechaEfectoInicial: `${A}-02-02` })] }).produccion
  assert.equal(p.baseInicio, 0)
  assert.equal(p.retencionPct, null)
})

test('siniestros: asistencias aparte; incurrido = indemnización + reserva sin duplicar pagos', () => {
  const s = una({ anio: A, hoy: HOY, polizas: [pol()], produccion: [prod({ npCobrada: suma(200, 1), carteraCobrada: suma(0, 0) })], siniestros: [
    sin({ indemnizacion: 100, reserva: 20, pagos: 100 }),     // 120 (pagos no se suman)
    sin({ indemnizacion: null, reserva: 10, pagos: 40 }),     // pagos sustituyen a indemnización: 50
    sin({}),                                                  // sin importes
    sin({ tipo: '1101', indemnizacion: 999 }),                // asistencia: fuera del ratio
    sin({ tipo: null, reserva: 0 }),                          // sin tipología con importe 0 (dato)
    sin({ fecha: `${A - 1}-12-31`, indemnizacion: 5000 }),    // otro año
  ] }).siniestros
  assert.equal(s.total, 5)
  assert.equal(s.asistencias, 1)
  assert.equal(s.n, 4)
  assert.equal(s.conImporte, 3)
  assert.equal(s.sinTipo, 1)
  assert.equal(s.incurrido, 170)
  assert.equal(s.ratioPct, 85)
  assert.equal(s.estado, 'parcial')
  assert.equal(s.muestraPequena, true)
})

test('siniestros: sin importes de la compañía NO es 0 %', () => {
  const s = una({ anio: A, hoy: HOY, polizas: [pol()], produccion: [prod()], siniestros: [sin(), sin()] }).siniestros
  assert.equal(s.estado, 'sin_importes')
  assert.equal(s.ratioPct, null)
  assert.equal(s.incurrido, null)
})

test('siniestros: ninguno en el año = sin_siniestros (0 es un dato) y sin prima cobrada = sin ratio', () => {
  assert.equal(una({ anio: A, hoy: HOY, polizas: [pol()], produccion: [], siniestros: [] }).siniestros.estado, 'sin_siniestros')
  const s = una({ anio: A, hoy: HOY, polizas: [pol()], produccion: [], siniestros: [sin({ indemnizacion: 10 })] }).siniestros
  assert.equal(s.estado, 'sin_prima')
  assert.equal(s.ratioPct, null)
})

test('siniestros: cobertura completa y muestra suficiente', () => {
  const ss = Array.from({ length: 10 }, () => sin({ indemnizacion: 10 }))
  const s = una({ anio: A, hoy: HOY, polizas: [pol()], produccion: [prod({ npCobrada: suma(1000, 1), carteraCobrada: suma(0, 0) })], siniestros: ss }).siniestros
  assert.equal(s.estado, 'completo')
  assert.equal(s.muestraPequena, false)
  assert.equal(s.ratioPct, 10)
})

test('comisión: % real, media por póliza; ilegibles anulan el %; sin recibos = null', () => {
  const c = una({ anio: A, hoy: HOY, siniestros: [], polizas: [pol(), pol()], produccion: [prod()] }).comision
  assert.equal(c.devengada, 150)
  assert.equal(c.primaNetaCobrada, 1000)
  assert.equal(c.pctReal, 15)
  assert.equal(c.mediaPorPoliza, 75)
  const ileg = una({ anio: A, hoy: HOY, siniestros: [], polizas: [pol()], produccion: [prod({ comisionAplicada: suma(150, 6, 1) })] }).comision
  assert.equal(ileg.pctReal, null)
  assert.equal(ileg.devengada, 150)
  const vacia = una({ anio: A, hoy: HOY, siniestros: [], polizas: [pol()], produccion: [] }).comision
  assert.equal(vacia.devengada, null)
  assert.equal(vacia.pctReal, null)
})

test('compañías sin código no se reparten y se cuentan', () => {
  const r = cuadroCompanias({ anio: A, hoy: HOY, polizas: [pol(), pol({ companiaCodigoDgs: null })], siniestros: [sin({ companiaCodigoDgs: ' ' })], produccion: [] })
  assert.equal(r.companias.length, 1)
  assert.equal(r.polizasSinCompania, 1)
  assert.equal(r.siniestrosSinCompania, 1)
})

test('asistencia = grupo 11 exacto (no 110, no 21)', () => {
  assert.equal(esAsistencia('11'), true)
  assert.equal(esAsistencia('1107'), true)
  assert.equal(esAsistencia('1312'), false)
  assert.equal(esAsistencia('2102'), false)
  assert.equal(esAsistencia('110'), false)
  assert.equal(esAsistencia(null), false)
})

test('semáforo contra siniestralidad_max_pct: sin dato nunca es «cumple»', () => {
  assert.equal(semaforoSiniestralidad(null, 60), 'sin_dato')
  assert.equal(semaforoSiniestralidad(40, null), 'sin_dato')
  assert.equal(semaforoSiniestralidad(40, 60), 'cumple')
  assert.equal(semaforoSiniestralidad(57, 60), 'justo')
  assert.equal(semaforoSiniestralidad(60, 60), 'justo')
  assert.equal(semaforoSiniestralidad(61, 60), 'supera')
})

test('variación: sin base = null', () => {
  assert.equal(variacionPct(110, 100), 10)
  assert.equal(variacionPct(50, 100), -50)
  assert.equal(variacionPct(10, 0), null)
  assert.equal(variacionPct(null, 100), null)
})

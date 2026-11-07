import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCompetitividad, cuadroCompanias, type CuadroCompaniaAnio, type ObservacionPrecio } from '@central/module-seguros'
import { interpretarCompetitividad, lineasSinPrecio, textoCompetitividad, type CompetitividadLeida } from './competitividad-companias.ts'
import { textoReunion, type EntradaReunion } from './preparar-reunion.ts'

// Datos FICTICIOS; el año y «hoy» se inyectan.
const HOY = '2031-06-15'
const A = 2031
const cuadro = (codigo: string, polizas: number): CuadroCompaniaAnio => cuadroCompanias({
  anio: A, hoy: HOY, siniestros: [], produccion: [],
  polizas: Array.from({ length: polizas }, () => ({
    companiaCodigoDgs: codigo, ramo: 'auto', estado: 'activa', enVigorHoy: true, fechaEfectoInicial: '2029-01-01', fechaSituacion: null, prima: 500,
  })),
}).companias[0]!

const o = (c: string, eur: number, g: string): ObservacionPrecio => ({
  fuente: 'avant2', companiaCodigo: c, companiaNombre: c === 'C1' ? 'Alfa' : 'Beta', ramo: 'auto', nivel: 'Terceros básico',
  primaAnualCents: eur * 100, fecha: `${A}-03-10`, grupoComparacion: g,
})
function leida(extra: Partial<CompetitividadLeida> = {}): CompetitividadLeida {
  const obs: ObservacionPrecio[] = []
  for (let i = 0; i < 6; i++) obs.push(o('C1', 120, `g${i}`), o('C2', 100, `g${i}`))
  const r = calcularCompetitividad(obs, { anio: A })
  return {
    anio: A, hoy: HOY, truncado: false, tarificaciones: { avant2: 6, bot: 0 }, excluidas: { sinPrima: 0, fueraDeRango: 0, incoherentes: 0 },
    descartadas: r.descartadas, pareja: r.pareja, segmento: r.segmento, nombres: r.nombres,
    sinPrecio: [{ companiaCodigo: 'C1', ramo: 'auto', anio: A, tarificaciones: 8, conPrecio: 6, rechazos: 1, errores: 1 }], ...extra,
  }
}
const entrada = (p: Partial<EntradaReunion> = {}): EntradaReunion => ({
  codigo: 'C1', nombre: 'Alfa', anio: A, actual: cuadro('C1', 4), anterior: undefined, libro: undefined,
  competitividad: { estado: 'ok', competitividad: leida() }, topeSiniestralidad: null, ...p,
})

test('interpretar: ok, estados del puerto y respuesta ilegible', () => {
  const l = leida()
  const r = interpretarCompetitividad(200, { estado: 'ok', ...l })
  assert.equal(r.estado, 'ok')
  assert.deepEqual(interpretarCompetitividad(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarCompetitividad(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarCompetitividad(404, null), { estado: 'error', motivo: 'puerto_sin_desplegar' })
  assert.deepEqual(interpretarCompetitividad(200, { estado: 'error', causa: 'esquema' }), { estado: 'error', motivo: 'esquema' })
  assert.deepEqual(interpretarCompetitividad(200, { estado: 'ok', ...l, pareja: [{ ...l.pareja[0], tarificaciones: 'x' }] }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('sin tarificaciones → «sin datos», nunca 0 %', () => {
  const t = textoCompetitividad(leida({ pareja: [], segmento: [], sinPrecio: [] }), 'C1')
  assert.equal(t.tipo, 'sin_datos')
  const texto = textoReunion(entrada({ competitividad: { estado: 'ok', competitividad: leida({ pareja: [], segmento: [], sinPrecio: [] }) } }))
  assert.match(texto, /Sin tarificaciones comparables/)
  assert.doesNotMatch(texto.slice(texto.indexOf('COMPETITIVIDAD')), /%/) // ni 0 % ni ningún porcentaje
})

test('sin precio: cuenta rechazos y errores por separado, con su base', () => {
  assert.deepEqual(lineasSinPrecio(leida(), 'C1'), ['Auto: sin precio en 2 de 8 tarificaciones de Avant2 con detalle (1 por rechazar el riesgo y 1 por error).'])
  assert.deepEqual(lineasSinPrecio(leida(), 'C2'), [])
})

test('texto de la reunión: bloques, competitividad con muestra y rival, sin datos personales', () => {
  const t = textoReunion(entrada())
  for (const b of ['REUNIÓN CON ALFA — AÑO 2031', 'CARTERA', 'PRODUCCIÓN', 'COMISIÓN', 'SINIESTRALIDAD (informativa', 'COMPETITIVIDAD DE PRECIO', 'SIN PRECIO / RECHAZOS']) assert.ok(t.includes(b), b)
  assert.match(t, /Pólizas en vigor: 4/)
  assert.match(t, /Prima: 2\.000,00€/)
  assert.match(t, /En Auto Terceros básico estáis un 20 % por encima de la más barata \(mediana, 6 tarificaciones; la más barata en 0 de 6; canal: Avant2 6\)\. Pierde sobre todo frente a Beta/)
  assert.match(t, /sin precio en 2 de 8/)
  assert.ok(t.split('\n').length <= 45, 'cabe en una pantalla')
})

test('texto de la reunión: lo que no consta lo dice, y el fallo del puerto no es «sin datos»', () => {
  const t = textoReunion(entrada({ actual: undefined, anterior: cuadro('C1', 3), libro: null, competitividad: { estado: 'error', motivo: 'conexion' } }))
  assert.match(t, /Sin pólizas, siniestros ni recibos de esta compañía en 2031\. En 2030 tenía 3 pólizas\./)
  assert.match(t, /No se ha podido calcular \(conexion\)\. No significa que no haya datos\./)
  const u = textoReunion(entrada({ libro: null }))
  assert.match(u, /no se ha podido leer el libro de comisiones/)
  assert.match(u, /Sobre prima neta cobrada: Sin siniestros/)
  assert.match(textoReunion(entrada({ competitividad: null })), /Aún no cargada/)
})

test('texto de la reunión: la muestra pequeña se avisa', () => {
  const pocas: ObservacionPrecio[] = [o('C1', 120, 'g1'), o('C2', 100, 'g1')]
  const r = calcularCompetitividad(pocas, { anio: A })
  const t = textoReunion(entrada({ competitividad: { estado: 'ok', competitividad: leida({ pareja: r.pareja, sinPrecio: [] }) } }))
  assert.match(t, /muestra pequeña, orientativo/)
})

// El aviso automático de la ITV (21/10/2026): escalones, texto, dedupe y la composición en `avisosDe`.
// Fechas RELATIVAS a un `HOY` inyectado (nada contra el reloj real).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { avisosDe, esClaveDescartable, FUENTES_AVISO, type EntradaAvisos } from './avisos.ts'
import {
  itvParaAviso,
  matriculaEnmascarada,
  nombreVehiculo,
  textoAvisoItv,
  umbralItv,
  vehiculoCubiertoPorRecordatorio,
  type VehiculoParaAviso,
} from './aviso-itv.ts'
import { proximaItv } from './itv.ts'

const HOY = new Date('2026-10-21T10:00:00Z')
const iso = (d: Date) => d.toISOString().slice(0, 10)
const masDias = (n: number) => new Date(HOY.getTime() + n * 86_400_000)

/** Matriculación de un turismo tal que su PRIMERA ITV (4 años) caiga dentro de `n` días. */
function matriculadoConPrimeraItvEn(n: number): string {
  const f = masDias(n)
  return `${f.getUTCFullYear() - 4}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`
}

const coche = (x: Partial<VehiculoParaAviso> = {}): VehiculoParaAviso => ({
  id: 'cartera:p1',
  ramo: 'auto',
  matricula: '1234 BCD',
  cosa: 'Seat Ibiza · 1234BCD',
  fechaMatriculacion: matriculadoConPrimeraItvEn(20),
  ...x,
})

const base: EntradaAvisos = { autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], hoy: HOY }
const itvs = (x: Partial<EntradaAvisos>) => avisosDe({ ...base, ...x }).avisos.filter((a) => a.tipo === 'itv_en_ventana')

test('escalones 30/7/0: el menor umbral no pasado; fuera de ventana (y ya pasada) no hay tramo', () => {
  assert.equal(umbralItv(31), null)
  assert.equal(umbralItv(30), 30)
  assert.equal(umbralItv(8), 30)
  assert.equal(umbralItv(7), 7)
  assert.equal(umbralItv(1), 7)
  assert.equal(umbralItv(0), 0)
  assert.equal(umbralItv(-1), null, 'no hay escalón «vencida»: no se sabe cuándo pasó la última inspección')
  assert.equal(umbralItv(null), null)
  assert.equal(umbralItv(2.5), null)
})

test('una primera ITV a 20 días avisa en el tramo 30, con fecha firme (sin «estimada»)', () => {
  const [a, ...resto] = itvs({ vehiculos: [coche()] })
  assert.equal(resto.length, 0)
  assert.equal(a!.titulo, 'La ITV de tu vehículo Seat Ibiza (1234…) vence pronto')
  const f = masDias(20)
  const dmy = `${String(f.getUTCDate()).padStart(2, '0')}/${String(f.getUTCMonth() + 1).padStart(2, '0')}/${f.getUTCFullYear()}`
  assert.match(a!.detalle, new RegExp(`^Vence el ${dmy}\\. Pide cita en una estación ITV; circular sin ITV en vigor es sancionable y puede complicar un siniestro\\.`))
  assert.doesNotMatch(a!.detalle + a!.titulo, /estimad/i)
  assert.equal(a!.descartable, true)
  assert.equal(a!.href, '/boveda?vista=recordatorios')
  assert.ok(a!.clave.endsWith(`@${iso(f)}#30`), a!.clave)
  assert.equal(esClaveDescartable(a!.clave), true)
})

test('el tramo va en la clave: a 5 días es OTRO aviso (vuelve a salir), el día 0 dice «hoy»', () => {
  const c30 = itvs({ vehiculos: [coche()] })[0]!
  const c7 = itvs({ vehiculos: [coche({ fechaMatriculacion: matriculadoConPrimeraItvEn(5) })] })[0]!
  const c0 = itvs({ vehiculos: [coche({ fechaMatriculacion: matriculadoConPrimeraItvEn(0) })] })[0]!
  assert.notEqual(c30.clave, c7.clave)
  assert.match(c7.clave, /#7$/)
  assert.match(c0.clave, /#0$/)
  assert.match(c0.titulo, /vence hoy$/)
  assert.match(c0.detalle, /^Vence hoy \(/)
  // Marcado como leído solo el tramo 30: el 7 sigue saliendo.
  assert.equal(itvs({ vehiculos: [coche({ fechaMatriculacion: matriculadoConPrimeraItvEn(5) })], leidos: new Set([c30.clave]) }).length, 1)
  assert.equal(itvs({ vehiculos: [coche()], leidos: new Set([c30.clave]) }).length, 0)
})

test('🚨 ciclo estimado: se dice «fecha estimada» y se manda a la pegatina; nunca «vence el X» a secas', () => {
  // Matriculado hace 12 años y pico: ya le tocaron varias; la siguiente depende de cuándo pasó las anteriores.
  const f = masDias(12)
  const mat = `${f.getUTCFullYear() - 12}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`
  assert.equal(proximaItv({ fechaMatriculacion: mat, perfil: 'turismo', hoy: HOY })!.fiabilidad, 'ciclo_estimado')
  const a = itvs({ vehiculos: [coche({ fechaMatriculacion: mat })] })[0]!
  assert.match(a.titulo, /\(fecha estimada\)$/)
  assert.match(a.detalle, /^Fecha estimada: \d\d\/\d\d\/\d{4}, suponiendo que pasaste las anteriores en su fecha\. Mira la pegatina/)
  assert.doesNotMatch(a.detalle, /^Vence/)
})

test('sin matriculación REAL no hay aviso (la estimada por la matrícula no cuenta), ni con ramo sin ITV, ni fecha rota', () => {
  assert.deepEqual(itvs({ vehiculos: [coche({ fechaMatriculacion: null })] }), [])
  assert.deepEqual(itvs({ vehiculos: [coche({ ramo: 'hogar' })] }), [])
  assert.deepEqual(itvs({ vehiculos: [coche({ fechaMatriculacion: '2022-02-30' })] }), [])
  assert.equal(itvParaAviso(coche({ fechaMatriculacion: 'no es fecha' }), HOY), null)
  // Fuera de ventana (la ITV está a 200 días): nada.
  assert.deepEqual(itvs({ vehiculos: [coche({ fechaMatriculacion: matriculadoConPrimeraItvEn(200) })] }), [])
})

test('la moto se calcula como moto y el turismo avisa de que una furgoneta tiene otro calendario', () => {
  const moto = itvs({ vehiculos: [coche({ ramo: 'moto', fechaMatriculacion: matriculadoConPrimeraItvEn(10) })] })[0]!
  assert.doesNotMatch(moto.detalle, /furgoneta/)
  const turismo = itvs({ vehiculos: [coche()] })[0]!
  assert.match(turismo.detalle, /furgoneta/)
})

test('nombre: modelo + matrícula enmascarada, solo uno de los dos, o «tu vehículo»', () => {
  assert.equal(matriculaEnmascarada('1234 bcd'), '1234…')
  assert.equal(matriculaEnmascarada('AB1'), null, 'un resto de volcado no identifica nada')
  assert.equal(nombreVehiculo({ cosa: 'Seat Ibiza · 1234BCD', matricula: '1234BCD' }), 'tu vehículo Seat Ibiza (1234…)')
  assert.equal(nombreVehiculo({ cosa: null, matricula: '1234BCD' }), 'tu vehículo 1234…')
  assert.equal(nombreVehiculo({ cosa: 'Seat Ibiza', matricula: null }), 'tu vehículo Seat Ibiza')
  assert.equal(nombreVehiculo({ cosa: '1234BCD', matricula: '1234BCD' }), 'tu vehículo 1234…')
  assert.equal(nombreVehiculo({ cosa: null, matricula: null }), 'tu vehículo')
  const t = textoAvisoItv({ cosa: null, matricula: null }, itvParaAviso(coche(), HOY)!)
  assert.match(t.titulo, /^La ITV de tu vehículo vence pronto$/)
})

test('🚨 dedupe: un recordatorio propio de ITV para ese coche (por póliza o por matrícula en el título) cubre el aviso', () => {
  const v = coche()
  const r = (x: Partial<{ tipo: string; polizaId: string | null; polizaDeclaradaId: string | null; titulo: string }>) => ({ tipo: 'itv', polizaId: null, polizaDeclaradaId: null, titulo: 'ITV', ...x })
  assert.equal(vehiculoCubiertoPorRecordatorio(v, [r({ polizaId: 'p1' })]), true)
  assert.equal(vehiculoCubiertoPorRecordatorio({ id: 'declarada:d1', matricula: null }, [r({ polizaDeclaradaId: 'd1' })]), true)
  assert.equal(vehiculoCubiertoPorRecordatorio(v, [r({ titulo: 'ITV de 1234-bcd' })]), true)
  // No lo cubre: otra póliza, otro tipo, o una ITV sin póliza ni matrícula que no se puede atribuir.
  assert.equal(vehiculoCubiertoPorRecordatorio(v, [r({ polizaId: 'otra' })]), false)
  assert.equal(vehiculoCubiertoPorRecordatorio(v, [r({ tipo: 'carnet', polizaId: 'p1' })]), false)
  assert.equal(vehiculoCubiertoPorRecordatorio(v, [r({ titulo: 'ITV' })]), false)
  assert.equal(vehiculoCubiertoPorRecordatorio(v, [r({ polizaId: 'otra', titulo: 'ITV 1234BCD' })]), false, 'colgado de OTRA póliza: es de otro coche')
})

test('interruptor apagado: no hay avisos ni fuente ilegible; encendido con fuente caída → la fuente se declara', () => {
  const v = [coche()]
  assert.deepEqual(itvs({ vehiculos: v, itvSilenciada: true }), [])
  assert.equal(avisosDe({ ...base, vehiculos: null, itvSilenciada: true }).fuentesIlegibles.includes('vehiculos'), false)
  assert.equal(avisosDe({ ...base, vehiculos: null }).fuentesIlegibles.includes('vehiculos'), true)
  assert.equal(itvs({ vehiculos: v, itvSilenciada: false }).length, 1)
})

test('una superficie que no consulta vehículos (la intranet) no cuenta la fuente para el «!» ni avisa de ITV', () => {
  const sin = avisosDe({ ...base, carnets: null, felicitaciones: null, polizasNuevas: null, partes: null, polizasModificadas: null })
  assert.equal(sin.fuentesIlegibles.includes('vehiculos'), false)
  // Todas las fuentes que SÍ consulta, caídas, más vehículos caída: «!» (ninguna legible).
  const todas = avisosDe({ ...base, autorizaciones: null, obligaciones: null, peticiones: null, datos: null, carnets: null, firmas: null, felicitaciones: null, polizasNuevas: null, partes: null, polizasModificadas: null, vehiculos: null })
  assert.equal(todas.globo, '!')
  assert.equal(todas.fuentesIlegibles.length, FUENTES_AVISO.length)
})

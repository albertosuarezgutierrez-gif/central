// Motor de señales de patrimonio: interruptor, generador por tipo, permiso, 180 días y plan. `hoy` siempre inyectado.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DIAS_TRAS_DESCARTE,
  MESES_RETENCION_SENALES,
  POLITICA_CALCULO,
  calcularSenales,
  corteRetencionSenales,
  debePurgarseSenal,
  patrimonioSenalesActivas,
  permisoContacto,
  planificarSenales,
  puedeCalcularSenales,
  puedeRecrearseTrasCierre,
  senalesDeDeclaradas,
  senalesDeInmueble,
  type DeclaradaParaSenal,
  type FilaSenalExistente,
  type InmuebleParaSenal,
} from './senales.ts'
import { sumarDias, sumarMeses } from './fechas.ts'

const HOY = '2026-10-26'
const C = 'cli-1'
const inm = (p: Partial<InmuebleParaSenal> = {}): InmuebleParaSenal => ({
  id: 'i1', alias: 'Socorro 2B', uso: 'vivienda', referenciaCatastral: null, estadoSeguro: 'sin_mirar',
  infraseguro: null, hipoteca: null, contratos: [], ...p,
})
const tipos = (p: Partial<InmuebleParaSenal>) => senalesDeInmueble({ clienteId: C, hoy: HOY, inmueble: inm(p) }).map((s) => s.tipo)

test('interruptor: solo el valor exacto «1» enciende', () => {
  assert.equal(patrimonioSenalesActivas('1'), true)
  for (const v of [undefined, null, '', '0', 'true', 'on', ' 1', '1 ', 'si']) assert.equal(patrimonioSenalesActivas(v), false, String(v))
})

test('inmueble_sin_seguro: solo si el cliente DECLARÓ que no tiene; sin_mirar y no vigente no cuentan', () => {
  assert.deepEqual(tipos({ estadoSeguro: 'sin_seguro' }), ['inmueble_sin_seguro'])
  for (const e of ['sin_mirar', 'con_seguro', 'con_seguro_no_vigente', 'enlazado_sin_comprobar'] as const) {
    assert.deepEqual(tipos({ estadoSeguro: e }), [], e)
  }
})

test('inmueble_sin_seguro: ramo por uso y garaje/trastero/otro sin señal', () => {
  const r = (uso: string) => senalesDeInmueble({ clienteId: C, hoy: HOY, inmueble: inm({ uso, estadoSeguro: 'sin_seguro' }) })[0]?.ramo
  assert.equal(r('vivienda'), 'hogar')
  assert.equal(r('local'), 'comercio')
  assert.equal(r('nave'), 'comercio')
  assert.equal(r('garaje'), undefined)
  assert.equal(r('otro'), undefined)
})

test('la clave usa la referencia catastral si consta y es de la ficha, no del nombre', () => {
  const [s] = senalesDeInmueble({ clienteId: C, hoy: HOY, inmueble: inm({ estadoSeguro: 'sin_seguro', referenciaCatastral: 'A'.repeat(20) }) })
  assert.equal(s!.clave, `cli-1:rc:${'A'.repeat(20)}:inmueble_sin_seguro`)
  const [t] = senalesDeInmueble({ clienteId: 'cli-2', hoy: HOY, inmueble: inm({ estadoSeguro: 'sin_seguro', referenciaCatastral: 'A'.repeat(20) }) })
  assert.notEqual(s!.clave, t!.clave, 'dos fichas con el mismo piso son dos señales: jamás se funden')
})

test('infraseguro: solo la alerta «infraseguro»; ok y sin_dato no', () => {
  assert.deepEqual(tipos({ infraseguro: { estado: 'infraseguro', ratio: 0.62, faltante: 3_800_000 } }), ['infraseguro'])
  assert.deepEqual(tipos({ infraseguro: { estado: 'ok', ratio: 1 } }), [])
  assert.deepEqual(tipos({ infraseguro: { estado: 'sin_dato', motivo: 'sin_capital' } }), [])
  assert.deepEqual(tipos({ infraseguro: null }), [])
})

test('hipoteca: solo «si»; no, no_se y null no', () => {
  assert.deepEqual(tipos({ hipoteca: 'si' }), ['hipoteca_con_seguros'])
  for (const h of ['no', 'no_se', null]) assert.deepEqual(tipos({ hipoteca: h }), [], String(h))
})

test('alquiler_sin_impago: contrato vivo y consta que NO tiene el seguro; null (sin comprobar) no genera', () => {
  const c = (o: Partial<{ terminadoEn: string | null; tieneSeguroImpago: boolean | null }>) =>
    tipos({ contratos: [{ id: 'c1', terminadoEn: null, tieneSeguroImpago: false, ...o }] })
  assert.deepEqual(c({}), ['alquiler_sin_impago'])
  assert.deepEqual(c({ tieneSeguroImpago: true }), [])
  assert.deepEqual(c({ tieneSeguroImpago: null }), [])
  assert.deepEqual(c({ terminadoEn: '2026-10-01' }), [])
  assert.deepEqual(c({ terminadoEn: HOY }), [], 'terminado hoy ya no está vivo')
  assert.deepEqual(c({ terminadoEn: '2026-11-01' }), ['alquiler_sin_impago'])
})

test('las señales no llevan datos del inquilino ni rentas', () => {
  const todas = calcularSenales({
    clienteId: C, hoy: HOY,
    inmuebles: [inm({ estadoSeguro: 'sin_seguro', hipoteca: 'si', infraseguro: { estado: 'infraseguro', ratio: 0.5, faltante: 1 }, contratos: [{ id: 'c1', terminadoEn: null, tieneSeguroImpago: false }] })],
    declaradas: [],
  })
  assert.equal(todas.length, 4)
  const texto = JSON.stringify(todas)
  assert.doesNotMatch(texto, /inquilino|renta|nif|email|iban/i)
})

test('poliza_externa_por_vencer: vigente y dentro de 60 días; vencida, lejana, sin fecha o sin comprobar no', () => {
  const d = (p: Partial<DeclaradaParaSenal>): DeclaradaParaSenal => ({ id: 'd1', ramo: 'hogar', vencimiento: '2026-11-20', vigente: true, ...p })
  const n = (p: Partial<DeclaradaParaSenal>) => senalesDeDeclaradas({ clienteId: C, hoy: HOY, declaradas: [d(p)] }).length
  assert.equal(n({}), 1)
  assert.equal(n({ vencimiento: HOY }), 1)
  assert.equal(n({ vencimiento: sumarDias(HOY, 60) }), 1)
  assert.equal(n({ vencimiento: sumarDias(HOY, 61) }), 0)
  assert.equal(n({ vencimiento: '2026-10-25' }), 0)
  assert.equal(n({ vencimiento: null }), 0)
  assert.equal(n({ vigente: null }), 0)
  assert.equal(n({ vigente: false }), 0)
  assert.equal(senalesDeDeclaradas({ clienteId: C, hoy: HOY, declaradas: [d({ ramo: null })] })[0]!.ramo, 'otros')
})

test('permisoContacto: una oposición gana a todo; pedido > consentido (comercial) > sin_permiso', () => {
  assert.equal(permisoContacto({ peticionAbierta: true, oposiciones: [null, true], comerciales: [true] }), 'opuesto')
  assert.equal(permisoContacto({ peticionAbierta: true, oposiciones: [null], comerciales: [null] }), 'pedido')
  assert.equal(permisoContacto({ peticionAbierta: false, oposiciones: [false], comerciales: [true, null] }), 'consentido')
  assert.equal(permisoContacto({ peticionAbierta: false, oposiciones: [null], comerciales: [null] }), 'sin_permiso')
  assert.equal(permisoContacto({ peticionAbierta: false, oposiciones: [], comerciales: [] }), 'sin_permiso')
  assert.equal(permisoContacto({ peticionAbierta: false, oposiciones: [null], comerciales: [false] }), 'sin_permiso', 'retirar «comercial» no es oponerse a las señales')
})

test('política vigente: interés legítimo informado (variante A publicada)', () => {
  assert.equal(POLITICA_CALCULO, 'interes_legitimo')
})

test('puedeCalcularSenales: apagado = nunca; encendido = salvo oposición VIGENTE', () => {
  assert.equal(puedeCalcularSenales({ interruptor: false, oposiciones: [] }), false)
  assert.equal(puedeCalcularSenales({ interruptor: false, oposiciones: [null, false] }), false)
  assert.equal(puedeCalcularSenales({ interruptor: true, oposiciones: [] }), true, 'sin identidades nadie se ha opuesto')
  assert.equal(puedeCalcularSenales({ interruptor: true, oposiciones: [null] }), true, 'sin casilla previa: nunca opuesto = se calcula')
  assert.equal(puedeCalcularSenales({ interruptor: true, oposiciones: [false] }), true, 'retiró la oposición = se calcula')
  assert.equal(puedeCalcularSenales({ interruptor: true, oposiciones: [true] }), false)
  assert.equal(puedeCalcularSenales({ interruptor: true, oposiciones: [null, false, true] }), false, 'una oposición de cualquier identidad basta')
})

test('retención: 24 meses desde el cierre, o desde la última actualización si sigue viva (hoy inyectado)', () => {
  assert.equal(MESES_RETENCION_SENALES, 24)
  const corte = corteRetencionSenales(HOY)
  assert.equal(corte, sumarMeses(HOY, -24))
  assert.ok(MESES_RETENCION_SENALES * 30 > DIAS_TRAS_DESCARTE, 'purgar no puede saltarse los 180 días del descarte')
  const antes = sumarDias(corte, -1)
  // Cerrada: manda cerradaEn, aunque ultimaVezEn sea antigua o reciente.
  assert.equal(debePurgarseSenal({ cerradaEn: antes, ultimaVezEn: HOY, hoy: HOY }), true)
  assert.equal(debePurgarseSenal({ cerradaEn: corte, ultimaVezEn: antes, hoy: HOY }), false, 'el día del corte aún se conserva')
  assert.equal(debePurgarseSenal({ cerradaEn: sumarDias(HOY, -10), ultimaVezEn: antes, hoy: HOY }), false)
  // Viva: manda ultimaVezEn.
  assert.equal(debePurgarseSenal({ cerradaEn: null, ultimaVezEn: antes, hoy: HOY }), true)
  assert.equal(debePurgarseSenal({ cerradaEn: null, ultimaVezEn: sumarDias(HOY, -1), hoy: HOY }), false)
  // Sin fecha: no se destruye lo que no se sabe fechar.
  assert.equal(debePurgarseSenal({ cerradaEn: null, ultimaVezEn: null, hoy: HOY }), false)
  // 29/02 → recorta al 28/02 dos años antes, sin desbordar.
  assert.equal(corteRetencionSenales('2028-02-29'), '2026-02-28')
})

test('180 días: una descartada no vuelve hasta el día 180; las demás cerradas sí', () => {
  const desc = (dias: number) => puedeRecrearseTrasCierre({ estado: 'descartada', cerradaEn: sumarDias(HOY, -dias), hoy: HOY })
  assert.equal(DIAS_TRAS_DESCARTE, 180)
  assert.equal(desc(0), false)
  assert.equal(desc(179), false)
  assert.equal(desc(180), true)
  assert.equal(desc(400), true)
  assert.equal(puedeRecrearseTrasCierre({ estado: 'descartada', cerradaEn: null, hoy: HOY }), false)
  for (const e of ['resuelta', 'retirada'] as const) assert.equal(puedeRecrearseTrasCierre({ estado: e, cerradaEn: HOY, hoy: HOY }), true)
})

const sin = () => senalesDeInmueble({ clienteId: C, hoy: HOY, inmueble: inm({ estadoSeguro: 'sin_seguro' }) })
const fila = (p: Partial<FilaSenalExistente>): FilaSenalExistente => ({ id: 'f1', clave: sin()[0]!.clave, estado: 'abierta', cerradaEn: null, ...p })

test('plan: inserta lo nuevo, refresca lo vivo, resuelve lo que ya no se da', () => {
  assert.equal(planificarSenales({ calculadas: sin(), existentes: [], permitido: true, hoy: HOY }).insertar.length, 1)
  const p2 = planificarSenales({ calculadas: sin(), existentes: [fila({})], permitido: true, hoy: HOY })
  assert.deepEqual([p2.insertar.length, p2.refrescar.length], [0, 1])
  const p3 = planificarSenales({ calculadas: [], existentes: [fila({})], permitido: true, hoy: HOY })
  assert.deepEqual(p3.resolver, ['f1'])
  const p4 = planificarSenales({ calculadas: [], existentes: [fila({ estado: 'promovida' })], permitido: true, hoy: HOY })
  assert.deepEqual(p4.resolver, [], 'una promovida no se resuelve desde el motor')
})

test('plan: descartada hace 100 días no se recrea; hace 180 sí', () => {
  const rec = (dias: number) =>
    planificarSenales({ calculadas: sin(), existentes: [fila({ estado: 'descartada', cerradaEn: sumarDias(HOY, -dias) })], permitido: true, hoy: HOY }).insertar.length
  assert.equal(rec(100), 0)
  assert.equal(rec(180), 1)
})

test('plan: la cerrada más reciente es la que manda', () => {
  const p = planificarSenales({
    calculadas: sin(),
    existentes: [
      fila({ id: 'a', estado: 'descartada', cerradaEn: sumarDias(HOY, -400) }),
      fila({ id: 'b', estado: 'descartada', cerradaEn: sumarDias(HOY, -10) }),
    ],
    permitido: true, hoy: HOY,
  })
  assert.equal(p.insertar.length, 0)
})

test('plan: sin permiso no se inserta nada y se retiran las abiertas (no las promovidas)', () => {
  const p = planificarSenales({
    calculadas: sin(),
    existentes: [fila({ id: 'a' }), fila({ id: 'b', clave: 'otra', estado: 'promovida' })],
    permitido: false, hoy: HOY,
  })
  assert.deepEqual(p, { insertar: [], refrescar: [], resolver: [], retirar: ['a'] })
})

test('plan: la misma clave calculada dos veces se inserta una sola', () => {
  const s = sin()[0]!
  assert.equal(planificarSenales({ calculadas: [s, s], existentes: [], permitido: true, hoy: HOY }).insertar.length, 1)
})

test('puedeCalcularSenales: una supresión atendida (suprimida) impide calcular aunque no haya oposición', () => {
  assert.equal(puedeCalcularSenales({ interruptor: true, oposiciones: [] }), true)
  assert.equal(puedeCalcularSenales({ interruptor: true, oposiciones: [], suprimida: true }), false)
  assert.equal(puedeCalcularSenales({ interruptor: true, oposiciones: [], suprimida: false }), true)
})

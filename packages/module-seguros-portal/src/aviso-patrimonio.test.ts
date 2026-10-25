// El aviso del calendario del patrimonio (24/10/2026, P13). Fechas relativas a un `HOY` inyectado.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { avisosDe, esClaveDescartable, FUENTES_AVISO, HREF_POR_TIPO, type EntradaAvisos } from './avisos.ts'
import {
  DIAS_MAX_VENCIDA_PATRIMONIO,
  patrimonioSeAvisa,
  textoAvisoPatrimonio,
  textoPushPatrimonio,
  type PatrimonioParaAviso,
} from './aviso-patrimonio.ts'

const HOY = new Date('2026-10-24T10:00:00Z')
const base: EntradaAvisos = { autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], hoy: HOY }
const venc = (x: Partial<PatrimonioParaAviso> = {}): PatrimonioParaAviso => ({
  clave: 'ob1:2026-11-10',
  etiqueta: 'Certificado de eficiencia energética',
  inmueble: 'Piso de Triana',
  vence: '2026-11-10',
  estado: 'avisar',
  dias: 17,
  ...x,
})
const deP = (x: Partial<EntradaAvisos>) => avisosDe({ ...base, ...x }).avisos.filter((a) => a.tipo === 'patrimonio_en_ventana')

test('se avisa de lo que se acerca y de lo vencido hace poco; no de lo viejo, ni de lo que no tiene fecha', () => {
  assert.equal(patrimonioSeAvisa({ estado: 'avisar', dias: 0 }), true)
  assert.equal(patrimonioSeAvisa({ estado: 'avisar', dias: -1 }), false)
  assert.equal(patrimonioSeAvisa({ estado: 'vencida', dias: -1 }), true)
  assert.equal(patrimonioSeAvisa({ estado: 'vencida', dias: -DIAS_MAX_VENCIDA_PATRIMONIO }), true)
  assert.equal(patrimonioSeAvisa({ estado: 'vencida', dias: -DIAS_MAX_VENCIDA_PATRIMONIO - 1 }), false)
  assert.equal(patrimonioSeAvisa({ estado: 'vencida', dias: 3 }), false)
  assert.equal(patrimonioSeAvisa({ estado: 'avisar', dias: Number.NaN }), false)
})

test('el texto dice el hecho; con fecha rota se calla (no revienta avisosDe)', () => {
  assert.match(textoAvisoPatrimonio(venc())!.titulo, /vence el 10 de noviembre/)
  assert.match(textoAvisoPatrimonio(venc({ dias: 0 }))!.titulo, /vence hoy/)
  assert.match(textoAvisoPatrimonio(venc({ estado: 'vencida', dias: -3 }))!.titulo, /venció el/)
  assert.equal(textoAvisoPatrimonio(venc({ vence: 'pronto' })), null)
  assert.equal(deP({ patrimonio: [venc({ vence: 'pronto' })] }).length, 0)
})

test('el push no lleva alias ni dirección del inmueble', () => {
  const t = textoPushPatrimonio(venc())
  assert.doesNotMatch(`${t.title} ${t.body}`, /Triana|Piso/)
})

test('composición en avisosDe: un aviso por vencimiento, descartable, con enlace al calendario y clave por ciclo', () => {
  const r = deP({ patrimonio: [venc(), venc({ clave: 'ob2:2026-10-20', estado: 'vencida', vence: '2026-10-20', dias: -4 })] })
  assert.equal(r.length, 2)
  assert.ok(r.every((a) => a.href === '/patrimonio/calendario' && a.descartable))
  assert.equal(HREF_POR_TIPO.patrimonio_en_ventana, '/patrimonio/calendario')
  assert.notEqual(r[0]!.clave, r[1]!.clave)
  assert.ok(r[0]!.clave.includes('@2026-11-10#avisar'))
  assert.equal(esClaveDescartable(r[0]!.clave), true)
  // Pulsado: desaparece, y el del ciclo siguiente (otro estado) no.
  const leida = avisosDe({ ...base, patrimonio: [venc()], leidos: new Set([r[0]!.clave]) }).avisos.filter((a) => a.tipo === 'patrimonio_en_ventana')
  assert.equal(leida.length, 0)
  const otroEstado = avisosDe({ ...base, patrimonio: [venc({ estado: 'vencida', dias: -1 })], leidos: new Set([r[0]!.clave]) }).avisos.filter((a) => a.tipo === 'patrimonio_en_ventana')
  assert.equal(otroEstado.length, 1)
})

test('🚨 fuente ilegible → «!»/«n+», nunca «0»; ausente (intranet) no cuenta', () => {
  const caida = avisosDe({ ...base, patrimonio: null })
  assert.deepEqual(caida.fuentesIlegibles, ['patrimonio'])
  assert.notEqual(caida.globo, null)
  assert.equal(caida.globo, '0+')
  // Leída y vacía: sin globo. Ausente: ni fuente ilegible ni cuenta.
  assert.equal(avisosDe({ ...base, patrimonio: [] }).globo, null)
  assert.deepEqual(avisosDe(base).fuentesIlegibles, [])
  assert.ok(FUENTES_AVISO.includes('patrimonio'))
})

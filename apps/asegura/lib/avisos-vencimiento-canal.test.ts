import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canalesPorFicha, decidirAvisoVencimiento, type CanalesDeFichas, type OrigenAviso } from './avisos-vencimiento-canal.ts'

const ACCIONABLE = new Date('2026-10-17T00:00:00Z')
const PUSH = new Date('2026-10-10T08:00:00Z')
const deObligacion = (identidadId = 'i1', avisadaPushAt: Date | null = PUSH): OrigenAviso => ({
  tipo: 'obligacion', identidadId, avisadaPushAt, fechaAccionable: ACCIONABLE,
})
const lectura = (...ids: [string, string | null][]): CanalesDeFichas => new Map([['f1', ids.map(([identidadId, canal]) => ({ identidadId, canal }))]])
const decide = (origen: OrigenAviso, canales: CanalesDeFichas) => decidirAvisoVencimiento({ origen, fichaId: 'f1', canales })

test('🚨 todo se cumple (push salido, identidad de la ficha, todas «movil») → se OMITE', () => {
  assert.deepEqual(decide(deObligacion(), lectura(['i1', 'movil'], ['i2', 'movil'])), { enviar: false, motivo: 'solo_movil' })
})

test('🚨 vencimiento DERIVADO de la póliza → se manda siempre (no tiene push detrás)', () => {
  assert.deepEqual(decide({ tipo: 'derivado' }, lectura(['i1', 'movil'])), { enviar: true, motivo: 'derivado' })
})

test('🚨 obligación sin avisada_push_at → se manda (el push no ha salido)', () => {
  assert.deepEqual(decide(deObligacion('i1', null), lectura(['i1', 'movil'])), { enviar: true, motivo: 'sin_push_enviado' })
})

test('🚨 sello de push de hace 12 meses (ciclo anterior) → se manda', () => {
  assert.deepEqual(decide(deObligacion('i1', new Date('2025-10-10T08:00:00Z')), lectura(['i1', 'movil'])), { enviar: true, motivo: 'sin_push_enviado' })
})

test('push salido con la antelación máxima (30 días antes) → cuenta como de este ciclo', () => {
  assert.equal(decide(deObligacion('i1', new Date('2026-09-17T08:00:00Z')), lectura(['i1', 'movil'])).enviar, false)
})

test('🚨 la identidad de la obligación no es de la ficha del tomador → se manda', () => {
  assert.deepEqual(decide(deObligacion('ajena'), lectura(['i1', 'movil'])), { enviar: true, motivo: 'identidad_ajena' })
  assert.deepEqual(decide(deObligacion('i1'), new Map()), { enviar: true, motivo: 'identidad_ajena' })
})

test('🚨 mezcla «movil» + sin configurar (null) → se manda: null es «no lo sé», no «no quiere»', () => {
  assert.deepEqual(decide(deObligacion(), lectura(['i1', 'movil'], ['i2', null])), { enviar: true, motivo: 'sin_solo_movil' })
})

test('«ambos», «correo» o un valor que no se reconoce → se manda', () => {
  assert.equal(decide(deObligacion(), lectura(['i1', 'ambos'])).enviar, true)
  assert.equal(decide(deObligacion(), lectura(['i1', 'movil'], ['i2', 'correo'])).enviar, true)
  assert.equal(decide(deObligacion(), lectura(['i1', 'MOVIL'])).enviar, true)
})

test('🚨 error de lectura de preferencias → se manda (fail-open) con su motivo', () => {
  assert.deepEqual(decide(deObligacion(), null), { enviar: true, motivo: 'preferencias_no_leidas' })
})

test('canalesPorFicha: una identidad cuenta una vez por ficha; sin fila de preferencias = null', () => {
  const m = canalesPorFicha({
    vinculos: [
      { identidadId: 'i1', clienteId: 'f1' },
      { identidadId: 'i1', clienteId: 'f1' },
      { identidadId: 'i2', clienteId: 'f1' },
      { identidadId: 'i3', clienteId: 'f2' },
    ],
    canalDe: new Map([['i1', 'movil']]),
  })
  assert.deepEqual(m.get('f1'), [{ identidadId: 'i1', canal: 'movil' }, { identidadId: 'i2', canal: null }])
  assert.deepEqual(m.get('f2'), [{ identidadId: 'i3', canal: null }])
})

// Cableado: la regla pura no sirve si los emisores dejan de pasarle el origen correcto.
const fuente = (f: string) =>
  readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('🚨 cron de vencimientos: decide por obligación ANTES de resolver destinatario, con su push y su identidad, sin sellar', () => {
  const src = fuente('avisos-vencimiento.ts')
  const i = src.indexOf('decidirAvisoVencimiento({')
  const j = src.indexOf('let destino = poliza ? destinatarioDeCliente(')
  assert.ok(i !== -1 && j !== -1 && i < j, 'la decisión va antes de resolver el destinatario')
  const bloque = src.slice(i, j)
  assert.match(bloque, /identidadId: o\.identidadId, avisadaPushAt: o\.avisadaPushAt, fechaAccionable: o\.fechaAccionable/)
  assert.match(bloque, /if \(!decision\.enviar\)[\s\S]*?continue/)
  assert.doesNotMatch(bloque, /avisadaAt|\.update\(|\.create/, 'omitir no escribe')
})

test('🚨 avisos-intranet: el derivado NO se marca; la obligación y su recordatorio sí, con su origen', () => {
  const src = fuente('avisos-intranet.ts')
  assert.doesNotMatch(src, /marcarVencimiento\(v\.clienteId/, 'el vencimiento derivado no puede callarse')
  assert.match(src, /origen: \{ tipo: 'derivado' \}/, 'el recordatorio de un derivado debe ir como derivado')
  assert.match(src, /marcarVencimiento\(clienteId, o\.id, \{ tipo: 'obligacion', identidadId: o\.identidadId, avisadaPushAt: o\.avisadaPushAt, fechaAccionable: o\.fechaAccionable \}\)/)
  assert.match(src, /marcarVencimiento\(c\.clienteId, `\$\{c\.baseId\}:recordatorio`, c\.origen\)/)
  const i = src.indexOf('leerCanalesDeFichas(db, [...vencimientosDe.keys()]')
  const j = src.indexOf('return { pendientes: [...por.values()]')
  assert.ok(i !== -1 && i < j)
  const bloque = src.slice(i, j)
  assert.match(bloque, /decidirAvisoVencimiento\(\{ origen, fichaId: clienteId, canales \}\)/)
  assert.doesNotMatch(bloque, /portalAvisoEnviado|avisadaAt|\.update\(|\.create/, 'omitir no escribe')
})

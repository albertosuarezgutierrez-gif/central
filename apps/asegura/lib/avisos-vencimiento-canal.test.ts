import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canalesPorFicha, decidirAvisoVencimiento, diasEfectivosDeFicha, type CanalesDeFichas, type OrigenAviso } from './avisos-vencimiento-canal.ts'

const ACCIONABLE = new Date('2026-10-17T00:00:00Z')
const PUSH = new Date('2026-10-10T08:00:00Z')
const deObligacion = (identidadId = 'i1', avisadaPushAt: Date | null = PUSH): OrigenAviso => ({
  tipo: 'obligacion', identidadId, avisadaPushAt, fechaAccionable: ACCIONABLE,
})
const lectura = (...ids: [string, string | null][]): CanalesDeFichas =>
  new Map([['f1', ids.map(([identidadId, canal]) => ({ identidadId, canal, diasAntelacion: null }))]])
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
    prefsDe: new Map([['i1', { canal: 'movil', diasAntelacion: 15 }]]),
  })
  assert.deepEqual(m.get('f1'), [{ identidadId: 'i1', canal: 'movil', diasAntelacion: 15 }, { identidadId: 'i2', canal: null, diasAntelacion: null }])
  assert.deepEqual(m.get('f2'), [{ identidadId: 'i3', canal: null, diasAntelacion: null }])
})

// Antelación del CORREO (14/10/2026): max(7, la mayor de las identidades de la ficha).
const conDias = (...d: (number | null)[]): CanalesDeFichas =>
  new Map([['f1', d.map((diasAntelacion, n) => ({ identidadId: `i${n}`, canal: null, diasAntelacion }))]])

test('🚨 días del correo: ficha sin preferencias → 7', () => {
  assert.equal(diasEfectivosDeFicha(conDias(null), 'f1'), 7)
  assert.equal(diasEfectivosDeFicha(conDias(), 'f1'), 7, 'ficha leída sin identidades')
  assert.equal(diasEfectivosDeFicha(new Map(), 'f1'), 7, 'ficha sin vínculo (vencimiento derivado sin identidad)')
})

test('🚨 días del correo: 3 elegidos → 7 (nunca se acorta el preaviso)', () => {
  assert.equal(diasEfectivosDeFicha(conDias(3), 'f1'), 7)
})

test('🚨 días del correo: 15 elegidos → 15', () => {
  assert.equal(diasEfectivosDeFicha(conDias(15), 'f1'), 15)
})

test('🚨 días del correo: varias identidades con 15 y 30 → 30', () => {
  assert.equal(diasEfectivosDeFicha(conDias(15, 30), 'f1'), 30)
  assert.equal(diasEfectivosDeFicha(conDias(30, 3, null), 'f1'), 30)
})

test('🚨 días del correo: lectura fallida → 7 (lo de antes)', () => {
  assert.equal(diasEfectivosDeFicha(null, 'f1'), 7)
})

// Cableado: la regla pura no sirve si los emisores dejan de pasarle el origen correcto.
const fuente = (f: string) =>
  readFileSync(join(import.meta.dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const sinComentariosReglas = () => fuente('avisos-intranet-reglas.ts')

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

test('🚨 cron de vencimientos: criba hasta 30 días en orden ascendente y ventana POR FICHA vía el helper', () => {
  const src = fuente('avisos-vencimiento.ts')
  assert.match(src, /fechaAccionable: \{ gte: hoy, lte: new Date\(hoy\.getTime\(\) \+ DIAS_ANTELACION_MAX \* MS_DIA\) \}/, 'la criba no llega a la mayor antelación')
  assert.match(src, /orderBy: \[\{ fechaAccionable: 'asc' \}, \{ id: 'asc' \}\],\s*take: LIMITE_OBLIGACIONES/, 'sin orden ascendente, el techo puede dejar fuera un aviso de 7 días')
  assert.match(src, /dias: diasEfectivosDeFicha\(canalesDeFicha, p\.cliente\.id\)/, 'las candidatas no usan la antelación de su ficha')
  assert.match(src, /select: \{ identidadId: true, canal: true, diasAntelacion: true \}/, 'canal y antelación, en la MISMA lectura')
  const i = src.indexOf('const canalesDeFicha = await leerCanalesDeFichas(')
  const j = src.indexOf('const candidatas = enCriba.filter(')
  assert.ok(i !== -1 && j !== -1 && i < j, 'las preferencias se leen ANTES de decidir las candidatas')
})

test('🚨 avisos-intranet: cada ficha con SU antelación, y la misma llega a avisosDe()', () => {
  const src = fuente('avisos-intranet.ts')
  assert.match(src, /const limiteVentana = new Date\(hoy\.getTime\(\) \+ DIAS_ANTELACION_MAX \* MS_DIA\)/)
  assert.match(src, /\(DIAS_ANTELACION_MAX \+ 31\) \* MS_DIA/, 'el vencimiento derivado no llega a 30 días')
  assert.match(src, /const dias = diasEfectivosDeFicha\(canales, p\.clienteId\)/)
  assert.match(src, /p\.diasAntelacion = dias/, 'avisosDe() volvería a cortar a 7 días')
  const k = src.indexOf('async function contarSinFicha')
  assert.match(src.slice(k, k + 600), /DIAS_VENTANA_AVISO \* MS_DIA/, 'las filas sin ficha siguen con 7 días')
  assert.match(sinComentariosReglas(), /diasAntelacion: p\.diasAntelacion \?\? null/)
})

test('🚨 avisos-intranet: el derivado NO se marca; la obligación y su recordatorio sí, con su origen', () => {
  const src = fuente('avisos-intranet.ts')
  assert.doesNotMatch(src, /marcarVencimiento\(v\.clienteId/, 'el vencimiento derivado no puede callarse')
  assert.match(src, /origen: \{ tipo: 'derivado' \}/, 'el recordatorio de un derivado debe ir como derivado')
  assert.match(src, /marcarVencimiento\(clienteId, o\.id, \{ tipo: 'obligacion', identidadId: o\.identidadId, avisadaPushAt: o\.avisadaPushAt, fechaAccionable: o\.fechaAccionable \}\)/)
  assert.match(src, /marcarVencimiento\(c\.clienteId, `\$\{c\.baseId\}:recordatorio`, c\.origen\)/)
  assert.match(src, /const fichasConVencimientos = new Set\(\[\.\.\.vencimientosDe\.keys\(\)/, 'la lectura tiene que cubrir las fichas con vencimientos marcados')
  const i = src.indexOf('leerCanalesDeFichas(db, [...fichasConVencimientos]')
  const j = src.indexOf('return { pendientes: [...por.values()]')
  assert.ok(i !== -1 && i < j)
  const bloque = src.slice(i, j)
  assert.match(bloque, /decidirAvisoVencimiento\(\{ origen, fichaId: clienteId, canales \}\)/)
  assert.doesNotMatch(bloque, /portalAvisoEnviado|avisadaAt|\.update\(|\.create/, 'omitir no escribe')
})

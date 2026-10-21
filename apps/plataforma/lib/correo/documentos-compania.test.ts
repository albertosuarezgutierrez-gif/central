import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { archivarAdjuntosCompania, cuboDocumento, puedeArchivarAdjuntos } from './documentos-compania.ts'

// F1 del agente corredor de correo (21/10/2026): los PDF de compañía, a asegura. Fixtures inventados.
const correo = (n: number) => ({
  messageId: '<m1@allianz.es>', adjuntosCompaniaOmitidos: 1,
  adjuntosCompania: Array.from({ length: n }, (_, i) => ({ nombre: `d${i}.pdf`, mime: 'application/pdf', contenido: Buffer.from('%PDF-1.4') })),
})

test('cuboDocumento: lo que asegura confirma; lo desconocido es fallo (nunca «guardado»)', () => {
  assert.equal(cuboDocumento(200, { estado: 'guardado', asignado: true }), 'asignado')
  assert.equal(cuboDocumento(200, { estado: 'guardado', asignado: false }), 'sin_asignar')
  assert.equal(cuboDocumento(200, { estado: 'asignado_previo', asignado: true }), 'asignado')
  assert.equal(cuboDocumento(200, { estado: 'repetido' }), 'repetido')
  assert.equal(cuboDocumento(503, { estado: 'sin_migracion' }), 'sin_migracion')
  assert.equal(cuboDocumento(200, { estado: 'raro' }), 'fallido')
  assert.equal(cuboDocumento(502, null), 'fallido')
})

test('archivarAdjuntosCompania: uno por llamada; con sin_migracion se para y lo que queda cuenta como no guardado', async () => {
  const llamadas: string[] = []
  const c = await archivarAdjuntosCompania(correo(3), async (b) => { llamadas.push(b.nombre); return { status: 503, json: { estado: 'sin_migracion' } } })
  assert.deepEqual(llamadas, ['d0.pdf'])
  assert.equal(c.sin_migracion, 3)
  assert.equal(c.omitidos, 1)
  const ok = await archivarAdjuntosCompania(correo(2), async () => ({ status: 200, json: { estado: 'guardado', asignado: false } }))
  assert.equal(ok.guardado, 2)
  assert.equal(ok.sin_asignar, 2)
  const red = await archivarAdjuntosCompania(correo(1), async () => { throw new Error('red') })
  assert.equal(red.fallido, 1)
})

test('🛡️ solo avisos de compañía y nunca un correo excluido (segunda llave tras imap.ts)', () => {
  const base = { from: 'mediador@allianz.es', subject: 'Rel. Emisión Producción', texto: 'Adjuntamos', extracto: '' }
  assert.equal(puedeArchivarAdjuntos(base, 'correduria'), true)
  assert.equal(puedeArchivarAdjuntos(base, 'correduria-recibo'), true)
  assert.equal(puedeArchivarAdjuntos(base, 'correduria-informativo'), false)
  assert.equal(puedeArchivarAdjuntos(base, 'ruido'), false)
  assert.equal(puedeArchivarAdjuntos({ ...base, subject: 'Su usuario y contraseña de acceso' }, 'correduria'), false)
  assert.equal(puedeArchivarAdjuntos({ ...base, texto: 'Contraseña: Inventada123' }, 'correduria'), false)
})

const TRIAJE = readFileSync(join(import.meta.dirname, 'triaje.ts'), 'utf8')

test('🪤 triaje: los PDF van DESPUÉS de registrar el aviso del mismo correo, y los omitidos se suman a ilegibles', () => {
  const registro = TRIAJE.indexOf('await registrarEventoCorreoAsegura(evento')
  const archivo = TRIAJE.indexOf('await archivarAdjuntosCompania(correo, documentoCorreoAsegura)')
  assert.ok(registro > 0 && archivo > registro, 'si el PDF va antes, asegura no sabe a qué póliza casó')
  const omitidos = TRIAJE.indexOf('evento = { ...evento, ilegibles: evento.ilegibles + correo.adjuntosCompaniaOmitidos }')
  assert.ok(omitidos > 0 && omitidos < registro, 'los PDF fuera por tope se dicen en el aviso')
  // Nunca de un correo de cliente (gmail que reenvía) y siempre con la llave de exclusión.
  assert.match(TRIAJE, /if \(!clienteRemitente && correo\.adjuntosCompania\?\.length && puedeArchivarAdjuntos\(correo, c\.categoria\)\)/)
})

test('🪤 IMAP fase 2: un correo que no se puede descargar CORTA la pasada en ese UID (no se salta: el cursor lo daría por visto)', () => {
  const imap = readFileSync(join(import.meta.dirname, 'imap.ts'), 'utf8')
  const f2 = imap.slice(imap.indexOf('// Fase 2:'), imap.indexOf('async etiquetar('))
  assert.match(f2, /sobres\.sort\(\(a, b\) => a\.uid - b\.uid\)\s+for \(const sobre of sobres\)/)
  assert.match(f2, /if \(!msg \|\| !msg\.source\) \{ uidCortado = sobre\.uid; break \}/)
  assert.doesNotMatch(f2, /if \(!msg \|\| !msg\.source\) continue/)
})

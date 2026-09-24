import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Cepos del enlace de datos del cliente (24/09/2026). Leen el FUENTE: lo que vigilan vive
// dentro de `Prisma.sql`, donde ni tsc ni el build miran, y así no se arrastra Prisma.
const src = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')

test('el token solo se guarda como huella, nunca en claro', () => {
  assert.match(src, /token_hash[\s\S]*\$\{hashToken\(token\)\}/, 'el insert guarda hashToken(token)')
  assert.doesNotMatch(src, /values \([^)]*\$\{token\}/, 'ningún insert lleva el token en claro')
  assert.match(src, /where token_hash = \$\{hashToken\(token\)\}/, 'se busca por la huella')
})

test('las respuestas se guardan cifradas y no se escriben en la ficha', () => {
  assert.match(src, /encryptField\(JSON\.stringify\(v\.respuestas\)\)/)
  assert.doesNotMatch(src, /update clientes/, 'lo declarado por el enlace no toca la ficha')
})

test('la vista pública por token solo trae de la ficha el DNI y la fecha de nacimiento', () => {
  const publica = src.slice(src.indexOf('async function identidadFicha'), src.indexOf('export type ResultadoDocSolicitud'))
  assert.doesNotMatch(publica, /nombre|apellidos|telefono|email|direccion|poliza|cuenta|iban/i)
  assert.match(publica, /return \{ dni: o\?\.cliente\.dni \?\? null, fechaNacimiento: o\?\.cliente\.fechaNacimiento \?\? null \}/)
  assert.match(publica, /c\.clave === 'dni' \? id\.dni : c\.clave === 'fechaNacimiento' \? id\.fechaNacimiento : null/)
})

test('completar solo vale una vez y dentro de plazo', () => {
  assert.match(src, /where id = \$\{f\.id\}::uuid and estado = 'pendiente' and caduca_at > now\(\)/)
})

test('una oportunidad ya cerrada no recibe datos: el enlace se anula antes de completar', () => {
  const r = src.slice(src.indexOf('export async function responderSolicitud'))
  const guarda = r.search(/o\.estado === 'ganada' \|\| o\.estado === 'perdida'/)
  const completar = r.indexOf("set estado = 'completada'")
  assert.ok(guarda > 0 && guarda < completar, 'la guarda de cerrada va antes de marcar completada')
})

test('los documentos del enlace se archivan en su ficha y lo leído no toca la ficha', () => {
  const sub = src.slice(src.indexOf('export async function subirDocumentoSolicitud'), src.indexOf('/** El cliente manda sus datos'))
  assert.match(sub, /guardarDocumento\(f\.correduriaId/)
  assert.match(sub, /subidoPor: 'cliente'/)
  assert.match(sub, /encryptField\(JSON\.stringify\(nuevas\)\)/, 'lo leído se guarda cifrado')
  assert.doesNotMatch(sub, /update clientes/i)
  assert.match(sub, /documentos_subidos < \$\{MAX_DOCS_SOLICITUD\}/, 'el tope se reserva de forma atómica en el UPDATE')
  assert.ok(sub.indexOf('documentos_subidos < ${MAX_DOCS_SOLICITUD}') < sub.indexOf('leerDocSolicitud('), 'la plaza se reserva antes de gastar IA')
})

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

// 26/10/2026 (lead de hogar de Beatriz): el botón WhatsApp salía SIN enlace porque ya había una solicitud viva y su
// token no se puede repetir. Ahora `reemitir` rota el token de ESA solicitud.
test('reemitir: rota el token de la MISMA solicitud viva (sin insertar otra) y deja rastro en el historial', () => {
  const ins = src.slice(src.indexOf('export async function insertarSolicitud'), src.indexOf('function camposDeFila'))
  const rama = ins.slice(ins.indexOf('if (viva && p.reemitir === true)'), ins.indexOf('if (viva) return'))
  assert.ok(rama.length > 0, 'la rama de reemitir va ANTES de devolver la viva sin token')
  assert.match(rama, /update solicitud_datos set token_hash = \$\{hashToken\(token\)\}\s+where id = \$\{viva\.id\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado = 'pendiente' and caduca_at > now\(\)/)
  // Solo cambia la huella: ni plazo, ni campos, ni borrador, ni `creada_por` (un enlace a ciegas sigue a ciegas).
  const update = rama.slice(rama.indexOf('update solicitud_datos'), rama.indexOf('where id'))
  assert.doesNotMatch(update, /caduca_at|campos|borrador|creada_por|estado|respuestas|lecturas/)
  assert.doesNotMatch(rama, /insert into solicitud_datos/)
  assert.match(rama, /insert into oportunidad_historial[\s\S]*ACCION_ENLACE_REEMITIDO/)
  assert.match(rama, /reemitida: true, token \}/)
})

test('reemitir solo lo pide el corredor (puerto operador); el lead web anónimo nunca rota un enlace', () => {
  const ruta = readFileSync(new URL('../app/api/operador/solicitud-datos/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /\{ reemitir: b\?\.reemitir === true \}/)
  const lead = readFileSync(new URL('./lead-web-solicitud.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(lead, /reemitir/)
})

test('hogar pregunta solo lo que falta: TODO el lado del portal usa `camposVigentes` (lo que se enseña es lo que se acepta)', () => {
  const portal = src.slice(src.indexOf('// ─── Lado del portal'))
  assert.doesNotMatch(portal, /camposDeFila\(/, 'pintar, documento, validar y borrador: con lo sabido oculto')
  for (const fn of ['export async function solicitudPorToken', 'export async function subirDocumentoSolicitud', 'export async function responderSolicitud', 'export async function guardarBorradorSolicitud']) {
    const cuerpo = portal.slice(portal.indexOf(fn), portal.indexOf('\n}\n', portal.indexOf(fn)))
    assert.match(cuerpo, /await camposVigentes\(f\)/, fn)
  }
  const cv = src.slice(src.indexOf('async function camposVigentes'), src.indexOf('function estadoEfectivo'))
  assert.match(cv, /camposHogarSinLoSabido\(campos, await viviendaSabidaDeOportunidad\(f\.correduriaId, f\.oportunidadId\)\)/)
})

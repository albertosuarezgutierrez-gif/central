// Cepos (21/10/2026): la PERSONA DE CONTACTO que recibe por correo el presupuesto del tomador lo VE, pero no firma, no
// elige cuenta, no escribe IBAN ni marca «dato incorrecto». Y el TOMADOR que entra con su código del WhatsApp sigue
// firmando. La decisión es pura (`fichaDeToken`); los cepos de FUENTE vigilan que cada escritura del puente pasa por ella
// ANTES de tocar nada (el módulo con BD no se carga en `node --test`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { TIPO_ACCESO_TERCERO, esAccesoTercero, fichaDeToken, type FilaAccesoToken } from './presupuesto-acceso-tercero.ts'

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const leer = (p: string) => sinComentarios(readFileSync(new URL(p, import.meta.url), 'utf8'))
const aceptacion = leer('./presupuesto-aceptacion.ts')
const codigo = leer('./presupuesto-codigo-whatsapp.ts')
const envio = leer('./envio-presupuesto.ts')
const puente = leer('../app/api/portal/presupuesto/route.ts')

const H = 'a'.repeat(64)
const TOMADOR = 'c0000000-0000-4000-8000-000000000001'
/** El token de un correo a una persona de contacto: marca explícita + código con canal email. */
const tercero: FilaAccesoToken = { clienteId: TOMADOR, canalAviso: 'email', whatsappCodigoHash: H, marcaTercero: true }
/** El token del WhatsApp del TOMADOR. */
const tomadorWhatsapp: FilaAccesoToken = { clienteId: TOMADOR, canalAviso: 'whatsapp_enlace', whatsappCodigoHash: H, marcaTercero: false }

const cuerpoDe = (src: string, firma: string) => {
  const i = src.indexOf(firma)
  assert.ok(i >= 0, `no encuentro «${firma}»`)
  const j = src.indexOf('\nexport ', i + firma.length)
  return src.slice(i, j < 0 ? undefined : j)
}

// ─── La decisión ────────────────────────────────────────────────────────────

test('🪤 firmar con el token de una persona de contacto → sin_permiso (y la firma pasa por esa puerta antes de gastar el código)', () => {
  assert.deepEqual(fichaDeToken(tercero), { estado: 'sin_permiso' })
  const firmar = cuerpoDe(aceptacion, 'export async function firmarAceptacion(')
  const puerta = firmar.indexOf('const b = await base(correduriaId, acceso, presupuestoId, opcionId)')
  assert.ok(puerta > 0 && puerta < firmar.indexOf('gastarCodigoWhatsapp('), 'la puerta va antes de gastar el código del WhatsApp')
  assert.ok(puerta < firmar.indexOf('db.$transaction('), 'y antes de escribir la firma')
})

test('🪤 elegir cuenta / dar un IBAN con el token de una persona de contacto → sin_permiso antes de leer o cifrar la cuenta', () => {
  assert.deepEqual(fichaDeToken({ ...tercero }), { estado: 'sin_permiso' })
  const preparar = cuerpoDe(aceptacion, 'export async function prepararAceptacion(')
  assert.ok(preparar.indexOf('await base(') > 0 && preparar.indexOf('await base(') < preparar.indexOf('cuentaDe('))
  const firmar = cuerpoDe(aceptacion, 'export async function firmarAceptacion(')
  const puerta = firmar.indexOf('await base(')
  assert.ok(puerta > 0 && puerta < firmar.indexOf('encryptField('), 'el IBAN no se cifra para un tercero')
  assert.ok(puerta < firmar.indexOf('update clientes set cuenta_bancaria'), 'ni se escribe en la ficha del tomador')
})

test('🪤 «dato incorrecto» con el token de una persona de contacto → sin_permiso antes de anotar nada', () => {
  assert.deepEqual(fichaDeToken(tercero), { estado: 'sin_permiso' })
  const reportar = cuerpoDe(aceptacion, 'export async function reportarDatosIncorrectos(')
  const puerta = reportar.indexOf('await propio(correduriaId, acceso, presupuestoId)')
  assert.ok(puerta > 0 && puerta < reportar.indexOf('insert into presupuesto_evento'))
})

test('🪤 el TOMADOR con su código del WhatsApp sigue operando con SU ficha (sin regresión)', () => {
  assert.deepEqual(fichaDeToken(tomadorWhatsapp), { estado: 'ok', clienteId: TOMADOR })
})

test('🪤 un token que no es el vigente (o sin código) sigue siendo «ajeno», no «sin permiso»', () => {
  assert.deepEqual(fichaDeToken(null), { estado: 'ajena' })
})

test('🪤 basta la marca explícita, aunque el canal no lo delate', () => {
  assert.equal(esAccesoTercero({ canalAviso: 'whatsapp_enlace', whatsappCodigoHash: H, marcaTercero: true }), true)
})

test('🪤 cinturón: sin marca, «correo CON código» se trata como tercero (fallo cerrado si se pierde la marca)', () => {
  assert.equal(esAccesoTercero({ canalAviso: 'email', whatsappCodigoHash: H, marcaTercero: false }), true)
})

// ─── Que la decisión se use donde toca ──────────────────────────────────────

test('🪤 la ficha del acceso por token sale de `fichaDeToken` (no del presupuesto a pelo)', () => {
  const acc = aceptacion.slice(aceptacion.indexOf('async function fichaDeAcceso'), aceptacion.indexOf('async function base('))
  assert.match(acc, /return fichaDeToken\(await fichaDeTokenWhatsapp\(correduriaId, acceso\.tokenWhatsapp, presupuestoId\)\)/)
  // `base` y `propio` (todas las acciones del puente con token) pasan por ella.
  assert.match(aceptacion.slice(aceptacion.indexOf('async function base(')), /const ficha = await fichaDeAcceso\(correduriaId, acceso, presupuestoId\)/)
  assert.match(aceptacion.slice(aceptacion.indexOf('async function propio(')), /const ficha = await fichaDeAcceso\(correduriaId, acceso, presupuestoId\)/)
})

test('🪤 las cinco acciones del puente que admiten token pasan por base/propio, y sin_permiso es 403', () => {
  for (const [f, puerta] of [
    ['export async function prepararAceptacion(', 'await base('],
    ['export async function pedirCodigoAceptacion(', 'await base('],
    ['export async function firmarAceptacion(', 'await base('],
    ['export async function datosCotizadosDelPresupuesto(', 'await propio('],
    ['export async function reportarDatosIncorrectos(', 'await propio('],
  ] as const) {
    assert.ok(cuerpoDe(aceptacion, f).includes(puerta), `${f} no pasa por ${puerta}`)
  }
  assert.match(puente, /sin_permiso: 403/)
})

test('🪤 la lectura del token trae la marca: evento acceso_tercero con el hash del token VIGENTE', () => {
  const ficha = codigo.slice(codigo.indexOf('export async function fichaDeTokenWhatsapp'), codigo.indexOf('export type MovilDeFicha'))
  assert.match(ficha, /canalAviso: true/)
  assert.match(ficha, /whatsappCodigoHash: true/)
  assert.match(ficha, /marcaTercero: await marcaTerceroDe\(/)
  assert.match(codigo, /tipo: TIPO_ACCESO_TERCERO, detalle: \{ path: \['tokenHash'\], equals: tokenHash \}/)
})

test('🪤 la marca se escribe ANTES del compare-and-swap que activa el token del tercero', () => {
  const ejecutar = cuerpoDe(envio, 'export async function ejecutarAviso(')
  const marca = ejecutar.indexOf('tipo: TIPO_ACCESO_TERCERO')
  const cas = ejecutar.indexOf('const rotado = await db.presupuesto.updateMany(')
  assert.ok(marca > 0 && cas > 0 && marca < cas)
  assert.match(ejecutar.slice(marca - 200, marca + 200), /tokenHash: nuevoHash/)
  assert.equal(TIPO_ACCESO_TERCERO, 'acceso_tercero')
})

test('🪤 invariante del cinturón: el correo al TOMADOR no lleva código; solo el de un tercero', () => {
  assert.match(envio, /const codigoWhatsapp = entrada\.canal === 'whatsapp_enlace' \|\| tercero \? generarCodigo\(\) : null/)
})

test('🪤 el puente dice al portal si el código es de un tercero (para esconder los botones)', () => {
  assert.match(puente, /\{ estado: 'valido', presupuestoId: r\.presupuestoId, tercero: r\.tercero \}/)
})

// ─── Por WhatsApp a una persona de contacto (21/10/2026, idea 4) ────────────────────────────────────────────
// Para verlo en rojo: en `ejecutarAviso` cambia `if (tercero) {` (la marca) por `if (tercero && entrada.canal === 'email') {`
// → falla la 1ª; en `esAccesoTercero` cambia el cinturón a `f.whatsappCodigoHash !== null` → falla la 2ª; quita `|| !movil`
// de la guarda de WhatsApp → falla la 3ª; mete `telefono: tercero.movil` en el `detalle` del `enlace_generado` → falla la 4ª.
const terceroWhatsapp: FilaAccesoToken = { clienteId: TOMADOR, canalAviso: 'whatsapp_enlace', whatsappCodigoHash: H, marcaTercero: true }

test('🪤 WhatsApp a una persona de contacto → firmar con ese token: sin_permiso (la marca se escribe por CUALQUIER canal, antes del CAS)', () => {
  assert.deepEqual(fichaDeToken(terceroWhatsapp), { estado: 'sin_permiso' })
  const ejecutar = cuerpoDe(envio, 'export async function ejecutarAviso(')
  // La marca no depende del canal: el bloque es `if (tercero) { … TIPO_ACCESO_TERCERO … }`.
  assert.match(ejecutar, /if \(tercero\) \{\s*await db\.presupuestoEvento\.create\(\{\s*data: \{ presupuestoId: p\.id, tipo: TIPO_ACCESO_TERCERO, origen: 'corredor', detalle: \{ tokenHash: nuevoHash,/)
  const marca = ejecutar.indexOf('tipo: TIPO_ACCESO_TERCERO')
  const cas = ejecutar.indexOf('const rotado = await db.presupuesto.updateMany(')
  const ramaWhatsappTercero = ejecutar.indexOf("if (entrada.canal === 'whatsapp_enlace' && tercero) {")
  assert.ok(marca > 0 && marca < cas && cas < ramaWhatsappTercero, 'marca → CAS → mensaje al tercero')
  // Si la marca no se escribe, lanza: no hay `.catch` que la convierta en «sigue sin marca».
  assert.doesNotMatch(ejecutar.slice(marca - 200, cas), /\.catch\(/)
})

test('🪤 WhatsApp al TOMADOR sigue firmando: el cinturón no lo confunde con un tercero (sin falso positivo)', () => {
  assert.equal(esAccesoTercero({ canalAviso: 'whatsapp_enlace', whatsappCodigoHash: H, marcaTercero: false }), false)
  assert.deepEqual(fichaDeToken(tomadorWhatsapp), { estado: 'ok', clienteId: TOMADOR })
  // Y el cinturón del correo sigue cerrado.
  assert.equal(esAccesoTercero({ canalAviso: 'email', whatsappCodigoHash: H, marcaTercero: false }), true)
  // La rama del tomador por WhatsApp no escribe ninguna marca.
  const ejecutar = cuerpoDe(envio, 'export async function ejecutarAviso(')
  const ramaTomador = ejecutar.slice(ejecutar.indexOf("  if (entrada.canal === 'whatsapp_enlace') {"), ejecutar.indexOf('const correo = '))
  assert.ok(ramaTomador.length > 0)
  assert.doesNotMatch(ramaTomador, /TIPO_ACCESO_TERCERO|destinatario:/)
})

test('🪤 WhatsApp a un destinatario NO elegible → 409, revalidado en asegura con la regla del MÓVIL antes de escribir nada', () => {
  const preparar = cuerpoDe(envio, 'export async function prepararAviso(')
  assert.match(preparar, /const lectura = await leerDestinatarios\(correduriaId, p\.clienteId, 'whatsapp'\)/)
  assert.match(preparar, /const movil = elegido \? await movilParaChat\(correduriaId, elegido\.clienteId\) : null/)
  assert.match(preparar, /if \(!elegido \|\| !movil\) return error\('destinatario_no_elegible', TEXTO_NO_ELEGIBLE_WHATSAPP\)/)
  assert.doesNotMatch(preparar, /updateMany\(|\.create\(/, 'prepararAviso solo lee')
  const ruta = readFileSync(new URL('../app/api/operador/presupuesto/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /destinatario_no_elegible: 409/)
  // El puerto ya no rechaza (400) un destinatario por WhatsApp: lo valida la regla (409).
  assert.doesNotMatch(ruta, /canal !== 'email'\)\) \{\s*return NextResponse\.json\(\{ estado: 'error', motivo: 'datos_invalidos' \}/)
  assert.match(ruta, /export const PATCH = auditado\(/)
})

test('🪤 el TELÉFONO del tercero solo viaja en el envío: ni en el listado, ni en eventos, historial o auditoría', () => {
  const ejecutar = cuerpoDe(envio, 'export async function ejecutarAviso(')
  const rama = ejecutar.slice(ejecutar.indexOf("if (entrada.canal === 'whatsapp_enlace' && tercero) {"), ejecutar.indexOf("  if (entrada.canal === 'whatsapp_enlace') {"))
  const evento = rama.slice(rama.indexOf("tipo: 'enlace_generado'"), rama.indexOf('await anotarEnvioATercero('))
  assert.ok(evento.length > 0)
  assert.doesNotMatch(evento, /movil|telefono/)
  assert.match(rama, /whatsapp: enlaceWhatsappPresupuesto\(mensaje, tercero\.movil\)/)
  const anotar = envio.slice(envio.indexOf('async function anotarEnvioATercero('), envio.indexOf('async function enlaceDirectoPresupuesto('))
  assert.doesNotMatch(anotar, /\.movil|\.email|telefono/)
  // El listado por WhatsApp no lee números: solo el ESTADO del móvil (`movilDeFicha`), nunca `movilParaChat`.
  const dest = readFileSync(new URL('./destinatarios-presupuesto.ts', import.meta.url), 'utf8')
  const wa = dest.slice(dest.indexOf('async function leerDestinatariosWhatsapp('))
  assert.ok(wa.length > 0)
  assert.doesNotMatch(wa, /movilParaChat|descifrarCampo|telefono:/)
  assert.match(wa, /emails: \{\}/)
})

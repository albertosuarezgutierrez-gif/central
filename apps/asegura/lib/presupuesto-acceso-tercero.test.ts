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

// El cliente pide desde el portal que sus recibos se carguen en otra cuenta (29/09/2026).
//
// La cuenta es donde la compañía carga el dinero: una sesión de 30 días abierta en un móvil ajeno no
// puede bastar para mandar los recibos de otro a una cuenta suya. Estos cepos vigilan, leyendo el
// FUENTE (una pantalla se salta con un curl), que el candado está en el servidor y en su sitio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('POST /api/mis-datos/cuenta canjea el código ANTES de pedir el cambio y lo gasta DESPUÉS', () => {
  const src = sinComentarios(leer('apps/asegura-portal/app/api/mis-datos/cuenta/route.ts'))
  const canje = src.indexOf('comprobarCodigoCambioCuenta(identidad.id, parsed.data.iban, parsed.data.codigo)')
  const corta = src.search(/if \(canje\.estado !== 'valido' \|\| !canje\.iban\) return/)
  const pide = src.indexOf('pedirCambioCuenta(identidad.id, canje.iban)')
  assert.notEqual(canje, -1, 'el cambio de cuenta ya no exige el código')
  assert.notEqual(corta, -1, 'un código no válido no corta la petición')
  assert.ok(canje < pide && corta < pide, 'se pide el cambio ANTES de comprobar el código')
  assert.ok(src.indexOf('await canje.gastar()') > pide, 'el código se gasta antes de saber si se guardó')
  assert.match(src, /requireIdentidad\(\)/, 'la identidad tiene que salir de la cookie')
  assert.doesNotMatch(src, /clienteId|identidadId:\s*parsed/, 'la ficha no la puede decidir el cuerpo')
})

test('el código solo va a un correo VERIFICADO de esta identidad y queda atado a identidad + cuenta', () => {
  const src = sinComentarios(leer('apps/asegura-portal/lib/verificar-cuenta.ts'))
  assert.match(src, /identidadId, tipo: 'email', valorHash: hashCanal\(email\), verificadoEn: \{ not: null \}/,
    'el código se manda a cualquier correo, no al de acceso de esta persona')
  assert.match(src, /hashCanal\(`cambio-cuenta:\$\{identidadId\}:\$\{iban\}`\)/, 'el código no va atado a la identidad y a la cuenta')
  assert.match(src, /intentos: \{ lt: MAX_INTENTOS \}/, 'el intento no se reserva antes de comparar')
})

test('asegura: el puente no acepta clienteId y ni la respuesta ni el historial llevan el IBAN', () => {
  const ruta = sinComentarios(leer('apps/asegura/app/api/portal/cuenta/route.ts'))
  assert.doesNotMatch(ruta, /clienteId/, 'el portal podría escribir en cualquier ficha')
  assert.match(ruta, /puentePortalAutorizado\(req\)/)
  const lib = sinComentarios(leer('apps/asegura/lib/cambio-cuenta.ts'))
  assert.match(lib, /fichaPropiaDe\(correduriaId, identidadId\)/, 'la ficha tiene que salir del vínculo')
  assert.match(lib, /encryptField\(revision\.iban\)/, 'el IBAN se guarda sin cifrar')
  // En el historial y en lo que vuelve al portal, solo la máscara.
  assert.doesNotMatch(lib, /\$\{revision\.iban\}/, 'el IBAN en claro acaba en un texto')
  assert.match(lib, /return \{ estado: 'ok', mascara: revision\.mascara \}/)
})

test('el IBAN completo solo sale por una ruta POST auditada y solo de una pendiente', () => {
  const ruta = sinComentarios(leer('apps/asegura/app/api/operador/cambios-cuenta/iban/route.ts'))
  assert.match(ruta, /export const POST = auditado\(/, 'la consulta del IBAN completo no deja rastro')
  assert.doesNotMatch(ruta, /export (async function|const) GET/, 'un GET se cachea y se comparte en un enlace')
  const lib = sinComentarios(leer('apps/asegura/lib/cambio-cuenta.ts'))
  assert.match(lib, /estado = 'pendiente'`\s*\n\s*if \(!f\)/, 'se puede leer el IBAN de una solicitud ya cerrada')
})

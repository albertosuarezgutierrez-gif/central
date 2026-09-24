import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `POST /api/acceso/solicitar` es PÚBLICO y SIN SESIÓN. Antes de esto escribía
 * una fila en `portal_codigo` y disparaba un envío con cualquier cadena de 3 a
 * 200 caracteres: un amplificador de correo con nuestra factura y nuestro
 * dominio en el remitente.
 *
 * 🪤 Este cepo mide el ORDEN, no la presencia. Un test que solo compruebe que
 * las palabras `rateLimit` y `destinoValido` aparecen en el fichero se pone
 * verde aunque las dos guardas estén DEBAJO del `create` — que es exactamente
 * el fallo que no se vería nunca hasta llegar la factura. Por eso todo se mide
 * por posición dentro del cuerpo del `POST`, y no sobre el fichero entero: las
 * constantes y los `import` están por encima y falsearían cualquier
 * comparación.
 */

const RAIZ = join(import.meta.dirname, '..')
const RUTA = join(RAIZ, 'apps/asegura-portal/app/api/acceso/solicitar/route.ts')

/** El cuerpo del `POST`, que es donde el orden significa algo. */
function cuerpoDelPost(): string {
  const fuente = readFileSync(RUTA, 'utf8')
  const i = fuente.indexOf('export async function POST')
  assert.ok(i > 0, 'no se encontró el handler POST en la ruta')
  const cuerpo = fuente.slice(i)
  assert.ok(cuerpo.length > 200, 'el cuerpo del POST salió sospechosamente corto')
  return cuerpo
}

/** Posición de la primera aparición dentro del cuerpo; falla si no está. */
function pos(cuerpo: string, aguja: string): number {
  const i = cuerpo.indexOf(aguja)
  assert.ok(i >= 0, `no aparece en el cuerpo del POST: ${aguja}`)
  return i
}

test('las dos guardas están ANTES del create y del envío', () => {
  const cuerpo = cuerpoDelPost()

  const create = pos(cuerpo, 'portalCodigo.create')
  const envio = pos(cuerpo, 'enviarCodigo')
  const topeIp = pos(cuerpo, 'rateLimit(')
  const topeDestino = pos(cuerpo, 'portalCodigo.count')

  assert.ok(topeIp < create, 'el tope por IP tiene que ir antes de escribir la fila')
  assert.ok(topeIp < envio, 'el tope por IP tiene que ir antes de enviar')
  assert.ok(topeDestino < create, 'el tope por destino tiene que ir antes de escribir la fila')
  assert.ok(topeDestino < envio, 'el tope por destino tiene que ir antes de enviar')
})

test('el destino se valida ANTES de escribir y de enviar', () => {
  const cuerpo = cuerpoDelPost()
  const validacion = pos(cuerpo, 'destinoValido(')
  assert.ok(validacion < pos(cuerpo, 'portalCodigo.create'), 'validar después de escribir no sirve de nada')
  assert.ok(validacion < pos(cuerpo, 'enviarCodigo'), 'validar después de enviar no sirve de nada')
})

test('los DOS topes existen: el de IP solo no basta', () => {
  const cuerpo = cuerpoDelPost()
  // En Vercel el mapa de `rateLimit` vive en memoria de cada instancia, así que
  // no ve a un abusador repartido. El único global es el que cuenta filas.
  pos(cuerpo, 'rateLimit(')
  pos(cuerpo, 'portalCodigo.count')
})

test('el tope por destino cuenta en una VENTANA, no la tabla entera', () => {
  const cuerpo = cuerpoDelPost()
  const i = pos(cuerpo, 'portalCodigo.count')
  const where = cuerpo.slice(i, i + 300)
  assert.match(where, /creadoEn/, 'sin filtro por fecha el contador crece para siempre y bloquea al cliente de por vida')
  assert.match(where, /gte/, 'el filtro de fecha tiene que ser un «desde»')
})

test('el 429 es su propio código, distinto de 502 y 503', () => {
  const cuerpo = cuerpoDelPost()
  const fuente = readFileSync(RUTA, 'utf8')
  assert.match(fuente, /demasiadas_peticiones/, 'el error tiene que tener nombre propio')
  assert.match(fuente, /status:\s*429/, 'un tope agotado es 429, no 400 ni 502')
  assert.match(fuente, /retry-after/i, 'sin retry-after el cliente no sabe cuándo volver')
  // Los tres siguen siendo distinguibles: son tres situaciones distintas.
  assert.match(cuerpo, /canal_no_disponible/)
  assert.match(cuerpo, /envio_fallido/)
})

test('el canal (503) se comprueba antes de culpar al destino', () => {
  const cuerpo = cuerpoDelPost()
  // Si WhatsApp no está montado el problema es nuestro: no se le dice a la
  // persona que ha escrito mal el móvil ni se le gasta cuota.
  assert.ok(
    pos(cuerpo, 'canal_no_disponible') < pos(cuerpo, 'destinoValido('),
    'primero se mira si el canal existe; luego se juzga lo que ha escrito',
  )
})

test('las dos pantallas traducen los dos errores nuevos', () => {
  // Un 429 sin texto sale como «Ha ocurrido un error» y la persona reintenta,
  // que es justo lo contrario de lo que hay que decirle.
  for (const p of [
    'apps/asegura-portal/app/Entrada.tsx',
    'apps/asegura-portal/app/invitacion/[token]/Invitacion.tsx',
  ]) {
    const fuente = readFileSync(join(RAIZ, p), 'utf8')
    assert.match(fuente, /demasiadas_peticiones:/, `${p} no traduce demasiadas_peticiones`)
    assert.match(fuente, /destino_invalido:/, `${p} no traduce destino_invalido`)
  }
})

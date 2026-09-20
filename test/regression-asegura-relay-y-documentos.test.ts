// Guardián de los DOS agujeros de `apps/asegura` cerrados el 20/09/2026.
//
// 1) 🔴 RELAY DE CORREO. `POST /api/operador/recaptacion/email` mandaba el
//    mensaje a `body.email` —que nunca se comparaba con el correo del cliente—
//    y firmaba `recaptacion_envios.creado_por` + `historial_interno` con
//    `body.actor`. Con el Bearer de operador se podía escribir a cualquier
//    dirección desde `envios.grupoasegura.es` (SPF/DKIM válidos) con asunto y
//    texto libres, y dejar la huella a nombre de quien se quisiera.
//
// 2) 🟠 XSS ALMACENADO. `guardarDocumento()` guardaba `entrada.mime`, el tipo
//    que manda el navegador (y por `/api/portal/documento` lo manda el propio
//    cliente), y `GET /api/operador/documentos/[id]` lo devolvía tal cual,
//    `inline` y sin `nosniff`: un `poliza.pdf` con `Content-Type: text/html` se
//    ejecutaba en nuestro dominio al abrirlo desde `/correduria`.
//
// Lo que se puede probar de verdad (sin Prisma: este job corre sin
// `prisma generate`) se prueba ejecutando la función; lo que vive dentro de un
// `route.ts` o de una consulta se vigila leyendo el FUENTE, como
// `lib/actividad-cartera.test.ts`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { decidirDestinatarioRecaptacion, sinCorreos } from '../apps/asegura/lib/recaptacion-email.ts'
import { mimeDocumento, mimeParaServir } from '../packages/module-seguros/src/documentos.ts'

function fuente(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

const RUTA_EMAIL = 'apps/asegura/app/api/operador/recaptacion/email/route.ts'
const LIB_RECAPTACION = 'apps/asegura/lib/cartera-recaptacion.ts'
const LIB_DOCUMENTOS = 'apps/asegura/lib/cartera-documentos.ts'
const RUTA_DOCUMENTO = 'apps/asegura/app/api/operador/documentos/[id]/route.ts'

/** El cuerpo de una función suelta, para no medir sobre el fichero entero. */
function bloque(rel: string, firma: string): string {
  const s = fuente(rel)
  const i = s.indexOf(firma)
  assert.notEqual(i, -1, `no existe \`${firma}\` en ${rel}`)
  const j = s.indexOf('\n}\n', i)
  return s.slice(i, j === -1 ? undefined : j)
}

/** El cuerpo de `enviarEmailRecaptacion`, para no medir sobre el fichero entero. */
function bloqueEnvioManual(): string {
  const s = fuente(LIB_RECAPTACION)
  const i = s.indexOf('export async function enviarEmailRecaptacion(')
  assert.notEqual(i, -1, 'no existe `enviarEmailRecaptacion`: el envío manual volvió a la ruta')
  const j = s.indexOf('\n// ── Envío en LOTE', i)
  return s.slice(i, j === -1 ? undefined : j)
}

// ── 1) El destinatario NO sale del cuerpo de la petición ───────────────────

test('🔴 el correo del cuerpo no enruta nada: si no es el de la ficha, no se manda', () => {
  const ficha = { estado: 'ok', email: 'cliente@real.es' } as const
  // El caso del ataque: ficha válida, destinatario ajeno.
  assert.deepEqual(decidirDestinatarioRecaptacion(ficha, 'victima@banco.example'), {
    ok: false,
    motivo: 'destinatario_distinto',
    resuelto: 'cliente@real.es',
  })
  // Sin correo declarado se usa el de la ficha, y el declarado que coincide
  // (aunque venga con mayúsculas o espacios) no estorba.
  assert.deepEqual(decidirDestinatarioRecaptacion(ficha, null), { ok: true, to: 'cliente@real.es' })
  assert.deepEqual(decidirDestinatarioRecaptacion(ficha, '  Cliente@Real.ES '), { ok: true, to: 'cliente@real.es' })
})

test('🔴 la baja de correo, el «sin correo» y el «ilegible» no se colapsan ni dejan enviar', () => {
  for (const estado of ['baja_de_correo', 'sin_email', 'ilegible', 'no_encontrado'] as const) {
    assert.deepEqual(
      decidirDestinatarioRecaptacion({ estado }, 'cualquiera@example.com'),
      { ok: false, motivo: estado, resuelto: null },
      `un estado ${estado} no puede acabar en envío`,
    )
  }
})

test('🔴 la ruta no toca `body.email` como destino y el lib resuelve por la ficha', () => {
  const ruta = fuente(RUTA_EMAIL)
  assert.match(ruta, /emailDeclarado/, 'la ruta debe pasar el correo del cuerpo SOLO como declarado')
  assert.doesNotMatch(ruta, /\bto:\s*body\./, 'la ruta no puede usar el cuerpo como destinatario')
  const bloque = bloqueEnvioManual()
  assert.match(bloque, /estadoEmailDeFicha\(/, 'el destinatario tiene que salir de la ficha')
  assert.match(bloque, /decidirDestinatarioRecaptacion\(/)
  assert.match(bloque, /to:\s*destino\.to/, 'se manda a la dirección resuelta, no a la declarada')
  assert.doesNotMatch(bloque, /to:\s*entrada\.email/, 'el correo declarado no puede ser el destino')
})

// ── 2) El actor tampoco sale del cuerpo ────────────────────────────────────

test('🔴 el actor de la huella lo pone el servidor, no el llamante', () => {
  const ruta = fuente(RUTA_EMAIL)
  assert.doesNotMatch(ruta, /body[?.]*\.actor/, 'la ruta no puede leer el actor del JSON')
  assert.doesNotMatch(ruta, /actor\??:\s*string/, 'el actor no puede formar parte del cuerpo aceptado')
  const bloque = bloqueEnvioManual()
  assert.match(bloque, /ACTOR_PUERTO_OPERADOR/, 'la huella se firma con una constante del servidor')
  assert.doesNotMatch(bloque, /entrada\.actor/, 'el actor no puede venir de la entrada')
  // Y lo que se escribe en las dos huellas es esa constante.
  assert.match(bloque, /creado_por\)[\s\S]{0,400}\$\{ACTOR_PUERTO_OPERADOR\}/)
  assert.match(bloque, /anotar\([\s\S]{0,120}ACTOR_PUERTO_OPERADOR/)
})

// ── 3) `guardarDocumento` normaliza el mime con `mimeDocumento` ────────────

test('🟠 `mimeDocumento` es la lista cerrada: un text/html no se guarda como tal', () => {
  assert.equal(mimeDocumento({ type: 'text/html', name: 'evil.html' }), null)
  assert.equal(mimeDocumento({ type: 'image/svg+xml', name: 'x.svg' }), null)
  // El PDF por nombre sigue valiendo (navegadores que mandan '' u octet-stream),
  // pero REETIQUETA: lo que se guarda es `application/pdf`, no el tipo recibido.
  assert.equal(mimeDocumento({ type: 'text/html', name: 'poliza.pdf' }), 'application/pdf')
  assert.equal(mimeDocumento({ type: '', name: 'poliza.pdf' }), 'application/pdf')
  assert.equal(mimeDocumento({ type: 'image/jpeg', name: 'foto.jpg' }), 'image/jpeg')
})

test('🟠 `guardarDocumento` guarda el mime normalizado, nunca el del navegador', () => {
  const lib = fuente(LIB_DOCUMENTOS)
  assert.match(lib, /const mime = mimeDocumento\(\{ type: entrada\.mime, name: entrada\.nombre \}\)/)
  assert.match(lib, /mimeType: mime,/, 'la fila se escribe con el mime de la lista cerrada')
  assert.doesNotMatch(
    lib,
    /mimeType:\s*entrada\.mime/,
    'guardar `entrada.mime` es el agujero: lo elige quien sube el fichero',
  )
})

// ── 4) La ruta de lectura: `attachment` + `nosniff` + lista cerrada ────────

test('🟠 `mimeParaServir` no devuelve nunca un tipo que el navegador ejecute', () => {
  assert.equal(mimeParaServir('text/html'), 'application/octet-stream')
  assert.equal(mimeParaServir('image/svg+xml'), 'application/octet-stream')
  assert.equal(mimeParaServir(null), 'application/octet-stream')
  assert.equal(mimeParaServir('APPLICATION/PDF'), 'application/pdf')
  assert.equal(mimeParaServir('image/png'), 'image/png')
})

test('🟠 el lector pasa el mime guardado otra vez por la lista cerrada', () => {
  // Acotado a `leerDocumento`: el `mime` que `aResumen()` pone en la LISTA es
  // metadato para la pantalla, no una cabecera, y medir sobre el fichero entero
  // lo confundiría con lo que se sirve.
  const leer = bloque(LIB_DOCUMENTOS, 'export async function leerDocumento(')
  assert.match(leer, /mime: mimeParaServir\(f\.mimeType\)/)
  assert.doesNotMatch(leer, /mime: f\.mimeType/, 'el mime guardado no puede volver tal cual a la cabecera')
})

test('🟠 la ruta sirve `attachment` con `nosniff`, nunca `inline`', () => {
  const ruta = fuente(RUTA_DOCUMENTO)
  assert.match(ruta, /'x-content-type-options': 'nosniff'/)
  assert.match(ruta, /content-disposition': `attachment;/)
  assert.doesNotMatch(ruta, /`inline;/, 'servir inline un fichero que subió el cliente es el XSS')
})

// ── Bonus: PII fuera de los logs ───────────────────────────────────────────

test('el rechazo de Resend se registra SIN la dirección de destino', () => {
  assert.equal(
    sinCorreos('Invalid `to` field: victima@banco.example is not a valid email'),
    'Invalid `to` field: «correo oculto» is not a valid email',
  )
  assert.match(fuente('apps/asegura/lib/recaptacion-email.ts'), /sinCorreos\(await res\.text\(\)/)
})

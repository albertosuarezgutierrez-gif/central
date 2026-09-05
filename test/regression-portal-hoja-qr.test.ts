// Guardián de la HOJA de la nevera y su QR (05/09/2026). `node --test`.
//
// Alberto: «crear QR y ahí seleccionas si todas las pólizas, una o algunas… y
// luego se crea el QR», con «el qr se puede borrar y se anularía el acceso».
//
// Lo que protege son las promesas que hacen que un token SIN sesión sea
// aceptable aquí. Si alguna se rompe, nada falla: la hoja sigue saliendo, y lo
// que cambia es cuánto enseña o a quién.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const PAGINA = 'apps/asegura-portal/app/hoja/[token]/page.tsx'
const LIB = 'apps/asegura-portal/lib/hojas.ts'
const PANTALLA = 'apps/asegura-portal/app/(portal)/boveda/HojasQr.tsx'
const SQL = 'apps/asegura-portal/prisma/sql/2026-09-05_portal_hoja_qr.sql'

test('el token NO abre sesión: la página del QR no pone ninguna cookie', () => {
  // 🚨 El reparto es el mismo que en las invitaciones: el token dice QUÉ hoja
  // es, no quién eres. Una página pública que además abriera sesión convertiría
  // un papel de la guantera en una llave del portal entero.
  const src = leer(PAGINA)
  for (const prohibido of ['crearSesion', 'cookies(', 'Set-Cookie', 'ponerCookie']) {
    assert.ok(!src.includes(prohibido), `la hoja pública no puede tocar la sesión (${prohibido})`)
  }
})

test('la hoja NO enseña nada que no vaya impreso en el papel', () => {
  // Prima, recibos y siniestros son de la ficha del portal, que sí pide sesión.
  // Aquí solo va lo que alguien necesita en el arcén: compañía, ramo, qué está
  // asegurado, nº de póliza, vencimiento y a quién llamar.
  const src = leer(PAGINA)
  for (const campo of ['prima', 'recibos', 'siniestros', 'direccionRiesgo', 'dni', 'iban']) {
    assert.doesNotMatch(
      src,
      new RegExp(`\\bp\\.${campo}\\b`, 'i'),
      `la hoja pública no puede pintar ${campo}: no va en el papel y esta página no pide sesión`,
    )
  }
})

test('lo que se enseña se filtra por la cartera de HOY, no por una foto guardada', () => {
  // 🚨 La regla que evita que un imán de nevera mienta a los seis meses: se
  // parte de lo que su dueño puede ver ahora y la selección solo filtra.
  const src = leer(PAGINA)
  assert.match(src, /carteraDeIdentidad\(hoja\.identidadId\)/, 'la hoja tiene que releer la cartera viva')
  assert.match(src, /polizasDeLaHoja\(/, 'la selección FILTRA lo leído; no se pinta la selección guardada')
})

test('el token se guarda HASHEADO, nunca en claro', () => {
  const src = leer(LIB)
  assert.match(src, /tokenHash: hashToken\(token\)/, 'el token va hasheado al escribirlo')
  assert.match(src, /tokenHash: hashToken\(token\)/, 'y también al buscarlo')
  assert.doesNotMatch(
    src,
    /tokenHash:\s*token\b/,
    'una tabla de hojas con sus enlaces legibles es una tabla de llaves',
  )
})

test('los ids del formulario NO se insertan: se filtran contra lo que esa identidad ve', () => {
  // Sin esto, meter el id de la póliza de un desconocido en el JSON la mete en
  // la hoja. No fallaría nada: saldría.
  const src = leer(LIB)
  assert.match(src, /const elegibles = await polizasElegibles\(identidadId\)/)
  assert.match(src, /idsCartera\.has\(id\)/, 'cada id elegido tiene que existir en lo que esa identidad ve')
  assert.match(src, /idsDeclaradas\.has\(id\)/)
})

test('una selección que se queda VACÍA no crea una hoja: sería «todas»', () => {
  // 🚨 En el vocabulario de la tabla, cero filas = TODAS. Crear la hoja igual
  // cuando todo lo elegido resultó ajeno daría el acceso MÁS amplio a quien
  // pidió el más estrecho.
  const src = leer(LIB)
  assert.match(
    src,
    /if \(filas\.length === 0\) return \{ ok: false, error: 'sin_seleccion' \}/,
    'si no queda ninguna fila válida hay que rechazar, no crear una hoja «de todas»',
  )
})

test('anular es un UPDATE filtrado por identidad, no un DELETE', () => {
  const src = leer(LIB)
  assert.match(
    src,
    /updateMany\(\{\s*where: \{ id, identidadId, anuladaEn: null \}/,
    'la identidad va DENTRO del where: comprobar el dueño en la línea siguiente se puede perder',
  )
  assert.doesNotMatch(src, /portalHojaQr\.delete/, 'anular no borra: el papel viejo tiene que poder decir «ya no vale»')
})

test('la BD tampoco concede DELETE sobre las dos tablas', () => {
  // El cepo de código y el de la BD dicen lo mismo a propósito: si alguien
  // «arregla» el primero, el segundo sigue de pie.
  const sql = leer(SQL)
  assert.doesNotMatch(sql, /GRANT[^;]*DELETE[^;]*portal_hoja_qr/i)
  assert.match(sql, /GRANT UPDATE \(anulada_en, ultimo_uso_en\)/, 'el UPDATE va por columnas, no entero')
})

test('la pantalla DICE que «todas» incluye las pólizas futuras', () => {
  // Cepo POSITIVO: sin esta frase, marcar «todas» ensancha el acceso en
  // silencio cada vez que se contrata algo nuevo.
  const src = leer(PANTALLA)
  assert.match(src, /que contrate más adelante/, 'hay que decir que «todas» arrastra las futuras')
})

test('la pantalla DICE que anular no recoge el papel', () => {
  const src = leer(PANTALLA)
  assert.match(
    src,
    /tirar el\s*\n?\s*papel|tirar el papel/,
    'anular corta el acceso; el imán sigue en la nevera y hay que decirlo',
  )
})

test('el enlace del QR exige https y no se inventa un dominio', () => {
  const src = leer('apps/asegura-portal/lib/enlace-hoja.ts')
  assert.match(src, /if \(!base\) return null/, 'sin dominio configurado no hay enlace')
  assert.match(src, /url\.protocol !== 'https:'/, 'el token viaja en la URL: http lo pondría en claro')
})

test('EL PAPEL NO LLEVA NINGÚN DATO: al imprimir se oculta la lista de pólizas', () => {
  // 🚨 Decisión de Alberto (05/09/2026): «el que quiera info tiene que
  // escanear; si pone tlf no entra, y puede que quede obsoleto el tlf».
  //
  // Es el cepo más frágil de esta pieza porque el fallo es INVISIBLE en
  // pantalla: la página sigue enseñándolo todo, y solo al imprimir —o al
  // mirar la vista previa, que casi nadie mira dos veces— se vería que el
  // papel se ha llevado las pólizas, los teléfonos y los números. Nadie se
  // entera hasta que hay un imán en una nevera ajena con los datos de alguien.
  const css = leer('apps/asegura-portal/app/globals.css')
  const i = css.indexOf('@media print')
  assert.ok(i > 0, 'no encuentro el bloque de impresión')
  const bloque = css.slice(i)
  assert.match(
    bloque,
    /\.hoja-polizas,[\s\S]{0,200}?display: none !important/,
    'al imprimir, la lista de pólizas tiene que desaparecer: en el papel no va ningún dato',
  )
  assert.match(bloque, /\.hoja-pie,/, 'el pie con el correo tampoco va al papel')
})

test('la pantalla AVISA de que el papel sale sin datos', () => {
  // Cepo POSITIVO. Sin este aviso, la vista previa —una tarjeta con un QR y
  // nada más— parece un fallo de carga, y el usuario le da a cancelar.
  const src = leer(PAGINA)
  assert.match(src, /hoja-solo-pantalla/, 'tiene que haber un aviso de qué se imprime')
  assert.match(
    src,
    /Al imprimir sale solo la tarjeta/,
    'y tiene que decir con todas las letras que los datos no salen',
  )
})

test('el papel sigue llevando la identificación del mediador', () => {
  // Lo único que NO se quita del papel: no es un dato del cliente, es la
  // identificación de la correduría (art. 19 de la Ley 16/2018) y es lo que
  // hace que la tarjeta parezca de una firma regulada. Sale de `MEDIADOR`,
  // nunca tecleada: dos copias de la clave DGSFP es una copia de más.
  const src = leer(PAGINA)
  assert.match(src, /MEDIADOR\.identidad\.claveDgsfp/, 'la clave DGSFP sale del módulo, no del JSX')
  // 🚨 Se quitan los COMENTARIOS antes de mirar. Sin esto el cepo se muerde a
  // sí mismo: la cabecera que explica por qué la clave no se teclea la escribe
  // literalmente para explicarlo. Mismo remedio que
  // `test/regression-portal-parte-siniestro.test.ts`, y ya van tres veces hoy
  // que un guardián de este portal muerde por una frase de un comentario.
  const sinComentarios = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(sinComentarios, /CS-F\/0170/, 'la clave no se teclea a mano en la pantalla')
})

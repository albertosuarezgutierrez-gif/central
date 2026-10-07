// Guardián del GRABADOR del tarificador RPA (07/10/2026). `node --test`, leyendo el FUENTE.
//
// Lo que tiene que seguir siendo verdad entre piezas que ningún tsc cruza:
//   · BLOQUEO_GRABADOR (packages/module-tarificacion/src/grabador.ts) contiene TODO BLOQUEO_FORMADOR del worker
//     (services/tarificador-rpa/src/formador.ts, fuera del workspace): si el worker bloquea una palabra, el
//     mapa del grabador no puede llamar «seguro» a un botón con ella;
//   · la marca de marcos del grabador es la MISMA que la de las evidencias del worker (evidencia.ts);
//   · el SQL es aditivo: no borra tablas ni columnas, no quita la cuelga de `portal_parte_id`, y revoca DELETE.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

function lista(src: string, nombre: string): string[] {
  const m = src.match(new RegExp(`export const ${nombre} = \\[([^\\]]*)\\] as const`))
  assert.ok(m, `no se encuentra ${nombre}`)
  return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('BLOQUEO_GRABADOR incluye todo BLOQUEO_FORMADOR del worker', () => {
  const formador = lista(leer('services/tarificador-rpa/src/formador.ts'), 'BLOQUEO_FORMADOR')
  const grabador = lista(leer('packages/module-tarificacion/src/grabador.ts'), 'BLOQUEO_GRABADOR')
  assert.ok(formador.length >= 10)
  const faltan = formador.filter((p) => !grabador.includes(p))
  assert.deepEqual(faltan, [], `BLOQUEO_GRABADOR no bloquea: ${faltan.join(', ')}`)
})

test('la marca de marcos del grabador es la de las evidencias del worker', () => {
  const ev = leer('services/tarificador-rpa/src/evidencia.ts')
  const gr = leer('packages/module-tarificacion/src/grabador.ts')
  const marca = (src: string, n: string) => src.match(new RegExp(`const ${n} = '([^']+)'`))?.[1]
  assert.equal(marca(gr, 'MARCA_MARCO'), marca(ev, 'MARCA'))
  assert.equal(marca(gr, 'FIN_MARCA_MARCO'), marca(ev, 'FIN_MARCA'))
})

test('el grabador tapa usuario, login y datos de personas en AMBAS capas (cliente y servidor)', () => {
  const gr = leer('packages/module-tarificacion/src/grabador.ts')
  const bm = leer('packages/module-tarificacion/src/grabador-bookmarklet.ts')
  for (const n of ['PATRON_CAMPO_USUARIO', 'PATRON_CAMPO_PERSONAL', 'PATRON_MEDIADOR', 'MARCA_LOGIN']) {
    assert.match(gr, new RegExp(`export const ${n}\\b`), `grabador.ts ya no exporta ${n}`)
    assert.match(bm, new RegExp(`\\b${n}\\b`), `el bookmarklet no usa ${n}`)
  }
  assert.match(gr, /login && a\.tag !== 'select'/, 'el servidor no tapa los campos de una pantalla de login')
  assert.match(bm, /if \(login && /, 'el bookmarklet no tapa los campos de una pantalla de login')
})

test('el grabador tapa atributos de sesión, UUID y texto de usuario, y avisa de los marcos ilegibles, en AMBAS capas', () => {
  const gr = leer('packages/module-tarificacion/src/grabador.ts')
  const bm = leer('packages/module-tarificacion/src/grabador-bookmarklet.ts')
  for (const n of ['PATRON_ATRIBUTO_SESION', 'PATRON_UUID', 'PATRON_ELEMENTO_USUARIO', 'MAX_TEXTO_ELEMENTO_USUARIO']) {
    assert.match(gr, new RegExp(`export const ${n}\\b`), `grabador.ts ya no exporta ${n}`)
    assert.match(bm, new RegExp(`\\b${n}\\b`), `el bookmarklet no usa ${n}`)
  }
  assert.match(gr, /redactarTextoUsuario\(out\)/, 'el servidor no tapa el texto del usuario')
  assert.match(gr, /PATRON_ATRIBUTO_SESION\.test\(n\)/, 'el servidor no tapa los atributos de sesión')
  assert.match(gr, /replace\(PATRON_UUID/, 'el servidor no tapa los UUID')
  assert.match(bm, /SESION\.test\(n\)/, 'el bookmarklet no tapa los atributos de sesión')
  assert.match(bm, /ELEM_USU\.test/, 'el bookmarklet no tapa el texto del usuario')
  assert.match(bm, /win\.alert\(aviso\)/, 'el bookmarklet no avisa con alert() de los marcos ilegibles')
  assert.match(bm, /urlsSinLeer\.join/, 'la cabecera no lista las URL de los marcos sin leer')
})

test('el grabador tapa titular, ids de portal, ocultos/firmas, imágenes base64 y «Último acceso» en AMBAS capas (fugas de ePAC, 07/10/2026)', () => {
  const gr = leer('packages/module-tarificacion/src/grabador.ts')
  const bm = leer('packages/module-tarificacion/src/grabador-bookmarklet.ts')
  const fo = leer('packages/module-tarificacion/src/formador.ts')
  for (const n of ['PATRON_IMAGEN_BASE64', 'PATRON_ULTIMO_ACCESO']) {
    assert.match(gr, new RegExp(`export const ${n}\\b`), `grabador.ts ya no exporta ${n}`)
    assert.match(bm, new RegExp(`\\b${n}\\b`), `el bookmarklet no usa ${n}`)
  }
  // Id de usuario de portal (AA000000): en PATRONES_PERSONALES, que viajan al navegador por cfg.patrones.
  assert.ok(fo.includes('/\\b[A-Z]{2}\\d{6}\\b/g'), 'PATRONES_PERSONALES ya no tapa el id de usuario de portal')
  // Ocultos por atributo `hidden`, uid/checksum/firma/signature/hash por nombre.
  assert.match(gr, /a\.hidden\) return true/, 'el servidor no trata el atributo hidden como campo oculto')
  assert.match(bm, /hasAttribute\('hidden'\)/, 'el bookmarklet no trata el atributo hidden como campo oculto')
  assert.match(gr, /PATRON_CAMPO_SENSIBLE = \/[^\n]*checksum\|firma\|signature\|hash\|[^\n]*uid/, 'PATRON_CAMPO_SENSIBLE no cubre uid/checksum/firma/signature/hash')
  assert.match(gr, /PATRON_PARAM_SENSIBLE = \/[^\n]*uid\|user\|usuari[^\n]*checksum/, 'PATRON_PARAM_SENSIBLE no cubre uid/user/checksum')
  assert.match(gr, /PATRON_ATRIBUTO_SESION = \/[^\n]*user[^\n]*checksum/, 'PATRON_ATRIBUTO_SESION no cubre los data-* de usuario/firma')
  assert.match(gr, /n === 'data-value'/, 'el servidor no tapa data-value de un campo sensible')
  // Titular: el nombre aprendido del mediador se tapa en TODO el HTML, y el mediador va ANTES que los patrones personales.
  assert.match(gr, /taparNombresAprendidos\(redactarFinalGrabacion\(out\), nombres\)/, 'el servidor no tapa el nombre aprendido en todo el HTML')
  assert.match(gr, /replace\(PATRON_MEDIADOR[\s\S]*?return redactarDatosPersonales\(t\)/, 'el servidor aplica los patrones personales antes que el mediador')
  assert.match(bm, /NOMBRES\.push\(nom\)/, 'el bookmarklet no aprende el nombre del mediador')
  assert.match(bm, /var cuerpo = fin\(partes\.join/, 'el bookmarklet no hace la pasada final (nombres, imágenes, último acceso)')
  assert.match(bm, /replace\(IMG, cfg\.imagenMarca\)/, 'el bookmarklet no quita las imágenes base64')
  assert.match(bm, /replace\(ULT, /, 'el bookmarklet no tapa el último acceso')
  assert.match(gr, /replace\(PATRON_IMAGEN_BASE64, MARCA_IMAGEN_OMITIDA\)/, 'el servidor no quita las imágenes base64')
})

test('grabación automática (v3): separador compartido, redacción POR PANTALLA en servidor, dedupe y panel fuera de la captura', () => {
  const gr = leer('packages/module-tarificacion/src/grabador.ts')
  const bm = leer('packages/module-tarificacion/src/grabador-bookmarklet.ts')
  const reglas = leer('apps/asegura/lib/tarificador-grabaciones-reglas.ts')
  const subida = leer('apps/asegura/lib/tarificador-grabaciones.ts')
  const plat = leer('apps/plataforma/lib/tarificador-grabaciones.ts')
  assert.match(bm, /export const VERSION_GRABADOR = 3\b/)
  assert.match(gr, /export function separarGrabacion\b/)
  // El servidor separa y re-redacta CADA pantalla (no el fichero entero de una vez) y la subida pasa por ahí.
  assert.match(reglas, /for \(const \[i, crudo\] of s\.pantallas\.entries\(\)\)[\s\S]*?redactarHtmlGrabacion\(crudo\)/, 'asegura no re-redacta pantalla a pantalla')
  assert.match(subida, /planificarSubida\(/, 'subirPantalla no pasa por planificarSubida')
  assert.ok(!/redactarHtmlGrabacion\(htmlSubido\)/.test(subida), 'subirPantalla redacta el fichero entero sin separar')
  // Dedupe por huella del HTML redactado, y un solo alert por grabación.
  assert.match(bm, /if \(vistas\[h\]\)/, 'el modo automático ya no deduplica por huella')
  assert.match(bm, /huella\(r\.cuerpo\)/, 'la huella no es la del HTML redactado')
  assert.match(bm, /!avisado/, 'el aviso de marco ilegible ya no sale una sola vez')
  // El indicador no entra en la captura, ni se neutraliza mal el separador dentro de la página.
  assert.match(bm, /clon\.querySelectorAll\('\[data-asegura-grabador\]'\)/, 'el indicador entra en la captura')
  assert.match(bm, /split\(cfg\.sepPantalla\)/, 'una página puede inyectar un separador de pantalla')
  // Misma constante de topes en las tres capas (módulo, asegura, plataforma).
  assert.match(gr, /MAX_BYTES_GRABACION = 32 \* 1024 \* 1024/)
  assert.match(plat, /MAX_BYTES_GRABACION = 32 \* 1024 \* 1024/)
  // Sin almacenamiento del navegador ni red en el modo automático.
  for (const prohibido of [/localStorage|sessionStorage|indexedDB|window\.name|\.cookie\b/, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/]) {
    const auto = bm.slice(bm.indexOf('FUENTE_GRABADOR_AUTO = '), bm.indexOf('/** Código JS del marcador MANUAL'))
    assert.ok(!prohibido.test(auto.replace(/^\s*\/\/.*$/gm, '').replace(/nada de almacenamiento[^\n]*/, '')), String(prohibido))
  }
})

test('el SQL de grabaciones es aditivo, idempotente y sin DELETE para la app', () => {
  const sql = leer('apps/asegura/prisma/sql/2026-10-07b_tarificador_grabaciones.sql')
  const codigo = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
  assert.ok(!/\bDROP\s+(TABLE|COLUMN|SCHEMA)\b/i.test(codigo), 'el SQL no puede borrar tablas ni columnas')
  assert.ok(!/\bDELETE\s+FROM\b|\bTRUNCATE\s+seguros/i.test(codigo), 'el SQL no borra datos')
  for (const m of codigo.matchAll(/CREATE (?:UNIQUE )?(TABLE|INDEX)\s+(\S+\s+\S+\s+\S+)/gi)) assert.match(m[2], /^IF NOT EXISTS/i, `${m[0]} sin IF NOT EXISTS`)
  assert.match(codigo, /ADD COLUMN IF NOT EXISTS tarificador_grabacion_id/)
  const check = codigo.match(/ADD CONSTRAINT documentos_colgado_de_algo CHECK \(([\s\S]*?)\);/)
  assert.ok(check, 'falta el CHECK ampliado')
  for (const c of ['cliente_id', 'poliza_id', 'siniestro_id', 'portal_parte_id', 'tarificador_grabacion_id']) assert.match(check![1], new RegExp(`${c} IS NOT NULL`), `el CHECK pierde ${c}`)
  assert.match(codigo, /ENABLE ROW LEVEL SECURITY/)
  assert.match(codigo, /REVOKE DELETE, TRUNCATE ON seguros\.tarificador_grabaciones, seguros\.tarificador_grabacion_pantallas FROM prisma_seguros/)
  assert.match(sql, /⚠️ (NO )?APLICADA/, "el SQL debe declarar su estado (APLICADA / NO APLICADA)")
})

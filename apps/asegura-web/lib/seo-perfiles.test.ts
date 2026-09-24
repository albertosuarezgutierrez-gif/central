// Guardián de `sameAs` — los perfiles oficiales del negocio en datos estructurados.
//
// Qué es `sameAs` y por qué importa aquí: es la lista de sitios que son EL MISMO
// negocio. Es lo que permite a un buscador entender que la web, el canal de
// YouTube y (cuando esté) la ficha de Google Business no son tres negocios que
// se llaman parecido, sino uno. Con tres dominios propios vivos a la vez
// (`grupoasegura.es`, `app.grupoasegura.com`, la landing de plataforma) y una
// correduría homónima en Montevideo, esa consolidación no es cosmética.
//
// 🚨 Lo que este guardián existe para impedir, en orden de gravedad:
//
//   1. Un ACORTADOR. `share.google/xxxx` es una redirección que puede caducar y
//      que además no dice a qué apunta. En `sameAs` va la URL canónica del
//      perfil, no un enlace que hay que resolver para saber qué se está
//      afirmando.
//   2. Un HOST que no sea de un perfil. `sameAs` afirma identidad: apuntar a un
//      sitio equivocado es declarar que el negocio es otro.
//   3. Una URL de BÚSQUEDA o con parámetros de campaña (`?si=`, `?utm_`). El
//      enlace que comparte una app trae rastreo pegado; el canónico no.
//   4. Un `sameAs: []`. Un array vacío no es «no tiene perfiles», es ruido en la
//      ficha: cuando no hay ninguno, el campo NO se emite. Es la regla del NULL
//      del repo aplicada a datos estructurados — no afirmar lo que no se sabe.
//
// ⚠️ Lo que este guardián NO puede comprobar, y conviene tenerlo escrito: que la
// URL sea de VERDAD el perfil de Alberto. Desde el contenedor no hay salida a
// `youtube.com` ni a `google.com` (el proxy de egress los deniega), así que cada
// perfil entra aquí por su palabra, no por medición. La forma sí se vigila; la
// pertenencia, no.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PERFILES } from './sitio.ts'
import { fichaNegocio } from './seo.ts'

const ACORTADORES = ['share.google', 'goo.gl', 'youtu.be', 'bit.ly', 't.co', 'tinyurl.com', 'g.page']

/** Hosts donde un perfil oficial PUEDE vivir. Cerrada a propósito: se amplía al añadir una red. */
const HOSTS_PERFIL = [
  'www.youtube.com',
  'www.google.com',
  'www.linkedin.com',
  'www.instagram.com',
  'www.facebook.com',
]

test('cada perfil es una URL https absoluta y bien formada', () => {
  for (const p of PERFILES) {
    assert.doesNotThrow(() => new URL(p), `no es una URL: ${p}`)
    assert.equal(new URL(p).protocol, 'https:', `no va por https: ${p}`)
  }
})

test('ningún perfil es un acortador', () => {
  for (const p of PERFILES) {
    const host = new URL(p).hostname
    assert.ok(
      !ACORTADORES.includes(host),
      `${p} es un acortador: en sameAs va la URL canónica del perfil, no una redirección que puede caducar`,
    )
  }
})

test('cada perfil vive en un host de perfil conocido', () => {
  for (const p of PERFILES) {
    const host = new URL(p).hostname
    assert.ok(
      HOSTS_PERFIL.includes(host),
      `${p}: host no reconocido como perfil (${host}). Si es una red nueva, añádela a HOSTS_PERFIL a propósito`,
    )
  }
})

// El enlace que da el botón «compartir» de una app lleva rastreo pegado
// (`?si=`, `?utm_source=`). En `sameAs` va el canónico: si no, la ficha declara
// como identidad del negocio una URL de campaña.
test('ningún perfil arrastra parámetros de rastreo ni es una búsqueda', () => {
  for (const p of PERFILES) {
    const u = new URL(p)
    assert.equal(u.search, '', `${p} lleva parámetros pegados: en sameAs va la URL limpia`)
    assert.ok(!u.pathname.startsWith('/search'), `${p} es una búsqueda, no un perfil`)
  }
})

test('no hay perfiles repetidos', () => {
  const vistos = new Set<string>()
  for (const p of PERFILES) {
    assert.ok(!vistos.has(p), `perfil duplicado: ${p}`)
    vistos.add(p)
  }
})

// 🚨 La regla del NULL en datos estructurados: sin perfiles, el campo NO se
// emite. Un `sameAs: []` afirma «se miró y no hay», que no es lo que se quiere
// decir cuando sencillamente todavía no se han dado de alta.
test('sameAs se emite con los perfiles, y se OMITE cuando no hay ninguno', () => {
  const ficha = fichaNegocio()
  if (PERFILES.length === 0) {
    assert.equal(ficha.sameAs, undefined, 'sin perfiles, sameAs no se emite (nunca un array vacío)')
    return
  }
  assert.deepEqual(ficha.sameAs, [...PERFILES], 'sameAs no coincide con PERFILES')
})

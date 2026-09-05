// Guardián del NAP (nombre, dirección, teléfono).
//
// Google reparte la señal de negocio local entre dos fichas cuando el JSON-LD
// del sitio y el perfil de Google Business no declaran EXACTAMENTE lo mismo.
// Aquí no se puede comprobar el perfil de Google, pero sí lo que estaba a un
// paso de romperlo: que la dirección del JSON-LD estuviera escrita a mano,
// duplicando la de `MEDIADOR`. Lo estaba, y coincidía por suerte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
// Import por ruta con extensión: `node --test` con type-stripping no resuelve
// el barril de `@central/module-seguros` (sus `import './x'` van sin
// extensión). Es una limitación del runner, no del paquete.
import { MEDIADOR } from '../../../packages/module-seguros/src/mediador.ts'
import { fichaNegocio } from './seo.ts'

test('la dirección del JSON-LD SALE del domicilio del mediador', () => {
  const dir = fichaNegocio().address as Record<string, string>
  const dom = MEDIADOR.identidad.domicilio

  // Cada trozo publicado tiene que estar en la cadena de la que se deriva.
  assert.ok(dir.postalCode, 'no se pudo leer el código postal del domicilio')
  assert.ok(dom.includes(dir.postalCode), `CP ${dir.postalCode} ausente en «${dom}»`)
  for (const palabra of dir.streetAddress.split(/[\s,]+/).filter((p) => p.length > 2)) {
    assert.ok(dom.includes(palabra), `«${palabra}» no está en el domicilio «${dom}»`)
  }
})

test('el teléfono y el correo del JSON-LD son los del mediador', () => {
  const f = fichaNegocio()
  assert.equal(f.telephone, MEDIADOR.identidad.telefono)
  assert.equal(f.email, MEDIADOR.identidad.email)
})

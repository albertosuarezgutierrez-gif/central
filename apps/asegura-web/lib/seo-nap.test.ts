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
import { AMBITO } from './sitio.ts'

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

// `areaServed` es dónde se PRESTA el servicio; `address`, dónde está la
// oficina. La ficha declaraba ciudad + comunidad, o sea que afirmaba en datos
// estructurados lo mismo que el copy: que fuera de Andalucía no se atiende.
// Se media en toda España, así que va el país — y la dirección sigue siendo la
// de Sevilla, que es la que tiene que cuadrar con Google Business.
test('la ficha declara ámbito NACIONAL y domicilio en la ciudad de la oficina', () => {
  const f = fichaNegocio()
  const area = f.areaServed as Record<string, string>
  assert.equal(area['@type'], 'Country', 'areaServed no es un país: la ficha acota el servicio')
  assert.equal(area.name, AMBITO.nacional)

  const dir = f.address as Record<string, string>
  assert.equal(dir.addressLocality, AMBITO.ciudad, 'el domicilio de la ficha tiene que seguir siendo el de la oficina (NAP)')
})

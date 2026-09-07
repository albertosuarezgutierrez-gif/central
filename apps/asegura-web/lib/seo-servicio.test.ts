// Guardián del `Service` por ramo y del `knowsAbout` de la ficha del negocio.
//
// Por qué existe. La ficha `InsuranceAgency` dice QUIÉN es la correduría, y las
// páginas de ramo dicen QUÉ hace en cada ramo — pero hasta el 07/09/2026 eso
// último no se declaraba en datos estructurados: las seis páginas eran, para un
// buscador, texto suelto colgando de una ficha de negocio. `Service` es el tipo
// que enlaza las dos cosas (`provider` → `@id` de la ficha), y es lo que permite
// que «seguro de flota» se entienda como un servicio que presta ESTE negocio y
// no como una palabra que aparece en una página.
//
// Y lo segundo que vigila es la trampa que este repo ya conoce: la SEGUNDA
// COPIA. `knowsAbout` era una lista de seis cadenas escritas a mano. Al publicar
// flota, esa lista se quedaba corta sin que fallara nada — la ficha declararía
// que la correduría no sabe de un ramo que tiene página propia, formulario y
// sitio en el pie. Se deriva de `RAMOS`, y aquí se comprueba que se deriva.
import test from 'node:test'
import assert from 'node:assert/strict'
import { RAMOS } from './ramos.ts'
import { fichaNegocio, fichaServicio } from './seo.ts'
import { SITIO_URL, AMBITO } from './sitio.ts'

test('cada ramo publicado emite su ficha Service', () => {
  for (const r of RAMOS) {
    const s = fichaServicio(r)
    assert.equal(s['@type'], 'Service', `${r.slug}: no es un Service`)
    assert.equal(s.url, `${SITIO_URL}/seguros/${r.slug}`, `${r.slug}: la url no apunta a su página`)
    assert.ok(String(s.name).trim().length > 0, `${r.slug}: Service sin nombre`)
  }
})

// El `provider` NO repite la ficha del negocio: la referencia por `@id`. Si se
// duplicara, habría dos descripciones del mismo negocio en la misma página y
// cualquier corrección futura tendría que hacerse en dos sitios — que es el
// fallo que este repo lleva persiguiendo en el NAP.
test('el Service referencia la ficha del negocio por @id, no la duplica', () => {
  for (const r of RAMOS) {
    const s = fichaServicio(r)
    const prov = s.provider as Record<string, unknown>
    assert.equal(prov['@id'], `${SITIO_URL}/#correduria`, `${r.slug}: provider no apunta a la ficha`)
    assert.equal(prov.name, undefined, `${r.slug}: el provider duplica el nombre del negocio`)
    assert.equal(prov.address, undefined, `${r.slug}: el provider duplica el domicilio`)
  }
})

// Mismo ámbito que la ficha: se media en toda España. Un `Service` que declarase
// una ciudad contradiría a su propio `provider`, y dos datos estructurados que
// se contradicen valen menos que uno solo.
test('el Service declara el mismo ámbito nacional que la ficha', () => {
  for (const r of RAMOS) {
    const area = fichaServicio(r).areaServed as Record<string, unknown>
    assert.equal(area['@type'], 'Country', `${r.slug}: areaServed no es un país`)
    assert.equal(area.name, AMBITO.nacional, `${r.slug}: areaServed no es España`)
  }
})

// 🚨 Nada de precio en datos estructurados. `offers`/`price` en una página de
// correduría es exactamente el claim que RDL 3/2020 convierte en asesoramiento,
// y encima sería falso: la prima la fija cada compañía por riesgo.
test('el Service no publica precio ni oferta', () => {
  for (const r of RAMOS) {
    const s = fichaServicio(r)
    for (const campo of ['offers', 'price', 'priceRange', 'priceSpecification']) {
      assert.equal(s[campo], undefined, `${r.slug}: el Service declara ${campo}`)
    }
  }
})

test('knowsAbout se deriva de RAMOS, no es una segunda lista escrita a mano', () => {
  const know = fichaNegocio().knowsAbout as string[]
  assert.equal(know.length, RAMOS.length, `knowsAbout tiene ${know.length} entradas y hay ${RAMOS.length} ramos publicados`)
  for (const r of RAMOS) {
    assert.ok(
      know.some((k) => k.toLowerCase().includes(r.nombre.toLowerCase())),
      `la ficha no declara saber del ramo «${r.nombre}», que tiene página propia`,
    )
  }
})

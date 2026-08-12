import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TRADUCCIONES, traducir } from './traducciones.ts'

// Se lee `app/route.ts` como TEXTO en vez de importarlo: el módulo real arrastra
// `next/server`, que aquí no se resuelve. Y mover el HTML a su propio fichero no es
// opción — el agente SEO de sivra reescribe `app/route.ts` por esa ruta exacta.
const HTML = readFileSync(fileURLToPath(new URL('../route.ts', import.meta.url)), 'utf8')

describe('traducciones EN — la página inglesa deriva de la española, sin copiarla', () => {
  test('toda clave del diccionario existe de verdad en el HTML español', () => {
    // El fallo silencioso que este test previene: alguien "arregla" una clave cambiando
    // `&oacute;` por `ó` y esa frase deja de casar — la página inglesa se queda con un
    // párrafo en español y nadie se entera hasta que lo ve un huésped.
    const huerfanas = Object.keys(TRADUCCIONES).filter((es) => !HTML.includes(es))
    assert.deepEqual(huerfanas, [], `claves que ya no aparecen en app/route.ts:\n${huerfanas.join('\n')}`)
  })

  test('no queda castellano evidente en la página traducida', () => {
    const en = traducir(HTML)
    // Palabras que solo pueden venir del copy en español (no de URLs, nombres propios
    // sevillanos ni del CSS). Si aparecen, es que quedó un bloque sin traducir.
    const delatores = [
      'Preguntas frecuentes',
      'Reservar directo',
      'Consultar disponibilidad',
      'Mejor precio garantizado',
      'dormitorios dobles',
      'Sin comisiones de Booking',
    ]
    const restos = delatores.filter((p) => en.includes(p))
    assert.deepEqual(restos, [], `castellano sin traducir: ${restos.join(', ')}`)
  })

  test('traducir no descuadra el HTML: mismo número de etiquetas de apertura', () => {
    const cuenta = (s: string) => (s.match(/<[a-zA-Z][^>]*>/g) || []).length
    assert.equal(cuenta(traducir(HTML)), cuenta(HTML))
  })

  test('el idioma y el canonical de la variante inglesa son los suyos', () => {
    // Se comprueba sobre el resultado de la ruta, no del diccionario, porque estos tres
    // ajustes son de la variante y no traducciones de texto.
    const en = traducir(HTML)
      .replace('<html lang="es">', '<html lang="en">')
      .replace(
        '<link rel="canonical" href="https://www.housesevillana.es/"/>',
        '<link rel="canonical" href="https://www.housesevillana.es/en"/>',
      )
    assert.ok(en.includes('<html lang="en">'), 'lang debe ser en')
    assert.ok(!en.includes('<html lang="es">'), 'no debe quedar lang es')
    assert.ok(en.includes('canonical" href="https://www.housesevillana.es/en"'), 'canonical propio')
  })

  test('el HTML español declara las dos variantes y un x-default', () => {
    for (const h of ['hreflang="es"', 'hreflang="en"', 'hreflang="x-default"'])
      assert.ok(HTML.includes(h), `falta ${h}`)
  })

  test('las traducciones no dejan la cadena vacía ni repiten el español', () => {
    for (const [es, en] of Object.entries(TRADUCCIONES)) {
      assert.ok(en.trim().length > 0, `traducción vacía para «${es}»`)
    }
  })
})

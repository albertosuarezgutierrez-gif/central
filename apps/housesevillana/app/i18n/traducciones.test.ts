import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { localizar, traducir } from './motor.ts'
import { TRADUCCIONES as EN } from '../en/traducciones.ts'
import { TRADUCCIONES as IT } from '../it/traducciones.ts'

// Se lee `app/route.ts` como TEXTO en vez de importarlo: el módulo real arrastra
// `next/server`, que aquí no se resuelve. Y mover el HTML a su propio fichero no es
// opción — el agente SEO de sivra reescribe `app/route.ts` por esa ruta exacta.
const HTML = readFileSync(fileURLToPath(new URL('../route.ts', import.meta.url)), 'utf8')

const VARIANTES = [
  { codigo: 'en', ogLocale: 'en_GB', diccionario: EN },
  { codigo: 'it', ogLocale: 'it_IT', diccionario: IT },
]

describe('i18n — cada idioma se deriva del español, sin copiar el fichero', () => {
  for (const v of VARIANTES) {
    describe(`variante ${v.codigo}`, () => {
      test('toda clave del diccionario existe de verdad en el HTML español', () => {
        // El fallo silencioso que esto previene: alguien "arregla" una clave cambiando
        // `&oacute;` por `ó` y esa frase deja de casar — la página traducida se queda
        // con un párrafo en español y nadie se entera hasta que lo ve un huésped.
        const huerfanas = Object.keys(v.diccionario).filter((es) => !HTML.includes(es))
        assert.deepEqual(huerfanas, [], `claves ausentes en app/route.ts:\n${huerfanas.join('\n')}`)
      })

      test('no queda castellano evidente tras traducir', () => {
        const out = traducir(HTML, v.diccionario)
        const delatores = [
          'Preguntas frecuentes',
          'Reservar directo',
          'Consultar disponibilidad',
          'Mejor precio garantizado',
          'dormitorios dobles',
          'Sin comisiones de Booking',
        ]
        const restos = delatores.filter((p) => out.includes(p))
        assert.deepEqual(restos, [], `castellano sin traducir: ${restos.join(', ')}`)
      })

      test('traducir no descuadra el HTML: mismo número de etiquetas', () => {
        const cuenta = (s: string) => (s.match(/<[a-zA-Z][^>]*>/g) || []).length
        assert.equal(cuenta(traducir(HTML, v.diccionario)), cuenta(HTML))
      })

      test('lang, canonical y og:locale son los de la variante', () => {
        const out = localizar(HTML, v)
        assert.ok(out.includes(`<html lang="${v.codigo}">`), 'lang de la variante')
        assert.ok(!out.includes('<html lang="es">'), 'no debe quedar lang es')
        assert.ok(
          out.includes(`canonical" href="https://www.housesevillana.es/${v.codigo}"`),
          'canonical propio',
        )
        assert.ok(out.includes(`content="${v.ogLocale}"`), 'og:locale propio')
      })

      test('ninguna traducción está vacía', () => {
        for (const [es, tr] of Object.entries(v.diccionario))
          assert.ok(tr.trim().length > 0, `traducción vacía para «${es}»`)
      })
    })
  }

  test('las variantes cubren exactamente las mismas claves', () => {
    // Si una se queda corta, esa parte de la página saldría en español solo en un idioma
    // — el tipo de diferencia que nadie mira hasta que la ve un huésped concreto.
    assert.deepEqual(Object.keys(EN).sort(), Object.keys(IT).sort())
  })

  test('el HTML español declara todas las variantes y un x-default', () => {
    for (const h of ['hreflang="es"', 'hreflang="en"', 'hreflang="it"', 'hreflang="x-default"'])
      assert.ok(HTML.includes(h), `falta ${h}`)
  })
})

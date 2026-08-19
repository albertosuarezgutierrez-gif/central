import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RUTAS_LOCALIZADAS, localizar, traducir } from './motor.ts'
import { TRADUCCIONES as PORTADA_EN } from '../en/traducciones.ts'
import { TRADUCCIONES as PORTADA_IT } from '../it/traducciones.ts'
import { EN as PARKING_EN, IT as PARKING_IT } from '../parking/traducciones.ts'

// Las páginas se leen como TEXTO, no se importan. Dos motivos distintos que llevan al mismo
// sitio: `app/route.ts` arrastra `next/server`, que aquí no se resuelve; y el resto importa
// `../reservas` sin extensión —como manda Next— que el runner de Node tampoco resuelve.
// No es una limitación: todo lo que comprueba este fichero son operaciones sobre cadenas,
// así que el texto crudo sirve igual. (Mover el HTML de la portada a otro fichero NO es
// opción: el agente SEO de sivra la reescribe por esa ruta exacta.)
const leer = (ruta: string) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8')
const PORTADA = leer('../route.ts')
const PARKING = leer('../parking/contenido.ts')

const IDIOMAS = [
  { codigo: 'en', ogLocale: 'en_GB' },
  { codigo: 'it', ogLocale: 'it_IT' },
] as const

const META = {
  en: { title: 'EN title', description: 'EN description', ogDescription: 'EN og' },
  it: { title: 'IT title', description: 'IT description', ogDescription: 'IT og' },
} as Record<string, { title: string; description: string; ogDescription: string }>

const PAGINAS = [
  {
    nombre: 'portada',
    ruta: '',
    html: PORTADA,
    dicc: { en: PORTADA_EN, it: PORTADA_IT } as Record<string, Record<string, string>>,
    // Frases que SOLO pueden quedar si el diccionario se ha dejado un trozo sin cubrir.
    delatores: [
      'Preguntas frecuentes',
      'Reservar directo',
      'Consultar disponibilidad',
      'Mejor precio garantizado',
      'dormitorios dobles',
      'no hay comisi&oacute;n de Booking',
    ],
  },
  {
    nombre: 'parking',
    ruta: '/parking',
    html: PARKING,
    dicc: { en: PARKING_EN, it: PARKING_IT } as Record<string, Record<string, string>>,
    delatores: [
      'Preguntas frecuentes',
      'Consultar disponibilidad',
      'Plaza de garaje privada',
      'Aparcas dentro del edificio',
      'Zona de Bajas Emisiones de Sevilla es únicamente',
    ],
  },
]

describe('i18n — cada idioma se deriva del español, sin copiar el fichero', () => {
  for (const p of PAGINAS) {
    describe(`página ${p.nombre}`, () => {
      for (const idioma of IDIOMAS) {
        const diccionario = p.dicc[idioma.codigo]
        const v = { ...idioma, diccionario, ruta: p.ruta }

        describe(`variante ${idioma.codigo}`, () => {
          test('toda clave del diccionario existe de verdad en el HTML español', () => {
            // El fallo silencioso que esto previene: alguien "arregla" una clave cambiando
            // `&oacute;` por `ó` y esa frase deja de casar — la página traducida se queda
            // con un párrafo en español y nadie se entera hasta que lo ve un huésped.
            const huerfanas = Object.keys(diccionario).filter((es) => !p.html.includes(es))
            assert.deepEqual(huerfanas, [], `claves ausentes en el HTML:\n${huerfanas.join('\n')}`)
          })

          test('no queda castellano evidente tras traducir', () => {
            const out = traducir(p.html, diccionario)
            const restos = p.delatores.filter((f) => out.includes(f))
            assert.deepEqual(restos, [], `castellano sin traducir: ${restos.join(', ')}`)
          })

          test('traducir no descuadra el HTML: mismo número de etiquetas', () => {
            const cuenta = (s: string) => (s.match(/<[a-zA-Z][^>]*>/g) || []).length
            assert.equal(cuenta(traducir(p.html, diccionario)), cuenta(p.html))
          })

          test('lang, canonical, og:url y og:locale son los de la variante', () => {
            const out = localizar(p.html, v)
            const destino = `https://www.housesevillana.es/${idioma.codigo}${p.ruta}`
            assert.ok(out.includes(`<html lang="${idioma.codigo}">`), 'lang de la variante')
            assert.ok(!out.includes('<html lang="es">'), 'no debe quedar lang es')
            assert.ok(out.includes(`rel="canonical" href="${destino}"`), 'canonical propio')
            assert.ok(out.includes(`property="og:url" content="${destino}"`), 'og:url propio')
            assert.ok(out.includes(`content="${idioma.ogLocale}"`), 'og:locale propio')
          })

          test('los enlaces internos llevan el prefijo de idioma', () => {
            // Sin esto, un visitante inglés que pulsa «Home» o «Parking» cae en la página
            // española y ahí se acaba la visita. El 72% del tráfico real navega en inglés.
            const out = localizar(p.html, v)
            for (const r of RUTAS_LOCALIZADAS) {
              assert.ok(!out.includes(`href="${r}"`), `enlace sin prefijar: href="${r}"`)
            }
          })

          test('ninguna traducción está vacía', () => {
            for (const [es, tr] of Object.entries(diccionario))
              assert.ok(tr.trim().length > 0, `traducción vacía para «${es}»`)
          })
        })
      }

      test('los delatores siguen existiendo en el HTML español', () => {
        // Sin esto, la prueba de arriba se vuelve HUECA sin avisar: un delator que ya no
        // está en el HTML no puede sobrevivir a `traducir`, así que la asercion pasa sin
        // haber mirado nada. Pasó el 19/08/2026 — al reescribir el copy desapareció
        // «Sin comisiones de Booking» y la guarda llevaba días pasando en vacío.
        const fantasmas = p.delatores.filter((f) => !p.html.includes(f))
        assert.deepEqual(fantasmas, [], `delatores que ya no existen (cámbialos por frases vivas):\n${fantasmas.join('\n')}`)
      })

      test('las variantes cubren exactamente las mismas claves', () => {
        // Si una se queda corta, esa parte de la página saldría en español solo en un idioma
        // — el tipo de diferencia que nadie mira hasta que la ve un huésped concreto.
        assert.deepEqual(Object.keys(p.dicc.en).sort(), Object.keys(p.dicc.it).sort())
      })

      test('el HTML español declara todas las variantes y un x-default', () => {
        for (const h of ['hreflang="es"', 'hreflang="en"', 'hreflang="it"', 'hreflang="x-default"'])
          assert.ok(p.html.includes(h), `falta ${h}`)
      })
    })
  }

  test('toda ruta localizada tiene su página en cada idioma', () => {
    // RUTAS_LOCALIZADAS prefija enlaces; prefijar una ruta que no existe traducida sería
    // mandar al huésped a un 404 desde el propio menú.
    const rutas = PAGINAS.map((p) => p.ruta || '/')
    for (const r of RUTAS_LOCALIZADAS) assert.ok(rutas.includes(r), `${r} se prefija pero no hay página`)
  })

  describe('`meta` sobrevive a la reescritura semanal del agente SEO', () => {
    // El agente de sivra (`lib/seo-landing.ts`) reescribe title/description/og de
    // `app/route.ts` cada lunes. Si esas frases fueran claves de diccionario, la primera
    // pasada dejaría la portada inglesa con el título en castellano y nadie se enteraría
    // hasta ver el resultado en Google. Esto simula esa pasada.
    const comoLoDejaElAgente = PORTADA
      .replace(/<title>[^<]*<\/title>/, '<title>Titular nuevo que ha elegido el agente</title>')
      .replace(/(<meta name="description" content=")[^"]*"/, '$1Descripción nueva del agente"')
      .replace(/(<meta property="og:title" content=")[^"]*"/, '$1Titular nuevo que ha elegido el agente"')
      .replace(/(<meta property="og:description" content=")[^"]*"/, '$1Og nuevo del agente"')

    for (const idioma of IDIOMAS) {
      test(`la portada ${idioma.codigo} mantiene sus metadatos`, () => {
        const meta = META[idioma.codigo]
        const out = localizar(comoLoDejaElAgente, {
          ...idioma,
          diccionario: PAGINAS[0].dicc[idioma.codigo],
          meta,
        })
        assert.ok(out.includes(`<title>${meta.title}</title>`), 'title de la variante')
        assert.ok(out.includes(`name="description" content="${meta.description}"`), 'description')
        assert.ok(out.includes(`property="og:title" content="${meta.title}"`), 'og:title')
        assert.ok(
          out.includes(`property="og:description" content="${meta.ogDescription}"`),
          'og:description',
        )
        for (const castellano of ['Titular nuevo que ha elegido el agente', 'Descripción nueva del agente', 'Og nuevo del agente'])
          assert.ok(!out.includes(castellano), `se ha colado el español: ${castellano}`)
      })
    }
  })

  test('el sitemap publica cada página en sus tres idiomas', () => {
    const xml = readFileSync(fileURLToPath(new URL('../sitemap.xml/route.ts', import.meta.url)), 'utf8')
    for (const p of PAGINAS) {
      const base = `https://www.housesevillana.es${p.ruta || '/'}`
      assert.ok(xml.includes(`<loc>${base}</loc>`), `falta ${base} en el sitemap`)
      for (const { codigo } of IDIOMAS) {
        const alt = `https://www.housesevillana.es/${codigo}${p.ruta}`
        assert.ok(xml.includes(`<loc>${alt}</loc>`), `falta ${alt} en el sitemap`)
      }
    }
  })
})

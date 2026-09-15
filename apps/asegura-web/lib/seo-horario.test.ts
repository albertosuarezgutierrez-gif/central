// Guardián del horario de atención.
//
// El horario se publica en DOS sitios que nadie compara: el `texto` que lee una
// persona en la web y el `schema` que lee Google en el JSON-LD. Cambiar uno y
// olvidar el otro no rompe nada: la página sigue pintando, el JSON-LD sigue
// siendo válido, y lo único que pasa es que Google anuncia un horario en el que
// no hay nadie. Es el mismo fallo que el `openingHours` inventado que este
// código evitó durante meses, solo que por desincronización en vez de por
// invención.
//
// Por eso aquí no se comprueba que el horario sea «el correcto» (eso lo dice
// Alberto, no un test): se comprueba que las dos copias digan LA MISMA HORA.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fichaNegocio } from './seo.ts'
import { HORARIO } from './sitio.ts'

/** `Mo-Fr 09:00-18:00` → días y tramo. Formato de schema.org/openingHours:
 * si un día no aparece, el negocio está CERRADO ese día — por eso el fin de
 * semana no se declara en vez de declararse vacío. */
const FORMATO = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))? (\d{2}:\d{2})-(\d{2}:\d{2})$/

const SEMANA = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

/** Los mismos días como los escribe una persona en castellano. El texto del pie
 * está en castellano y el schema en inglés abreviado, así que sin esta tabla
 * «Lunes a sábado» contra `Mo-Fr` pasaría por sincronizado. */
const EN_CASTELLANO: Record<string, (typeof SEMANA)[number]> = {
  lunes: 'Mo', martes: 'Tu', miercoles: 'We', jueves: 'Th',
  viernes: 'Fr', sabado: 'Sa', sabados: 'Sa', domingo: 'Su', domingos: 'Su',
}

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Expande `Mo-Fr` a los cinco días. Un rango que se compara como cadena no
 * detecta que el texto diga «lunes a sábado» y el schema `Mo-Fr`. */
function diasDe(desde: string, hasta: string | undefined): string[] {
  const i = SEMANA.indexOf(desde as (typeof SEMANA)[number])
  const j = hasta ? SEMANA.indexOf(hasta as (typeof SEMANA)[number]) : i
  assert.ok(i >= 0 && j >= i, `rango de días inválido: «${desde}${hasta ? '-' + hasta : ''}»`)
  return SEMANA.slice(i, j + 1)
}

type Tramo = { dias: string[]; horas: string[] }

function tramoDe(entrada: string): Tramo {
  const m = FORMATO.exec(entrada)
  assert.ok(m, `«${entrada}» no tiene el formato de schema.org/openingHours (p. ej. «Mo-Fr 09:00-18:00»)`)
  return { dias: diasDe(m[1], m[2]), horas: [m[3], m[4]] }
}

/** `9:00` y `09.00` son la misma hora escritas de dos formas; se normalizan a
 * `HH:MM` para poder compararlas con las del schema. Los MINUTOS cuentan: una
 * versión anterior de este cepo solo miraba la hora y daba por sincronizado un
 * texto que decía «9:30» contra un schema que declaraba `09:00`. */
function horasDelTexto(texto: string): string[] {
  return [...texto.matchAll(/(\d{1,2})[:.](\d{2})/g)].map((m) => `${m[1].padStart(2, '0')}:${m[2]}`)
}

function diasDelTexto(texto: string): string[] {
  const palabras = sinTildes(texto).split(/[^a-z]+/)
  const codigos = palabras.map((p) => EN_CASTELLANO[p]).filter(Boolean) as string[]
  // «Lunes a viernes» son los extremos de un rango, no dos días sueltos.
  if (codigos.length === 2 && /\ba\b/.test(sinTildes(texto))) return diasDe(codigos[0], codigos[1])
  return codigos
}

const unicos = (xs: string[]): string[] => [...new Set(xs)].sort()

test('el JSON-LD publica el horario cuando HORARIO existe, y lo omite cuando no', () => {
  const ficha = fichaNegocio()
  if (!HORARIO) {
    assert.equal('openingHours' in ficha, false, 'sin horario confirmado no se declara: un horario inventado hace que alguien llame y no le cojan')
    return
  }
  assert.deepEqual(ficha.openingHours, [...HORARIO.schema])
})

test('cada entrada de HORARIO.schema tiene el formato que Google entiende', () => {
  if (!HORARIO) return
  assert.ok(HORARIO.schema.length > 0, 'un horario declarado con cero tramos es un horario que no dice nada')
  for (const entrada of HORARIO.schema) tramoDe(entrada)
})

// El cepo de verdad: el texto de la web y el schema del JSON-LD no pueden
// decir horas distintas. Se comparan las HORAS, no las cadenas — el texto está
// en castellano («de 9:00 a 18:00») y el schema en el formato de schema.org.
test('el texto que lee una persona y el schema que lee Google dicen LA MISMA hora', () => {
  if (!HORARIO) return
  const tramos = HORARIO.schema.map(tramoDe)
  const delSchema = unicos(tramos.flatMap((t) => t.horas))
  const delTexto = unicos(horasDelTexto(HORARIO.texto))
  assert.ok(delTexto.length > 0, `el texto «${HORARIO.texto}» no declara ninguna hora: no se puede contrastar con el JSON-LD`)
  assert.deepEqual(
    delTexto,
    delSchema,
    `el texto de la web y el openingHours del JSON-LD declaran horas distintas — texto: «${HORARIO.texto}», schema: ${JSON.stringify(HORARIO.schema)}`
  )
})

// Y los MISMOS días. Un texto que diga «lunes a sábado» sobre un schema `Mo-Fr`
// manda a alguien a la oficina un sábado: el error de horario que más cara sale
// no es media hora, es un día entero que no existe.
test('el texto y el schema declaran LOS MISMOS días', () => {
  if (!HORARIO) return
  const delSchema = unicos(HORARIO.schema.map(tramoDe).flatMap((t) => t.dias))
  const delTexto = unicos(diasDelTexto(HORARIO.texto))
  assert.ok(delTexto.length > 0, `el texto «${HORARIO.texto}» no nombra ningún día: no se puede contrastar con el JSON-LD`)
  assert.deepEqual(
    delTexto,
    delSchema,
    `el texto de la web y el openingHours del JSON-LD declaran días distintos — texto: «${HORARIO.texto}», schema: ${JSON.stringify(HORARIO.schema)}`
  )
})

// Y el otro lado del contrato: que el horario se VEA. `HORARIO.texto` existía
// sin que nadie lo pintara, así que la web seguía diciendo «horario de oficina»
// mientras el JSON-LD ya declaraba `Mo-Fr 09:00-18:00`. Un dato que solo ve
// Google no se lo cree nadie: Google contrasta lo que hay en la página con lo
// que dice el marcado.
test('el pie pinta el horario LEYÉNDOLO de HORARIO, y ninguna página lo teclea a mano', () => {
  const raiz = new URL('../', import.meta.url)
  const fuentes = ['app', 'components']
    .flatMap((dir) => readdirSync(new URL(dir, raiz), { recursive: true, encoding: 'utf8' }).map((f) => `${dir}/${f}`))
    .filter((f) => f.endsWith('.tsx'))

  const layout = readFileSync(new URL('app/layout.tsx', raiz), 'utf8')
  if (!HORARIO) {
    assert.equal(/\b\d{1,2}:\d{2}\b/.test(layout), false, 'sin horario confirmado el pie no puede anunciar una hora')
    return
  }
  assert.match(layout, /HORARIO\.texto/, 'el pie no pinta HORARIO.texto: el horario se publicaría solo en el JSON-LD')

  // Se barren TODAS las páginas, no solo el pie: un horario tecleado en
  // «quiénes somos» se queda viejo igual, y ahí nadie lo va a buscar. Se quitan
  // antes los comentarios, para que un aviso que NOMBRA una hora no dispare el
  // cepo — el mismo cuidado que ya se tuvo en `ramos.test.ts`.
  // Las horas se separan con DOS PUNTOS, no con punto: `[:.]` aquí daba por
  // «horario tecleado a mano» el `5.25-1.38` de un `path` de SVG.
  const RANGO = /\b\d{1,2}:\d{2}\s*(?:a|-|–|hasta)\s*\d{1,2}:\d{2}/
  for (const f of fuentes) {
    const codigo = readFileSync(new URL(f, raiz), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const aMano = RANGO.exec(codigo)
    assert.equal(aMano, null, `${f} escribe un horario a mano («${aMano?.[0]}»): esa copia se queda vieja sin que nada falle, y HORARIO deja de ser la única`)
  }
})

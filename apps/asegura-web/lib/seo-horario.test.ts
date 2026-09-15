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
import { readFileSync } from 'node:fs'
import { fichaNegocio } from './seo.ts'
import { HORARIO } from './sitio.ts'

/** `Mo-Fr 09:00-18:00` → días y tramo. Formato de schema.org/openingHours:
 * si un día no aparece, el negocio está CERRADO ese día — por eso el fin de
 * semana no se declara en vez de declararse vacío. */
const FORMATO = /^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))? (\d{2}):(\d{2})-(\d{2}):(\d{2})$/

function horasDe(entrada: string): number[] {
  const m = FORMATO.exec(entrada)
  assert.ok(m, `«${entrada}» no tiene el formato de schema.org/openingHours (p. ej. «Mo-Fr 09:00-18:00»)`)
  return [Number(m[4]), Number(m[6])]
}

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
  for (const entrada of HORARIO.schema) horasDe(entrada)
})

// El cepo de verdad: el texto de la web y el schema del JSON-LD no pueden
// decir horas distintas. Se comparan las HORAS, no las cadenas — el texto está
// en castellano («de 9:00 a 18:00») y el schema en el formato de schema.org.
test('el texto que lee una persona y el schema que lee Google dicen LA MISMA hora', () => {
  if (!HORARIO) return
  const delSchema = new Set(HORARIO.schema.flatMap(horasDe))
  const delTexto = new Set(
    [...HORARIO.texto.matchAll(/(\d{1,2})[:.](\d{2})/g)].map((m) => Number(m[1]))
  )
  assert.ok(delTexto.size > 0, `el texto «${HORARIO.texto}» no declara ninguna hora: no se puede contrastar con el JSON-LD`)
  assert.deepEqual(
    [...delTexto].sort((a, b) => a - b),
    [...delSchema].sort((a, b) => a - b),
    `el texto de la web y el openingHours del JSON-LD declaran horas distintas — texto: «${HORARIO.texto}», schema: ${JSON.stringify(HORARIO.schema)}`
  )
})

// Y el otro lado del contrato: que el horario se VEA. `HORARIO.texto` existía
// sin que nadie lo pintara, así que la web seguía diciendo «horario de oficina»
// mientras el JSON-LD ya declaraba `Mo-Fr 09:00-18:00`. Un dato que solo ve
// Google no se lo cree nadie: Google contrasta lo que hay en la página con lo
// que dice el marcado.
test('el pie de la web pinta el horario LEYÉNDOLO de HORARIO, no tecleado a mano', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  if (!HORARIO) {
    assert.equal(/\d{1,2}[:.]\d{2}/.test(layout), false, 'sin horario confirmado el pie no puede anunciar una hora')
    return
  }
  assert.match(layout, /HORARIO\.texto/, 'el pie no pinta HORARIO.texto: el horario se publicaría solo en el JSON-LD')
  const aMano = layout.match(/\d{1,2}[:.]\d{2}\s*(a|-|–)\s*\d{1,2}[:.]\d{2}/)
  assert.equal(aMano, null, `el pie escribe un horario a mano («${aMano?.[0]}»): esa copia se queda vieja sin que nada falle`)
})

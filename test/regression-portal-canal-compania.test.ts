// Cepos del canal de la compañía EN LA PANTALLA.
//
// Las reglas puras ya tienen su test (`packages/module-seguros-portal/src/
// canal-compania.test.ts`). Esto vigila lo que un test de módulo no puede ver:
// que la pantalla no deshaga la regla al pintarla. Los tres fallos que persigue
// no rompen nada, no dan error y solo se descubren cuando alguien acaba de
// tener un golpe:
//
//   1. un WhatsApp con `href="tel:"` — la llamada no falla, suena y no contesta nadie
//   2. un «24 h» escrito a mano sobre un horario que no tenemos
//   3. que la compañía sin datos verificados desaparezca en silencio de la pantalla

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const RAIZ = new URL('..', import.meta.url).pathname

/** Sin comentarios: si no, el guardián se muerde a sí mismo (los comentarios EXPLICAN la prohibición). */
function codigoSinComentarios(ruta: string): string {
  return readFileSync(`${RAIZ}${ruta}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
}

const PANTALLA = 'apps/asegura-portal/app/(portal)/boveda/ParteSiniestro.tsx'

test('un WhatsApp NUNCA se pinta con un enlace `tel:`', () => {
  const src = codigoSinComentarios(PANTALLA)
  // El `href` de una vía de WhatsApp sale de `via.enlace`, que el módulo puro
  // ya construyó y validó. Un `tel:` construido a mano en la rama del WhatsApp
  // es el fallo: la llamada no da error, da un tono que no contesta nadie.
  const ramaWhatsapp = src.slice(src.indexOf("via.tipo === 'whatsapp'"), src.indexOf('const que ='))
  assert.ok(ramaWhatsapp.length > 0, 'No se encuentra la rama del WhatsApp: ¿se ha renombrado?')
  assert.doesNotMatch(
    ramaWhatsapp,
    /href=\{?`?tel:/,
    'La rama del WhatsApp no puede llevar un href `tel:`. Que un fijo publicado como WhatsApp ' +
      'Business atienda además voz es probable, y «probable» no es lo que se le ofrece marcar a ' +
      'alguien que acaba de tener un golpe.',
  )
  assert.match(ramaWhatsapp, /href=\{via\.enlace\}/, 'El enlace tiene que salir de `via.enlace`, ya validado.')
})

test('el bloque del canal NUNCA promete «24 h»', () => {
  // No existe ni un dato en `companias_dgs` que signifique «siempre»: solo
  // `horario_siniestros`, que puede ser NULL. Escribirlo a mano convierte un
  // «no lo sé» en la promesa que se rompe un sábado por la noche.
  //
  // ⚠️ El cepo se acota a las funciones del canal a propósito. Un barrido por
  // todo el portal cazaba «formato de 24 h» del campo de la hora del siniestro,
  // que no es una promesa de nadie — y un guardián con falsos positivos es un
  // guardián que el siguiente desactiva.
  const src = codigoSinComentarios(PANTALLA)
  const ini = src.indexOf('function CanalesCompania')
  const fin = src.indexOf('export function ParteSiniestro')
  assert.ok(ini > 0 && fin > ini, 'No se encuentra el bloque del canal: ¿se ha renombrado o movido?')
  assert.doesNotMatch(
    src.slice(ini, fin),
    /\b24\s*[hH](oras)?\b|siempre|todo el d[ií]a/,
    'El bloque del canal no puede afirmar que una compañía atiende siempre. Solo se pinta ' +
      '`via.horario` cuando lo hay, y cuando no lo hay se calla.',
  )
})

test('la compañía SIN teléfono verificado sigue apareciendo, y dice «pídenoslo»', () => {
  // Cepo POSITIVO: sin esto, la forma más fácil de «arreglar» la pantalla es
  // filtrar las compañías sin datos — y entonces desaparecen en silencio, que
  // se lee como «con esa no hay nada que hacer».
  const src = codigoSinComentarios(PANTALLA)
  assert.match(
    src,
    /TEXTO_SIN_CANAL/,
    'Alguien tiene que pintar el texto de la ausencia. Si no lo usa nadie, la pantalla pasa todos ' +
      'los casos sin datos sencillamente callándose.',
  )
  assert.match(src, /canal\.sinDatos/, 'La pantalla tiene que preguntar por `sinDatos`, no por `vias.length`.')
  assert.doesNotMatch(
    src,
    /no tiene tel[eé]fono|no dispone de tel[eé]fono/i,
    'Afirmar que la compañía no tiene teléfono convierte un «no lo hemos verificado» en un hecho.',
  )
})

test('la lista de compañías se compone con el helper puro, no a ojo en el JSX', () => {
  const src = codigoSinComentarios(PANTALLA)
  assert.match(
    src,
    /canalesDeLasPolizas\(/,
    'Deduplicar y decidir qué compañías se enseñan es una regla con test propio (las `sinDatos` se ' +
      'quedan, las sin nombre se caen). Rehacerla en el JSX la deja sin cepo.',
  )
  // 🚨 Y no basta con LLAMARLO: hay que no deshacerlo después. Este cepo se
  // escribió porque el anterior NO mordió — se probó la mutación
  // `canalesDeLasPolizas(...).filter((c) => !c.sinDatos)` y los cinco tests
  // seguían en verde, mientras las compañías sin teléfono verificado
  // desaparecían de la pantalla en silencio. Un cepo que no se ha visto morder
  // es una suposición.
  const tras = src.slice(src.indexOf('canalesDeLasPolizas('))
  assert.doesNotMatch(
    tras.slice(0, 200),
    /\.filter\(/,
    'No se filtra lo que devuelve `canalesDeLasPolizas`. Quitar las `sinDatos` las hace desaparecer ' +
      'de la pantalla, y eso se lee como «con esa compañía no hay nada que hacer» — cuando lo cierto ' +
      'es que no lo hemos verificado.',
  )
})

test('el camino de la compañía NO está detrás del botón de abrir el formulario', () => {
  // Es la decisión de diseño entera: quien tiene prisa no puede tener que
  // abrir «dar parte», desplegar un selector y elegir una póliza para
  // descubrir a quién llama.
  const src = readFileSync(`${RAIZ}${PANTALLA}`, 'utf8')
  const canal = src.indexOf('<CanalesCompania')
  const form = src.indexOf('{abierto && (')
  assert.ok(canal > 0, 'No se pinta `<CanalesCompania>` en la pantalla.')
  assert.ok(
    canal < form,
    'El bloque de la compañía tiene que ir ANTES del formulario. Es el aviso que de verdad abre el ' +
      'siniestro; el nuestro no lo abre.',
  )
})

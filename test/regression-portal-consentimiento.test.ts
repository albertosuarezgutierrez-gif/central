import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Bloque legal 0.3 — la acreditación del art. 19 LDS al canjear el código.
 *
 * 🚨 Lo que protege este fichero es una PAREJA, no una función: el portal
 * escribe una fila en `seguros.portal_consentimiento` diciendo «se le enseñó la
 * información del mediador», y eso solo es cierto mientras la pantalla de
 * entrada se lo enseñe de verdad. Separar las dos mitades no rompe nada visible
 * —los tests pasan, la UI se ve igual— y convierte el registro en una prueba
 * fabricada, que es peor que no tener registro.
 */

const RUTA = 'apps/asegura-portal/app/api/acceso/verificar/route.ts'
const PANTALLA = 'apps/asegura-portal/app/page.tsx'
const PRIVACIDAD = 'apps/asegura-portal/app/legal/privacidad/page.tsx'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('el canje del código escribe la acreditación lds_art19', () => {
  const src = leer(RUTA)
  assert.match(src, /portalConsentimiento\.create/, 'el canje ya no registra nada')
  assert.match(src, /tipo: 'lds_art19'/)
  assert.match(src, /versionTexto: VERSION_TEXTOS_LEGALES/, 'la fila tiene que sellar la versión del texto')
})

test('la fila se sella con la versión del texto, no con una cadena a mano', () => {
  // Una versión copiada aquí se queda vieja en silencio el día que cambie el
  // texto, y entonces la acreditación diría que se aceptó algo que no era.
  const src = leer(RUTA)
  assert.match(src, /from '@central\/module-seguros'/)
  assert.ok(!/versionTexto: '20\d\d-/.test(src), 'la versión está copiada a mano en vez de importada')
})

test('la acreditación va DENTRO de la transacción del canje', () => {
  // Fuera de ella, un fallo al escribir la prueba dejaría un acceso concedido
  // sin constancia de que se informó — y desde fuera se ve igual que uno bueno.
  const src = leer(RUTA)
  const tx = src.indexOf('prisma.$transaction')
  const create = src.indexOf('portalConsentimiento.create')
  assert.ok(tx !== -1 && create > tx, 'el create tiene que ir dentro del $transaction')
})

test('la pantalla de entrada dice lo que se acredita, con los tres enlaces', () => {
  // Esta es la mitad que hace verdadera la fila. Si desaparece, el registro
  // acredita algo que no ocurrió.
  const src = leer(PANTALLA)
  assert.match(src, /nota-legal/, 'no queda nota legal en la pantalla de entrada')
  assert.match(src, /\/legal\/mediador/, 'falta el enlace a la información del mediador')
  assert.match(src, /\/legal\/condiciones/, 'falta el enlace a las condiciones de uso')
  assert.match(src, /\/legal\/privacidad/, 'falta el enlace a la política de privacidad')
})

test('la pantalla avisa de que se guardan IP y navegador', () => {
  // Guardar la IP sin decirlo es tratar un dato personal sin informar (art. 13
  // RGPD), y encima en la pantalla donde se presume que se informa de todo.
  const src = leer(PANTALLA)
  assert.match(src, /IP/, 'la pantalla no dice que se guarda la IP')
  assert.match(src, /navegador/i, 'la pantalla no dice que se guarda el navegador')
})

test('la política de privacidad declara ese registro y su base legal', () => {
  const src = leer(PRIVACIDAD)
  assert.match(src, /constancia de que se te informó/i, 'la política no menciona el registro')
  assert.match(src, /art\. 19 de la Ley 16\/2018/, 'falta la base legal del registro')
})

test('no se registran «avisos» ni «comercial»: no hay casilla que los pida', () => {
  // Decisión, no descuido: escribirlos con otorgado:true sin que nadie los haya
  // marcado sería fabricar un consentimiento. Si algún día se piden, será con su
  // casilla en la UI y en el mismo PR — y entonces este test se cambia a mano.
  const src = leer(RUTA)
  assert.ok(!/tipo: 'comercial'/.test(src), 'se ha colado un consentimiento comercial sin pedirlo')
  assert.ok(!/tipo: 'avisos'/.test(src), 'se ha colado un consentimiento de avisos sin pedirlo')
})

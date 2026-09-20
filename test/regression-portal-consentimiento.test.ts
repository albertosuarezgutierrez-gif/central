import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

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
// 📌 El formulario de entrada se movió de `app/page.tsx` a `app/Entrada.tsx` el
// 05/09/2026: la raíz pasó a ser un componente de SERVIDOR que mira si ya hay
// sesión (ver la cabecera de `app/page.tsx`). El cepo sigue al fichero — si un
// día vuelve, el `leer()` falla y se entera alguien.
const PANTALLA = 'apps/asegura-portal/app/Entrada.tsx'
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

test('el canje del código NO registra «avisos» ni «comercial»: entrar no es consentir', () => {
  // Decisión, no descuido: escribirlos con otorgado:true sin que nadie los haya
  // marcado sería fabricar un consentimiento. `comercial` SÍ tiene casilla desde
  // el 19/09/2026 — pero en «Mis datos», nunca en el canje del código.
  const src = leer(RUTA)
  assert.ok(!/tipo: 'comercial'/.test(src), 'se ha colado un consentimiento comercial en el canje del código')
  assert.ok(!/tipo: 'avisos'/.test(src), 'se ha colado un consentimiento de avisos sin pedirlo')
})

test('«comercial» se escribe SOLO desde su ruta, y esa ruta exige sesión, no acepta el tipo del cuerpo y sella la versión', () => {
  const ruta = leer('apps/asegura-portal/app/api/consentimiento/route.ts')
  assert.match(ruta, /requireIdentidad\(\)/, 'la ruta no resuelve la sesión')
  assert.match(ruta, /tipo: 'comercial'/, 'la ruta no escribe el tipo comercial')
  assert.ok(!/tipo:\s*cuerpo|tipo:\s*\(cuerpo|cuerpo\.tipo/.test(ruta), 'la ruta acepta el tipo desde el cuerpo: cualquiera fabricaría avisos')
  assert.match(ruta, /versionTexto: VERSION_TEXTO_COMERCIAL/, 'la fila no sella la versión del texto marcado')
  assert.match(ruta, /identidad\.corredor/, 'la vista de corredor podría consentir por el cliente')
  // Ningún OTRO fichero del portal escribe una fila comercial.
  const ficheros = execSync('git ls-files apps/asegura-portal', { encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && f !== 'apps/asegura-portal/app/api/consentimiento/route.ts')
  // LEER filas comerciales (la bóveda, para pintar la casilla) es legítimo; lo
  // que no puede haber fuera de la ruta es un `create` con ese tipo.
  for (const f of ficheros) {
    assert.ok(
      !/portalConsentimiento\.create\([\s\S]{0,400}?tipo: 'comercial'/.test(leer(f)),
      `${f} escribe un consentimiento comercial fuera de su ruta`,
    )
  }
})

test('la casilla comercial nace DESMARCADA y usa el texto del módulo, no una copia', () => {
  const src = leer('apps/asegura-portal/app/(portal)/boveda/ConsentimientoComercial.tsx')
  assert.match(src, /useState\(inicial === true\)/, 'la casilla no nace desmarcada cuando nunca se preguntó')
  assert.match(src, /TEXTO_CONSENTIMIENTO_COMERCIAL/, 'la casilla no usa el texto del módulo')
  assert.ok(!/defaultChecked|checked=\{true\}/.test(src), 'casilla premarcada')
})

test('la política de privacidad declara la finalidad comercial con su base (6.1.a) y que la casilla nace sin marcar', () => {
  const src = leer(PRIVACIDAD)
  assert.match(src, /6\.1\.a RGPD/, 'falta la base legal del consentimiento comercial')
  assert.match(src, /nace sin\s+marcar/i, 'la política no dice que la casilla nace desmarcada')
})

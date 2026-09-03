// Guardián de la pantalla «Retarificar» de `apps/asegura`. `node --test`.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Esta pantalla llegó a producción afirmando DOS cosas falsas a la vez, y las
// dos del mismo tipo: un «no lo sé» convertido en un «no lo hay».
//
//  1. «La compañía manda la matrícula pero no el modelo.» Falso: las 80 pólizas
//     de auto vivas traen matrícula, marca Y modelo (medido el 02/09/2026, y
//     confirmado sobre la póliza real de la matrícula `0432GLT`: SMART FORFOUR).
//     Lo único que no trae ninguna es la VERSIÓN. Con esa frase, la pantalla
//     obligaba a teclear de cero un dato que ya estaba en la BD.
//
//  2. El aviso «Tarificación apagada» y el botón «Pedir precio — cuesta 0,50€»
//     se pintaban SIEMPRE, aunque el servidor tuviera `CODEOSCOPIC_SIMULACION`
//     puesta. Pero en `cotizar()` la simulación es el paso 0 y va ANTES del
//     interruptor de gasto: con ella el botón cotiza, gratis y sin llamar a
//     ninguna compañía. O sea, la pantalla decía «esto está apagado y cuesta
//     medio euro» de algo que estaba encendido y era gratis.
//
// Ninguna de las dos daba error. Por eso hay cepo: lo que se rompe en silencio
// se protege con un test, no con un comentario.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PANTALLA = 'apps/asegura/app/(usuario)/cartera/poliza/[polizaId]'

const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')

test('el tipo de póliza declara el vehículo que la ficha SÍ conoce', () => {
  const src = leer('apps/asegura/lib/codeoscopic/desde-cartera.ts')
  assert.match(src, /export type VehiculoConocido = \{/)
  assert.match(src, /vehiculo: VehiculoConocido/)
  // Las tres piezas, y la versión en plural: una matrícula puede traer varias
  // candidatas contradictorias y ninguna es «el dato».
  assert.match(src, /marca: string \| null/)
  assert.match(src, /modelo: string \| null/)
  assert.match(src, /versiones: VersionCandidata\[\]/)
})

test('la versión viaja con su procedencia: es una pista, no un dato', () => {
  const src = leer('apps/asegura/lib/codeoscopic/desde-cartera.ts')
  assert.match(src, /export type VersionCandidata = \{/)
  assert.match(src, /procedencia: string/)
})

test('el lector rellena marca, modelo y versiones desde la cartera', () => {
  const src = leer('apps/asegura/lib/cartera-ficha.ts')
  assert.match(src, /async function vehiculoDePoliza\(/)
  // Marca y modelo pueden estar en la póliza o en su copia gemela del volcado.
  assert.match(src, /texto\(datos\?\.marca\) \?\? texto\(datosGemela\?\.marca\)/)
  assert.match(src, /texto\(datos\?\.modelo\) \?\? texto\(datosGemela\?\.modelo\)/)
  // Y siempre filtrado por correduría: con BYPASSRLS, un id ajeno no falla —
  // devuelve el coche de otro.
  assert.match(src, /p\.correduria_id = \$\{correduriaId\}::uuid/)
})

test('la pantalla recibe el vehículo y el estado de simulación', () => {
  const src = leer(`${PANTALLA}/page.tsx`)
  assert.match(src, /vehiculo=\{origen\.poliza\.vehiculo\}/)
  assert.match(src, /simulacion=\{simulacionActiva\(process\.env\)\}/)
})

test('la simulación sale del ENTORNO del servidor, nunca de la petición', () => {
  const src = leer(`${PANTALLA}/page.tsx`)
  // `simulacionActiva(process.env)`: si el interruptor pudiera venir del
  // cliente, cualquiera podría hacer que la app enseñara precios inventados.
  assert.match(src, /simulacionActiva\(process\.env\)/)
  assert.doesNotMatch(src, /simulacion=\{(?!simulacionActiva\(process\.env\)).*searchParams/)
})

test('el componente usa el interruptor en vez de ignorarlo', () => {
  const src = leer(`${PANTALLA}/retarificador.tsx`)
  assert.match(src, /simulacion/)
})

test('no vuelve la frase que negaba la marca y el modelo', () => {
  for (const f of [`${PANTALLA}/retarificador.tsx`, `${PANTALLA}/page.tsx`]) {
    assert.doesNotMatch(
      leer(f),
      /matr[ií]cula pero no el modelo/i,
      `${f} vuelve a decir que la compañía no manda el modelo, y sí lo manda`,
    )
  }
})

// ─── El combustible, que es obligatorio y no lo era en el código ─────────────
//
// 03/09/2026, en producción: el desplegable de versiones salía vacío y con un
// 400 crudo del vendor encima. `/car/brands/{id}/models/{id}/vehicles` exige el
// parámetro `engine`, también en AUTO — la doc del portal decía que ahí era
// «texto libre» y se leyó como «opcional». Sin versiones no hay código Base7, y
// sin código Base7 no se puede cotizar: el fallo dejaba la pantalla inútil.

test('las versiones se piden con el combustible, que el vendor exige', () => {
  const src = leer('apps/asegura/lib/codeoscopic/catalogos.ts')
  assert.match(src, /vehicles\?engine=\$\{encodeURIComponent\(motor\)\}/)
  // Y el valor sale de su catálogo, no de un literal nuestro: si mañana añaden
  // un combustible, el desplegable lo trae solo.
  assert.match(src, /export async function tiposDeMotor\(/)
  assert.match(src, /'\/car\/engine-types'/)
})

test('el puerto rechaza una petición de versiones sin motor, con su nombre', () => {
  // 03/09/2026: el `switch` de catálogos se extrajo a `lib/retarificar-cartera.ts`
  // (`resolverCatalogo`) porque ahora lo sirven DOS rutas — la de sesión de
  // asegura y `/api/operador/codeoscopic/catalogos`, que es la que consume
  // `plataforma` → `/correduria`. Una copia del switch que se quedara sin esta
  // guarda no daría error: dejaría el desplegable de versiones vacío otra vez.
  const src = leer('apps/asegura/lib/retarificar-cartera.ts')
  assert.match(src, /const motor = params\.get\('motor'\)/)
  assert.match(src, /if \(!marcaId \|\| !modeloId \|\| !motor\)/)
})

test('el combustible NO se adivina del código de la ficha', () => {
  // La ficha guarda `combustible: "1"`, que es un código EIAC de otro catálogo.
  // Traducirlo a ojo sería inventar el motor de un coche real — la regla del
  // repo sobre los valores de cajón, aplicada a un desplegable.
  const src = leer(`${PANTALLA}/retarificador.tsx`)
  assert.doesNotMatch(src, /vehiculo\.combustible/)
  assert.match(src, /motorId/)
})

// ─── La prima que estaba y se pintaba como «—» ──────────────────────────────
//
// 03/09/2026, primera simulación real: la tabla de precios enseñaba «—» en las
// tres primas mientras `seguros.tarificacion_precios` guardaba 49,60€, 68,80€ y
// 84,80€. El componente declaraba su propio tipo `Precio` con `primaAnual` y el
// backend manda `primaEur` (`lib/codeoscopic/respuesta.ts`). Como TODOS los
// campos del tipo local son opcionales, el desajuste no produjo ni un error de
// tipos: solo un dato real convertido en «no lo sé», que es la mentira que este
// repo persigue.

test('la pantalla lee el nombre que manda el backend para la prima', () => {
  const src = leer(`${PANTALLA}/retarificador.tsx`)
  assert.match(src, /primaEur\?: number \| null/)
  assert.match(src, /eur\(p\.primaEur\)/)
  assert.doesNotMatch(
    src,
    /p\.primaAnual/,
    'vuelve a leerse `primaAnual`, que el backend no manda: la prima saldría como «—»',
  )
})

test('el backend sigue llamándola `primaEur` — si cambia, este cepo lo dice', () => {
  const src = leer('apps/asegura/lib/codeoscopic/respuesta.ts')
  assert.match(src, /primaEur: number/)
})

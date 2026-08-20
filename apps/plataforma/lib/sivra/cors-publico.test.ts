import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cabecerasCors } from './cors-publico.ts'

test('la cabecera permisiva es un comodin fijo, porque la respuesta se cachea en el CDN', () => {
  // El CDN de Vercel guarda UNA copia y no cachea por `Origin` (medido en produccion el
  // 20/08/2026: ignora `Vary: Origin` e incluso la elimina de lo que entrega). Con un valor fijo
  // da igual que copia guarde: todas sirven a cualquier navegador.
  assert.deepEqual(cabecerasCors(), { 'Access-Control-Allow-Origin': '*' })
})

test('las cabeceras no dependen de NADA de la peticion', () => {
  // Es la invariante entera del modulo. Si algun dia esta funcion vuelve a aceptar un argumento
  // que cambie su salida, el calendario se rompe por tercera vez de la misma forma.
  assert.equal(cabecerasCors.length, 0)
  assert.deepEqual(cabecerasCors(), cabecerasCors())
})

test('el endpoint publico NO lee el Origin de la peticion', () => {
  // Guardian de texto: el fallo no vivia en el helper sino en que la RUTA ramificaba por origen.
  // Se lee el fuente porque importarlo arrastraria Prisma y `next/server`.
  const ruta = readFileSync(
    new URL('../../app/api/publico/disponibilidad/route.ts', import.meta.url),
    'utf8',
  )
  assert.ok(
    !/headers\.get\(\s*['"]origin['"]\s*\)/i.test(ruta),
    'la ruta publica no puede ramificar por Origin: su respuesta se cachea en el CDN',
  )
})

test('el endpoint publico sigue cacheandose (si esto cambia, revisa el comodin)', () => {
  // El comodin es seguro PORQUE el endpoint no lee sesion. Si alguien le pone `no-store` es que
  // paso a devolver algo variable, y entonces toca revisar tambien las cabeceras CORS.
  const ruta = readFileSync(
    new URL('../../app/api/publico/disponibilidad/route.ts', import.meta.url),
    'utf8',
  )
  assert.ok(/s-maxage=\d+/.test(ruta), 'se esperaba una respuesta cacheable en el CDN')
})

test('la cache del CDN no se le sirve tambien al navegador como copia reutilizable', () => {
  // La segunda mitad del incidente del 20/08/2026: `s-maxage` SIN `max-age` deja la vida util de
  // la copia privada a la heuristica del navegador, y `stale-while-revalidate` le autoriza ademas
  // a servir la suya vieja hasta una hora. Con una copia guardada rota, la pagina sigue rota
  // aunque el endpoint ya no lo este — y desde el servidor no hay forma de verlo.
  const ruta = readFileSync(
    new URL('../../app/api/publico/disponibilidad/route.ts', import.meta.url),
    'utf8',
  )
  const cache = /const CACHE = '([^']+)'/.exec(ruta)?.[1]
  assert.ok(cache, 'no se encontro la constante CACHE')
  assert.match(cache, /max-age=0/, 'el navegador debe revalidar en cada carga')
  assert.match(cache, /must-revalidate/, 'sin esto el navegador puede servir su copia vieja')
  assert.ok(
    !cache.includes('stale-while-revalidate'),
    'stale-while-revalidate no se puede pedir solo para el CDN: autoriza al navegador a servir lo viejo',
  )
})

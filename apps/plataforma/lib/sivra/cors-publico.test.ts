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

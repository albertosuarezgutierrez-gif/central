import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { productoRelevante } from './logo-compania.ts'

test('el producto que solo repite el ramo no se pinta; el que distingue, sí', () => {
  assert.equal(productoRelevante('Mapfre', 'Mapfre Motos'), null)
  assert.equal(productoRelevante('Allianz', 'Allianz Autos'), null)
  assert.equal(productoRelevante('Occident', 'Occident GCO Motos 3.0'), 'GCO Motos 3.0')
  assert.equal(productoRelevante('Reale', null), null)
})

test('con logo no se repite el nombre de la compañía (Alberto, 28/09/2026)', () => {
  const src = readFileSync(new URL('../app/(usuario)/correduria/CeldaCompania.tsx', import.meta.url), 'utf8')
  // El nombre solo va en la rama SIN logo; con logo viaja como alt/title.
  assert.match(src, /logo \? \([\s\S]*<img[\s\S]*\) : \([\s\S]*\{compania \?\? '—'\}/)
  assert.doesNotMatch(src, /<div style=\{\{ fontWeight: 700[^}]*\}\}>\{compania/)
})

test('moto y coche nuevos no pintan dos listas de precios abiertas seguidas', () => {
  for (const f of ['moto-nuevo/MotoNuevo.tsx', 'auto-nuevo/AutoNuevo.tsx']) {
    const src = readFileSync(new URL(`../app/(usuario)/correduria/cliente/[id]/${f}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /<table/, `${f}: la tabla de precios se salía del móvil`)
    assert.match(src, /<ListaPreciosPlegada/, `${f}: con «Qué verá el cliente» la lista de emitir va plegada`)
  }
})

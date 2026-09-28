import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decidirCiudad } from './codigo-postal-auto.ts'

const TABLA = JSON.parse(readFileSync(new URL('./municipios-por-cp.json', import.meta.url), 'utf8')) as Record<string, string>
const muni = (cp: string) => TABLA[cp]?.split('|') ?? null

test('tabla: CP de la captura y casos conocidos', () => {
  assert.deepEqual(muni('41011'), ['Sevilla'])
  assert.deepEqual(muni('41807'), ['Espartinas'])
  assert.deepEqual(muni('28001'), ['Madrid'])
  assert.ok(muni('09640')!.length > 5, '09640 lo comparten muchos municipios')
  assert.ok(Object.keys(TABLA).length > 11000)
  assert.equal(muni('99999'), null)
})

test('tabla: artículos pospuestos reordenados', () => {
  assert.deepEqual(muni('35001'), ['Las Palmas de Gran Canaria'])
  assert.ok(!Object.values(TABLA).some((v) => /, (La|El|Los|Las)(\||$)/.test(v)))
})

test('un municipio → se pone, pise lo que pise', () => {
  assert.deepEqual(decidirCiudad(['Sevilla'], 'ESPARTINAS'), { ciudad: 'Sevilla', elegir: false })
})

test('varios → respeta la escrita si es una de ellas (sin tildes ni mayúsculas)', () => {
  assert.deepEqual(decidirCiudad(['Hortigüela', 'Villoruebo'], 'HORTIGUELA'), { ciudad: 'Hortigüela', elegir: false })
})

test('varios y la escrita no casa → vacía y obliga a elegir', () => {
  assert.deepEqual(decidirCiudad(['Hortigüela', 'Villoruebo'], 'Sevilla'), { ciudad: '', elegir: true })
  assert.deepEqual(decidirCiudad(['Hortigüela', 'Villoruebo'], ''), { ciudad: '', elegir: true })
})

test('CP desconocido → no se toca nada', () => {
  assert.equal(decidirCiudad(null, 'Sevilla'), null)
  assert.equal(decidirCiudad([], 'Sevilla'), null)
})

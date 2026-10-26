import test from 'node:test'
import assert from 'node:assert/strict'
import { consultaCatalogoPortal } from './catalogo-vehiculo-portal.ts'

const MOTO = ['Gasoline', 'Diesel', 'Others']
const q = (o: Record<string, string>) => consultaCatalogoPortal(new URLSearchParams(o), MOTO)

test('solo marca → modelo → combustible → versión, de coche o de moto; nada más', () => {
  assert.deepEqual(Object.fromEntries((q({ ramo: 'auto', paso: 'marcas' }) as { params: URLSearchParams }).params), { tipo: 'marcas' })
  assert.deepEqual(Object.fromEntries((q({ ramo: 'moto', paso: 'modelos', marcaId: '12' }) as { params: URLSearchParams }).params), { tipo: 'modelos-moto', marcaId: '12' })
  assert.deepEqual(Object.fromEntries((q({ ramo: 'auto', paso: 'versiones', marcaId: '7', modeloId: '88', motor: 'Gasolina' }) as { params: URLSearchParams }).params), { tipo: 'versiones', marcaId: '7', modeloId: '88', motor: 'Gasolina' })
  // Moto: combustibles fijos, sin consultar; y un motor fuera del enum no pasa.
  assert.deepEqual((q({ ramo: 'moto', paso: 'motores' }) as { fijos: { id: string }[] }).fijos.map((x) => x.id), MOTO)
  assert.equal(q({ ramo: 'moto', paso: 'versiones', marcaId: '7', modeloId: '8', motor: 'Kerosene' }), null)
  // Fuera de la lista: ni fecha por matrícula, ni otro ramo, ni ids con forma rara.
  assert.equal(q({ ramo: 'auto', paso: 'fecha-matriculacion', matricula: '1234BCD' }), null)
  assert.equal(q({ ramo: 'hogar', paso: 'marcas' }), null)
  assert.equal(q({ ramo: 'auto', paso: 'modelos' }), null)
  assert.equal(q({ ramo: 'auto', paso: 'modelos', marcaId: '../x?y' }), null)
  assert.ok(q({ ramo: 'auto', paso: 'versiones', marcaId: '7', modeloId: '88', motor: 'Gasolina/Híbrido' }), 'un combustible del catálogo con barra y tilde sí')
})

test('#5080: los ids del catálogo solo valen si la marca y el modelo en texto son los suyos', async () => {
  const { textosCasanConCatalogo } = await import('./catalogo-vehiculo-portal.ts')
  const listas = { marcas: [{ id: '7', nombre: 'SEAT' }], modelos: [{ id: '88', nombre: 'Ibiza' }] }
  const el = { marcaId: '7', modeloId: '88' }
  assert.equal(textosCasanConCatalogo({ marca: 'Seat', modelo: 'IBIZA' }, el, listas), true)
  assert.equal(textosCasanConCatalogo({ marca: 'Seat', modelo: 'Ibiza 1.0 TSI' }, el, listas), true)
  assert.equal(textosCasanConCatalogo({ marca: 'Opel', modelo: 'Ibiza' }, el, listas), false, 'cambió la marca a mano')
  assert.equal(textosCasanConCatalogo({ marca: 'Seat', modelo: 'Ibizanova' }, el, listas), false)
  assert.equal(textosCasanConCatalogo({ marca: 'Seat', modelo: 'León' }, el, listas), false)
  assert.equal(textosCasanConCatalogo({ marca: 'Seat', modelo: 'Ibiza' }, { marcaId: '7', modeloId: '99' }, listas), false, 'id fuera de la lista')
  assert.equal(textosCasanConCatalogo({ marca: null, modelo: 'Ibiza' }, el, listas), false)
})

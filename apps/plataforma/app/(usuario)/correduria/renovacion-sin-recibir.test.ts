import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenarRenovaciones, resumenSinRecibir, textoCompaniaSinRecibir } from './renovacion-sin-recibir.ts'

const fila = (dias: number, aseguradora = 'Mapfre', prima: number | null = 100, ultimo: string | null = '2026-06-23') =>
  ({ dias, aseguradora, prima, fechaVencimiento: '2026-06-05', ultimoFicheroCompania: ultimo })

test('lo que no ha llegado va al FINAL, no delante de lo que vence', () => {
  const orden = ordenarRenovaciones([fila(-110), fila(12), fila(-20), fila(40)]).map(p => p.dias)
  assert.deepEqual(orden, [12, 40, -110, -20])
})

test('sin filas pasadas no hay aviso', () => {
  assert.equal(resumenSinRecibir([fila(3), fila(50)]), null)
})

test('agrupa por compañía con su último fichero y no suma la prima desconocida como 0', () => {
  const r = resumenSinRecibir([fila(-110), fila(-20, 'Mapfre', null), fila(-5, 'Allianz', 50, null), fila(10)])!
  assert.equal(r.n, 3)
  assert.equal(r.prima, 150)
  assert.equal(r.sinPrima, 1)
  assert.deepEqual(r.companias, [
    { aseguradora: 'Mapfre', n: 2, ultimoFichero: '2026-06-23' },
    { aseguradora: 'Allianz', n: 1, ultimoFichero: null },
  ])
})

test('sin fecha de fichero NO se inventa una: se dice que no consta', () => {
  assert.match(textoCompaniaSinRecibir({ aseguradora: 'Allianz', n: 1, ultimoFichero: null }), /no consta/)
  assert.match(textoCompaniaSinRecibir({ aseguradora: 'Mapfre', n: 10, ultimoFichero: '2026-06-23' }), /10 pólizas.*23\/06\/2026/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { leerResultadosPuerto, textoAvisoDevolucion, type ResultadoPuertoDevolucion } from './devolucion-aviso.ts'
import type { LecturaCorreoDevolucion } from '@central/module-seguros'

const lectura: LecturaCorreoDevolucion = {
  compania: 'reale', codigoDgs: 'C0613', incidencias: [], ilegibles: 0,
  devoluciones: [{ codigoDgs: 'C0613', idRecibo: '690000000001', numeroPoliza: '3021700000001', importe: 184.58, fechaEfecto: '2026-09-19', fechaDevolucion: '2026-09-28', motivo: 'RAZONES.REG.', tipoMotivo: 'cuenta' }],
}
const ok: ResultadoPuertoDevolucion = {
  idRecibo: '690000000001', estado: 'registrada', clienteId: 'c1', cliente: 'Persona Prueba', ramo: 'auto', compania: 'REALE',
  importe: 184.58, comision: 23.4, fechaEfecto: '2026-09-19', suspensionDesde: '2026-10-19', tipoMotivo: 'cuenta', motivo: 'RAZONES.REG.', tarea: 'abierta',
}
const url = (id: string) => `https://p/correduria/cliente/${id}`

test('registrada: quién, importe español, plazo de suspensión, pista del motivo y enlace a la ficha', () => {
  const t = textoAvisoDevolucion(lectura, [ok], url)
  assert.match(t, /Recibo DEVUELTO<\/b> — Reale/)
  assert.match(t, /<b>Persona Prueba<\/b> · auto · 184,58€ · efecto 19\/09\/2026/)
  assert.match(t, /pedir el IBAN bueno/)
  assert.match(t, /suspenso el 19\/10\/2026/)
  assert.match(t, /Comisión en riesgo: 23,40€/)
  assert.match(t, /href="https:\/\/p\/correduria\/cliente\/c1"/)
  assert.doesNotMatch(t, /3021700000001/, 'el nº de póliza no viaja entero')
})

test('🪤 el puerto no contestó: se dice que NO consta registrado, no se da por hecho', () => {
  const t = textoAvisoDevolucion(lectura, null, url)
  assert.match(t, /No se pudo confirmar el registro/)
  assert.doesNotMatch(t, /Llamada creada/)
})

test('asegura rechaza el lote: se dice que lo rechazó y por qué, no que «no contestó»', () => {
  const t = textoAvisoDevolucion(lectura, null, url, { estado: 'rechazado', motivo: 'idRecibo no válido' })
  assert.match(t, /RECHAZÓ el registro \(idRecibo no válido\)/)
})

test('CIMA ya sabía algo posterior: no se marca y se dice', () => {
  assert.match(textoAvisoDevolucion(lectura, [{ ...ok, estado: 'ya_resuelta', tarea: 'no_aplica' }], url), /llegó tarde/)
})

test('recibo que aún no está en la cartera: queda anotado, sin enlace inventado', () => {
  const t = textoAvisoDevolucion(lectura, [{ ...ok, estado: 'sin_recibo', clienteId: null, cliente: null, tarea: 'no_aplica' }], url)
  assert.match(t, /aún no está en la cartera/)
  assert.doesNotMatch(t, /href=/)
})

test('filas ilegibles e incidencias se declaran', () => {
  const t = textoAvisoDevolucion({ ...lectura, ilegibles: 2, incidencias: [{ idRecibo: '8800000001' }] }, [ok], url)
  assert.match(t, /2 fila\(s\)/)
  assert.match(t, /incidencia/)
})

test('leerResultadosPuerto descarta filas sin forma', () => {
  assert.equal(leerResultadosPuerto(null), null)
  assert.deepEqual(leerResultadosPuerto({ resultados: [{ estado: 'raro', idRecibo: 'x' }] }), [])
  assert.equal(leerResultadosPuerto({ resultados: [ok] })?.[0].cliente, 'Persona Prueba')
})

test('Allianz: la carta de pólizas ANULADAS no se titula «recibo devuelto»; sin filas leídas, tampoco', () => {
  const anulada: LecturaCorreoDevolucion = {
    compania: 'allianz', codigoDgs: 'C0109', incidencias: [], ilegibles: 0,
    devoluciones: [{ codigoDgs: 'C0109', idRecibo: '600000001', numeroPoliza: '040000001', importe: 249.34, fechaEfecto: '2026-06-01', fechaDevolucion: '2026-08-03', motivo: 'Póliza anulada por impago', tipoMotivo: 'otro' }],
  }
  assert.match(textoAvisoDevolucion(anulada, null, url), /Póliza ANULADA por impago<\/b> — Allianz/)
  const sinLeer = textoAvisoDevolucion({ ...anulada, devoluciones: [], ilegibles: 1 }, null, url)
  assert.match(sinLeer, /Aviso de recibos sin leer<\/b> — Allianz/)
  assert.match(sinLeer, /no se han sabido leer/)
})

test('🪤 comisión que no consta: no se pinta «0,00€ en riesgo»', () => {
  const t = textoAvisoDevolucion(lectura, [{ ...ok, comision: null }], url)
  assert.doesNotMatch(t, /Comisión en riesgo/)
  const [r] = leerResultadosPuerto({ resultados: [{ ...ok, comision: 0 }] }) ?? []
  assert.equal(r?.comision, null)
})

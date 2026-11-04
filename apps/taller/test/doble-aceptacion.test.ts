/* eslint-disable @typescript-eslint/no-explicit-any */
// Hallazgo 3 (revisión de seguridad): aceptación doble en /p/[token]. Dos peticiones simultáneas (doble clic, dos pestañas, reintento)
// leían el presupuesto «abierto» a la vez y las dos copiaban líneas a la OT y registraban consentimientos.
// Cepo visto fallar el 04/11/2026: en lib/presupuestos.ts `reclamarPresupuesto` devolver siempre `true` (sin mirar `count === 1`) → rojo en los
// tres tests de carrera (líneas duplicadas en la OT). Restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abrirParteMecanico } from '../lib/ordenes.ts'
import { aceptarPorToken, crearPresupuestoDesdeOt, generarEnlace, rechazarPorToken } from '../lib/presupuestos.ts'
import { enviarPropuesta, proponerAmpliacion } from '../lib/trabajo-ot.ts'
import { almacenSoloMetadatos } from '../lib/almacen.ts'
import { AHORA, montar, recibir, T } from './_escenario.ts'

const deps = { textoTaller: { version: 'v', texto: 't' } }

async function listo() {
  const m = montar()
  const r = await recibir(m)
  const c: any = await m.conTaller(T, (tx: any) => crearPresupuestoDesdeOt(tx, { tallerId: T, otId: r.otId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }], ahora: AHORA }, m.config))
  const g: any = await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: c.presupuestoId, ahora: AHORA, config: m.config }))
  const acepta = (token = g.token, casillas = { asegura: true, taller: false }) =>
    m.conTaller(T, (tx: any) => aceptarPorToken(tx, { tallerId: T, token, ip: null, userAgent: null, ahora: AHORA, casillas }, deps))
  return { m, r, g, acepta }
}

test('dos aceptaciones SIMULTÁNEAS: una gana, la otra recibe 409; la OT queda con UNA copia de líneas y UN consentimiento', async () => {
  const { m, acepta } = await listo()
  const res: any[] = await Promise.all([acepta(), acepta()])
  assert.equal(res.filter((x) => x.ok).length, 1, JSON.stringify(res))
  const perdedora = res.find((x) => !x.ok)
  assert.equal(perdedora.status, 409)
  assert.equal(m.bd.filas('otLinea').length, 1, 'líneas copiadas una sola vez')
  assert.equal(m.bd.filas('consentimiento').length, 1, 'consentimiento registrado una sola vez')
  assert.equal(m.bd.filas('presupuesto')[0].estado, 'aceptado')
})

test('aceptar y rechazar a la vez: gana uno solo y el presupuesto no cambia de estado después', async () => {
  const { m, g, acepta } = await listo()
  const [a, r]: any[] = await Promise.all([
    acepta(),
    m.conTaller(T, (tx: any) => rechazarPorToken(tx, { tallerId: T, token: g.token, ahora: AHORA })),
  ])
  assert.equal([a, r].filter((x) => x.ok).length, 1, JSON.stringify([a, r]))
  const estado = m.bd.filas('presupuesto')[0].estado
  assert.equal(estado, a.ok ? 'aceptado' : 'rechazado')
  assert.equal(m.bd.filas('otLinea').length, a.ok ? 1 : 0, 'las líneas solo entran si ganó la aceptación')
})

test('ampliación: dos aceptaciones simultáneas copian la línea UNA vez', async () => {
  const { m, r, acepta } = await listo()
  await acepta()
  await m.conTaller(T, (tx: any) => abrirParteMecanico(tx, { tallerId: T, mecanicoId: m.mec.id, otId: r.otId, ahora: AHORA }))
  const antes = m.bd.filas('otLinea').length
  const id = await m.conTaller(T, (tx: any) => proponerAmpliacion(tx, almacenSoloMetadatos, {
    tallerId: T, usuarioId: m.mec.id, otId: r.otId, explicacion: 'Pastillas', lineas: [{ descripcion: 'Pastillas delanteras', referencia: 'PD-1', cantidad: 1 }], fotos: [],
  }))
  const env: any = await m.conTaller(T, (tx: any) => enviarPropuesta(tx, { tallerId: T, propuestaId: id, precios: [{ orden: 1, precioUnitarioCent: 4550 }], config: m.config, ahora: AHORA }))
  const res: any[] = await Promise.all([acepta(env.token, { asegura: false, taller: false }), acepta(env.token, { asegura: false, taller: false })])
  assert.equal(res.filter((x) => x.ok).length, 1, JSON.stringify(res))
  assert.equal(m.bd.filas('otLinea').length - antes, 1, 'la línea de la ampliación entra una sola vez')
})

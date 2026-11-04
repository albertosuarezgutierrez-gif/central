// Sesión PIN: duración e inactividad salen de la CONFIGURACIÓN del taller (alta: 5 h y 30 min), no de un literal.
// Cepo visto fallar el 04/11/2026: en leerCookie quitar la comprobación de `o.ina` → rojo en 'inactividad'. Restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { configDeAlta } from '@central/module-taller'
import { cookieOpts, emitirCookie, leerCookie, renovarCookie } from '../lib/sesion-cookie.ts'
import { politicaSesion } from '../lib/login.ts'
import { crearConTaller } from '../lib/rls.ts'
import { crearBdFake } from './_fake-prisma.ts'
import { T } from './_escenario.ts'

process.env.TALLER_SESSION_SECRET = 'secreto-de-prueba-no-real'
const U = { tallerId: T, usuarioId: 'u1', rol: 'mecanico' }
const T0 = new Date('2026-11-04T08:00:00Z')
const despues = (min: number, base = T0) => new Date(base.getTime() + min * 60_000)

test('alta: la sesión dura 5 h y se cierra a los 30 min sin uso (valores de configDeAlta)', () => {
  const a = configDeAlta().seguridadLogin
  assert.equal(a.sesionMinutos, 300)
  assert.equal(a.inactividadMinutos, 30)
})

test('caducidad de la sesión = la de la CONFIGURACIÓN (cambiarla cambia la cookie)', async () => {
  for (const sesionMinutos of [60, 300, 600]) {
    const c = await emitirCookie(U, T0, { sesionMinutos, inactividadMinutos: 100_000 })
    assert.ok(await leerCookie(c, despues(sesionMinutos - 1)), `viva a ${sesionMinutos - 1} min`)
    assert.equal(await leerCookie(c, despues(sesionMinutos)), null, `caducada a ${sesionMinutos} min`)
  }
  assert.equal(cookieOpts(120).maxAge, 7200)
})

test('inactividad: sin actividad N minutos (de la config) la sesión se cierra; con actividad renovada sigue', async () => {
  const c = await emitirCookie(U, T0, { sesionMinutos: 300, inactividadMinutos: 30 })
  assert.ok(await leerCookie(c, despues(29)))
  assert.equal(await leerCookie(c, despues(30)), null, 'a los 30 min sin usarla')
  // Actividad a los 20 min: la cuenta de inactividad empieza de nuevo; el fin absoluto (5 h) NO se mueve.
  const s = (await leerCookie(c, despues(20)))!
  const r = await renovarCookie(s, despues(20))
  assert.ok(await leerCookie(r, despues(49)))
  assert.equal(await leerCookie(r, despues(50)), null)
  const s2 = (await leerCookie(r, despues(49)))!
  assert.equal(s2.exp, s.exp)
  assert.equal(await leerCookie(await renovarCookie(s2, despues(299)), despues(300)), null, 'el máximo absoluto manda')
})

test('cookie manipulada o antigua (sin act/ina) → null (falla cerrado)', async () => {
  const c = await emitirCookie(U, T0, { sesionMinutos: 300, inactividadMinutos: 30 })
  const o = JSON.parse(atob(c))
  o.ina = 100000
  assert.equal(await leerCookie(btoa(JSON.stringify(o)), despues(1)), null, 'la firma cubre ina')
  const sinAct = { ...JSON.parse(atob(c)) }
  delete sinAct.act
  assert.equal(await leerCookie(btoa(JSON.stringify(sinAct)), despues(1)), null)
})

test('politicaSesion lee la config del taller; sin fila usa la de alta', async () => {
  const bd = crearBdFake()
  bd.sembrar('taller', { id: T })
  const conTaller = crearConTaller(bd.cliente)
  assert.deepEqual(await politicaSesion(conTaller as never, T), { sesionMinutos: 300, inactividadMinutos: 30 })
  bd.sembrar('configuracion', { tallerId: T, loginSesionMinutos: 90, loginInactividadMinutos: 10 })
  assert.deepEqual(await politicaSesion(conTaller as never, T), { sesionMinutos: 90, inactividadMinutos: 10 })
})

test('guardián: ningún literal de duración (12 h…) en la sesión; «Cambiar de usuario» visible; el login usa la política', () => {
  const lee = (...r: string[]) => readFileSync(join(import.meta.dirname, '..', ...r), 'utf8')
  assert.ok(!/12 \* 60|DURACION_MS/.test(lee('lib', 'sesion-cookie.ts')))
  assert.match(lee('app', '_salir.tsx'), /Cambiar de usuario/)
  const login = lee('app', 'api', 'auth', 'login', 'route.ts')
  assert.match(login, /politicaSesion\(/)
  assert.match(login, /cookieOpts\(pol\.sesionMinutos\)/)
})

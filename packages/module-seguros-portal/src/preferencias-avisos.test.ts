import test from 'node:test'
import assert from 'node:assert/strict'

import { DIAS_VENTANA_AVISO, entraEnVentana } from './obligacion.ts'
import { debeAvisarPush } from './push.ts'
import {
  DIAS_ANTELACION_MAX,
  DIAS_ANTELACION_OPCIONES,
  DIAS_ANTELACION_POR_DEFECTO,
  enNoMolestar,
  minutoEnMadrid,
  motivoSinPush,
  resolverPreferenciasAvisos,
  validarCambioPreferencias,
} from './preferencias-avisos.ts'

const VACIA = { canal: null, diasAntelacion: null, noMolestarDesde: null, noMolestarHasta: null }

test('🚨 sin fila (o todo null) = lo de antes: push activo, 7 días, sin franja — null no es «no»', () => {
  for (const g of [null, VACIA]) {
    const p = resolverPreferenciasAvisos(g)
    assert.equal(p.canal, 'ambos')
    assert.equal(p.diasAntelacion, 7)
    assert.equal(p.noMolestar, null)
    assert.equal(motivoSinPush(p, new Date('2026-10-13T03:00:00Z')), null, 'sin configurar se avisa como siempre')
  }
  assert.equal(DIAS_ANTELACION_POR_DEFECTO, DIAS_VENTANA_AVISO, 'el defecto de la pantalla es el de los crons')
})

test('un valor que no se reconoce vale como no configurado, no se inventa', () => {
  const p = resolverPreferenciasAvisos({ canal: 'sms', diasAntelacion: 5, noMolestarDesde: 600, noMolestarHasta: null })
  assert.equal(p.canal, 'ambos')
  assert.equal(p.diasAntelacion, 7)
  assert.equal(p.noMolestar, null, 'media franja no silencia nada')
})

test('«solo por correo» apaga el push; «solo en el móvil» y «los dos» no', () => {
  const ahora = new Date('2026-10-13T10:00:00Z')
  assert.equal(motivoSinPush(resolverPreferenciasAvisos({ ...VACIA, canal: 'correo' }), ahora), 'canal_correo')
  assert.equal(motivoSinPush(resolverPreferenciasAvisos({ ...VACIA, canal: 'movil' }), ahora), null)
  assert.equal(motivoSinPush(resolverPreferenciasAvisos({ ...VACIA, canal: 'ambos' }), ahora), null)
})

test('la hora de «no molestar» es la de Madrid (verano UTC+2, invierno UTC+1), no la del servidor', () => {
  // 08:00 UTC del 13/10 (verano) = 10:00 en Madrid; 08:00 UTC del 15/01 (invierno) = 09:00.
  assert.equal(minutoEnMadrid(new Date('2026-10-13T08:00:00Z')), 10 * 60)
  assert.equal(minutoEnMadrid(new Date('2027-01-15T08:00:00Z')), 9 * 60)
  // Franja 09:30–10:30: el cron de las 08:00 UTC cae dentro en verano y fuera en invierno.
  const f = { desde: 9 * 60 + 30, hasta: 10 * 60 + 30 }
  assert.equal(enNoMolestar(f, new Date('2026-10-13T08:00:00Z')), true)
  assert.equal(enNoMolestar(f, new Date('2027-01-15T08:00:00Z')), false)
})

test('una franja que cruza la medianoche (22:00–08:00) silencia la noche y no el día', () => {
  const f = { desde: 22 * 60, hasta: 8 * 60 }
  assert.equal(enNoMolestar(f, new Date('2026-10-13T21:30:00Z')), true, '23:30 en Madrid')
  assert.equal(enNoMolestar(f, new Date('2026-10-13T04:00:00Z')), true, '06:00 en Madrid')
  assert.equal(enNoMolestar(f, new Date('2026-10-13T06:00:00Z')), false, '08:00 en Madrid: «hasta» no incluido')
  assert.equal(enNoMolestar(f, new Date('2026-10-13T12:45:00Z')), false, '14:45 en Madrid (cron de CIMA)')
  assert.equal(enNoMolestar(f, new Date('2026-10-13T20:00:00Z')), true, '22:00 en Madrid: «desde» incluido')
  const p = resolverPreferenciasAvisos({ ...VACIA, noMolestarDesde: f.desde, noMolestarHasta: f.hasta })
  assert.equal(motivoSinPush(p, new Date('2026-10-13T21:30:00Z')), 'no_molestar')
})

test('la antelación elegida mueve la ventana del push; sin ella, los 7 de siempre', () => {
  const hoy = new Date(Date.UTC(2026, 9, 13))
  const a = (dias: number) => new Date(hoy.getTime() + dias * 86_400_000)
  assert.equal(entraEnVentana({ fechaAccionable: a(7), hoy }), true)
  assert.equal(entraEnVentana({ fechaAccionable: a(8), hoy }), false)
  assert.equal(debeAvisarPush({ fechaAccionable: a(5), avisadaPushAt: null }, hoy, 3), false, 'a 5 días con 3 elegidos: todavía no')
  assert.equal(debeAvisarPush({ fechaAccionable: a(3), avisadaPushAt: null }, hoy, 3), true)
  assert.equal(debeAvisarPush({ fechaAccionable: a(30), avisadaPushAt: null }, hoy, 30), true)
  assert.equal(debeAvisarPush({ fechaAccionable: a(31), avisadaPushAt: null }, hoy, 30), false)
  assert.equal(debeAvisarPush({ fechaAccionable: a(3), avisadaPushAt: hoy }, hoy, 30), false, 'ya avisada: nunca dos veces')
  assert.equal(DIAS_ANTELACION_MAX, Math.max(...DIAS_ANTELACION_OPCIONES), 'la criba SQL del cron llega a la mayor opción')
})

test('validar: solo pasa lo que existe; la franja exige dos horas distintas', () => {
  assert.deepEqual(validarCambioPreferencias({ canal: 'movil' }), { ok: true, datos: { canal: 'movil' } })
  assert.deepEqual(validarCambioPreferencias({ diasAntelacion: 15 }), { ok: true, datos: { diasAntelacion: 15 } })
  assert.deepEqual(validarCambioPreferencias({ noMolestar: { desde: '22:00', hasta: '08:30' } }), {
    ok: true,
    datos: { noMolestarDesde: 1320, noMolestarHasta: 510 },
  })
  assert.deepEqual(validarCambioPreferencias({ noMolestar: null }), {
    ok: true,
    datos: { noMolestarDesde: null, noMolestarHasta: null },
  })
  assert.deepEqual(validarCambioPreferencias({ canal: 'sms' }), { ok: false, error: 'canal_invalido' })
  assert.deepEqual(validarCambioPreferencias({ diasAntelacion: 10 }), { ok: false, error: 'dias_invalidos' })
  assert.deepEqual(validarCambioPreferencias({ diasAntelacion: '7' }), { ok: false, error: 'dias_invalidos' })
  assert.deepEqual(validarCambioPreferencias({ noMolestar: { desde: '22:00', hasta: '22:00' } }), { ok: false, error: 'franja_invalida' })
  assert.deepEqual(validarCambioPreferencias({ noMolestar: { desde: '25:00', hasta: '08:00' } }), { ok: false, error: 'franja_invalida' })
  assert.deepEqual(validarCambioPreferencias({}), { ok: false, error: 'sin_cambios' })
})

// ─── Fase B (13/10/2026): umbral de subida de precio ─────────────────────────

test('🪤 umbral de subida: sin configurar (o valor desconocido) = 10 %, nunca «no avisar»', () => {
  assert.equal(resolverPreferenciasAvisos(null).umbralSubidaPrima, 10)
  const base = { canal: null, diasAntelacion: null, noMolestarDesde: null, noMolestarHasta: null }
  assert.equal(resolverPreferenciasAvisos({ ...base, umbralSubidaPrima: null }).umbralSubidaPrima, 10)
  assert.equal(resolverPreferenciasAvisos({ ...base, umbralSubidaPrima: 12 }).umbralSubidaPrima, 10)
  // Un lector que no selecciona la columna (fase A) sigue valiendo.
  assert.equal(resolverPreferenciasAvisos(base).umbralSubidaPrima, 10)
  assert.equal(resolverPreferenciasAvisos({ ...base, umbralSubidaPrima: 20 }).umbralSubidaPrima, 20)
})

test('🪤 umbral de subida: solo 5/10/15/20 se guardan', () => {
  for (const u of [5, 10, 15, 20]) assert.deepEqual(validarCambioPreferencias({ umbralSubidaPrima: u }), { ok: true, datos: { umbralSubidaPrima: u } })
  for (const u of [0, 12, '10', null]) assert.deepEqual(validarCambioPreferencias({ umbralSubidaPrima: u }), { ok: false, error: 'umbral_invalido' })
})

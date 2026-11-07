// Permisos por capacidad (07/11/2026). Cepos vistos FALLAR, uno por aserción, y restaurados:
// (1) en CAPACIDADES_POR_ROL_DEFECTO.mecanico añadir 'facturar' → rojo «tabla por defecto» y «mecánico puro no factura».
// (2) en capacidadesDe quitar la unión de roles (usar solo roles[0]) → rojo «mecánico-recepcionista recepciona».
// (3) en errorUltimoDueno contar al propio usuario aunque deje de ser dueño → rojo «último dueño».
// (4) en capacidadesPorRolEfectivas no filtrar `delegable` → rojo «una reservada guardada en BD no da permiso».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAPACIDADES, CAPACIDADES_POR_ROL_DEFECTO, CAPACIDADES_RESERVADAS_DUENO, NOMBRE_CAPACIDAD, capacidadesDe, capacidadesPorRolEfectivas,
  errorUltimoDueno, rolPrincipal, rolesDeFila, tieneCapacidad, validarCapacidadesExtra, validarCapacidadesPorRol, validarRoles,
  type Capacidad,
} from '../src/index.ts'

const de = (roles: string[], guardado: unknown = null, extra: string[] = []) => [...capacidadesDe({ roles, capacidadesExtra: extra }, guardado)]

test('tabla por defecto = decisión de Alberto (04/11/2026)', () => {
  const esperado: Record<Capacidad, string[]> = {
    recepcion: ['dueno', 'admin', 'recepcion'],
    ordenes_ver: ['dueno', 'admin', 'recepcion', 'mecanico'],
    ordenes_todas: ['dueno', 'admin', 'recepcion'],
    ordenes_gestionar: ['dueno'],
    ordenes_avanzar: ['dueno', 'recepcion'],
    ot_trabajo: ['dueno', 'mecanico'],
    ampliaciones: ['dueno', 'admin', 'recepcion'],
    partes: ['dueno', 'mecanico'],
    presupuestos: ['dueno', 'admin', 'recepcion'],
    precios_ver: ['dueno', 'admin', 'recepcion'],
    contacto_cliente_ver: ['dueno', 'admin', 'recepcion'],
    margenes_ver: ['dueno'],
    citas: ['dueno', 'admin', 'recepcion'],
    facturar: ['dueno', 'admin', 'recepcion'],
    facturas_rectificar: ['dueno'],
    almacen: ['dueno', 'admin'],
    pedidos_enviar: ['dueno'],
    ajustes: ['dueno'],
    usuarios: ['dueno'],
  }
  for (const cap of CAPACIDADES) {
    assert.deepEqual(['dueno', 'admin', 'recepcion', 'mecanico'].filter((r) => tieneCapacidad({ roles: [r] }, cap)), esperado[cap], cap)
    assert.ok(NOMBRE_CAPACIDAD[cap], `${cap} tiene nombre visible`)
  }
})

test('el dueño lo tiene todo, también con una config que intente recortarlo', () => {
  assert.equal(de(['dueno']).length, CAPACIDADES.length)
  assert.equal(de(['dueno'], { admin: [] }).length, CAPACIDADES.length)
})

test('mecánico-recepcionista (G2) recepciona, entrega y ficha; mecánico puro no recepciona', () => {
  const g2 = capacidadesDe({ roles: ['mecanico', 'recepcion'] }, null)
  for (const c of ['recepcion', 'ordenes_avanzar', 'partes', 'ot_trabajo'] as const) assert.ok(g2.has(c), c)
  assert.equal(tieneCapacidad({ roles: ['mecanico'] }, 'recepcion'), false)
  assert.equal(tieneCapacidad({ roles: ['mecanico'] }, 'ordenes_avanzar'), false)
})

test('mecánico puro no factura con la config por defecto ni si el taller se lo quita a recepción; sí si el taller se lo da', () => {
  assert.equal(tieneCapacidad({ roles: ['mecanico'] }, 'facturar'), false)
  assert.equal(tieneCapacidad({ roles: ['mecanico'] }, 'facturar', { mecanico: ['ordenes_ver', 'partes'] }), false)
  assert.equal(tieneCapacidad({ roles: ['mecanico'] }, 'facturar', { mecanico: ['ordenes_ver', 'partes', 'facturar'] }), true)
  // El taller quita «facturar» a recepción: el mecánico-recepcionista deja de facturar.
  assert.equal(tieneCapacidad({ roles: ['mecanico', 'recepcion'] }, 'facturar', { recepcion: ['recepcion'] }), false)
})

test('capacidad extra suelta suma; una reservada al dueño nunca (ni guardada en BD)', () => {
  assert.ok(de(['mecanico'], null, ['facturar']).includes('facturar'))
  for (const r of CAPACIDADES_RESERVADAS_DUENO) {
    assert.equal(de(['admin'], null, [r]).includes(r), false, `extra ${r}`)
    assert.equal(de(['admin'], { admin: [r] }).includes(r), false, `una reservada guardada en BD no da permiso (${r})`)
  }
  assert.equal(de(['mecanico'], null, ['no_existe']).length, CAPACIDADES_POR_ROL_DEFECTO.mecanico.length)
})

test('validarCapacidadesPorRol: rechaza dueño, rol/capacidad desconocidos y reservadas; normaliza orden y repetidos', () => {
  assert.equal(validarCapacidadesPorRol(null).ok, false)
  assert.equal(validarCapacidadesPorRol([]).ok, false)
  assert.equal(validarCapacidadesPorRol({ dueno: [] }).ok, false)
  assert.equal(validarCapacidadesPorRol({ jefe: [] }).ok, false)
  assert.equal(validarCapacidadesPorRol({ admin: ['volar'] }).ok, false)
  assert.equal(validarCapacidadesPorRol({ admin: ['usuarios'] }).ok, false)
  const r = validarCapacidadesPorRol({ mecanico: ['partes', 'recepcion', 'partes'] })
  assert.deepEqual(r, { ok: true, valor: { mecanico: ['recepcion', 'partes'] } })
})

test('config efectiva: rol ausente o mal guardado = por defecto; lista vacía = sin capacidades', () => {
  assert.deepEqual(capacidadesPorRolEfectivas(null), CAPACIDADES_POR_ROL_DEFECTO)
  const e = capacidadesPorRolEfectivas({ mecanico: [], admin: 'roto' })
  assert.deepEqual(e.mecanico, [])
  assert.deepEqual(e.admin, CAPACIDADES_POR_ROL_DEFECTO.admin)
  assert.deepEqual(e.recepcion, CAPACIDADES_POR_ROL_DEFECTO.recepcion)
})

test('roles: validar, principal y lectura de filas antiguas', () => {
  assert.deepEqual(validarRoles(['recepcion', 'mecanico', 'recepcion']), { ok: true, valor: ['recepcion', 'mecanico'] })
  assert.equal(validarRoles([]).ok, false)
  assert.equal(validarRoles(['jefe']).ok, false)
  assert.equal(rolPrincipal(['mecanico', 'dueno']), 'dueno')
  assert.equal(rolPrincipal(['mecanico', 'recepcion']), 'recepcion')
  assert.equal(rolPrincipal([]), null)
  assert.deepEqual(rolesDeFila({ rol: 'mecanico' }), ['mecanico'])
  assert.deepEqual(rolesDeFila({ rol: 'mecanico', roles: [] }), ['mecanico'])
  assert.deepEqual(rolesDeFila({ rol: 'mecanico', roles: ['recepcion', 'mecanico'] }), ['recepcion', 'mecanico'])
  assert.equal(validarCapacidadesExtra(['ajustes']).ok, false)
  assert.deepEqual(validarCapacidadesExtra(['facturar', 'recepcion']), { ok: true, valor: ['recepcion', 'facturar'] })
})

test('último dueño: no se le quita el rol ni se le da de baja; con otro dueño, sí', () => {
  assert.ok(errorUltimoDueno({ duenosActivos: ['a'], usuarioId: 'a', rolesNuevos: ['mecanico'], activoNuevo: true }))
  assert.ok(errorUltimoDueno({ duenosActivos: ['a'], usuarioId: 'a', rolesNuevos: ['dueno'], activoNuevo: false }))
  assert.equal(errorUltimoDueno({ duenosActivos: ['a'], usuarioId: 'a', rolesNuevos: ['dueno', 'mecanico'], activoNuevo: true }), null)
  assert.equal(errorUltimoDueno({ duenosActivos: ['a', 'b'], usuarioId: 'a', rolesNuevos: ['mecanico'], activoNuevo: true }), null)
  assert.equal(errorUltimoDueno({ duenosActivos: ['a'], usuarioId: 'c', rolesNuevos: ['mecanico'], activoNuevo: true }), null)
})

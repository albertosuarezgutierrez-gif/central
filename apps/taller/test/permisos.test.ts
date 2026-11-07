/* eslint-disable @typescript-eslint/no-explicit-any */
// Permisos por rol, aplicados en SERVIDOR (rol re-leído en BD). Cepos vistos fallar el 04/11/2026:
// (1) en lib/permisos.ts añadir 'mecanico' a MATRIZ.presupuestos: rojo en 'mecánico → presupuestos rechazado' y en la matriz.
// (2) quitar `conPermiso('presupuestos'` de una acción de presupuestos: rojo en 'toda acción exige permiso'. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { capacidadParaTransicion, CAPACIDADES, DebeCambiarPinError, exigir, SinPermisoError, tienePermiso, TRANSICIONES_RECEPCION, type Capacidad } from '../lib/permisos.ts'
import { TRANSICIONES_OT } from '@central/module-taller'
import { montar, T, T2 } from './_escenario.ts'
import { exigirAcceso } from '../lib/permisos.ts'
import { bajaUsuario, ErrorPersonal, guardarRolesUsuario } from '../lib/personal.ts'

const roles = ['dueno', 'admin', 'recepcion', 'mecanico'] as const
const esperado: Partial<Record<Capacidad, string[]>> = {
  recepcion: ['dueno', 'admin', 'recepcion'],
  ordenes_ver: ['dueno', 'admin', 'recepcion', 'mecanico'],
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
}

test('matriz de permisos = la decisión de Alberto', () => {
  for (const cap of Object.keys(esperado) as Capacidad[]) {
    assert.deepEqual(roles.filter((r) => tienePermiso(r, cap)), esperado[cap], cap)
  }
  assert.equal(tienePermiso('invitado', 'ordenes_ver'), false)
  assert.equal(tienePermiso(null, 'ordenes_ver'), false)
})

test('el mecánico no ve precios, contacto del cliente, presupuestos ni márgenes; el admin no ve márgenes', () => {
  for (const cap of ['presupuestos', 'precios_ver', 'contacto_cliente_ver', 'margenes_ver', 'recepcion'] as const) {
    assert.equal(tienePermiso('mecanico', cap), false, cap)
  }
  assert.equal(tienePermiso('admin', 'margenes_ver'), false)
  assert.equal(tienePermiso('recepcion', 'ordenes_gestionar'), false, 'recepción: OT solo ver')
})

test('mecánico → presupuestos rechazado EN SERVIDOR (rol leído de la BD, no de la cookie)', async () => {
  const m = montar()
  await m.conTaller(T, async (tx: any) => {
    // La «sesión» dice dueño, pero la BD dice que ese usuario es mecánico: manda la BD.
    await assert.rejects(exigir(tx, { tallerId: T, usuarioId: m.mec.id, rol: 'dueno' }, 'presupuestos'), SinPermisoError)
    assert.equal(await exigir(tx, { tallerId: T, usuarioId: m.dueno.id, rol: 'mecanico' }, 'presupuestos'), 'dueno')
    await assert.rejects(exigir(tx, { tallerId: T, usuarioId: m.mec.id, rol: 'mecanico' }, 'margenes_ver'), SinPermisoError)
    await assert.rejects(exigir(tx, { tallerId: T, usuarioId: m.baja.id, rol: 'dueno' }, 'ordenes_ver'), SinPermisoError, 'baja = sin acceso')
    await assert.rejects(exigir(tx, { tallerId: T, usuarioId: 'no-existe', rol: 'dueno' }, 'ordenes_ver'), SinPermisoError)
  })
  // y un usuario de OTRO taller no existe para este (RLS)
  await m.conTaller(T2, async (tx: any) => {
    await assert.rejects(exigir(tx, { tallerId: T2, usuarioId: m.dueno.id, rol: 'dueno' }, 'ordenes_ver'), SinPermisoError)
  })
})

// ── Guardián de fuentes: ninguna acción de servidor sin permiso ──────────────────────────────────────────────────
const APP = join(import.meta.dirname, '..', 'app')
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? ficheros(p) : [p]
  })
}
const acciones = ficheros(APP).filter((f) => f.endsWith('acciones.ts'))

test('el guardián tiene qué vigilar', () => assert.ok(acciones.length >= 4, acciones.join(',')))

test('toda acción de servidor exige permiso (salvo Ajustes, que exige dueño, y la pública por token)', () => {
  for (const f of acciones) {
    const src = readFileSync(f, 'utf8')
    const exportadas = [...src.matchAll(/export async function (\w+)/g)].length
    assert.ok(exportadas > 0, f)
    if (f.includes(`${'/'}c${'/'}`)) {
      assert.ok(src.includes('tallerPorEnlaceLimitado('), `${f}: la pública de cita pasa por el límite por IP`)
      assert.ok(src.includes('tallerDeToken('), `${f}: valida el token`)
      continue
    }
    if (f.includes(`${'/'}p${'/'}`)) {
      assert.ok(src.includes('tallerDeToken('), `${f}: la pública valida el token`)
      continue
    }
    if (f.includes('cambiar-pin')) { assert.ok(src.includes('getSession()') && src.includes('s.usuarioId'), `${f}: solo el usuario de la sesión`); continue }
    if (f.includes('ajustes')) {
      // Ajustes: TODA acción exportada pasa por comoDueno («ajustes») o comoGestorPersonas («usuarios»), y estos por `exigir`.
      assert.ok(src.includes('await exigir(tx as never, s, cap)'), `${f}: comoCon exige la capacidad en BD`)
      assert.ok(!src.includes('usuarioConRol'), `${f}: ya no se mira el rol, sino la capacidad`)
      const usos = [...src.matchAll(/\b(comoDueno|comoGestorPersonas)\(async/g)].length
      assert.ok(usos >= exportadas, `${f}: ${exportadas} acciones y solo ${usos} con capacidad`)
      for (const n of ['altaPersona', 'bajaPersona', 'resetPinPersona', 'guardarRolesPersona', 'guardarCapacidadesPorRol']) {
        assert.match(src, new RegExp(`export async function ${n}[\\s\\S]*?comoGestorPersonas\\(`), `${n} exige «usuarios»`)
      }
      continue
    }
    const llamadas = [...src.matchAll(/conPermiso\('(\w+)'/g)].map((x) => x[1] as Capacidad)
    assert.ok(llamadas.length >= exportadas, `${f}: ${exportadas} acciones y solo ${llamadas.length} conPermiso`)
    for (const c of llamadas) assert.ok(CAPACIDADES.includes(c), c)
  }
})

test('presupuestos exige «presupuestos»; cambiar estado exige «ordenes_gestionar»; partes, «partes»', () => {
  const lee = (r: string) => readFileSync(join(APP, r), 'utf8')
  assert.ok([...lee('presupuestos/acciones.ts').matchAll(/conPermiso\('(\w+)'/g)].every((x) => x[1] === 'presupuestos'))
  const o = lee('ordenes/acciones.ts')
  assert.match(o, /conPermiso\('ordenes_avanzar'[\s\S]*capacidadParaTransicion[\s\S]*cambiarEstadoOt/)
  assert.match(o, /cap !== 'ordenes_avanzar'\) await exigir\(/, 'el resto de transiciones exige ordenes_gestionar (dueño)')
  assert.match(o, /conPermiso\('ot_trabajo'[\s\S]*anadirNota/)
  assert.match(o, /conPermiso\('ampliaciones'[\s\S]*enviarPropuesta/)
  assert.match(o, /conPermiso\('partes'[\s\S]*abrirParteMecanico/)
  assert.match(o, /conPermiso\('partes'[\s\S]*cerrarParteMecanico/)
})

test('páginas: presupuestos y recepción piden su capacidad; la ficha de OT no enseña contacto ni precios sin permiso', () => {
  const lee = (r: string) => readFileSync(join(APP, r), 'utf8')
  assert.match(lee('presupuestos/page.tsx'), /paraPagina\('presupuestos'/)
  assert.match(lee('presupuestos/[id]/page.tsx'), /paraPagina\('presupuestos'/)
  assert.match(lee('presupuestos/nuevo/page.tsx'), /paraPagina\('presupuestos'/)
  assert.match(lee('recepcion/page.tsx'), /paraPagina\('recepcion'/)
  const ot = lee('ordenes/[id]/page.tsx')
  assert.match(ot, /verContacto: c\.capacidades\.has\('contacto_cliente_ver'\)/)
  assert.match(ot, /verPrecios && <th/)
  assert.match(ot, /c\.capacidades\.has\('margenes_ver'\)/)
  assert.match(ot, /soloMecanico = !c\.capacidades\.has\('ordenes_todas'\)/)
})

test('la página pública devuelve 404 con token inválido o desconocido', () => {
  const src = readFileSync(join(APP, 'p/[token]/page.tsx'), 'utf8')
  assert.match(src, /if \(!tallerId\) notFound\(\)/)
  assert.match(src, /if \(!datos \|\| !datos\.v\.ok\) notFound\(\)/)
  assert.ok(!src.includes('getSession'), 'la pública no usa sesión')
  assert.ok(readFileSync(join(import.meta.dirname, '..', 'middleware.ts'), 'utf8').includes("'/p/'"))
})

// ── Decisión de Alberto (04/11/2026): recepción avanza en_curso→terminado y terminado→entregado; el resto, dueño ──
// Cepo visto fallar: añadir ['en_curso','ampliacion_pendiente'] a TRANSICIONES_RECEPCION → rojo en 'solo esas dos…'.
test('recepción puede SOLO en_curso→terminado y terminado→entregado; todas las demás transiciones son del dueño', () => {
  assert.deepEqual(TRANSICIONES_RECEPCION, [['en_curso', 'terminado'], ['terminado', 'entregado']])
  for (const [d, hs] of Object.entries(TRANSICIONES_OT)) {
    for (const h of hs) {
      const cap = capacidadParaTransicion(d, h)
      const esRecepcion = (d === 'en_curso' && h === 'terminado') || (d === 'terminado' && h === 'entregado')
      assert.equal(cap, esRecepcion ? 'ordenes_avanzar' : 'ordenes_gestionar', `${d}→${h}`)
      assert.equal(tienePermiso('recepcion', cap), esRecepcion, `recepción ${d}→${h}`)
      assert.equal(tienePermiso('dueno', cap), true, `dueño ${d}→${h}`)
      assert.equal(tienePermiso('mecanico', cap), false, `mecánico ${d}→${h}`)
    }
  }
})

test('mecánico: notas, fotos y propuestas (ot_trabajo) sí; poner precio y enviar al cliente (ampliaciones) no', () => {
  assert.equal(tienePermiso('mecanico', 'ot_trabajo'), true)
  assert.equal(tienePermiso('mecanico', 'ampliaciones'), false)
  assert.equal(tienePermiso('recepcion', 'ot_trabajo'), false)
  assert.equal(tienePermiso('recepcion', 'ampliaciones'), true)
})

test('PIN temporal: hasta que lo cambie no pasa por ninguna capacidad (en servidor)', async () => {
  const m = montar()
  m.bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Nuevo', rol: 'recepcion', pinHash: 'x', debeCambiarPin: true })
  const nuevo = m.bd.filas('usuarioTaller').find((u) => u.nombre === 'Nuevo')
  await m.conTaller(T, async (tx: any) => {
    await assert.rejects(exigir(tx, { tallerId: T, usuarioId: nuevo.id, rol: 'recepcion' }, 'recepcion'), DebeCambiarPinError)
    assert.equal(await exigir(tx, { tallerId: T, usuarioId: m.dueno.id, rol: 'dueno' }, 'recepcion'), 'dueno')
  })
})

test('guardián: la acción de cambio de PIN solo toca al usuario de la sesión (nunca un id del navegador)', () => {
  const src = readFileSync(join(APP, 'cambiar-pin/acciones.ts'), 'utf8')
  assert.match(src, /usuarioId: s\.usuarioId/)
  assert.ok(!/usuarioId: p\.data|fd\.get\('usuarioId/.test(src))
})

// ── 0014: varios roles, capacidades por rol del taller y último dueño, EN SERVIDOR ─────────────────────────────────
// Cepos vistos fallar (07/11/2026), restaurados: (1) en lib/permisos.ts `vigente` usar `[f.rol]` en vez de `rolesDeFila(f)` →
// rojo «mecánico-recepcionista recepciona»; (2) ignorar `capacidadesPorRolDe` (pasar null) → rojo «mecánico puro no factura
// si el taller…»; (3) en lib/personal.ts quitar la comprobación de `errorUltimoDueno` en guardarRolesUsuario → rojo «último dueño».
test('mecánico-recepcionista (roles en BD) recepciona y entrega; el mecánico puro no', async () => {
  const m = montar()
  m.bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Único', rol: 'recepcion', roles: ['recepcion', 'mecanico'], pinHash: 'x' })
  const unico = m.bd.filas('usuarioTaller').find((u) => u.nombre === 'Único')
  await m.conTaller(T, async (tx: any) => {
    const s = { tallerId: T, usuarioId: unico.id, rol: 'mecanico' }
    for (const cap of ['recepcion', 'ordenes_avanzar', 'partes', 'ot_trabajo'] as const) assert.ok((await exigirAcceso(tx, s, cap)).capacidades.has(cap), cap)
    await assert.rejects(exigir(tx, { tallerId: T, usuarioId: m.mec.id, rol: 'recepcion' }, 'recepcion'), SinPermisoError)
    await assert.rejects(exigir(tx, s, 'ajustes'), SinPermisoError, '«ajustes» es solo del dueño')
  })
})

test('mecánico puro no factura si el taller así lo configura; el dueño puede dárselo (config re-leída en BD)', async () => {
  const m = montar()
  const conf = m.bd.sembrar('configuracion', { tallerId: T, capacidadesPorRol: { mecanico: ['ordenes_ver', 'partes'] } })
  await m.conTaller(T, async (tx: any) => {
    const s = { tallerId: T, usuarioId: m.mec.id, rol: 'mecanico' }
    await assert.rejects(exigir(tx, s, 'facturar'), SinPermisoError)
    await assert.rejects(exigir(tx, s, 'ot_trabajo'), SinPermisoError, 'el taller le quitó notas/fotos')
    assert.ok(await exigir(tx, s, 'partes'))
  })
  conf.capacidadesPorRol = { mecanico: ['ordenes_ver', 'partes', 'facturar'] }
  await m.conTaller(T, async (tx: any) => {
    assert.equal(await exigir(tx, { tallerId: T, usuarioId: m.mec.id, rol: 'mecanico' }, 'facturar'), 'mecanico')
  })
})

test('capacidad extra suelta en BD suma; una reservada al dueño guardada a mano no da permiso', async () => {
  const m = montar()
  m.mec.capacidadesExtra = ['recepcion', 'usuarios'] // la fila sembrada (filas() devuelve copias)
  await m.conTaller(T, async (tx: any) => {
    const s = { tallerId: T, usuarioId: m.mec.id, rol: 'mecanico' }
    assert.ok(await exigir(tx, s, 'recepcion'))
    await assert.rejects(exigir(tx, s, 'usuarios'), SinPermisoError)
  })
})

test('último dueño: no se le quita el rol ni se le da de baja; con un segundo dueño, sí', async () => {
  const m = montar()
  await m.conTaller(T, async (tx: any) => {
    await assert.rejects(guardarRolesUsuario(tx, T, m.dueno.id, { roles: ['mecanico'], capacidadesExtra: [] }), ErrorPersonal)
    await assert.rejects(bajaUsuario(tx, T, m.dueno.id), ErrorPersonal)
    // Ser también mecánico sin dejar de ser dueño: sí.
    await guardarRolesUsuario(tx, T, m.dueno.id, { roles: ['dueno', 'mecanico'], capacidadesExtra: [] })
  })
  const d = m.bd.filas('usuarioTaller').find((u) => u.id === m.dueno.id)
  assert.deepEqual(d.roles, ['dueno', 'mecanico'])
  assert.equal(d.rol, 'dueno', 'rol principal = el de más alcance')
  await m.conTaller(T, async (tx: any) => {
    await guardarRolesUsuario(tx, T, m.mec.id, { roles: ['dueno'], capacidadesExtra: [] })
    await guardarRolesUsuario(tx, T, m.dueno.id, { roles: ['mecanico', 'recepcion'], capacidadesExtra: ['facturar'] })
    await assert.rejects(guardarRolesUsuario(tx, T, m.mec.id, { roles: ['admin'], capacidadesExtra: [] }), ErrorPersonal, 'ahora el último es él')
    await assert.rejects(guardarRolesUsuario(tx, T, m.mec2.id, { roles: ['mecanico'], capacidadesExtra: ['ajustes'] }), ErrorPersonal, 'reservada')
  })
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === m.dueno.id).rol, 'recepcion')
})

// Cepos de la corrección a mano de una póliza en el portal del cliente.
//
// Dos cosas se vigilan aquí, y ninguna es «que compile»:
//  1. Que el parche distinga «no lo toques» (clave ausente) de «bórralo» (null),
//     y que no deje entrar una fecha imposible — sobre `fechaVencimiento` se manda
//     un aviso de renovación al cliente, así que una fecha inventada es una mentira
//     firmada por la correduría.
//  2. Que la escritura filtre por `identidadId`. En este portal el aislamiento NO
//     lo da RLS: lo da el código. Un `update({ where: { id } })` a secas deja
//     editar la póliza de otro conociendo el uuid, y no falla nunca.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Se importa el FUENTE por ruta, no por el alias `@/`: la raíz del monorepo no
// resuelve los paths de la app y `node --test` no sabría de dónde sacarlo.
import { normalizarParche, parsearFechaISO } from '../apps/asegura-portal/lib/poliza-editable.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const HOY = new Date(Date.UTC(2026, 8, 3))

const ok = (r: ReturnType<typeof normalizarParche>) => {
  assert.equal(r.ok, true, `esperaba ok, salió ${JSON.stringify(r)}`)
  return (r as { ok: true; parche: Record<string, unknown> }).parche
}
const fallo = (r: ReturnType<typeof normalizarParche>) => {
  assert.equal(r.ok, false, `esperaba error, salió ${JSON.stringify(r)}`)
  return (r as { ok: false; error: string }).error
}

// ── 1. Vacío es un BORRADO, no una cadena ────────────────────────────────────

test('cadena vacia y solo espacios se guardan como null, no como ""', () => {
  // Un `compania: ''` es un «no lo sé» disfrazado de valor: se cuela por todas
  // las guardas basadas en NULL y luego la ficha enseña una compañía sin nombre.
  for (const vacio of ['', '   ', '\t\n']) {
    const p = ok(normalizarParche({ compania: vacio }, HOY))
    assert.equal(p.compania, null, `${JSON.stringify(vacio)} debe ser null`)
  }
  assert.equal(ok(normalizarParche({ numeroPoliza: '  ' }, HOY)).numeroPoliza, null)
  assert.equal(ok(normalizarParche({ ramo: '' }, HOY)).ramo, null)
})

test('el texto util se conserva recortado', () => {
  const p = ok(normalizarParche({ compania: '  Mapfre  ', ramo: 'hogar' }, HOY))
  assert.equal(p.compania, 'Mapfre')
  assert.equal(p.ramo, 'hogar')
})

// ── 2. AUSENTE ≠ null: es toda la diferencia entre un PATCH y un reemplazo ────

test('una clave AUSENTE no se toca; la misma clave a null SI se borra', () => {
  // Sin esta distinción, una pantalla que manda solo el campo editado borraría
  // en silencio los otros cuatro.
  const ausente = ok(normalizarParche({ compania: 'Axa' }, HOY))
  assert.equal('ramo' in ausente, false, 'ramo ausente no puede aparecer en el parche')
  assert.equal('primaAnual' in ausente, false)
  assert.equal('fechaVencimiento' in ausente, false)

  const borrado = ok(normalizarParche({ compania: 'Axa', ramo: null }, HOY))
  assert.equal('ramo' in borrado, true, 'ramo a null SÍ tiene que viajar en el parche')
  assert.equal(borrado.ramo, null)
})

test('undefined explicito se trata como ausente, no como borrado', () => {
  const p = normalizarParche({ compania: 'Axa', ramo: undefined }, HOY)
  assert.equal('ramo' in ok(p), false)
})

test('ninguna clave desconocida se propaga', () => {
  const p = ok(normalizarParche(
    { compania: 'Axa', identidadId: 'otro', procedencia: 'compania', id: 'x', confirmadaPorUsuario: true },
    HOY,
  ))
  assert.deepEqual(Object.keys(p), ['compania'])
})

test('un cuerpo sin ninguna clave conocida es un error, no un parche vacio', () => {
  assert.equal(fallo(normalizarParche({}, HOY)), 'parche_vacio')
  assert.equal(fallo(normalizarParche({ loQueSea: 1 }, HOY)), 'parche_vacio')
})

test('un cuerpo que no es objeto se rechaza', () => {
  for (const basura of [null, 'texto', 42, [1, 2], true]) {
    assert.equal(fallo(normalizarParche(basura, HOY)), 'cuerpo_invalido')
  }
})

// ── 3. Fechas: la imposible es peor que la ausente ───────────────────────────

test('2026-02-31 se rechaza: JS la desbordaria a marzo sin avisar', () => {
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '2026-02-31' }, HOY)), 'fecha_inexistente')
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '2026-13-01' }, HOY)), 'fecha_inexistente')
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '2025-02-29' }, HOY)), 'fecha_inexistente')
  // Y el año bisiesto de verdad SÍ pasa.
  assert.ok(normalizarParche({ fechaVencimiento: '2024-02-29' }, HOY).ok)
})

test('una fecha de 1970 y una de 2200 se rechazan', () => {
  // Un aviso de renovación sobre un vencimiento de 1970 o de 2200 es una mentira
  // que el cliente sí lee.
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '1970-01-01' }, HOY)), 'fecha_fuera_de_rango')
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '1989-12-31' }, HOY)), 'fecha_fuera_de_rango')
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '2200-01-01' }, HOY)), 'fecha_fuera_de_rango')
  // El borde de abajo sí entra.
  assert.ok(normalizarParche({ fechaVencimiento: '1990-01-01' }, HOY).ok)
})

test('solo se acepta YYYY-MM-DD; nada de new Date(loQueSea)', () => {
  for (const mala of ['03/09/2026', '2026-9-3', '2026-09-03T10:00:00Z', 'mañana', '20260903']) {
    assert.equal(fallo(normalizarParche({ fechaVencimiento: mala }, HOY)), 'fecha_formato', String(mala))
  }
  assert.equal(fallo(normalizarParche({ fechaVencimiento: 1757000000000 }, HOY)), 'fecha_formato')
})

test('una fecha valida sale como Date a medianoche UTC', () => {
  const p = ok(normalizarParche({ fechaVencimiento: '2027-01-15' }, HOY))
  const f = p.fechaVencimiento as Date
  assert.ok(f instanceof Date)
  assert.equal(f.toISOString(), '2027-01-15T00:00:00.000Z')
  // Y en UTC, para que «vence el 15» no se lea «14» al formatear.
  assert.equal(f.getUTCDate(), 15)
  assert.equal(f.getUTCMonth(), 0)
  assert.equal(f.getUTCFullYear(), 2027)
})

test('fecha a null o vacia borra el vencimiento', () => {
  assert.equal(ok(normalizarParche({ fechaVencimiento: null }, HOY)).fechaVencimiento, null)
  assert.equal(ok(normalizarParche({ fechaVencimiento: '  ' }, HOY)).fechaVencimiento, null)
})

test('parsearFechaISO es coherente con el parche', () => {
  const r = parsearFechaISO('2026-06-01', HOY)
  assert.equal(r.ok, true)
  assert.equal((r as { ok: true; fecha: Date }).fecha.toISOString(), '2026-06-01T00:00:00.000Z')
  assert.equal((parsearFechaISO('2026-02-31', HOY) as { error: string }).error, 'fecha_inexistente')
})

// ── 4. Prima: número finito >= 0 ─────────────────────────────────────────────

test('prima negativa, NaN e Infinity se rechazan', () => {
  assert.equal(fallo(normalizarParche({ primaAnual: -1 }, HOY)), 'prima_negativa')
  assert.equal(fallo(normalizarParche({ primaAnual: -0.01 }, HOY)), 'prima_negativa')
  assert.equal(fallo(normalizarParche({ primaAnual: Number.NaN }, HOY)), 'prima_invalida')
  assert.equal(fallo(normalizarParche({ primaAnual: Number.POSITIVE_INFINITY }, HOY)), 'prima_invalida')
  assert.equal(fallo(normalizarParche({ primaAnual: 'doscientos' }, HOY)), 'prima_invalida')
  assert.equal(fallo(normalizarParche({ primaAnual: {} }, HOY)), 'prima_invalida')
  assert.equal(fallo(normalizarParche({ primaAnual: true }, HOY)), 'prima_invalida')
})

test('prima acepta numero, string numerica y coma decimal; cero es un dato', () => {
  assert.equal(ok(normalizarParche({ primaAnual: 412.5 }, HOY)).primaAnual, 412.5)
  assert.equal(ok(normalizarParche({ primaAnual: ' 412.50 ' }, HOY)).primaAnual, 412.5)
  assert.equal(ok(normalizarParche({ primaAnual: '412,50' }, HOY)).primaAnual, 412.5)
  // 0 € es un importe real, no un «no se sabe»: no puede colapsar a null.
  assert.equal(ok(normalizarParche({ primaAnual: 0 }, HOY)).primaAnual, 0)
})

test('prima a null o cadena vacia borra el importe', () => {
  assert.equal(ok(normalizarParche({ primaAnual: null }, HOY)).primaAnual, null)
  assert.equal(ok(normalizarParche({ primaAnual: '' }, HOY)).primaAnual, null)
})

// ── 5. Cepo del route: sin `identidadId` en el WHERE no hay portal ───────────

test('el PATCH filtra por identidadId y NUNCA usa update() a secas', () => {
  const fuente = leer('apps/asegura-portal/app/api/polizas/[id]/route.ts')

  assert.match(fuente, /export async function PATCH/, 'el route tiene que exportar PATCH')
  assert.match(fuente, /export const runtime = 'nodejs'/, 'runtime nodejs')

  // La escritura va por updateMany, que es lo único que admite un WHERE compuesto.
  assert.match(
    fuente,
    /portalPolizaDeclarada\.updateMany\(/,
    'la escritura tiene que ser updateMany, no update',
  )
  // Y el WHERE lleva identidadId: sin esto, con el uuid de otro se edita su bóveda.
  assert.match(
    fuente,
    /where:\s*\{[^}]*identidadId:\s*identidad\.id/,
    'el where de la escritura tiene que filtrar por identidadId',
  )
  // `update(`, `upsert(` y `delete(` por id a secas quedan prohibidos aquí.
  assert.equal(
    /portalPolizaDeclarada\.(update|upsert|delete)\(/.test(fuente),
    false,
    'nada de update()/upsert()/delete() a secas: eso deja editar la póliza de otro',
  )

  // La identidad sale de la cookie, no del cuerpo ni de la URL.
  assert.match(fuente, /requireIdentidad\(\)/)
  assert.equal(
    /identidadId:\s*(cuerpo|body|parche|datos)\b/.test(fuente),
    false,
    'la identidad nunca puede venir del cuerpo de la petición',
  )

  // count === 0 → 404, y no un 200 silencioso que finge haber guardado.
  assert.match(fuente, /count === 0/)
  assert.match(fuente, /no_encontrada/)
  assert.match(fuente, /status:\s*404/)
  assert.match(fuente, /sin_sesion/)
  assert.match(fuente, /status:\s*401/)

  // El parche pasa por el normalizador; nada de volcar el JSON crudo en `data`.
  assert.match(fuente, /normalizarParche\(/)
  assert.match(fuente, /confirmadaPorUsuario:\s*true/)
  assert.match(fuente, /procedencia:\s*'declarado'/)
})

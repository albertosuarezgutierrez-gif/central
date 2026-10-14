// Cepos del CABLEADO de la F2 del plan de robustez (14/10/2026): atasco, corte por compañía/ramo y aprendido con confianza.
// Las reglas puras se prueban en packages/module-tarificacion/src/robustez.test.ts; aquí se lee el FUENTE (lo que va dentro
// de un SQL no lo caza tsc). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { leerPeticionCierre } from './tarificador-formador-reglas.ts'

const APP = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(APP, rel), 'utf8')
const tramo = (src: string, desde: string, hasta: string) => src.slice(src.indexOf(desde), src.indexOf(hasta, src.indexOf(desde) + desde.length))

test('marcarFallo: el atasco solo en tarificar, sin el checkpoint en el error jsonb, y el corte tras un error_definitivo', () => {
  const src = leer('lib/tarificador.ts')
  const mf = tramo(src, 'async function marcarFallo(', '// ─── Barrido')
  assert.match(mf, /const \{ atasco: atascoCable, \.\.\.errorSinAtasco \} = error\s+error = errorSinAtasco/, 'el checkpoint (con selectores) no puede acabar en el error jsonb')
  assert.ok(mf.indexOf('error = errorSinAtasco') < mf.indexOf('const err = JSON.stringify'), 'se quita el atasco ANTES de serializar el error')
  assert.match(mf, /const atasco = !deEmision && !deExploracion\s+\? await atascoParaFallo\(/, 'emisión y exploración nunca se atascan')
  assert.match(mf, /terminado_at = case when \$\{abierto\} then null else now\(\) end/, 'un atascado no se da por terminado')
  assert.match(mf, /if \(tocada && atasco\)[\s\S]*?guardarAtasco\(db,/, 'el checkpoint se guarda SOLO si el UPDATE tocó la fila')
  assert.match(mf, /if \(tocada && estado === 'error_definitivo' && !deEmision && !deExploracion\) await evaluarCorte\(db, id\)/, 'el corte se evalúa tras cada error_definitivo de tarificar')
})

test('cola: no se encola ni se reclama una pareja en pausa; el barrido caduca los atascos', () => {
  const src = leer('lib/tarificador.ts')
  const encolar = tramo(src, 'export async function encolarTrabajo', '// ─── Reclamar y lanzar')
  assert.match(encolar, /if \(await pausaViva\(prisma, e\.correduriaId, claveCompania\(e\.compania\), e\.ramo\)\)/, 'encolar no mira la pausa')
  const reclamar = tramo(src, 'export async function reclamarSiguiente', 'export type DepsLanzador')
  assert.match(reclamar, /const sinPausa = await sqlSinPausa\(\)/)
  assert.match(reclamar, /= any\(\$\{\[\.\.\.modos\]\}::text\[\]\)\s+\$\{sinPausa\}/, 'la condición de pausa tiene que ir en el where del reclamo')
  assert.match(tramo(src, 'export async function barrerTarificadorRpa', 'r.reencolados = await'), /caducarAtascos\(correduriaId\)/)
})

test('robustez (BD): la pausa sin el SQL no rompe la cola; responder re-encola el MISMO trabajo y aprende como humano', () => {
  const src = leer('lib/tarificador-robustez.ts')
  const sp = tramo(src, 'export async function sqlSinPausa', '\n}\n')
  assert.match(sp, /if \(!\(await hayPausas\(\)\)\) return Prisma\.empty/, 'sin la tabla, la condición tiene que ser VACÍA (nombrarla rompería la cola)')
  const resp = tramo(src, 'export async function responderAtasco', '// ─── ATASCO: caducidad')
  assert.match(resp, /for update of a, t/, 'responder sin cerrojo de atasco y trabajo')
  assert.match(resp, /elegirCandidatoAtasco\(a\.candidatos, r\.n\)/, 'el número se valida contra la lista guardada')
  assert.match(resp, /'humano', 0, 0, now\(\)/, 'lo elegido se aprende como humano y consolidado')
  assert.match(resp, /set estado = 'pendiente', intentos = 0,[^`]*where id = \$\{f\.trabajo_id\}::uuid and estado = 'atascado'/, 'el MISMO trabajo vuelve a pendiente con intentos a 0')
  const lista = tramo(src, 'export async function listarAtascos', '/** Marca como avisados')
  assert.match(lista, /candidatos: candidatosVisibles\(a\)/, 'hacia fuera, solo candidatosVisibles (sin selector)')
  assert.match(lista, /where a\.correduria_id = \$\{correduriaId\}::uuid/, 'listar por correduría')
  // Toda consulta del puerto filtra por correduría.
  for (const fn of ['listarPausas', 'marcarPausasAvisadas', 'reanudarPausa', 'marcarAtascosAvisados', 'caducarAtascos']) {
    assert.match(tramo(src, `export async function ${fn}`, '\n}\n'), /correduria_id = \$\{correduriaId\}::uuid/, `${fn} sin filtro de correduría`)
  }
})

test('rutas del puerto: escrituras auditadas y respuesta de Alberto validada', () => {
  for (const r of ['app/api/operador/tarificador/atascos/route.ts', 'app/api/operador/tarificador/atascos/[id]/route.ts', 'app/api/operador/tarificador/pausas/[id]/route.ts']) {
    assert.match(leer(r), /export const POST = auditado\(/, `${r}: POST sin auditado()`)
  }
  const r = leer('app/api/operador/tarificador/atascos/[id]/route.ts')
  assert.match(r, /b\.n >= 1 && b\.n <= 20/, 'el número elegido acotado a la lista')
  assert.match(r, /res\.estado === 'respondido' && !res\.pausada && rpaActivo\(process\.env\)/, 'no se lanza una pareja en pausa ni con el RPA apagado')
})

test('cierre del formador: aprendidoFallido es accesorio (lo malo se descarta, no tumba el cierre)', () => {
  const ID = '00000000-0000-4000-8000-000000000000'
  const ok = leerPeticionCierre({ trabajoId: ID, resultado: 'error', aprendidoFallido: [{ clave: 'calcular', tipo: 'accion', selector: '#c' }, { clave: 'MAL', tipo: 'accion', selector: '#x' }, { clave: 'a', tipo: 'otro', selector: '#y' }] })
  assert.ok(ok.ok)
  if (ok.ok) assert.deepEqual(ok.p.aprendidoFallido, [{ clave: 'calcular', tipo: 'accion', selector: '#c' }])
  const sin = leerPeticionCierre({ trabajoId: ID, resultado: 'ok' })
  assert.ok(sin.ok && sin.p.aprendidoFallido.length === 0)
  const cierre = leer('app/api/tarificador/formador/cierre/route.ts')
  assert.match(cierre, /const fallos = r\.repetido \? 0 : await registrarFallosConocimiento\(t, l\.p\.aprendidoFallido\)/, 'un cierre repetido no suma fallos dos veces')
})

test('aprendido: lo descartado no se sirve y un éxito pone los fallos a cero', () => {
  const src = leer('lib/tarificador-formador.ts')
  const leerC = tramo(src, 'export async function leerConocimiento', '\n}\n')
  assert.match(leerC, /and descartado_at is null/, 'lo descartado se sigue sirviendo al worker')
  const conf = tramo(src, 'export async function confirmarConocimiento', '\n}\n')
  assert.match(conf, /fallos = 0, descartado_at = null/, 'un éxito no limpia los fallos')
  const fallo = tramo(src, 'export async function registrarFallosConocimiento', '\n}\n')
  assert.match(fallo, /fallos \+ 1 >= \$\{UMBRAL_DESCARTAR_APRENDIDO\}::int then now\(\)/)
})

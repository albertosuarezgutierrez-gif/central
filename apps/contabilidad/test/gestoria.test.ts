// F6 · portal de la gestoría en la app: comentarios y revisiones por asiento/documento y, sobre todo, AISLAMIENTO entre empresas.
// Cepos vistos FALLAR el 07/11/2026 (rompiendo el código y restaurando):
//   (1) en `bandejaGestor` (package) quitar el filtro de rol gestor → rojo en «el gestor solo consulta las empresas que tiene asignadas»;
//   (2) en `fuenteContadores` convertir el `catch(() => null)` en `catch(() => 0)` → rojo en «un contador que falla es null, nunca 0»;
//   (3) en la ruta de revisiones leer `empresaId` del cuerpo (`b.empresaId ?? c.empresaId`) → rojo en «las rutas toman la empresa SOLO de la sesión».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { VinculoUsuario } from '@central/module-contabilidad'
import { anotarComentario, bandejaDelUsuario, fuenteContadores, marcarRevisado } from '../lib/gestoria.ts'
import { registrarAsientoManual } from '../lib/servicio.ts'
import { crearAlmacen } from './_repo-memoria.ts'
import { f6Memoria } from './_f6-memoria.ts'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const GESTOR = '00000000-0000-4000-8000-0000000000f1'
const DUENO_A = '00000000-0000-4000-8000-0000000000d1'
const asiento = (n: number) => ({ fecha: '2026-02-01', concepto: `Aportación ${n}`, apuntes: [{ cuenta: '572', debe: 1000 * n, haber: 0 }, { cuenta: '100', debe: 0, haber: 1000 * n }] })

async function escenario() {
  const al = crearAlmacen()
  const dA = al.empresaLista(A), dB = al.empresaLista(B), dC = al.empresaLista(C)
  // A: 3 asientos · B: 7 asientos (el gestor NO está asignado a B) · C: 2 (el usuario es DUEÑO de C, no gestor)
  const ids: Record<string, string[]> = { A: [], B: [], C: [] }
  for (const [k, e, n] of [['A', A, 3], ['B', B, 7], ['C', C, 2]] as const) for (let i = 1; i <= n; i++) {
    const r = await registrarAsientoManual(al.repo(e), asiento(i), { actor: 'usuario' })
    assert.equal(r.ok, true); if (r.ok) ids[k].push(r.id)
  }
  dA.vinculos.push({ usuarioId: GESTOR, rol: 'gestor', activo: true }, { usuarioId: DUENO_A, rol: 'dueno', activo: true })
  dC.vinculos.push({ usuarioId: GESTOR, rol: 'dueno', activo: true })
  void dB
  const f6 = { A: f6Memoria(dA), B: f6Memoria(dB), C: f6Memoria(dC) }
  return { al, ids, f6, datos: { A: dA, B: dB, C: dC } }
}
const vinculos: VinculoUsuario[] = [{ empresaId: A, razonSocial: 'Empresa A', rol: 'gestor' }, { empresaId: C, razonSocial: 'Empresa C', rol: 'dueno' }]
const porEmpresa = (f6: Record<string, ReturnType<typeof f6Memoria>>) => (id: string) => (id === A ? f6.A : id === B ? f6.B : f6.C)

test('el gestor solo consulta las empresas que tiene asignadas: ni la de la que es dueño ni la ajena, y los números son los de SU empresa', async () => {
  const { f6 } = await escenario()
  const abiertas: string[] = []
  const bandeja = await bandejaDelUsuario(vinculos, fuenteContadores(async (id, fn) => { abiertas.push(id); return fn(porEmpresa(f6)(id)) }))
  assert.deepEqual([...new Set(abiertas)], [A]) // 4 transacciones (una por contador), todas de A
  assert.equal(bandeja.empresas.length, 1)
  assert.equal(bandeja.empresas[0].empresaId, A)
  assert.equal(bandeja.empresas[0].asientosSinRevisar, 3) // no 7 (B) ni 2 (C), ni 12 (todas)
  assert.equal(bandeja.totalGeneral, 3)
})

test('un contador que falla es null, nunca 0: la empresa queda incompleta y los demás contadores se conservan', async () => {
  const { f6 } = await escenario()
  const roto = { ...f6.A, contarAvisosSinLeer: async () => { throw new Error('relation "contabilidad.avisos" does not exist') } }
  const bandeja = await bandejaDelUsuario(vinculos, fuenteContadores(async (_id, fn) => fn(roto)))
  const e = bandeja.empresas[0]
  assert.equal(e.avisosSinLeer, null)
  assert.equal(e.asientosSinRevisar, 3)
  assert.equal(e.incompleto, true)
})

test('comentarios: se añaden a un asiento propio y se leen en orden; el autor y su rol los fija la sesión', async () => {
  const { f6, ids } = await escenario()
  const r1 = await anotarComentario(f6.A, { usuarioId: GESTOR, rol: 'gestor' }, { asientoId: ids.A[0], texto: ' ¿Falta el justificante? ' })
  const r2 = await anotarComentario(f6.A, { usuarioId: DUENO_A, rol: 'dueno' }, { asientoId: ids.A[0], texto: 'Lo subo hoy' })
  assert.equal(r1.ok && r2.ok, true)
  const hilo = await f6.A.comentarios({ tipo: 'asiento', id: ids.A[0] }, 50)
  assert.deepEqual(hilo.map((c) => [c.rol, c.texto]), [['gestor', '¿Falta el justificante?'], ['dueno', 'Lo subo hoy']])
  assert.equal((await f6.A.asientosSinRevisar(10)).find((a) => a.id === ids.A[0])!.comentarios, 2)
  // Comentario sobre un documento (por referencia):
  assert.equal((await anotarComentario(f6.A, { usuarioId: GESTOR, rol: 'gestor' }, { documentoRef: 'adjunto-17.pdf', texto: 'Ilegible' })).ok, true)
  assert.equal((await f6.A.comentarios({ tipo: 'documento', ref: 'adjunto-17.pdf' }, 10)).length, 1)
})

test('AISLAMIENTO: comentar o revisar el asiento de OTRA empresa falla, no deja rastro en ninguna, y un id de B nunca aparece en el hilo de A', async () => {
  const { f6, ids } = await escenario()
  const intruso = await anotarComentario(f6.A, { usuarioId: GESTOR, rol: 'gestor' }, { asientoId: ids.B[0], texto: 'intento cruzado' })
  assert.equal(intruso.ok, false)
  const rev = await marcarRevisado(f6.A, { usuarioId: GESTOR, rol: 'gestor' }, { tipo: 'asiento', id: ids.B[0] })
  assert.equal(rev.ok, false)
  assert.equal(f6.A.estado.comentarios.length + f6.B.estado.comentarios.length + f6.A.estado.revisiones.length + f6.B.estado.revisiones.length, 0)
  assert.deepEqual(await f6.A.comentarios({ tipo: 'asiento', id: ids.B[0] }, 10), [])
  // En B (donde el gestor NO tiene vínculo) tampoco puede escribir aunque el asiento sea suyo.
  assert.equal((await anotarComentario(f6.B, { usuarioId: GESTOR, rol: 'gestor' }, { asientoId: ids.B[0], texto: 'no soy su gestor' })).ok, false)
  // Y en C solo es dueño: no puede actuar con rol gestor.
  assert.equal((await anotarComentario(f6.C, { usuarioId: GESTOR, rol: 'gestor' }, { asientoId: ids.C[0], texto: 'rol falso' })).ok, false)
  assert.equal((await anotarComentario(f6.C, { usuarioId: GESTOR, rol: 'dueno' }, { asientoId: ids.C[0], texto: 'como dueño sí' })).ok, true)
})

test('un gestor REVOCADO ya no puede comentar ni revisar (vínculo inactivo)', async () => {
  const { f6, ids, datos } = await escenario()
  datos.A.vinculos.find((v) => v.usuarioId === GESTOR)!.activo = false
  assert.equal((await anotarComentario(f6.A, { usuarioId: GESTOR, rol: 'gestor' }, { asientoId: ids.A[0], texto: 'hola' })).ok, false)
  assert.equal((await marcarRevisado(f6.A, { usuarioId: GESTOR, rol: 'gestor' }, { tipo: 'asiento', id: ids.A[0] })).ok, false)
})

test('revisar es idempotente y saca el asiento de pendientes sin tocar el asiento; los de apertura/cierre no cuentan como pendientes', async () => {
  const { f6, ids, datos } = await escenario()
  const g = { usuarioId: GESTOR, rol: 'gestor' as const }
  const antes = await f6.A.contarAsientosSinRevisar()
  const r1 = await marcarRevisado(f6.A, g, { tipo: 'asiento', id: ids.A[1] })
  const r2 = await marcarRevisado(f6.A, g, { tipo: 'asiento', id: ids.A[1] })
  assert.deepEqual([r1.ok && r1.nuevo, r2.ok && r2.nuevo], [true, false])
  assert.equal(await f6.A.contarAsientosSinRevisar(), antes - 1)
  assert.equal(f6.A.estado.revisiones.length, 1)
  datos.A.asientos.push({ ...datos.A.asientos[0], id: 'ap', origen: 'apertura' } as never)
  assert.equal(await f6.A.contarAsientosSinRevisar(), antes - 1)
  // Facturas: solo las de origen automático piden confirmación.
  f6.A.estado.facturas.push({ id: 'f1', origen: 'gmail', proveedor: 'P', numero: '1', fecha: '2026-01-01', total: 100 }, { id: 'f2', origen: 'manual', proveedor: 'P', numero: '2', fecha: '2026-01-01', total: 100 })
  assert.equal(await f6.A.contarFacturasAConfirmar(), 1)
  assert.equal((await marcarRevisado(f6.A, g, { tipo: 'factura_recibida', id: 'f1' })).ok, false) // id no uuid: validación
})

test('entradas mal formadas se rechazan antes de llegar al repositorio', async () => {
  const { f6 } = await escenario()
  const g = { usuarioId: GESTOR, rol: 'gestor' as const }
  for (const malo of [null, {}, { texto: 'x' }, { asientoId: 'no-uuid', texto: 'x' }, { asientoId: A, facturaId: B, texto: 'x' }]) assert.equal((await anotarComentario(f6.A, g, malo)).ok, false)
  assert.equal(f6.A.estado.comentarios.length, 0)
})

// ───────── Guardián estático: la empresa sale SOLO de la sesión ─────────
const raiz = join(import.meta.dirname, '..')
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? ficheros(p) : [p] })
}
test('las rutas de la fase 6 toman la empresa SOLO del contexto revalidado (c.empresaId): nunca del cuerpo, de la URL ni de parámetros', () => {
  const rutas = ['gestoria', 'exportar', 'onboarding', 'factura-electronica'].flatMap((d) => ficheros(join(raiz, 'app', 'api', d))).filter((f) => f.endsWith('route.ts'))
  assert.ok(rutas.length >= 5)
  for (const f of rutas) {
    const src = readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    const usos = [...src.matchAll(/[A-Za-z_.]*empresaId[A-Za-z_]*/gi)].map((m) => m[0])
    for (const u of usos) assert.equal(u, 'c.empresaId', `${f}: «${u}» no viene del contexto`)
    assert.doesNotMatch(src, /searchParams\.get\(['"]empresa/i, f)
    assert.doesNotMatch(src, /\b(b|body)\??\.empresa/i, f)
    if (!f.endsWith('factura-electronica/route.ts')) assert.match(src, /leerContexto\(\)/, f)
  }
})

test('el portal /gestoria deriva sus empresas de la BD por usuario (empresasDeUsuarioBd) y no lee parámetros de la URL; /gestoria/pendientes usa el contexto', () => {
  const portal = readFileSync(join(raiz, 'app', 'gestoria', 'page.tsx'), 'utf8')
  assert.match(portal, /empresasDeUsuarioBd\(u\.usuarioId\)/)
  assert.doesNotMatch(portal, /searchParams|params\b/)
  assert.match(portal, /bandejaDelUsuario\(vinculos/)
  const pend = readFileSync(join(raiz, 'app', 'gestoria', 'pendientes', 'page.tsx'), 'utf8')
  assert.match(pend, /datosPagina\(\)/)
  assert.doesNotMatch(pend, /searchParams/)
  const mw = readFileSync(join(raiz, 'middleware.ts'), 'utf8')
  assert.match(mw, /SIN_EMPRESA = \[[^\]]*'\/gestoria'/)
  assert.doesNotMatch(mw, /SIN_EMPRESA = \[[^\]]*'\/gestoria\/pendientes'/)
})

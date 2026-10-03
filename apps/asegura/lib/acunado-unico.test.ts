// Cepo de la compuerta atómica del acuñado (`lib/acunado-unico.ts`, 03/10/2026): dos acuñados
// concurrentes del MISMO proyecto Codeoscopic → UNA póliza; el segundo sale por `ya_acunada` con la
// póliza del primero y sin crear nada.
//
// Tres capas:
//  1. Una BD falsa que imita lo que hace Postgres con `INSERT … ON CONFLICT DO UPDATE … WHERE`
//     (bloqueo de fila hasta el COMMIT y WHERE re-evaluado contra la fila confirmada). Prueba la
//     ORQUESTACIÓN: si la compuerta no va primero, o se ignora su respuesta, salen dos pólizas.
//  2. Postgres DE VERDAD si hay `ASEGURA_PG_TEST_URL` (un Postgres desechable: crea su propio schema).
//     En CI no hay, y se salta; se corrió en local el 03/10/2026 contra Postgres 16.
//  3. El cableado: `registrarPolizaEmitida` crea la póliza DENTRO de `acunarUnaVez`, y `/emitir`
//     suelta su candado DESPUÉS de acuñar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acunarUnaVez, type TxCompuerta, type ProyectoAReclamar } from './acunado-unico.ts'

// ─── 1. BD falsa con semántica de bloqueo de fila ─────────────────────────────

type Fila = { estado: string; poliza_id: string | null }
type Tx = TxCompuerta & { _pendiente: { filas: Map<string, Fila>; polizas: string[] } }

class BdFalsa {
  filas = new Map<string, Fila>()
  polizas: string[] = []
  private bloqueos = new Map<string, Promise<void>>()
  private n = 0

  async transaccion<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    const pendiente = { filas: new Map<string, Fila>(), polizas: [] as string[] }
    const soltar: (() => void)[] = []
    const bd = this
    const tx: Tx = {
      _pendiente: pendiente,
      async $queryRaw<T>(q: TemplateStringsArray, ...v: unknown[]): Promise<T> {
        const sql = q.join('?').replace(/\s+/g, ' ').trim()
        const clave = `${v[0]}|${v[1]}`
        if (/^insert into codeoscopic_projects/.test(sql)) {
          // Bloqueo de fila: espera a que la otra transacción haga COMMIT/ROLLBACK.
          while (bd.bloqueos.has(clave)) await bd.bloqueos.get(clave)
          let liberar!: () => void
          bd.bloqueos.set(clave, new Promise<void>((r) => (liberar = r)))
          soltar.push(() => {
            bd.bloqueos.delete(clave)
            liberar()
          })
          const confirmada = bd.filas.get(clave)
          if (!confirmada) {
            pendiente.filas.set(clave, { estado: 'emitida', poliza_id: null })
            return [{ id: 'nueva' }] as T
          }
          // El WHERE del DO UPDATE se evalúa contra la fila YA confirmada. Sin él, siempre actualiza.
          if (sql.includes("where codeoscopic_projects.estado <> 'emitida'") && confirmada.estado === 'emitida') return [] as T
          pendiente.filas.set(clave, { ...confirmada, estado: 'emitida' })
          return [{ id: 'existente' }] as T
        }
        if (/^select poliza_id/.test(sql)) {
          const f = bd.filas.get(clave)
          return (f ? [{ poliza_id: f.poliza_id }] : []) as T
        }
        throw new Error(`consulta no prevista en la BD falsa: ${sql}`)
      },
    }
    try {
      const r = await fn(tx)
      for (const [k, f] of pendiente.filas) this.filas.set(k, f)
      this.polizas.push(...pendiente.polizas)
      return r
    } finally {
      for (const s of soltar) s()
    }
  }

  /** Lo que hace el `crear` de `registrarPolizaEmitida`: insertar la póliza y enlazarla. */
  crearPoliza(tx: Tx, p: ProyectoAReclamar): string {
    const id = `poliza-${++this.n}`
    tx._pendiente.polizas.push(id)
    const clave = `${p.correduriaId}|${p.projectIdCodeoscopic}`
    const f = tx._pendiente.filas.get(clave) ?? this.filas.get(clave) ?? { estado: 'emitida', poliza_id: null }
    tx._pendiente.filas.set(clave, { ...f, poliza_id: id })
    return id
  }
}

const PROYECTO: ProyectoAReclamar = { correduriaId: 'c-1', projectIdCodeoscopic: '40967960', producto: 'moto', clienteId: 'cl-1' }
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

for (const filaPrevia of [null, 'preemision', 'riesgo_condicionado'] as const) {
  test(`dos acuñados concurrentes del mismo proyecto → UNA póliza (fila previa: ${filaPrevia ?? 'ninguna'})`, async () => {
    const bd = new BdFalsa()
    if (filaPrevia) bd.filas.set('c-1|40967960', { estado: filaPrevia, poliza_id: 'retarificada' })
    const transaccion = <R>(fn: (tx: Tx) => Promise<R>) => bd.transaccion(fn)
    const crear = async (tx: Tx) => {
      await pausa(20) // la ventana en la que antes cabía el segundo acuñado
      return bd.crearPoliza(tx, PROYECTO)
    }
    const [a, b] = await Promise.all([acunarUnaVez(transaccion, PROYECTO, crear), acunarUnaVez(transaccion, PROYECTO, crear)])

    assert.equal(bd.polizas.length, 1, 'se han acuñado dos pólizas del mismo proyecto')
    const ganador = [a, b].find((r) => r.tipo === 'acunada')
    const perdedor = [a, b].find((r) => r.tipo === 'ya_acunada')
    assert.ok(ganador && perdedor, `esperaba una acuñada y una ya_acunada: ${JSON.stringify([a, b])}`)
    assert.equal(perdedor.polizaId, ganador.polizaId, 'el segundo devuelve la póliza del primero (idempotente)')
    assert.equal(bd.filas.get('c-1|40967960')?.poliza_id, ganador.polizaId)
  })
}

test('un tercer acuñado, ya en frío, también es idempotente y no llama a crear', async () => {
  const bd = new BdFalsa()
  bd.filas.set('c-1|40967960', { estado: 'emitida', poliza_id: 'poliza-vieja' })
  let llamadas = 0
  const r = await acunarUnaVez(<R>(fn: (tx: Tx) => Promise<R>) => bd.transaccion(fn), PROYECTO, async (tx) => {
    llamadas++
    return bd.crearPoliza(tx, PROYECTO)
  })
  assert.deepEqual(r, { tipo: 'ya_acunada', polizaId: 'poliza-vieja' })
  assert.equal(llamadas, 0)
  assert.equal(bd.polizas.length, 0)
})

test('si el primero falla al crear (ROLLBACK), el segundo acuña: la compuerta no deja el proyecto bloqueado', async () => {
  const bd = new BdFalsa()
  bd.filas.set('c-1|40967960', { estado: 'preemision', poliza_id: null })
  const transaccion = <R>(fn: (tx: Tx) => Promise<R>) => bd.transaccion(fn)
  const primero = acunarUnaVez(transaccion, PROYECTO, async () => {
    await pausa(10)
    throw new Error('violación de constraint en polizas')
  })
  const segundo = acunarUnaVez(transaccion, PROYECTO, async (tx) => bd.crearPoliza(tx, PROYECTO))
  await assert.rejects(primero)
  const r = await segundo
  assert.equal(r.tipo, 'acunada')
  assert.equal(bd.polizas.length, 1)
})

// ─── 2. Postgres de verdad (opcional) ────────────────────────────────────────

const PG = process.env.ASEGURA_PG_TEST_URL
test('Postgres real: dos acuñados concurrentes → una póliza', { skip: PG ? false : 'sin ASEGURA_PG_TEST_URL' }, async () => {
  const schema = `acunado_test_${process.pid}`
  const url = `${PG}${PG!.includes('?') ? '&' : '?'}schema=${schema}&connection_limit=4`
  const { PrismaClient } = (await import('./generated/asegura-client/index.js')) as {
    PrismaClient: new (o: unknown) => {
      $executeRawUnsafe(q: string): Promise<number>
      $queryRawUnsafe<T>(q: string): Promise<T>
      $transaction<R>(fn: (tx: TxCompuerta & { $executeRaw(q: TemplateStringsArray, ...v: unknown[]): Promise<number> }) => Promise<R>): Promise<R>
      $disconnect(): Promise<void>
    }
  }
  const db = new PrismaClient({ datasources: { db: { url } } })
  try {
    for (const q of [
      `drop schema if exists ${schema} cascade`,
      `create schema ${schema}`,
      `create type ${schema}.tipo_seguro as enum ('auto','moto')`,
      `create type ${schema}.codeoscopic_project_estado as enum ('preemision','riesgo_condicionado','emitida','error','rechazada')`,
      `create table ${schema}.codeoscopic_projects (id uuid primary key default gen_random_uuid(), correduria_id uuid not null,
         project_id_codeoscopic text not null, producto ${schema}.tipo_seguro not null, cliente_id uuid,
         estado ${schema}.codeoscopic_project_estado not null, poliza_id uuid, error_mensaje text, updated_at timestamptz default now())`,
      `create unique index on ${schema}.codeoscopic_projects (correduria_id, project_id_codeoscopic)`,
      `create table ${schema}.polizas (id uuid primary key default gen_random_uuid(), proyecto text)`,
    ]) await db.$executeRawUnsafe(q)

    const p: ProyectoAReclamar = {
      correduriaId: '00000000-0000-0000-0000-000000000001',
      projectIdCodeoscopic: '40967960',
      producto: 'moto',
      clienteId: '00000000-0000-0000-0000-000000000002',
    }
    for (const filaPrevia of [false, true]) {
      await db.$executeRawUnsafe(`truncate ${schema}.codeoscopic_projects, ${schema}.polizas`)
      if (filaPrevia) {
        await db.$executeRawUnsafe(`insert into ${schema}.codeoscopic_projects (correduria_id, project_id_codeoscopic, producto, estado)
          values ('${p.correduriaId}', '${p.projectIdCodeoscopic}', 'moto', 'preemision')`)
      }
      type TxPg = Parameters<Parameters<typeof db.$transaction>[0]>[0]
      const crear = async (tx: TxPg) => {
        const [fila] = await tx.$queryRaw<{ id: string }[]>`insert into polizas (proyecto) values (${p.projectIdCodeoscopic}) returning id::text as id`
        await tx.$queryRaw`select pg_sleep(0.3)::text as s`
        await tx.$executeRaw`update codeoscopic_projects set poliza_id = ${fila.id}::uuid
          where correduria_id = ${p.correduriaId}::uuid and project_id_codeoscopic = ${p.projectIdCodeoscopic}`
        return fila.id
      }
      const transaccion = <R>(fn: (tx: TxPg) => Promise<R>) => db.$transaction(fn)
      const rs = await Promise.all([acunarUnaVez(transaccion, p, crear), acunarUnaVez(transaccion, p, crear), acunarUnaVez(transaccion, p, crear)])
      const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int as n from ${schema}.polizas`)
      assert.equal(n, 1, `fila previa=${filaPrevia}: ${n} pólizas del mismo proyecto`)
      const ganador = rs.find((r) => r.tipo === 'acunada')
      assert.ok(ganador)
      for (const r of rs.filter((x) => x !== ganador)) assert.deepEqual(r, { tipo: 'ya_acunada', polizaId: ganador.polizaId })
    }
  } finally {
    await db.$executeRawUnsafe(`drop schema if exists ${schema} cascade`).catch(() => undefined)
    await db.$disconnect()
  }
})

// ─── 3. Cableado ─────────────────────────────────────────────────────────────

test('registrarPolizaEmitida crea la póliza DENTRO de la compuerta y traduce ya_acunada', () => {
  const src = readFileSync(new URL('./emision.ts', import.meta.url), 'utf8')
  const compuerta = src.indexOf('acunarUnaVez<')
  assert.ok(compuerta > 0, 'registrarPolizaEmitida ya no pasa por acunarUnaVez')
  assert.ok(src.indexOf('tx.poliza.create(') > compuerta, 'la póliza se crea fuera de la compuerta')
  assert.equal(src.match(/\.poliza\.create\(/g)?.length, 1, 'hay otra creación de póliza fuera de la compuerta')
  assert.match(src, /desenlace\.tipo === 'ya_acunada'\) return yaAcunada\(/)
})

test('/emitir suelta el candado del Submit DESPUÉS de acuñar, no antes', () => {
  const envio = readFileSync(new URL('./codeoscopic/emitir-envio.ts', import.meta.url), 'utf8')
  assert.match(envio, /cerrarEnvio\([^)]*'preemision', null, true\)/, 'el Submit aceptado vuelve a soltar el candado antes de acuñar')
  const ruta = readFileSync(new URL('../app/api/operador/codeoscopic/emitir/route.ts', import.meta.url), 'utf8')
  const acunado = ruta.indexOf('acunado = await registrarPolizaEmitida(')
  const soltar = ruta.indexOf('await soltarCandadoEnvio(')
  assert.ok(acunado > 0 && soltar > acunado, 'soltarCandadoEnvio tiene que ir tras el acuñado')
  assert.match(ruta.slice(acunado, soltar), /\} finally \{/, 'el candado se suelta en un finally (también si no hay código DGS)')
})

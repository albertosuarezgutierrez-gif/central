import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MAX_IMPORTACIONES_DIA, resumirEvaluacion, type FilaEvaluada, type NivelPatrimonio } from '@central/module-patrimonio'

import {
  responderConfirmar,
  responderDescartar,
  responderMapear,
  responderSubir,
  responderVer,
  type ContextoImportacion,
  type ImportacionLeida,
  type PuertosImportacion,
} from './importacion-api.ts'

const MIO = 'cliente-mio'
const AJENO = 'cliente-ajeno'
const ID = '11111111-1111-4111-8111-111111111111'
const enc = (s: string) => new TextEncoder().encode(s)

const CSV_INM = 'Nombre;Uso;Dirección;Código postal\nSocorro;Vivienda;Calle Socorro 24;41003\nBustos;Piso;Calle Bustos 22;41003\nMala;castillo;Calle X 1;41001\n'

/** Puertos falsos con una "BD" en memoria: lo justo para ver aislamiento, idempotencia y que nada se crea antes de confirmar. */
function banco(opciones: { accesos?: Record<string, NivelPatrimonio>; creadasHoy?: number } = {}) {
  const accesos = new Map<string, NivelPatrimonio>(Object.entries(opciones.accesos ?? { [MIO]: 'total' }))
  const importaciones = new Map<string, ImportacionLeida & { identidad: string; hash: string }>()
  const inmuebles: { id: string; alias: string; referenciaCatastral: string | null; direccionNormalizada: string | null }[] = []
  const log: string[] = []
  let seq = 0
  const p: PuertosImportacion = {
    async accesos() { return accesos },
    async creadasHoy() { return opciones.creadasHoy ?? 0 },
    async crear(x) {
      const previa = [...importaciones.values()].find((i) => i.hash === x.hash && ['propuesta', 'revisada'].includes(i.estado))
      if (previa) return { ok: true, id: previa.id, nueva: false }
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      importaciones.set(id, {
        id, identidad: 'yo', hash: x.hash, clienteId: x.clienteId, estado: 'propuesta', tipo: x.tipo, nombre: x.nombre, mapeo: x.mapeo,
        filas: x.filas.map((f) => ({ n: f.n, crudo: f.crudo, problema: f.problema, creadoId: null })), resultado: null, confirmadaEn: null,
      })
      log.push('crear-importacion')
      return { ok: true, id, nueva: true }
    },
    async leer(id) { return importaciones.get(id) ?? null },
    async contexto(): Promise<ContextoImportacion> {
      return { inmuebles: [...inmuebles], existentes: new Set(inmuebles.map((i) => `dir:${i.direccionNormalizada!.split(',')[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|41003`)) }
    },
    async guardarMapeo(id, x) {
      const i = importaciones.get(id)
      if (!i || !['propuesta', 'revisada'].includes(i.estado)) return false
      i.tipo = x.tipo; i.mapeo = x.mapeo; i.estado = 'revisada'
      for (const f of x.filas) { const g = i.filas.find((y) => y.n === f.n); if (g) g.problema = f.problema }
      return true
    },
    async confirmar(id, evaluar) {
      const i = importaciones.get(id)
      if (!i || !['propuesta', 'revisada'].includes(i.estado)) return { ok: false, motivo: 'cerrada' }
      i.estado = 'confirmada'
      const evaluadas: FilaEvaluada[] = evaluar(await p.contexto(i.clienteId, i.tipo))
      let creadas = 0
      for (const f of evaluadas) {
        if (f.estado !== 'nueva') continue
        inmuebles.push({ id: `inm-${++seq}`, alias: f.datos.alias as string, referenciaCatastral: null, direccionNormalizada: f.datos.direccionNormalizada as string })
        log.push(`crear:${f.n}`)
        creadas++
      }
      i.resultado = { creadas, ...resumirEvaluacion(evaluadas) }
      return { ok: true, evaluadas, creadas }
    },
    async descartar(id) {
      const i = importaciones.get(id)
      if (!i || !['propuesta', 'revisada'].includes(i.estado)) return false
      i.estado = 'descartada'
      return true
    },
  }
  return { p, importaciones, inmuebles, log }
}

async function subido(b = banco(), csv = CSV_INM) {
  const r = await responderSubir(b.p, { titular: MIO, tipo: 'auto', nombre: 'mis-pisos.csv', bytes: enc(csv) })
  return { b, r, id: (r.body.id as string) ?? '' }
}

test('subir: autodetecta el tipo y el mapeo, y NO crea nada del patrimonio', async () => {
  const { b, r, id } = await subido()
  assert.equal(r.status, 201)
  assert.deepEqual(b.log, ['crear-importacion'])
  assert.equal(b.inmuebles.length, 0)
  const v = await responderVer(b.p, id)
  assert.equal(v.status, 200)
  assert.equal(v.body.tipo, 'inmueble')
  assert.deepEqual(v.body.mapeo, { columnas: { alias: 0, uso: 1, referenciaCatastral: null, direccion: 2, cp: 3, municipio: null, provincia: null, enComunidad: null }, usoPorDefecto: null })
  assert.deepEqual(v.body.resumen, { nuevas: 2, yaExisten: 0, repetidas: 0, conProblema: 1, porValidar: 2 })
  const filas = v.body.filas as { n: number; estado: string; motivo: string | null }[]
  assert.deepEqual(filas.map((f) => [f.n, f.estado]), [[2, 'nueva'], [3, 'nueva'], [4, 'con_problema']])
  assert.match(filas[2].motivo!, /castillo/)
})

test('🚨 titular ajeno o sin nivel Total: la MISMA 404, y no se lee ni se guarda nada', async () => {
  const total = await responderSubir(banco().p, { titular: AJENO, tipo: 'auto', nombre: 'x.csv', bytes: enc(CSV_INM) })
  const gestion = banco({ accesos: { [MIO]: 'gestion' } })
  const g = await responderSubir(gestion.p, { titular: MIO, tipo: 'auto', nombre: 'x.csv', bytes: enc(CSV_INM) })
  const sin = await responderSubir(banco({ accesos: {} }).p, { titular: MIO, tipo: 'auto', nombre: 'x.csv', bytes: enc(CSV_INM) })
  for (const r of [total, g, sin]) assert.deepEqual(r, { status: 404, body: { error: 'no_encontrado' } })
  assert.deepEqual(gestion.log, [])
  const raro = await responderSubir(banco().p, { titular: { $ne: 1 }, tipo: 'auto', nombre: 'x.csv', bytes: enc(CSV_INM) })
  assert.equal(raro.status, 404)
})

test('🚨 importación ajena, inexistente o con id basura → 404 en ver, mapear, confirmar y descartar', async () => {
  const b = banco()
  const { id } = await subido(b)
  // Otra persona: el acceso al titular ya no existe (o nunca existió).
  const otra = { ...b.p, accesos: async () => new Map<string, NivelPatrimonio>([[AJENO, 'total']]) }
  // Retirado el acceso a Total (queda en gestión): también cierra la puerta.
  const bajado = { ...b.p, accesos: async () => new Map<string, NivelPatrimonio>([[MIO, 'gestion']]) }
  const NF = { status: 404, body: { error: 'no_encontrado' } }
  for (const p of [otra, bajado]) {
    assert.deepEqual(await responderVer(p, id), NF)
    assert.deepEqual(await responderMapear(p, id, { columnas: {} }), NF)
    assert.deepEqual(await responderConfirmar(p, id), NF)
    assert.deepEqual(await responderDescartar(p, id), NF)
  }
  assert.deepEqual(await responderVer(b.p, '00000000-0000-4000-8000-999999999999'), NF)
  assert.deepEqual(await responderVer(b.p, "1' OR '1'='1"), NF)
  assert.equal(b.importaciones.get(id)!.estado, 'propuesta', 'nada cambió')
})

test('🚨 confirmar crea solo las «nueva»; una fila con problema no se crea sola', async () => {
  const { b, id } = await subido()
  const r = await responderConfirmar(b.p, id)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.resultado, { creadas: 2, nuevas: 2, yaExisten: 0, repetidas: 0, conProblema: 1, porValidar: 2 })
  assert.deepEqual(b.inmuebles.map((i) => i.alias), ['Socorro', 'Bustos'])
  assert.ok(!b.inmuebles.some((i) => i.alias === 'Mala'))
})

test('🚨 confirmar DOS veces no duplica (la segunda es 409 cerrada)', async () => {
  const { b, id } = await subido()
  assert.equal((await responderConfirmar(b.p, id)).status, 200)
  const otra = await responderConfirmar(b.p, id)
  assert.equal(otra.status, 409)
  assert.equal(otra.body.error, 'cerrada')
  assert.equal(b.inmuebles.length, 2)
  // En paralelo, igual: solo una gana.
  const c = await subido(banco())
  const [x, y] = await Promise.all([responderConfirmar(c.b.p, c.id), responderConfirmar(c.b.p, c.id)])
  assert.deepEqual([x.status, y.status].sort(), [200, 409])
  assert.equal(c.b.inmuebles.length, 2)
})

test('🚨 reimportar el MISMO fichero ya confirmado no duplica: sus filas salen «ya existe»', async () => {
  const { b, id } = await subido()
  await responderConfirmar(b.p, id)
  const dos = await responderSubir(b.p, { titular: MIO, tipo: 'auto', nombre: 'mis-pisos.csv', bytes: enc(CSV_INM) })
  assert.equal(dos.status, 201, 'cerrada la primera, se abre una nueva')
  const v = await responderVer(b.p, dos.body.id as string)
  assert.deepEqual(v.body.resumen, { nuevas: 0, yaExisten: 2, repetidas: 0, conProblema: 1, porValidar: 0 })
  const c = await responderConfirmar(b.p, dos.body.id as string)
  assert.equal((c.body.resultado as { creadas: number }).creadas, 0)
  assert.equal(b.inmuebles.length, 2)
})

test('subir el mismo fichero mientras sigue abierto devuelve LA MISMA importación (200, no 201)', async () => {
  const { b, id } = await subido()
  const otra = await responderSubir(b.p, { titular: MIO, tipo: 'auto', nombre: 'otra-vez.csv', bytes: enc(CSV_INM) })
  assert.equal(otra.status, 200)
  assert.equal(otra.body.id, id)
  assert.equal(otra.body.nueva, false)
  assert.equal(b.importaciones.size, 1)
})

test('mapear: corregir columnas recalcula la vista previa; mapeo incompleto no deja confirmar; columna inexistente = 400', async () => {
  const csv = 'Col A;Col B;Col C\nPiso 1;vivienda;Calle Sol 4\n'
  const { b, id, r } = await subido(banco(), csv)
  assert.equal(r.status, 422, 'no se parece a nada: no se adivina el tipo')
  const dos = await responderSubir(b.p, { titular: MIO, tipo: 'inmueble', nombre: 'x.csv', bytes: enc(csv) })
  assert.equal(dos.status, 201)
  const id2 = dos.body.id as string
  assert.equal((await responderConfirmar(b.p, id2)).status, 409, 'sin alias/dirección ni uso')
  assert.equal(id, '')
  const bien = await responderMapear(b.p, id2, { columnas: { alias: 0, uso: 1, direccion: 2 } })
  assert.equal(bien.status, 200)
  assert.deepEqual(bien.body.faltan, [])
  assert.deepEqual(bien.body.resumen, { nuevas: 1, yaExisten: 0, repetidas: 0, conProblema: 0, porValidar: 1 })
  assert.equal((await responderMapear(b.p, id2, { columnas: { alias: 9 } })).status, 400)
  assert.equal((await responderMapear(b.p, id2, { columnas: { alias: 0, uso: 0 } })).status, 400, 'una columna no vale para dos campos')
})

test('tipo contrato: el inmueble se resuelve contra los del titular y uno que no existe aparta la fila', async () => {
  const b = banco()
  b.inmuebles.push({ id: 'i1', alias: 'Socorro', referenciaCatastral: null, direccionNormalizada: 'Calle Socorro 24, 41003' })
  const csv = 'Inmueble;Fecha de inicio;Renta mensual\nSocorro;01/09/2025;1.000,00\nSierpes;01/09/2025;800\n'
  const r = await responderSubir(b.p, { titular: MIO, tipo: 'contrato', nombre: 'c.csv', bytes: enc(csv) })
  const v = await responderVer(b.p, r.body.id as string)
  assert.deepEqual((v.body.filas as { estado: string }[]).map((f) => f.estado), ['nueva', 'con_problema'])
  assert.equal(((v.body.filas as { datos: { rentaCent: number } }[])[0]).datos.rentaCent, 100000)
})

test('topes: límite diario en BD (429), fichero inválido (400/413) y descartar cierra sin crear', async () => {
  const lleno = banco({ creadasHoy: MAX_IMPORTACIONES_DIA })
  assert.deepEqual(await responderSubir(lleno.p, { titular: MIO, tipo: 'auto', nombre: 'x.csv', bytes: enc(CSV_INM) }), { status: 429, body: { error: 'limite_diario' } })
  assert.equal((await responderSubir(banco().p, { titular: MIO, tipo: 'auto', nombre: 'x', bytes: null })).status, 400)
  assert.equal((await responderSubir(banco().p, { titular: MIO, tipo: 'auto', nombre: 'x', bytes: new Uint8Array(6 * 1024 * 1024) })).status, 413)
  assert.equal((await responderSubir(banco().p, { titular: MIO, tipo: 'cosa', nombre: 'x', bytes: enc(CSV_INM) })).status, 400)
  assert.equal((await responderSubir(banco().p, { titular: MIO, tipo: 'auto', nombre: 'x', bytes: new Uint8Array([1, 0, 2]) })).body.error, 'formato_no_admitido')
  const { b, id } = await subido()
  assert.equal((await responderDescartar(b.p, id)).status, 200)
  assert.equal((await responderConfirmar(b.p, id)).status, 409)
  assert.equal(b.inmuebles.length, 0)
})

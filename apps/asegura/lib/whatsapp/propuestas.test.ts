import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CALLBACK_APLICAR,
  PREFIJO_WAP,
  botonesPropuesta,
  cerrarSiFallaDevolver,
  fechaIsoReal,
  leerCallbackPropuesta,
  payloadPropuesta,
  puedeResolver,
  tareaAlAplicar,
  validarResolucion,
} from './propuestas-reglas.ts'
import { zAccion } from './analisis.ts'

const ID = '33333333-3333-4333-8333-333333333333'
const AHORA = new Date('2026-11-04T10:00:00Z')
const MANANA = new Date('2026-11-05T10:00:00Z')

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')

test('un solo uso: una propuesta ya aplicada/descartada → 409 (anti-replay)', () => {
  assert.deepEqual(puedeResolver({ estado: 'pendiente', caducaAt: MANANA }, 'aplicar', AHORA), { ok: true })
  for (const estado of ['aplicada', 'descartada', 'caducada'] as const) {
    const v = puedeResolver({ estado, caducaAt: MANANA }, 'aplicar', AHORA)
    assert.equal(v.ok, false)
    if (!v.ok) assert.equal(v.status, 409, estado)
  }
})

test('caducada (7 días) → no se aplica (410); descartarla sí se puede (limpia el botón)', () => {
  const v = puedeResolver({ estado: 'pendiente', caducaAt: AHORA }, 'aplicar', AHORA)
  assert.equal(v.ok, false)
  if (!v.ok) assert.equal(v.status, 410)
  assert.deepEqual(puedeResolver({ estado: 'pendiente', caducaAt: AHORA }, 'descartar', AHORA), { ok: true })
})

test('callback `wap_`: ida y vuelta, ≤64 bytes y nada que no sea nuestro', () => {
  assert.equal(PREFIJO_WAP, 'wap')
  const [ok, no] = botonesPropuesta(ID)
  assert.ok(Buffer.byteLength(ok.callback) <= 64)
  assert.deepEqual(leerCallbackPropuesta(ok.callback), { id: ID, decision: 'aplicar' })
  assert.deepEqual(leerCallbackPropuesta(no.callback), { id: ID, decision: 'descartar' })
  assert.equal(ok.callback.startsWith(`${CALLBACK_APLICAR}:`), true)
  assert.equal(leerCallbackPropuesta('clp_tar:123'), null)
  assert.equal(leerCallbackPropuesta(`wap_ok:${ID}:extra`), null)
})

test('el prefijo `wap` tiene UNA sola definición en plataforma y ningún handler lo compara a mano', () => {
  const raiz = fileURLToPath(new URL('../../../plataforma/', import.meta.url))
  const ficheros: string[] = []
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'generated') continue
      const ruta = join(dir, e.name)
      if (e.isDirectory()) recorrer(ruta)
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) ficheros.push(ruta)
    }
  }
  recorrer(raiz)
  assert.ok(ficheros.length > 50, 'el cepo no está leyendo plataforma')
  const definiciones: string[] = []
  const literales: string[] = []
  for (const f of ficheros) {
    const fuente = sinComentarios(readFileSync(f, 'utf8'))
    // Cualquier constante cuyo valor sea 'wap' (PREFIJO_WAP u otra con distinto nombre).
    const n = (fuente.match(/\b(?:const|let|var)\s+\w+\s*=\s*['"]wap['"]|\bPREFIJO_\w+\s*=\s*['"]wap['"]/g) ?? []).length
    for (let i = 0; i < n; i++) definiciones.push(f)
    if (/prefix\s*===?\s*['"]wap['"]/.test(fuente)) literales.push(f)
  }
  assert.equal(definiciones.length, 1, `el prefijo wap debe definirse una sola vez: ${definiciones.join(', ')}`)
  assert.deepEqual(literales, [], 'ningún handler compara el prefijo `wap` como literal')
})

test('fecha real: 2026-02-30 se rechaza en el payload y en el análisis de la IA; 2028-02-29 (bisiesto) vale', () => {
  assert.equal(fechaIsoReal('2026-02-30'), false)
  assert.equal(fechaIsoReal('2026-13-01'), false)
  assert.equal(fechaIsoReal('2027-02-29'), false)
  assert.equal(fechaIsoReal('2028-02-29'), true)
  assert.equal(payloadPropuesta('fecha_cobro', '2026-02-30'), null)
  assert.equal(zAccion.safeParse({ tipo: 'proponerFechaCobro', fecha: '2026-02-30' }).success, false)
  assert.equal(zAccion.safeParse({ tipo: 'proponerFechaCobro', fecha: '2026-11-15' }).success, true)
})

test('si devolver la propuesta a pendiente falla (uq_wa_propuesta_pendiente), se descarta con el error; nunca queda `aplicada` sin efecto', async () => {
  const llamadas: string[] = []
  await cerrarSiFallaDevolver(
    async () => { llamadas.push('devolver'); throw new Error('duplicate key value violates unique constraint "uq_wa_propuesta_pendiente"') },
    async () => { llamadas.push('descartar') },
  )
  assert.deepEqual(llamadas, ['devolver', 'descartar'])
  const ok: string[] = []
  await cerrarSiFallaDevolver(async () => { ok.push('devolver') }, async () => { ok.push('descartar') })
  assert.deepEqual(ok, ['devolver'])
  const fuente = sinComentarios(readFileSync(new URL('./propuestas.ts', import.meta.url), 'utf8'))
  assert.ok(/estado = 'descartada'[\s\S]*estado = 'aplicada'/.test(fuente), 'el fallback descarta la propuesta aplicada')
})

test('validación del endpoint de resolución', () => {
  assert.deepEqual(validarResolucion({ id: ID, decision: 'aplicar' }), { ok: true, id: ID, decision: 'aplicar' })
  assert.equal(validarResolucion({ id: ID, decision: 'ejecutar' }).ok, false)
  assert.equal(validarResolucion({ id: 'x', decision: 'aplicar' }).ok, false)
})

test('payload: solo la fecha (y nada para «pagado»); fecha mal formada → no se crea', () => {
  assert.deepEqual(payloadPropuesta('fecha_cobro', '2026-11-15'), { fecha: '2026-11-15' })
  assert.deepEqual(payloadPropuesta('pagado', 'lo que sea'), {})
  assert.equal(payloadPropuesta('vencimiento', '15/11/2026'), null)
})

test('tarea al aplicar: «comprobar cobro» el día prometido; «verificar cobro» hoy; vencimiento la decide editarOportunidad', () => {
  assert.deepEqual(tareaAlAplicar('fecha_cobro', '2026-11-15', '2026-11-04')?.fechaLimite, '2026-11-15')
  assert.equal(tareaAlAplicar('fecha_cobro', '2026-11-01', '2026-11-04')?.fechaLimite, '2026-11-04', 'una fecha ya pasada no deja una tarea vencida')
  assert.equal(tareaAlAplicar('pagado', null, '2026-11-04')?.fechaLimite, '2026-11-04')
  assert.equal(tareaAlAplicar('vencimiento', '2027-03-01', '2026-11-04'), null)
})

test('CEPO: aplicar «pagado» jamás cierra la devolución (sin resolverDevolucion) ni toca la situación del recibo', () => {
  const fuente = sinComentarios(readFileSync(new URL('./propuestas.ts', import.meta.url), 'utf8'))
  assert.ok(!/resolverDevolucion|devoluciones-recibo/.test(fuente), 'propuestas.ts no puede cerrar una devolución')
  assert.ok(!/set[^`]*\bsituacion\s*=/.test(fuente), 'propuestas.ts no puede cambiar la situación de un recibo')
  assert.ok(!/recibo_devolucion/.test(fuente), 'propuestas.ts no toca recibo_devolucion')
})

test('crearPropuesta: si el insert no entra, distingue «ya pendiente» (misma clave de uq_wa_propuesta_pendiente) de «fuera de la correduría»', () => {
  const fuente = sinComentarios(readFileSync(new URL('./propuestas.ts', import.meta.url), 'utf8'))
  const bloque = fuente.slice(fuente.indexOf('export async function crearPropuesta'), fuente.indexOf('type ResumenPropuesta'))
  assert.ok(bloque.length > 200 && bloque.includes('insert into whatsapp_propuestas'), 'el bloque acotado es crearPropuesta')
  assert.ok(bloque.includes("where exists (select 1 from clientes"), 'el insert sigue acotado por la correduría del cliente')
  assert.ok(/estado = 'pendiente'/.test(bloque) && /coalesce\(recibo_id, oportunidad_id\)/.test(bloque), 'mira la pendiente con la misma clave del índice')
  assert.ok(bloque.includes("motivo: pendiente ? 'ya_pendiente' : 'fuera_de_correduria'"), 'el motivo sale de esa comprobación')
  assert.ok(!/if \(!fila\) return \{ ok: false, motivo: 'ya_pendiente' \}/.test(bloque), 'ya no se devuelve ya_pendiente a ciegas')
})

test('aplicarSiAutonoma: el catch no loguea los errores de migración ausente (sigue devolviendo false)', () => {
  const fuente = sinComentarios(readFileSync(new URL('./propuestas.ts', import.meta.url), 'utf8'))
  const bloque = fuente.slice(fuente.indexOf('export async function aplicarSiAutonoma'), fuente.indexOf('export type ResultadoDeshacer'))
  assert.ok(/if \(!faltaMigracion\(e\)\) console\.error\('\[whatsapp-ia\] modo autónomo:'/.test(bloque), 'el log del modo autónomo se filtra con faltaMigracion')
  assert.ok(bloque.includes('return false'), 'el catch sigue devolviendo false')
})

test('CEPO: ni el analizador ni el ejecutor ESCRIBEN recibos (las acciones de cobro solo crean propuesta)', () => {
  for (const f of ['./ejecutor.ts', './analizar.ts']) {
    const fuente = sinComentarios(readFileSync(new URL(f, import.meta.url), 'utf8'))
    assert.ok(!/update\s+poliza_recibos/i.test(fuente), `${f} no puede escribir poliza_recibos`)
    assert.ok(!/resolverDevolucion/.test(fuente), `${f} no puede cerrar una devolución`)
  }
})

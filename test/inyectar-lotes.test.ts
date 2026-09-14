// Cepos del envío por lotes a los puertos internos (scripts/inyectar-lotes.mjs) y del contrato que
// lo rodea: el workflow ya no manda el mapa entero por curl (413 el 12/09/2026) y el puerto del mapa
// borra por `sha` en el último lote en vez de por la lista completa de rutas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { partirEnLotes, enviarLotes, MAX_BYTES_LOTE } = await import(join(ROOT, 'scripts/inyectar-lotes.mjs'))

test('partirEnLotes: ningún lote supera maxBytes y no se pierde ni se duplica ninguna fila', () => {
  const filas = Array.from({ length: 50 }, (_, i) => ({ ruta: `f${i}.ts`, relleno: 'x'.repeat(100 + (i % 7) * 40) }))
  const lotes = partirEnLotes(filas, 1000)
  assert.ok(lotes.length > 1, 'con 50 filas de >100 B y tope 1000 tiene que haber varios lotes')
  for (const l of lotes) {
    const bytes = l.reduce((a: number, f: unknown) => a + Buffer.byteLength(JSON.stringify(f)) + 1, 0)
    assert.ok(bytes <= 1000, `lote de ${bytes} B supera el tope`)
  }
  assert.deepEqual(lotes.flat(), filas)
})

test('partirEnLotes: una fila mayor que el tope va sola en su lote (no se descarta en silencio)', () => {
  const grande = { ruta: 'g.ts', relleno: 'x'.repeat(5000) }
  const lotes = partirEnLotes([{ ruta: 'a.ts' }, grande, { ruta: 'b.ts' }], 1000)
  assert.equal(lotes.length, 3)
  assert.deepEqual(lotes[1], [grande])
})

test('MAX_BYTES_LOTE queda muy por debajo del corte de 4,5 MB de Vercel', () => {
  assert.ok(MAX_BYTES_LOTE <= 2_000_000, `MAX_BYTES_LOTE=${MAX_BYTES_LOTE}`)
})

test('enviarLotes: manda lote/total con el sha, reintenta un 5xx y NO reintenta un 401', async () => {
  const llamadas: Array<{ url: string; body: { sha: string; lote: number; total: number; archivos: unknown[] } }> = []
  let fallosRestantes = 1
  const fetchImpl = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body)
    llamadas.push({ url, body })
    if (body.lote === 2 && fallosRestantes-- > 0) return { status: 503, text: async () => 'deploy en curso' }
    return { status: 200, text: async () => '' }
  }
  const esperas: number[] = []
  const log = { log: () => {}, error: () => {} }
  const ok = await enviarLotes({
    url: 'https://p/api/internal/mapa-arquitectura', secret: 's', sha: 'abc',
    lotes: [[{ ruta: 'a' }], [{ ruta: 'b' }], [{ ruta: 'c' }]],
    construirBody: (lote: unknown[]) => ({ archivos: lote }),
    fetchImpl, esperar: async (s: number) => { esperas.push(s) }, log,
  })
  assert.equal(ok, true)
  assert.deepEqual(llamadas.map(l => [l.body.lote, l.body.total]), [[1, 3], [2, 3], [2, 3], [3, 3]])
  assert.ok(llamadas.every(l => l.body.sha === 'abc' && Array.isArray(l.body.archivos)))
  assert.deepEqual(esperas, [15], 'un solo reintento con la espera del primer intento')

  // 401: un solo intento y false
  const intentos401: number[] = []
  const ok401 = await enviarLotes({
    url: 'https://p/x', secret: 's', sha: 'abc', lotes: [[1]],
    construirBody: () => ({}),
    fetchImpl: async () => { intentos401.push(1); return { status: 401, text: async () => 'no' } },
    esperar: async () => {}, log,
  })
  assert.equal(ok401, false)
  assert.equal(intentos401.length, 1)
})

test('el workflow ya no manda el mapa entero por curl y el grafo no depende del mapa', () => {
  const wf = readFileSync(join(ROOT, '.github/workflows/auditoria.yml'), 'utf8')
  assert.doesNotMatch(wf, /--data-binary @docs\/mapa-funciones\.generated\.json/, 'el POST entero del mapa es lo que dio 413')
  assert.match(wf, /node scripts\/mapa-arquitectura-inyectar\.mjs docs\/mapa-funciones\.generated\.json/)
  const pasoGrafo = wf.slice(wf.indexOf('Inyectar grafo de código en Supabase'))
  assert.match(pasoGrafo, /if:\s*github\.ref_name == 'main' && !cancelled\(\)/, 'un fallo del mapa no puede saltarse la carga del grafo')
})

test('el puerto del mapa acepta lote/total y borra por sha solo en el último lote, estampando el sha siempre', () => {
  const src = readFileSync(join(ROOT, 'apps/plataforma/app/api/internal/mapa-arquitectura/route.ts'), 'utf8')
  assert.match(src, /body\?\.lote/)
  assert.match(src, /if \(lote === total\)/)
  assert.match(src, /DELETE FROM mapa_arquitectura WHERE sha IS DISTINCT FROM \$\{sha\}/)
  assert.doesNotMatch(src, /ruta <> ALL\(/, 'el borrado por lista de rutas exige el mapa entero en un POST')
  // Si el upsert saltara la fila entera por hash, el sha se quedaría viejo y el DELETE de arriba la borraría.
  assert.doesNotMatch(src, /WHERE mapa_arquitectura\.hash IS DISTINCT FROM EXCLUDED\.hash`/)
  assert.match(src, /updated_at = CASE WHEN mapa_arquitectura\.hash IS DISTINCT FROM EXCLUDED\.hash THEN now\(\)/)
})

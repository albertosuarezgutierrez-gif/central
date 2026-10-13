import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_CARACTERES, interpretarRedDiaria, mensajeRedDiaria, type AnulacionRed, type AprobacionRed, type RedDiaria } from './red-diaria.ts'

const ap = (o: Partial<AprobacionRed> = {}): AprobacionRed => ({
  id: 'a1', tipo: 'cliente', origen: 'recibo_devuelto', clienteId: 'c1', cliente: 'Ana <Pérez>', caduca: '2026-10-13T08:00:00Z', urgente: false, ...o,
})
const an = (o: Partial<AnulacionRed> = {}): AnulacionRed => ({
  anulacionId: 'n1', clienteId: 'c2', cliente: 'Luis', compania: 'Mapfre', numeroPoliza: '123', firmadaAt: '2026-10-09T10:00:00Z', horas: 80,
  causa: 'sin_carta_firma', ...o,
})
const vacia = (): RedDiaria => ({ porCaducar: [], caducadas: [], anulaciones: [], recibos: [] })
const BASE = 'https://plataforma.test'

test('mensaje: sin nada → null (no se manda «todo en orden»)', () => {
  assert.equal(mensajeRedDiaria(vacia(), BASE), null)
})

test('mensaje: un solo mensaje con los cuatro bloques y la causa de cada baja', () => {
  const m = mensajeRedDiaria({
    porCaducar: [ap()], caducadas: [ap({ id: 'a2', origen: 'anulacion', tipo: 'compania' })],
    anulaciones: [an(), an({ anulacionId: 'n2', causa: 'propuesta_rechazada' }), an({ anulacionId: 'n3', causa: 'esperando_ok' }),
      an({ anulacionId: 'n4', causa: 'sin_propuesta' }), an({ anulacionId: 'n5', causa: 'allianz_pue' })],
    recibos: [{ aprobacionId: 'r1', clienteId: 'c3', cliente: 'Eva', caduca: '2026-10-10T08:00:00Z', vencimiento: '2026-09-30' }],
  }, BASE)!
  assert.match(m, /Caducan en menos de 24 h · 1/)
  assert.match(m, /Caducadas en las últimas 24 h · 1/)
  assert.match(m, /Bajas firmadas que no salen \(\+48 h\) · 5/)
  assert.match(m, /Recibos devueltos sin aviso vivo · 1/)
  for (const c of ['sin carta/firma', 'propuesta rechazada', 'esperando tu OK', 'sin propuesta', 'PUE']) assert.ok(m.includes(c), c)
  assert.match(m, /firmada hace 3 d/)
  assert.match(m, /Mapfre 123|Mapfre nº 123/)
  assert.equal((m.match(/Red diaria/g) ?? []).length, 1)
})

test('mensaje: HTML escapado y enlace a la ficha', () => {
  const m = mensajeRedDiaria({ ...vacia(), porCaducar: [ap()] }, BASE)!
  assert.ok(m.includes('Ana &lt;Pérez&gt;'))
  assert.ok(m.includes(`${BASE}/correduria/cliente/c1`))
  assert.ok(!m.includes('<Pérez>'))
})

test('mensaje: solo un bloque con contenido → solo ese bloque', () => {
  const m = mensajeRedDiaria({ ...vacia(), anulaciones: [an()] }, BASE)!
  assert.doesNotMatch(m, /Caducan en menos/)
  assert.doesNotMatch(m, /Recibos devueltos/)
})

test('mensaje: más de 8 por bloque se recorta con «y N más»', () => {
  const m = mensajeRedDiaria({ ...vacia(), anulaciones: Array.from({ length: 11 }, (_, i) => an({ anulacionId: `n${i}` })) }, BASE)!
  assert.match(m, /… y 3 más/)
})

const ok = () => ({ estado: 'ok', aprobaciones: { porCaducar: [ap()], caducadas: [] }, anulaciones: [an()], recibos: [] })

test('interpretar: ok; un fallo NUNCA es cuadro vacío', () => {
  assert.equal(interpretarRedDiaria(200, ok()).estado, 'ok')
  assert.equal(interpretarRedDiaria(500, { estado: 'error', causa: 'conexion' }).estado, 'error')
  assert.equal(interpretarRedDiaria(503, { estado: 'sin_configurar' }).estado, 'error')
  assert.equal(interpretarRedDiaria(200, null).estado, 'error')
  assert.equal(interpretarRedDiaria(404, null).estado, 'error')
})

test('interpretar: fila ilegible, causa desconocida o lista ausente → error, no se esconde', () => {
  assert.equal(interpretarRedDiaria(200, { ...ok(), anulaciones: [an(), { anulacionId: 'x' }] }).estado, 'error')
  assert.equal(interpretarRedDiaria(200, { ...ok(), anulaciones: [an({ causa: 'inventada' as never })] }).estado, 'error')
  const { recibos: _r, ...sinRecibos } = ok()
  assert.equal(interpretarRedDiaria(200, sinRecibos).estado, 'error')
})

test('🪤 el cron: auth, 503 + latido rojo si falla la lectura, y solo manda si hay mensaje', () => {
  const src = readFileSync(new URL('../../app/api/cron/correduria-red-diaria/route.ts', import.meta.url), 'utf8')
  assert.match(src, /if \(!isCronAuthorized\(req\)\) return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 401 \}\)/)
  const fallo = src.slice(src.indexOf("if (r.estado !== 'ok')"), src.indexOf('const { red } = r'))
  assert.match(fallo, /registrarLatido\(AGENTE, false/)
  assert.match(fallo, /status: 503/)
  assert.doesNotMatch(fallo, /tgAviso/, 'una lectura fallida no manda «todo bien»')
  assert.match(src, /if \(mensaje\) \{[\s\S]*tgAviso\('correduria\.red-diaria', mensaje\)/)
  // tgAviso devuelve null (no lanza) si no llegó nada: sin messageId, latido rojo y 502.
  const nulo = src.slice(src.indexOf('if (messageId === null)'), src.indexOf('enviado = true'))
  assert.match(nulo, /registrarLatido\(AGENTE, false/)
  assert.match(nulo, /status: 502/)
  const cron = readFileSync(new URL('../cron-dispatch.ts', import.meta.url), 'utf8')
  assert.match(cron, /path: '\/api\/cron\/correduria-red-diaria', schedule: '23 6 \* \* \*'/)
})

test('mensaje: peor caso (muchísimo de todo, nombres larguísimos) cabe en Telegram sin romper etiquetas', () => {
  const largo = 'Nombre <&> '.repeat(40)
  const n = 200
  const m = mensajeRedDiaria({
    porCaducar: Array.from({ length: n }, (_, i) => ap({ id: `p${i}`, cliente: largo })),
    caducadas: Array.from({ length: n }, (_, i) => ap({ id: `c${i}`, cliente: largo })),
    anulaciones: Array.from({ length: n }, (_, i) => an({ anulacionId: `n${i}`, cliente: largo, compania: largo })),
    recibos: Array.from({ length: n }, (_, i) => ({ aprobacionId: `r${i}`, clienteId: 'c', cliente: largo, caduca: '2026-10-10T08:00:00Z', vencimiento: '2026-09-30' })),
  }, BASE)!
  assert.ok(m.length <= MAX_CARACTERES, `${m.length} caracteres`)
  assert.equal((m.match(/<a /g) ?? []).length, (m.match(/<\/a>/g) ?? []).length)
  assert.equal((m.match(/<b>/g) ?? []).length, (m.match(/<\/b>/g) ?? []).length)
  assert.match(m, /míralo en \/correduria/)
})

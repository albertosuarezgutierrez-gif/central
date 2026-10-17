// Cepo del FUENTE de la consulta de seguimiento de sustituciones (SQL crudo: tsc no lo ve).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./cartera-sustituciones.ts', import.meta.url), 'utf8')

test('el recibo CIMA se distingue por origen = cima y situacion = cobrado', () => {
  assert.match(src, /r\.poliza_id = n\.id and r\.origen::text = 'cima' and r\.situacion::text = 'cobrado'/)
})

test('la vieja en vigor exige id_poliza_entidad y ausencia de baja CIMA, y mantiene la fila', () => {
  assert.match(src, /v\.id_poliza_entidad is not null\s+and v\.baja_cima_at is null and v\.baja_estado_cima is null/)
  assert.match(src, /n\.id_poliza_entidad is null\s+or \(v\.estado::text = any/)
})

test('tres estados: sin nueva o sin estado → null, no false', () => {
  assert.match(src, /case when n\.id is null then null else exists/)
  assert.match(src, /case when v\.estado is null then null/)
})

// ── 17/10/2026: anulación confirmada por la compañía + «se acaba cuando empieza la nueva» ─────────
const sello = src.slice(src.indexOf('export async function confirmarAnulacionCompania'))
const ruta = readFileSync(new URL('../app/api/operador/sustituciones/route.ts', import.meta.url), 'utf8')

test('el sello NO toca el estado ni la baja verificada («el cliente se va»): CIMA manda en el estado', () => {
  assert.ok(sello.length > 0, 'existe confirmarAnulacionCompania')
  assert.doesNotMatch(sello, /\bestado\s*=/, 'el sello no escribe polizas.estado')
  assert.doesNotMatch(sello, /baja_verificada/, 'no reutiliza baja_verificada_* (cancela ya y activa su trigger)')
  assert.match(sello, /anulacion_confirmada_motivo = \$\{e\.motivo\}/)
})

test('el sello deja historial_interno en la MISMA transacción, solo sobre una sustituida de esta correduría', () => {
  assert.match(sello, /return prismaAsegura\(\)\.\$transaction\(/)
  assert.match(sello, /insert into historial_interno/)
  assert.match(sello, /correduria_id = \$\{correduriaId\}::uuid and merged_into_poliza_id is null/)
  assert.match(sello, /if \(!p\.sustituida\)/)
  assert.match(sello, /sin_migracion/)
})

test('la anulación confirmada saca a la vieja de los DOS avisos (seguimiento y doble seguro)', () => {
  const doble = src.slice(src.indexOf('export async function dobleSeguroEnSeguimiento'), src.indexOf('export async function confirmarAnulacionCompania'))
  assert.match(doble, /and not \$\{sqlAnulacionConfirmada\(conColumna\)\}/)
  assert.match(src, /\$\{sqlAnulacionConfirmada\(conColumna\)\} as anulacion_confirmada/)
  assert.match(src, /a\.estado = 'confirmada'/)
})

test('el ⚠️ lo decide viejaPendienteDeAnular (solape con tolerancia 0), y «falta la ficha» sigue entrando', () => {
  assert.match(src, /viejaPendienteDeAnular\(\{/)
  // Tolerancia 0 (no la de 30 días de avisoDobleSeguro): solo distingue «no renueva» de «doble seguro».
  assert.match(src, /solapeViejaNueva\(\{ fechaVencimiento: f\.vence, fechaEfectoUltimoRecibo: f\.efecto_recibo \}, f\.efecto_nueva, 0\)/)
  assert.match(src, /viejaAviso: v\.aviso,/)
  assert.match(src, /const faltaNueva = f\.nueva_id === null \|\| f\.nueva_confirmada !== true/)
  assert.match(src, /if \(!faltaNueva && v\.pendiente === false\) return \[\]/)
})

test('la ruta POST va auditada y valida con la regla pura (motivo obligatorio)', () => {
  assert.match(ruta, /export const POST = auditado\(/)
  assert.match(ruta, /validarAnulacionConfirmada\(b\)/)
  assert.match(ruta, /b\?\.accion !== 'anulacion_confirmada'/)
})

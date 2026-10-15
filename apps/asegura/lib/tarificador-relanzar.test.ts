// Cepos de «relanzar» un trabajo del tarificador por el puerto de operador (15/10/2026). `node --test`.
// Reglas puras con comportamiento real; el cableado (SQL, ruta, workflow) se lee del FUENTE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidirRelanzar, ESTADOS_RELANZABLES, MAX_RELANZAMIENTOS_24H } from './tarificador-relanzar-reglas.ts'

const APP = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(APP, rel), 'utf8')
const base = { estado: 'atascado', modo: null, vivosCompania: 0, relanzamientos24h: 0, pausada: false }

test('relanzar: solo desde atascado (requiere_humano NO: mandaría otro SMS); cualquier otro estado → 409', () => {
  assert.deepEqual([...ESTADOS_RELANZABLES], ['atascado'])
  for (const estado of ESTADOS_RELANZABLES) assert.deepEqual(decidirRelanzar({ ...base, estado }), { ok: true })
  for (const estado of ['requiere_humano', 'pendiente', 'en_curso', 'ok', 'error_reintentable', 'error_definitivo', 'cancelado', 'autorizado_emision']) {
    const d = decidirRelanzar({ ...base, estado })
    assert.ok(!d.ok && d.status === 409, `${estado} tiene que dar 409`)
  }
})

test('relanzar: un trabajo abortado por el guard de emisión (error.tipo) nunca', () => {
  const d = decidirRelanzar({ ...base, tipoError: 'emision' })
  assert.ok(!d.ok && d.status === 409)
  assert.deepEqual(decidirRelanzar({ ...base, tipoError: 'portal' }), { ok: true })
})

test('relanzar: emisión y exploración nunca; pausa y trabajo vivo de la compañía → 409', () => {
  for (const modo of ['emision', 'exploracion']) assert.ok(!decidirRelanzar({ ...base, modo }).ok)
  assert.deepEqual(decidirRelanzar({ ...base, modo: 'tarificar' }), { ok: true })
  const p = decidirRelanzar({ ...base, pausada: true })
  assert.ok(!p.ok && p.status === 409)
  const v = decidirRelanzar({ ...base, vivosCompania: 1 })
  assert.ok(!v.ok && v.status === 409 && /una ejecución por compañía/.test(v.motivo))
})

test('relanzar: tope de 6 cada 24 h por compañía → 429 con mensaje claro', () => {
  assert.equal(MAX_RELANZAMIENTOS_24H, 6)
  assert.deepEqual(decidirRelanzar({ ...base, relanzamientos24h: 5 }), { ok: true })
  const d = decidirRelanzar({ ...base, relanzamientos24h: 6 })
  assert.ok(!d.ok && d.status === 429 && /6 relanzamientos por compañía cada 24 h/.test(d.motivo))
})

test('relanzarTrabajo (BD): for update, estado comprobado, atascos descartados con la función compartida, rastro y UPDATE guardado', () => {
  const src = leer('lib/tarificador-robustez.ts')
  const i = src.indexOf('export async function relanzarTrabajo')
  const r = src.slice(i, src.indexOf('// ─── ATASCO: caducidad', i))
  assert.match(r, /for update`/, 'sin cerrojo del trabajo')
  assert.match(r, /pg_advisory_xact_lock/, 'sin cerrojo por compañía: dos relanzamientos a la vez se saltarían el tope')
  assert.match(r, /decidirRelanzar\(/)
  assert.match(r, /tipoError: f\.tipo_error/, 'la decisión no recibe error.tipo')
  assert.match(r, /if \(!d\.ok\) return/, 'si la decisión es no, no se toca nada')
  assert.match(r, /descartarAtascosEsperando\(tx, trabajoId/, 'reutiliza la función de descartar atascos')
  assert.match(r, /estado = 'atascado'`/, 'el UPDATE no vuelve a comprobar el estado')
  assert.match(r, /intentos = 0, lease_hasta = null, fly_machine_id = null, error = null/)
  assert.match(r, /anotarCambio\(\{ entidad: 'trabajo_tarificador', id: trabajoId, campo: 'relanzado', despues: f\.compania \}\)/, 'el relanzamiento tiene que dejar su compañía en la auditoría')
  assert.ok(!/tarificador_relanzamientos/.test(src), 'sin tabla nueva: el tope se cuenta en `auditoria`')
  const c = src.slice(src.indexOf('export async function contarRelanzamientos24h'), src.indexOf('export async function relanzarTrabajo'))
  assert.match(c, /from auditoria[\s\S]*?ruta = '\/api\/operador\/tarificador\/relanzar'[\s\S]*?estado_http < 400[\s\S]*?interval '24 hours'[\s\S]*?'trabajo_tarificador'[\s\S]*?'relanzado'/, 'el recuento de 24 h no filtra por ruta, éxito, ventana y compañía')
  assert.match(r, /contarRelanzamientos24h\(previo\[0\]\.compania\)/)
  assert.match(r, /relanzamientos24h, pausada/, 'el recuento no llega a la decisión del tope')
  assert.match(leer('lib/cambios.ts'), /'trabajo_tarificador\.relanzado'/, 'sin esa clave en CAMPOS_CON_VALOR la auditoría guarda «tocado» y no la compañía')
  assert.ok(!/update seguros\.tarificador_atascos/.test(r), 'SQL de atascos duplicado: usa descartarAtascosEsperando')
  assert.match(src, /async function guardarAtasco[\s\S]*?descartarAtascosEsperando\(db, t\.id, 'sistema:sustituido'\)/)
})

test('ruta relanzar: Bearer, auditado, uuid, 409/429 con el status de la decisión y sin devolver riesgo', () => {
  const src = leer('app/api/operador/tarificador/relanzar/route.ts')
  assert.match(src, /export const POST = auditado\(/)
  assert.match(src, /if \(!operadorAutorizado\(req\)\) return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 401 \}\)/)
  assert.match(src, /if \(r\.estado === 'conflicto'\) return NextResponse\.json\(\{ estado: 'rechazado', motivo: r\.motivo \}, \{ status: r\.status \}\)/)
  assert.match(src, /relanzarTrabajo\(correduria\.id, trabajoId, quien\)/)
  assert.ok(!/riesgo/i.test(src.replace(/\/\*\*[\s\S]*?\*\//, '')), 'la ruta no debe tocar el riesgo')
})

test('workflow relanzar: manual, uuid validado, secreto solo en env y por stdin, salida filtrada', () => {
  const wf = readFileSync(join(APP, '../../.github/workflows/tarificador-relanzar.yml'), 'utf8')
  assert.match(wf, /workflow_dispatch:/)
  assert.ok(!/\n\s+(push|pull_request|schedule):/.test(wf), 'solo manual')
  assert.match(wf, /ASEGURA_OPERADOR_SECRET: \$\{\{ secrets\.ASEGURA_OPERADOR_SECRET \}\}/)
  assert.ok(!/run:[\s\S]*?\$\{\{\s*(inputs|secrets)\./.test(wf), 'nada de ${{ }} interpolado dentro de un script (inyección)')
  assert.match(wf, /\^\[0-9a-fA-F\]\{8\}/, 'trabajo_id sin validar como uuid')
  assert.match(wf, /--config -/, 'el Bearer no puede ir en la línea de órdenes')
  assert.match(wf, /IN\("estado","motivo"/, 'la salida tiene que filtrarse a claves sin PII')
  assert.ok(!/echo[^\n]*\$ASEGURA_OPERADOR_SECRET/.test(wf), 'el secreto no se imprime')
})

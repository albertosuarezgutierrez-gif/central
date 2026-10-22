import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCION_ANULADA_DECLARACION, ACCION_DECLARADA_EMITIDA, DIAS_ESPERA_CIMA_DECLARADA, ROTULO_DECLARADA_PENDIENTE, declaracionVigente,
  detalleDeclaracion, diagnosticarDeclarada, estadoDeclaracion, leerDetalleDeclaracion, mismaDeclaracion, rotuloDeclaracion, validarDeclaracionEmitida,
  type PolizaConNumero,
} from './declaracion-emision.ts'
import { decidirEnlacesPolizaOportunidad, type OportunidadEnlace, type PolizaNuevaEnlace } from './correo-cruce-cima.ts'

// «Póliza emitida» declarada a mano (22/10/2026). Reloj INYECTADO: `HOY` sale del reloj real y todas las fechas son
// relativas a él (nada de fechas fijas contra validaciones con reloj: bomba de tiempo del 17/10).
const iso = (d: Date) => d.toISOString().slice(0, 10)
const HOY = iso(new Date())
const masDias = (n: number) => iso(new Date(Date.parse(`${HOY}T00:00:00Z`) + n * 86_400_000))

const ABIERTA = { estado: 'en_negociacion', polizaGanadaId: null }
const CAT = [{ codigoDgs: 'C0468', nombreComun: 'Occident' }, { codigoDgs: 'C0072', nombreComun: 'Generali' }]
const BUENA = { numeroPoliza: ' 0540-000123 ', codigoDgs: 'C0468', fechaEfecto: masDias(3), nota: '  Accidentes colectivos, 12 trabajadores ' }
const val = (a: { estado: string; polizaGanadaId: string | null }, p: Record<string, unknown>) => validarDeclaracionEmitida(a, p, HOY, CAT)

test('declarar sobre una ABIERTA: nº y compañía obligatorios; pasa a ganada; DGS del catálogo; la nota no va al detalle', () => {
  const r = val(ABIERTA, BUENA)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.declaracion.numeroPoliza, '0540-000123')
  assert.equal(r.declaracion.codigoDgs, 'C0468')
  assert.equal(r.declaracion.compania, 'Occident', 'el nombre sale del catálogo')
  assert.equal(r.declaracion.ganar, true)
  assert.equal(r.declaracion.nota, 'Accidentes colectivos, 12 trabajadores')
  assert.equal(r.declaracion.fechaEfecto, masDias(3))
  assert.equal('nota' in detalleDeclaracion(r.declaracion), false, 'el historial de la oportunidad no guarda texto libre')
})

test('🪤 sin nº, nº comodín/corto, sin compañía, o código DGS fuera del catálogo (o catálogo ilegible) → no', () => {
  for (const numeroPoliza of [undefined, '', '   ', 'PENDIENTE', '12345', '0000', 'x'.repeat(61)]) {
    assert.equal(val(ABIERTA, { ...BUENA, numeroPoliza }).ok, false, String(numeroPoliza))
  }
  assert.equal(val(ABIERTA, { numeroPoliza: '540000123' }).ok, false, 'sin compañía')
  assert.equal(val(ABIERTA, { numeroPoliza: '540000123', codigoDgs: 'C9999' }).ok, false, 'DGS inventado')
  assert.equal(validarDeclaracionEmitida(ABIERTA, BUENA, HOY, null).ok, false, 'catálogo ilegible: no se acepta un código')
})

test('cualquier aseguradora: del catálogo con su DGS, o por nombre SIN código (no se deduce ni se inventa)', () => {
  const g = val(ABIERTA, { numeroPoliza: '540000123', codigoDgs: 'c0072' })
  assert.ok(g.ok && g.declaracion.codigoDgs === 'C0072' && g.declaracion.compania === 'Generali')
  const libre = val(ABIERTA, { numeroPoliza: '540000123', compania: '  Hiscox   España ' })
  assert.ok(libre.ok && libre.declaracion.codigoDgs === null && libre.declaracion.compania === 'Hiscox España')
  const occ = val(ABIERTA, { numeroPoliza: '540000123', compania: 'Occident' })
  assert.ok(occ.ok && occ.declaracion.codigoDgs === null, 'un nombre tecleado no se convierte en código')
})

test('repetir la MISMA declaración es un no-op; cambiar nº, compañía o fecha es una corrección', () => {
  const r = val(ABIERTA, BUENA)
  assert.ok(r.ok)
  if (!r.ok) return
  const d = r.declaracion
  assert.equal(mismaDeclaracion(d, { ...d, numeroPoliza: '540000123' }), true, 'el nº se compara normalizado')
  assert.equal(mismaDeclaracion(d, { ...d, numeroPoliza: '540000124' }), false)
  assert.equal(mismaDeclaracion(d, { ...d, codigoDgs: 'C0072' }), false)
  assert.equal(mismaDeclaracion(d, { ...d, fechaEfecto: null }), false)
  assert.equal(mismaDeclaracion(null, d), false)
})

test('fecha de efecto y nota opcionales; fecha mal formada o a más de dos años → no', () => {
  const r = val(ABIERTA, { numeroPoliza: '540000123', compania: 'Reale' })
  assert.ok(r.ok && r.declaracion.fechaEfecto === null && r.declaracion.nota === null)
  assert.equal(val(ABIERTA, { ...BUENA, fechaEfecto: '2026-02-31' }).ok, false)
  assert.equal(val(ABIERTA, { ...BUENA, fechaEfecto: masDias(800) }).ok, false)
  assert.equal(val(ABIERTA, { ...BUENA, nota: 'x'.repeat(501) }).ok, false)
})

test('ganada SIN póliza de CIMA: se corrige (no vuelve a ganar); ganada ya enlazada o perdida: no', () => {
  const r = val({ estado: 'ganada', polizaGanadaId: null }, BUENA)
  assert.ok(r.ok && r.declaracion.ganar === false)
  assert.equal(val({ estado: 'ganada', polizaGanadaId: 'p1' }, BUENA).ok, false)
  assert.equal(val({ estado: 'perdida', polizaGanadaId: null }, BUENA).ok, false)
})

test('declaración vigente: la última legible; una ANULACIÓN posterior la deja sin efecto', () => {
  const d = (numeroPoliza: string, fecha: string) => ({ accion: ACCION_DECLARADA_EMITIDA, detalle: { numeroPoliza, compania: 'Occident', codigoDgs: 'C0468', fechaEfecto: null, origen: 'manual' }, fecha })
  assert.equal(declaracionVigente([]), null)
  assert.equal(declaracionVigente([d('540000111', '2026-01-02T10:00:00Z'), d('540000222', '2026-01-03T10:00:00Z')])?.numeroPoliza, '540000222')
  assert.equal(declaracionVigente([d('540000111', '2026-01-02T10:00:00Z'), { accion: ACCION_ANULADA_DECLARACION, detalle: {}, fecha: '2026-01-04T10:00:00Z' }]), null)
  assert.equal(declaracionVigente([{ accion: ACCION_ANULADA_DECLARACION, detalle: {}, fecha: '2026-01-01T10:00:00Z' }, d('540000111', '2026-01-02T10:00:00Z')])?.numeroPoliza, '540000111')
  assert.equal(leerDetalleDeclaracion({ numeroPoliza: '540000111', compania: 'Occident', codigoDgs: 'occident' }), null, 'forma desconocida → null, no se inventa')
  assert.equal(leerDetalleDeclaracion({ numeroPoliza: '540000111', compania: 'Hiscox', codigoDgs: null })?.codigoDgs, null, 'sin DGS sí es una forma válida')
})

test('estado visible: pendiente de CIMA sin póliza; confirmada con póliza; nunca «En vigor»', () => {
  const decl = leerDetalleDeclaracion({ numeroPoliza: '540000111', compania: 'Occident', codigoDgs: 'C0468' })
  assert.equal(estadoDeclaracion({ estado: 'ganada', polizaGanadaId: null, declaracion: decl }), 'pendiente_cima')
  assert.equal(estadoDeclaracion({ estado: 'ganada', polizaGanadaId: 'p1', declaracion: decl }), 'confirmada')
  assert.equal(estadoDeclaracion({ estado: 'en_negociacion', polizaGanadaId: null, declaracion: decl }), null)
  assert.equal(estadoDeclaracion({ estado: 'ganada', polizaGanadaId: null, declaracion: null }), null)
  assert.equal(rotuloDeclaracion('pendiente_cima'), ROTULO_DECLARADA_PENDIENTE)
  for (const e of ['pendiente_cima', 'confirmada'] as const) assert.doesNotMatch(rotuloDeclaracion(e), /en vigor/i)
})

// ── Diagnóstico de una declarada sin póliza (cruce diario) ──────────────────

const OP = { id: 'op1', clienteId: 'c1', dniHash: 'h1' }
const ya = Date.now()
const px = (p: Partial<PolizaConNumero> = {}): PolizaConNumero => ({
  id: 'p1', clienteId: 'c1', dniHash: 'h1', codigoDgs: 'C0468', viva: true, vigente: true, sustituida: false, enlazadaA: null,
  creadaEn: new Date(ya - 86_400_000).toISOString(), ...p,
})
const diag = (pols: PolizaConNumero[] | null, declaradaEl = masDias(-DIAS_ESPERA_CIMA_DECLARADA), dgs: string | null = 'C0468') =>
  diagnosticarDeclarada(OP, { codigoDgs: dgs, declaradaEl }, pols, HOY, ya)

test('🪤 CIMA no la trae: espera N días desde la DECLARACIÓN y luego avisa; lectura fallida nunca avisa', () => {
  assert.deepEqual(diag([]), { tipo: 'no_llega', dias: DIAS_ESPERA_CIMA_DECLARADA })
  assert.deepEqual(diag([], masDias(-(DIAS_ESPERA_CIMA_DECLARADA - 1))), { tipo: 'esperar' })
  assert.deepEqual(diag([px({ viva: false })]), { tipo: 'no_llega', dias: DIAS_ESPERA_CIMA_DECLARADA }, 'una del volcado no es «CIMA la trae»')
  assert.deepEqual(diag(null), { tipo: 'no_se_sabe' })
  assert.deepEqual(diag([], null), { tipo: 'no_se_sabe' })
})

test('🪤 CIMA tiene ese nº pero no se puede enlazar → aviso con su motivo (nunca muda)', () => {
  assert.deepEqual(diag([px({ codigoDgs: 'C0613' })]), { tipo: 'no_enlaza', motivo: 'otra_compania', polizaId: 'p1' })
  assert.deepEqual(diag([px({ clienteId: 'c2', dniHash: 'h2' })]), { tipo: 'no_enlaza', motivo: 'otro_tomador', polizaId: 'p1' })
  assert.deepEqual(diag([px({ enlazadaA: 'op9' })]), { tipo: 'no_enlaza', motivo: 'enlazada_otra', polizaId: 'p1' })
  assert.deepEqual(diag([px({ vigente: false })]), { tipo: 'no_enlaza', motivo: 'no_vigente', polizaId: 'p1' })
  assert.deepEqual(diag([px({ sustituida: true })]), { tipo: 'no_enlaza', motivo: 'no_vigente', polizaId: 'p1' })
  assert.deepEqual(diag([px({ creadaEn: new Date(ya - 90 * 86_400_000).toISOString() })]), { tipo: 'no_enlaza', motivo: 'antigua', polizaId: 'p1' })
  assert.deepEqual(diag([px(), px({ id: 'p2' })]), { tipo: 'no_enlaza', motivo: 'varias', polizaId: 'p1' })
  // Sí, desde el primer día: no hay que esperar a que «llegue» algo que ya está.
  assert.equal(diag([px({ clienteId: 'c2', dniHash: 'h2' })], HOY).tipo, 'no_enlaza')
})

test('enlazable o ya enlazada → sin aviso; sin DGS la compañía no filtra', () => {
  assert.deepEqual(diag([px()]), { tipo: 'enlazable' })
  assert.deepEqual(diag([px({ enlazadaA: 'op1' })]), { tipo: 'enlazada' })
  assert.deepEqual(diag([px({ codigoDgs: 'C0613' })], undefined, null), { tipo: 'enlazable' })
})

// ── Enlace F1 con una oportunidad DECLARADA ─────────────────────────────────

const AHORA = Date.now()
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString()
const op = (o: Partial<OportunidadEnlace> = {}): OportunidadEnlace => ({
  id: 'op1', clienteId: 'c1', dniHash: 'h1', ramo: 'accidentes', codigoDgs: null, creadaEn: hace(20),
  declarada: { codigoDgs: 'C0468', numeroPoliza: '0540-000123' }, ...o,
})
const pol = (p: Partial<PolizaNuevaEnlace> = {}): PolizaNuevaEnlace => ({
  id: 'p1', clienteId: 'c1', dniHash: 'h1', ramo: 'accidentes', codigoDgs: 'C0468', numeroPoliza: '540000123', creadaEn: hace(1), previaMismoRiesgo: false, ...p,
})

test('declarada: casa por nº exacto normalizado + compañía + mismo tomador (vía declaracion)', () => {
  const d = decidirEnlacesPolizaOportunidad([op()], [pol()], [])
  assert.deepEqual(d.enlaces, [{ oportunidadId: 'op1', polizaId: 'p1', via: 'declaracion', solicitudId: null }])
  // El mismo NIF en otra ficha también es el mismo tomador.
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ clienteId: 'c9' })], []).enlaces[0]?.via, 'declaracion')
})

test('🪤 declarada: nº de CIMA con OTRO tomador → no enlaza y avisa', () => {
  const d = decidirEnlacesPolizaOportunidad([op()], [pol({ clienteId: 'c2', dniHash: 'h2' })], [])
  assert.deepEqual(d.enlaces, [])
  assert.deepEqual(d.ambiguos, [{ polizaId: 'p1', oportunidades: ['op1'], motivo: 'declarada_otro_tomador', solicitudId: null }])
})

test('🪤 declarada: dos pólizas con ese nº en la compañía → ambiguo, no enlaza', () => {
  const d = decidirEnlacesPolizaOportunidad([op()], [pol(), pol({ id: 'p2', numeroPoliza: '0540000123' })], [])
  assert.deepEqual(d.enlaces, [])
  assert.deepEqual(d.ambiguos.map((a) => a.motivo), ['declarada_varias_polizas', 'declarada_varias_polizas'])
})

test('🪤 declarada: otro nº u otra compañía → no casa, y NUNCA cae a la heurística tomador+compañía+ramo', () => {
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ numeroPoliza: '540000999' })], []).enlaces.length, 0)
  assert.equal(decidirEnlacesPolizaOportunidad([op()], [pol({ codigoDgs: 'C0613' })], []).enlaces.length, 0)
  // Con compañía en la oportunidad (casaría por heurística) y otro nº: sigue sin enlazar.
  const d = decidirEnlacesPolizaOportunidad([op({ codigoDgs: 'C0468' })], [pol({ numeroPoliza: '540000999' })], [])
  assert.deepEqual(d.enlaces, [])
  assert.deepEqual(d.ambiguos, [])
})

test('declarada SIN código DGS: casa por nº + tomador con cualquier compañía; dos compañías con ese nº → ambiguo', () => {
  const sin = op({ declarada: { codigoDgs: null, numeroPoliza: '540000123' } })
  assert.equal(decidirEnlacesPolizaOportunidad([sin], [pol({ codigoDgs: 'C0072' })], []).enlaces[0]?.via, 'declaracion')
  const d = decidirEnlacesPolizaOportunidad([sin], [pol(), pol({ id: 'p2', codigoDgs: 'C0072' })], [])
  assert.deepEqual(d.enlaces, [])
  assert.equal(d.ambiguos[0]?.motivo, 'declarada_varias_polizas')
})

test('🪤 la solicitud de una oportunidad DECLARADA no la casa con una póliza de OTRO nº que el declarado', () => {
  const d = decidirEnlacesPolizaOportunidad([op()], [pol({ id: 'pS', numeroPoliza: '540000777' })], [{ id: 's1', codigoDgs: 'C0468', numeroPoliza: '540000777', oportunidadId: 'op1' }])
  assert.deepEqual(d.enlaces, [])
  assert.deepEqual(d.solicitudesConPoliza, [{ solicitudId: 's1', polizaId: 'pS' }], 'la solicitud sí queda con su póliza')
  // Con el nº declarado entre las pólizas, casa por la declaración.
  const e = decidirEnlacesPolizaOportunidad([op()], [pol({ id: 'pS', numeroPoliza: '540000777' }), pol()], [{ id: 's1', codigoDgs: 'C0468', numeroPoliza: '540000777', oportunidadId: 'op1' }])
  assert.deepEqual(e.enlaces, [{ oportunidadId: 'op1', polizaId: 'p1', via: 'declaracion', solicitudId: null }])
})

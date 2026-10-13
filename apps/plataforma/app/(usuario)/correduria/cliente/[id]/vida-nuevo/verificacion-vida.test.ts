// «Verificación antes de pedir precio» del cotizador de VIDA embebido en la oportunidad (13/10/2026).
// Campos de Avant2 (`apps/asegura/lib/codeoscopic/peticion-vida.ts`): `holder` = tomador, `risk.insured` = el tomador o
// la figura `asegurado` (UNA) + `economicOccupation.code` (profesión) + `smoker` (fumador), `risk.deathBenefit` (capital) y
// `effectiveDate`. Sin duración, beneficiarios, peso/altura ni seguro anterior.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { desdeRiesgoVida, gruposVerificacionVida, type EntradaVerificacionVida } from './verificacion-vida.ts'
import { verificacionCompleta, type GrupoVerificacion } from '../auto-nuevo/verificacion-embebido.ts'
import { interpretarRiesgo } from '../../../../../../lib/riesgo-asegura.ts'

const dir = new URL('.', import.meta.url)
const fuente = readFileSync(new URL('./VidaNuevo.tsx', dir), 'utf8')
const acciones = readFileSync(new URL('./acciones.ts', dir), 'utf8')
const op = (f: string) => readFileSync(new URL(`../../../oportunidad/[id]/${f}`, dir), 'utf8')
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const entrada = (c: Partial<EntradaVerificacionVida> = {}): EntradaVerificacionVida => ({
  tomador: { sinPrecalificar: false, faltaCivil: false, aMano: [], enFicha: [] },
  aseguradosDistintos: [],
  datos: { capital: 60000, profesion: '2612', fumador: false },
  exige: { profesion: false, fumador: false },
  efecto: { vacia: true, fueraDeLimites: false },
  historialDeclarado: false,
  faltaAlgo: false,
  ...c,
})
const item = (g: GrupoVerificacion[], clave: string) => g.flatMap((x) => x.items).find((i) => i.clave === clave)

test('todo completo: ✓; capital en formato español; solo los campos de Avant2', () => {
  const g = gruposVerificacionVida(entrada())
  assert.deepEqual(g.map((x) => x.titulo), ['1 · Figuras (tomador = asegurado)', '2 · Riesgo: vida'])
  assert.equal(verificacionCompleta(g), true)
  assert.equal(item(g, 'capital')!.texto, 'Capital asegurado: 60.000,00€')
  const textos = g.flatMap((x) => x.items).map((i) => i.texto.toLowerCase()).join(' | ')
  for (const p of ['duración', 'beneficiari', 'peso', 'altura', 'forma de pago']) assert.ok(!textos.includes(p), `no debe pedir «${p}»`)
})

test('capital: sin él ✗ (obligatorio, deathBenefit); datos ilegibles ✗ (nunca «sin datos» como ✓)', () => {
  assert.equal(item(gruposVerificacionVida(entrada({ datos: { capital: null, profesion: null, fumador: null } })), 'capital')!.estado, 'falta')
  const g = gruposVerificacionVida(entrada({ datos: null }))
  assert.equal(item(g, 'datos')!.estado, 'falta')
  assert.equal(verificacionCompleta(g), false)
})

test('tres estados en profesión y fumador: no consta = aviso (no se manda); exigido por la compañía = ✗; CNO mal = ✗', () => {
  const g = gruposVerificacionVida(entrada({ datos: { capital: 1000, profesion: null, fumador: null } }))
  assert.equal(item(g, 'profesion')!.estado, 'aviso')
  assert.equal(item(g, 'fumador')!.estado, 'aviso')
  assert.match(item(g, 'fumador')!.nota!, /nunca «no fuma» por defecto/)
  assert.equal(verificacionCompleta(g), true, 'un aviso no bloquea')
  const ex = gruposVerificacionVida(entrada({ datos: { capital: 1000, profesion: null, fumador: null }, exige: { profesion: true, fumador: true } }))
  assert.equal(item(ex, 'profesion')!.estado, 'falta')
  assert.equal(item(ex, 'fumador')!.estado, 'falta')
  assert.equal(item(gruposVerificacionVida(entrada({ datos: { capital: 1000, profesion: '26', fumador: true } })), 'profesion')!.estado, 'falta')
})

test('asegurado distinto del tomador: viaja desde SU ficha (✓ si está completa); dos o más ✗ (insured es UNA persona)', () => {
  const luis = { clienteId: B, nombre: 'Luis', faltan: [] as string[] | null, textoFalta: null, empresa: false }
  const ok = gruposVerificacionVida(entrada({ aseguradosDistintos: [luis] }))
  assert.equal(item(ok, 'asegurado')!.estado, 'ok')
  assert.equal(verificacionCompleta(ok), true, 'Avant2 admite un asegurado distinto del tomador (TermLifeRisk_V1.insured)')
  const incompleta = gruposVerificacionVida(entrada({ aseguradosDistintos: [{ ...luis, faltan: ['fechaNacimiento'], textoFalta: 'fecha de nacimiento' }] }))
  assert.equal(item(incompleta, 'asegurado')!.estado, 'falta')
  assert.equal(item(incompleta, 'asegurado')!.arriba, true)
  assert.equal(item(gruposVerificacionVida(entrada({ aseguradosDistintos: [{ ...luis, empresa: true }] })), 'asegurado')!.estado, 'falta')
  assert.equal(item(gruposVerificacionVida(entrada({ aseguradosDistintos: [{ ...luis, faltan: null }] })), 'asegurado')!.estado, 'aviso')
  const dos = gruposVerificacionVida(entrada({ aseguradosDistintos: [luis, { ...luis, clienteId: A, nombre: 'Eva' }] }))
  assert.equal(item(dos, 'asegurado-varios')!.estado, 'falta')
  assert.equal(verificacionCompleta(dos), false)
})

test('estado civil, efecto fuera de fechas y faltaAlgo sin ✗: bloquean; historial declarado: aviso', () => {
  assert.equal(verificacionCompleta(gruposVerificacionVida(entrada({ tomador: { sinPrecalificar: false, faltaCivil: true, aMano: [], enFicha: [] } }))), false)
  assert.equal(verificacionCompleta(gruposVerificacionVida(entrada({ efecto: { vacia: false, fueraDeLimites: true } }))), false)
  const otro = gruposVerificacionVida(entrada({ faltaAlgo: true }))
  assert.equal(item(otro, 'otro')!.estado, 'falta')
  assert.equal(item(gruposVerificacionVida(entrada({ historialDeclarado: true })), 'historial-no-viaja')!.estado, 'aviso')
})

test('desdeRiesgoVida: asegurado ≠ tomador por FICHA, datos del riesgo tal cual (null = no consta)', () => {
  const l = interpretarRiesgo(200, {
    estado: 'ok',
    oportunidad: { id: 'op1', clienteId: A, clienteNombre: 'Ana', ramo: 'vida' },
    roles: ['tomador', 'asegurado'],
    figuras: [{ rol: 'asegurado', clienteId: B, nombre: 'Luis', faltan: [] }],
    vinculos: [],
    variantes: [],
    datosRiesgo: { clave: 'datosCapital', datos: { capital: 50000, profesion: null, fumador: true }, faltan: [] },
    historial: { seguroAnterior: null, historialDeclarado: {}, carnet: null },
  })
  assert.equal(l.estado, 'ok')
  if (l.estado !== 'ok') return
  const d = desdeRiesgoVida(l.riesgo, A)
  assert.deepEqual(d.aseguradosDistintos.map((x) => [x.clienteId, x.nombre, x.faltan]), [[B, 'Luis', []]])
  assert.deepEqual(d.datos, { capital: 50000, profesion: null, fumador: true })
  assert.equal(d.historialDeclarado, false)
  assert.deepEqual(desdeRiesgoVida(l.riesgo, B).aseguradosDistintos, [], 'si el asegurado ES el tomador, no hay distinto')
})

// ── Cepos de fuente ─────────────────────────────────────────────────────────────
test('cepo: el botón de 0,50€ exige la verificación (y la guarda síncrona también) y el bloqueo de arriba', () => {
  assert.match(fuente, /const puedePulsarEmb = puedePulsar && \(!embebido \|\| \(delRiesgo !== null && verificacionOk\)\)/)
  assert.match(fuente, /disabled=\{!puedePulsarEmb\}/)
  assert.match(fuente, /if \(embebido && !\(delRiesgo !== null && verificacionOk\)\) return/)
  assert.match(fuente, /if \(bloqueo !== null\) return/)
  assert.match(fuente, /const puedePulsar = !cotizando && !faltaAlgo && bloqueo === null/)
})

test('cepo: embebido NO manda capital/profesión/fumador (los lee asegura del riesgo) ni los deja teclear', () => {
  assert.match(fuente, /resueltos: embebido\s*\? \{ estadoCivilId \}/)
  assert.match(fuente, /datosDelRiesgo: embebido,/)
  assert.match(fuente, /\{!embebido && \(\s*\n\s*<div style=\{\{ marginTop: 16 \}\}>\s*\n\s*<p[^>]*>\s*\n\s*Datos del asegurado que viajan/)
  assert.match(acciones, /datosDelRiesgo: entrada\.datosDelRiesgo === true && !!entrada\.variante\?\.oportunidadId/)
})

test('cepo: toda acción de vida corta sin acceso a la correduría ANTES de hablar con asegura', () => {
  for (const f of ['pedirPrecalificacionVida', 'pedirCotizacionVida', 'pedirTarificacionGuardadaVida', 'abrirCotizadorVidaDeOportunidad']) {
    const i = acciones.indexOf(`export async function ${f}`)
    assert.ok(i >= 0, f)
    const cuerpo = acciones.slice(i, acciones.indexOf('\n}\n', i))
    const g = cuerpo.indexOf('await exigirCorreduria()')
    assert.ok(g > 0, `${f} sin exigirCorreduria`)
    for (const llamada of ['Asegura(', 'riesgoAsegura(']) {
      const j = cuerpo.indexOf(llamada)
      if (j >= 0) assert.ok(j > g, `${f}: ${llamada} antes de la guarda`)
    }
  }
  assert.match(acciones, /if \(l\.riesgo\.oportunidad\.ramo !== 'vida'\) return \{ estado: 'error'/)
})

test('cepo: vida está en el registro de cotizadores embebidos con su carcasa común y sus precios guardados', () => {
  const reg = op('cotizadores-embebidos.tsx')
  assert.match(reg, /vida: PedirPrecioVida,/)
  assert.match(reg, /vida: PreciosVarianteVida,/)
  const pp = op('PedirPrecioVida.tsx')
  assert.match(pp, /abrir=\{abrirCotizadorVidaDeOportunidad\}/)
  assert.match(pp, /key=\{n\}/)
  assert.match(pp, /bloqueo=\{bloqueo\}/)
  assert.match(pp, /\n\s*embebido\n/)
})

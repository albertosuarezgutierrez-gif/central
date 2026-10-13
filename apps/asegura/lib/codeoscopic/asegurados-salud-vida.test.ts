// SALUD y VIDA en la pantalla de riesgo unificada (13/10/2026). Regla de Alberto: «los campos son siempre los de Avant2».
//   · Salud = mismo `risk.insureds[]` que decesos (peticion-salud.ts): tomador + asegurados desde FICHAS.
//   · Vida  = `risk.insured` (persona PROPIA en `TermLifeRisk_V1`: el tomador, o la figura `asegurado` si es otra) +
//     profesión/tabaco, y `risk.deathBenefit` (peticion-vida.ts); capital, profesión y fumador salen de «Datos del
//     riesgo» en el servidor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aseguradoDeFicha } from './asegurados.ts'
import { construirPeticionSalud, revisarDatosSalud } from './peticion-salud.ts'
import { construirPeticionVida, revisarDatosVida } from './peticion-vida.ts'
import { revisarDatosDecesos } from './peticion-decesos.ts'
import { comprobarRolesRamo } from './comprobar-roles.ts'

const TOMADOR = { dni: '12345678Z', nombre: 'Ana', apellido1: 'Gil', apellido2: 'Ruiz', fechaNacimiento: '1970-01-01', sexo: 'mujer' as const, estadoCivil: 'Married', telefono: '600000000' }
const HIJA = { nombre: 'Lucía', apellido1: 'Gil', apellido2: 'Pérez', fechaNacimiento: '2012-05-01', sexo: 'mujer' as const }

test('salud: la petición lleva al tomador primero y luego los asegurados de las fichas; ni capital ni modalidad viajan', () => {
  const c = construirPeticionSalud({ ...TOMADOR, fechaEfecto: '2026-11-01', capital: 5000, modalidadDeseada: 'con dental', aseguradosAdicionales: [aseguradoDeFicha(HIJA)] }, 'Health') as { risk: Record<string, unknown> & { insureds: Array<{ name: string }> } }
  assert.deepEqual(c.risk.insureds.map((x) => x.name), ['Ana', 'Lucía'])
  assert.deepEqual(Object.keys(c.risk), ['insureds'], 'en salud el riesgo es SOLO la lista de asegurados')
})

test('vida: insured = el tomador + profesión y tabaco; deathBenefit = capital; duración no viaja', () => {
  const c = construirPeticionVida({ ...TOMADOR, fechaEfecto: '2026-11-01', capital: 60000, profesion: '2612', fumador: false, duracionAnios: 20 }, 'Life') as { holder: Record<string, unknown>; risk: { insured: Record<string, unknown>; deathBenefit: number } }
  assert.equal(c.risk.insured.name, c.holder.name)
  assert.deepEqual(c.risk.insured.economicOccupation, { code: '2612' })
  assert.equal(c.risk.insured.smoker, false)
  assert.equal(c.risk.deathBenefit, 60000)
  assert.deepEqual(Object.keys(c.risk).sort(), ['deathBenefit', 'insured'])
})

test('vida con asegurado DISTINTO del tomador: holder = tomador; insured = el asegurado (de su ficha) + profesión y tabaco', () => {
  const c = construirPeticionVida({ ...TOMADOR, fechaEfecto: '2026-11-01', capital: 60000, profesion: '2612', fumador: true, asegurado: aseguradoDeFicha({ ...HIJA, fechaNacimiento: '1995-05-01' }) }, 'Life') as { holder: Record<string, unknown>; risk: { insured: Record<string, unknown>; deathBenefit: number } }
  assert.equal(c.holder.name, 'Ana')
  assert.equal(c.risk.insured.name, 'Lucía')
  assert.equal(c.risk.insured.birthDate, '1995-05-01')
  assert.deepEqual(c.risk.insured.economicOccupation, { code: '2612' })
  assert.equal(c.risk.insured.smoker, true)
  assert.equal('phones' in c.risk.insured || 'maritalStatus' in c.risk.insured, false, 'al asegurado no se le inventan teléfono ni estado civil')
  // Un asegurado incompleto o con fecha imposible corta GRATIS (nunca un 400 pagado).
  assert.ok(revisarDatosVida({ ...TOMADOR, fechaEfecto: '2026-11-01', capital: 1000, asegurado: { ...aseguradoDeFicha(HIJA), apellido1: '' } }).some((r) => r.campo === 'asegurado'))
  assert.ok(revisarDatosVida({ ...TOMADOR, fechaEfecto: '2026-11-01', capital: 1000, asegurado: aseguradoDeFicha({ ...HIJA, fechaNacimiento: '2999-01-01' }) }).some((r) => r.campo === 'asegurado'))
})

test('person-roles en vida con asegurado distinto: al tomador solo lo del tomador; profesión/tabaco y lo demás, al asegurado', async () => {
  const crudo = [
    { id: 'Holder', fields: [{ id: 'phone', required: true }] },
    { id: 'Insured', max: 1, fields: [{ id: 'birthDate', required: true }, { id: 'smoker', required: true }, { id: 'phone', required: true }] },
  ]
  const leer = async () => crudo
  const titular = { telefono: '600000000', fechaNacimiento: '1970-01-01' }
  // Sin asegurado distinto: el titular responde de la unión (teléfono, nacimiento, tabaco).
  const solo = await comprobarRolesRamo({} as never, 'vida', { datos: titular }, leer)
  assert.ok(solo.estado === 'ok' && solo.faltan.some((f) => f.campo === 'fumador'))
  // Con asegurado distinto: el tabaco se le pide a él; el teléfono del rol del asegurado no se puede mandar → «dato que falta».
  const r = await comprobarRolesRamo({} as never, 'vida', { datos: titular, aseguradoDistinto: { ...aseguradoDeFicha(HIJA), profesion: null, fumador: false } }, leer)
  assert.ok(r.estado === 'ok')
  assert.equal(r.faltan.some((f) => f.campo === 'fumador'), false, 'fumador = false ES una respuesta')
  assert.ok(r.faltan.some((f) => f.campo === 'asegurado' && /phone/.test(f.motivo)), 'lo que el asegurado no puede llevar se dice, nunca se ignora')
  const sinTabaco = await comprobarRolesRamo({} as never, 'vida', { datos: titular, aseguradoDistinto: { ...aseguradoDeFicha(HIJA), fumador: null } }, async () => [crudo[0], { ...crudo[1], fields: [{ id: 'smoker', required: true }] }])
  assert.ok(sinTabaco.estado === 'ok' && sinTabaco.faltan.some((f) => f.campo === 'fumador'))
})

test('la fecha de nacimiento del tomador (asegurado) imposible, futura o de >120 años corta GRATIS en vida, salud y decesos', () => {
  for (const revisar of [
    (f: string) => revisarDatosVida({ ...TOMADOR, fechaNacimiento: f, capital: 1000, fechaEfecto: '2026-11-01' }),
    (f: string) => revisarDatosSalud({ ...TOMADOR, fechaNacimiento: f, fechaEfecto: '2026-11-01' }),
    (f: string) => revisarDatosDecesos({ ...TOMADOR, fechaNacimiento: f, fechaEfecto: '2026-11-01' }),
  ]) {
    assert.deepEqual(revisar('1970-01-01'), [], 'una fecha real no da reparo')
    for (const mala of ['1970-02-31', '2999-01-01', '1890-01-01']) {
      const r = revisar(mala)
      assert.ok(r.some((x) => x.campo === 'fechaNacimiento'), `${mala} tiene que dar reparo`)
    }
  }
})

// ── Cepos de fuente: lo que tsc no ve ─────────────────────────────────────────
const riesgo = readFileSync(new URL('../oportunidad-riesgo.ts', import.meta.url), 'utf8')
const rutaSalud = readFileSync(new URL('../../app/api/operador/codeoscopic/salud-nuevo/route.ts', import.meta.url), 'utf8')
const rutaVida = readFileSync(new URL('../../app/api/operador/codeoscopic/vida-nuevo/route.ts', import.meta.url), 'utf8')
const fn = (nombre: string) => {
  const i = riesgo.indexOf(`export async function ${nombre}`)
  assert.ok(i > 0, `falta ${nombre}`)
  return riesgo.slice(i, riesgo.indexOf('\n}\n', i))
}

test('cepo: salud admite asegurados de las figuras (y solo salud/decesos); se leen del ramo del riesgo, no de decesos fijo', () => {
  const pv = fn('prepararVariante')
  assert.match(pv, /if \(deFiguras && e\.ramo !== 'decesos' && e\.ramo !== 'salud'\) return \{ ok: false/)
  const ad = fn('aseguradosDeFigurasParaCotizar')
  assert.match(ad, /o\.tipo::text = \$\{ramo\}/)
  assert.match(ad, /personaDeFicha\(correduriaId, f\.cliente_id, ramo\)/)
})

test('cepo: la ruta de salud usa los asegurados de las figuras y el write-back sigue con el cuerpo ORIGINAL', () => {
  assert.match(rutaSalud, /variante\.v\.asegurados !== undefined \? \{ \.\.\.\(resueltosPedidos \?\? \{\}\), asegurados: variante\.v\.asegurados \}/)
  assert.match(rutaSalud, /anotarCapitalDeCotizacion\(correduria\.id, \{ oportunidadId: variante\.v\.contexto\.oportunidadId, ramo: 'salud', cuerpo, actor/)
})

test('cepo: vida embebida rechaza capital/profesión/fumador del cuerpo (pisarían «Datos del riesgo»)', () => {
  const pv = fn('prepararVariante')
  assert.match(pv, /const pisa = CAMPOS_VIDA_DEL_RIESGO\.filter\(\(k\) => k in res \|\| \(e\.correcciones !== undefined && k in e\.correcciones\)\)/)
  assert.match(pv, /if \(pisa\.length > 0\) return \{ ok: false/)
  assert.match(riesgo, /export const CAMPOS_VIDA_DEL_RIESGO = \['capital', 'profesion', 'fumador'\] as const/)
})

test('cepo: vida embebida exige el tomador del riesgo, arma el asegurado distinto desde SU ficha (uno como mucho) y corta sin capital', () => {
  const dv = fn('datosVidaDelRiesgoParaCotizar')
  assert.match(dv, /o\.correduria_id = \$\{correduriaId\}::uuid and o\.tipo::text = 'vida'/)
  assert.match(dv, /if \(op\.tomador !== e\.tomadorId\) return \{ ok: false/)
  assert.match(dv, /f\.rol = 'asegurado' and f\.cliente_id::text <> \$\{e\.tomadorId\}/)
  assert.match(dv, /if \(otros\.length > 1\) \{\s*return \{ ok: false/, 'TermLifeRisk_V1 lleva UNA persona asegurada')
  assert.match(dv, /personaDeFicha\(correduriaId, otros\[0\]\.cliente_id, 'vida'\)\.catch\(\(\) => null\)/)
  assert.match(dv, /if \(!p\) return \{ ok: false/, 'ficha ilegible: no se cotiza a otra persona')
  assert.match(dv, /if \(p\.tipo === 'juridica'\) return \{ ok: false/)
  assert.match(dv, /if \(malNac\) return \{ ok: false/)
  assert.match(dv, /d\.capital === null \|\| !\(d\.capital > 0\)\) return \{ ok: false/)
  assert.ok(dv.indexOf('op.tomador !== e.tomadorId') < dv.indexOf("f.rol = 'asegurado'"), 'la guarda del tomador va antes')
})

test('cepo: el asegurado de vida solo lo pone el SERVIDOR (parámetro aparte, nunca leído de resueltos del cuerpo)', () => {
  assert.match(rutaVida, /asegurado: dv\?\.asegurado \?\? null,/)
  const rc = readFileSync(new URL('../retarificar-cartera.ts', import.meta.url), 'utf8')
  const i = rc.indexOf('export function prepararRetarificacionNuevaVida')
  const f = rc.slice(i, rc.indexOf('\n}\n', i))
  assert.match(f, /asegurado: entrada\.asegurado \?\? null,/)
  assert.doesNotMatch(f, /resueltos\?\.asegurado/)
})

test('cepo: la ruta de vida manda capital/profesión/fumador DEL RIESGO, y profesión/fumador solo si constan', () => {
  assert.match(rutaVida, /capital: dv\.capital, \.\.\.\(dv\.profesion !== null \? \{ profesion: dv\.profesion \} : \{\}\), \.\.\.\(dv\.fumador !== null \? \{ fumador: dv\.fumador \} : \{\}\)/)
})

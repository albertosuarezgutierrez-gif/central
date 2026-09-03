// Guardián de la autorización a terceros del portal (`node --test`, gate en CI
// vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Hasta el 03/09/2026, «José deja que María vea sus pólizas» vivía en un
// booleano del CRM: `cliente_relaciones.puede_ver_polizas`. Ese booleano tenía
// tres agujeros, y los tres son del tipo que NO falla — simplemente abre datos
// de otro y nadie se entera:
//
//   1. **No lo otorgó nadie.** Las 104 filas que lo tenían a `true` se crearon
//      TODAS el 21/06/2026, el día del volcado del CRM. Sin autor, sin fecha y
//      sin texto aceptado, no hay forma de DEMOSTRAR el consentimiento, que es
//      literalmente lo que pide el art. 7.1 RGPD.
//   2. **No tenía alcance.** El portal lo leía como nivel `completo`, y
//      `completo` enseña el IBAN y el DNI del otorgante. Eso no es «ver mis
//      seguros»: es ver a la PERSONA.
//   3. **No se podía revocar ni caducaba.** El caso que revienta esto es el
//      divorcio, y nadie entra al portal a revocar el día que se separa.
//
// Se sustituyó por `seguros.portal_autorizacion` + las reglas puras de
// `packages/module-seguros-portal/src/autorizacion.ts`. Este cepo impide que
// cualquiera de los tres agujeros vuelva por la puerta de atrás.
//
// La defensa de verdad es de la BD (al rol `prisma_asegura_portal` se le
// REVOCÓ el `SELECT` sobre esa columna), pero eso no se ve leyendo el repo y no
// hay test que lo alcance desde aquí. Este fichero es la mitad que sí se ve.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ALCANCES,
  ALCANCES_CONCEDIBLES,
  alcanceConcedible,
  alcancesConcedibles,
  camposDeAlcance,
  camposDeAlcances,
  estadoAutorizacion,
} from '../packages/module-seguros-portal/src/autorizacion.ts'
import { camposVisibles } from '../packages/module-seguros-portal/src/acceso.ts'

const RAIZ = join(import.meta.dirname, '..')
const leerCrudo = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

/**
 * Quita comentarios sin romper las cadenas. Sin esto, el cepo se dispara con
 * los comentarios que EXPLICAN la regla — que es lo que pasó la primera vez que
 * se escribió un guardián así en este repo.
 */
function sinComentarios(src: string): string {
  let out = ''
  let i = 0
  let comilla: string | null = null
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (comilla) {
      if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue }
      if (c === comilla) comilla = null
      out += c; i += 1; continue
    }
    if (c === "'" || c === '"' || c === '`') { comilla = c; out += c; i += 1; continue }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue }
    out += c; i += 1
  }
  return out
}

const leer = (rel: string) => sinComentarios(leerCrudo(rel))

const CARTERA = 'apps/asegura-portal/lib/cartera-lectura.ts'
const SCHEMA = 'apps/asegura-portal/prisma/schema.prisma'

// ─── 1. El booleano muerto no vuelve ─────────────────────────────────────────

test('el camino de lectura del portal NO consulta puede_ver_polizas', () => {
  const src = leer(CARTERA)
  assert.equal(
    /puedeVerPolizas|puede_ver_polizas/.test(src),
    false,
    'cartera-lectura vuelve a mirar el booleano del CRM: el rol de BD ya no lo puede leer, y aunque pudiera, no acredita ningún consentimiento',
  )
  // Y que lee de donde debe.
  assert.match(src, /prisma\.portalAutorizacion\.findMany/)
})

test('el modelo Prisma del portal no declara la columna muerta', () => {
  // Si vuelve al modelo, un `findMany` sin `select` explícito la pide, y la BD
  // la niega: el fallo aparecería lejos de aquí y disfrazado de otra cosa.
  const modelo = leerCrudo(SCHEMA).split('model ClienteRelacion')[1] ?? ''
  const cuerpo = sinComentarios(modelo.split('\n}')[0] ?? '')
  assert.equal(
    /puedeVerPolizas/.test(cuerpo),
    false,
    'ClienteRelacion vuelve a declarar puedeVerPolizas',
  )
})

test('la migracion guarda la foto ANTES de apagar, y no borra relaciones', () => {
  const sql = leerCrudo('apps/asegura-portal/prisma/sql/2026-09-03_portal_autorizacion.sql')
  const foto = sql.indexOf('INSERT INTO seguros.cliente_relaciones_permiso_volcado')
  const apaga = sql.indexOf('UPDATE seguros.cliente_relaciones SET puede_ver_polizas = false')
  assert.ok(foto > 0 && apaga > 0, 'la migracion ya no hace la foto o ya no apaga')
  assert.ok(foto < apaga, 'apaga ANTES de fotografiar: apagarlo seria irreversible')
  assert.equal(
    /DELETE\s+FROM\s+seguros\.cliente_relaciones\b/i.test(sql),
    false,
    'las relaciones son conocimiento de negocio de Alberto (1.706 filas): se apaga el permiso, no se borra el vinculo',
  )
})

// ─── 2. Un tercero ve la COSA, nunca a la PERSONA ────────────────────────────

test('NINGUN alcance ensena IBAN, DNI ni documentos del otorgante', () => {
  for (const a of ALCANCES) {
    const c = camposDeAlcance(a)
    assert.equal(c.iban, false, `el alcance ${a} ensena el IBAN`)
    assert.equal(c.dniTomador, false, `el alcance ${a} ensena el DNI`)
    assert.equal(c.documentos, false, `el alcance ${a} ensena los documentos`)
  }
  // El cepo muerde de verdad: el nivel del que parten SI los trae.
  assert.equal(camposVisibles('completo').iban, true)
})

test('NINGUN alcance deja actuar en nombre del otorgante', () => {
  for (const a of ALCANCES) {
    const c = camposDeAlcance(a)
    assert.equal(c.abrirParte, false, `el alcance ${a} deja abrir un parte`)
    assert.equal(c.crearPeticiones, false, `el alcance ${a} deja crear peticiones`)
    assert.equal(c.autorizarTerceros, false, `el alcance ${a} deja reautorizar a un cuarto`)
  }
  assert.equal(camposVisibles('tarjeta').abrirParte, true)
})

test('el tope sigue en pie por mucho que se combinen alcances', () => {
  const todos = camposDeAlcances(ALCANCES)
  assert.notEqual(todos, null)
  assert.equal(todos?.iban, false)
  assert.equal(todos?.dniTomador, false)
  assert.equal(todos?.abrirParte, false)
})

test('sin alcances vigentes no se sirve nada, ni la tarjeta por cortesia', () => {
  assert.equal(camposDeAlcances([]), null)
})

// ─── 3. Actuar en nombre de otro es apoderamiento, y hoy no se concede ───────

test('partes y documentos NO estan entre los concedibles', () => {
  assert.equal(ALCANCES_CONCEDIBLES.includes('partes' as never), false)
  assert.equal(ALCANCES_CONCEDIBLES.includes('documentos' as never), false)
  assert.deepEqual([...ALCANCES_CONCEDIBLES], ['ver', 'ver_economico'])
})

// ─── 4. La vigencia se decide en un solo sitio ───────────────────────────────

test('la lectura pregunta la vigencia al modulo puro, no la reimplementa', () => {
  const src = leer(CARTERA)
  assert.match(src, /autorizacionVigente\(/)
  assert.equal(
    /caducaEn\s*[<>]/.test(src),
    false,
    'compara caducaEn a mano: la regla se desincroniza en cuanto cambie en un sitio y no en el otro',
  )
})

test('un alcance que la BD tenga y el modulo no conozca NO abre nada', () => {
  const src = leer(CARTERA)
  assert.match(src, /esAlcance\(/)
  assert.equal(
    /alcance\s*(\?\?|\|\|)\s*['"]/.test(src),
    false,
    'un valor desconocido cayendo a un alcance por defecto convierte «no lo entiendo» en acceso concedido',
  )
})

test('caducada sin aceptar se dice caducada, no pendiente', () => {
  const hoy = new Date('2026-09-03T10:00:00Z')
  const ayer = new Date('2026-09-02T10:00:00Z')
  assert.equal(estadoAutorizacion({ aceptadoEn: null, caducaEn: ayer, revocadoEn: null }, hoy), 'caducada')
  assert.equal(estadoAutorizacion({ aceptadoEn: ayer, caducaEn: ayer, revocadoEn: hoy }, hoy), 'revocada')
})

// ─── 5. Leer no escribe ──────────────────────────────────────────────────────

test('la lectura de la cartera no escribe el registro de accesos', () => {
  const src = leer(CARTERA)
  assert.equal(
    /portalAutorizacionUso/.test(src),
    false,
    'carteraDeIdentidad escribe el registro de usos: una lectura que escribe se cae con el rol equivocado y ademas no se puede testear',
  )
  // Devuelve QUÉ se usó para que lo anote quien pinta la bóveda.
  assert.match(src, /autorizacionesUsadas/)
})

// ─── 6. La grieta que abre la persona jurídica ───────────────────────────────
// Una sociedad no tiene datos personales, así que puede delegar lo que una
// persona no. Esa excepción es correcta, y es exactamente el sitio por donde se
// puede colar la vieja: basta con que alguien la aplique por omisión.

test('el default de tipo de otorgante es PERSONA, el lado restrictivo', () => {
  // Un default permisivo aqui abriria apoderamientos por omision: el fallo que
  // no se ve, porque no falla nada.
  assert.equal(alcanceConcedible('partes'), null)
  assert.equal(camposDeAlcance('partes').abrirParte, false)
  assert.equal(camposDeAlcance('ver_economico').iban, false)
  assert.equal(camposDeAlcances(['ver_economico'])?.dniTomador, false)
})

test('representar a una sociedad NUNCA da reautorizar a un cuarto', () => {
  for (const a of ALCANCES) {
    assert.equal(
      camposDeAlcance(a, 'juridica').autorizarTerceros,
      false,
      `el alcance ${a} deja a un representante ampliar el circulo de la sociedad`,
    )
  }
  assert.equal(camposDeAlcances(ALCANCES, 'juridica')?.autorizarTerceros, false)
})

test('la excepcion es SOLO para juridica: la fisica sigue sin poder apoderar', () => {
  assert.deepEqual([...alcancesConcedibles('fisica')], [...ALCANCES_CONCEDIBLES])
  assert.equal(alcancesConcedibles('fisica').includes('partes'), false)
  assert.equal(alcancesConcedibles('fisica').includes('documentos'), false)
})

test('la boveda sirve segun QUIEN cede, no con el tope de persona siempre', () => {
  // El hueco que quedo al partir la regla en dos: `camposDeAlcances(alcances)`
  // sin tipo sirve una autorizacion de una SOCIEDAD con el suelo de una
  // persona. Cae del lado seguro, pero un `partes` concedido no se honraria y
  // pareceria un fallo del codigo en vez de una regla.
  const src = leer(CARTERA)
  assert.match(src, /tipoPersona/, 'la boveda no lee el tipo de la ficha ajena')
  assert.match(
    src,
    /camposDeAlcances\([^)]*,[^)]*\)/,
    'camposDeAlcances se llama sin decir quien cede: usaria el default `fisica`',
  )
})

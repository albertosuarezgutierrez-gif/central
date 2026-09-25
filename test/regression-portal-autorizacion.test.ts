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
import { readFileSync, readdirSync } from 'node:fs'
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
import { generarCodigo } from '../packages/module-seguros-portal/src/codigo.ts'

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

test('NINGUN alcance salvo Acceso total ensena IBAN, DNI ni documentos del otorgante', () => {
  // `total` (25/09/2026) abre al titular ENTERO por decisión expresa de Alberto,
  // con su propio texto de consentimiento. Todo lo demás sigue igual de capado.
  for (const a of ALCANCES.filter((x) => x !== 'total')) {
    const c = camposDeAlcance(a)
    assert.equal(c.iban, false, `el alcance ${a} ensena el IBAN`)
    assert.equal(c.dniTomador, false, `el alcance ${a} ensena el DNI`)
    assert.equal(c.documentos, false, `el alcance ${a} ensena los documentos`)
  }
  // El cepo muerde de verdad: el nivel del que parten SI los trae.
  assert.equal(camposVisibles('completo').iban, true)
  assert.equal(camposDeAlcance('total').iban, true, 'el acceso total SI abre el IBAN: es lo que se consintió')
})

test('NINGUN alcance salvo Acceso total deja actuar en nombre del otorgante, y NINGUNO reautoriza', () => {
  for (const a of ALCANCES.filter((x) => x !== 'total')) {
    const c = camposDeAlcance(a)
    assert.equal(c.abrirParte, false, `el alcance ${a} deja abrir un parte`)
    assert.equal(c.crearPeticiones, false, `el alcance ${a} deja crear peticiones`)
    assert.equal(c.autorizarTerceros, false, `el alcance ${a} deja reautorizar a un cuarto`)
  }
  assert.equal(camposVisibles('tarjeta').abrirParte, true)
  assert.equal(camposDeAlcance('total').abrirParte, true)
  assert.equal(camposDeAlcance('total').autorizarTerceros, false, 'ni con acceso total se reautoriza a un cuarto')
})

test('el tope sigue en pie por mucho que se combinen alcances que no son el total', () => {
  const todos = camposDeAlcances(ALCANCES.filter((x) => x !== 'total'))
  assert.notEqual(todos, null)
  assert.equal(todos?.iban, false)
  assert.equal(todos?.dniTomador, false)
  assert.equal(todos?.abrirParte, false)
  assert.equal(camposDeAlcances(ALCANCES)?.autorizarTerceros, false)
})

test('sin alcances vigentes no se sirve nada, ni la tarjeta por cortesia', () => {
  assert.equal(camposDeAlcances([]), null)
})

// ─── 3. Dos permisos: Solo ver y Acceso total (25/09/2026) ──────────────────

test('se conceden SOLO los dos permisos; partes y documentos sueltos ya no', () => {
  assert.equal(ALCANCES_CONCEDIBLES.includes('partes' as never), false)
  assert.equal(ALCANCES_CONCEDIBLES.includes('documentos' as never), false)
  assert.deepEqual([...ALCANCES_CONCEDIBLES], ['ver_economico', 'total'])
})

test('el acceso total NO se reparte por invitacion: la invitacion sigue en Solo ver', () => {
  const pantalla = leer('apps/asegura-portal/app/(portal)/autorizaciones/Autorizaciones.tsx')
  assert.match(pantalla, /CONCEDIBLES_POR_INVITACION: readonly Alcance\[\] = \['ver_economico'\]/)
  assert.match(pantalla, /filter\(\(a\) => CONCEDIBLES_POR_INVITACION\.includes\(a\)\)/)
})

test('aceptada NO caduca: toda via que acepta pone caducaEn a null en el mismo update', () => {
  // Pendiente caduca a los 30 dias; al aceptar tiene que pasar a NULL. Un
  // `aceptadoEn` sin `caducaEn: null` al lado dejaria el acceso muriendo en su
  // fecha de oferta.
  for (const f of ['apps/asegura-portal/lib/autorizaciones.ts', 'apps/asegura-portal/lib/invitaciones.ts', 'apps/asegura-portal/lib/peticiones.ts']) {
    const src = leer(f)
    assert.doesNotMatch(src, /caducidadPorDefecto/, `${f} sigue poniendo caducidad de un año`)
    const aceptaciones = src.match(/data: \{ aceptadoEn: [^}]*\}/g) ?? []
    assert.ok(aceptaciones.length > 0, `${f}: no encuentro ninguna aceptacion (¿se ha movido?)`)
    for (const a of aceptaciones) assert.match(a, /caducaEn: null/, `${f}: acepta sin quitar la caducidad: ${a}`)
  }
})

test('ni la oferta PENDIENTE caduca: conceder, ampliar y corredor escriben caducaEn null', () => {
  // Decisión de Alberto (25/09/2026): la oferta olvidada la cubre la revisión
  // anual, no una caducidad. Sin fecha en las TRES vías que crean pendientes.
  const src = leer('apps/asegura-portal/lib/autorizaciones.ts')
  assert.doesNotMatch(src, /caducidadPendiente/)
  assert.doesNotMatch(leer('apps/asegura/lib/cartera-relaciones.ts'), /caducidadPendiente/)
  // Y la revisión cuenta desde que se OFRECE: sin `otorgadoEn` la oferta vieja no avisa.
  assert.match(src, /otorgadoEn: f\.otorgadoEn,\n\s*\},\n\s*hoy,/)
})

test('el acceso total NO se pide: peticiones validan con ALCANCES_PEDIBLES', () => {
  for (const f of ['apps/asegura-portal/app/api/peticiones/route.ts', 'apps/asegura-portal/app/api/sugerencias/pedir/route.ts']) {
    const src = leer(f)
    assert.match(src, /z\.enum\(ALCANCES_PEDIBLES/, `${f} no valida con ALCANCES_PEDIBLES`)
  }
  const pet = leer('apps/asegura-portal/lib/peticiones.ts')
  assert.doesNotMatch(pet, /alcanceConcedible\(/, 'peticiones.ts valida con la lista de conceder, que incluye total')
})

test('una cartera compartida SIN caducidad no desaparece de la boveda', () => {
  // El corte antiguo era `if (caduca === null) continue`: con NULL = «no caduca»
  // hacía desaparecer en silencio todas las carteras compartidas nuevas.
  const src = leer(CARTERA)
  assert.doesNotMatch(src, /if \(caduca === null\) continue/)
  assert.match(src, /if \(caduca === undefined\) continue/)
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

// ─── 7. El barril no puede arrastrar `node:` al navegador ───────────────────
// Coste medido: TRES despliegues de producción seguidos en ERROR el 03/09/2026
// (`UnhandledSchemeError: Reading from "node:crypto"`), con el portal sin
// desplegar desde que entró el parte de siniestro. Y lo peor del fallo es que
// no lo ve nadie: el typecheck pasa, los tests pasan —en Node el módulo
// existe— y el check `Lint · TypeCheck · Build` solo construye `apps/ia-rest`.
// Solo lo dice el build de producción del portal, que nadie mira.

test('ningun fichero del barril importa un modulo `node:`', () => {
  const dir = join(RAIZ, 'packages/module-seguros-portal/src')
  const culpables: string[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue
    // `from 'node:x'` o `import 'node:x'`, ya sin comentarios.
    if (/from\s*['"]node:|import\s*['"]node:/.test(sinComentarios(readFileSync(join(dir, f), 'utf8')))) {
      culpables.push(f)
    }
  }
  assert.deepEqual(
    culpables,
    [],
    `del barril de @central/module-seguros-portal tiran los COMPONENTES DE CLIENTE del portal: un import \`node:\` aqui revienta el build de produccion con UnhandledSchemeError. Usa Web Crypto o saca el fichero del barril. Culpables: ${culpables.join(', ')}`,
  )
})

test('generarCodigo sigue dando seis digitos y sin sesgo de resto', () => {
  const vistos = new Set<string>()
  for (let i = 0; i < 500; i++) {
    const c = generarCodigo()
    assert.match(c, /^\d{6}$/)
    vistos.add(c)
  }
  // Con 500 tiradas sobre un millon, repetirse mas de un par de veces delataria
  // un generador roto (p. ej. uno que devolviera siempre el mismo valor).
  assert.ok(vistos.size > 490, `demasiadas repeticiones: ${vistos.size}/500`)
})

// ─── Dar un parte exige el alcance `partes` (24/09/2026) ─────────────────────
// Hasta ese día la ruta aceptaba cualquier póliza autorizada, también con solo
// `ver`: el alcance `partes` no protegía nada. Decisión de Alberto: se exige.
// La ruta, la pantalla que lo ofrece y el botón de la ficha tienen que salir de
// la MISMA fuente (`polizasParaParte`); si divergen, se ofrece lo que luego da 403.
test('dar un parte sobre una póliza ajena exige `partes`: ruta, bóveda y ficha usan polizasParaParte', () => {
  const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8')
  const ruta = leer('apps/asegura-portal/app/api/siniestros/route.ts')
  assert.match(ruta, /polizasParaParte\(cartera\)\.has\(valor\.polizaId\)/, 'la ruta decide con polizasParaParte')
  assert.doesNotMatch(
    ruta,
    /\.\.\.cartera\.autorizadas\]\.flatMap/,
    'la ruta no puede volver a aceptar TODAS las autorizadas',
  )
  const boveda = leer('apps/asegura-portal/app/(portal)/boveda/page.tsx')
  assert.match(boveda, /polizasParaParte\(cartera\)/, 'la bóveda ofrece lo mismo que acepta la ruta')
  const ficha = leer('apps/asegura-portal/app/(portal)/boveda/poliza/[id]/page.tsx')
  assert.match(ficha, /polizasParaParte\(cartera\)\.has\(p\.id\)/, 'la ficha no ofrece «dar parte» sin el alcance')
  const lectura = leer('apps/asegura-portal/lib/cartera-lectura.ts')
  assert.match(lectura, /if \(puedeDarParte\(alcances, tipo\)\) conPartes\.add\(polizaId\)/, 'el alcance se decide por póliza')
})

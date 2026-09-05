// Guardián del aislamiento por identidad en `apps/asegura-portal`. `node --test`
// (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// El portal guarda las pólizas que APORTA cada persona. Lo único que separa la
// bóveda de una de la de otra es que toda consulta se filtre por la identidad
// que sale de la COOKIE. No hay RLS que rescate un olvido: el rol del portal
// conecta como aplicación y una consulta sin `where` responde 200 con los datos
// de todo el mundo. El modo de fallo no es «no se ve nada» —eso se nota— sino
// «se ve TODO y nada falla».
//
// El cepo fija dos cosas sobre cada fichero que toque `prisma.portal*`:
//   1. Que importe la puerta única, `lib/session` — de ahí y solo de ahí sale
//      de quién es la sesión.
//   2. Que la consulta mencione `identidadId`. Importar la puerta y luego
//      consultar sin filtrar es exactamente el fallo que esto persigue.
//
// 📌 Desviación deliberada del spec: el spec nombra la puerta `lib/acceso.ts`,
// porque allí guarda además la lectura de la CARTERA (con sus niveles de acceso
// y la costura `origen: cartera | aportada`). En Fase 1 no se lee cartera: solo
// hay bóveda propia, y lo único que hay que resolver es de quién es la sesión.
// Cuando entre la Fase 4 (vinculación con CIMA), `lib/acceso.ts` nace encima y
// este guardián pasa a exigirlo a él: es un renombrado del cepo, no otro cepo.
//
// ─── Fase 4 (02/09/2026): la CARTERA ─────────────────────────────────────────
// El portal ya lee `clientes`, `polizas`, `poliza_recibos`, `siniestros`… con el
// rol `prisma_asegura_portal` (SIN BYPASSRLS, grants por COLUMNAS). Dos cepos
// más, del mismo tipo:
//   3. Todo fichero que consulte un modelo de cartera importa `lib/session`
//      (o es `lib/vinculo.ts`, que corre en el canje del código, antes de que
//      haya sesión) Y nombra `portalVinculo`: la costura identidad ↔ ficha.
//      Una lectura de `prisma.poliza` que no pase por `portal_vinculo` es la
//      cartera entera a un `where` de distancia.
//   4. El `schema.prisma` del portal NO declara las columnas que el rol no
//      puede leer (DNI, IBAN, teléfono, email, dirección, comentario…). Prisma
//      pide cada columna por su nombre: una de más y la consulta ENTERA falla
//      en la BD. Que el schema no las tenga es la garantía; esto la vigila.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/**
 * Estos SÍ pueden tocar `prisma.portal*` sin sesión: son la puerta de entrada
 * (todavía no hay identidad que resolver) o la propia maquinaria de sesión.
 * Añadir algo aquí es una decisión, no un trámite.
 */
const EXENTOS = new Set([
  'apps/asegura-portal/lib/db.ts',
  'apps/asegura-portal/lib/session.ts',
  'apps/asegura-portal/lib/auth.ts',
  'apps/asegura-portal/app/api/acceso/solicitar/route.ts',
  'apps/asegura-portal/app/api/acceso/verificar/route.ts',
  // Fase 4: crea `portal_vinculo` en el canje del código. La identidad la
  // recibe de `verificar/route.ts` (recién resuelta o creada); todavía no hay
  // cookie de la que sacarla. Solo escribe el vínculo de ESA identidad.
  'apps/asegura-portal/lib/vinculo.ts',
])

/**
 * Modelos de la CARTERA que el portal puede leer (Fase 4). Cualquier fichero
 * que los toque tiene que partir de `portal_vinculo` y de la sesión.
 */
const USA_PRISMA_CARTERA =
  /prisma\s*\.\s*(cliente|clienteEmail|poliza|polizaCobertura|polizaRecibo|siniestro|polizaInterviniente|clienteRelacion|correduria)\b/
/** La costura: el vínculo identidad ↔ ficha. Sin nombrarlo, la lectura no parte de la identidad. */
const NOMBRA_VINCULO = /portalVinculo/
/** Lee cartera sin sesión porque corre ANTES de que exista: el canje del código. */
const CARTERA_SIN_SESION = new Set(['apps/asegura-portal/lib/vinculo.ts'])

/** `prisma.portalPoliza…`, `prisma.portalBien…`, `prisma.portalIdentidad…` */
const USA_PRISMA_PORTAL = /prisma\s*\.\s*portal[A-Z]/
/** Importa la puerta única, con alias `@/`, por ruta relativa, o `./session` desde dentro de `lib/`. */
const USA_SESION = /from\s+['"](@\/lib\/session|(?:\.\.?\/)+lib\/session|\.\/session)(?:\.ts)?['"]/
/** El filtro por identidad, escrito de verdad en la consulta. */
const FILTRA_POR_IDENTIDAD = /identidadId/

// `--others --exclude-standard`: también los ficheros todavía sin commitear. Un
// fichero nuevo que lea la cartera es exactamente el que hay que cazar ANTES
// del commit, no después.
function ficherosDelPortal(): string[] {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !EXENTOS.has(f))
}

test('ningun fichero del portal consulta datos de identidad sin pasar por lib/session', () => {
  const infractores: string[] = []

  for (const f of ficherosDelPortal()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    if (!USA_PRISMA_PORTAL.test(src)) continue
    if (!USA_SESION.test(src)) infractores.push(f)
  }

  assert.deepEqual(
    infractores,
    [],
    'Estos ficheros leen o escriben datos del portal sin resolver la identidad por ' +
      '`lib/session`. Sin esa puerta, la consulta responde 200 con la bóveda de ' +
      `cualquiera:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('toda consulta al portal filtra por identidadId: importar la puerta no basta', () => {
  const infractores: string[] = []

  for (const f of ficherosDelPortal()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    if (!USA_PRISMA_PORTAL.test(src)) continue
    if (!FILTRA_POR_IDENTIDAD.test(src)) infractores.push(f)
  }

  assert.deepEqual(
    infractores,
    [],
    'Estos ficheros consultan `prisma.portal*` sin nombrar `identidadId` en ninguna ' +
      `parte: una consulta sin filtro devuelve las pólizas de todo el mundo:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('lib/session no tiene una identidad por defecto', () => {
  const src = readFileSync(join(ROOT, 'apps/asegura-portal/lib/session.ts'), 'utf8')
  assert.ok(
    !/identidadId\s*(\?\?|\|\|)\s*['"][^'"]/.test(src),
    'lib/session.ts no debe tener un fallback literal para la identidad: ' +
      'un id inventado no da error, da la bóveda de otro.',
  )
  assert.ok(
    /return null/.test(src),
    'sin cookie válida, `getIdentidad` devuelve null (nadie), nunca una identidad de relleno.',
  )
})

test('la lista de exentos solo contiene ficheros que existen', () => {
  const seguidos = new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean),
  )
  // Un exento que ya no existe es una puerta abierta esperando a que alguien
  // vuelva a crear el fichero con ese nombre.
  const fantasmas = [...EXENTOS].filter((f) => !seguidos.has(f))
  assert.deepEqual(fantasmas, [], `Exentos que ya no existen:\n  - ${fantasmas.join('\n  - ')}`)
})

function todosLosFicherosDelPortal(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
}

test('fase 4: toda lectura de la cartera pasa por lib/session y por portalVinculo', () => {
  const sinSesion: string[] = []
  const sinVinculo: string[] = []
  let vistos = 0

  for (const f of todosLosFicherosDelPortal()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    if (!USA_PRISMA_CARTERA.test(src)) continue
    vistos++
    if (!CARTERA_SIN_SESION.has(f) && !USA_SESION.test(src)) sinSesion.push(f)
    if (!NOMBRA_VINCULO.test(src)) sinVinculo.push(f)
  }

  assert.ok(vistos >= 2, 'lib/vinculo.ts y lib/cartera-lectura.ts leen la cartera: el cepo no está viendo nada')
  assert.deepEqual(
    sinSesion,
    [],
    'Estos ficheros leen la CARTERA sin resolver la identidad por `lib/session`. Con el rol ' +
      `del portal, una consulta sin identidad devuelve las pólizas de todos los clientes:\n  - ${sinSesion.join('\n  - ')}`,
  )
  assert.deepEqual(
    sinVinculo,
    [],
    'Estos ficheros leen la CARTERA sin pasar por `portalVinculo`: la única costura entre ' +
      `una identidad del portal y una ficha de la cartera:\n  - ${sinVinculo.join('\n  - ')}`,
  )
  const exentosFantasma = [...CARTERA_SIN_SESION].filter((f) => !todosLosFicherosDelPortal().includes(f))
  assert.deepEqual(exentosFantasma, [], `Exentos de cartera que ya no existen:\n  - ${exentosFantasma.join('\n  - ')}`)
})

/**
 * Columnas que el rol `prisma_asegura_portal` NO puede leer (GRANT por columnas
 * en `apps/asegura-portal/prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql`).
 * Declararlas en el schema del portal no es «leer más»: es que la consulta
 * entera revienta con `permission denied for column`. Y si algún día el GRANT
 * se ampliara por error, que el schema no las tenga sigue siendo la garantía.
 */
const COLUMNAS_PROHIBIDAS: Record<string, string[]> = {
  Cliente: ['dni', 'telefono', 'email', 'direccion', 'cuentaBancaria', 'fechaNacimiento', 'notas', 'dniLookupHash'],
  PolizaRecibo: ['iban', 'comisionBruta', 'comisionLiquida'],
  Siniestro: ['lugarDireccion', 'comentario', 'reservaImporte', 'indemnizacionImporte'],
  Poliza: ['cuentaBancaria', 'documentoUrl'],
  PolizaInterviniente: ['nif', 'nombre', 'apellidos', 'telefono', 'email', 'fechaNacimiento', 'fechaCarnet'],
  ClienteEmail: ['email'],
  Correduria: ['email', 'telefono', 'waAccessToken', 'cif'],
  ClienteRelacion: ['observaciones'],
}

function camposDelModelo(schema: string, modelo: string): string[] {
  const m = new RegExp(`^model ${modelo} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  assert.ok(m, `el schema del portal no declara el modelo ${modelo}`)
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('///') && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/)[0])
}

test('fase 4: el schema del portal no declara columnas que el rol no puede leer', () => {
  const schema = readFileSync(join(ROOT, 'apps/asegura-portal/prisma/schema.prisma'), 'utf8')
  const infracciones: string[] = []
  for (const [modelo, prohibidas] of Object.entries(COLUMNAS_PROHIBIDAS)) {
    const campos = new Set(camposDelModelo(schema, modelo))
    for (const c of prohibidas) if (campos.has(c)) infracciones.push(`${modelo}.${c}`)
  }
  assert.deepEqual(
    infracciones,
    [],
    'El schema del portal declara columnas que `prisma_asegura_portal` no tiene concedidas. ' +
      `Cada consulta a ese modelo fallará en la BD, y si el GRANT se ampliara, el portal leería PII:\n  - ${infracciones.join('\n  - ')}`,
  )
})

test('la ficha de una póliza AÑADIDA lleva la identidad DENTRO del where', () => {
  // 🚨 Nace el 05/09/2026, al fundir «Mis pólizas» en «Mis seguros»: esas filas
  // pasan a tener ficha propia en `/boveda/anadida/[id]`, y una ruta con un id
  // en la URL es el sitio exacto donde se filtra una bóveda ajena.
  //
  // Aquí la regla se cumple distinto que en la ficha de la CARTERA (que lee
  // primero todo lo autorizado y busca el id dentro): estas filas son de una
  // identidad y de nadie más, así que la guarda va en la CONSULTA. Leer por id
  // y comprobar el dueño en la línea siguiente compila, typechequea y funciona…
  // hasta que alguien mueva esa comprobación o la envuelva en un `if`.
  const src = readFileSync(
    join(process.cwd(), 'apps/asegura-portal/app/(portal)/boveda/anadida/[id]/page.tsx'),
    'utf8',
  )
  const i = src.indexOf('prisma.portalPolizaDeclarada')
  assert.ok(i > 0, 'no encuentro la consulta de la ficha de una póliza añadida')
  const bloque = src.slice(i, src.indexOf('})', i))
  assert.match(
    bloque,
    /where:\s*\{[^}]*identidadId:\s*identidad\.id/,
    'la identidad tiene que ir DENTRO del `where`, junto al id de la URL',
  )
  assert.doesNotMatch(
    bloque,
    /findUnique/,
    'un `findUnique` solo acepta la clave única, así que la identidad se quedaría fuera del `where` ' +
      'y la comprobación acabaría en un `if` posterior, que es justo lo que se puede perder',
  )
})

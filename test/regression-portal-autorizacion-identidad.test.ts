// Cepo de la AUTORIZACIÓN POR IDENTIDAD y POR PÓLIZA del portal del cliente
// (04/09/2026). `node --test` (gate en CI vía `pnpm test:guardia`).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 QUÉ SE ROMPIÓ Y POR QUÉ DUELE
//
// `seguros.portal_autorizacion` («José deja que María vea sus seguros») tenía
// dos techos, y el 04/09/2026 se levantaron los dos:
//
//  1. **`autorizado_cliente_id` era NOT NULL** → solo se podía autorizar a quien
//     YA era cliente de la correduría. Eso dejaba fuera justo el caso que de
//     verdad pasa —el hijo que quiere ver la póliza de su padre y no es cliente
//     de nadie— y contradice el producto: el portal es gratis y abierto, porque
//     ahí está la captación. Ahora la columna es nullable y hay
//     `autorizado_identidad_id` (la identidad del portal, lo que hay detrás de
//     la cookie). **Exactamente una de las dos va rellena**, y lo obliga la BD
//     (CHECK `portal_autorizacion_destinatario_unico`, `num_nonnulls(...) = 1`,
//     visto morder con un 23514 dentro de un ROLLBACK).
//
//  2. **La autorización abría la FICHA ENTERA** → ahora hay `poliza_id`: `null`
//     = todas las del otorgante (las FUTURAS incluidas), con valor = solo esa.
//     La BD lo ata con una FK COMPUESTA `(otorgante_cliente_id, poliza_id)` →
//     `polizas(cliente_id, id)`, así que un id manipulado no cuela la póliza de
//     un tercero (probado: 23503).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🩸 EL MODO DE FALLO QUE PERSIGUE ESTE FICHERO, que es siempre el mismo:
// **no falla, deja de funcionar.** Cada una de estas líneas se puede borrar sin
// que reviente nada, y el resultado es una pantalla que sale VACÍA o un
// registro de accesos que dice «no ha entrado nadie» sobre alguien que sí
// entró. Nada de eso da error, ni sale en un log, ni lo nota un typecheck:
//
//   · quitar el brazo `autorizadoIdentidadId` de la bóveda → el invitado tiene
//     su autorización viva en la BD y la lectura ni la mira;
//   · volver a cortar por «no tiene vínculo» → se echa a la calle exactamente a
//     quien el producto quiere dentro. Ese corte estuvo VIVO en las DOS
//     pantallas hasta el 04/09/2026: `carteraDeIdentidad` devolvía `SIN_VINCULO`
//     y `autorizacionesDeIdentidad` una respuesta vacía de relleno, así que el
//     invitado no veía en `/autorizaciones` ni que existía la autorización que
//     le habían abierto — y por tanto no podía ni aceptarla ni revocarla,
//     aunque `resolver()` sí la resolviera con su id. No fallaba: salía vacía;
//   · quitarlo de `resolver`/`registrarUso` → el invitado no puede aceptar ni
//     revocar lo que le abrieron, y sus visitas no se anotan;
//   · dejar de seguir `merged_into_poliza_id` → las 5 pólizas fusionadas de hoy
//     dejan la autorización apuntando a una fila muerta y el acceso se apaga
//     solo;
//   · sacar `polizaId` del WHERE de las «previas» → la clave del índice único
//     es (otorgante, autorizado, COALESCE(póliza), alcance), así que conceder la
//     del coche encontraría la de la casa como «ya concedida», o peor, se
//     enlazaría con una que no es.
//
// Por eso el cepo no comprueba resultados: comprueba que esas líneas siguen
// escritas, y cada aserción tiene su gemela «— el cepo muerde», que le pasa a
// la MISMA función una copia MUTILADA del fichero y exige que la cace. Un cepo
// que nunca ha disparado es una suposición.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

const LECTURA = 'apps/asegura-portal/lib/cartera-lectura.ts'
const AUTORIZACIONES = 'apps/asegura-portal/lib/autorizaciones.ts'
const PETICIONES = 'apps/asegura-portal/lib/peticiones.ts'
const SCHEMA = 'apps/asegura-portal/prisma/schema.prisma'
const SQL_IDENTIDAD = 'apps/asegura-portal/prisma/sql/2026-09-04_portal_autorizacion_identidad.sql'
const SQL_POLIZA = 'apps/asegura-portal/prisma/sql/2026-09-04_portal_autorizacion_por_poliza.sql'

const crudo = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * El fichero SIN comentarios y con los espacios colapsados.
 *
 * 🚨 Quitar los comentarios NO es cosmética: media docena de las líneas que este
 * cepo vigila están EXPLICADAS en un comentario justo encima, con las mismas
 * palabras. Sin esto, un fichero bien documentado pasaría por tener la línea
 * escrita en su propia prosa y uno mudo con el código correcto suspendería.
 * Le pasó a `regression-portal-parte-siniestro.test.ts` y está aprendido.
 *
 * Se escanea en vez de usar un regex porque un `'https://…'` dentro de una
 * cadena se comería media línea de código real.
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

/** Código desnudo: sin comentarios y en una sola línea, para poder mirarlo con regex. */
const norm = (src: string) => sinComentarios(src).replace(/\s+/g, ' ')

/**
 * El objeto `{…}` que sigue a un ancla, balanceando llaves y saltándose las
 * cadenas. Sirve para mirar DENTRO de un `where` concreto en vez de por todo el
 * fichero: que `autorizadoIdentidadId` aparezca en alguna parte del módulo no
 * dice nada — lo que importa es que esté en ESA consulta.
 *
 * Exige que el ancla aparezca EXACTAMENTE una vez: si un día no aparece (la
 * consulta se renombró o se movió) el cepo grita en vez de pasar en verde, que
 * es la forma silenciosa en la que se mueren los guardianes.
 */
function bloqueTras(src: string, ancla: RegExp): string {
  const global = new RegExp(ancla.source, ancla.flags.includes('g') ? ancla.flags : ancla.flags + 'g')
  const hallados = [...src.matchAll(global)]
  if (hallados.length !== 1) {
    throw new Error(`el ancla ${ancla} aparece ${hallados.length} veces (se esperaba 1): la consulta que vigila este cepo se ha movido o renombrado`)
  }
  const desde = src.indexOf('{', hallados[0].index + hallados[0][0].length)
  if (desde < 0) throw new Error(`tras ${ancla} no hay ningún objeto que mirar`)
  let profundidad = 0
  let comilla: string | null = null
  for (let i = desde; i < src.length; i += 1) {
    const c = src[i]
    if (comilla) {
      if (c === '\\') { i += 1; continue }
      if (c === comilla) comilla = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { comilla = c; continue }
    if (c === '{') profundidad += 1
    else if (c === '}') {
      profundidad -= 1
      if (profundidad === 0) return src.slice(desde, i + 1)
    }
  }
  throw new Error(`el bloque que sigue a ${ancla} no se cierra`)
}

/** Convierte en un fallo legible cualquier excepción del inspector: nunca en un verde. */
function fallos(fn: () => string[]): string[] {
  try {
    return fn()
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  }
}

/** Muta el fichero real en memoria. Si el trozo no está, el test de mordida miente: se exige. */
function mutar(src: string, de: string, a: string): string {
  assert.ok(src.includes(de), `la mutación no encontró «${de}»: el test de mordida ya no prueba nada`)
  return src.replace(de, a)
}

// ─── 0. El guardián no se salta a sí mismo ───────────────────────────────────

test('los ficheros que vigila este cepo existen', () => {
  // Un guardián que se salta a sí mismo cuando el fichero no está no es un
  // guardián: es el mismo «no lo he mirado» disfrazado de verde que persigue.
  for (const f of [LECTURA, AUTORIZACIONES, PETICIONES, SCHEMA, SQL_IDENTIDAD, SQL_POLIZA]) {
    assert.ok(existsSync(join(ROOT, f)), `falta ${f}`)
  }
})

// ─── 1. La bóveda mira las DOS ramas ─────────────────────────────────────────

function fallosBoveda(src: string): string[] {
  return fallos(() => {
    const p: string[] = []
    const consulta = bloqueTras(norm(src), /const filasAutorizacion = await prisma\.portalAutorizacion\.findMany\(/)
    if (!/autorizadoIdentidadId:\s*identidadId/.test(consulta)) {
      p.push('la bóveda no busca por `autorizadoIdentidadId`: el invitado sin ficha tiene su autorización en la BD y la lectura ni la mira')
    }
    if (!/autorizadoClienteId:\s*\{\s*in:/.test(consulta)) {
      p.push('la bóveda no busca por `autorizadoClienteId`: quien SÍ es cliente deja de ver lo que le autorizaron')
    }
    return p
  })
}

test('la bóveda resuelve las autorizaciones por las DOS ramas (ficha e identidad)', () => {
  assert.deepEqual(
    fallosBoveda(crudo(LECTURA)),
    [],
    'A una identidad la alcanza una autorización por DOS caminos: por una FICHA suya o por su ' +
      'IDENTIDAD (no es cliente de nadie y le invitaron). Quitar el segundo brazo no da error: ' +
      'la bóveda del invitado sale vacía.',
  )
})

test('la bóveda resuelve las DOS ramas — el cepo muerde', () => {
  const sinIdentidad = mutar(crudo(LECTURA), '{ autorizadoIdentidadId: identidadId },', '')
  assert.notDeepEqual(fallosBoveda(sinIdentidad), [], 'sin el brazo de identidad el cepo tiene que disparar')
  const sinFicha = mutar(crudo(LECTURA), '{ autorizadoClienteId: { in: propiosIds } }', '{}')
  assert.notDeepEqual(fallosBoveda(sinFicha), [], 'sin el brazo de ficha el cepo tiene que disparar')
})

// ─── 2. El corte de «aquí no hay nada» usa las DOS listas ────────────────────

function fallosCorte(src: string): string[] {
  return fallos(() => {
    const p: string[] = []
    const n = norm(src)
    const retornos = [...n.matchAll(/return SIN_VINCULO/g)]
    if (retornos.length === 0) {
      p.push('nadie devuelve ya `SIN_VINCULO`: o el corte se llama de otra forma, o la lectura dejó de tener un «aquí no hay nada»')
    }
    for (const m of retornos) {
      const antes = n.slice(Math.max(0, m.index - 220), m.index)
      if (!/filasAutorizacion\.length === 0/.test(antes)) {
        p.push('un `return SIN_VINCULO` que NO mira `filasAutorizacion`: cortar solo por «no tiene vínculo» echa a la calle al invitado, que es justo a quien el producto quiere dentro')
      }
    }
    return p
  })
}

test('el corte de «aquí no hay nada» se decide con las DOS listas', () => {
  assert.deepEqual(
    fallosCorte(crudo(LECTURA)),
    [],
    'Hasta el 04/09/2026 bastaba con no tener `portal_vinculo` para devolver `SIN_VINCULO`. ' +
      'Un invitado sin ficha NO tiene vínculo y sí tiene autorizaciones: si el corte vuelve a ' +
      'mirar solo los vínculos, su pantalla sale vacía sin que nada falle.',
  )
})

test('el corte usa las dos listas — el cepo muerde', () => {
  const soloVinculos = mutar(
    crudo(LECTURA),
    'if (vinculos.length === 0 && filasAutorizacion.length === 0) return SIN_VINCULO',
    'if (vinculos.length === 0) return SIN_VINCULO',
  )
  assert.notDeepEqual(fallosCorte(soloVinculos), [], 'el corte viejo (solo vínculos) tiene que disparar el cepo')
})

// ─── 2 bis. La LISTA tampoco corta por «no tiene vínculo» ───────────────────

function fallosListaSinVinculo(src: string): string[] {
  return fallos(() => {
    const p: string[] = []
    const cuerpo = bloqueTras(norm(src), /export async function autorizacionesDeIdentidad/)

    // Regla generosa a propósito: **cualquier** `return` antes de la consulta es
    // una salida temprana, se llame `SIN_NADA`, se escriba en línea o se
    // esconda tras un helper. Lo único que hay antes de la consulta son
    // declaraciones, así que aquí no hay falsos positivos que tolerar — y el
    // cepo sobrevive a que la constante vuelva con otro nombre.
    const consulta = cuerpo.indexOf('prisma.portalAutorizacion.findMany')
    if (consulta < 0) {
      p.push('`autorizacionesDeIdentidad` ya no consulta `portalAutorizacion`: o se movió, o la pantalla dejó de leer las autorizaciones')
    } else if (/\breturn\b/.test(cuerpo.slice(0, consulta))) {
      p.push('`autorizacionesDeIdentidad` sale por un `return` ANTES de mirar las autorizaciones: si ese corte es «no tiene vínculo», el invitado no ve en su pantalla lo que le abrieron y no lo puede ni aceptar ni revocar')
    }

    // La otra mitad: prohibir la salida temprana no sirve de nada si el brazo
    // que hace falta llegar a mirar desaparece.
    if (!/autorizadoIdentidadId:\s*identidadId/.test(cuerpo)) {
      p.push('la lista no busca por `autorizadoIdentidadId`: llegar a la consulta no vale si la consulta ya no mira la rama del invitado')
    }
    return p
  })
}

test('la lista de autorizaciones no corta por «no tiene vínculo»', () => {
  assert.deepEqual(
    fallosListaSinVinculo(crudo(AUTORIZACIONES)),
    [],
    'Sin vínculo, `misIds` queda `[]` y eso NO afloja ninguna frontera: los dos brazos de ficha ' +
      '(`in: []`) no casan con nada y lo único en pie es `autorizadoIdentidadId`, que es esta ' +
      'identidad. Cortar antes es lo que dejaba al invitado con una autorización invisible.',
  )
})

test('la lista no corta por «no tiene vínculo» — el cepo muerde', () => {
  const src = crudo(AUTORIZACIONES)

  const conElCorteViejo = mutar(
    src,
    'const vinculos = await fichasDeIdentidad(identidadId)\n\n  const misIds',
    'const vinculos = await fichasDeIdentidad(identidadId)\n  if (vinculos.length === 0) return SIN_NADA\n\n  const misIds',
  )
  assert.notDeepEqual(fallosListaSinVinculo(conElCorteViejo), [], 'el corte viejo tiene que disparar el cepo')

  const sinTercerBrazo = mutar(src, '          { autorizadoIdentidadId: identidadId },\n        ],\n      },\n      orderBy:', '        ],\n      },\n      orderBy:')
  assert.notDeepEqual(fallosListaSinVinculo(sinTercerBrazo), [], 'quitar el tercer brazo de la lista tiene que disparar el cepo')
})

// ─── 3. `resolver` y `registrarUso` también miran la identidad ───────────────

function fallosLadoAutorizado(src: string): string[] {
  return fallos(() => {
    const p: string[] = []
    const n = norm(src)

    const deResolver = bloqueTras(n, /const fila = await prisma\.portalAutorizacion\.findFirst\(/)
    if (!/autorizadoIdentidadId:\s*identidadId/.test(deResolver)) {
      p.push('`resolver` no busca por `autorizadoIdentidadId`: el invitado no encuentra la autorización que le abrieron y no puede ni aceptarla ni revocarla')
    }
    if (!/const soyAutorizado =[\s\S]{0,240}?autorizadoIdentidadId === identidadId/.test(n)) {
      p.push('`soyAutorizado` no contempla la rama de identidad: aunque la fila se encuentre, aceptar devolvería `no_te_toca`')
    }

    const deUso = bloqueTras(n, /const validas = await prisma\.portalAutorizacion\.findMany\(/)
    if (!/autorizadoIdentidadId:\s*identidadId/.test(deUso)) {
      p.push('`registrarUso` no valida por `autorizadoIdentidadId`: las visitas del invitado no se anotan y el otorgante lee «no ha entrado nadie» sobre alguien que sí entró')
    }
    if (!/autorizadoClienteId:\s*\{\s*in:/.test(deUso)) {
      p.push('`registrarUso` dejó de validar por las fichas de la identidad: un id ajeno crearía una visita falsa en un registro que es una prueba, no un contador')
    }
    return p
  })
}

test('resolver y registrarUso miran también la IDENTIDAD, no solo las fichas', () => {
  assert.deepEqual(
    fallosLadoAutorizado(crudo(AUTORIZACIONES)),
    [],
    'Aceptar, revocar y anotar la visita son las tres cosas que hace el lado AUTORIZADO. Si ' +
      'solo se le busca por sus fichas, el invitado —que no tiene ninguna— queda con una ' +
      'autorización que no puede tocar y con visitas que nadie registra.',
  )
})

test('resolver y registrarUso miran la identidad — el cepo muerde', () => {
  const src = crudo(AUTORIZACIONES)

  const sinResolver = mutar(
    src,
    `        { autorizadoClienteId: { in: misIds } },
        { autorizadoIdentidadId: identidadId },`,
    '        { autorizadoClienteId: { in: misIds } },',
  )
  assert.notDeepEqual(fallosLadoAutorizado(sinResolver), [], '`resolver` sin la rama de identidad tiene que disparar')

  const sinSoyAutorizado = mutar(
    src,
    `    (fila.autorizadoClienteId !== null && misIds.includes(fila.autorizadoClienteId)) ||
    fila.autorizadoIdentidadId === identidadId`,
    '    fila.autorizadoClienteId !== null && misIds.includes(fila.autorizadoClienteId)',
  )
  assert.notDeepEqual(fallosLadoAutorizado(sinSoyAutorizado), [], '`soyAutorizado` sin la identidad tiene que disparar')

  const sinUso = mutar(src, '          { autorizadoIdentidadId: identidadId },\n        ],\n      },\n      select: { id: true },', '        ],\n      },\n      select: { id: true },')
  assert.notDeepEqual(fallosLadoAutorizado(sinUso), [], '`registrarUso` sin la rama de identidad tiene que disparar')
})

// ─── 4. La póliza concedida se sigue a través de la FUSIÓN ───────────────────

function fallosFusion(src: string): string[] {
  return fallos(() => {
    const p: string[] = []
    const n = norm(src)
    const consulta = bloqueTras(n, /const filas = await prisma\.poliza\.findMany\(/)
    if (!/mergedIntoPolizaId:\s*true/.test(consulta)) {
      p.push('la lectura de las pólizas CONCEDIDAS no pide `mergedIntoPolizaId`: sin ese dato no hay forma de seguir una fusión')
    }
    if (!/mergedIntoPolizaId\s*\?\?\s*f\.id/.test(n)) {
      p.push('no se resuelve el salto de fusión (`mergedIntoPolizaId ?? f.id`): una autorización sobre una póliza fusionada deja de abrir nada y nadie se entera')
    }
    if (!/trasFusion\.get\(/.test(n)) {
      p.push('el mapa de fusión no se consulta: se calcula y no se usa, que es igual que no tenerlo')
    }
    if (!/destino === undefined/.test(n)) {
      p.push('no se descarta la póliza concedida que ya no existe: sin fila no hay destino, y servirla bajo otro id sería inventarse el acceso')
    }
    return p
  })
}

test('la póliza concedida se sigue a través de la fusión', () => {
  assert.deepEqual(
    fallosFusion(crudo(LECTURA)),
    [],
    'Hay 5 pólizas fusionadas hoy: no es teórico. Una autorización que apunta a una fila ' +
      'fusionada deja de abrir nada SIN QUE NADIE SE ENTERE —no falla, deja de funcionar—, ' +
      'así que la lectura salta por `merged_into_poliza_id`.',
  )
})

test('la fusión se sigue — el cepo muerde', () => {
  const src = crudo(LECTURA)
  const sinSalto = mutar(src, 'trasFusion.set(f.id, f.mergedIntoPolizaId ?? f.id)', 'trasFusion.set(f.id, f.id)')
  assert.notDeepEqual(fallosFusion(sinSalto), [], 'sin el salto de fusión el cepo tiene que disparar')
  const sinColumna = mutar(src, 'select: { id: true, mergedIntoPolizaId: true },', 'select: { id: true },')
  assert.notDeepEqual(fallosFusion(sinColumna), [], 'sin pedir la columna de fusión el cepo tiene que disparar')
})

// ─── 5. `polizaId` va en el WHERE de las «previas» ───────────────────────────

function fallosPreviasConceder(src: string): string[] {
  return fallos(() => {
    const consulta = bloqueTras(norm(src), /const previas = await prisma\.portalAutorizacion\.findMany\(/)
    return /\bpolizaId\b/.test(consulta)
      ? []
      : ['`conceder()` busca las autorizaciones vivas previas SIN filtrar por `polizaId`: la clave del índice único es (otorgante, autorizado, COALESCE(póliza), alcance), así que conceder la del coche encontraría la de la casa como «ya concedida» — o peor, se enlazaría con una que no es']
  })
}

function fallosPreviasPeticion(src: string): string[] {
  return fallos(() => {
    const p: string[] = []
    const consulta = bloqueTras(norm(src), /const previas = await tx\.portalAutorizacion\.findMany\(/)
    if (!/polizaId:\s*null/.test(consulta)) {
      p.push('conceder una PETICIÓN busca las previas sin fijar `polizaId: null`: una autorización sobre UNA póliza contaría como «ya la tiene» y se daría por concedido un acceso que abre otra cosa')
    }
    if (!/autorizadoIdentidadId/.test(consulta) || !/autorizadoClienteId/.test(consulta)) {
      p.push('conceder una PETICIÓN busca las previas sin fijar la RAMA (ficha o identidad): con `autorizadoClienteId: null` traería las de cualquier invitado de esa ficha y enlazaría la petición con la autorización de otro')
    }
    return p
  })
}

test('conceder filtra las autorizaciones previas por la PÓLIZA', () => {
  assert.deepEqual(fallosPreviasConceder(crudo(AUTORIZACIONES)), [])
})

test('conceder una petición filtra las previas por la póliza Y por la rama', () => {
  assert.deepEqual(fallosPreviasPeticion(crudo(PETICIONES)), [])
})

test('el filtro por póliza de las «previas» — el cepo muerde', () => {
  const sinPoliza = mutar(
    crudo(AUTORIZACIONES),
    'where: { otorganteClienteId, autorizadoClienteId, alcance, polizaId, revocadoEn: null },',
    'where: { otorganteClienteId, autorizadoClienteId, alcance, revocadoEn: null },',
  )
  assert.notDeepEqual(fallosPreviasConceder(sinPoliza), [], 'sin `polizaId` en el WHERE de conceder() el cepo tiene que disparar')

  const peticionSinPoliza = mutar(crudo(PETICIONES), '          polizaId: null,\n          revocadoEn: null,', '          revocadoEn: null,')
  assert.notDeepEqual(fallosPreviasPeticion(peticionSinPoliza), [], 'sin `polizaId: null` en las previas de la petición el cepo tiene que disparar')

  const peticionSinRama = mutar(crudo(PETICIONES), '          autorizadoClienteId,\n          autorizadoIdentidadId,\n          alcance,', '          alcance,')
  assert.notDeepEqual(fallosPreviasPeticion(peticionSinRama), [], 'sin la rama en las previas de la petición el cepo tiene que disparar')
})

// ─── 6. Exactamente UNO de los dos destinatarios ─────────────────────────────

function fallosDestinatarioUnico(peticiones: string, autorizaciones: string, schema: string): string[] {
  return fallos(() => {
    const p: string[] = []
    const nP = norm(peticiones)

    // La derivación EXCLUYENTE: su ficha si la tiene, y si no su identidad.
    if (!/const autorizadoIdentidadId = autorizadoClienteId === null \? [\w.]+ : null/.test(nP)) {
      p.push('la petición ya no deriva `autorizadoIdentidadId` como EXCLUYENTE de `autorizadoClienteId`: rellenar los dos —o ninguno— lo rechaza la BD (CHECK `portal_autorizacion_destinatario_unico`), y el usuario ve un 23514 que no significa nada para él')
    }
    const alta = bloqueTras(nP, /const nueva = await tx\.portalAutorizacion\.create\(/)
    for (const campo of ['autorizadoClienteId', 'autorizadoIdentidadId']) {
      if (!new RegExp(`${campo}\\s*[,:]`).test(alta)) {
        p.push(`el alta de la autorización desde una petición no escribe \`${campo}\`: la rama que falte queda a NULL siempre y una de las dos vías deja de existir`)
      }
    }

    // La otra dirección: `conceder()` es la vía de FICHA. Rellenar ahí la
    // identidad dejaría las dos columnas puestas y la BD lo rechaza.
    const nA = norm(autorizaciones)
    const datos = bloqueTras(nA, /const datosNueva = /)
    if (!/autorizadoClienteId\s*[,:]/.test(datos)) {
      p.push('`conceder()` no escribe `autorizadoClienteId`: es la vía de FICHA y sin ese valor no queda ningún destinatario')
    }
    if (/autorizadoIdentidadId\s*:(?!\s*null)/.test(datos) || /autorizadoIdentidadId\s*,/.test(datos)) {
      p.push('`conceder()` rellena TAMBIÉN `autorizadoIdentidadId`: con los dos puestos el INSERT muere en el CHECK `portal_autorizacion_destinatario_unico`')
    }

    // Y el schema: si `autorizadoClienteId` vuelve a ser obligatorio, se cierra
    // el techo entero de un plumazo y sin tocar una línea de lógica.
    const modelo = /^model PortalAutorizacion \{([\s\S]*?)^\}/m.exec(schema)
    if (!modelo) {
      p.push('el schema del portal ya no declara `PortalAutorizacion`')
      return p
    }
    for (const campo of ['autorizadoClienteId', 'autorizadoIdentidadId', 'polizaId']) {
      if (!new RegExp(`\\n\\s*${campo}\\s+String\\?`).test(modelo[1])) {
        p.push(`\`${campo}\` ya no es NULLABLE en el schema: si vuelve a ser obligatorio, o solo se puede autorizar a quien ya es cliente, o no se puede conceder la ficha entera`)
      }
    }
    return p
  })
}

test('exactamente uno de los dos destinatarios: ficha O identidad', () => {
  assert.deepEqual(
    fallosDestinatarioUnico(crudo(PETICIONES), crudo(AUTORIZACIONES), crudo(SCHEMA)),
    [],
    'La BD exige `num_nonnulls(autorizado_cliente_id, autorizado_identidad_id) = 1`: los dos a la ' +
      'vez, o ninguno, es un 23514. Y esa exclusividad la escribe el código, no la deduce nadie.',
  )
})

test('exactamente un destinatario — el cepo muerde', () => {
  const p = crudo(PETICIONES)
  const a = crudo(AUTORIZACIONES)
  const s = crudo(SCHEMA)

  const sinExclusion = mutar(
    p,
    'const autorizadoIdentidadId = autorizadoClienteId === null ? fila.solicitanteIdentidadId : null',
    'const autorizadoIdentidadId = fila.solicitanteIdentidadId',
  )
  assert.notDeepEqual(fallosDestinatarioUnico(sinExclusion, a, s), [], 'rellenar siempre la identidad tiene que disparar el cepo')

  const concederConIdentidad = mutar(a, '    autorizadoClienteId,\n    alcance,', '    autorizadoClienteId,\n    autorizadoIdentidadId,\n    alcance,')
  assert.notDeepEqual(fallosDestinatarioUnico(p, concederConIdentidad, s), [], 'poner las dos columnas en conceder() tiene que disparar el cepo')

  const schemaNotNull = mutar(s, 'autorizadoClienteId    String?   @map("autorizado_cliente_id")', 'autorizadoClienteId    String    @map("autorizado_cliente_id")')
  assert.notDeepEqual(fallosDestinatarioUnico(p, a, schemaNotNull), [], 'volver `autorizadoClienteId` obligatorio tiene que disparar el cepo')
})

// ─── 7. CEPO POSITIVO: la pantalla dice que «todas» incluye las FUTURAS ──────

/**
 * Las formas razonables de decirlo. Es una familia, no una frase exacta: lo que
 * se exige es que alguien lo DIGA, no cómo lo redacte.
 */
const DICE_FUTURAS: RegExp[] = [
  /(pólizas?|polizas?|seguros?)[^.<>{}]{0,90}futur/i,
  /futur[^.<>{}]{0,90}(pólizas?|polizas?|seguros?)/i,
  /que (contrate|contrates|contrat[eé]|firmes|tengas)[^.<>{}]{0,70}(mañana|manana|más adelante|mas adelante|en el futuro|a partir de|adelante)/i,
  /(mañana|manana|más adelante|mas adelante|en el futuro)[^.<>{}]{0,90}(pólizas?|polizas?|seguros?|contrat)/i,
  /(incluidas|incluidos|incluye|también|tambien)[^.<>{}]{0,70}(las|los) que (contrate|contrates)/i,
]

/** Ficheros de la autorización, incluidos los SIN commitear: el nuevo es justo el que hay que mirar. */
function ficherosDeAutorizacion(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts') && /autorizaci/i.test(f))
}

test('alguien le dice al que concede que «todas» incluye las pólizas FUTURAS', () => {
  // Los cepos de arriba son estructurales: comprueban que el código sigue
  // escrito. Ninguno impide lo peor de esta pantalla, que es que funcione
  // perfectamente y conceda EN SILENCIO la cartera entera para siempre —
  // `poliza_id NULL` cubre también la que se contrate mañana. Eso no lo puede
  // decir la BD (lo dice su propio COMMENT: «la pantalla tiene que decirlo con
  // esas palabras al conceder») y no lo puede deducir el usuario.
  const vistos = ficherosDeAutorizacion()
  assert.notDeepEqual(vistos, [], 'no hay ni un fichero de autorizaciones que mirar: el barrido está roto')

  const loDicen = vistos.filter((f) => {
    const src = sinComentarios(crudo(f))
    return DICE_FUTURAS.some((r) => r.test(src))
  })
  assert.notDeepEqual(
    loDicen,
    [],
    'Ningún fichero de la autorización (ni la pantalla ni el texto que se guarda como prueba) ' +
      'dice que conceder «todas mis pólizas» incluye las que se contraten MÁS ADELANTE. Para un ' +
      'empleado suele ser lo que se quiere; para un familiar puede que no — y quien firma tiene ' +
      `derecho a saber qué firma (art. 7.1 RGPD). Ficheros mirados: ${vistos.join(', ')}`,
  )
})

// ─── 8. Lo que sostiene todo esto abajo: la BD ───────────────────────────────

test('el SQL aplicado sigue declarando el CHECK y la FK COMPUESTA', () => {
  // Estos dos ficheros son el acta de lo que hay en la Supabase compartida. El
  // código de arriba se apoya en ellos: sin el CHECK, «exactamente uno» pasa a
  // ser una costumbre; sin la clave COMPUESTA, un `poliza_id` manipulado cuela
  // la póliza de un tercero y la fila queda perfectamente válida.
  assert.match(
    crudo(SQL_IDENTIDAD),
    /ADD CONSTRAINT portal_autorizacion_destinatario_unico\s+CHECK \(num_nonnulls\(autorizado_cliente_id, autorizado_identidad_id\) = 1\)/,
    'el CHECK `portal_autorizacion_destinatario_unico` es lo único que impide una autorización con dos destinatarios o con ninguno',
  )
  assert.match(
    crudo(SQL_POLIZA),
    /FOREIGN KEY \(otorgante_cliente_id, poliza_id\)\s+REFERENCES seguros\.polizas \(cliente_id, id\)/,
    'la FK COMPUESTA es lo que exige que la póliza concedida sea DEL OTORGANTE: una FK normal a `polizas(id)` dejaría conceder la de cualquiera',
  )
})

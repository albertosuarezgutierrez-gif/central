// Cepos de la corrección a mano de una póliza en el portal del cliente.
//
// Dos cosas se vigilan aquí, y ninguna es «que compile»:
//  1. Que el parche distinga «no lo toques» (clave ausente) de «bórralo» (null),
//     y que no deje entrar una fecha imposible — sobre `fechaVencimiento` se manda
//     un aviso de renovación al cliente, así que una fecha inventada es una mentira
//     firmada por la correduría.
//  2. Que la escritura filtre por `identidadId`. En este portal el aislamiento NO
//     lo da RLS: lo da el código. Un `update({ where: { id } })` a secas deja
//     editar la póliza de otro conociendo el uuid, y no falla nunca.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Se importa el FUENTE por ruta, no por el alias `@/`: la raíz del monorepo no
// resuelve los paths de la app y `node --test` no sabría de dónde sacarlo.
import { normalizarParche, parsearFechaISO } from '../apps/asegura-portal/lib/poliza-editable.ts'
// El catálogo de campos por ramo. Se lee EN CALIENTE, nunca se copian aquí sus
// campos: lo llena y lo amplía otra gente, y un test que fijara «hogar tiene
// metrosCuadrados» se rompería con cada campo nuevo sin proteger nada.
import { camposDeRamo } from '../packages/module-seguros-portal/src/campos-ramo.ts'
import { RAMOS_POLIZA } from '../packages/module-seguros-portal/src/poliza-leida.ts'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const HOY = new Date(Date.UTC(2026, 8, 3))

const ok = (r: ReturnType<typeof normalizarParche>) => {
  assert.equal(r.ok, true, `esperaba ok, salió ${JSON.stringify(r)}`)
  return (r as { ok: true; parche: Record<string, unknown> }).parche
}
const fallo = (r: ReturnType<typeof normalizarParche>) => {
  assert.equal(r.ok, false, `esperaba error, salió ${JSON.stringify(r)}`)
  return (r as { ok: false; error: string }).error
}

// ── 1. Vacío es un BORRADO, no una cadena ────────────────────────────────────

test('cadena vacia y solo espacios se guardan como null, no como ""', () => {
  // Un `compania: ''` es un «no lo sé» disfrazado de valor: se cuela por todas
  // las guardas basadas en NULL y luego la ficha enseña una compañía sin nombre.
  for (const vacio of ['', '   ', '\t\n']) {
    const p = ok(normalizarParche({ compania: vacio }, HOY))
    assert.equal(p.compania, null, `${JSON.stringify(vacio)} debe ser null`)
  }
  assert.equal(ok(normalizarParche({ numeroPoliza: '  ' }, HOY)).numeroPoliza, null)
  assert.equal(ok(normalizarParche({ ramo: '' }, HOY)).ramo, null)
})

test('el texto util se conserva recortado', () => {
  const p = ok(normalizarParche({ compania: '  Mapfre  ', ramo: 'hogar' }, HOY))
  assert.equal(p.compania, 'Mapfre')
  assert.equal(p.ramo, 'hogar')
})

// ── 2. AUSENTE ≠ null: es toda la diferencia entre un PATCH y un reemplazo ────

test('una clave AUSENTE no se toca; la misma clave a null SI se borra', () => {
  // Sin esta distinción, una pantalla que manda solo el campo editado borraría
  // en silencio los otros cuatro.
  const ausente = ok(normalizarParche({ compania: 'Axa' }, HOY))
  assert.equal('ramo' in ausente, false, 'ramo ausente no puede aparecer en el parche')
  assert.equal('primaAnual' in ausente, false)
  assert.equal('fechaVencimiento' in ausente, false)

  const borrado = ok(normalizarParche({ compania: 'Axa', ramo: null }, HOY))
  assert.equal('ramo' in borrado, true, 'ramo a null SÍ tiene que viajar en el parche')
  assert.equal(borrado.ramo, null)
})

test('undefined explicito se trata como ausente, no como borrado', () => {
  const p = normalizarParche({ compania: 'Axa', ramo: undefined }, HOY)
  assert.equal('ramo' in ok(p), false)
})

test('ninguna clave desconocida se propaga', () => {
  const p = ok(normalizarParche(
    { compania: 'Axa', identidadId: 'otro', procedencia: 'compania', id: 'x', confirmadaPorUsuario: true },
    HOY,
  ))
  assert.deepEqual(Object.keys(p), ['compania'])
})

test('un cuerpo sin ninguna clave conocida es un error, no un parche vacio', () => {
  assert.equal(fallo(normalizarParche({}, HOY)), 'parche_vacio')
  assert.equal(fallo(normalizarParche({ loQueSea: 1 }, HOY)), 'parche_vacio')
})

test('un cuerpo que no es objeto se rechaza', () => {
  for (const basura of [null, 'texto', 42, [1, 2], true]) {
    assert.equal(fallo(normalizarParche(basura, HOY)), 'cuerpo_invalido')
  }
})

// ── 3. Fechas: la imposible es peor que la ausente ───────────────────────────

test('2026-02-31 se rechaza: JS la desbordaria a marzo sin avisar', () => {
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '2026-02-31' }, HOY)), 'fecha_inexistente')
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '2026-13-01' }, HOY)), 'fecha_inexistente')
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '2025-02-29' }, HOY)), 'fecha_inexistente')
  // Y el año bisiesto de verdad SÍ pasa.
  assert.ok(normalizarParche({ fechaVencimiento: '2024-02-29' }, HOY).ok)
})

test('una fecha de 1970 y una de 2200 se rechazan', () => {
  // Un aviso de renovación sobre un vencimiento de 1970 o de 2200 es una mentira
  // que el cliente sí lee.
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '1970-01-01' }, HOY)), 'fecha_fuera_de_rango')
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '1989-12-31' }, HOY)), 'fecha_fuera_de_rango')
  assert.equal(fallo(normalizarParche({ fechaVencimiento: '2200-01-01' }, HOY)), 'fecha_fuera_de_rango')
  // El borde de abajo sí entra.
  assert.ok(normalizarParche({ fechaVencimiento: '1990-01-01' }, HOY).ok)
})

test('solo se acepta YYYY-MM-DD; nada de new Date(loQueSea)', () => {
  for (const mala of ['03/09/2026', '2026-9-3', '2026-09-03T10:00:00Z', 'mañana', '20260903']) {
    assert.equal(fallo(normalizarParche({ fechaVencimiento: mala }, HOY)), 'fecha_formato', String(mala))
  }
  assert.equal(fallo(normalizarParche({ fechaVencimiento: 1757000000000 }, HOY)), 'fecha_formato')
})

test('una fecha valida sale como Date a medianoche UTC', () => {
  const p = ok(normalizarParche({ fechaVencimiento: '2027-01-15' }, HOY))
  const f = p.fechaVencimiento as Date
  assert.ok(f instanceof Date)
  assert.equal(f.toISOString(), '2027-01-15T00:00:00.000Z')
  // Y en UTC, para que «vence el 15» no se lea «14» al formatear.
  assert.equal(f.getUTCDate(), 15)
  assert.equal(f.getUTCMonth(), 0)
  assert.equal(f.getUTCFullYear(), 2027)
})

test('fecha a null o vacia borra el vencimiento', () => {
  assert.equal(ok(normalizarParche({ fechaVencimiento: null }, HOY)).fechaVencimiento, null)
  assert.equal(ok(normalizarParche({ fechaVencimiento: '  ' }, HOY)).fechaVencimiento, null)
})

test('parsearFechaISO es coherente con el parche', () => {
  const r = parsearFechaISO('2026-06-01', HOY)
  assert.equal(r.ok, true)
  assert.equal((r as { ok: true; fecha: Date }).fecha.toISOString(), '2026-06-01T00:00:00.000Z')
  assert.equal((parsearFechaISO('2026-02-31', HOY) as { error: string }).error, 'fecha_inexistente')
})

// ── 4. Prima: número finito >= 0 ─────────────────────────────────────────────

test('prima negativa, NaN e Infinity se rechazan', () => {
  assert.equal(fallo(normalizarParche({ primaAnual: -1 }, HOY)), 'prima_negativa')
  assert.equal(fallo(normalizarParche({ primaAnual: -0.01 }, HOY)), 'prima_negativa')
  assert.equal(fallo(normalizarParche({ primaAnual: Number.NaN }, HOY)), 'prima_invalida')
  assert.equal(fallo(normalizarParche({ primaAnual: Number.POSITIVE_INFINITY }, HOY)), 'prima_invalida')
  assert.equal(fallo(normalizarParche({ primaAnual: 'doscientos' }, HOY)), 'prima_invalida')
  assert.equal(fallo(normalizarParche({ primaAnual: {} }, HOY)), 'prima_invalida')
  assert.equal(fallo(normalizarParche({ primaAnual: true }, HOY)), 'prima_invalida')
})

test('prima acepta numero, string numerica y coma decimal; cero es un dato', () => {
  assert.equal(ok(normalizarParche({ primaAnual: 412.5 }, HOY)).primaAnual, 412.5)
  assert.equal(ok(normalizarParche({ primaAnual: ' 412.50 ' }, HOY)).primaAnual, 412.5)
  assert.equal(ok(normalizarParche({ primaAnual: '412,50' }, HOY)).primaAnual, 412.5)
  // 0 € es un importe real, no un «no se sabe»: no puede colapsar a null.
  assert.equal(ok(normalizarParche({ primaAnual: 0 }, HOY)).primaAnual, 0)
})

test('prima a null o cadena vacia borra el importe', () => {
  assert.equal(ok(normalizarParche({ primaAnual: null }, HOY)).primaAnual, null)
  assert.equal(ok(normalizarParche({ primaAnual: '' }, HOY)).primaAnual, null)
})

// ── 5. Cepo del route: sin `identidadId` en el WHERE no hay portal ───────────

test('el PATCH filtra por identidadId y NUNCA usa update() a secas', () => {
  const fuente = leer('apps/asegura-portal/app/api/polizas/[id]/route.ts')

  assert.match(fuente, /export async function PATCH/, 'el route tiene que exportar PATCH')
  assert.match(fuente, /export const runtime = 'nodejs'/, 'runtime nodejs')

  // La escritura va por updateMany, que es lo único que admite un WHERE compuesto.
  assert.match(
    fuente,
    /portalPolizaDeclarada\.updateMany\(/,
    'la escritura tiene que ser updateMany, no update',
  )
  // Y el WHERE lleva identidadId: sin esto, con el uuid de otro se edita su bóveda.
  assert.match(
    fuente,
    /where:\s*\{[^}]*identidadId:\s*identidad\.id/,
    'el where de la escritura tiene que filtrar por identidadId',
  )
  // `update(`, `upsert(` y `delete(` por id a secas quedan prohibidos aquí.
  assert.equal(
    /portalPolizaDeclarada\.(update|upsert|delete)\(/.test(fuente),
    false,
    'nada de update()/upsert()/delete() a secas: eso deja editar la póliza de otro',
  )

  // La identidad sale de la cookie, no del cuerpo ni de la URL.
  assert.match(fuente, /requireIdentidad\(\)/)
  assert.equal(
    /identidadId:\s*(cuerpo|body|parche|datos)\b/.test(fuente),
    false,
    'la identidad nunca puede venir del cuerpo de la petición',
  )

  // count === 0 → 404, y no un 200 silencioso que finge haber guardado.
  assert.match(fuente, /count === 0/)
  assert.match(fuente, /no_encontrada/)
  assert.match(fuente, /status:\s*404/)
  assert.match(fuente, /sin_sesion/)
  assert.match(fuente, /status:\s*401/)

  // El parche pasa por el normalizador; nada de volcar el JSON crudo en `data`.
  assert.match(fuente, /normalizarParche\(/)
  assert.match(fuente, /confirmadaPorUsuario:\s*true/)
  assert.match(fuente, /procedencia:\s*'declarado'/)
})

// ── 6. Cepo del alta A MANO: misma validación, fila confirmada, identidad de la cookie ──

test('el POST a mano pasa por normalizarAlta y nace confirmada, sin documento ni extraccion', () => {
  const fuente = leer('apps/asegura-portal/app/api/polizas/route.ts')

  // La rama JSON existe y valida con el MISMO módulo que el PATCH. Sin esto,
  // una prima negativa o un 2026-02-31 se rechazarían al corregir y entrarían
  // al crear.
  assert.match(fuente, /application\/json/)
  assert.match(fuente, /normalizarAlta\(/)
  assert.match(fuente, /sin_identificacion|normalizado\.error/)

  // La identidad sale de la cookie, no del cuerpo.
  assert.match(fuente, /requireIdentidad\(\)/)
  assert.equal(
    /identidadId:\s*(cuerpo|body|datos|form)\b/.test(fuente),
    false,
    'la identidad nunca puede venir del cuerpo de la petición',
  )

  // La fila a mano: confirmada (la ha escrito una persona), declarada, y con
  // los dos huecos del documento a null, no a un nombre de cajón.
  assert.match(fuente, /confirmadaPorUsuario:\s*true/, 'el alta a mano nace confirmada por el usuario')
  assert.match(fuente, /confirmadaPorUsuario:\s*false/, 'el alta con documento sigue naciendo SIN confirmar')
  assert.match(fuente, /documentoNombre:\s*null/)
  // `Prisma.DbNull` (NULL de SQL), no `null` (que Prisma rechaza) ni `JsonNull`
  // (un `null` DENTRO del JSON, que se cuela por `IS NULL`).
  assert.match(fuente, /extraccionBruta:\s*Prisma\.DbNull/)
  // Solo se cuentan las líneas de código (con su coma), no la mención del comentario de cabecera.
  assert.equal((fuente.match(/procedencia:\s*'declarado',/g) ?? []).length, 2, 'las dos ramas guardan `declarado`')
})

test('normalizarAlta hereda las reglas del parche y exige compañia o numero', async () => {
  const { normalizarAlta } = await import('../apps/asegura-portal/lib/poliza-editable.ts')
  assert.deepEqual(normalizarAlta({}, HOY), { ok: false, error: 'sin_identificacion' })
  assert.deepEqual(normalizarAlta({ ramo: 'auto' }, HOY), { ok: false, error: 'sin_identificacion' })
  assert.deepEqual(normalizarAlta({ compania: 'Axa', primaAnual: -1 }, HOY), { ok: false, error: 'prima_negativa' })
  assert.deepEqual(normalizarAlta({ numeroPoliza: '1', fechaVencimiento: '2026-02-31' }, HOY), {
    ok: false,
    error: 'fecha_inexistente',
  })
  const r = normalizarAlta({ compania: 'Axa' }, HOY)
  assert.equal(r.ok, true)
  assert.deepEqual((r as { ok: true; datos: unknown }).datos, {
    compania: 'Axa',
    numeroPoliza: null,
    ramo: null,
    primaAnual: null,
    fechaVencimiento: null,
    matricula: null,
    bastidor: null,
    fechaMatriculacion: null,
    referenciaCatastral: null,
    datosRamo: null,
    datosRamoOrigen: null,
  })
})

// El `deepEqual` de arriba es el cepo: obliga a que ampliar el alta se decida
// aquí y no se cuele. Este test dice qué se decidió y por qué, para que el
// siguiente que añada un campo tenga que responder a la misma pregunta.
test('los tres campos del vehiculo entran en el alta, y NINGUNO es obligatorio', async () => {
  const { normalizarAlta } = await import('../apps/asegura-portal/lib/poliza-editable.ts')

  // La matrícula entra en el alta porque es de donde sale la fecha de
  // matriculación estimada. Si solo se pudiera declarar corrigiendo después,
  // el autorrelleno no tendría de dónde salir el día que se da de alta.
  const r = normalizarAlta({ compania: 'Axa', matricula: '1234 bcd' }, HOY)
  assert.equal(r.ok, true)
  assert.equal((r as { ok: true; datos: { matricula: string | null } }).datos.matricula, '1234BCD')

  // Y la guarda sigue siendo SOLO la identificación: un vehículo entero sin
  // compañía ni número no identifica una póliza, y un alta con compañía y sin
  // vehículo es perfectamente válida. Pedirle el bastidor a alguien para
  // dejarle apuntar su seguro es trasladarle el trabajo de la correduría.
  assert.deepEqual(normalizarAlta({ matricula: '1234BCD', bastidor: 'VF1RFB00X66123456' }, HOY), {
    ok: false,
    error: 'sin_identificacion',
  })
  assert.equal(normalizarAlta({ compania: 'Axa' }, HOY).ok, true)
})


// ── 7. `datosRamo`: entra en el alta, no es obligatorio, y sin ramo no existe ──

/**
 * Un ramo del catálogo que tenga algún campo de TEXTO, elegido en caliente. El
 * catálogo se está llenando en paralelo: si hoy está vacío, este helper devuelve
 * `null` y el test comprueba lo que sí puede comprobar (que la columna queda a
 * `null`), en vez de fijar unos campos que mañana son otros.
 */
function campoTextoDelCatalogo(): { ramo: string; id: string } | null {
  for (const ramo of RAMOS_POLIZA) {
    const campo = camposDeRamo(ramo).find((c) => c.tipo === 'texto')
    if (campo) return { ramo, id: campo.id }
  }
  return null
}

test('datosRamo entra en el alta y NO es obligatorio', async () => {
  const { normalizarAlta } = await import('../apps/asegura-portal/lib/poliza-editable.ts')

  // No es obligatorio, igual que ningún otro campo del alta: la única guarda
  // sigue siendo que la póliza quede IDENTIFICADA. Pedirle al cliente los
  // metros de su casa para dejarle apuntar su seguro es trasladarle el trabajo
  // de la correduría, y el formulario que no se rellena no guarda nada.
  const sin = normalizarAlta({ compania: 'Axa' }, HOY)
  assert.equal(sin.ok, true)
  const datosSin = (sin as { ok: true; datos: Record<string, unknown> }).datos
  assert.equal('datosRamo' in datosSin, true, 'la clave EXISTE en el alta, aunque valga null')
  // `null` es la columna vacía. Nunca `{}`: un objeto que existe y no dice nada
  // es otro «no lo sé» disfrazado de dato, y pasa por `IS NULL` y `??`.
  assert.equal(datosSin.datosRamo, null)

  const elegido = campoTextoDelCatalogo()
  if (elegido) {
    const r = normalizarAlta(
      { compania: 'Axa', ramo: elegido.ramo, datosRamo: { [elegido.id]: '  Un valor  ' } },
      HOY,
    )
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.deepEqual((r as { ok: true; datos: { datosRamo: unknown } }).datos.datosRamo, {
      [elegido.id]: 'Un valor',
    })

    // Una clave que NO es del catálogo de ese ramo se descarta en silencio: si
    // se guardara, quedaría enterrada en el JSON sin pantalla que la enseñe.
    const conIntrusa = normalizarAlta(
      { compania: 'Axa', ramo: elegido.ramo, datosRamo: { [elegido.id]: 'X', noEstaEnElCatalogo: 'y' } },
      HOY,
    )
    assert.deepEqual((conIntrusa as { ok: true; datos: { datosRamo: unknown } }).datos.datosRamo, {
      [elegido.id]: 'X',
    })

    // Y un valor de cajón NO se escribe: la clave desaparece, y si no queda
    // ninguna la columna es NULL, no `{}`.
    const cajon = normalizarAlta(
      { compania: 'Axa', ramo: elegido.ramo, datosRamo: { [elegido.id]: 'no consta' } },
      HOY,
    )
    assert.equal((cajon as { ok: true; datos: { datosRamo: unknown } }).datos.datosRamo, null)
  }

  // Sin ramo NO hay catálogo contra el que validar: es un ERROR, no un guardado
  // a medias ni un `null` callado. Guardarlos a ciegas sería escribir claves que
  // ninguna pantalla enseña; anularlos en silencio, decirle al cliente que ha
  // guardado algo que no está.
  assert.deepEqual(normalizarAlta({ compania: 'Axa', datosRamo: { loQueSea: 'x' } }, HOY), {
    ok: false,
    error: 'datos_ramo_sin_ramo',
  })
})

test('las dos ramas del alta escriben datosRamo, y el PATCH distingue ausente de borrado', () => {
  const alta = leer('apps/asegura-portal/app/api/polizas/route.ts')
  const patch = leer('apps/asegura-portal/app/api/polizas/[id]/route.ts')

  // Alta con documento y alta a mano: las dos escriben la columna. Si una no lo
  // hiciera, el campo se leería del PDF y no llegaría nunca a la BD, sin error.
  assert.match(alta, /datosRamo: datos\.datosRamo \?\? Prisma\.DbNull/, 'el alta con documento escribe datosRamo')
  assert.match(alta, /datosRamo: datosRamo \?\? Prisma\.DbNull/, 'el alta a mano escribe datosRamo')

  // `DbNull` (NULL de SQL) y NUNCA `JsonNull`, que guardaría el literal `null`
  // DENTRO del JSON y se colaría por todas las guardas de NULL.
  for (const [nombre, fuente] of [['alta', alta], ['patch', patch]] as const) {
    assert.equal(/Prisma\.JsonNull/.test(fuente), false, `${nombre}: JsonNull escribe un null dentro del JSON`)
  }

  // El PATCH: la clave AUSENTE no puede viajar en el `data`. Convertirla en
  // `DbNull` haría que corregir la compañía borrase los campos del ramo sin que
  // nada fallara — el modo de fallo silencioso que persigue este fichero.
  assert.match(patch, /'datosRamo' in normalizado\.parche/, 'ausente ≠ borrado en el PATCH')
  assert.match(patch, /datosRamo \?\? Prisma\.DbNull/)
  // Y el ramo con el que se valida sale de la BD, no del cuerpo: se lee con el
  // mismo filtro por identidadId que todo lo demás.
  assert.match(patch, /ramoGuardado: actual\.ramo/)
  assert.match(patch, /findFirst\(\{\s*where: \{ id, identidadId: identidad\.id \}/)
})

// ── 8. La referencia catastral es COLUMNA, y solo la del INMUEBLE ────────────
//
// El 04/09/2026 se había decidido meterla dentro de `datos_ramo`. Se corrigió
// antes de que hubiera una sola fila escrita: identifica el BIEN igual que la
// matrícula, y «¿tengo otra póliza de esta misma vivienda?» es una CONSULTA. Lo
// que la hace columna de verdad no es el `ADD COLUMN`: es el ÍNDICE. Sin él,
// mover el dato del JSON a una columna no cambia nada de lo que motivó moverlo.

test('la referencia catastral es una COLUMNA indexada, no una clave del jsonb', () => {
  const sql = leer('apps/asegura-portal/prisma/sql/2026-09-04_portal_referencia_catastral.sql')
  const schema = leer('apps/asegura-portal/prisma/schema.prisma')

  assert.match(sql, /ADD COLUMN IF NOT EXISTS referencia_catastral\s+text/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS datos_ramo_origen\s+jsonb/)
  // El índice es lo que justifica que sea columna. Parcial: casi ninguna fila
  // es de inmueble.
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS idx_portal_poliza_referencia_catastral[\s\S]*WHERE referencia_catastral IS NOT NULL/,
    'sin índice, sacarla del jsonb no sirve de nada',
  )
  // 20 y solo 20: el CHECK es la red de abajo para que ningún script meta la
  // referencia de la FINCA (14), que son los metros del edificio.
  assert.match(sql, /\^\[A-Z0-9\]\{20\}\$/)
  assert.match(sql, /NOT VALID/)
  // Las dos columnas se explican en la propia BD.
  assert.match(sql, /COMMENT ON COLUMN seguros\.portal_poliza_declarada\.referencia_catastral/)
  assert.match(sql, /COMMENT ON COLUMN seguros\.portal_poliza_declarada\.datos_ramo_origen/)

  // Y el schema de Prisma las declara mapeadas a esas columnas: sin esto, el
  // dato se validaría y no llegaría nunca a la BD.
  assert.match(schema, /referenciaCatastral\s+String\?\s+@map\("referencia_catastral"\)/)
  assert.match(schema, /datosRamoOrigen\s+Json\?\s+@map\("datos_ramo_origen"\)/)
})

test('una referencia de FINCA no se guarda, y su error se distingue del de basura', async () => {
  const { normalizarParche: np } = await import('../apps/asegura-portal/lib/poliza-editable.ts')

  // 14 caracteres es el EDIFICIO. Guardarla como si fuera el piso trae los
  // metros del bloque entero a una póliza de hogar: plausible y equivocado.
  assert.deepEqual(np({ referenciaCatastral: '9872023VH5797S' }, HOY), {
    ok: false,
    error: 'referencia_catastral_de_finca',
  })
  assert.deepEqual(np({ referenciaCatastral: 'no consta en la poliza' }, HOY), {
    ok: false,
    error: 'referencia_catastral_invalida',
  })
  // La del inmueble sí, compactada y en mayúsculas.
  assert.equal(
    ok(np({ referenciaCatastral: '9872023vh5797s0001wx' }, HOY)).referenciaCatastral,
    '9872023VH5797S0001WX',
  )
})

// ── 9. El ORIGEN de cada campo: sin él, «76 m²» del Catastro y «76 m²» a ojo
//      son el mismo dato ───────────────────────────────────────────────────────

test('las tres escrituras hacen viajar la referencia y el origen', () => {
  const alta = leer('apps/asegura-portal/app/api/polizas/route.ts')
  const patch = leer('apps/asegura-portal/app/api/polizas/[id]/route.ts')

  // Alta con documento: la referencia leída del PDF y los orígenes derivados.
  assert.match(alta, /referenciaCatastral: datos\.referenciaCatastral/, 'el alta con documento escribe la referencia')
  assert.match(alta, /datosRamoOrigen: datos\.datosRamoOrigen \?\? Prisma\.DbNull/)
  // Alta a mano: la referencia viaja en el resto (es `text`), el origen no puede
  // (Prisma no admite `null` en una columna `Json?`).
  assert.match(alta, /const \{ datosRamo, datosRamoOrigen, \.\.\.resto \} = datos/)
  assert.match(alta, /datosRamoOrigen: datosRamoOrigen \?\? Prisma\.DbNull/)
  // `DbNull` y NUNCA `JsonNull`, en las dos rutas, también para esta columna.
  for (const [nombre, fuente] of [['alta', alta], ['patch', patch]] as const) {
    assert.equal(/Prisma\.JsonNull/.test(fuente), false, `${nombre}: JsonNull escribe un null dentro del JSON`)
  }
  // PATCH: ausente ≠ borrado, igual que con `datosRamo`. Si la clave viajara
  // siempre, corregir la compañía borraría los orígenes sin que nada fallara.
  assert.match(patch, /'datosRamoOrigen' in normalizado\.parche/)
  assert.match(patch, /datosRamoOrigen \?\? Prisma\.DbNull/)
})

test('el origen viaja SIEMPRE con sus datos: ni huerfano ni caducado', async () => {
  const { normalizarParche: np } = await import('../apps/asegura-portal/lib/poliza-editable.ts')

  // Un origen sin datos en el mismo parche no se puede comprobar contra nada:
  // es un error, no un guardado a medias.
  assert.deepEqual(np({ compania: 'Axa', datosRamoOrigen: { metrosCuadrados: 'catastro' } }, HOY, { ramoGuardado: 'hogar' }), {
    ok: false,
    error: 'origen_sin_datos',
  })

  // Y cuando los datos CAMBIAN sin traer orígenes, los viejos no se quedan:
  // hablaban de los valores anteriores. Se prefiere no afirmar nada a afirmar
  // algo caducado — que es lo que pinta un sello de «lo dice el Catastro» sobre
  // un número que ya no es el que dijo el Catastro.
  const campo = camposDeRamo('hogar').find((c) => c.tipo === 'numero' || c.tipo === 'texto')
  if (campo) {
    const p = ok(np({ datosRamo: { [campo.id]: campo.tipo === 'numero' ? 90 : 'X' } }, HOY, { ramoGuardado: 'hogar' }))
    assert.equal('datosRamoOrigen' in p, true, 'el cambio de datos tiene que arrastrar el origen')
    assert.equal(p.datosRamoOrigen, null)
  }

  // Pero un parche que no toca los datos no toca los orígenes.
  const q = ok(np({ primaAnual: 300 }, HOY, { ramoGuardado: 'hogar' }))
  assert.equal('datosRamoOrigen' in q, false)
})

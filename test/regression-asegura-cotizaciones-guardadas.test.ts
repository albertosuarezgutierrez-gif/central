// Guardián de las COTIZACIONES GUARDADAS de `apps/asegura`. `node --test`
// (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Cada `POST /insurances` de Codeoscopic cuesta 0,50€ reales. Hasta ahora se
// apuntaba lo que se GASTA (`seguros.codeoscopic_consumo`) pero no lo que se
// RECIBE: los precios vivían en la pestaña del navegador, así que recargar era
// tirar el dinero. `lib/codeoscopic/cotizaciones.ts` guarda la cotización
// entera (cabecera + precios) y `cotizar.ts` la engancha al embudo.
//
// Los cuatro modos de fallo que este cepo persigue son todos silenciosos:
//
//   1. Que se pierda la marca de SIMULADO o el enlace con el libro. La tabla
//      sostiene el invariante `simulado = (intento_id is null)`: es lo que
//      permite responder «¿esto costó dinero?» con una columna en vez de con
//      una suposición. Si se propaga mal, precios inventados entran en la
//      horquilla como si los hubiera dado una compañía.
//   2. Que un fallo al GUARDAR tumbe la cotización. El cliente ya ha pagado los
//      0,50€ y ya tiene su precio: perderlo por un error de BD es cobrárselo
//      dos veces. Pero lo contrario —tragarse el fallo y decir que se guardó—
//      es la mentira barata: el resultado tiene que poder decir que NO hay copia.
//   3. Que el guardado se cuele ANTES de cerrar el consumo. Si tumbara el
//      cierre, un cargo real de 0,50€ se quedaría sin apuntar en el libro y el
//      tope contaría de menos justo cuando más falta hace.
//   4. Que un campo que no viene en la petición se persista como `0`. Un cero
//      en `metros_cuadrados` no es «no lo sé»: es un piso de cero metros, y la
//      horquilla lo promediaría.
//
// ─── Sin BD: se dobla la transacción ─────────────────────────────────────────
// `guardarCotizacion` acepta el ejecutor de transacción por parámetro, así que
// aquí se le pasa un doble que apunta el SQL y los valores en vez de escribir.
// El `registerHooks` de abajo solo existe porque `lib/tenant.ts` importa
// `./db` sin extensión y el resolutor de ESM de Node no adivina el `.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith('.') && !/\.[a-z]+$/.test(especificador) && contexto.parentURL) {
      const url = new URL(`${especificador}.ts`, contexto.parentURL)
      if (existsSync(fileURLToPath(url))) return siguiente(`${especificador}.ts`, contexto)
    }
    return siguiente(especificador, contexto)
  },
})

const ROOT = join(import.meta.dirname, '..')
const COTIZAR_TS = 'apps/asegura/lib/codeoscopic/cotizar.ts'
const COTIZACIONES_TS = 'apps/asegura/lib/codeoscopic/cotizaciones.ts'
const FUENTE = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const {
  guardarCotizacion,
  guardarSinTumbar,
  riesgoDePeticion,
  reparoDeEntrada,
} = await import('../apps/asegura/lib/codeoscopic/cotizaciones.ts')
type Cotizaciones = typeof import('../apps/asegura/lib/codeoscopic/cotizaciones.ts')
type EntradaCotizacion = Parameters<Cotizaciones['guardarCotizacion']>[0]
type EnTransaccion = Parameters<Cotizaciones['guardarCotizacion']>[1] & object

const { cotizar } = await import('../apps/asegura/lib/codeoscopic/cotizar.ts')
const { ENV_SIMULACION } = await import('../apps/asegura/lib/codeoscopic/config.ts')

// ─── El doble de la BD ───────────────────────────────────────────────────────

type Escritura = { sql: string; valores: unknown[] }

/**
 * Recompone la fila: nombres de columna del `insert` ↔ valores enlazados.
 *
 * Se leen del propio SQL en vez de fijarlos aquí, para que reordenar las
 * columnas no rompa el test — y para que quitar una columna sí lo rompa.
 */
function fila(e: Escritura): Record<string, unknown> {
  const m = /insert\s+into\s+seguros\.\w+\s*\(([\s\S]*?)\)\s*values/i.exec(e.sql)
  assert.ok(m, `no se reconoce el insert:\n${e.sql}`)
  const columnas = m[1]
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  assert.equal(
    columnas.length,
    e.valores.length,
    `el insert declara ${columnas.length} columnas pero enlaza ${e.valores.length} valores`,
  )
  return Object.fromEntries(columnas.map((c, i) => [c, e.valores[i]]))
}

type Libreta = {
  enTransaccion: EnTransaccion
  escrituras: Escritura[]
  transacciones: number
  cabecera(): Record<string, unknown>
  precios(): Record<string, unknown>[]
}

/** Doble de la transacción. `fallarEn` hace reventar la enésima escritura. */
function libreta(opciones: { fallarEn?: number } = {}): Libreta {
  const escrituras: Escritura[] = []
  const estado = { transacciones: 0 }

  const anotar = (strings: TemplateStringsArray, valores: unknown[]) => {
    const sql = strings.join('?')
    escrituras.push({ sql, valores })
    if (opciones.fallarEn === escrituras.length) {
      throw new Error('boom: la BD se cayó a mitad de la cotización')
    }
    return sql
  }

  const tx = {
    async $queryRaw<T = unknown>(strings: TemplateStringsArray, ...valores: unknown[]): Promise<T> {
      anotar(strings, valores)
      return [{ id: 'cot-1' }] as T
    },
    async $executeRaw(strings: TemplateStringsArray, ...valores: unknown[]): Promise<number> {
      anotar(strings, valores)
      return 1
    },
  }

  const enTransaccion = (async (fn: (t: typeof tx) => Promise<unknown>) => {
    estado.transacciones++
    return fn(tx)
  }) as unknown as EnTransaccion

  return {
    enTransaccion,
    escrituras,
    get transacciones() {
      return estado.transacciones
    },
    cabecera: () => fila(escrituras.filter((e) => /seguros\.cotizaciones/.test(e.sql))[0]),
    precios: () =>
      escrituras.filter((e) => /seguros\.cotizacion_precios/.test(e.sql)).map(fila),
  }
}

// ─── Material de prueba ──────────────────────────────────────────────────────

/** Cuerpo de hogar con TODO el riesgo, con los nombres reales del vendor. */
const CUERPO_HOGAR = {
  insuranceLine: { id: 'Home' },
  effectiveDate: '2026-10-01',
  risk: {
    address: { postalCode: '41002', town: { id: 41091 }, roadName: 'San Vicente' },
    floorArea: 76,
    yearBuilt: 1994,
    buildingsLimit: 61000,
    contentsLimit: 12000,
    buildingType: { id: 'Flat' },
    use: { id: 'Owner' },
    occupancy: { id: 'MainResidence' },
  },
}

/** Lo que devuelve `leerCotizacion`: dos precios, uno con franquicia y otro sin. */
const COTIZACION = {
  projectId: '7601460',
  fechaEfecto: '2026-10-01',
  precios: [
    {
      id: 'Q1',
      compania: 'Fiatc',
      producto: 'Fiatc Hogar',
      modalidad: 'BASIC',
      categoria: 'Básico',
      franquiciaEur: null,
      primaEur: 224.31,
      entradaEur: null,
      meses: 12,
      formaPago: null,
      frecuenciaPago: 'Anual',
      referenciaVendor: null,
      firmeza: 'estimado' as const,
      avisos: ['Riesgo condicionado'],
      requiereReRate: true,
    },
    {
      id: 'Q2',
      compania: 'Mapfre',
      producto: 'Mapfre Hogar',
      modalidad: null,
      categoria: 'Todo Riesgo',
      franquiciaEur: 150,
      primaEur: 383.4,
      entradaEur: 95.85,
      meses: 12,
      formaPago: 'Compañía',
      frecuenciaPago: 'Anual',
      referenciaVendor: 'REF-9',
      firmeza: 'condicionado' as const,
      avisos: [],
      requiereReRate: false,
    },
  ],
  fallos: [],
}

const CONTEXTO = { ramo: 'hogar', puerta: 'corredor' as const, polizaId: 'pol-1', clienteId: 'cli-1' }

function entrada(cambios: Partial<EntradaCotizacion> = {}): EntradaCotizacion {
  return {
    correduriaId: 'cor-1',
    contexto: CONTEXTO,
    intentoId: 'int-1',
    simulado: false,
    peticion: CUERPO_HOGAR,
    cotizacion: COTIZACION,
    solicitadoPor: 'Alberto',
    ...cambios,
  }
}

// ─── 1. El invariante de la tabla: simulado = (intento_id is null) ───────────

test('una cotización REAL se guarda con simulado=false Y con su intentoId', async () => {
  const l = libreta()
  const id = await guardarCotizacion(entrada(), l.enTransaccion)
  assert.equal(id, 'cot-1')

  const c = l.cabecera()
  assert.equal(c.simulado, false, 'una cotización real no puede quedar marcada como simulada')
  assert.equal(c.intento_id, 'int-1', 'sin intentoId no se puede probar qué cargo pagó esto')
  assert.equal(c.project_id_codeoscopic, '7601460')
  assert.equal(c.correduria_id, 'cor-1', 'el aislamiento por correduría viaja en la escritura')
  assert.equal(c.ramo, 'hogar')
  assert.equal(c.puerta, 'corredor')
})

test('una cotización SIMULADA se guarda con simulado=true e intento_id NULL', async () => {
  const l = libreta()
  await guardarCotizacion(entrada({ simulado: true, intentoId: null }), l.enTransaccion)
  const c = l.cabecera()
  assert.equal(c.simulado, true)
  assert.equal(c.intento_id, null, 'una simulada no tiene línea en el libro: no hubo cargo')
})

test('el invariante se comprueba ANTES de escribir: nada a medias, y con motivo', async () => {
  for (const mala of [
    entrada({ simulado: true, intentoId: 'int-1' }), // simulada con cargo
    entrada({ simulado: false, intentoId: null }), // real sin línea en el libro
  ]) {
    const l = libreta()
    await assert.rejects(
      () => guardarCotizacion(mala, l.enTransaccion),
      /cotizacion_no_guardable/,
      'una entrada que rompe el invariante tiene que fallar aquí, no en el CHECK de la BD',
    )
    assert.equal(l.escrituras.length, 0, 'no se puede haber escrito nada')
  }
})

test('la puerta y el ramo se validan: la tabla solo admite tres puertas', () => {
  assert.equal(reparoDeEntrada(entrada()), null)
  assert.match(
    String(reparoDeEntrada(entrada({ contexto: { ramo: 'hogar', puerta: 'movil' as never } }))),
    /puerta desconocida/,
  )
  assert.match(String(reparoDeEntrada(entrada({ contexto: { ramo: '  ', puerta: 'web' } }))), /ramo/)
  assert.match(String(reparoDeEntrada(entrada({ correduriaId: '' }))), /correduría/)
})

// ─── 2. Cabecera y precios, en UNA transacción ───────────────────────────────

test('los precios se guardan con su FIRMEZA y su franquicia, en la misma transacción', async () => {
  const l = libreta()
  await guardarCotizacion(entrada(), l.enTransaccion)

  assert.equal(l.transacciones, 1, 'todo tiene que ir en UNA transacción')
  const precios = l.precios()
  assert.equal(precios.length, 2)
  assert.equal(precios[0].compania, 'Fiatc')
  assert.equal(precios[0].firmeza, 'estimado', 'sin firmeza, mañana se reenseña como cerrado')
  assert.equal(precios[0].requiere_rerate, true)
  // 🚨 NULL = el producto no declara franquicia; nunca «sin franquicia».
  assert.equal(precios[0].franquicia_eur, null)
  assert.equal(precios[1].franquicia_eur, 150)
  assert.equal(precios[1].prima_eur, 383.4)
  assert.deepEqual(JSON.parse(String(precios[0].avisos)), ['Riesgo condicionado'])
})

test('si revienta un precio, revienta la cotización entera: media es peor que ninguna', async () => {
  // La 2ª escritura es el primer precio: la cabecera ya está puesta.
  const l = libreta({ fallarEn: 2 })
  await assert.rejects(() => guardarCotizacion(entrada(), l.enTransaccion), /boom/)
  assert.equal(l.transacciones, 1, 'y todo dentro de la misma transacción, que deshace la cabecera')
})

// ─── 4. Lo que no viene va a NULL, jamás a 0 ─────────────────────────────────

test('un campo que no trae la petición se persiste como NULL, no como 0', async () => {
  const l = libreta()
  await guardarCotizacion(
    entrada({ peticion: { risk: { address: { postalCode: '41002' } } } }),
    l.enTransaccion,
  )
  const c = l.cabecera()
  for (const columna of [
    'municipio_id',
    'metros_cuadrados',
    'anio_construccion',
    'capital_continente',
    'capital_contenido',
    'tipo_vivienda',
    'uso',
    'ocupacion',
  ]) {
    assert.equal(
      c[columna],
      null,
      `«${columna}» no venía en la petición: un 0 o un '' ahí sería un dato inventado`,
    )
  }
  assert.equal(c.codigo_postal, '41002', 'lo que SÍ venía se guarda')
})

test('el riesgo se aplana de la petición, y distingue hogar de auto', () => {
  const hogar = riesgoDePeticion(CUERPO_HOGAR)
  assert.deepEqual(hogar, {
    codigoPostal: '41002',
    municipioId: 41091,
    metrosCuadrados: 76,
    anioConstruccion: 1994,
    capitalContinente: 61000,
    capitalContenido: 12000,
    tipoVivienda: 'Flat',
    uso: 'Owner',
    ocupacion: 'MainResidence',
  })

  // En auto la dirección se llama `circulationAddress` y no hay vivienda.
  const auto = riesgoDePeticion({
    risk: { circulationAddress: { postalCode: '41003', town: { id: 41091 } } },
  })
  assert.equal(auto.codigoPostal, '41003')
  assert.equal(auto.municipioId, 41091)
  assert.equal(auto.metrosCuadrados, null, 'un coche no tiene metros: NULL, no 0')

  // Un capital a 0 declarado SÍ es un dato: cero contenido asegurado.
  assert.equal(riesgoDePeticion({ risk: { contentsLimit: 0 } }).capitalContenido, 0)
  assert.equal(riesgoDePeticion({}).capitalContenido, null)
  assert.equal(riesgoDePeticion(null).metrosCuadrados, null)
})

// ─── 3. Un fallo al guardar NO tumba la cotización, pero SÍ se dice ──────────

test('guardarSinTumbar no lanza nunca: devuelve el fallo con su motivo', async () => {
  const l = libreta({ fallarEn: 1 })
  const g = await guardarSinTumbar(entrada(), l.enTransaccion)
  assert.equal(g.estado, 'no_guardada')
  assert.match(g.estado === 'no_guardada' ? g.motivo : '', /boom/)

  const bien = await guardarSinTumbar(entrada(), libreta().enTransaccion)
  assert.deepEqual(bien, { estado: 'guardada', cotizacionId: 'cot-1' })
})

/** Cotiza por la rama de SIMULACIÓN (no toca vendor ni libro) con un doble. */
async function cotizarSimulando(deps: Parameters<typeof cotizar>[2], contexto = CONTEXTO) {
  return cotizar(
    {
      correduriaId: 'cor-1',
      cuerpo: CUERPO_HOGAR,
      motivo: 'test',
      solicitadoPor: 'Alberto',
      contexto,
    },
    { [ENV_SIMULACION]: 'true' },
    deps,
  )
}

test('el embudo guarda también lo SIMULADO, marcado y sin intentoId', async () => {
  const vistas: unknown[] = []
  const r = await cotizarSimulando({
    guardar: async (e) => {
      vistas.push({ simulado: e.simulado, intentoId: e.intentoId, ramo: e.contexto.ramo })
      return { estado: 'guardada', cotizacionId: 'cot-9' }
    },
  })
  assert.equal(r.ok, true)
  assert.deepEqual(vistas, [{ simulado: true, intentoId: null, ramo: 'hogar' }])
  assert.deepEqual(r.ok ? r.guardado : null, { estado: 'guardada', cotizacionId: 'cot-9' })
})

test('si el guardado falla, el PRECIO no cambia — pero el resultado lo dice', async () => {
  const sano = await cotizarSimulando({
    guardar: async () => ({ estado: 'guardada', cotizacionId: 'cot-9' }),
  })
  const roto = await cotizarSimulando({
    guardar: async () => {
      throw new Error('la BD se cayó justo después de cobrar')
    },
  })

  assert.equal(roto.ok, true, 'un fallo de BD NO puede tumbar una cotización ya pagada')
  assert.ok(sano.ok && roto.ok)
  assert.deepEqual(roto.cotizacion, sano.cotizacion, 'los precios son los mismos')
  assert.equal(roto.coste, sano.coste)
  assert.equal(roto.restantesHoy, sano.restantesHoy)

  // Y lo contrario de un catch que miente: el fallo se ve, con su motivo.
  assert.equal(roto.guardado.estado, 'no_guardada')
  assert.match(
    roto.guardado.estado === 'no_guardada' ? roto.guardado.motivo : '',
    /la BD se cayó/,
    'el motivo tiene que llegar entero: es lo que dice dónde mirar',
  )
})

test('sin contexto NO se inventa un ramo: es «no_intentada», que no es «guardada»', async () => {
  const llamadas: number[] = []
  // Sin `contexto` en la petición: es el estado de HOY del llamante, y la
  // respuesta correcta es decirlo, no rellenar el ramo con un «otro».
  const r = await cotizar(
    { correduriaId: 'cor-1', cuerpo: CUERPO_HOGAR, motivo: 'test', solicitadoPor: 'Alberto' },
    { [ENV_SIMULACION]: 'true' },
    {
      guardar: async () => {
        llamadas.push(1)
        return { estado: 'guardada', cotizacionId: 'no' }
      },
    },
  )
  assert.ok(r.ok)
  assert.deepEqual(llamadas, [], 'sin contexto ni se intenta escribir')
  assert.equal(r.guardado.estado, 'no_intentada')
  assert.notEqual(r.guardado.estado, 'no_guardada', 'no se intentó: no es lo mismo que fallar')
})

// ─── 3 bis. El orden: guardar va DESPUÉS de cerrar el consumo ────────────────
//
// Esto no se puede ejercitar sin vendor ni BD, así que se fija sobre el código:
// si el guardado se colara antes de `cerrarFacturable`, un fallo suyo dejaría un
// cargo real de 0,50€ sin apuntar en el libro.

/** El cuerpo de `cotizar()`, que es donde vive el orden de los pasos. */
function cuerpoDeCotizar(): string {
  const src = FUENTE(COTIZAR_TS)
  const i = src.indexOf('export async function cotizar(')
  assert.ok(i > 0, 'no se encuentra cotizar(): o se ha movido el embudo, o el cepo se quedó ciego')
  return src.slice(i)
}

/** La rama que paga: desde la llamada al vendor hasta el `catch`. */
function ramaReal(): string {
  const cuerpo = cuerpoDeCotizar()
  const i = cuerpo.indexOf('await peticion(')
  assert.ok(i > 0, 'no se encuentra la llamada al vendor')
  return cuerpo.slice(i)
}

/** ¿Aparece `aguja` antes que `despues` dentro de `src`? Ambas obligatorias. */
function apareceAntesQue(src: string, aguja: string, despues: string): boolean {
  const i = src.indexOf(aguja)
  const j = src.indexOf(despues)
  return i >= 0 && j >= 0 && i < j
}

test('el guardado va DESPUÉS de cerrar el consumo como facturable', () => {
  assert.ok(
    apareceAntesQue(ramaReal(), 'cerrarFacturable(', 'anotar(deps'),
    'Guardar la cotización tiene que ir después de cerrarFacturable(): si el guardado ' +
      'tumbara el cierre, el cargo de 0,50€ se quedaría sin apuntar en el libro.',
  )
})

test('la rama que paga guarda con simulado:false y CON su intentoId', () => {
  const rama = ramaReal()
  assert.match(
    rama,
    /anotar\(deps,\s*p,\s*\{\s*cotizacion,\s*intentoId,\s*simulado:\s*false\s*\}\)/,
    'la cotización real se guarda con su intentoId y sin marcar como simulada',
  )
})

test('el guardado no puede tumbar la cotización: va dentro de un try', () => {
  const src = FUENTE(COTIZAR_TS)
  const i = src.indexOf('async function anotar(')
  assert.ok(i > 0, 'no se encuentra el envoltorio del guardado')
  const anotar = src.slice(i, src.indexOf('\n}', i))
  assert.ok(/try\s*\{/.test(anotar) && /catch/.test(anotar), 'anotar() tiene que atrapar el fallo')
  assert.ok(
    /estado:\s*'no_guardada'/.test(anotar),
    'y convertirlo en un estado explícito, no en un silencio',
  )
})

test('el resultado del embudo declara el guardado como CAMPO, con tres estados', () => {
  const src = FUENTE(COTIZAR_TS)
  const i = src.indexOf('export type ResultadoCotizacion')
  const tipo = src.slice(i, src.indexOf('| { ok: false', i))
  assert.ok(/\bguardado:\s*Guardado\b/.test(tipo), 'la rama ok tiene que declarar `guardado`')
  const estados = FUENTE(COTIZACIONES_TS)
  for (const estado of ['guardada', 'no_guardada', 'no_intentada']) {
    assert.ok(
      new RegExp(`estado:\\s*'${estado}'`).test(estados),
      `falta el estado «${estado}»: dos estados colapsarían «no se pudo» con «ni se intentó»`,
    )
  }
  assert.ok(
    !/\bguardado:\s*boolean\b/.test(tipo),
    'un booleano optimista no distingue «no se pudo guardar» de «guardado»',
  )
})

// ─── 4 bis. Ni un valor de relleno en la persistencia ────────────────────────

test('la persistencia no colapsa ningún NULL a 0, a "" ni a false', () => {
  const src = FUENTE(COTIZACIONES_TS)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const rellenos = [/\?\?\s*0\b/, /\|\|\s*0\b/, /\?\?\s*''/, /\|\|\s*''/, /\?\?\s*false\b/, /coalesce\s*\([^)]*,\s*0\s*\)/i]
  for (const r of rellenos) {
    assert.ok(
      !r.test(src),
      `cotizaciones.ts no puede tener «${r.source}»: convertiría un «no lo sé» en un dato`,
    )
  }
  // Lo único que se permite es `?? null` (y `?? []` para los avisos, que es una
  // lista vacía de verdad: la compañía no dijo nada, no «no se miró»).
  assert.ok(/\?\?\s*null/.test(src), 'los opcionales tienen que caer a null explícitamente')
})

test('toda escritura de la cotización filtra por correduría', () => {
  const src = FUENTE(COTIZACIONES_TS)
  assert.ok(/from ['"]\.\.\/tenant\.ts['"]/.test(src), 'tiene que pasar por la puerta única')
  assert.ok(/correduria_id/.test(src), 'la cabecera lleva correduria_id')
})

// ─── El cepo se prueba a sí mismo ────────────────────────────────────────────

test('el detector de orden distingue un embudo sano de uno roto', () => {
  const sano = 'await cerrarFacturable(x)\nconst g = await anotar(deps, p, {})'
  const roto = 'const g = await anotar(deps, p, {})\nawait cerrarFacturable(x)'
  assert.ok(apareceAntesQue(sano, 'cerrarFacturable(', 'anotar(deps'))
  assert.ok(!apareceAntesQue(roto, 'cerrarFacturable(', 'anotar(deps'))
  assert.ok(!apareceAntesQue('ni una cosa ni la otra', 'cerrarFacturable(', 'anotar(deps'))
})

test('el lector de filas casa columnas con valores, y protesta si no cuadran', () => {
  const buena = fila({
    sql: 'insert into seguros.cotizaciones (a, b) values (?::uuid, ?)',
    valores: [1, null],
  })
  assert.deepEqual(buena, { a: 1, b: null })
  assert.throws(
    () => fila({ sql: 'insert into seguros.cotizaciones (a, b) values (?)', valores: [1] }),
    /2 columnas pero enlaza 1/,
  )
})

// ─── El fallo que ya ocurrió: la función existía y nadie la llamaba ──────────
//
// `cotizar()` solo guarda si recibe `contexto`, y es opcional a propósito (sin
// él no se inventa un ramo ni una puerta). El precio de esa prudencia es que
// olvidarlo NO da error: la cotización se pide, se PAGA y el precio se muere en
// la pestaña del navegador. Recargar vuelve a costar 0,50€ y nada falla a la
// vista, que es el modo de fallo más caro que hay en esta app.
test('🚨 la ruta que gasta pasa `contexto` a cotizar: sin él se paga y no se guarda', () => {
  const ruta = FUENTE('apps/asegura/app/api/cartera/polizas/[polizaId]/retarificar/route.ts')
  const llamada = ruta.slice(ruta.indexOf('await cotizar({'))
  assert.ok(llamada.length > 0, 'la ruta ya no llama a cotizar(): revisa este guardián')

  const cuerpo = llamada.slice(0, llamada.indexOf('})') + 2)
  assert.match(cuerpo, /contexto:\s*\{/, 'la ruta no pasa `contexto`: la cotización se pagaría sin guardarse')
  assert.match(cuerpo, /ramo:\s*origen\.tipo/, 'el ramo se saca de la póliza, nunca se escribe a mano')
  assert.match(cuerpo, /puerta:\s*'corredor'/, 'esta ruta es la del corredor: su tope es el de la casa')
  assert.match(cuerpo, /polizaId/, 'sin la póliza, la cotización guardada no se puede reenseñar en su ficha')
})

// ─── El otro fallo que ya ocurrió: importar exigía una base de datos ─────────
//
// Este guardián IMPORTA `cotizaciones.ts` y `cotizar.ts` para probarlos de
// verdad con un doble de la transacción. La cadena de imports llega a
// `lib/db.ts`, y mientras ese módulo construía el cliente al cargarse, bastaba
// con importar cualquier pieza de `lib/` para que el proceso muriera donde no
// hubiera un cliente generado. En local pasaba —los typechecks lo generan
// antes— y en CI no: el job `Tests (packages + guardián)` no corre
// `prisma generate`, así que este fichero entero se caía con un error que no
// hablaba de cotizaciones y costaba media tarde encontrar.
test('🚨 `lib/db.ts` construye el cliente al USARLO, no al importarlo', () => {
  const src = FUENTE('apps/asegura/lib/db.ts')
  const nivelSuperior = src
    .split('\n')
    .filter((l) => /^(export )?const .*=|^export const prisma/.test(l))
    .join('\n')
  assert.doesNotMatch(
    nivelSuperior,
    /new PrismaClient\(\)/,
    'volver a construir el cliente en el cuerpo del módulo tumba este guardián entero en CI',
  )
  assert.match(
    src,
    /function cliente\(\)/,
    'la construcción diferida vive en `cliente()`: si desaparece, algo ha vuelto a hacerse en la carga',
  )
})

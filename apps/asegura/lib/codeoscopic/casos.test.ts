import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casosDeRamo, type EjecutorLectura } from './casos.ts'

// Ni un dato real: pólizas inventadas, sin nombres, sin números de póliza.
const CORREDURIA = '11111111-1111-1111-1111-111111111111'

type Opciones = {
  cartera?: unknown[]
  cotizaciones?: unknown[]
  fallaCartera?: unknown
  fallaCotizaciones?: unknown
}

/**
 * El doble de la BD: mismo truco que `cotizaciones.ts` (ejecutor por
 * parámetro), así que estos tests NO levantan Postgres. Reparte por el texto de
 * la consulta y guarda lo que se le ha pedido, para poder comprobar que el
 * `correduria_id` va SIEMPRE en el WHERE.
 */
function doble(opciones: Opciones = {}) {
  const consultas: { sql: string; valores: unknown[] }[] = []
  const tx: EjecutorLectura = {
    async $queryRaw<T = unknown>(sql: TemplateStringsArray, ...valores: unknown[]): Promise<T> {
      const texto = sql.join(' ? ')
      consultas.push({ sql: texto, valores })
      if (/from\s+seguros\.cotizaciones/.test(texto)) {
        if (opciones.fallaCotizaciones !== undefined) throw opciones.fallaCotizaciones
        return (opciones.cotizaciones ?? []) as T
      }
      if (opciones.fallaCartera !== undefined) throw opciones.fallaCartera
      return (opciones.cartera ?? []) as T
    },
  }
  return { tx, consultas }
}

const filaCartera = (extra: Record<string, unknown> = {}) => ({
  compania: 'Compañía Inventada',
  prima_bruta: 420.5,
  prima_anual: null,
  fecha: '2026-05-01',
  datos: { metrosCuadrados: '76', anioConstruccion: '1995', continente: '61000' },
  coberturas: [],
  ...extra,
})

test('reúne la cartera y las cotizaciones, y dice cuántas vienen de cada sitio', async () => {
  const { tx } = doble({
    cartera: [filaCartera(), filaCartera({ prima_bruta: 380 })],
    cotizaciones: [
      { compania: 'Otra', prima: 310.25, fecha: '2026-07-15', metros: 80, anio: 2001, capital: 70000 },
    ],
  })
  const r = await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })

  assert.equal(r.cartera, 2)
  assert.equal(r.cotizaciones, 1)
  assert.equal(r.cotizacionesDisponibles, true)
  assert.equal(r.casos.length, 3)
  assert.deepEqual(
    r.casos.map((c) => c.origen),
    ['cartera', 'cartera', 'cotizacion'],
  )
  assert.deepEqual(r.casos[0], {
    primaEur: 420.5,
    fecha: '2026-05-01',
    origen: 'cartera',
    compania: 'Compañía Inventada',
    metrosCuadrados: 76,
    anioConstruccion: 1995,
    capitalContinente: 61000,
  })
})

test('🚨 un dato que falta llega como null, JAMÁS como 0', async () => {
  const { tx } = doble({
    // Una póliza de la que solo se sabe lo que cuesta: ni m², ni año, ni capital.
    cartera: [filaCartera({ datos: {}, coberturas: [] })],
  })
  const [c] = (await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })).casos

  assert.equal(c!.metrosCuadrados, null)
  assert.equal(c!.anioConstruccion, null)
  assert.equal(c!.capitalContinente, null)
  // Explícito porque es justo el fallo que se quiere evitar: un piso de cero
  // metros o de 0€ de continente entraría en la horquilla como un caso real.
  assert.notEqual(c!.metrosCuadrados, 0)
  assert.notEqual(c!.capitalContinente, 0)
})

test('el capital de hogar sale del CONSENSO entre garantías, no del sublímite más caro', async () => {
  const { tx } = doble({
    cartera: [
      filaCartera({
        datos: { metrosCuadrados: '90' },
        coberturas: [
          { descripcion: 'DAÑOS VIVIENDA', capital: '500480' },
          { descripcion: 'ROBO VIVIENDA', capital: '500480' },
          { descripcion: 'INCENDIO VIVIENDA', capital: '500480' },
          // Un sublímite: lo lleva UNA sola garantía, así que no corrobora nada.
          { descripcion: 'ROTURAS VIVIENDA', capital: '1500' },
        ],
      }),
    ],
  })
  const [c] = (await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })).casos
  assert.equal(c!.capitalContinente, 500480)
})

test('en un ramo que no es hogar no se inventa capital a partir de las garantías', async () => {
  const { tx } = doble({
    cartera: [filaCartera({ datos: {}, coberturas: [{ descripcion: 'DAÑOS VIVIENDA', capital: '500480' }] })],
  })
  const [c] = (await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'auto', tx })).casos
  assert.equal(c!.capitalContinente, null)
})

test('una prima a 0 no es un caso: 0 no es «gratis», es «no informada»', async () => {
  const { tx } = doble({ cartera: [filaCartera({ prima_bruta: 0, prima_anual: 0 })] })
  const r = await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })
  assert.equal(r.cartera, 0)
  assert.equal(r.casos.length, 0)
})

test('un caso sin fecha se descarta: un precio sin fecha no se puede pesar', async () => {
  const { tx } = doble({ cartera: [filaCartera({ fecha: null })] })
  assert.equal((await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })).cartera, 0)
})

test('🚨 la tabla de cotizaciones que aún no existe NO se lee como «no hay ninguna»', async () => {
  const error = Object.assign(new Error('Raw query failed. Code: `42P01`'), { code: 'P2010', meta: { code: '42P01' } })
  const { tx } = doble({ cartera: [filaCartera()], fallaCotizaciones: error })

  const r = await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })
  assert.equal(r.cotizacionesDisponibles, false)
  assert.equal(r.cotizaciones, 0)
  // Y lo importante: los casos de la cartera siguen viniendo. La estimación se
  // hace igual, solo que sin la segunda fuente.
  assert.equal(r.cartera, 1)
  assert.equal(r.casos.length, 1)
})

test('el 42P01 también se reconoce cuando solo viene en el texto del error', async () => {
  const { tx } = doble({
    cartera: [filaCartera()],
    fallaCotizaciones: new Error('ERROR: relation "cotizaciones" does not exist (42P01)'),
  })
  const r = await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })
  assert.equal(r.cotizacionesDisponibles, false)
})

test('🚨 CUALQUIER otro error de BD se propaga: no se disfraza de «no hay casos»', async () => {
  const { tx } = doble({
    cartera: [filaCartera()],
    fallaCotizaciones: Object.assign(new Error('password authentication failed'), { code: '28P01' }),
  })
  await assert.rejects(
    () => casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx }),
    /password authentication failed/,
  )
})

test('un fallo leyendo la cartera también se propaga', async () => {
  const { tx } = doble({ fallaCartera: new Error('connection reset by peer') })
  await assert.rejects(
    () => casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx }),
    /connection reset by peer/,
  )
})

test('🔒 las DOS consultas filtran por correduría (con BYPASSRLS olvidarlo no da error)', async () => {
  const { tx, consultas } = doble({ cartera: [], cotizaciones: [] })
  await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })

  assert.equal(consultas.length, 2)
  for (const c of consultas) {
    assert.match(c.sql, /correduria_id\s*=/)
    assert.ok(c.valores.includes(CORREDURIA), 'la correduría tiene que viajar como parámetro')
    assert.ok(c.valores.includes('hogar'), 'el ramo tiene que viajar como parámetro')
  }
  // Y las coberturas se leen con el mismo filtro, no por poliza_id a secas.
  assert.equal(consultas[0]!.sql.match(/correduria_id\s*=/g)?.length, 2)
})

test('no entran las cotizaciones SIMULADAS ni las pólizas del volcado histórico', async () => {
  const { tx, consultas } = doble()
  await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })

  const cartera = consultas.find((c) => /from\s+seguros\.polizas/.test(c.sql))!
  const cotizaciones = consultas.find((c) => /from\s+seguros\.cotizaciones/.test(c.sql))!
  // Las simuladas son números que nos inventamos nosotros: estimar sobre ellas
  // sería estimar sobre nuestra propia invención.
  assert.match(cotizaciones.sql, /and\s+not\s+co\.simulado/)
  // Y el volcado de junio/2026 (vencimientos 2013-2018) no dice nada del
  // mercado de hoy: solo la cartera viva.
  assert.match(cartera.sql, /p\.import_ref\s+is\s+null/)
})

test('las cotizaciones traen su compañía y su riesgo, y el que falta viaja a null', async () => {
  const { tx } = doble({
    cotizaciones: [
      { compania: 'Compañía B', prima: 250, fecha: '2026-08-20', metros: null, anio: null, capital: null },
    ],
  })
  const [c] = (await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })).casos
  assert.deepEqual(c, {
    primaEur: 250,
    fecha: '2026-08-20',
    origen: 'cotizacion',
    compania: 'Compañía B',
    metrosCuadrados: null,
    anioConstruccion: null,
    capitalContinente: null,
  })
})

test('«se ha mirado y no hay» se distingue de «no se ha podido mirar»', async () => {
  const { tx } = doble({ cartera: [filaCartera()], cotizaciones: [] })
  const r = await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })
  assert.equal(r.cotizaciones, 0)
  assert.equal(r.cotizacionesDisponibles, true)
})

// ─── Los dos sesgos que se corrigieron al revisar (02/09/2026) ───────────────

test('🚨 la propia póliza NO entra en su propia horquilla: se compararía consigo misma', async () => {
  const { tx, consultas } = doble({ cartera: [], cotizaciones: [] })
  const YO = '11111111-2222-3333-4444-555555555555'
  await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx, excluirPolizaId: YO })

  const cartera = consultas.find((c) => /from\s+seguros\.polizas/.test(c.sql))!
  assert.match(cartera.sql, /p\.id\s*<>/, 'la póliza que se estima tiene que quedar fuera del WHERE')
  assert.ok(cartera.valores.includes(YO), 'y su id tiene que viajar como parámetro, no interpolado')
})

test('sin `excluirPolizaId` no se excluye a nadie: pedir el ramo entero sigue funcionando', async () => {
  const { tx, consultas } = doble({ cartera: [], cotizaciones: [] })
  await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })

  const cartera = consultas.find((c) => /from\s+seguros\.polizas/.test(c.sql))!
  // El parámetro viaja igual (a null): la guarda es `NULL is null or ...`, así
  // que la consulta es UNA sola forma y no dos ramas que se puedan desincronizar.
  assert.ok(cartera.valores.includes(null), 'el hueco viaja como NULL, no se quita el filtro')
})

test('🚨 UNA cotización aporta UN caso, no uno por compañía que respondió', async () => {
  const { tx, consultas } = doble({ cartera: [], cotizaciones: [] })
  await casosDeRamo({ correduriaId: CORREDURIA, ramo: 'hogar', tx })

  const cot = consultas.find((c) => /from\s+seguros\.cotizaciones/.test(c.sql))!
  // Quince precios de la MISMA casa no son quince observaciones del mercado: en
  // una muestra de diecinueve, esa casa mandaría sobre la horquilla entera.
  assert.match(cot.sql, /limit\s+1/i, 'un solo precio por cotización')
  assert.match(cot.sql, /order\s+by\s+cp2\.prima_eur\s+asc/i, 'y que sea el más barato, que es lo comparable')
})

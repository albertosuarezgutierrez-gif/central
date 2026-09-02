// Los CASOS con los que se estima una prima. Impuro (BD), pero SOLO LECTURA.
//
// `horquilla.ts` es puro a propósito: la decisión de gastar 0,50€ tiene que
// poder probarse sin base de datos. Éste es el módulo que va a buscar con qué
// alimentarla, y solo mira dos sitios:
//
//   1. La CARTERA VIVA (`import_ref IS NULL`): lo que pagan de verdad los
//      clientes de esta correduría en ese ramo. Las 28.729 pólizas del volcado
//      histórico quedan fuera — sus vencimientos son de 2013-2018 y sus primas
//      no dicen nada del mercado de hoy.
//   2. Las COTIZACIONES GUARDADAS que NO son simuladas: precios que dio una
//      compañía de verdad. Las simuladas NUNCA entran: son números que se
//      inventa `simulacion.ts` para poder recorrer la pantalla sin gastar, y
//      meterlos en una horquilla sería estimar sobre nuestra propia invención.
//
// 🚨 Aquí NO se llama a Codeoscopic. Cada `POST /insurances` cuesta 0,50€
// reales; esto solo relee lo que ya se pagó una vez.
//
// 🔒 Aislamiento: `correduria_id` viaja en TODAS las consultas. Con
// `prisma_seguros` en BYPASSRLS, olvidarlo no da error — da la cartera de otra
// correduría, que es un fallo que no se ve.

import { capitalesHogar, eurDeCapital, primaReferencia } from '@central/module-seguros'
import type { AmbitoCorreduria } from '../tenant.ts'
import type { Caso } from './horquilla.ts'
import { hogarDeDatos } from './desde-cartera-hogar.ts'

/**
 * El id de correduría tal y como lo devuelve el ámbito en estado `ok`
 * (`lib/tenant` → `exigirCorreduriaId`). Se escribe así, y no como `string`, para
 * dejar en el TIPO que este módulo no resuelve el ámbito ni lo adivina: se lo
 * dan ya resuelto por la puerta única.
 *
 * ⚠️ El import de `lib/tenant` es de SOLO TIPO a propósito: importarlo como
 * valor arrastraría `lib/db` (y con él Prisma) a cualquier test que importe este
 * módulo, y entonces la lógica no se podría probar sin base de datos —
 * exactamente lo que el ejecutor por parámetro existe para evitar.
 */
export type CorreduriaId = Extract<AmbitoCorreduria, { estado: 'ok' }>['correduriaId']

/**
 * Lo mínimo que se necesita de la BD, declarado aquí para poder DOBLARLO en un
 * test sin levantar Postgres (mismo truco que `ClienteRaw` en `cotizaciones.ts`).
 */
export type EjecutorLectura = {
  $queryRaw<T = unknown>(sql: TemplateStringsArray, ...valores: unknown[]): Promise<T>
}

export type PeticionCasos = {
  /**
   * 🔒 Obligatorio y sin valor por defecto: lo resuelve `lib/tenant` (el ámbito
   * de correduría) y llega hasta el WHERE de las DOS consultas. Con
   * `prisma_seguros` en BYPASSRLS, olvidarlo devolvería la cartera de otro sin
   * dar ningún error.
   */
  correduriaId: CorreduriaId
  /** El ramo de la casa (`auto`, `hogar`…), tal cual está en `polizas.tipo`. */
  ramo: string
  /** Con qué leer. Lo pone el llamante (que es quien tiene conexión); un test le pasa un doble. */
  tx: EjecutorLectura
  /**
   * La póliza que se está estimando, para dejarla FUERA de sus propios casos.
   *
   * 🚨 No es un detalle: la pregunta es «¿lo que paga está por encima del
   * mercado?», y meterla en el mercado con el que se compara la acerca a la
   * mediana y sesga el veredicto hacia `no-merece` — justo el lado que hace
   * NO pedir precio y perder el negocio. Con ~19 hogares vivos, una póliza es
   * el 5% de la muestra y además tira de la mediana hacia sí misma.
   */
  excluirPolizaId?: string | null
}

export type CasosDeRamo = {
  casos: Caso[]
  /** Cuántos vienen de la cartera. */
  cartera: number
  /** Cuántos vienen de cotizaciones reales guardadas. */
  cotizaciones: number
  /**
   * 🚨 TRES estados en dos campos, no dos: `cotizaciones: 0` con
   * `cotizacionesDisponibles: true` es «se ha mirado y no hay ninguna»;
   * con `false` es «no se ha podido mirar». Pintarlos igual diría que no hay
   * cotizaciones cuando lo que pasa es que la tabla todavía no existe.
   */
  cotizacionesDisponibles: boolean
}

/**
 * Reúne los casos de un ramo: cartera + cotizaciones reales.
 *
 * Lo que NO hace: filtrar por parecido (eso es de `horquilla.ts`), ni rellenar
 * huecos. Un dato que la ficha no trae viaja como `null` hasta el final —
 * `?? 0` metería un piso de cero metros o de 0€ de continente en la horquilla
 * como si fuera un caso real, y la torcería.
 */
export async function casosDeRamo({ correduriaId, ramo, tx, excluirPolizaId = null }: PeticionCasos): Promise<CasosDeRamo> {
  const cartera = await casosDeCartera(correduriaId, ramo, tx, excluirPolizaId)
  const cotizaciones = await casosDeCotizaciones(correduriaId, ramo, tx)
  return {
    casos: [...cartera, ...cotizaciones.casos],
    cartera: cartera.length,
    cotizaciones: cotizaciones.casos.length,
    cotizacionesDisponibles: cotizaciones.disponible,
  }
}

// ─── 1. La cartera viva ──────────────────────────────────────────────────────

type FilaCartera = {
  compania: string | null
  prima_bruta: number | null
  prima_anual: number | null
  fecha: string | null
  datos: unknown
  coberturas: unknown
}

async function casosDeCartera(
  correduriaId: string,
  ramo: string,
  tx: EjecutorLectura,
  excluirPolizaId: string | null,
): Promise<Caso[]> {
  // Las coberturas viajan en el mismo viaje (subconsulta a json) porque el
  // capital de hogar se reconstruye por CORROBORACIÓN entre garantías
  // (`capitalesHogar`) y hacen falta todas las de la póliza para contarlas.
  const filas = await tx.$queryRaw<FilaCartera[]>`
    select
      p.aseguradora                                          as compania,
      p.prima_bruta::float8                                  as prima_bruta,
      p.prima_anual::float8                                  as prima_anual,
      coalesce(p.fecha_inicio, p.fecha_efecto_inicial)::text  as fecha,
      p.datos_especificos                                    as datos,
      (
        select coalesce(
          json_agg(json_build_object('descripcion', c.descripcion, 'capital', c.capital_asegurado)),
          '[]'::json
        )
        from seguros.poliza_coberturas c
        where c.poliza_id = p.id
          and c.correduria_id = ${correduriaId}::uuid
      )                                                      as coberturas
    from seguros.polizas p
    where p.correduria_id = ${correduriaId}::uuid
      and p.import_ref is null
      and p.merged_into_poliza_id is null
      and p.tipo::text = ${ramo}
      and coalesce(p.fecha_inicio, p.fecha_efecto_inicial) is not null
      and (coalesce(p.prima_bruta, 0) > 0 or coalesce(p.prima_anual, 0) > 0)
      -- La propia póliza fuera: no se compara consigo misma. Con NULL no
      -- excluye nada, que es lo que quiere quien pide los casos de un ramo
      -- entero y no de una ficha concreta.
      and (${excluirPolizaId}::uuid is null or p.id <> ${excluirPolizaId}::uuid)
  `

  const casos: Caso[] = []
  for (const f of filas) {
    // `primaReferencia` es la misma regla que pinta la ficha: bruta si es > 0,
    // si no la anual, y un 0 es «no informada», nunca «gratis».
    const primaEur = primaReferencia({ primaAnual: f.prima_anual, primaBruta: f.prima_bruta })
    const fecha = texto(f.fecha)
    // Un precio sin fecha no se puede pesar: las tarifas cambian.
    if (primaEur === null || fecha === null) continue

    const riesgo = hogarDeDatos(objetoPlano(f.datos), 'poliza')
    const porGarantias =
      ramo === 'hogar' ? eurDeCapital(capitalesHogar(coberturasLeibles(f.coberturas)).continente) : null

    casos.push({
      primaEur,
      fecha,
      origen: 'cartera',
      compania: texto(f.compania),
      metrosCuadrados: riesgo?.metrosCuadrados ?? null,
      anioConstruccion: riesgo?.anioConstruccion ?? null,
      // El capital corroborado por las garantías manda sobre el tecleado en la
      // ficha; si ninguno de los dos lo sabe, sigue siendo `null` — el `??`
      // solo encadena «no lo sé», nunca convierte un hueco en un 0.
      capitalContinente: porGarantias ?? riesgo?.capitalContinente ?? null,
    })
  }
  return casos
}

// ─── 2. Las cotizaciones guardadas (reales, nunca simuladas) ─────────────────

type FilaCotizacion = {
  compania: string | null
  prima: number | null
  fecha: string | null
  metros: number | null
  anio: number | null
  capital: number | null
}

/**
 * Código de Postgres para «la tabla no existe» (`undefined_table`).
 *
 * ⏳ Guarda TEMPORAL: `seguros.cotizaciones` todavía no está creada — su SQL
 * (`prisma/sql/2026-09-02_cotizaciones_guardadas.sql`) está sin aplicar. En
 * cuanto se aplique, esta guarda y el `catch` de abajo se pueden BORRAR y la
 * consulta pasa a fallar como cualquier otra.
 */
const TABLA_INEXISTENTE = '42P01'

/**
 * ¿Es este error «esa tabla no existe» y NADA más?
 *
 * Se mira el código, no el texto suelto: Prisma envuelve el error crudo en un
 * `P2010` y deja el código de Postgres en `meta.code` y dentro del mensaje
 * («Raw query failed. Code: `42P01`»). Cualquier otro fallo —conexión, permisos,
 * columna que no existe— NO encaja aquí y sale por donde entró.
 */
function esTablaInexistente(e: unknown): boolean {
  const posible = e as { code?: unknown; meta?: { code?: unknown } } | null
  if (posible?.code === TABLA_INEXISTENTE || posible?.meta?.code === TABLA_INEXISTENTE) return true
  const mensaje = e instanceof Error ? e.message : String(e)
  return mensaje.includes(TABLA_INEXISTENTE) || /undefined_table/i.test(mensaje)
}

async function casosDeCotizaciones(
  correduriaId: string,
  ramo: string,
  tx: EjecutorLectura,
): Promise<{ casos: Caso[]; disponible: boolean }> {
  let filas: FilaCotizacion[]
  try {
    filas = await tx.$queryRaw<FilaCotizacion[]>`
      select
        cp.compania                                        as compania,
        cp.prima_eur::float8                               as prima,
        (co.creado_at at time zone 'Europe/Madrid')::date::text as fecha,
        co.metros_cuadrados                                as metros,
        co.anio_construccion                               as anio,
        co.capital_continente::float8                      as capital
      from seguros.cotizaciones co
      -- 🚨 UNA cotización = UN caso, no uno por precio recibido.
      --
      -- Una tarificación devuelve el precio de N compañías para la MISMA casa.
      -- Contarlos todos metería quince observaciones de un solo riesgo en una
      -- muestra de diecinueve, y la horquilla dejaría de describir el mercado
      -- para describir esa casa. Se coge el más barato, que es lo comparable:
      -- «lo que ese riesgo puede conseguir».
      join lateral (
        select cp2.compania, cp2.prima_eur
        from seguros.cotizacion_precios cp2
        where cp2.cotizacion_id = co.id
          and cp2.prima_eur > 0
        order by cp2.prima_eur asc
        limit 1
      ) cp on true
      where co.correduria_id = ${correduriaId}::uuid
        and co.ramo = ${ramo}
        and not co.simulado
    `
  } catch (e) {
    // 🚨 Solo se traga «la tabla no existe». Un `catch` que se tragara todo y
    // devolviera `[]` diría «no hay cotizaciones con las que comparar» cuando
    // lo que ha pasado es que la consulta ha fallado — el fallo más caro que
    // describe `CLAUDE.md`: la guarda que se pone verde porque no vino nada.
    if (esTablaInexistente(e)) return { casos: [], disponible: false }
    throw e
  }

  const casos: Caso[] = []
  for (const f of filas) {
    const primaEur = numero(f.prima)
    const fecha = texto(f.fecha)
    if (primaEur === null || primaEur <= 0 || fecha === null) continue
    casos.push({
      primaEur,
      fecha,
      origen: 'cotizacion',
      compania: texto(f.compania),
      metrosCuadrados: entero(f.metros),
      anioConstruccion: entero(f.anio),
      capitalContinente: numero(f.capital),
    })
  }
  return { casos, disponible: true }
}

// ─── Lectura defensiva ───────────────────────────────────────────────────────
// Ninguno de estos helpers tiene valor de relleno: lo que no se sabe sale
// `null` y llega así hasta `horquilla.ts`, que ya sabe tratarlo (un caso al que
// le falta un dato no se descarta, solo no compara por ese campo).

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
function entero(v: unknown): number | null {
  const n = numero(v)
  return n === null ? null : Math.round(n)
}
function objetoPlano(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Las garantías tal como las quiere `capitalesHogar`, vengan como json o como texto. */
function coberturasLeibles(v: unknown): { descripcion: string | null; capital: string | null }[] {
  let bruto: unknown = v
  if (typeof v === 'string') {
    try {
      bruto = JSON.parse(v)
    } catch {
      return []
    }
  }
  if (!Array.isArray(bruto)) return []
  return bruto.map((c) => {
    const o = objetoPlano(c)
    return { descripcion: texto(o?.descripcion), capital: texto(o?.capital) }
  })
}

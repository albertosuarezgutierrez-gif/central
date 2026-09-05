import { NextResponse } from 'next/server'
import type { PolizaHuerfana } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Las pólizas que CIMA nos NOMBRA en un recibo o un siniestro y que no
 * encontramos en la cartera — una a una, con su número de póliza.
 *
 *   GET ?limite=<n>
 *     → { estado:'ok', polizas: [...], total, truncado, ocultasOtroAmbito }
 *
 * 🚨 Por qué existe (medido el 05/09/2026). El vigía `correduria-ingesta` ya
 * decía «20 póliza(s) con recibos o siniestros que no encuentran su póliza» y
 * «3 de ellas ya están en la cartera», pero **no decía CUÁLES**. Alberto no le
 * puede pedir a Occident el volcado de una lista que no tiene, así que el aviso
 * describía una pérdida activa sin dejar hacer nada con ella. Esto es lo que
 * falta para actuar: los `idPolizaEntidad` concretos, agrupables por clave de
 * mediador, listos para pegar en un correo a la compañía.
 *
 * 🚨 Y las dos averías se distinguen AQUÍ, porque llevan a sitios distintos:
 * `enCartera: 'ausente'` se le PIDE a la compañía (CIMA solo manda `POL` en
 * altas y modificaciones: una póliza vieja que no se movió nunca llegó);
 * `'viva'` se arregla REPROCESANDO el fichero EIAC — y eso **no se puede hacer
 * desde central**, porque aquí no se guarda el XML (`cima_ficheros` solo tiene
 * `xml_hash` y el payload del evento solo lleva metadatos): vive en la ingesta
 * de origen. Colapsarlas mandaría a preguntarle a la compañía por algo que ya
 * está en la BD.
 *
 * 🔒 Lo que NO sale, a propósito: **nada del cliente**. Ni nombre, ni DNI, ni
 * teléfono, ni matrícula. `idPolizaEntidad` es el número de póliza de la
 * COMPAÑÍA —es justo lo que hay que citarle— y para que Occident mande un
 * volcado de doce pólizas no hace falta decirle de quién son. Es la misma regla
 * que ya cumple `lib/ingesta.ts`: se cuentan ficheros y pólizas, no personas.
 */
type Fila = {
  entidad: string | null
  nombre: string | null
  clave: string | null
  id_poliza: string
  recibos: bigint | null
  siniestros: bigint | null
  prima: number | null
  ultimo: Date | null
  viva: boolean | null
  lapida: boolean | null
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const limiteBruto = Number(q.get('limite') ?? '200')
  const limite = Number.isFinite(limiteBruto) ? Math.min(1000, Math.max(1, Math.trunc(limiteBruto))) : 200

  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    // Sin correduría no se filtra «por si acaso»: con BYPASSRLS eso devolvería
    // las huérfanas de todas, y este puerto acaba en un Telegram.
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })

    const db = prismaAsegura()

    // La CLAVE DE MEDIADOR sale del 2º campo del nombre EIAC
    // (`C0468_M00171_SIN_…`), igual que en `lib/ingesta.ts`. Es la que dice de
    // QUÉ cartera se está perdiendo el dato: Occident manda por tres claves y
    // hoy el atasco es 12 en `M00171` y 5 en `8-92361`. «Occident: 17» mandaría
    // a revisar una cartera que en parte va bien.
    //
    // ⚠️ La prima se castea SOLO si de verdad parece un número. Un
    // `::numeric` a pelo sobre un valor raro tumbaría la consulta ENTERA y nos
    // quedaríamos sin la lista por culpa de un importe: mejor esa prima a
    // `null` («no se sabe») que ninguna póliza.
    const filas = await db.$queryRawUnsafe<Fila[]>(`
      WITH citadas AS (
        SELECT NULLIF(btrim(e.payload->>'idPolizaEntidad'), '') AS id_poliza,
               NULLIF(btrim(e.payload->>'codigoEntidad'), '') AS entidad,
               NULLIF(split_part(e.payload->>'nombreFichero', '_', 2), '') AS clave,
               e.event_name,
               e.occurred_at,
               CASE WHEN e.payload->>'primaTotal' ~ '^-?[0-9]+([.,][0-9]+)?$'
                    THEN REPLACE(e.payload->>'primaTotal', ',', '.')::numeric END AS prima
        FROM operational_events e
        WHERE e.event_name IN ('cima_siniestro_sin_poliza_review', 'cima_recibo_sin_poliza_review')
          AND e.correduria_id = $1::uuid
          AND NULLIF(btrim(e.payload->>'idPolizaEntidad'), '') IS NOT NULL
      )
      SELECT c.entidad,
             c.clave,
             c.id_poliza,
             (SELECT d.nombre_comun FROM companias_dgs d WHERE d.codigo_dgs = c.entidad) AS nombre,
             COUNT(*) FILTER (WHERE c.event_name LIKE '%recibo%') AS recibos,
             COUNT(*) FILTER (WHERE c.event_name LIKE '%siniestro%') AS siniestros,
             SUM(c.prima) FILTER (WHERE c.event_name LIKE '%recibo%') AS prima,
             MAX(c.occurred_at) AS ultimo,
             EXISTS (
               SELECT 1 FROM polizas p
               WHERE p.correduria_id = $1::uuid
                 AND p.id_poliza_entidad = c.id_poliza
                 AND p.merged_into_poliza_id IS NULL
             ) AS viva,
             EXISTS (
               SELECT 1 FROM polizas p
               WHERE p.correduria_id = $1::uuid
                 AND p.id_poliza_entidad = c.id_poliza
                 AND p.merged_into_poliza_id IS NOT NULL
             ) AS lapida
      FROM citadas c
      GROUP BY 1, 2, 3
      ORDER BY COUNT(*) DESC, c.id_poliza ASC
      LIMIT $2
    `, correduria.id, limite + 1)

    // 🚨 Un evento de estos SIN correduría (o de otra) no se tira en silencio:
    // el filtro de ámbito es necesario, pero una huérfana que desaparece por él
    // es exactamente la pérdida que este puerto vino a hacer visible. Se cuenta
    // aparte para que la pantalla pueda decir «y hay N que no puedo atribuir».
    const ocultasRaw = await db.$queryRawUnsafe<Array<{ n: bigint | null }>>(`
      SELECT COUNT(*) AS n
      FROM operational_events e
      WHERE e.event_name IN ('cima_siniestro_sin_poliza_review', 'cima_recibo_sin_poliza_review')
        AND (e.correduria_id IS NULL OR e.correduria_id <> $1::uuid)
    `, correduria.id)

    const truncado = filas.length > limite
    const polizas: PolizaHuerfana[] = filas.slice(0, limite).map(f => ({
      entidad: f.entidad ?? 'desconocida',
      // Sin fila en `companias_dgs` no se inventa marca: se cita el código DGS,
      // que es con lo que la compañía se identifica en CIMA.
      entidadNombre: f.nombre,
      clave: f.clave,
      idPolizaEntidad: f.id_poliza,
      recibos: Number(f.recibos ?? 0),
      siniestros: Number(f.siniestros ?? 0),
      // `null` = ningún recibo suyo traía prima legible. NO es 0 €.
      prima: f.prima === null || f.prima === undefined ? null : Number(f.prima),
      ultimoEn: f.ultimo ? f.ultimo.toISOString().slice(0, 10) : null,
      // Tres estados, nunca dos: una fila fusionada (lápida) no es «la
      // tenemos» —el recibo no puede colgar de ahí— pero pedírsela a la
      // compañía sería pedir dos veces lo que ya está.
      enCartera: f.viva ? 'viva' : f.lapida ? 'lapida' : 'ausente',
    }))

    return NextResponse.json({
      estado: 'ok',
      polizas,
      total: polizas.length,
      truncado,
      ocultasOtroAmbito: Number(ocultasRaw[0]?.n ?? 0),
    })
  } catch (e) {
    // Un fallo de lectura NO se sirve como lista vacía: aguas arriba `[]` se
    // leería como «no hay ninguna huérfana», o sea dar por resuelta una pérdida
    // activa. Quien llama lo convierte en «no se ha podido mirar».
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/huerfanas', e) })
  }
}

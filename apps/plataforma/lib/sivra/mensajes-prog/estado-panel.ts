// lib/sivra/mensajes-prog/estado-panel.ts — estado del ciclo de mensajes para pintarlo en /apartamentos.
//
// Tres estados por piso, nunca dos (regla del repo «un dato que NO hay ≠ un dato que NO se ha mirado»):
//   · activo   → nuestros mensajes SALEN al huésped
//   · sombra   → se generan y se guardan, pero al huésped le sigue escribiendo Smoobu
//   · (si la consulta falla, se DECLARA: no se pinta «sombra» por defecto, que sería tranquilizador
//     y falso — «sombra» y «no lo he podido mirar» mandan a sitios distintos)

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { ACCESO } from '../acceso'

export type EstadoPiso = {
  propertyId: string
  nombre: string
  activo: boolean
  desde: string | null
  /** Mensajes ya registrados de ese piso, por estado. */
  enviados: number
  enSombra: number
  fallos: number
  ultimoEnvio: string | null
}

export type EstadoCiclo = {
  pisos: EstadoPiso[]
  /** Última pasada BUENA del cron. null = nunca ha latido (o no se pudo leer: mira `aviso`). */
  ultimaPasada: string | null
  detallePasada: string | null
  /** Motivo por el que falta información. null = se pudo mirar todo. */
  aviso: string | null
}

export async function getEstadoCiclo(): Promise<EstadoCiclo> {
  try {
    const [activos, porPiso, latido] = await Promise.all([
      prisma.$queryRaw<{ property_id: string; activo: boolean; desde: Date }[]>(
        Prisma.sql`SELECT property_id, activo, desde FROM mensajes_prog_pisos`),
      prisma.$queryRaw<{ property_id: string; estado: string; n: bigint; ultimo: Date | null }[]>(Prisma.sql`
        SELECT property_id, estado, count(*) AS n, max(enviado_at) AS ultimo
        FROM mensajes_programados GROUP BY property_id, estado`),
      prisma.$queryRaw<{ ultimo_ok_at: Date | null; detalle: string | null }[]>(Prisma.sql`
        SELECT ultimo_ok_at, detalle FROM agente_latidos WHERE agente = 'sivra_mensajes_prog'`),
    ])

    const act = new Map(activos.map(a => [a.property_id, a]))
    const pisos: EstadoPiso[] = Object.entries(ACCESO).map(([id, p]) => {
      const filas = porPiso.filter(f => f.property_id === id)
      const cuenta = (estado: string) => Number(filas.find(f => f.estado === estado)?.n ?? 0)
      const enviadas = filas.filter(f => f.estado === 'enviado' && f.ultimo)
      const a = act.get(id)
      return {
        propertyId: id,
        nombre: p.nombre,
        activo: !!a?.activo,
        desde: a?.desde ? new Date(a.desde).toISOString() : null,
        enviados: cuenta('enviado'),
        enSombra: cuenta('sombra'),
        fallos: cuenta('fallo'),
        ultimoEnvio: enviadas.length
          ? new Date(Math.max(...enviadas.map(f => new Date(f.ultimo!).getTime()))).toISOString()
          : null,
      }
    })

    return {
      pisos,
      ultimaPasada: latido[0]?.ultimo_ok_at ? new Date(latido[0].ultimo_ok_at).toISOString() : null,
      detallePasada: latido[0]?.detalle ?? null,
      aviso: null,
    }
  } catch (e) {
    // No se devuelve una lista vacía haciéndola pasar por «no hay nada»: eso pintaría los cuatro
    // pisos como si nadie escribiera a nadie, que es justo lo contrario de lo que puede estar pasando.
    return {
      pisos: [],
      ultimaPasada: null,
      detallePasada: null,
      aviso: `No se ha podido leer el estado del ciclo (${String((e as Error)?.message || e).slice(0, 120)}). Esto NO significa que esté parado.`,
    }
  }
}

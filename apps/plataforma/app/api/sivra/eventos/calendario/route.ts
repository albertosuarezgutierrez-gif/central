import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { PRICING_HORIZON_DAYS } from "@/lib/pricing-calendar"
import { calendarioEntre, detalleCalendario } from "@/lib/sivra/eventos-calendario"
import { registrarLatido } from "@/lib/monitoring/latido-escribir"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/sivra/eventos/calendario  (cron diario)
//
// Siembra en `pricing_eventos_auto` las fechas de Sevilla que NO hay que salir a buscar porque se
// saben de antemano: Semana Santa (derivada de la Pascua) y las de tabla (Feria…). El porqué, con
// las cuatro reservas reales que lo destaparon, está en la cabecera de `lib/sivra/eventos-calendario.ts`.
//
// Titular: Semana Santa 2027 no tenía NI UNA FILA en la tabla de eventos, y Busto Reform vendió la
// noche de la Madrugá a 141,00€ nueve meses antes. Ninguna de las cuatro fuentes existentes podía
// haberlo evitado: todas descubren un evento cuando alguien lo publica, y esto no se publica.
//
// 🚨 INERTE POR DEFECTO. Sembrar estas filas SUBE precios publicados, y eso no se hace sin permiso
// explícito de Alberto para ese cambio concreto (regla del repo). Sin `SIVRA_CALENDARIO_ACTIVO=1`
// la ruta calcula y devuelve la PREVISUALIZACIÓN completa —qué fechas y con qué factor— sin tocar
// una sola fila. Con la env a `1`, siembra. La env se pone desde el god-panel → 🔑 Secretos.
//
// Es idempotente: `ON CONFLICT (fuente, nombre, rate_date)` y el nombre es estable, así que correr
// dos veces no duplica ni mueve nada. Y NO pisa a nadie: el motor combina todas las fuentes por
// MAX(factor), de modo que si el agente ya metió la Feria 2027 a 2,50 esto no la cambia.

const ACTIVO = process.env.SIVRA_CALENDARIO_ACTIVO === '1'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const hoy = new Date()
  const desde = hoy.toISOString().slice(0, 10)
  const hasta = new Date(hoy.getTime() + PRICING_HORIZON_DAYS * 86400000).toISOString().slice(0, 10)

  const cal = calendarioEntre(desde, hasta)
  const detalle = detalleCalendario(cal)

  if (!ACTIVO) {
    // Ni `ok:false` ni un 500: no está roto, está esperando permiso. Pero la respuesta tiene que
    // decir en qué estado corre — un preview silencioso se leería como una siembra hecha.
    return NextResponse.json({
      ok: true,
      sembrado: false,
      motivo: "SIVRA_CALENDARIO_ACTIVO no está a 1 — previsualización, no se ha escrito nada",
      ventana: { desde, hasta },
      detalle,
      anios_sin_datos: cal.aniosSinDatos,
      previsualizacion: cal.noches,
    })
  }

  let upserted = 0
  const errores: string[] = []
  for (const n of cal.noches) {
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_eventos_auto (rate_date, nombre, fuente, tipo, factor, estado, confianza, evidencia, updated_at)
        VALUES (${n.fecha}::date, ${n.nombre}, 'calendario', ${n.tipo},
          ${n.factor}::numeric, 'confirmado', 1.0::numeric,
          ${n.derivado ? 'derivado de la Pascua' : 'fecha oficial de tabla'}, now())
        ON CONFLICT (fuente, nombre, rate_date) DO UPDATE
          SET factor = EXCLUDED.factor, tipo = EXCLUDED.tipo, estado = 'confirmado', updated_at = now()
      `)
      upserted++
    } catch (e) {
      // Mismo criterio que `/eventos/sync`: si el índice único que sostiene el ON CONFLICT
      // desapareciera, TODOS fallarían y la pasada diría `upserted: 0` sin un solo mensaje.
      errores.push(`${n.fecha}: ${String(e).slice(0, 100)}`)
    }
  }

  const ok = errores.length === 0
  await registrarLatido(
    'sivra_eventos_calendario', ok,
    `${detalle} · ${upserted} sembradas${errores.length ? ` · ${errores.length} error(es)` : ''}`,
  ).catch(() => {})

  return NextResponse.json({
    ok,
    sembrado: true,
    ventana: { desde, hasta },
    detalle,
    upserted,
    anios_sin_datos: cal.aniosSinDatos,
    errores: errores.slice(0, 10),
  })
}

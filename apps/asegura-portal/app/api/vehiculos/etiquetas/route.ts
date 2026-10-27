import { NextResponse } from 'next/server'

import { MAX_ETIQUETAS_LOTE, candidatosDelLote, instanteDelLote } from '@central/module-seguros-portal'

import { enlaceDeVehiculo } from '@/lib/enlace-hoja'
import { asegurarVehiculosDeFlota } from '@/lib/flota'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'
import { puedeGestionarVehiculos } from '@/lib/vehiculo-acceso'
import { crearQrVehiculo, estadoQrEmpresa } from '@/lib/vehiculo-qr'

import { ESTADO_HTTP_FLOTA } from '../../flota/estado-http'
import { DATOS_INVALIDOS, SIN_ENLACE, SIN_SESION, cuerpoJson } from '../comun'

export const runtime = 'nodejs'

/**
 * IMPRESIÓN EN LOTE de las etiquetas de la flota de una sociedad: `{ empresaId, reimprimir }`.
 *
 * Por defecto solo los vehículos SIN etiqueta viva: reimprimir una anula la pegada (el papel deja de valer), así
 * que hacerlo con toda la flota exige `reimprimir: true` explícito — la pantalla lo pregunta y lo dice. Los
 * vehículos sin matrícula se cuentan (`sinMatricula`), no se inventan. Cada bien pasa por la frontera
 * (`puedeGestionarVehiculos`) antes de crear nada.
 */
export async function POST(req: Request) {
  if (enlaceDeVehiculo('x') === null) return NextResponse.json(SIN_ENLACE, { status: 503 })
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json(SIN_SESION, { status: 401 })
  }
  if (!(await puertaDeSesion('flota', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const c = await cuerpoJson(req)
  if (c === null || (c.reimprimir !== undefined && typeof c.reimprimir !== 'boolean')) {
    return NextResponse.json(DATOS_INVALIDOS, { status: 400 })
  }
  const reimprimir = c.reimprimir === true
  // 🚨 Reimprimir en VARIAS pasadas (más de MAX_ETIQUETAS_LOTE): el cliente manda el instante en que empezó el lote
  // y fuera queda TODO lo que se creó desde entonces. Sin esto, la segunda pasada volvía a coger los mismos 100 y
  // anulaba las etiquetas que se acababan de imprimir. Sin `inicioLote` (primera pasada) vale el instante de ahora.
  const inicioLote = instanteDelLote(c.inicioLote)
  if (inicioLote === null) return NextResponse.json(DATOS_INVALIDOS, { status: 400 })

  const r = await asegurarVehiculosDeFlota({ identidadId: identidad.id, empresaId: c.empresaId, polizaIds: 'todos' })
  if (!r.ok) return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP_FLOTA[r.error] })
  const estado = await estadoQrEmpresa(identidad.id, c.empresaId)

  // Un vehículo con dos pólizas (cambio de compañía) es UNA etiqueta.
  const porBien = new Map(r.vehiculos.map((v) => [v.bienId, v]))
  const candidatos = candidatosDelLote([...porBien.values()], (v) => estado?.porClave.get(v.matricula)?.qr?.creadoEn ?? null, {
    reimprimir,
    inicioLote,
  })
  const lote = candidatos.slice(0, MAX_ETIQUETAS_LOTE)
  const gestion = await puedeGestionarVehiculos(identidad.id, lote.map((v) => v.bienId))

  const etiquetas: { bienId: string; etiqueta: string; matricula: string; enlace: string }[] = []
  let fallidas = 0
  for (const v of lote) {
    const g = gestion.get(v.bienId)
    if (!g) continue
    const q = await crearQrVehiculo(identidad.id, g)
    const enlace = q.ok ? enlaceDeVehiculo(q.token) : null
    if (enlace === null) {
      fallidas++
      continue
    }
    etiquetas.push({ bienId: v.bienId, etiqueta: v.etiqueta, matricula: v.matricula, enlace })
  }
  return NextResponse.json(
    {
      etiquetas,
      yaTenian: porBien.size - candidatos.length,
      sinMatricula: r.sinMatricula,
      pendientes: candidatos.length - lote.length,
      fallidas,
      // El cliente lo devuelve en la siguiente pasada del mismo lote.
      inicioLote: inicioLote.toISOString(),
    },
    { status: 201 },
  )
}


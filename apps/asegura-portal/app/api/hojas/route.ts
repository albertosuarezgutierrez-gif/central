import { NextResponse } from 'next/server'

import { normalizarNombreHoja, seleccionHoja } from '@central/module-seguros-portal'

import { crearHojaDeSesion } from '@/lib/hojas'
import { enlaceDeHoja } from '@/lib/enlace-hoja'

export const runtime = 'nodejs'

/**
 * Crear una hoja para imprimir.
 *
 * 🚨 La identidad sale de la COOKIE, nunca del cuerpo. Y los ids que manda el
 * formulario no se insertan: `crearHoja` parte de lo que esa identidad puede
 * ver y la selección solo filtra (ver `lib/hojas.ts`).
 *
 * 🚨 `sin_enlace` (503) NO escribe la fila, igual que en las invitaciones: sin
 * `PORTAL_PUBLIC_URL` en https no hay a dónde apuntar el QR, y una hoja cuyo
 * enlace no se puede formar es un papel que no lleva a ningún sitio. No se
 * inventa un dominio.
 */
export async function POST(req: Request) {
  const base = enlaceDeHoja('x')
  if (base === null) return NextResponse.json({ error: 'sin_enlace' }, { status: 503 })

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }
  const c = cuerpo as { todas?: unknown; polizaIds?: unknown; nombre?: unknown }

  const { sel, error } = seleccionHoja(c.todas, c.polizaIds)
  if (sel === null) return NextResponse.json({ error }, { status: 400 })

  const r = await crearHojaDeSesion(sel, normalizarNombreHoja(c.nombre))
  if (r === null) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === 'demasiadas' ? 429 : 400 })

  // El token EN CLARO solo sale aquí, para que la pantalla pueda pintar el QR y
  // el enlace. No se guarda en ningún sitio: en la BD vive su hash.
  return NextResponse.json({ id: r.id, enlace: enlaceDeHoja(r.token) }, { status: 201 })
}

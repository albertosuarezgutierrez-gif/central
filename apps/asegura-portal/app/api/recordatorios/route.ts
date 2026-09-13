import { NextResponse } from 'next/server'

import { normalizarRecordatorio, type EntradaRecordatorio } from '@central/module-seguros-portal'

import { carteraDeIdentidad } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import { crearRecordatorio } from '@/lib/recordatorios'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * Alta de un recordatorio PROPIO (ITV, carnet, caldera… o texto libre), y
 * opcionalmente colgado de UNA póliza (para poder decir «ITV del Ibiza» en
 * vez de «ITV» a secas — Alberto, 13/09/2026: «lo lógico es asignarlo al bien
 * asegurado»). Mismo orden que `POST /api/siniestros`, y por la misma razón:
 *
 *   1. identidad (cookie)  → sin ella no hay a quién colgarle nada.
 *   2. validación (módulo puro) → todos los errores a la vez, uno por campo.
 *   3. PERTENENCIA de la póliza → el paso que impide colgar un recordatorio
 *      de la póliza de OTRO mandando su uuid en el cuerpo.
 *   4. escritura.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }

  const entrada: EntradaRecordatorio = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as EntradaRecordatorio) : {}
  const normalizado = normalizarRecordatorio(entrada)
  if (!normalizado.ok) return NextResponse.json({ error: normalizado.error }, { status: 400 })
  const valor = normalizado.datos

  // ─── 3. Pertenencia ────────────────────────────────────────────────────────
  // «No existe» y «no es tuya» se responden IGUAL a propósito: distinguirlas
  // convierte la ruta en un oráculo de uuids válidos de la cartera ajena.
  if (valor.polizaDeclaradaId !== null) {
    const propia = await prisma.portalPolizaDeclarada.findFirst({
      where: { id: valor.polizaDeclaradaId, identidadId: identidad.id },
      select: { id: true },
    })
    if (!propia) return NextResponse.json({ error: 'poliza_no_tuya' }, { status: 403 })
  }

  if (valor.polizaId !== null) {
    // Igual que en `/api/siniestros`: cuentan las propias y las que otro le ha
    // autorizado a ver — si puede verla en su bóveda, puede ponerle un aviso.
    const cartera = await carteraDeIdentidad(identidad.id)
    const suyas = new Set([...cartera.propias, ...cartera.autorizadas].flatMap((t) => t.polizas.map((p) => p.id)))
    if (!suyas.has(valor.polizaId)) return NextResponse.json({ error: 'poliza_no_tuya' }, { status: 403 })
  }

  const { id } = await crearRecordatorio(identidad.id, valor)
  return NextResponse.json({ id }, { status: 201 })
}

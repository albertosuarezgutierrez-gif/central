import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { operadorAutorizado } from '@/lib/operador'
import { polizasEnVigorPorCliente } from '@/lib/portal-modulos-cartera'
import { vistaSolicitud } from '@/lib/portal-modulos-operador'
import { prisma } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

// GET /api/operador/portal-modulos[?todas=1]
//
// La cola de «Herramientas» que los clientes piden desde el portal (`seguros.portal_modulo`,
// `apps/asegura-portal/prisma/sql/2026-10-22_portal_modulos.sql`). Por defecto solo las
// `solicitado`, de la más antigua a la más nueva. SOLO LECTURA (Fase 0): activar/retirar se hace a
// mano; cuando haya pantalla en plataforma (`/correduria`), la escritura entra por aquí con
// `historial_interno`.
//
// `nombre` es lo que la persona tecleó al entrar al portal (sin comprobar); `cliente` es la ficha
// vinculada (la primera por antigüedad), o `null` = sin vínculo. Varias fichas → `fichas` lo dice.
// Lectura cruda a propósito: un solo fichero, sin modelo nuevo en `asegura.prisma`.
type Fila = {
  id: string
  modulo: string
  estado: string
  solicitado_en: Date
  activado_en: Date | null
  retirado_en: Date | null
  version_condiciones: string | null
  origen: string
  identidad_id: string
  nombre: string | null
  cliente_id: string | null
  cliente: string | null
  fichas: bigint
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })

  const todas = new URL(req.url).searchParams.get('todas') === '1'
  try {
    // Ámbito: las tablas del portal no llevan `correduria_id`; se acota por la ficha vinculada
    // (`clientes.correduria_id`). Sin vínculo (`c.id IS NULL`) no hay correduría que comparar: se
    // muestra, porque es justo lo que el operador tiene que resolver.
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    const filas = await prisma.$queryRaw<Fila[]>`
      SELECT m.id, m.modulo, m.estado, m.solicitado_en, m.activado_en, m.retirado_en,
             m.version_condiciones, m.origen, m.identidad_id, i.nombre,
             v.cliente_id, NULLIF(TRIM(CONCAT_WS(' ', c.nombre, c.apellidos)), '') AS cliente,
             (SELECT count(*) FROM seguros.portal_vinculo v2 WHERE v2.identidad_id = m.identidad_id) AS fichas
        FROM seguros.portal_modulo m
        JOIN seguros.portal_identidad i ON i.id = m.identidad_id
        LEFT JOIN LATERAL (
          SELECT pv.cliente_id FROM seguros.portal_vinculo pv
           WHERE pv.identidad_id = m.identidad_id
           ORDER BY pv.creado_en ASC LIMIT 1
        ) v ON true
        LEFT JOIN seguros.clientes c ON c.id = v.cliente_id
       WHERE (${todas} OR m.estado = 'solicitado')
         AND (c.id IS NULL OR c.correduria_id = ${correduria.id}::uuid)
       ORDER BY m.solicitado_en ASC
       LIMIT 500`
    // Campos AÑADIDOS (el contrato anterior no cambia): `moduloNombre`, `puedeActivar`, `motivoNoActivar` para la cola
    // «Solicitudes del portal» de plataforma. Solo se cuentan pólizas de las solicitadas con ficha; si el conteo falla,
    // `polizasEnVigor` = null y el botón sale desactivado con «no se ha podido comprobar», nunca «0».
    const conteo = await polizasEnVigorPorCliente(
      correduria.id,
      filas.filter((f) => f.estado === 'solicitado' && f.cliente_id).map((f) => f.cliente_id as string),
    )
    return NextResponse.json({
      estado: 'ok',
      resumen: { pendientes: filas.filter((f) => f.estado === 'solicitado').length },
      filas: filas.map((f) => ({
        ...f,
        fichas: Number(f.fichas),
        ...vistaSolicitud(f.modulo, f.cliente_id, f.cliente_id ? (conteo ? (conteo.get(f.cliente_id) ?? 0) : null) : null),
      })),
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/portal-modulos', e) })
  }
}

// Sugerencia de relaciones YA CONOCIDAS (12/09/2026) — la pieza de lectura que
// alimenta la tarjeta de «pedir acceso» en `/autorizaciones`.
//
// Reusa `relacionesSugeribles()` de `@central/module-seguros-portal`, pero esa
// función pura necesita un `RelacionFila.puedeVerPolizas` — y esta app NO
// puede leer esa columna: se le revocó el `GRANT` el 03/09/2026 porque el
// booleano del CRM no demostraba ningún consentimiento (ver
// `lib/autorizaciones.ts`). Aquí `puedeVerPolizas` se CALCULA contra el
// mecanismo real de acceso — `portal_vinculo` (mis fichas) y
// `portal_autorizacion` vigente (lo que me han concedido) — nunca contra la
// columna vieja, que ni siquiera está en el modelo Prisma de esta app.
import { estadoAutorizacion, relacionesSugeribles, type SugerenciaRelacion } from '@central/module-seguros-portal'
import type { RelacionFila } from '@central/module-seguros'

import { prisma } from './db'
import { getIdentidad } from './session'

export type SugerenciaVista = SugerenciaRelacion & { relacionadoNombre: string | null }

/**
 * Las sugerencias de «pedir acceso» para esta identidad: relaciones ya
 * cargadas por Alberto en `cliente_relaciones` sobre sus propias fichas, con
 * un tipo que habilita autorizar y que todavía no puede ver.
 *
 * `[]` cuando no hay ficha propia (nada que sugerir) o ninguna relación
 * habilitante — nunca un error de adorno: sin `try/catch`, si la BD falla que
 * suba, como el resto de lecturas de esta app.
 */
export async function sugerenciasDeIdentidad(identidadId: string): Promise<SugerenciaVista[]> {
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true },
  })
  const misIds = vinculos.map((v) => v.clienteId)
  if (misIds.length === 0) return []
  const misIdsSet = new Set(misIds)

  const [relaciones, autorizaciones] = await Promise.all([
    prisma.clienteRelacion.findMany({
      where: { OR: [{ clienteAId: { in: misIds } }, { clienteBId: { in: misIds } }] },
      select: { id: true, clienteAId: true, clienteBId: true, tipoRelacion: true },
    }),
    // Quién me autoriza YA, vigente, para no sugerir pedir lo que ya tengo.
    // `misIdsSet` cubre la ficha; `autorizadoIdentidadId` cubre la identidad
    // sin ficha propia (invitada) — las dos son «a mí me alcanza».
    prisma.portalAutorizacion.findMany({
      where: {
        OR: [{ autorizadoClienteId: { in: misIds } }, { autorizadoIdentidadId: identidadId }],
        revocadoEn: null,
      },
      select: { otorganteClienteId: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
    }),
  ])
  if (relaciones.length === 0) return []

  const hoy = new Date()
  const yaAutorizanA = new Set(
    autorizaciones
      .filter((a) => estadoAutorizacion(a, hoy) === 'vigente')
      .map((a) => a.otorganteClienteId),
  )

  // `puedeVerPolizas` de la fila A→B se calcula, nunca se lee: es «A ya me deja
  // ver sus pólizas» cuando B es mía — la misma semántica direccional que
  // tenía el booleano del CRM, pero con la fuente de verdad correcta.
  //
  // 🚨 Cuando la mía es A (no B), esta función NO sabe si A autoriza a B —
  // eso exigiría mirar autorizaciones DE A HACIA B, que no se han pedido
  // porque `relacionesSugeribles()` nunca las lee (solo consume `puedeVer`,
  // que sale de las filas donde B es la ficha consultada). Se deja en
  // `false` a propósito: calcularlo con `yaAutorizanA` (que solo sabe quién
  // me autoriza A MÍ) daría un valor con FORMA de dato y sin ninguna
  // relación con lo que la fila dice — el mismo «no lo sé» disfrazado de
  // valor que la regla de la casa prohíbe.
  const filas: RelacionFila[] = relaciones.map((r) => ({
    id: r.id,
    clienteAId: r.clienteAId,
    clienteBId: r.clienteBId,
    tipo: r.tipoRelacion,
    puedeVerPolizas: misIdsSet.has(r.clienteBId) ? yaAutorizanA.has(r.clienteAId) : false,
    observaciones: null,
  }))

  const vistas = new Map<string, SugerenciaRelacion>()
  for (const miId of misIds) {
    for (const s of relacionesSugeribles(filas, miId)) {
      // La misma persona puede salir sugerida desde más de una ficha mía
      // (p. ej. dos fichas propias con el mismo pariente): se queda la primera.
      if (!misIdsSet.has(s.relacionadoId) && !vistas.has(s.relacionadoId)) vistas.set(s.relacionadoId, s)
    }
  }
  if (vistas.size === 0) return []

  const nombres = await prisma.cliente.findMany({
    where: { id: { in: [...vistas.keys()] }, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true },
  })
  const nombrePor = new Map(nombres.map((c) => [c.id, `${c.nombre} ${c.apellidos}`.trim()]))

  return [...vistas.values()].map((s) => ({ ...s, relacionadoNombre: nombrePor.get(s.relacionadoId) ?? null }))
}

/** Igual que `sugerenciasDeIdentidad`, abriendo la puerta aquí. `null` = no hay sesión. */
export async function sugerenciasDeSesion(): Promise<SugerenciaVista[] | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return sugerenciasDeIdentidad(identidad.id)
}

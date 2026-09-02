// Fase 4 — la costura identidad ↔ ficha de la cartera (`seguros.portal_vinculo`).
//
// Se llama UNA vez por canje de código, desde `app/api/acceso/verificar/route.ts`,
// porque es el único momento en que el portal tiene el email EN CLARO: lo que
// guarda en `portal_canal` es un hash con pimienta propia (`hashCanal`), que no
// sirve para el índice ciego de la cartera (HMAC con `PII_LOOKUP_KEY`, la misma
// clave que usa `apps/asegura` para escribir `clientes.email_lookup_hash`).
//
// Reglas (spec §vinculación, 01/09/2026):
// - Solo el EMAIL vincula solo: 0 duplicados entre clientes distintos. Un móvil
//   identifica un HOGAR (740 números compartidos por 1.599 fichas) y NO vincula.
// - Exactamente UNA ficha → vínculo `gestionar`. Varias → `ambiguo` y NO se
//   vincula: no se adivina, lo revisa el corredor.
// - Sin `PII_LOOKUP_KEY` no hay hash y no se vincula a ciegas (`sin_clave`).
// - El resultado NUNCA bloquea el login: la identidad ya existe; esto solo
//   decide si además tiene cartera detrás.
// - Ningún email ni hash sale por un log. El motivo de un fallo de BD, sí.
import { computeEmailLookupHash } from '@central/module-seguros-pii'

import { prisma } from './db'

export type EstadoVinculo = 'ok' | 'ya_vinculada' | 'sin_ficha' | 'ambiguo' | 'sin_clave' | 'error'

export type ResultadoVinculo = { estado: EstadoVinculo; clienteId?: string }

/** Nivel sobre lo PROPIO: el tomador gestiona sus pólizas (spec, niveles). */
const NIVEL_TOMADOR = 'gestionar'

export async function vincularIdentidad(
  identidadId: string,
  destino: string,
  tipo: 'email' | 'whatsapp' = 'email',
): Promise<ResultadoVinculo> {
  // Un teléfono es un hogar, no una persona: no se busca siquiera. Cuando el
  // spec fije cómo se desambigua (DNI verificado, elección revisada por el
  // corredor) entrará aquí como rama propia; hoy es `sin_ficha` a propósito.
  if (tipo !== 'email') return { estado: 'sin_ficha' }

  let hash: string | null
  try {
    hash = computeEmailLookupHash(destino)
  } catch (e) {
    // En producción sin `PII_LOOKUP_KEY` el módulo lanza (fail-fast). Aquí no
    // puede tumbar el login: se dice «no se ha podido comprobar» y se sigue.
    console.error('[portal/vinculo] no se pudo calcular el índice ciego:', e instanceof Error ? e.message : e)
    return { estado: 'sin_clave' }
  }
  if (!hash) return { estado: 'sin_clave' }

  try {
    // Dos sitios donde puede vivir el email de una ficha: la columna principal
    // de `clientes` y la tabla `cliente_emails` (varios emails por ficha).
    const [directas, secundarias] = await Promise.all([
      prisma.cliente.findMany({
        where: { emailLookupHash: hash, mergedIntoClienteId: null },
        select: { id: true, correduriaId: true },
      }),
      prisma.clienteEmail.findMany({
        where: { emailLookupHash: hash },
        select: { clienteId: true },
      }),
    ])

    const candidatos = new Map<string, string>() // clienteId → correduriaId
    for (const c of directas) candidatos.set(c.id, c.correduriaId)

    const idsSecundarios = secundarias.map((e) => e.clienteId).filter((id) => !candidatos.has(id))
    if (idsSecundarios.length > 0) {
      // Las fichas fusionadas (lápida `merged_into_cliente_id`) se descartan:
      // la ficha viva es la que absorbió.
      const vivas = await prisma.cliente.findMany({
        where: { id: { in: idsSecundarios }, mergedIntoClienteId: null },
        select: { id: true, correduriaId: true },
      })
      for (const c of vivas) candidatos.set(c.id, c.correduriaId)
    }

    if (candidatos.size === 0) return { estado: 'sin_ficha' }
    if (candidatos.size > 1) return { estado: 'ambiguo' }

    const [clienteId, correduriaId] = [...candidatos.entries()][0]

    const existente = await prisma.portalVinculo.findUnique({
      where: { identidadId_clienteId: { identidadId, clienteId } },
      select: { id: true },
    })
    if (existente) return { estado: 'ya_vinculada', clienteId }

    await prisma.portalVinculo.create({
      data: { identidadId, correduriaId, clienteId, nivel: NIVEL_TOMADOR, origen: 'email_hash' },
    })
    return { estado: 'ok', clienteId }
  } catch (e) {
    console.error('[portal/vinculo] fallo de BD al vincular:', e instanceof Error ? e.message : e)
    return { estado: 'error' }
  }
}

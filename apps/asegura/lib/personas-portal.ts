/**
 * Personas de UNA póliza y terceros de sus siniestros, para el PORTAL del cliente (04/10/2026,
 * datos de CIMA de asegura#880). Lo sirve `GET /api/portal/personas-poliza` (puente estrecho).
 *
 * ─── Por qué aquí y no en el portal ──────────────────────────────────────────
 * Las figuras van cifradas (`v1:`) dentro de `datos_especificos` y `cima_extra`, y el portal no
 * tiene `PII_ENCRYPTION_KEY` a propósito (ver `lib/contacto-portal.ts`). Se descifra AQUÍ y sale
 * ya filtrado por la lista blanca de `@central/module-seguros-portal` (`personasParaCliente`,
 * `tercerosParaCliente`): lo que no está en ella no cruza el puente.
 *
 * ─── El aislamiento (lo da el CÓDIGO) ────────────────────────────────────────
 * 🚨 No acepta `clienteId`. Las fichas salen de `portal_vinculo` de la identidad, y la póliza solo
 * se abre si es VIVA, de esta correduría, sin fusionar y la abre la MISMA regla que la cartera del
 * portal (`puenteAbrePoliza`: tomador propio o `figurasEnPolizas`). Si no, `no_visible` (404, nunca 403: no se
 * confirma que exista). Con el secreto en la mano no se llega a la póliza de otro: solo a las de la
 * identidad que se nombra, como el resto del puente.
 */
import { esCarteraViva } from '@central/module-seguros'
import {
  personasParaCliente,
  tercerosParaCliente,
  type FiguraAjenaCliente,
  type FiguraPropiaCliente,
  type TerceroCliente,
} from '@central/module-seguros-portal'
import { decryptField } from '@central/module-seguros-pii'

import { prismaAsegura } from './asegura-db'
import { tercerosCimaCrudos, tercerosCimaDe } from './cartera-siniestros'
import { entradasDePoliza, puenteAbrePoliza } from './personas-portal-entradas'

export type PersonasPolizaPortal =
  | {
      estado: 'ok'
      /** Sus figuras en la póliza, completas. `null` = la póliza no trae figuras de CIMA (anterior a #880). */
      propias: FiguraPropiaCliente[] | null
      /** Las demás personas (solo si es el tomador): papel y nombre. */
      otras: FiguraAjenaCliente[]
      /** Terceros de CIMA por siniestro de la póliza. `null` = no se han podido leer. */
      siniestros: { siniestroId: string; terceros: TerceroCliente[] }[] | null
    }
  | { estado: 'no_visible' }
  | { estado: 'error'; causa: string }

/** Descifra; si no abre o no hay clave, `null` (nunca el `v1:`). */
function abrir(v: unknown): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    const c = decryptField(v)
    return typeof c === 'string' && !c.startsWith('v1:') ? c : null
  } catch {
    return null
  }
}
const descifrar = (v: string): string | null => abrir(v)

export async function personasPolizaPortal(
  correduriaId: string,
  identidadId: string,
  polizaId: string,
): Promise<PersonasPolizaPortal> {
  const db = prismaAsegura()
  let vinculos: { clienteId: string; nivel: string }[]
  try {
    vinculos = await db.portalVinculo.findMany({ where: { identidadId, correduriaId }, select: { clienteId: true, nivel: true } })
  } catch (e) {
    console.error('[personas-portal] vínculos ilegibles:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'vinculos_ilegibles' }
  }
  const fichas = vinculos.map((v) => v.clienteId)
  if (fichas.length === 0) return { estado: 'no_visible' }

  const poliza = await db.poliza.findFirst({
    where: { id: polizaId, correduriaId, mergedIntoPolizaId: null },
    select: { id: true, clienteId: true, importRef: true, eiacXmlHash: true, datosEspecificos: true },
  })
  // El volcado histórico no se enseña en el portal: tampoco sus personas.
  if (!poliza || !esCarteraViva(poliza)) return { estado: 'no_visible' }
  // Solo las filas de SUS fichas en esta póliza (misma frontera que `carteraDeIdentidad`).
  const filas = await db.polizaInterviniente.findMany({
    where: { polizaId: poliza.id, clienteId: { in: fichas } },
    select: { polizaId: true, clienteId: true, rol: true },
  })
  // La MISMA regla que la cartera del portal (`puenteAbrePoliza` → `figurasEnPolizas`): lo que la
  // cartera no abre, el puente tampoco (404, nunca 403).
  if (!puenteAbrePoliza({ poliza, filas: filas.map((f) => ({ ...f, rol: String(f.rol) })), vinculos })) return { estado: 'no_visible' }

  const tomadorEsPropio = fichas.includes(poliza.clienteId)
  const propiasFichas = await db.cliente.findMany({
    where: { id: { in: fichas }, correduriaId },
    select: { dni: true },
  })
  const documentosPropios = propiasFichas.map((c) => abrir(c.dni))

  const entradas = entradasDePoliza(poliza.datosEspecificos, descifrar)
  const reparto = entradas === null ? null : personasParaCliente(entradas, { tomadorEsPropio, documentosPropios })

  const siniestros = await db.siniestro.findMany({
    where: { correduriaId, polizaId: poliza.id, fusionadoEnSiniestroId: null },
    select: { id: true },
  })
  const crudos = await tercerosCimaCrudos(correduriaId, siniestros.map((s) => s.id))
  return {
    estado: 'ok',
    propias: reparto?.propias ?? null,
    otras: reparto?.otras ?? [],
    siniestros:
      crudos === null
        ? null
        : siniestros.flatMap((s) => {
            const t = tercerosCimaDe(crudos.get(s.id))
            const filtrados = tercerosParaCliente(t ?? [])
            return filtrados.length > 0 ? [{ siniestroId: s.id, terceros: filtrados }] : []
          }),
  }
}

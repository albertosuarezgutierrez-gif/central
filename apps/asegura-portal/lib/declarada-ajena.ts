/**
 * Las pólizas AÑADIDAS por un titular, vistas desde quien tiene acceso a su
 * ficha (12/10/2026, decisión de Alberto: tres niveles — Consulta, Gestión, Total).
 *
 * Caso real: Alberto tiene acceso total de su mujer y no podía abrir ni editar la
 * póliza que ella añadió en su portal. La fila es de SU identidad
 * (`portal_poliza_declarada.identidad_id`), así que todo lo de aquí resuelve una
 * sola pregunta: **¿de qué identidad es esta fila, para esta petición?** — y la
 * ruta escribe luego con esa identidad DENTRO del `where`, como siempre.
 *
 * 🔒 Fail-closed de punta a punta:
 *   - El acceso se lee de `carteraDeIdentidad` (la MISMA lectura que pinta la
 *     bóveda): el id de la URL no consulta nada, se busca DENTRO de las
 *     declaradas que ya se le sirven a esta identidad.
 *   - Lo que se puede HACER sale de la concesión sobre la ficha ENTERA
 *     (`autorizacion.ficha`), nunca de una concesión suelta ni de la empresa del
 *     dueño (`via: 'dueno'` no sirve declaradas).
 *   - La titular se vuelve a comprobar con `titularesDeFichasEnteras` (regla pura
 *     `identidadesTitulares`) y la fila se relee con `identidadId IN titulares`.
 *   - La decisión final es `duenaDeDeclarada` (pura, con test por nivel). Lo que
 *     no pasa es `null` → la ruta responde 404, nunca 403.
 *
 * Límites duros que esto NO abre nunca: autorizar a terceros y tocar la cartera
 * de CIMA (este fichero solo conoce `portal_poliza_declarada`).
 */
import {
  capacidadesDeAlcances,
  duenaDeDeclarada,
  type AccionDeclarada,
  type Capacidades,
} from '@central/module-seguros-portal'

import { carteraDeIdentidad, titularesDeFichasEnteras } from './cartera-lectura'
import { prisma } from './db'
import { TITULAR_TIPO_VISIBLE_A_TERCERO } from './declaradas-de-titular'
import { DECLARADA_NO_ELIMINADA } from './declaradas-eliminadas'

export type AccesoDeclarada = {
  /** La identidad DUEÑA de la fila: la de quien mira, o la del titular. */
  identidadId: string
  propia: boolean
  /** Solo en la vía ajena: qué puede hacer quien mira, y con qué concesiones. */
  capacidades: Capacidades | null
  autorizacionIds: string[]
}

type Ajena = {
  titularIdentidadId: string
  clienteId: string
  capacidades: Capacidades
  autorizacionIds: string[]
}

/**
 * Busca la declarada `declaradaId` entre las que esta identidad ve de un titular.
 * `null` = no se le sirve (no existe, es de otro, o la concesión no es de ficha entera).
 */
async function declaradaAjena(identidadId: string, declaradaId: string): Promise<Ajena | null> {
  const cartera = await carteraDeIdentidad(identidadId)
  for (const t of cartera.autorizadas) {
    if (t.autorizacion?.via === 'dueno') continue
    const ficha = t.autorizacion?.ficha
    if (ficha === undefined || ficha.alcances.length === 0) continue
    if (!t.declaradas?.some((d) => d.id === declaradaId)) continue
    const titulares = await titularesDeFichasEnteras([t.clienteId], identidadId)
    const ids = [...titulares].filter(([, c]) => c === t.clienteId).map(([i]) => i)
    if (ids.length === 0) return null
    const fila = await prisma.portalPolizaDeclarada.findFirst({
      // Una que el titular QUITÓ (borrado lógico) no la toca un tercero: solo él la restaura.
      where: { id: declaradaId, identidadId: { in: ids }, titularTipo: TITULAR_TIPO_VISIBLE_A_TERCERO, ...DECLARADA_NO_ELIMINADA },
      select: { identidadId: true },
    })
    if (fila === null) return null
    return {
      titularIdentidadId: fila.identidadId,
      clienteId: t.clienteId,
      capacidades: capacidadesDeAlcances(ficha.alcances, t.tipoPersona),
      autorizacionIds: ficha.ids,
    }
  }
  return null
}

/**
 * De qué identidad es la declarada `declaradaId` para que quien mira haga
 * `accion`, o `null` (= 404). La propia manda: si es suya, ni se mira la cartera.
 */
export async function accesoADeclarada(
  identidadId: string,
  declaradaId: string,
  accion: AccionDeclarada,
): Promise<AccesoDeclarada | null> {
  // Sin las QUITADAS (borrado lógico): una eliminada no se ve, corrige, quita ni recibe partes;
  // solo vuelve por `POST /api/polizas/[id]/restaurar`, que no pasa por aquí.
  const propia = await prisma.portalPolizaDeclarada.findFirst({
    where: { id: declaradaId, identidadId, ...DECLARADA_NO_ELIMINADA },
    select: { id: true },
  })
  const ajena = propia === null ? await declaradaAjena(identidadId, declaradaId) : null
  const duena = duenaDeDeclarada({
    identidadQueMira: identidadId,
    propia: propia !== null,
    ajena: ajena === null ? null : { titularIdentidadId: ajena.titularIdentidadId, capacidades: ajena.capacidades },
    accion,
  })
  if (duena === null) return null
  return {
    identidadId: duena.identidadId,
    propia: duena.propia,
    capacidades: duena.propia ? null : (ajena?.capacidades ?? null),
    autorizacionIds: duena.propia ? [] : (ajena?.autorizacionIds ?? []),
  }
}

/**
 * La identidad del titular de la ficha `clienteId` para AÑADIR una póliza en su
 * nombre, o `null`. Solo con Total sobre la ficha entera, y solo si la titular
 * es UNA identidad (con dos no se sabe en qué bóveda escribir: fail-closed).
 */
export async function titularParaAnadir(
  identidadId: string,
  clienteId: string,
): Promise<{ identidadId: string; autorizacionIds: string[] } | null> {
  const cartera = await carteraDeIdentidad(identidadId)
  const t = cartera.autorizadas.find((x) => x.clienteId === clienteId && x.autorizacion?.via !== 'dueno')
  const ficha = t?.autorizacion?.ficha
  if (t === undefined || ficha === undefined) return null
  if (!capacidadesDeAlcances(ficha.alcances, t.tipoPersona).anadirDeclaradas) return null
  const titulares = await titularesDeFichasEnteras([clienteId], identidadId)
  const ids = [...titulares].filter(([, c]) => c === clienteId).map(([i]) => i)
  if (ids.length !== 1 || ids[0] === identidadId) return null
  return { identidadId: ids[0]!, autorizacionIds: ficha.ids }
}

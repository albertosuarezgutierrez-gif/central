'use server'

// Acción de servidor de la pantalla del riesgo: leer la ficha de UNA figura para editarla en el modal
// «Editar datos» (EditarCliente + EditarCarnets, los mismos de la ficha del cliente). Solo lectura.
// El DNI sale enmascarado (regla 4): la ficha ya lo trae así del puerto.

import { fichaAsegura, type CarnetFicha } from '@/lib/ficha-asegura'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'
import type { IdentidadFicha } from '@/lib/cliente-edicion-asegura'
import type { DocumentoResumen } from '@central/module-seguros'

export type FichaParaEditar =
  | {
      estado: 'ok'
      nombre: string
      identidad: IdentidadFicha | null
      documentos: DocumentoResumen[] | null
      /** `null` = asegura no manda los carnés: sin saber qué hay, no se ofrece editarlos. */
      carnets: CarnetFicha[] | null
      fechaCarnetPoliza: string | null
    }
  | { estado: 'error'; mensaje: string }

/**
 * La ficha de una figura del riesgo. Solo se sirve si esa ficha ES una de las personas de ESTE
 * riesgo (cliente de la oportunidad o figura asignada): el id no es un pase para leer otra ficha.
 */
export async function pedirFichaParaEditar(entrada: { oportunidadId: string; clienteId: string }): Promise<FichaParaEditar> {
  const r = await riesgoAsegura(entrada.oportunidadId).catch(() => null)
  const l = r ? interpretarRiesgo(r.status, r.json) : null
  if (!l || l.estado !== 'ok') return { estado: 'error', mensaje: 'No se ha podido comprobar el riesgo.' }
  const esDelRiesgo = l.riesgo.oportunidad.clienteId === entrada.clienteId || l.riesgo.figuras.some((f) => f.clienteId === entrada.clienteId)
  if (!esDelRiesgo) return { estado: 'error', mensaje: 'Esa persona no es una figura de este riesgo.' }
  const f = await fichaAsegura(entrada.clienteId)
  if (f.estado === 'sin_configurar') return { estado: 'error', mensaje: 'El puerto con asegura no está configurado.' }
  if (f.estado === 'no_encontrado') return { estado: 'error', mensaje: 'La ficha no existe.' }
  if (f.estado !== 'ok') return { estado: 'error', mensaje: `No se ha podido leer la ficha (${f.motivo}).` }
  return {
    estado: 'ok',
    nombre: f.ficha.nombre,
    identidad: f.ficha.identidad,
    documentos: f.ficha.documentos,
    carnets: f.ficha.carnets,
    fechaCarnetPoliza: f.ficha.dePolizas?.fechaCarnet ?? null,
  }
}

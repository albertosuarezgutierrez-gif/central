// Servidor: lee el riesgo cuando una pantalla de pedir precio se abre como VARIANTE
// (`?oportunidad=<id>[&tarificacion=<id>]`) y pinta su franja «Variante del riesgo».
// Si el riesgo no se puede leer NO se cotiza a ciegas: cotizar gasta 0,50€ y, sin el riesgo, las
// figuras (propietario, conductor) se perderían sin que nada lo dijera.

import Link from 'next/link'
import { cardStyle } from '@/components/ui'
import { riesgoAsegura, rotuloRamo } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo, type Riesgo } from '@/lib/riesgo-asegura'
import { tomadorDelRiesgo, varianteDeRiesgo, type VarianteNueva } from './variante'

export type CargaVariante =
  | { estado: 'sin' }
  | { estado: 'ok'; variante: VarianteNueva; riesgo: Riesgo }
  | { estado: 'error'; oportunidadId: string; mensaje: string }

export async function cargarVariante(
  oportunidadId: string | null,
  tarificacionId: string | null,
  tomadorId: string,
  ramo: 'auto' | 'moto',
): Promise<CargaVariante> {
  if (!oportunidadId) return { estado: 'sin' }
  const r = await riesgoAsegura(oportunidadId).catch(() => null)
  if (!r) return { estado: 'error', oportunidadId, mensaje: 'No se ha podido hablar con central-asegura.' }
  const l = interpretarRiesgo(r.status, r.json)
  if (l.estado === 'no_encontrado') return { estado: 'error', oportunidadId, mensaje: 'Esta oportunidad no existe o no es de la correduría.' }
  if (l.estado === 'error') return { estado: 'error', oportunidadId, mensaje: `No se ha podido leer el riesgo (${l.motivo}).` }
  if (l.riesgo.oportunidad.ramo !== ramo) {
    return { estado: 'error', oportunidadId, mensaje: `Este riesgo es de ${rotuloRamo(l.riesgo.oportunidad.ramo).toLowerCase()}, no de ${ramo}.` }
  }
  return { estado: 'ok', variante: varianteDeRiesgo(l.riesgo, tomadorId, tarificacionId), riesgo: l.riesgo }
}

/**
 * La pantalla de RETARIFICAR una póliza abierta como variante de su riesgo (`?oportunidad=`, 29/09/2026):
 * «con las mismas personas» de la póliza. El riesgo tiene que ser DE ESTA póliza; si no casa o no se
 * puede leer, no se cotiza (asegura también lo corta, pero antes de enseñar el botón que cuesta 0,50€).
 */
export async function cargarRiesgoDePoliza(oportunidadId: string | null, polizaId: string): Promise<CargaVariante> {
  if (!oportunidadId) return { estado: 'sin' }
  const r = await riesgoAsegura(oportunidadId).catch(() => null)
  if (!r) return { estado: 'error', oportunidadId, mensaje: 'No se ha podido hablar con central-asegura.' }
  const l = interpretarRiesgo(r.status, r.json)
  if (l.estado === 'no_encontrado') return { estado: 'error', oportunidadId, mensaje: 'Esta oportunidad no existe o no es de la correduría.' }
  if (l.estado === 'error') return { estado: 'error', oportunidadId, mensaje: `No se ha podido leer el riesgo (${l.motivo}).` }
  if (l.riesgo.oportunidad.polizaId !== polizaId) {
    return { estado: 'error', oportunidadId, mensaje: 'Este riesgo no es de esta póliza.' }
  }
  return { estado: 'ok', variante: varianteDeRiesgo(l.riesgo, tomadorDelRiesgo(l.riesgo), null), riesgo: l.riesgo }
}

/** La franja de arriba: de qué riesgo es esta variante y cómo volver a él. */
export function FranjaVariante({ variante }: { variante: VarianteNueva }) {
  return (
    <div style={{ ...cardStyle, padding: '10px 14px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, borderLeft: '3px solid var(--primary)' }}>
      <strong>Variante del riesgo</strong>
      {variante.etiqueta && <span style={{ color: 'var(--muted)' }}>· {variante.etiqueta}</span>}
      {variante.tarificacionId && <span style={{ color: 'var(--muted)' }}>· abierta desde el historial</span>}
      <Link href={`/correduria/oportunidad/${encodeURIComponent(variante.oportunidadId)}`} style={{ color: 'var(--primary)', fontWeight: 600, minHeight: 44, display: 'inline-flex', alignItems: 'center', marginLeft: 'auto' }}>
        ← Volver al riesgo
      </Link>
    </div>
  )
}

export function ErrorVariante({ oportunidadId, mensaje }: { oportunidadId: string; mensaje: string }) {
  return (
    <div style={{ ...cardStyle, borderLeft: '3px solid var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
      {mensaje} Sin el riesgo no se pide precio desde aquí (no se sabría quién es propietario o conductor).{' '}
      <Link href={`/correduria/oportunidad/${encodeURIComponent(oportunidadId)}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>
        ← Volver al riesgo
      </Link>
    </div>
  )
}

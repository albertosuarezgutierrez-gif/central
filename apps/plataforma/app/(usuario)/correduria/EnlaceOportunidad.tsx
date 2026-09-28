import Link from 'next/link'
import { Briefcase } from 'lucide-react'
import { enlaceOportunidadDe } from '@/lib/seguimiento-asegura'
import { ConIcono } from './iconos'

/**
 * Tras pedir precio: de qué oportunidad cuelga ese presupuesto (24/09/2026). Pedir
 * precio y abrir oportunidad son ya la misma cosa; esto lo dice y enlaza a ella.
 * Si asegura no mandó nada (simulación o versión vieja), no se pinta.
 */
export default function EnlaceOportunidad({ guardado }: { guardado: unknown }) {
  const e = enlaceOportunidadDe(guardado)
  if (!e) return null
  if (e.estado === 'fallo') {
    return <p style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>No se ha podido anotar en su oportunidad ({e.motivo}): ábrela a mano desde la ficha.</p>
  }
  return (
    <p style={{ margin: 0, fontSize: 13 }}>
      {e.estado === 'creada' ? <ConIcono i={Briefcase}>Oportunidad abierta con este presupuesto; primer paso: llamarle en 2 días.</ConIcono> : <ConIcono i={Briefcase}>Anotado en su oportunidad abierta.</ConIcono>}{' '}
      <Link href={`/correduria/oportunidad/${e.oportunidadId}`}>Ver seguimiento →</Link>
    </p>
  )
}

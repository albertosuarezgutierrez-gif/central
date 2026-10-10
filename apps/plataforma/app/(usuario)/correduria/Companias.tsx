'use client'
import { Building2 } from 'lucide-react'
import Bloque from './Bloque'
import { useCompanias } from './useCompanias'
import { useAcuerdos } from './useAcuerdos'
import ListaCompanias from './companias/ListaCompanias'

/**
 * Compañías: contactos, claves, acuerdos y producción en UN sitio (06/10/2026,
 * fase 2 de acuerdos con compañías — decisión de Alberto: sin pestaña nueva).
 * Rediseño 07/10/2026: panel «Objetivos y producción» + lista plegable por compañía
 * (`companias/ListaCompanias.tsx`); el detalle completo (cotejo, % real de CIMA) en
 * la ficha `/correduria/companias/[codigo]`.
 *
 * Es REFERENCIA, no cola de trabajo: sin contador (no reporta `onContador`).
 *
 * Estados, como el resto de bloques de Datos:
 *   cargando → nada.
 *   directorio sin configurar / error → aviso discreto, nunca «sin compañías».
 *   acuerdos o producción ilegibles → cada tarjeta lo dice en su línea; el resto se pinta.
 */
export default function Companias() {
  const estado = useCompanias()
  const acuerdos = useAcuerdos()

  if (estado.fase === 'cargando') return null
  const r = estado.r

  if (r.estado !== 'ok') {
    return (
      <Bloque Icono={Building2} titulo="Compañías" sub="No se ha podido comprobar. No significa que el directorio esté vacío.">
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          {r.estado === 'sin_configurar' ? 'falta ASEGURA_OPERADOR_SECRET en este proyecto' : r.motivo}
        </p>
      </Bloque>
    )
  }

  const ra = acuerdos.fase === 'hecho' ? acuerdos.acuerdos : null
  const rp = acuerdos.fase === 'hecho' ? acuerdos.productividad : null

  return (
    <Bloque
      Icono={Building2}
      titulo="Compañías"
      sub="Producción y objetivos frente a los acuerdos, y contactos minados del correo. Acuerdos sin cotejar hasta que se comprueben con su documento."
    >
      <ListaCompanias companias={r.companias} acuerdos={ra} productividad={rp} />
    </Bloque>
  )
}

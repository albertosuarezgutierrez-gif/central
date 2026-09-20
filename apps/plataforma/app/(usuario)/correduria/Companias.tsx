'use client'
import { Building2 } from 'lucide-react'
import Bloque from './Bloque'
import ContactoAcciones from './ContactoAcciones'
import { useCompanias } from './useCompanias'
import { etiquetaArea } from '@central/module-seguros'
import type { Compania, Contacto } from '@/lib/companias-asegura'

/**
 * Directorio de contacto por compañía aseguradora (`seguros.companias_dgs` +
 * `seguros.compania_contactos`), minado del correo de Alberto: a quién
 * llamar/escribir en cada compañía en vez de perder el hilo en el buzón
 * genérico. Es una tabla de REFERENCIA, no una cola de trabajo — sin
 * contador (no reporta `onContador`), igual que la matriz de comisiones no
 * cuenta como pendiente por existir.
 *
 * Desde el 13/09/2026 cada compañía puede listar VARIOS contactos (antes uno
 * solo): cada fila de compañía expande sus contactos, uno por línea.
 *
 * Tres pintados, como el resto de bloques de Datos:
 *   cargando → nada.
 *   sin_configurar / error → aviso discreto, nunca «sin compañías».
 *   ok → tabla, con `null` en cada campo pintado como «—», nunca vacío.
 */
function celda(v: string | null) {
  return v ?? <span style={{ color: 'var(--muted)' }}>—</span>
}

export default function Companias() {
  const estado = useCompanias()

  if (estado.fase === 'cargando') return null
  const r = estado.r

  if (r.estado !== 'ok') {
    return (
      <Bloque Icono={Building2} titulo="Contactos por compañía" sub="No se ha podido comprobar. No significa que el directorio esté vacío.">
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          {r.estado === 'sin_configurar' ? 'falta ASEGURA_OPERADOR_SECRET en este proyecto' : r.motivo}
        </p>
      </Bloque>
    )
  }

  const conContacto = r.companias.filter((c: Compania) => c.contactos.length > 0)
  const sinContacto = r.companias.filter((c: Compania) => c.contactos.length === 0)

  return (
    <Bloque
      Icono={Building2}
      titulo="Contactos por compañía"
      sub={`${conContacto.length} de ${r.companias.length} compañías con al menos un contacto conocido. Minado del correo — no es la ficha oficial de la aseguradora.`}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: '4px 8px 4px 0' }}>Compañía</th>
              <th style={{ padding: '4px 8px' }}>Contacto</th>
              <th style={{ padding: '4px 8px' }}>Email</th>
              <th style={{ padding: '4px 8px' }}>Teléfono</th>
              <th style={{ padding: '4px 8px', width: 1 }} />
              <th style={{ padding: '4px 8px' }}>Clave mediador</th>
            </tr>
          </thead>
          <tbody>
            {conContacto.map((c) => (
              c.contactos.map((ct: Contacto, i: number) => (
                <tr key={ct.id} style={{ borderTop: i === 0 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {i === 0 ? c.nombreComun : null}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {celda(ct.nombre)}
                    {(ct.cargo || ct.area) && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {[ct.cargo, etiquetaArea(ct.area)].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px', overflowWrap: 'anywhere' }}>
                    {ct.email ? <a href={`mailto:${ct.email}`}>{ct.email}</a> : celda(null)}
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {ct.telefono ? <a href={`tel:${ct.telefono.replace(/[^0-9+]/g, '')}`}>{ct.telefono}</a> : celda(null)}
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <ContactoAcciones contactoId={ct.id} nombre={ct.nombre} telefono={ct.telefono} email={ct.email} compacto />
                  </td>
                  <td style={{ padding: '6px 8px' }}>{i === 0 ? celda(c.claveMediador) : null}</td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>
      {sinContacto.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
          Sin contacto todavía: {sinContacto.map((c) => c.nombreComun).join(' · ')}
        </p>
      )}
    </Bloque>
  )
}

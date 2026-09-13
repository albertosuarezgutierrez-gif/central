'use client'
import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import Bloque from './Bloque'
import { interpretarCompanias, type Compania, type RespuestaCompanias } from '@/lib/companias-asegura'

/**
 * Directorio de contacto por compañía aseguradora (`seguros.companias_dgs`),
 * minado del correo de Alberto: a quién llamar/escribir en cada compañía en
 * vez de perder el hilo en el buzón genérico. Es una tabla de REFERENCIA, no
 * una cola de trabajo — sin contador (no reporta `onContador`), igual que la
 * matriz de comisiones no cuenta como pendiente por existir.
 *
 * Tres pintados, como el resto de bloques de Datos:
 *   cargando → nada.
 *   sin_configurar / error → aviso discreto, nunca «sin compañías».
 *   ok → tabla, con `null` en cada campo pintado como «—», nunca vacío.
 */
type Estado = { fase: 'cargando' } | { fase: 'hecho'; r: RespuestaCompanias }

function celda(v: string | null) {
  return v ?? <span style={{ color: 'var(--muted)' }}>—</span>
}

export default function Companias() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/companias')
      .then(async (res) => interpretarCompanias(res.status, await res.json().catch(() => null)))
      .catch((): RespuestaCompanias => ({ estado: 'error', motivo: 'red' }))
      .then((r) => { if (vivo) setEstado({ fase: 'hecho', r }) })
    return () => { vivo = false }
  }, [])

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

  const conContacto = r.companias.filter((c: Compania) => c.contactoNombre || c.contactoEmail || c.contactoTelefono)
  const sinContacto = r.companias.filter((c: Compania) => !c.contactoNombre && !c.contactoEmail && !c.contactoTelefono)

  return (
    <Bloque
      Icono={Building2}
      titulo="Contactos por compañía"
      sub={`${conContacto.length} de ${r.companias.length} compañías con un contacto conocido. Minado del correo — no es la ficha oficial de la aseguradora.`}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: '4px 8px 4px 0' }}>Compañía</th>
              <th style={{ padding: '4px 8px' }}>Contacto</th>
              <th style={{ padding: '4px 8px' }}>Email</th>
              <th style={{ padding: '4px 8px' }}>Teléfono</th>
              <th style={{ padding: '4px 8px' }}>Clave mediador</th>
            </tr>
          </thead>
          <tbody>
            {conContacto.map((c) => (
              <tr key={c.codigoDgs} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px 6px 0', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.nombreComun}</td>
                <td style={{ padding: '6px 8px' }}>
                  {celda(c.contactoNombre)}
                  {c.contactoCargo && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.contactoCargo}</div>}
                </td>
                <td style={{ padding: '6px 8px', overflowWrap: 'anywhere' }}>
                  {c.contactoEmail ? <a href={`mailto:${c.contactoEmail}`}>{c.contactoEmail}</a> : celda(null)}
                </td>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                  {c.contactoTelefono ? <a href={`tel:${c.contactoTelefono.replace(/[^0-9+]/g, '')}`}>{c.contactoTelefono}</a> : celda(null)}
                </td>
                <td style={{ padding: '6px 8px' }}>{celda(c.claveMediador)}</td>
              </tr>
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

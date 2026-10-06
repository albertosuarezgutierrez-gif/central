'use client'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import Bloque from './Bloque'
import ContactoAcciones from './ContactoAcciones'
import { useCompanias } from './useCompanias'
import { useAcuerdos } from './useAcuerdos'
import { ChipsAcuerdos, ProduccionCompania } from './companias/AcuerdosVista'
import { etiquetaArea } from '@central/module-seguros'
import type { Compania } from '@/lib/companias-asegura'
import type { RespuestaAcuerdos, RespuestaProductividad } from '@/lib/acuerdos-asegura'

/**
 * Compañías: contactos, claves, acuerdos y producción en UN sitio (06/10/2026,
 * fase 2 de acuerdos con compañías — decisión de Alberto: sin pestaña nueva). Una
 * tarjeta por compañía con contactos o con acuerdo; el detalle (líneas de
 * comisión, objetivos, letra pequeña, cotejo, % real de CIMA) en la ficha
 * `/correduria/companias/[codigo]`.
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
  const conAcuerdo = new Set(ra?.estado === 'ok' ? ra.acuerdos.map((a) => a.companiaCodigoDgs) : [])
  const visibles = r.companias.filter((c) => c.contactos.length > 0 || conAcuerdo.has(c.codigoDgs))
  const resto = r.companias.filter((c) => !visibles.includes(c))

  return (
    <Bloque
      Icono={Building2}
      titulo="Compañías"
      sub={`${visibles.length} de ${r.companias.length} con contacto o acuerdo. Contactos minados del correo; acuerdos sin cotejar hasta que se comprueben con su documento.`}
    >
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
        {visibles.map((c) => (
          <TarjetaCompania key={c.codigoDgs} c={c} ra={ra} rp={rp} />
        ))}
      </div>
      {resto.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
          {ra?.estado === 'ok' ? 'Sin contacto ni acuerdo todavía' : 'Sin contacto (acuerdos aún sin comprobar)'}: {resto.map((c) => c.nombreComun).join(' · ')}
        </p>
      )}
    </Bloque>
  )
}

function TarjetaCompania({ c, ra, rp }: {
  c: Compania
  ra: RespuestaAcuerdos | null
  rp: RespuestaProductividad | null
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Link href={`/correduria/companias/${encodeURIComponent(c.codigoDgs)}`} style={{ fontWeight: 700, fontSize: 15 }}>
          {c.nombreComun} →
        </Link>
        {c.claveMediador && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Mediador {c.claveMediador}</span>}
      </div>

      {ra ? <ChipsAcuerdos codigo={c.codigoDgs} r={ra} /> : <span style={{ fontSize: 11, color: 'var(--muted)' }}>Cargando acuerdos…</span>}
      {rp && <ProduccionCompania codigo={c.codigoDgs} p={rp} enCima={c.enCima} compacto />}

      {c.contactos.length === 0
        ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sin contacto todavía.</span>
        : c.contactos.map((ct) => (
          <div key={ct.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{ct.nombre}</div>
              {(ct.cargo || ct.area) && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{[ct.cargo, etiquetaArea(ct.area)].filter(Boolean).join(' · ')}</div>
              )}
            </div>
            <ContactoAcciones contactoId={ct.id} nombre={ct.nombre} telefono={ct.telefono} email={ct.email} compacto />
          </div>
        ))}
    </div>
  )
}

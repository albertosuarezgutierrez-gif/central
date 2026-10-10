'use client'
import { useRouter } from 'next/navigation'
import { FileText, KeyRound, Percent, TrendingUp, Users } from 'lucide-react'
import type { LineaComision } from '@central/module-seguros'
import { etiquetaArea } from '@central/module-seguros'
import type { Compania } from '@/lib/companias-asegura'
import type { RespuestaAcuerdos, RespuestaProductividad } from '@/lib/acuerdos-asegura'
import Bloque from '../../Bloque'
import ContactoAcciones from '../../ContactoAcciones'
import { ChipsAcuerdos, ProduccionCompania, TarjetaAcuerdo } from '../AcuerdosVista'
import ComisionReal from '../ComisionReal'

export type ComisionRealDatos =
  | { estado: 'ok'; lineas: LineaComision[]; truncado: boolean; sinProducto: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const gris = { color: 'var(--muted)' } as const

function NoComprobado({ que, motivo }: { que: string; motivo?: string }) {
  return <p style={{ margin: 0, fontSize: 12, ...gris }}>{que}: no se ha podido comprobar{motivo ? ` (${motivo})` : ''}. No significa que no haya.</p>
}

/** Cuerpo de la ficha de compañía. Solo presentación: los datos llegan ya leídos de la página. */
export default function FichaCompania({ codigo, compania, acuerdos, productividad, comisionReal }: {
  codigo: string
  compania: Compania | null
  acuerdos: RespuestaAcuerdos
  productividad: RespuestaProductividad
  comisionReal: ComisionRealDatos
}) {
  const router = useRouter()
  const propios = acuerdos.estado === 'ok' ? acuerdos.acuerdos.filter((a) => a.companiaCodigoDgs === codigo) : []
  const objetivos = productividad.estado === 'ok' ? productividad.objetivos.filter((o) => o.companiaCodigoDgs === codigo) : []
  const claves = acuerdos.estado === 'ok' ? acuerdos.claves.filter((c) => c.companiaCodigoDgs === codigo) : []
  const conflictos = acuerdos.estado === 'ok' ? acuerdos.conflictosCodigos.filter((c) => c.companiaCodigoDgs === codigo) : []

  return (
    <div style={{ display: 'grid', gap: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <Bloque Icono={KeyRound} titulo="Claves y acuerdos" primero
        sub="Un acuerdo paga por lo producido con SU clave. Sin clave asignada, su productividad queda pendiente.">
        <ChipsAcuerdos codigo={codigo} r={acuerdos} />
        {claves.length > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 12, ...gris }}>
            Códigos de CIMA por clave: {claves.map((c) => `${c.etiqueta ?? '(sin etiqueta)'} → ${c.codigosCima.length ? c.codigosCima.join(', ') : 'ninguno'}`).join(' · ')}
          </p>
        )}
        {conflictos.length > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--negative)' }}>
            Código de CIMA en dos claves a la vez: {conflictos.map((c) => c.codigo).join(', ')}. Hasta corregirlo, esa producción no se atribuye.
          </p>
        )}
      </Bloque>

      <Bloque Icono={TrendingUp} titulo="Producción" sub="Lo que dice CIMA de esta compañía en el año. «Sin recibos» no es «0 €».">
        <ProduccionCompania codigo={codigo} p={productividad} enCima={compania ? compania.enCima : null} />
      </Bloque>

      <Bloque Icono={FileText} titulo={`Acuerdos (${propios.length})`}
        sub="Comisiones por ramo (— = no consta), objetivos y letra pequeña. «Coincide con el PDF» los da por cotejados.">
        {acuerdos.estado !== 'ok'
          ? <NoComprobado que="Acuerdos" motivo={acuerdos.estado === 'error' ? acuerdos.motivo : 'puerto sin configurar'} />
          : propios.length === 0
            ? <p style={{ margin: 0, fontSize: 12, ...gris }}>Sin acuerdo cargado para esta compañía.</p>
            : (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                {propios.map((a) => (
                  <TarjetaAcuerdo key={a.id} a={a} objetivos={objetivos.filter((o) => o.acuerdoId === a.id)} onCotejado={() => router.refresh()} />
                ))}
              </div>
            )}
      </Bloque>

      <Bloque Icono={Percent} titulo="Firmado frente a lo aplicado en CIMA"
        sub="Solo las líneas con código de producto de CIMA se pueden cruzar con los recibos (24 meses).">
        {comisionReal.estado === 'ok'
          ? <ComisionReal lineas={comisionReal.lineas} truncado={comisionReal.truncado} sinProducto={comisionReal.sinProducto} />
          : <NoComprobado que="Comisión real" motivo={comisionReal.estado === 'error' ? comisionReal.motivo : 'puerto sin configurar'} />}
      </Bloque>

      <Bloque Icono={Users} titulo="Contactos">
        {!compania
          ? <NoComprobado que="Contactos" />
          : compania.contactos.length === 0
            ? <p style={{ margin: 0, fontSize: 12, ...gris }}>Sin contacto todavía.</p>
            : (
              <div style={{ display: 'grid', gap: 8 }}>
                {compania.contactos.map((ct) => (
                  <div key={ct.id} style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{ct.nombre}</div>
                      {(ct.cargo || ct.area) && <div style={{ fontSize: 12, ...gris }}>{[ct.cargo, etiquetaArea(ct.area)].filter(Boolean).join(' · ')}</div>}
                    </div>
                    {(ct.email || ct.telefono) && (
                      <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                        {ct.email && <a href={`mailto:${ct.email}`} style={{ overflowWrap: 'anywhere' }}>{ct.email}</a>}
                        {ct.telefono && <a href={`tel:${ct.telefono.replace(/[^0-9+]/g, '')}`}>{ct.telefono}</a>}
                      </div>
                    )}
                    <ContactoAcciones contactoId={ct.id} nombre={ct.nombre} telefono={ct.telefono} email={ct.email} />
                  </div>
                ))}
              </div>
            )}
      </Bloque>
    </div>
  )
}

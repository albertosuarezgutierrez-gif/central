'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { etiquetaArea, totalesPorCompania, type PanelControl as Panel } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { construirPanelControl, type RespuestaAcuerdos, type RespuestaProductividad } from '@/lib/acuerdos-asegura'
import type { Compania } from '@/lib/companias-asegura'
import { Chip, ChipsAcuerdos, TarjetaAcuerdo } from './AcuerdosVista'
import PanelControl from './PanelControl'
import TelefonoContacto from './TelefonoContacto'

/**
 * Compañías (07/10/2026, rediseño pedido por Alberto): panel «Objetivos y producción»
 * arriba y, debajo, una lista PLEGABLE por compañía — cabecera compacta (nombre, mediador,
 * chips de acuerdo, nº contactos y su cartera en vigor) y, al desplegar, contactos y
 * acuerdos. Plegado por defecto y el contenido NO se monta hasta abrir. Orden: más
 * pólizas en vigor primero, luego las que tienen acuerdo, luego por nombre.
 * Lo usan la pestaña Datos (`Companias.tsx`) y `/correduria/companias`.
 *
 * null ≠ 0: sin cartera leída, «cartera: sin dato»; sin pólizas leídas, «sin pólizas».
 */
const gris = { color: 'var(--muted)' } as const
const POR_PAGINA = 50

export default function ListaCompanias({ companias, acuerdos, productividad }: {
  companias: Compania[]
  /** `null` = aún cargando. */
  acuerdos: RespuestaAcuerdos | null
  productividad: RespuestaProductividad | null
}) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set())
  const [visibles, setVisibles] = useState(POR_PAGINA)

  const panel: Panel | null = useMemo(() => construirPanelControl(acuerdos, productividad), [acuerdos, productividad])
  const cartera = productividad && productividad.estado === 'ok' ? productividad.cartera : null
  const totales = useMemo(() => totalesPorCompania(cartera), [cartera])
  const nombres = useMemo(() => new Map(companias.map((c) => [c.codigoDgs, c.nombreComun])), [companias])
  const conAcuerdo = useMemo(() => new Set(acuerdos?.estado === 'ok' ? acuerdos.acuerdos.map((a) => a.companiaCodigoDgs) : []), [acuerdos])

  const { lista, resto } = useMemo(() => {
    const util = (c: Compania) => c.contactos.length > 0 || conAcuerdo.has(c.codigoDgs) || (totales?.get(c.codigoDgs)?.polizas ?? 0) > 0
    const lista = companias.filter(util).sort((a, b) =>
      (totales?.get(b.codigoDgs)?.polizas ?? -1) - (totales?.get(a.codigoDgs)?.polizas ?? -1)
      || Number(conAcuerdo.has(b.codigoDgs)) - Number(conAcuerdo.has(a.codigoDgs))
      || a.nombreComun.localeCompare(b.nombreComun, 'es'))
    return { lista, resto: companias.filter((c) => !util(c)) }
  }, [companias, conAcuerdo, totales])

  const alternar = (codigo: string) => setAbiertas((s) => {
    const n = new Set(s)
    if (n.has(codigo)) n.delete(codigo); else n.add(codigo)
    return n
  })

  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <PanelControl
        panel={panel}
        nombres={nombres}
        carteraLeida={cartera !== null}
        anio={productividad && productividad.estado === 'ok' ? productividad.anio : null}
      />

      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-quicksand, inherit)' }}>Por compañía</h3>
        <p style={{ margin: '0 0 4px', fontSize: 12, ...gris }}>
          {lista.length} de {companias.length} con contacto, acuerdo o pólizas en vigor. Toca una para ver contactos y acuerdos.
        </p>
        {lista.slice(0, visibles).map((c) => (
          <FilaCompania
            key={c.codigoDgs}
            c={c}
            abierta={abiertas.has(c.codigoDgs)}
            alternar={() => alternar(c.codigoDgs)}
            acuerdos={acuerdos}
            productividad={productividad}
            total={totales === null ? null : totales.get(c.codigoDgs) ?? { polizas: 0, prima: 0, sinPrima: 0 }}
          />
        ))}
        {lista.length > visibles && (
          <button type="button" style={{ ...btnStyle('secundario', 'md'), justifySelf: 'start' }} onClick={() => setVisibles((v) => v + POR_PAGINA)}>
            Ver {Math.min(POR_PAGINA, lista.length - visibles)} más de {lista.length - visibles}
          </button>
        )}
        {resto.length > 0 && (
          <p style={{ fontSize: 12, margin: '6px 0 0', ...gris }}>
            Sin contacto, acuerdo ni pólizas{acuerdos?.estado === 'ok' ? '' : ' (acuerdos aún sin comprobar)'}: {resto.map((c) => c.nombreComun).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

function FilaCompania({ c, abierta, alternar, acuerdos, productividad, total }: {
  c: Compania
  abierta: boolean
  alternar: () => void
  acuerdos: RespuestaAcuerdos | null
  productividad: RespuestaProductividad | null
  total: { polizas: number; prima: number; sinPrima: number } | null
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, minWidth: 0 }}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        style={{
          display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr) auto', columnGap: 8, rowGap: 4, alignItems: 'start',
          width: '100%', minHeight: 44, padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
          background: 'transparent', border: 'none', color: 'inherit', font: 'inherit',
        }}
      >
        <ChevronRight size={16} aria-hidden style={{ marginTop: 2, transform: abierta ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />
        <div style={{ minWidth: 0, display: 'grid', gap: 4, alignContent: 'start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
            <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-quicksand, inherit)', overflowWrap: 'anywhere' }}>{c.nombreComun}</span>
            {c.claveMediador && <span style={{ fontSize: 11, ...gris }}>Mediador {c.claveMediador}</span>}
          </div>
          {acuerdos
            ? <ChipsAcuerdos codigo={c.codigoDgs} r={acuerdos} />
            : <span style={{ fontSize: 11, ...gris }}>Cargando acuerdos…</span>}
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, display: 'grid', gap: 2, justifyItems: 'end' }}>
          <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {total === null ? <span style={gris}>cartera: sin dato</span> : total.polizas === 0 ? <span style={gris}>sin pólizas</span> : `${total.polizas} pól. · ${eur(total.prima)}`}
          </span>
          {total !== null && total.sinPrima > 0 && <span style={gris}>{total.sinPrima} sin prima</span>}
          <Chip tono="neutral">{c.contactos.length === 0 ? 'sin contactos' : `${c.contactos.length} contacto${c.contactos.length === 1 ? '' : 's'}`}</Chip>
        </div>
      </button>
      {abierta && <DetalleCompania c={c} acuerdos={acuerdos} productividad={productividad} />}
    </div>
  )
}

function DetalleCompania({ c, acuerdos, productividad }: { c: Compania; acuerdos: RespuestaAcuerdos | null; productividad: RespuestaProductividad | null }) {
  const propios = acuerdos?.estado === 'ok' ? acuerdos.acuerdos.filter((a) => a.companiaCodigoDgs === c.codigoDgs) : []
  const objetivos = productividad?.estado === 'ok' ? productividad.objetivos.filter((o) => o.companiaCodigoDgs === c.codigoDgs) : []
  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)', padding: '4px 12px 12px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <strong style={{ fontSize: 12, textTransform: 'uppercase', ...gris }}>Contactos</strong>
        {c.contactos.length === 0 && <span style={{ fontSize: 12, ...gris }}>Sin contacto todavía.</span>}
        {c.contactos.map((ct) => (
          <div key={ct.id} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{ct.nombre}</div>
              {(ct.cargo || ct.area) && <div style={{ fontSize: 12, ...gris }}>{[ct.cargo, etiquetaArea(ct.area)].filter(Boolean).join(' · ')}</div>}
            </div>
            {ct.email && <a href={`mailto:${ct.email}`} style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{ct.email}</a>}
            <TelefonoContacto contactoId={ct.id} nombre={ct.nombre} telefono={ct.telefono} email={ct.email} />
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <strong style={{ fontSize: 12, textTransform: 'uppercase', ...gris }}>Acuerdos</strong>
        {acuerdos === null && <span style={{ fontSize: 12, ...gris }}>Cargando…</span>}
        {acuerdos !== null && acuerdos.estado !== 'ok' && <span style={{ fontSize: 12, ...gris }}>No se han podido comprobar los acuerdos. No significa que no haya.</span>}
        {acuerdos?.estado === 'ok' && propios.length === 0 && <span style={{ fontSize: 12, ...gris }}>Sin acuerdo cargado.</span>}
        {propios.map((a) => <TarjetaAcuerdo key={a.id} a={a} objetivos={objetivos} />)}
        <Link href={`/correduria/companias/${encodeURIComponent(c.codigoDgs)}`} style={{ ...btnStyle('secundario', 'md'), justifySelf: 'start', textDecoration: 'none' }}>
          Ficha completa →
        </Link>
      </div>
    </div>
  )
}

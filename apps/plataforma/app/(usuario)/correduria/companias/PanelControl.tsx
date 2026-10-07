'use client'
import { useState } from 'react'
import { Target } from 'lucide-react'
import { etiquetaRamo, type CandidataRamo, type ObjetivoCandidata, type PanelControl as Panel, type RamoControl } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { textoMotivoPendiente, textoPct } from '@/lib/acuerdos-asegura'
import { Chip } from './AcuerdosVista'

/**
 * «Objetivos y producción» (07/10/2026): por ramo, qué compañías tienen acuerdo, su
 * comisión pactada, lo que ya hay en cartera EN VIGOR y el avance de su objetivo,
 * con la «compañía recomendada». Todo el cálculo vive en
 * `packages/module-seguros/src/acuerdos-control.ts`; aquí solo se pinta.
 *
 * null ≠ 0: «—» = no consta, «sin dato» = no se pudo leer, objetivo pendiente = ⚪
 * con su motivo (nunca barra verde). Acuerdo sin cotejar = cifras provisionales.
 * Responsive: cada ramo es una tarjeta con su tabla en un scroller horizontal.
 */
const gris = { color: 'var(--muted)' } as const
const RAMOS_INICIALES = 6
const COLOR_AVANCE = { alcanzado: 'var(--positive)', en_camino: 'var(--info)', por_debajo: 'var(--warning)', no_llega: 'var(--negative)' } as const

const unidad = (base: string | null, n: number) => (base === 'polizas_np' ? `${n.toLocaleString('es-ES')} pól.` : eur(n))

function CeldaObjetivo({ o }: { o: ObjetivoCandidata }) {
  if (o.estado === 'sin_objetivo') return <span style={gris} title="El acuerdo no tiene objetivo para este ramo">—</span>
  if (o.estado === 'pendiente') return <span style={{ fontSize: 12, ...gris }}>⚪ Pendiente: {textoMotivoPendiente(o.motivo)}</span>
  const pct = o.avance === null ? null : Math.round(o.avance * 100)
  return (
    <div style={{ display: 'grid', gap: 3, minWidth: 130 }}>
      {pct === null
        ? <span style={{ fontSize: 12, ...gris }}>sin dato</span>
        : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: '1 1 auto', height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }} role="img" aria-label={`Avance ${pct} %`}>
              <div style={{ width: `${pct}%`, height: '100%', background: COLOR_AVANCE[o.color] }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{pct} %</span>
          </div>
        )}
      <span style={{ fontSize: 11, ...gris }}>
        {unidad(o.base, o.medido)} de {unidad(o.base, o.umbral)}
        {o.falta !== null && ` · faltan ${unidad(o.base, o.falta)} al siguiente tramo`}
      </span>
    </div>
  )
}

function FilaCandidata({ c, nombre, recomendada }: { c: CandidataRamo; nombre: string; recomendada: boolean }) {
  const celda = { padding: '8px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'top', fontSize: 13 } as const
  return (
    <tr style={recomendada ? { background: 'var(--primary-light)' } : undefined}>
      <td style={{ ...celda, fontWeight: 600, minWidth: 130 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <span>{nombre}</span>
          {recomendada && <Chip tono="info" title="La mejor opción para este ramo según comisión y objetivo">Recomendada</Chip>}
        </div>
      </td>
      <td style={celda}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <span>{c.fuente}</span>
          {c.sinCotejar && <Chip tono="aviso" title="Extracto sin cotejar con el documento original: cifras provisionales">sin cotejar</Chip>}
        </div>
      </td>
      <td style={{ ...celda, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <div>NP {textoPct(c.pctNp)}</div>
        <div style={{ fontSize: 11, ...gris }}>Cartera {textoPct(c.pctCartera)}</div>
      </td>
      <td style={{ ...celda, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {c.polizas === null
          ? <span style={gris}>sin dato</span>
          : c.polizas === 0
            ? <span style={gris}>sin pólizas</span>
            : (
              <>
                <div>{c.polizas} pól.</div>
                <div style={{ fontSize: 11, ...gris }}>{c.prima === null ? 'sin dato' : eur(c.prima)}{c.sinPrima > 0 && ` · ${c.sinPrima} sin prima`}</div>
              </>
            )}
      </td>
      <td style={celda}><CeldaObjetivo o={c.objetivo} /></td>
    </tr>
  )
}

function TarjetaRamo({ r, nombres }: { r: RamoControl; nombres: ReadonlyMap<string, string> }) {
  const reco = r.recomendada ? nombres.get(r.recomendada) ?? r.recomendada : null
  const th = { padding: '4px 8px', fontSize: 11, textTransform: 'uppercase', textAlign: 'left', fontWeight: 600, ...gris } as const
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 14, fontFamily: 'var(--font-quicksand, inherit)' }}>{etiquetaRamo(r.ramo)}</strong>
        <span style={{ fontSize: 12, ...gris }}>
          {r.cartera === null
            ? 'cartera: sin dato'
            : r.cartera.polizas === 0
              ? 'sin pólizas en vigor'
              : `${r.cartera.polizas} pól. en vigor · ${eur(r.cartera.prima)}${r.cartera.sinPrima > 0 ? ` (${r.cartera.sinPrima} sin prima)` : ''}`}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12 }}>
        {reco ? <><strong>{reco}</strong> · {r.motivo}</> : <span style={gris}>{r.motivo}</span>}
      </p>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
          <thead>
            <tr><th style={th}>Compañía</th><th style={th}>Acuerdo</th><th style={th}>Comisión</th><th style={th}>En cartera</th><th style={th}>Objetivo</th></tr>
          </thead>
          <tbody>
            {r.candidatas.map((c) => (
              <FilaCandidata key={c.companiaCodigoDgs} c={c} nombre={nombres.get(c.companiaCodigoDgs) ?? c.companiaCodigoDgs} recomendada={c.companiaCodigoDgs === r.recomendada} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PanelControl({ panel, nombres, carteraLeida, anio }: {
  /** `null` = los acuerdos no se han podido leer (o aún cargan). */
  panel: Panel | null
  nombres: ReadonlyMap<string, string>
  carteraLeida: boolean
  anio: number | null
}) {
  const [visibles, setVisibles] = useState(RAMOS_INICIALES)
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div>
        <h3 style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-quicksand, inherit)' }}>
          <Target size={15} strokeWidth={1.75} aria-hidden /> Objetivos y producción
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, maxWidth: '72ch', ...gris }}>
          Por ramo: compañías con acuerdo, comisión pactada, cartera en vigor de hoy y avance del objetivo{anio ? ` (${anio})` : ''}.
          «—» = no consta · «sin dato» = no se pudo leer. Acuerdos sin cotejar: cifras provisionales.
        </p>
      </div>
      {panel === null ? (
        <p style={{ margin: 0, fontSize: 12, ...gris }}>No se han podido leer los acuerdos: sin ellos no se puede cruzar. No significa que no haya.</p>
      ) : (
        <>
          {!carteraLeida && <p style={{ margin: 0, fontSize: 12, ...gris }}>La cartera en vigor no se ha podido leer: las pólizas y primas salen «sin dato», no a cero.</p>}
          {panel.ramos.length === 0 && <p style={{ margin: 0, fontSize: 12, ...gris }}>Ningún acuerdo cargado tiene líneas con un ramo reconocido.</p>}
          {panel.ramos.slice(0, visibles).map((r) => <TarjetaRamo key={r.ramo} r={r} nombres={nombres} />)}
          {panel.ramos.length > visibles && (
            <button type="button" style={{ ...btnStyle('secundario', 'md'), justifySelf: 'start' }} onClick={() => setVisibles((v) => v + RAMOS_INICIALES)}>
              Ver {Math.min(RAMOS_INICIALES, panel.ramos.length - visibles)} ramos más de {panel.ramos.length - visibles}
            </button>
          )}
          {panel.ramosSinAcuerdo.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, ...gris }}>
              Con pólizas en vigor y sin acuerdo para ese ramo (o el ramo del acuerdo no casa): {panel.ramosSinAcuerdo.map((x) => `${etiquetaRamo(x.ramo)} (${x.polizas})`).join(' · ')}.
            </p>
          )}
          {panel.lineasSinRamo > 0 && (
            <p style={{ margin: 0, fontSize: 12, ...gris }}>{panel.lineasSinRamo} línea(s) de acuerdo con un ramo sin mapear: se ven en la ficha de la compañía, aquí no cuentan.</p>
          )}
        </>
      )}
    </div>
  )
}

'use client'
import { Badge, type Tono } from '@/components/ui'
import type { EntradaCuadro, LineaComision, VeredictoComision } from '@central/module-seguros'

/**
 * Lo FIRMADO frente al % que la compañía aplica de verdad en los recibos de CIMA (24 meses), para
 * UNA compañía. Era el bloque «Comisiones por compañía» de la sección Datos (`ComisionesPactadas.tsx`,
 * PR #3903); desde el 06/10/2026 vive en la ficha de cada compañía y el cuadro sale de las tablas de
 * acuerdos (`acuerdo_comisiones`), no de `comision_pactada`. Presentación pura: la ficha le pasa las
 * líneas ya filtradas.
 *
 * «Sin cuadro» NO es «cuadra»: sin lo firmado no hay contra qué comparar, y la pantalla lo dice.
 */
const VEREDICTO: Record<VeredictoComision, { texto: string; tono: Tono; title: string }> = {
  'sin-cuadro': { texto: 'Sin cuadro', tono: 'neutral', title: 'No hay cuadro firmado en vigor con código de producto: no se puede comprobar.' },
  'sin-recibos': { texto: 'Sin recibos', tono: 'neutral', title: 'Hay cuadro, pero ningún recibo de nueva producción o cartera emitido bajo él.' },
  'por-modalidad': { texto: 'Por modalidad', tono: 'info', title: 'Las modalidades van a % distintos y el recibo de CIMA no dice de cuál es.' },
  'varios-acuerdos': { texto: 'Varios acuerdos', tono: 'info', title: 'Hay dos asociaciones en vigor para la misma modalidad: no se sabe bajo cuál se emitió el recibo.' },
  cuadra: { texto: 'Cuadra', tono: 'positivo', title: 'Todos los recibos aplican el % firmado (±0,5 puntos).' },
  descuadra: { texto: 'Descuadra', tono: 'negativo', title: 'Hay recibos con un % distinto del firmado: revisar con la compañía.' },
}

const pct = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
const fecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const tramo = (nueva: number, cartera: number) => (nueva === cartera ? pct(nueva) : `${pct(nueva)} 1º año · ${pct(cartera)} cartera`)
const gris = { color: 'var(--muted)' }

function Cuadro({ e }: { e: EntradaCuadro }) {
  const etiqueta = [e.modalidad ?? 'Todo el producto', e.acuerdo !== 'directo' ? e.acuerdo : null].filter(Boolean).join(' · ')
  return (
    <div style={{ marginBottom: 2 }}>
      <span>{etiqueta}: </span>
      {e.vigente ? <strong>{tramo(e.vigente.pctNueva, e.vigente.pctCartera)}</strong> : <span style={gris}>sin cuadro en vigor</span>}
      {e.proximo && (
        <span style={{ ...gris, fontSize: 11 }} title={e.proximo.fuente}>
          {' '}→ {tramo(e.proximo.pctNueva, e.proximo.pctCartera)} desde {fecha(e.proximo.vigenteDesde)}
        </span>
      )}
    </div>
  )
}

export default function ComisionReal({ lineas, truncado, sinProducto }: {
  lineas: LineaComision[]
  truncado: boolean
  sinProducto: number
}) {
  if (lineas.length === 0) {
    return <p style={{ margin: 0, fontSize: 12, ...gris }}>Ni cuadro con código de producto ni recibos de CIMA en los últimos 24 meses.</p>
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {lineas.map((l) => {
        const v = VEREDICTO[l.veredicto]
        return (
          <div key={l.producto} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 4, fontSize: 13, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>
                {l.producto}{l.productoNombre ? <span style={{ fontWeight: 400, ...gris }}> · {l.productoNombre}</span> : null}
              </span>
              <Badge tono={v.tono} title={v.title}>{v.texto}</Badge>
            </div>
            <div>
              <span style={{ fontSize: 11, ...gris }}>Firmado: </span>
              {l.cuadro.length ? l.cuadro.map((e) => <Cuadro key={`${e.modalidad}|${e.acuerdo}`} e={e} />) : <span style={gris}>—</span>}
              {l.extras.map((x) => (
                <div key={`${x.modalidad}|${x.acuerdo}`} style={{ fontSize: 11, color: 'var(--primary)' }}>
                  Extra {x.acuerdo}{x.modalidad ? ` (${x.modalidad})` : ''}: {x.puntosNueva === x.puntosCartera
                    ? `${x.puntosNueva >= 0 ? '+' : ''}${x.puntosNueva.toLocaleString('es-ES')} puntos`
                    : `${x.puntosNueva.toLocaleString('es-ES')} / ${x.puntosCartera.toLocaleString('es-ES')} puntos (1º año / cartera)`}
                </div>
              ))}
            </div>
            <div>
              <span style={{ fontSize: 11, ...gris }}>Real en recibos: </span>
              {l.real
                ? <>{pct(l.real.pctMedio)} <span style={{ fontSize: 11, ...gris }}>{l.real.pctMin === l.real.pctMax ? '' : `(${pct(l.real.pctMin)} – ${pct(l.real.pctMax)}) `}· {l.real.recibos} recibos</span></>
                : <span style={gris}>—</span>}
              {l.fuera > 0 && <span style={{ fontSize: 11, ...gris }}> · {l.fuera} fuera de cuadro</span>}
            </div>
          </div>
        )
      })}
      {(truncado || sinProducto > 0) && (
        <p style={{ fontSize: 12, ...gris, margin: 0 }}>
          {truncado && 'Se ha alcanzado el máximo de recibos leídos: el % real puede estar incompleto. '}
          {sinProducto > 0 && `${sinProducto} recibos de la cartera sin código de producto en CIMA no se pueden cruzar con ningún cuadro.`}
        </p>
      )}
    </div>
  )
}

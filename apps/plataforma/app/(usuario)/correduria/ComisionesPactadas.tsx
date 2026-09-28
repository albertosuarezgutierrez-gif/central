'use client'
import { useEffect, useMemo, useState } from 'react'
import { Percent } from 'lucide-react'
import { Badge, type Tono } from '@/components/ui'
import type { EntradaCuadro, LineaComision, VeredictoComision } from '@central/module-seguros'
import Bloque from './Bloque'
import { useCompanias } from './useCompanias'

/**
 * Cuadro de comisiones FIRMADO con cada compañía (`seguros.comision_pactada`) contra el % que la
 * compañía aplica de verdad en los recibos de CIMA (24 meses). Referencia, sin contador.
 *
 * «Sin cuadro» NO es «cuadra»: sin lo firmado no hay contra qué comparar, y la pantalla lo dice.
 */
type Respuesta =
  | { estado: 'ok'; lineas: LineaComision[]; truncado: boolean; sinProducto: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const VEREDICTO: Record<VeredictoComision, { texto: string; tono: Tono; title: string }> = {
  'sin-cuadro': { texto: 'Sin cuadro', tono: 'neutral', title: 'No hay cuadro firmado en vigor apuntado: no se puede comprobar.' },
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

export default function ComisionesPactadas() {
  const [r, setR] = useState<Respuesta | null>(null)
  const companias = useCompanias()

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/comisiones-pactadas')
      .then(async (res) => {
        const j = await res.json().catch(() => null)
        if (j?.estado === 'sin_configurar' || res.status === 503) return { estado: 'sin_configurar' } as const
        if (res.ok && j?.estado === 'ok' && Array.isArray(j.lineas)) return j as Respuesta
        return { estado: 'error', motivo: j?.causa ?? j?.motivo ?? `HTTP ${res.status}` } as const
      })
      .catch((): Respuesta => ({ estado: 'error', motivo: 'red' }))
      .then((x) => { if (vivo) setR(x) })
    return () => { vivo = false }
  }, [])

  const nombres = useMemo(() => {
    const m = new Map<string, string>()
    if (companias.fase === 'hecho' && companias.r.estado === 'ok') for (const c of companias.r.companias) m.set(c.codigoDgs, c.nombreComun)
    return m
  }, [companias])

  if (r === null) return null
  if (r.estado !== 'ok') {
    return (
      <Bloque Icono={Percent} titulo="Comisiones por compañía" sub="No se ha podido comprobar. No significa que no haya cuadros.">
        <p style={{ fontSize: 12, ...gris, margin: 0 }}>
          {r.estado === 'sin_configurar' ? 'falta ASEGURA_OPERADOR_SECRET en este proyecto' : r.motivo}
        </p>
      </Bloque>
    )
  }

  const conCuadro = r.lineas.filter((l) => l.cuadro.length > 0).length
  return (
    <Bloque
      Icono={Percent}
      titulo="Comisiones por compañía"
      sub={`Lo firmado frente a lo que aplican los recibos de CIMA (24 meses). ${conCuadro} de ${r.lineas.length} productos con cuadro apuntado.`}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
          <thead>
            <tr style={{ textAlign: 'left', ...gris, fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: '4px 8px 4px 0' }}>Compañía · producto</th>
              <th style={{ padding: '4px 8px' }}>Firmado</th>
              <th style={{ padding: '4px 8px' }}>Real en recibos</th>
              <th style={{ padding: '4px 8px' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {r.lineas.map((l) => {
              const v = VEREDICTO[l.veredicto]
              return (
                <tr key={`${l.companiaCodigo}|${l.producto}`} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                  <td style={{ padding: '6px 8px 6px 0' }}>
                    <div style={{ fontWeight: 600 }}>{nombres.get(l.companiaCodigo) ?? l.companiaCodigo}</div>
                    <div style={{ fontSize: 11, ...gris }}>{l.producto}{l.productoNombre ? ` · ${l.productoNombre}` : ''}</div>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    {l.cuadro.length ? l.cuadro.map((e) => <Cuadro key={`${e.modalidad}|${e.acuerdo}`} e={e} />) : <span style={gris}>—</span>}
                    {l.extras.map((x) => (
                      <div key={`${x.modalidad}|${x.acuerdo}`} style={{ fontSize: 11, color: 'var(--primary)' }}>
                        Extra {x.acuerdo}{x.modalidad ? ` (${x.modalidad})` : ''}: {x.puntosNueva === x.puntosCartera
                          ? `${x.puntosNueva >= 0 ? '+' : ''}${x.puntosNueva.toLocaleString('es-ES')} puntos`
                          : `${x.puntosNueva.toLocaleString('es-ES')} / ${x.puntosCartera.toLocaleString('es-ES')} puntos (1º año / cartera)`}
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    {l.real ? (
                      <>
                        <div>{pct(l.real.pctMedio)}</div>
                        <div style={{ fontSize: 11, ...gris }}>
                          {l.real.pctMin === l.real.pctMax ? '' : `${pct(l.real.pctMin)} – ${pct(l.real.pctMax)} · `}{l.real.recibos} recibos
                        </div>
                      </>
                    ) : <span style={gris}>—</span>}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <Badge tono={v.tono} title={v.title}>{v.texto}</Badge>
                    {l.fuera > 0 && <div style={{ fontSize: 11, ...gris }}>{l.fuera} fuera de cuadro</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {(r.truncado || r.sinProducto > 0) && (
        <p style={{ fontSize: 12, ...gris, margin: '10px 0 0' }}>
          {r.truncado && 'Se ha alcanzado el máximo de recibos leídos: el % real puede estar incompleto. '}
          {r.sinProducto > 0 && `${r.sinProducto} recibos sin código de producto en CIMA no se pueden cruzar con ningún cuadro.`}
        </p>
      )}
    </Bloque>
  )
}

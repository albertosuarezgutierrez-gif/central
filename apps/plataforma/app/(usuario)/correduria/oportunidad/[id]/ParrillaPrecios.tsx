'use client'

// «Parrilla de precios» del riesgo (13/10/2026): UNA tabla por oportunidad con, por COMPAÑÍA, la prima de Avant2 (la última
// tarificación pagada de esta oportunidad) frente a la del bot de la compañía (su último presupuesto), la diferencia en € y
// % y si «cuadra». Decisión de Alberto: conviven hasta que el bot cuadre; entonces se retira Avant2 para esa compañía.
// El cruce (identidad DGS, tres estados, periodo) vive en `parrilla-precios.ts`, puro y con test.
//
// 🚨 Solo LEE: aquí no hay ningún botón que tarifique. Recotizar con Avant2 cuesta 0,50€ y va por «Pedir precio»; los bots,
// por «Presupuestos de compañías». Emitir, PDF y archivar siguen en sus bloques.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Scale } from 'lucide-react'
import { Badge, TablaScroll, btnStyle, cardStyle, type Tono } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { vistaPrecio } from '@/lib/tarificador-asegura-reglas'
import type { TrabajoCompania } from '@/lib/presupuestos-companias'
import { leerAvant2DeOportunidad } from './parrilla-acciones'
import {
  UMBRAL_CUADRA_PCT, construirParrilla, rotuloVeredicto, textoPct,
  type CeldaAvant2, type CeldaBot, type LadoAvant2, type LadoBot, type TrabajoBotParrilla, type Veredicto,
} from './parrilla-precios'

/** Los trabajos de «Presupuestos de compañías» → entrada de la parrilla, con la prima ANUAL (`vistaPrecio`). */
export function trabajosParaParrilla(trabajos: readonly TrabajoCompania[]): TrabajoBotParrilla[] {
  return trabajos.map((t) => ({
    compania: t.compania,
    estado: t.estado,
    creadoEn: t.creadoEn,
    error: t.error ? { mensaje: t.error.mensaje } : null,
    ofertas: t.ofertas.map((o) => ({ producto: o.producto || null, primaAnual: vistaPrecio(o, o.fechaTerminoPortal).total })),
  }))
}

type CargaAvant2 = { estado: 'cargando' } | LadoAvant2

function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: '2-digit' })
}

function tonoVeredicto(v: Veredicto): Tono {
  if (v.tipo === 'comparada') return v.cuadra === true ? 'positivo' : v.cuadra === false ? 'aviso' : 'neutral'
  if (v.tipo === 'sin_leer') return 'negativo'
  if (v.tipo === 'solo_avant2' || v.tipo === 'solo_bot') return 'info'
  return 'neutral'
}

const MUTED = { fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' } as const

function Detalle({ producto, modalidad, franquiciaEur, opciones }: { producto: string | null; modalidad: string | null; franquiciaEur: number | null; opciones: number }) {
  return (
    <>
      {producto && <div style={MUTED}>{producto}</div>}
      {/* Hueco para modalidad y franquicia: Avant2 las da a veces; los bots, cuando las lean. Sin dato no se pinta nada. */}
      {modalidad && <div style={MUTED}>Modalidad: {modalidad}</div>}
      {franquiciaEur !== null && <div style={MUTED}>{franquiciaEur === 0 ? 'Sin franquicia' : `Franquicia ${eur(franquiciaEur)}`}</div>}
      {opciones > 1 && <div style={MUTED}>La más barata de {opciones} opciones</div>}
    </>
  )
}

function CeldaA({ c }: { c: CeldaAvant2 }) {
  switch (c.estado) {
    case 'precio':
      return (
        <>
          <strong>{eur(c.prima)}</strong>
          {c.meses !== null && c.meses !== 12 && <div style={MUTED}>{c.meses} meses</div>}
          <Detalle {...c} />
        </>
      )
    case 'sin_precio': return <span style={MUTED}>Salió sin importe</span>
    case 'no_pedido': return <span style={MUTED}>No tarificada</span>
    case 'no_aplica': return <span style={MUTED}>Avant2 no cotiza este ramo</span>
    case 'sin_leer': return <span style={{ ...MUTED, color: 'var(--warning)' }}>No se ha podido leer</span>
  }
}

function CeldaB({ c }: { c: CeldaBot }) {
  switch (c.estado) {
    case 'precio': return <><strong>{eur(c.prima)}</strong><Detalle {...c} /></>
    case 'en_curso': return <span style={MUTED}>El bot está cotizando…</span>
    case 'error': return <span style={{ ...MUTED, color: 'var(--negative)' }}>Falló: {c.mensaje}</span>
    case 'sin_precio': return <span style={MUTED}>Terminó sin precio</span>
    case 'no_pedido': return <span style={MUTED}>Hay bot; no se ha pedido</span>
    case 'sin_bot': return <span style={MUTED}>Sin bot para este ramo</span>
    case 'sin_leer': return <span style={{ ...MUTED, color: 'var(--warning)' }}>No se ha podido leer</span>
  }
}

function Diferencia({ v }: { v: Veredicto }) {
  if (v.tipo === 'comparada') {
    const signo = v.difEur > 0 ? '+' : v.difEur < 0 ? '−' : ''
    return (
      <>
        <strong>{signo}{eur(Math.abs(v.difEur))}</strong> <span style={MUTED}>({textoPct(v.difPct)})</span>
        {v.reserva && <div style={MUTED}>{v.reserva}</div>}
      </>
    )
  }
  if (v.tipo === 'no_comparable') return <span style={MUTED}>{v.motivo}</span>
  return <span style={MUTED}>—</span>
}

export default function ParrillaPrecios({ oportunidadId, claveVariantes, bot }: {
  oportunidadId: string
  /** Cambia cuando se pide precio otra vez (ids de las variantes): se relee el lado Avant2 (gratis). */
  claveVariantes: string
  /** Lado bot; `null` = aún leyéndose en «Presupuestos de compañías». */
  bot: LadoBot | null
}) {
  const [avant2, setAvant2] = useState<CargaAvant2>({ estado: 'cargando' })
  const leer = useCallback(() => {
    let vivo = true
    setAvant2({ estado: 'cargando' })
    leerAvant2DeOportunidad({ oportunidadId })
      .then((r) => { if (vivo) setAvant2(r) })
      .catch(() => { if (vivo) setAvant2({ estado: 'sin_leer', motivo: 'Sin conexión con plataforma.' }) })
    return () => { vivo = false }
  }, [oportunidadId])
  // Se relee al llegar y cada vez que cambian las variantes del riesgo (se acaba de pedir precio).
  useEffect(() => {
    void claveVariantes
    return leer()
  }, [leer, claveVariantes])

  const parrilla = useMemo(
    () => (avant2.estado === 'cargando' || bot === null ? null : construirParrilla(avant2, bot)),
    [avant2, bot],
  )
  if (parrilla?.vacia) return null

  return (
    <section aria-labelledby="parrilla-titulo" style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }}>
      <div id="parrilla-titulo" style={{ fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Scale size={16} aria-hidden /> Parrilla de precios
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
        Por compañía: la última tarificación de Avant2
        {avant2.estado === 'ok' ? ` (${avant2.referencia ?? 'sin referencia'}${fechaCorta(avant2.creadaEn) ? `, ${fechaCorta(avant2.creadaEn)}` : ''})` : ''} frente al
        último presupuesto del bot, en prima anual. «Cuadra» si la diferencia es de {UMBRAL_CUADRA_PCT} % o menos. Aquí solo se compara:
        volver a tarificar con Avant2 cuesta 0,50€ y se hace en «Pedir precio».
      </p>

      {avant2.estado === 'ok' && avant2.caducada && (
        <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--warning)' }}>La tarificación de Avant2 ya está caducada (efecto pasado): sirve para comparar, no para emitir.</p>
      )}
      {avant2.estado === 'ok' && avant2.simulado && (
        <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>La variante de Avant2 es una simulación.</p>
      )}
      {avant2.estado === 'sin_leer' && (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--warning)' }}>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>Avant2: {avant2.motivo} No es que no haya precio: no se ha podido mirar.</span>
          <button type="button" onClick={() => leer()} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Volver a leer (gratis)</button>
        </div>
      )}
      {bot?.estado === 'sin_leer' && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)', overflowWrap: 'anywhere' }}>Bots: {bot.motivo}</p>
      )}

      {parrilla === null ? (
        <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Leyendo los precios…</p>
      ) : parrilla.filas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Aún no hay precios de ninguna compañía para este riesgo.</p>
      ) : (
        <TablaScroll>
          <table className="tabla-parrilla" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12 }}>
                <th scope="col" style={{ padding: '6px 8px' }}>Compañía</th>
                <th scope="col" style={{ padding: '6px 8px' }}>Avant2</th>
                <th scope="col" style={{ padding: '6px 8px' }}>Bot</th>
                <th scope="col" style={{ padding: '6px 8px' }}>Diferencia (bot − Avant2)</th>
                <th scope="col" style={{ padding: '6px 8px' }}>¿Cuadra?</th>
              </tr>
            </thead>
            <tbody>
              {parrilla.filas.map((f) => (
                <tr key={f.clave} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                  <td data-rol="cabeza" style={{ padding: '8px', fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {f.nombre}
                    {f.codigoDgs === null && <div style={{ ...MUTED, color: 'var(--warning)', fontWeight: 400 }}>Sin código DGS: no se cruza</div>}
                  </td>
                  <td data-label="Avant2" style={{ padding: '8px' }}><CeldaA c={f.avant2} /></td>
                  <td data-label="Bot" style={{ padding: '8px' }}><CeldaB c={f.bot} /></td>
                  <td data-label="Diferencia" style={{ padding: '8px' }}><Diferencia v={f.veredicto} /></td>
                  <td data-label="¿Cuadra?" style={{ padding: '8px' }}><Badge tono={tonoVeredicto(f.veredicto)}>{rotuloVeredicto(f.veredicto)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      )}
      {parrilla && parrilla.sinIdentificar.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
          {parrilla.sinIdentificar.join(', ')}: sin código DGS en la tabla de identidad (`parrilla-precios.ts`), así que no se cruzan con nada. Añadirlas con su test.
        </p>
      )}
    </section>
  )
}

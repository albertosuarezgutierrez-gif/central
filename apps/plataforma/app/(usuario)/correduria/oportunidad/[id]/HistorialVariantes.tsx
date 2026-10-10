'use client'

// «Presupuestos de este riesgo»: una fila por variante (P1…Pn), la más reciente arriba, con qué
// cambió respecto a la anterior. Tres estados que NO se colapsan: `cambios = []` en la primera es
// «Primera»; `null` es «no se puede comparar» (nunca «igual»); un `nPrecios` o un presupuesto que
// no se pudo leer se dice como tal, nunca como 0 o «sin enviar».

import { useEffect, useRef, useState } from 'react'
import { Badge, BtnLink, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { estadoPresupuestoVariante, ordenarParaComparar, type Riesgo, type VarianteRiesgo } from '@/lib/riesgo-asegura'
import { LogoCompaniaEnLinea } from '../../CeldaCompania'
import CompararVariantes from './CompararVariantes'
import { PRECIOS_VARIANTE } from './cotizadores-embebidos'
import { ramoCotizadorEmbebido } from './cotizador-embebido'
import { fechaEs } from './piezas-riesgo'
import { ramoRetomable, ramoVariante, rutaVariante, tomadorDelRiesgo } from './variante'

/** Como mucho dos marcadas: marcar una tercera suelta la más antigua de las marcadas. */
const MAX_COMPARAR = 2

export default function HistorialVariantes({ riesgo, abrirPrecios = null }: {
  riesgo: Riesgo
  /** La variante recién pedida desde el bloque «Pedir precio» (cotizador embebido): se abre con sus precios para emitir. */
  abrirPrecios?: string | null
}) {
  const op = riesgo.oportunidad
  // Ramos con cotizador embebido (moto 07/10/2026, auto 10/10/2026; `PRECIOS_VARIANTE`): los precios de una variante y
  // su «Emitir» se abren AQUÍ (`<Emision>` en la misma página), no en la pantalla `…-nuevo`. Una retarificación de
  // póliza sigue abriéndose en SU pantalla.
  const ramoEmbebido = ramoCotizadorEmbebido(op.ramo)
  const PreciosVariante = ramoEmbebido ? PRECIOS_VARIANTE[ramoEmbebido] : null
  const preciosAqui = PreciosVariante !== null
  const [conPrecios, setConPrecios] = useState<string | null>(null)
  const yaAbierta = useRef<string | null>(null)
  useEffect(() => {
    // Solo cuando la variante ya está en la lista (tras releer el riesgo) y una vez por variante pedida.
    if (!abrirPrecios || yaAbierta.current === abrirPrecios || !riesgo.variantes.some((v) => v.id === abrirPrecios)) return
    yaAbierta.current = abrirPrecios
    setConPrecios(abrirPrecios)
    document.getElementById(`variante-${abrirPrecios}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [abrirPrecios, riesgo.variantes])
  const ramo = ramoVariante(op.ramo)
  const vs = riesgo.variantes
  // «Abrir» cotiza con los intervinientes VIGENTES del riesgo: solo se ofrece en las variantes cuyo
  // tomador es el vigente, o la pantalla mezclaría el tomador de P1 con las figuras de hoy.
  const tomadorVigente = tomadorDelRiesgo(riesgo)
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [comparando, setComparando] = useState<[VarianteRiesgo, VarianteRiesgo] | null>(null)
  // Solo cuentan las que siguen en el riesgo (tras releerlo, una marcada puede haber desaparecido).
  const vigentes = marcadas.filter((id) => vs.some((v) => v.id === id))
  const par = ordenarParaComparar(vs, vigentes)
  const marcar = (id: string) =>
    setMarcadas((xs) => {
      const ys = xs.filter((x) => vs.some((v) => v.id === x))
      return ys.includes(id) ? ys.filter((x) => x !== id) : [...ys, id].slice(-MAX_COMPARAR)
    })
  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 10, minWidth: 0 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Presupuestos de este riesgo</div>
        {vs.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>De la más reciente a la más antigua. «Qué cambió» es contra la anterior.</div>}
      </div>
      {vs.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Aún no se ha pedido precio para este riesgo.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {vs.map((v, i) => (
            <Fila
              key={v.id} v={v} primera={i === vs.length - 1}
              abrir={
                // Una retarificación de póliza se reabre en SU pantalla: en la de cliente nuevo saldría
                // en blanco y pedir precio ahí sería pagar otra vez por un presupuesto sin póliza.
                v.polizaId
                  ? `/correduria/poliza/${encodeURIComponent(v.polizaId)}/retarificar?oportunidad=${encodeURIComponent(op.id)}`
                  // Cotizador embebido: sin enlace a otra pantalla; sus precios se abren aquí abajo («Ver precios y emitir»).
                  : preciosAqui ? null
                  // Solo auto y moto retoman su tarificación guardada: en los demás ramos «Abrir» sería una
                  // pantalla de precio en blanco (pagar otra vez), así que no se ofrece.
                  : ramo && ramoRetomable(op.ramo) && v.tomador.clienteId === tomadorVigente ? rutaVariante(ramo, tomadorVigente, op.id, v.id) : null
              }
              precios={
                // La tarificación es de SU tomador: con él se lee (gratis). Sin tomador que conste, no se ofrece.
                PreciosVariante && !v.polizaId && v.tomador.clienteId !== null
                  ? {
                      abierto: conPrecios === v.id,
                      alternar: () => setConPrecios((x) => (x === v.id ? null : v.id)),
                      panel: <PreciosVariante clienteId={v.tomador.clienteId} oportunidadId={op.id} tarificacionId={v.id} simulado={v.simulado} />,
                    }
                  : null
              }
              otroTomador={!v.polizaId && v.tomador.clienteId !== null && v.tomador.clienteId !== tomadorVigente}
              comparable={vs.length > 1} marcada={vigentes.includes(v.id)} onMarcar={() => marcar(v.id)}
            />
          ))}
        </ul>
      )}
      {vs.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {par ? (
            <button type="button" onClick={() => setComparando(par)} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
              Comparar {par[0].referencia} y {par[1].referencia}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Marca «Comparar» en dos presupuestos para verlos lado a lado.</span>
          )}
        </div>
      )}
      {comparando && (
        <CompararVariantes oportunidadId={op.id} a={comparando[0]} b={comparando[1]} onCerrar={() => setComparando(null)} />
      )}
    </section>
  )
}

function Fila({ v, primera, abrir, precios, otroTomador, comparable, marcada, onMarcar }: {
  v: VarianteRiesgo; primera: boolean; abrir: string | null; otroTomador: boolean
  /** Cotizador embebido: los precios y «Emitir» de esta variante, plegados en la propia fila. `null` = no se ofrece. */
  precios: { abierto: boolean; alternar: () => void; panel: React.ReactNode } | null
  comparable: boolean; marcada: boolean; onMarcar: () => void
}) {
  const estado = estadoPresupuestoVariante(v.presupuesto)
  return (
    <li id={`variante-${v.id}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 15 }}>{v.referencia}</strong>
        {v.creadoAt && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{fechaEs(v.creadoAt)}</span>}
        <span style={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
          · Tomador: {v.tomador.nombre ?? <span style={{ color: 'var(--muted)' }}>no consta</span>}
        </span>
        {v.simulado && <Badge tono="aviso">simulado</Badge>}
        {comparable && (
          <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, minHeight: 44, cursor: 'pointer' }}>
            <input type="checkbox" checked={marcada} onChange={onMarcar} style={{ width: 20, height: 20 }} />
            Comparar
          </label>
        )}
      </div>
      {v.nota && <div style={{ fontSize: 13, fontStyle: 'normal', color: 'var(--text)' }}>«{v.nota}»</div>}

      <Cambios cambios={v.cambios} primera={primera} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        {v.mejor
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>Mejor prima <strong>{eur(v.mejor.primaEur)}</strong><LogoCompaniaEnLinea compania={v.mejor.compania} /></span>
          : <span style={{ color: 'var(--muted)' }}>Sin precio</span>}
        <span style={{ color: 'var(--muted)' }}>· {v.nPrecios === null ? '—' : `${v.nPrecios} ${v.nPrecios === 1 ? 'opción' : 'opciones'}`}</span>
        <Badge tono={estado === null ? 'neutral' : estado === 'Retirado' ? 'negativo' : estado === 'Emitido' || estado === 'Aceptado' ? 'positivo' : 'info'}>
          {estado ?? 'Sin preparar'}
        </Badge>
        {otroTomador && (
          <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>Para repetirla, pon a {v.tomador.nombre ?? 'su tomador'} de tomador en Intervinientes.</span>
        )}
        {abrir && (
          <span style={{ marginLeft: 'auto' }}>
            <BtnLink href={abrir} variante="secundario">Abrir</BtnLink>
          </span>
        )}
        {precios && (
          <span style={{ marginLeft: 'auto' }}>
            <button type="button" onClick={precios.alternar} aria-expanded={precios.abierto} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
              {precios.abierto ? 'Ocultar precios' : 'Ver precios y emitir'}
            </button>
          </span>
        )}
      </div>
      {precios?.abierto && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, minWidth: 0 }}>{precios.panel}</div>
      )}
    </li>
  )
}

function Cambios({ cambios, primera }: { cambios: VarianteRiesgo['cambios']; primera: boolean }) {
  if (cambios === null) return <div style={{ fontSize: 13, color: 'var(--muted)' }}>Qué cambió: no se puede comparar con la anterior.</div>
  if (cambios.length === 0) return <div style={{ fontSize: 13, color: 'var(--muted)' }}>{primera ? 'Primera' : 'Mismos datos que la anterior'}</div>
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
      {cambios.map((c, i) => (
        <span key={`${c.campo}-${i}`} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: 'var(--primary-light)', color: 'var(--text)', overflowWrap: 'anywhere', maxWidth: '100%' }}>
          {c.campo}: {c.antes ?? '—'} → {c.despues ?? '—'}
        </span>
      ))}
    </div>
  )
}

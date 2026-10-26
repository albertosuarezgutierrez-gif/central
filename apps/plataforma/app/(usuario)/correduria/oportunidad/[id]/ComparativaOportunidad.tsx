'use client'

// La COMPARATIVA ÚNICA de la oportunidad (21/10/2026): todas las fuentes (Avant2, PDFs, bots, póliza en cartera) por el
// MISMO motor que el PDF y la página del cliente. Precios por opción con compañía + NIVEL, orden explicado (no es una
// recomendación), coberturas en TRES estados y el resumen guardado con su etiqueta. Gratis: no gasta Codeoscopic ni IA.
// 📱 Opciones en tarjetas apiladas (≥320 px); el cuadro de coberturas, plegado y montado al abrirlo, ~40 filas + «Ver más».

import { useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import type { EstadoTriple } from '@central/module-seguros'
import { TEXTO_ESTADO3, filasPrecios, preciosConSupuestos, textoProyecto, textoVerificacionPdf, type LecturaComparativa } from '@/lib/correduria/comparativa-asegura'
import { CeldaCompania } from '../../CeldaCompania'

const FILAS_INICIO = 40
const COLOR3: Record<EstadoTriple, string> = { incluida: 'var(--positive)', no_incluida: 'var(--negative)', no_se_sabe: 'var(--muted)' }

/** El aviso de una cotización de Avant2 ya pagada, para ponerlo ANTES del botón de pedir precio (0,50€). */
export function AvisoAvant2Guardada({ lectura }: { lectura: LecturaComparativa | null }) {
  if (lectura?.estado !== 'ok' || !lectura.datos.avant2) return null
  const a = lectura.datos.avant2
  return (
    <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: a.caducada ? 'var(--warning)' : 'var(--text)', overflowWrap: 'anywhere' }}>
      {a.aviso} <a href="#comparativa" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Ver la comparativa ↓</a>
    </p>
  )
}

export default function ComparativaOportunidad({ lectura, onRecargar }: { lectura: LecturaComparativa | null; onRecargar: () => void }) {
  const [verCoberturas, setVerCoberturas] = useState(false)
  const [todas, setTodas] = useState(false)

  if (lectura === null) {
    return <section id="comparativa" style={{ ...cardStyle, fontSize: 13, color: 'var(--muted)' }}>Leyendo la comparativa…</section>
  }
  if (lectura.estado !== 'ok') {
    const texto = lectura.estado === 'sin_configurar' ? 'No se puede leer: falta conectar el puerto con central-asegura.'
      : lectura.estado === 'no_encontrado' ? 'Esta oportunidad no existe en la correduría.'
      : `No se ha podido leer la comparativa (${lectura.motivo}). No es que no haya precios: no se han podido mirar.`
    return (
      <section id="comparativa" style={{ ...cardStyle, display: 'grid', gap: 8, fontSize: 13 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Comparativa</div>
        <span style={{ color: 'var(--negative)' }}>{texto}</span>
        <div><button type="button" onClick={onRecargar} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Reintentar</button></div>
      </section>
    )
  }
  const { comparacion: c, guardado, polizaCartera, ofertasBot } = lectura.datos
  const filas = filasPrecios(c)
  const proyectoDe = new Map(ofertasBot.map((p) => [p.ofertaId, p]))
  const porCorregir = preciosConSupuestos(filas, ofertasBot)
  const etiquetaDe = new Map(filas.map((f) => [f.id, f.etiqueta]))
  const matriz = todas ? c.filas : c.filas.slice(0, FILAS_INICIO)

  return (
    <section id="comparativa" aria-labelledby="comparativa-titulo" style={{ ...cardStyle, display: 'grid', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div id="comparativa-titulo" style={{ fontSize: 14, fontWeight: 600 }}>Comparativa ({filas.filter((f) => f.rol === 'oferta').length} opciones)</div>
        <button type="button" onClick={onRecargar} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Releer</button>
      </div>
      <AvisoAvant2Guardada lectura={lectura} />
      {polizaCartera === 'no_encontrada' && <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>La póliza de la oportunidad no se encuentra en la cartera de este cliente: no entra como «actual».</p>}

      {filas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Aún no hay ninguna oferta ni cotización guardada para esta oportunidad.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }}>
          {filas.map((f) => (
            <article key={f.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gap: 6, minWidth: 0, borderColor: f.rol === 'actual' ? 'var(--primary)' : undefined }}>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'flex-start', minWidth: 0 }}>
                <CeldaCompania compania={f.compania} producto={null} />
                {f.rol === 'actual' ? <Badge tono="info">Actual</Badge> : f.posicion !== null ? <Badge tono="neutral">{`${f.posicion}º${f.empate ? ' (empate)' : ''}`}</Badge> : <Badge tono="aviso">Sin orden</Badge>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{f.etiqueta}</div>
              <div style={{ fontSize: 18, fontWeight: 700, overflowWrap: 'anywhere' }}>{f.precio.texto}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.fuente}{f.estimado ? ' · precio estimado' : ''}{!f.precio.comparable && f.precio.texto !== 'No figura' ? ' · no se compara como anual' : ''}</div>
              {proyectoDe.get(f.id) && (() => {
                const p = proyectoDe.get(f.id)!
                const fallo = p.verificacion?.estado === 'discrepancia' || p.estadoCaducidad === 'caducado'
                return (
                  <div style={{ display: 'grid', gap: 2, fontSize: 12, overflowWrap: 'anywhere' }}>
                    <span style={{ color: p.estadoCaducidad === 'caduca_pronto' || p.estadoCaducidad === 'caducado' ? 'var(--warning)' : 'var(--muted)', fontWeight: p.estadoCaducidad === 'vigente' || p.estadoCaducidad === 'desconocida' ? 400 : 700 }}>
                      {textoProyecto(p)}{p.estadoCaducidad === 'caducado' ? ' (caducado)' : ''}
                    </span>
                    <span style={{ color: fallo ? 'var(--warning)' : 'var(--muted)' }}>{textoVerificacionPdf(p.verificacion)}</span>
                    {p.precio && <span style={{ fontWeight: 600, color: p.precio.estado === 'limpio' ? 'var(--positive)' : 'var(--warning)' }}>{p.precio.estado === 'limpio' ? 'Limpio' : 'Con supuestos'}</span>}
                  </div>
                )
              })()}
              {(f.motivos.length > 0 || f.reservas.length > 0) && (
                <details style={{ fontSize: 12 }}>
                  <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Por qué este puesto{f.reservas.length ? ` · ${f.reservas.length} reservas` : ''}</summary>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {f.motivos.map((m, i) => <li key={`m${i}`}>{m}</li>)}
                    {f.reservas.map((r, i) => <li key={`r${i}`} style={{ color: 'var(--warning)' }}>{r}</li>)}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
      {ofertasBot.length > 0 && (
        porCorregir.length > 0 ? (
          <div role="status" style={{ border: '1px solid var(--warning)', borderRadius: 8, padding: 10, display: 'grid', gap: 4, fontSize: 13, minWidth: 0 }}>
            <strong>Antes de enviar: corrige los supuestos de {porCorregir.length === 1 ? 'este precio' : `estos ${porCorregir.length} precios`}</strong>
            {porCorregir.map((x) => (
              <div key={x.etiqueta} style={{ overflowWrap: 'anywhere' }}>
                <span style={{ fontWeight: 600 }}>{x.etiqueta}</span>
                <ul style={{ margin: '2px 0 0', paddingLeft: 18, color: 'var(--muted)', fontSize: 12 }}>{x.supuestos.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            ))}
          </div>
        ) : null
      )}
      {c.ranking && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{c.ranking.criterio}</p>}

      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Resumen</div>
        {guardado?.narrativa ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{guardado.etiqueta ?? 'Resumen'}{guardado.vigente ? '' : ' · de un presupuesto anterior: las ofertas han cambiado desde entonces'}</span>
            <p style={{ margin: 0, fontSize: 13, overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{guardado.narrativa.resumen}</p>
            <p style={{ margin: 0, fontSize: 13, overflowWrap: 'anywhere' }}>{guardado.narrativa.recomendacion}</p>
          </>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Aún no hay resumen: se redacta al generar el presupuesto (con IA si hay cupo; si no, con la plantilla del cuadro, y se dice).</span>
        )}
      </div>

      {c.filas.length > 0 && (
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <button type="button" aria-expanded={verCoberturas} onClick={() => setVerCoberturas((v) => !v)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, justifySelf: 'start' }}>
            {verCoberturas ? 'Ocultar coberturas' : `Ver coberturas (${c.filas.length})`}
          </button>
          {verCoberturas && (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>✓ incluida · ✗ no incluida · ? no se sabe (no figura o no se ha leído; no quiere decir que no la cubra)</span>
              <div style={{ overflowX: 'auto', maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 160 + 120 * c.ofertas.length, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th scope="col" style={{ ...th, position: 'sticky', left: 0, zIndex: 1, textAlign: 'left' }}>Cobertura</th>
                      {c.ofertas.map((o) => <th key={o.id} scope="col" style={th}>{etiquetaDe.get(o.id) ?? o.compania}{o.rol === 'actual' ? ' (actual)' : ''}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matriz.map((fila) => (
                      <tr key={fila.clave}>
                        <th scope="row" style={{ ...td, position: 'sticky', left: 0, background: 'var(--surface)', textAlign: 'left', fontWeight: 500 }}>{fila.etiqueta}</th>
                        {c.ofertas.map((o) => {
                          const celda = fila.celdas.find((x) => x.ofertaId === o.id)
                          const e: EstadoTriple = celda?.estado3 ?? 'no_se_sabe'
                          return (
                            <td key={o.id} style={{ ...td, textAlign: 'center', color: COLOR3[e] }}>
                              <span role="img" aria-label={TEXTO_ESTADO3[e].texto} style={{ fontWeight: 700 }}>{TEXTO_ESTADO3[e].glifo}</span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!todas && c.filas.length > FILAS_INICIO && (
                <button type="button" onClick={() => setTodas(true)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, justifySelf: 'start' }}>Ver más ({c.filas.length - FILAS_INICIO})</button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

const th: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', verticalAlign: 'bottom', overflowWrap: 'anywhere' }
const td: React.CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'middle', overflowWrap: 'anywhere' }

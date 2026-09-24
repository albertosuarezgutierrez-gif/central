'use client'
import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { btnStyle, TablaScroll } from '@/components/ui'
import { eur } from '@/lib/dinero'
import Bloque from './Bloque'
import {
  companiasSinPrimas,
  csvInforme,
  nombreCompania,
  type ComisionCompania,
  type LecturaInforme,
} from '@/lib/informe-mediacion-asegura'

/**
 * Informe anual de mediación: la hoja de trabajo para la documentación estadístico-contable que la
 * correduría presenta cada año a la DGSFP. NO es el modelo oficial, y lo dice.
 *
 * Plegado y perezoso: solo se pide al abrirlo (es un informe anual, no trabajo de cada día). Lo que
 * falta se declara: compañías con pólizas y sin recibos de CIMA, importes ilegibles, periodos de
 * comisiones sin extracto. Un total que parece completo sin serlo es justo lo que no puede ir a la DGSFP.
 */
type Respuesta = { año: number; puerto: LecturaInforme; comisiones: ComisionCompania[] | null }

const celda = { padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 13, textAlign: 'left' as const, whiteSpace: 'nowrap' as const }
const num = { ...celda, textAlign: 'right' as const }
const aviso = { fontSize: 12, color: 'var(--warning)', margin: '6px 0 0' }

function porqueNoSeLee(p: LecturaInforme): string {
  if (p.estado === 'sin_configurar') return 'el puerto con asegura no está conectado en este proyecto'
  if (p.estado === 'no_desplegado') return 'la versión desplegada de asegura todavía no sirve este informe'
  if (p.estado === 'error') return p.motivo
  return ''
}

function Comisiones({ año, comisiones }: { año: number; comisiones: ComisionCompania[] | null }) {
  const sinComprobar = comisiones?.reduce((s, c) => s + c.periodosSinComprobar, 0) ?? 0
  const sinRetencion = comisiones?.reduce((s, c) => s + c.periodosSinRetencion, 0) ?? 0
  return (
    <div>
      <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Comisiones del libro (bruto, antes de la retención)</h4>
      {comisiones === null
        ? <p style={{ fontSize: 13, color: 'var(--warning)', margin: 0 }}>No se ha podido leer el libro de comisiones.</p>
        : comisiones.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>El libro no tiene periodos de {año}.</p>
          : (
            <TablaScroll>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead><tr><th style={celda}>Compañía</th><th style={num}>Bruto</th><th style={num}>Retención</th><th style={num}>Periodos</th></tr></thead>
                <tbody>
                  {comisiones.map((c) => (
                    <tr key={c.codigo}>
                      <td style={celda}>{c.compania}</td>
                      <td style={num}>{c.bruto === null ? '—' : eur(c.bruto)}</td>
                      <td style={num}>{c.retencion === null ? '—' : eur(c.retencion)}</td>
                      <td style={num}>
                        {c.periodos}
                        {c.periodosSinExtracto > 0 && <span style={{ color: 'var(--warning)' }}> ({c.periodosSinExtracto} sin extracto)</span>}
                        {c.periodosSinComprobar > 0 && <span style={{ color: 'var(--warning)' }}> ({c.periodosSinComprobar} sin comprobar)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablaScroll>
          )}
      {sinComprobar > 0 && (
        <p style={aviso}>⚠️ {sinComprobar} periodo(s) sin comprobar: la última lectura del libro falló y sus importes están fuera del total.</p>
      )}
      {sinRetencion > 0 && (
        <p style={aviso}>⚠️ {sinRetencion} periodo(s) con bruto y sin retención informada: la retención está incompleta.</p>
      )}
    </div>
  )
}

export default function InformeMediacion({ año }: { año: number }) {
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const abierto = useRef(false)

  async function cargar() {
    if (cargando || datos?.año === año) return
    setCargando(true)
    setFallo(null)
    try {
      const res = await fetch(`/api/correduria/informe-mediacion?a%C3%B1o=${año}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDatos((await res.json()) as Respuesta)
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'red')
    }
    setCargando(false)
  }

  // Cambiar el año con el informe abierto lo vuelve a pedir: onToggle no se dispara otra vez.
  useEffect(() => {
    if (abierto.current) void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [año])

  function descargar() {
    if (!datos || datos.puerto.estado !== 'ok') return
    const blob = new Blob(['﻿' + csvInforme(datos.puerto.informe, datos.comisiones)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `informe-mediacion-${datos.año}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const vigente = datos && datos.año === año ? datos : null

  return (
    <Bloque Icono={FileSpreadsheet} titulo={`Informe anual para la DGSFP · ${año}`}
      sub="Hoja de trabajo para rellenar la documentación estadístico-contable. No es el modelo oficial.">
      <details onToggle={(e) => { abierto.current = (e.target as HTMLDetailsElement).open; if (abierto.current) void cargar() }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '12px 0' }}>Ver el informe de {año}</summary>
        {cargando && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Calculando…</p>}
        {fallo && <p style={{ fontSize: 13, color: 'var(--negative)' }}>No se ha podido pedir el informe ({fallo}).</p>}
        {vigente && (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {vigente.puerto.estado !== 'ok' && (
              <p style={{ fontSize: 13, color: 'var(--warning)', margin: 0 }}>
                No se han podido leer las primas y la cartera ({porqueNoSeLee(vigente.puerto)}). No significa que no haya.
              </p>
            )}
            {vigente.puerto.estado === 'ok' && (() => {
              const i = vigente.puerto.informe
              const n = (c: string | null) => nombreCompania(c, i.companias)
              const sin = companiasSinPrimas(i)
              return (
                <div>
                  <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Primas cobradas según CIMA (prima total, con impuestos; por fecha de efecto del recibo)</h4>
                  {i.primas.filas.length === 0
                    ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>CIMA no ha mandado ningún recibo con efecto en {año}.</p>
                    : (
                      <TablaScroll>
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                          <thead><tr>
                            <th style={celda}>Compañía</th><th style={celda}>Ramo</th><th style={num}>Recibos</th>
                            <th style={num}>Primas</th><th style={num}>Nueva prod.</th><th style={num}>Cartera</th><th style={num}>Otras</th>
                            <th style={num}>Sin cobrar</th>
                          </tr></thead>
                          <tbody>
                            {i.primas.filas.map((f) => {
                              const sinCobrar = f.anulados + f.devueltos + f.pendientes + (f.sinSituacion ?? 0)
                              return (
                                <tr key={`${f.compania}|${f.ramo}`}>
                                  <td style={celda}>{n(f.compania)}</td><td style={celda}>{f.ramo ?? 'sin ramo'}</td>
                                  <td style={num}>{f.recibos}</td><td style={num}>{eur(f.primas)}</td>
                                  <td style={num}>{eur(f.primasNuevaProduccion)}</td><td style={num}>{eur(f.primasCartera)}</td>
                                  <td style={num}>{eur(f.primasOtras)}</td>
                                  <td style={num} title={`${f.anulados} anulado(s) · ${f.devueltos} devuelto(s) · ${f.pendientes} pendiente(s) · ${f.sinSituacion ?? 0} sin situación`}>
                                    {sinCobrar}
                                  </td>
                                </tr>
                              )
                            })}
                            <tr style={{ fontWeight: 700 }}>
                              <td style={celda}>Total</td><td style={celda} /><td style={num}>{i.primas.total.recibos}</td>
                              <td style={num}>{eur(i.primas.total.primas)}</td><td style={num}>{eur(i.primas.total.primasNuevaProduccion)}</td>
                              <td style={num}>{eur(i.primas.total.primasCartera)}</td><td style={num}>{eur(i.primas.total.primasOtras)}</td>
                              <td style={num} />
                            </tr>
                          </tbody>
                        </table>
                      </TablaScroll>
                    )}
                  {sin.length > 0 && (
                    <p style={aviso}>
                      ⚠️ Con pólizas en vigor hoy y sin ningún recibo de CIMA en {año}: <strong>{sin.map(n).join(', ')}</strong>. Sus primas no son 0: no constan
                      (se compara con la cartera de hoy, así que en un año pasado puede salir una compañía que entró después).
                    </p>
                  )}
                  {i.primas.ilegibles > 0 && (
                    <p style={aviso}>⚠️ {i.primas.ilegibles} recibo(s) cobrado(s) con un importe que no se ha podido leer: fuera del total.</p>
                  )}
                  {i.primas.sinFecha > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
                      {i.primas.sinFecha} recibo(s) sin fecha de efecto: no se imputan a ningún año.
                    </p>
                  )}
                </div>
              )
            })()}

            <Comisiones año={año} comisiones={vigente.comisiones} />

            {vigente.puerto.estado === 'ok' && (() => {
              const i = vigente.puerto.informe
              return (
                <>
                  <div>
                    <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Pólizas en vigor (hoy, no a 31/12)</h4>
                    <p style={{ fontSize: 13, margin: 0 }}>
                      {i.carteraHoy.reduce((s, c) => s + c.polizas, 0)} pólizas en {new Set(i.carteraHoy.map((c) => c.compania)).size} compañías.
                    </p>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Quejas y reclamaciones del SAC</h4>
                    <p style={{ fontSize: 13, margin: 0 }}>
                      {i.quejas.total} recibida(s) · {i.quejas.cerradasEnPlazo} cerrada(s) en plazo
                      {i.quejas.cerradasFueraDePlazo > 0 && <> · <strong style={{ color: 'var(--negative)' }}>{i.quejas.cerradasFueraDePlazo} fuera de plazo</strong></>}
                      {i.quejas.abiertas > 0 && <> · {i.quejas.abiertas} abierta(s)</>}
                    </p>
                  </div>
                  <button type="button" onClick={descargar} style={{ ...btnStyle('secundario', 'md'), minHeight: 44, justifySelf: 'start' }}>
                    Descargar CSV
                  </button>
                </>
              )
            })()}
          </div>
        )}
      </details>
    </Bloque>
  )
}

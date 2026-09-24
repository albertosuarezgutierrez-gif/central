'use client'
import { useState } from 'react'
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

function porqueNoSeLee(p: LecturaInforme): string {
  if (p.estado === 'sin_configurar') return 'el puerto con asegura no está conectado en este proyecto'
  if (p.estado === 'no_desplegado') return 'la versión desplegada de asegura todavía no sirve este informe'
  if (p.estado === 'error') return p.motivo
  return ''
}

export default function InformeMediacion({ año }: { año: number }) {
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

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

  function descargar() {
    if (!datos || datos.puerto.estado !== 'ok') return
    const blob = new Blob(['﻿' + csvInforme(datos.puerto.informe, datos.comisiones ?? [])], { type: 'text/csv;charset=utf-8' })
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
      <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void cargar() }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '12px 0' }}>Ver el informe de {año}</summary>
        {cargando && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Calculando…</p>}
        {fallo && <p style={{ fontSize: 13, color: 'var(--negative)' }}>No se ha podido pedir el informe ({fallo}).</p>}
        {vigente && vigente.puerto.estado !== 'ok' && (
          <p style={{ fontSize: 13, color: 'var(--warning)' }}>
            No se han podido leer las primas y la cartera ({porqueNoSeLee(vigente.puerto)}). No significa que no haya.
          </p>
        )}
        {vigente && vigente.puerto.estado === 'ok' && (() => {
          const i = vigente.puerto.informe
          const n = (c: string | null) => nombreCompania(c, i.companias)
          const sin = companiasSinPrimas(i)
          return (
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <div>
                <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Primas cobradas según CIMA (por fecha de efecto del recibo)</h4>
                {i.primas.filas.length === 0
                  ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>CIMA no ha mandado ningún recibo con efecto en {año}.</p>
                  : (
                    <TablaScroll>
                      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead><tr>
                          <th style={celda}>Compañía</th><th style={celda}>Ramo</th><th style={num}>Recibos</th>
                          <th style={num}>Primas</th><th style={num}>Nueva prod.</th><th style={num}>Cartera</th>
                        </tr></thead>
                        <tbody>
                          {i.primas.filas.map((f) => (
                            <tr key={`${f.compania}|${f.ramo}`}>
                              <td style={celda}>{n(f.compania)}</td><td style={celda}>{f.ramo ?? 'sin ramo'}</td>
                              <td style={num}>{f.recibos}</td><td style={num}>{eur(f.primas)}</td>
                              <td style={num}>{eur(f.primasNuevaProduccion)}</td><td style={num}>{eur(f.primasCartera)}</td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 700 }}>
                            <td style={celda}>Total</td><td style={celda} /><td style={num}>{i.primas.total.recibos}</td>
                            <td style={num}>{eur(i.primas.total.primas)}</td><td style={num}>{eur(i.primas.total.primasNuevaProduccion)}</td>
                            <td style={num}>{eur(i.primas.total.primasCartera)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </TablaScroll>
                  )}
                {sin.length > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--warning)', margin: '6px 0 0' }}>
                    ⚠️ Con pólizas en vigor y sin ningún recibo de CIMA este año: <strong>{sin.map(n).join(', ')}</strong>. Sus primas no son 0: no constan.
                  </p>
                )}
                {i.primas.ilegibles > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--warning)', margin: '6px 0 0' }}>
                    ⚠️ {i.primas.ilegibles} recibo(s) cobrado(s) con un importe que no se ha podido leer: fuera del total.
                  </p>
                )}
                {i.primas.sinFecha > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
                    {i.primas.sinFecha} recibo(s) sin fecha de efecto: no se imputan a ningún año.
                  </p>
                )}
              </div>

              <div>
                <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Comisiones del libro (bruto, antes de la retención)</h4>
                {vigente.comisiones === null
                  ? <p style={{ fontSize: 13, color: 'var(--warning)', margin: 0 }}>No se ha podido leer el libro de comisiones.</p>
                  : vigente.comisiones.length === 0
                    ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>El libro no tiene periodos de {año}.</p>
                    : (
                      <TablaScroll>
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                          <thead><tr><th style={celda}>Compañía</th><th style={num}>Bruto</th><th style={num}>Retención</th><th style={num}>Periodos</th></tr></thead>
                          <tbody>
                            {vigente.comisiones.map((c) => (
                              <tr key={c.compania}>
                                <td style={celda}>{c.compania}</td>
                                <td style={num}>{c.bruto === null ? '—' : eur(c.bruto)}</td>
                                <td style={num}>{c.retencion === null ? '—' : eur(c.retencion)}</td>
                                <td style={num}>{c.periodos}{c.periodosSinExtracto > 0 && <span style={{ color: 'var(--warning)' }}> ({c.periodosSinExtracto} sin extracto)</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TablaScroll>
                    )}
              </div>

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
            </div>
          )
        })()}
      </details>
    </Bloque>
  )
}

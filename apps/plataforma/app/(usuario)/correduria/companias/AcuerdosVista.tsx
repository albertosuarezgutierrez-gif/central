'use client'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  etiquetaFuente,
  semaforoObjetivo,
  textoPct,
  textoSuma,
  ETIQUETA_ESTADO_CLAVE,
  type Acuerdo,
  type Clave,
  type ObjetivoEvaluado,
  type Produccion,
  type RespuestaAcuerdos,
  type RespuestaProductividad,
} from '@/lib/acuerdos-asegura'

/**
 * Piezas de la vista de acuerdos con compañías (fase 2, 06/10/2026), compartidas
 * por el bloque `Companias.tsx` (resumen en «Datos») y la ficha
 * `/correduria/companias/[codigo]`. Spec §4:
 * docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
 *
 * Reglas que se ven aquí:
 *   · un % que no consta se pinta «—» (`textoPct`), nunca «0 %»;
 *   · una suma sin recibos se pinta «sin recibos» (`textoSuma`), nunca «0,00€»;
 *   · un objetivo pendiente es ⚪ con su motivo (`semaforoObjetivo`), nunca 🟢;
 *   · las líneas de un acuerdo se montan de 15 en 15 (Helvetia tiene decenas) y
 *     la letra pequeña y las notas solo se montan al abrirlas.
 */

const gris = { color: 'var(--muted)' } as const
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null)

export const LINEAS_POR_PAGINA = 15

// ─── Chip ────────────────────────────────────────────────────────────────────
// Antes los chips eran `Badge` (radio 999) dentro de un contenedor flex con
// `align-content: stretch`: al crecer la tarjeta se estiraban en vertical y se
// pintaban como círculos enormes. Aquí la altura es FIJA y el chip no crece
// (`flex: 0 0 auto`, `alignSelf: flex-start`); el texto largo se recorta.
type TonoChip = 'neutral' | 'positivo' | 'aviso' | 'info' | 'negativo'
const COLOR_CHIP: Record<TonoChip, { fg: string; bg: string }> = {
  neutral: { fg: 'var(--muted)', bg: 'var(--primary-light)' },
  positivo: { fg: 'var(--positive)', bg: 'var(--positive-bg)' },
  negativo: { fg: 'var(--negative)', bg: 'var(--negative-bg)' },
  aviso: { fg: 'var(--warning)', bg: 'var(--warning-bg)' },
  info: { fg: 'var(--info)', bg: 'var(--info-bg)' },
}

export function Chip({ tono = 'neutral', children, title }: { tono?: TonoChip; children: ReactNode; title?: string }) {
  const c = COLOR_CHIP[tono]
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', flex: '0 0 auto', alignSelf: 'flex-start',
      height: 22, maxWidth: '100%', boxSizing: 'border-box', padding: '0 8px', borderRadius: 11,
      fontSize: 11, fontWeight: 600, lineHeight: '22px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      background: c.bg, color: c.fg,
    }}>{children}</span>
  )
}

// ─── Chips de una compañía (lista) ───────────────────────────────────────────

export function ChipsAcuerdos({ codigo, r }: { codigo: string; r: RespuestaAcuerdos }) {
  if (r.estado !== 'ok') return <span style={{ fontSize: 11, ...gris }}>Acuerdos: no se han podido comprobar</span>
  const acuerdos = r.acuerdos.filter((a) => a.companiaCodigoDgs === codigo)
  const claves = r.claves.filter((c) => c.companiaCodigoDgs === codigo)
  if (acuerdos.length === 0 && claves.length === 0) return <span style={{ fontSize: 11, ...gris }}>Sin acuerdo cargado</span>
  const sinCotejar = acuerdos.filter((a) => a.revisadoAt === null).length
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', alignContent: 'flex-start', gap: 4, minWidth: 0 }}>
      {acuerdos.map((a) => (
        <Chip key={a.id} tono={a.revisadoAt ? 'positivo' : 'aviso'} title={a.revisadoAt ? `Cotejado el ${fecha(a.revisadoAt.slice(0, 10))}` : 'Extracto sin cotejar con el documento original'}>
          {etiquetaFuente(a)}{a.revisadoAt ? '' : ' · sin cotejar'}
        </Chip>
      ))}
      {claves.map((c) => <ChipClave key={c.id} c={c} />)}
      {acuerdos.length > 0 && claves.length === 0 && (
        <Chip tono="neutral" title="Ninguna clave de mediador registrada para esta compañía: la productividad del acuerdo queda pendiente.">sin clave registrada</Chip>
      )}
      {sinCotejar > 1 && <span style={{ fontSize: 11, ...gris }}>{sinCotejar} sin cotejar</span>}
    </span>
  )
}

function ChipClave({ c }: { c: Clave }) {
  const estado = c.estado.valor === null ? `«${c.estado.crudo}»` : (ETIQUETA_ESTADO_CLAVE[c.estado.valor] ?? c.estado.valor)
  return (
    <Chip tono={c.estado.valor === 'activa' ? 'info' : 'neutral'} title={c.codigosCima.length ? `Códigos en CIMA: ${c.codigosCima.join(', ')}` : 'Sin códigos de CIMA asignados'}>
      Clave {c.etiqueta ?? '(sin etiqueta)'} · {estado}
    </Chip>
  )
}

// ─── Producción de una compañía ──────────────────────────────────────────────

export function ProduccionCompania({ codigo, p, enCima, compacto = false }: {
  codigo: string
  p: RespuestaProductividad
  enCima: boolean | null
  compacto?: boolean
}) {
  if (p.estado !== 'ok') {
    return <p style={{ margin: 0, fontSize: 12, ...gris }}>Producción: no se ha podido comprobar{p.estado === 'error' ? ` (${p.motivo})` : ''}. No significa que no haya.</p>
  }
  const prod: Produccion | null = p.produccion.find((x) => x.companiaCodigoDgs === codigo) ?? null
  if (!prod) {
    return (
      <p style={{ margin: 0, fontSize: 12, ...gris }}>
        {enCima === null
          ? `Sin recibos de CIMA con efecto en ${p.anio} (no se ha podido comprobar si esta compañía envía por CIMA).`
          : enCima
            ? `Sin recibos de CIMA con efecto en ${p.anio}.`
            : `Producción ${p.anio}: no se puede medir (esta compañía no envía por CIMA).`}
        {p.truncado && ' La lectura llegó a su techo: puede faltar alguno.'}
      </p>
    )
  }
  const filas: Array<[string, string]> = [
    ['Nueva producción cobrada', textoSuma(prod.npCobrada)],
    ['Nueva producción en cobro', textoSuma(prod.npPendiente)],
    ['Cartera cobrada', textoSuma(prod.carteraCobrada)],
    ['Comisión aplicada (CIMA)', textoSuma(prod.comisionAplicada)],
  ]
  return (
    <div style={{ display: 'grid', gap: 2, fontSize: compacto ? 12 : 13 }}>
      {!compacto && <div style={{ fontSize: 11, ...gris }}>Producción {p.anio} por fecha de efecto · recibos de CIMA{p.truncado ? ' · ⚠️ lectura incompleta' : ''}</div>}
      {(compacto ? filas.slice(0, 1).concat([filas[2]]) : filas).map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
          <span style={gris}>{k}</span>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        </div>
      ))}
      {!compacto && prod.polizasNp > 0 && <div style={{ fontSize: 11, ...gris }}>{prod.polizasNp} póliza(s) nuevas cobradas.</div>}
      {prod.sinFecha > 0 && <div style={{ fontSize: 11, ...gris }}>{prod.sinFecha} recibo(s) sin fecha de efecto: no se han podido colocar en ningún periodo.</div>}
    </div>
  )
}

// ─── Un acuerdo, entero (ficha) ──────────────────────────────────────────────

export function TarjetaAcuerdo({ a, objetivos, onCotejado }: {
  a: Acuerdo
  objetivos: ObjetivoEvaluado[]
  onCotejado?: (revisadoAt: string) => void
}) {
  const [revisadoAt, setRevisadoAt] = useState(a.revisadoAt)
  const [verLetra, setVerLetra] = useState(false)
  const vigencia = `desde ${fecha(a.vigenciaDesde)}${a.vigenciaHasta ? ` hasta ${fecha(a.vigenciaHasta)}` : ' · sin fecha de fin'}`

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>{etiquetaFuente(a)}</strong>
          <span style={{ fontSize: 12, ...gris }}> · {vigencia}</span>
        </div>
        {revisadoAt
          ? <Chip tono="positivo" title="Cotejado con el documento original">Cotejado el {fecha(revisadoAt.slice(0, 10))}</Chip>
          : <Chip tono="aviso" title="Extracto sin cotejar: ningún objetivo se da por bueno hasta cotejarlo">Sin cotejar</Chip>}
      </div>

      {a.claveId === null && (
        <p style={{ margin: 0, fontSize: 12, ...gris }}>
          ⚪ Sin clave asignada: no se sabe qué producción cuenta para este acuerdo. Comisión esperada y objetivos, pendientes.
        </p>
      )}

      <LineasPaginadas lineas={a.comisiones} />

      <ObjetivosAcuerdo a={a} objetivos={objetivos} />

      {a.requisitosApertura && (
        <p style={{ margin: 0, fontSize: 12 }}><span style={gris}>Requisito de apertura: </span>{a.requisitosApertura}</p>
      )}

      {a.letraPequena && (
        <div>
          <button type="button" style={btnStyle('sutil', 'sm')} onClick={() => setVerLetra((v) => !v)} aria-expanded={verLetra}>
            {verLetra ? 'Ocultar letra pequeña' : 'Ver letra pequeña'}
          </button>
          {verLetra && <p style={{ margin: '6px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.letraPequena}</p>}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, ...gris, overflowWrap: 'anywhere', minWidth: 0 }}>Fuente: {a.documentoFuente}</span>
        {!revisadoAt && (
          <CotejarBoton acuerdoId={a.id} onHecho={(r) => { setRevisadoAt(r); onCotejado?.(r) }} />
        )}
      </div>
    </div>
  )
}

function LineasPaginadas({ lineas }: { lineas: Acuerdo['comisiones'] }) {
  const [visibles, setVisibles] = useState(LINEAS_POR_PAGINA)
  const [nota, setNota] = useState<string | null>(null)
  if (lineas.length === 0) return <p style={{ margin: 0, fontSize: 12, ...gris }}>Sin líneas de comisión en este acuerdo.</p>
  const mostradas = lineas.slice(0, visibles)
  return (
    <div style={{ display: 'grid', gap: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, fontSize: 11, textTransform: 'uppercase', ...gris, paddingBottom: 4 }}>
        <span>Ramo · producto</span><span style={{ textAlign: 'right' }}>NP</span><span style={{ textAlign: 'right' }}>Cartera</span>
      </div>
      {mostradas.map((l) => {
        const probable = /LECTURA PROBABLE/.test(l.notas ?? '')
        return (
          <div key={l.id} style={{ borderTop: '1px solid var(--border)', padding: '6px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {probable && <span title="Lectura probable: no confirmada en el documento">⚠️ </span>}
                {l.ramoTexto}
                {(l.producto || l.modalidad) && (
                  <span style={{ fontSize: 11, ...gris }}> · {[l.producto, l.modalidad].filter(Boolean).join(' · ')}</span>
                )}
                {l.ramo === null && <span style={{ fontSize: 11, ...gris }} title="El ramo no se ha podido mapear: la línea se enseña pero no se usa para calcular"> · sin ramo</span>}
              </span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} title={l.pctNp === null ? 'No consta' : undefined}>{textoPct(l.pctNp)}</span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} title={l.pctCartera === null ? 'No consta' : undefined}>{textoPct(l.pctCartera)}</span>
            </div>
            {l.notas && (
              nota === l.id
                ? <p style={{ margin: '4px 0 0', fontSize: 12, ...gris, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{l.notas}</p>
                : <button type="button" onClick={() => setNota(l.id)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 32, padding: '0 6px', fontSize: 11 }}>Ver nota</button>
            )}
          </div>
        )
      })}
      {lineas.length > visibles && (
        <button type="button" style={{ ...btnStyle('secundario', 'md'), marginTop: 6 }} onClick={() => setVisibles((v) => v + LINEAS_POR_PAGINA)}>
          Ver {Math.min(LINEAS_POR_PAGINA, lineas.length - visibles)} más de {lineas.length - visibles}
        </button>
      )}
    </div>
  )
}

function ObjetivosAcuerdo({ a, objetivos }: { a: Acuerdo; objetivos: ObjetivoEvaluado[] }) {
  if (a.objetivos.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 12, ...gris }}>
        ⚪ Objetivos sin estructurar{a.letraPequena ? ': lo que diga el documento está en la letra pequeña.' : '.'}
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {a.objetivos.map((o) => {
        const ev = objetivos.find((x) => x.objetivoId === o.id)
        const s = ev ? semaforoObjetivo(ev.estado) : { punto: '⚪', texto: 'Pendiente: no se ha podido evaluar', tono: 'neutral' as const }
        const tipo = o.tipo.valor === null ? `«${o.tipo.crudo}»` : o.tipo.valor === 'mantener_clave' ? 'Mantener la clave' : o.tipo.valor === 'apertura' ? 'Apertura' : 'Rappel'
        return (
          <div key={o.id} style={{ fontSize: 13, display: 'grid', gap: 2 }}>
            <div><strong>{tipo}</strong> <span style={{ fontSize: 11, ...gris }}>{fecha(o.periodoDesde)} – {fecha(o.periodoHasta)}</span></div>
            <div>{s.punto} {s.texto}</div>
            {ev && ev.estado.color !== 'pendiente' && (
              <div style={{ fontSize: 12, ...gris }}>
                {o.base.valor === 'polizas_np' ? `${ev.estado.medido} pólizas` : eur(ev.estado.medido)} de {o.base.valor === 'polizas_np' ? ev.estado.umbral : eur(ev.estado.umbral)}
                {ev.estado.proyectado !== null && ` · a este ritmo ${o.base.valor === 'polizas_np' ? ev.estado.proyectado : eur(ev.estado.proyectado)}`}
                {ev.estado.falta !== null && ` · faltan ${o.base.valor === 'polizas_np' ? ev.estado.falta : eur(ev.estado.falta)} para el siguiente tramo`}
                {ev.estado.rappelEstimado !== null && ` · rappel estimado ${eur(ev.estado.rappelEstimado)} (se liquida al cierre)`}
              </div>
            )}
            {o.condiciones && <div style={{ fontSize: 12, ...gris, overflowWrap: 'anywhere' }}>{o.condiciones}</div>}
          </div>
        )
      })}
    </div>
  )
}

export function CotejarBoton({ acuerdoId, onHecho }: { acuerdoId: string; onHecho: (revisadoAt: string) => void }) {
  const [estado, setEstado] = useState<'listo' | 'enviando' | { error: string }>('listo')
  async function cotejar() {
    if (!window.confirm('¿Has comprobado que todas las cifras de este acuerdo coinciden con el documento original? Quedará marcado como cotejado.')) return
    setEstado('enviando')
    try {
      const res = await fetch('/api/correduria/companias/acuerdos/cotejar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acuerdoId }),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; revisadoAt?: string; causa?: string; motivo?: string } | null
      if (res.ok && (j?.estado === 'cotejado' || j?.estado === 'ya_cotejado') && typeof j.revisadoAt === 'string') {
        onHecho(j.revisadoAt)
        setEstado('listo')
      } else {
        setEstado({ error: j?.causa ?? j?.motivo ?? j?.estado ?? `HTTP ${res.status}` })
      }
    } catch {
      setEstado({ error: 'red' })
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" style={btnStyle('primario', 'md')} disabled={estado === 'enviando'} onClick={cotejar}>
        {estado === 'enviando' ? 'Guardando…' : 'Coincide con el PDF'}
      </button>
      {typeof estado === 'object' && <span style={{ fontSize: 12, color: 'var(--negative)' }}>No se ha guardado: {estado.error}</span>}
    </span>
  )
}

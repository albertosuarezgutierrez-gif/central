'use client'

// Panel de control del ciclo de la factura al huésped: solicitud → listas → borrador → emitida → enviada.
// Puramente de presentación: las llamadas (preparar, aprobar, reenviar…) viven en page.tsx. Emitir es SIEMPRE un botón de
// Alberto con diálogo de confirmación (la ruta exige `confirmado: true` y su sesión).
import { useState } from 'react'
import { eur } from '@/lib/dinero'
import { Badge, btnStyle, cardStyle } from '@/components/ui'

export type FilaCiclo = {
  id: string; numeroCompleto: string | null; estado: string; piso: string; reservationId: string
  receptorNombre: string; receptorNif: string; total: number; envioError: string | null; tienePdf: boolean
  email: string; cc: string[]; telegramMessageId: string | null; envioIntentos: number; emitidaAt: string | null; enviadaAt: string | null; envioCc: string[]
}
export type Lista = { id: string; reservationId: string; piso: string; receptorNombre: string; receptorNif: string; email: string; cc: string[] }
export type Incompleta = { id: string; reservationId: string; piso: string; receptorNombre: string | null; email: string | null; faltan: string[]; enlace: string }
export type DatosPanel = { solicitudesIncompletas: Incompleta[]; solicitudesListas: Lista[]; borradores: FilaCiclo[]; sinEnviar: FilaCiclo[]; enviadasMes: FilaCiclo[] }
export type Filtro = 'incompletas' | 'listas' | 'borradores' | 'sinEnviar' | 'enviadas'
export type Aviso = { ok: boolean; texto: string }

const PASO = 50
const fechaHora = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const btn: React.CSSProperties = { ...btnStyle('secundario', 'sm'), minHeight: 44, minWidth: 44 }
const fila: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }
const info: React.CSSProperties = { minWidth: 0, flex: '1 1 240px', overflowWrap: 'anywhere' }
const acciones: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const sub: React.CSSProperties = { fontSize: 13, color: 'var(--muted)' }

function Seccion<T>({ titulo, items, vacio, cargado, render }: { titulo: string; items: T[]; vacio: string; cargado: boolean; render: (x: T) => React.ReactNode }) {
  const [visibles, setVisibles] = useState(PASO)
  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{titulo}{cargado ? ` (${items.length})` : ''}</h2>
      {!cargado && <p style={{ color: 'var(--muted)', margin: 0 }}>Cargando…</p>}
      {cargado && items.length === 0 && <p style={{ color: 'var(--muted)', margin: 0 }}>{vacio}</p>}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>{items.slice(0, visibles).map(render)}</div>
      {items.length > visibles && (
        <button type="button" onClick={() => setVisibles((v) => v + PASO)} style={{ ...btnStyle('secundario'), marginTop: 12, minHeight: 44, width: '100%' }}>
          Ver más ({items.length - visibles} restantes)
        </button>
      )}
    </section>
  )
}

const destino = (f: FilaCiclo) => `${f.email}${f.cc.length > 0 ? ` · CC: ${f.cc.join(', ')}` : ''}`

export default function PanelCiclo(p: {
  datos: DatosPanel | null; aviso: Aviso | null; filtro: Filtro | null; setFiltro: (f: Filtro | null) => void; ocupado: string | null
  onPreparar: (solicitudId: string) => void; onProponer: (id: string) => void; onReenviar: (id: string) => void
  onAprobar: (f: FilaCiclo) => Promise<void>; onCopiar: (enlace: string) => void
}) {
  const [aConfirmar, setAConfirmar] = useState<FilaCiclo | null>(null)
  const [aprobando, setAprobando] = useState(false)
  const d = p.datos
  const cargado = d !== null
  const inc = d?.solicitudesIncompletas ?? []
  const listas = d?.solicitudesListas ?? []
  const bor = d?.borradores ?? []
  const sin = d?.sinEnviar ?? []
  const env = d?.enviadasMes ?? []
  const contadores: Array<{ k: Filtro; n: number; txt: string }> = [
    { k: 'incompletas', n: inc.length, txt: 'Pendientes de datos' },
    { k: 'listas', n: listas.length, txt: 'Listas sin borrador' },
    { k: 'borradores', n: bor.length, txt: 'Esperando aprobación' },
    { k: 'sinEnviar', n: sin.length, txt: 'Emitidas sin enviar' },
    { k: 'enviadas', n: env.length, txt: 'Enviadas (este mes)' },
  ]
  const ve = (k: Filtro) => p.filtro === null || p.filtro === k

  async function confirmar() {
    if (!aConfirmar) return
    setAprobando(true)
    try { await p.onAprobar(aConfirmar) } finally { setAprobando(false); setAConfirmar(null) }
  }

  return (
    <>
      <section aria-label="Resumen del ciclo" style={{ display: 'grid', gap: 8, marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        {contadores.map((c) => {
          const activo = p.filtro === c.k
          return (
            <button key={c.k} type="button" aria-pressed={activo} onClick={() => p.setFiltro(activo ? null : c.k)}
              style={{ ...cardStyle, minHeight: 64, textAlign: 'left', cursor: 'pointer', display: 'grid', gap: 2, outline: activo ? '2px solid var(--accent, #3364ee)' : 'none', color: 'var(--text)' }}>
              <span style={{ fontSize: 24, fontWeight: 700 }}>{cargado ? c.n : '—'}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{c.txt}</span>
            </button>
          )
        })}
      </section>
      {p.filtro && (
        <p style={{ margin: '0 0 12px' }}>
          <button type="button" onClick={() => p.setFiltro(null)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Quitar filtro · ver todo</button>
        </p>
      )}
      {p.aviso && (
        <div role="status" style={{ ...cardStyle, marginBottom: 16, borderLeft: `4px solid ${p.aviso.ok ? 'var(--success, #16a34a)' : 'var(--warning)'}`, overflowWrap: 'anywhere' }}>{p.aviso.texto}</div>
      )}

      {ve('incompletas') && (
        <Seccion titulo="Solicitudes pendientes de datos del huésped" items={inc} cargado={cargado} vacio="Ninguna: no hay huéspedes con la factura a medias."
          render={(s) => (
            <div key={s.id} style={fila}>
              <div style={info}>
                <strong>{s.receptorNombre ?? 'Sin datos todavía'}</strong> · {s.piso} · reserva {s.reservationId}
                <div style={sub}>{s.email ?? 'sin email'}</div>
                <div style={sub}>Falta: {s.faltan.join(' · ')}</div>
              </div>
              <div style={acciones}>
                <button type="button" onClick={() => p.onCopiar(s.enlace)} style={btn}>Copiar enlace del formulario</button>
                <a href={`/sivra/facturas?reserva=${encodeURIComponent(s.reservationId)}`} style={btn}>✏️ Rellenar yo</a>
              </div>
            </div>
          )} />
      )}

      {ve('listas') && (
        <Seccion titulo="Solicitudes listas sin borrador" items={listas} cargado={cargado} vacio="No hay solicitudes pendientes."
          render={(s) => (
            <div key={s.id} style={fila}>
              <div style={info}>
                <strong>{s.receptorNombre}</strong> · NIF {s.receptorNif} · {s.piso} · reserva {s.reservationId}
                <div style={sub}>{s.email}{s.cc.length > 0 && ` · CC: ${s.cc.join(', ')}`}</div>
              </div>
              <button type="button" disabled={p.ocupado !== null} onClick={() => p.onPreparar(s.id)} style={btn}>
                {p.ocupado === s.id ? 'Preparando…' : 'Preparar borrador → Telegram'}
              </button>
            </div>
          )} />
      )}

      {ve('borradores') && (
        <Seccion titulo="Borradores esperando aprobación" items={bor} cargado={cargado} vacio="Ninguno."
          render={(f) => (
            <div key={f.id} style={fila}>
              <div style={info}>
                <strong>{f.receptorNombre}</strong> · NIF {f.receptorNif} · {f.piso} · reserva {f.reservationId}
                <div style={sub}>Total {eur(f.total)} (IVA incluido) · {destino(f)}</div>
                {f.telegramMessageId === null && <div style={{ ...sub, color: 'var(--warning)' }}>Aún no está en Telegram (¿aviso silenciado?): pulsa «Reenviar a Telegram» para poder aprobarlo.</div>}
              </div>
              <div style={acciones}>
                <a href={`/api/sivra/facturas/${f.id}/pdf`} target="_blank" rel="noreferrer" style={btn}>Ver PDF</a>
                <a href={`/sivra/facturas?reserva=${encodeURIComponent(f.reservationId)}`} style={btn}>✏️ Modificar</a>
                <button type="button" onClick={() => p.onProponer(f.id)} style={btn}>Reenviar a Telegram</button>
                <button type="button" disabled={f.telegramMessageId === null || p.ocupado !== null} onClick={() => setAConfirmar(f)} style={{ ...btnStyle('primario', 'sm'), minHeight: 44, minWidth: 44 }}>✅ Aprobar y enviar</button>
              </div>
            </div>
          )} />
      )}

      {ve('sinEnviar') && (
        <Seccion titulo="Emitidas sin enviar" items={sin} cargado={cargado} vacio="Ninguna: todo lo emitido ha salido."
          render={(f) => (
            <div key={f.id} style={fila}>
              <div style={info}>
                <strong>{f.numeroCompleto}</strong> · {f.receptorNombre} · {eur(f.total)} · {f.piso}
                <div style={sub}>{destino(f)}</div>
                <div style={sub}>
                  {f.envioError || f.envioIntentos > 0 ? <Badge tono="aviso">Envío fallido</Badge> : <Badge>Pendiente de envío</Badge>}
                  {' '}{f.envioIntentos > 0 && `${f.envioIntentos} intento${f.envioIntentos === 1 ? '' : 's'}`}{f.envioError && ` · ${f.envioError}`}
                </div>
              </div>
              <div style={acciones}>
                {f.tienePdf && <a href={`/api/sivra/facturas/${f.id}/pdf`} target="_blank" rel="noreferrer" style={btn}>Ver PDF</a>}
                <button type="button" disabled={p.ocupado !== null} onClick={() => p.onReenviar(f.id)} style={btn}>Reintentar envío</button>
              </div>
            </div>
          )} />
      )}

      {ve('enviadas') && (
        <Seccion titulo="Enviadas este mes" items={env} cargado={cargado} vacio="Todavía no se ha enviado ninguna este mes."
          render={(f) => (
            <div key={f.id} style={fila}>
              <div style={info}>
                <strong>{f.numeroCompleto}</strong> · {f.receptorNombre} · {eur(f.total)} · {f.piso}
                <div style={sub}>Enviada el {fechaHora(f.enviadaAt)} a {f.email}{f.envioCc.length > 0 && ` · CC: ${f.envioCc.join(', ')}`}</div>
              </div>
              <div style={acciones}>
                {f.tienePdf && <a href={`/api/sivra/facturas/${f.id}/pdf`} target="_blank" rel="noreferrer" style={btn}>Ver PDF</a>}
              </div>
            </div>
          )} />
      )}

      {aConfirmar && (
        <div role="dialog" aria-modal="true" aria-label="Confirmar emisión" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 8 }}>
          <div style={{ ...cardStyle, width: 'min(95vw, 480px)', maxHeight: '90vh', overflowY: 'auto', overflowWrap: 'anywhere' }}>
            <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>¿Emitir y enviar esta factura?</h2>
            <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
              <div><dt style={sub}>Receptor</dt><dd style={{ margin: 0 }}><strong>{aConfirmar.receptorNombre}</strong></dd></div>
              <div><dt style={sub}>NIF</dt><dd style={{ margin: 0 }}>{aConfirmar.receptorNif}</dd></div>
              <div><dt style={sub}>Total (IVA incluido)</dt><dd style={{ margin: 0 }}><strong>{eur(aConfirmar.total)}</strong></dd></div>
              <div><dt style={sub}>Se enviará a</dt><dd style={{ margin: 0 }}>{aConfirmar.email}</dd></div>
              <div><dt style={sub}>CC</dt><dd style={{ margin: 0 }}>{aConfirmar.cc.length > 0 ? aConfirmar.cc.join(', ') : 'Ninguno'}</dd></div>
              <div><dt style={sub}>Piso · reserva</dt><dd style={{ margin: 0 }}>{aConfirmar.piso} · {aConfirmar.reservationId}</dd></div>
            </dl>
            <p style={{ ...sub, margin: '12px 0' }}>Se le asignará el siguiente número correlativo de la serie (no se puede deshacer) y se enviará el correo con el PDF.</p>
            <div style={{ ...acciones, justifyContent: 'flex-end' }}>
              <button type="button" disabled={aprobando} onClick={() => setAConfirmar(null)} style={btn}>Cancelar</button>
              <button type="button" disabled={aprobando} onClick={() => void confirmar()} style={{ ...btnStyle('primario', 'sm'), minHeight: 44, minWidth: 44 }}>{aprobando ? 'Emitiendo…' : 'Sí, emitir y enviar'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

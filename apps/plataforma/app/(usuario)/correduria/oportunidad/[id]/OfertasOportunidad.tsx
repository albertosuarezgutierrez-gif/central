'use client'

// «Ofertas» de la oportunidad (F3): subir PDFs de compañías (y la póliza actual), revisar lo que leyó la IA,
// compararlas en un cuadro con evidencia por celda y generar el presupuesto (borrador). `null` = «No figura».
// 🚨 Generar NO envía nada: el envío al cliente es un botón aparte, con confirmación.
// Se carga al abrir la sección (no monta nada mientras está plegada) y el cuadro pinta ~40 filas + «Ver más».

import { useCallback, useMemo, useRef, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import type { FilaMatriz } from '@central/module-seguros'
import { interpretarOfertas, type OfertaVista, type OfertasOportunidad as Datos } from '@/lib/correduria/ofertas-asegura'
import { motivoDe, type Respuesta } from './piezas-riesgo'
import {
  NO_FIGURA, avisosDeOferta, citaNoEncontrada, conGarantiaEditada, elegidasPorDefecto, estadoLectura, importeOFalta,
  importeParaInput, lineasDeValor, marcaDeCelda, parsearImporteEs, puedeGenerarPresupuesto, rotuloEstadoOferta,
  type CampoGarantia,
} from './ofertas-vista'

const FILAS_INICIO = 40
const BORDE = '1px solid var(--border, rgba(128,128,128,.25))'
const COLOR_MARCA = { peor: 'var(--negative)', mejor: 'var(--positive)', hueco: 'var(--warning)' } as const

async function llamar(url: string, init: RequestInit): Promise<Respuesta> {
  try {
    const res = await fetch(url, init)
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: res.ok && json?.estado === 'ok', status: res.status, json }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}

type Generado = { id: string; referencia: string | null }

export default function OfertasOportunidad({ oportunidadId, clienteId, polizaId }: { oportunidadId: string; clienteId: string; polizaId: string | null }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [rol, setRol] = useState<'oferta' | 'actual'>('oferta')
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [celda, setCelda] = useState<{ clave: string; ofertaId: string } | null>(null)
  const [verTodas, setVerTodas] = useState(false)
  const [generado, setGenerado] = useState<Generado | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async (primera = false) => {
    setCargando(true)
    try {
      const res = await fetch(`/api/correduria/oportunidad/ofertas?oportunidadId=${encodeURIComponent(oportunidadId)}`, { cache: 'no-store' })
      const j = await res.json().catch(() => null)
      const l = interpretarOfertas(res.status, j)
      if (l.estado === 'ok') {
        setDatos(l.datos); setErrorCarga(null)
        setElegidas((prev) => {
          if (primera) return elegidasPorDefecto(l.datos.ofertas)
          const vivas = new Set(l.datos.ofertas.filter((o) => o.rol === 'oferta' && o.estado !== 'descartada').map((o) => o.id))
          return new Set([...prev].filter((id) => vivas.has(id)))
        })
      } else setErrorCarga(l.estado === 'sin_configurar' ? 'Falta conectar el puerto con central-asegura.' : l.motivo)
    } finally { setCargando(false) }
  }, [oportunidadId])

  function alternar() {
    const abre = !abierto
    setAbierto(abre)
    if (abre && !datos && !cargando) void cargar(true)
  }

  async function subir(files: FileList | null) {
    if (!files || files.length === 0) return
    const lista = Array.from(files)
    setAviso(null)
    let avisos = 0
    for (const f of lista) {
      setSubiendo(f.name)
      const form = new FormData()
      form.set('fichero', f, f.name); form.set('oportunidadId', oportunidadId); form.set('rol', rol)
      const r = await llamar('/api/correduria/oportunidad/ofertas', { method: 'POST', body: form })
      if (!r.ok) { avisos++; setAviso({ ok: false, texto: `«${f.name}» NO se ha subido: ${motivoDe(r)}` }) }
      else if (r.json?.leida === false) { avisos++; setAviso({ ok: false, texto: `«${f.name}» se ha guardado pero no se ha podido leer: ${String(r.json.motivo ?? 'sin motivo')}. Rellénala a mano.` }) }
    }
    setSubiendo(null)
    if (inputRef.current) inputRef.current.value = ''
    await cargar(false)
    if (avisos === 0) setAviso({ ok: true, texto: lista.length === 1 ? 'Subida.' : `${lista.length} ficheros subidos.` })
  }

  async function parchear(o: OfertaVista, cuerpo: Record<string, unknown>, ok: string): Promise<boolean> {
    setOcupado(o.id); setAviso(null)
    const r = await llamar('/api/correduria/oportunidad/ofertas', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ofertaId: o.id, ...cuerpo }) })
    setOcupado(null)
    if (!r.ok) { setAviso({ ok: false, texto: `NO guardado: ${motivoDe(r)}` }); return false }
    setAviso({ ok: true, texto: ok })
    setGenerado(null)
    await cargar(false)
    return true
  }

  async function generar() {
    setOcupado('generar'); setAviso(null)
    const r = await llamar('/api/correduria/oportunidad/consolidar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oportunidadId, ofertaIds: [...elegidas] }) })
    setOcupado(null)
    const p = (r.json?.presupuesto ?? null) as { id?: unknown; referencia?: unknown } | null
    if (!r.ok || !p || typeof p.id !== 'string') { setAviso({ ok: false, texto: `Presupuesto NO generado: ${motivoDe(r)}` }); return }
    setGenerado({ id: p.id, referencia: typeof p.referencia === 'string' ? p.referencia : null })
    setAviso({ ok: true, texto: 'Presupuesto generado en borrador. No se ha enviado nada al cliente.' })
  }

  async function enviar(g: Generado) {
    if (!window.confirm('Se le manda por correo el aviso con el enlace (sin precios: los ve al entrar con su código). ¿Enviar?')) return
    setOcupado('enviar'); setAviso(null)
    const r = await llamar('/api/correduria/presupuesto', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: g.id, accion: 'avisar', canal: 'email' }) })
    setOcupado(null)
    const j = (r.json ?? {}) as { estado?: string; detalle?: string; motivo?: string }
    setAviso(r.ok || j.estado === 'ok' ? { ok: true, texto: 'Aviso enviado al cliente.' } : { ok: false, texto: `NO enviado: ${j.detalle ?? j.motivo ?? `HTTP ${r.status}`}` })
  }

  const ofertas = useMemo(() => datos?.ofertas ?? [], [datos])
  const vivas = ofertas.filter((o) => o.estado !== 'descartada')
  const descartadas = ofertas.filter((o) => o.estado === 'descartada')
  const puede = useMemo(() => puedeGenerarPresupuesto(ofertas, elegidas), [ofertas, elegidas])
  const porId = useMemo(() => new Map(ofertas.map((o) => [o.id, o])), [ofertas])

  return (
    <section style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <button type="button" onClick={alternar} aria-expanded={abierto} style={{ all: 'unset', cursor: 'pointer', minHeight: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Ofertas de compañías {datos ? `· ${vivas.length}` : ''}</span>
        <span aria-hidden style={{ color: 'var(--muted)' }}>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <>
          <style>{`
            .ofe-tabla{display:block}.ofe-cards{display:none}
            @media (max-width:720px){.ofe-tabla{display:none}.ofe-cards{display:grid}}
          `}</style>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Sube el PDF de la póliza actual y los de cada oferta. Se leen con IA: revisa cada cifra contra su cita antes de darla por buena. Lo que el PDF no dice figura como «{NO_FIGURA}», nunca como 0.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select aria-label="Qué es el PDF" value={rol} onChange={(e) => setRol(e.target.value as 'oferta' | 'actual')} disabled={subiendo !== null} style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: BORDE, background: 'var(--surface)', color: 'var(--text)', font: 'inherit' }}>
              <option value="oferta">Oferta</option>
              <option value="actual">Póliza actual</option>
            </select>
            <input ref={inputRef} id={`ofe-file-${oportunidadId}`} type="file" accept="application/pdf" multiple hidden onChange={(e) => void subir(e.target.files)} />
            <label htmlFor={`ofe-file-${oportunidadId}`} style={{ ...btnStyle('primario'), opacity: subiendo ? 0.6 : 1, pointerEvents: subiendo ? 'none' : 'auto' }}>
              {subiendo ? `Leyendo «${subiendo}»…` : 'Subir PDF(s)'}
            </label>
          </div>
          {subiendo && <span role="status" style={{ fontSize: 13, color: 'var(--muted)' }}>Guardando y leyendo el PDF con IA: puede tardar hasta un par de minutos.</span>}

          {aviso && <div role="status" style={{ fontSize: 13, borderLeft: `3px solid ${aviso.ok ? 'var(--positive)' : 'var(--negative)'}`, paddingLeft: 10, color: aviso.ok ? 'var(--text)' : 'var(--negative)' }}>{aviso.texto}</div>}
          {cargando && !datos && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando ofertas…</span>}
          {errorCarga && (
            <div style={{ fontSize: 13, color: 'var(--negative)' }}>
              No se han podido leer las ofertas ({errorCarga}). No es que no haya: no se han podido mirar.{' '}
              <button type="button" onClick={() => void cargar(true)} style={btnStyle('secundario', 'sm')}>Reintentar</button>
            </div>
          )}

          {datos && vivas.length === 0 && !errorCarga && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Todavía no hay ofertas en esta oportunidad.</p>}

          {vivas.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 10 }}>
              {vivas.map((o) => (
                <TarjetaOferta key={o.id} o={o} ocupado={ocupado === o.id} elegida={elegidas.has(o.id)}
                  onElegir={(v) => setElegidas((s) => { const n = new Set(s); if (v) n.add(o.id); else n.delete(o.id); return n })}
                  onParchear={(c, t) => parchear(o, c, t)} />
              ))}
            </div>
          )}

          {datos && datos.comparacion.filas.length > 0 && vivas.length > 0 && (
            <Cuadro datos={datos} porId={porId} celda={celda} setCelda={setCelda} verTodas={verTodas} setVerTodas={setVerTodas}
              ocupado={ocupado !== null} onGuardar={(o, g) => parchear(o, { garantias: g }, 'Cifra guardada: la oferta vuelve a «Por revisar».')} />
          )}

          {descartadas.length > 0 && (
            <details style={{ fontSize: 13 }}>
              <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Descartadas ({descartadas.length})</summary>
              {descartadas.map((o) => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
                  <span>{o.compania ?? 'Sin compañía'}{o.producto ? ` · ${o.producto}` : ''}</span>
                  <button type="button" disabled={ocupado !== null} style={btnStyle('secundario', 'sm')} onClick={() => void parchear(o, { estado: 'extraida' }, 'Oferta recuperada.')}>Recuperar</button>
                </div>
              ))}
            </details>
          )}

          {vivas.some((o) => o.rol === 'oferta') && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, borderTop: BORDE, paddingTop: 12 }}>
              <button type="button" onClick={() => void generar()} disabled={!puede.ok || ocupado !== null} style={{ ...btnStyle('primario'), opacity: puede.ok ? 1 : 0.5 }}>
                {ocupado === 'generar' ? 'Generando…' : `Generar presupuesto (${[...elegidas].length})`}
              </button>
              {!puede.ok && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{puede.motivo}</span>}
              {generado && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, fontSize: 13 }}>
                  <span>Presupuesto {generado.referencia ?? ''} creado en borrador. Revísalo antes de enviarlo.</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a href={`/api/correduria/presupuesto/pdf?id=${encodeURIComponent(generado.id)}`} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('secundario'), textDecoration: 'none' }}>Ver PDF</a>
                    <a href={polizaId ? `/correduria/poliza/${encodeURIComponent(polizaId)}` : `/correduria/cliente/${encodeURIComponent(clienteId)}`} style={{ ...btnStyle('secundario'), textDecoration: 'none' }}>Ver en presupuestos</a>
                    <button type="button" disabled={ocupado !== null} onClick={() => void enviar(generado)} style={btnStyle('secundario')}>Enviar por correo…</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function TarjetaOferta({ o, ocupado, elegida, onElegir, onParchear }: {
  o: OfertaVista; ocupado: boolean; elegida: boolean
  onElegir: (v: boolean) => void
  onParchear: (c: Record<string, unknown>, t: string) => Promise<boolean>
}) {
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState({ compania: '', producto: '', primaNeta: '', primaTotal: '' })
  const [err, setErr] = useState<string | null>(null)
  const lectura = estadoLectura(o)
  const avisos = avisosDeOferta(o)
  const esActual = o.rol === 'actual'

  function abrir() {
    setF({ compania: o.compania ?? '', producto: o.producto ?? '', primaNeta: importeParaInput(o.primaNeta), primaTotal: importeParaInput(o.primaTotal) })
    setErr(null); setEditando(true)
  }
  async function guardar() {
    const neta = parsearImporteEs(f.primaNeta), total = parsearImporteEs(f.primaTotal)
    if (neta === 'invalido' || total === 'invalido') { setErr('Escribe los importes como 1.234,56.'); return }
    const ok = await onParchear({ compania: f.compania.trim() || null, producto: f.producto.trim() || null, primaNeta: neta, primaTotal: total }, 'Datos guardados: la oferta vuelve a «Por revisar».')
    if (ok) setEditando(false)
  }
  const campo = { minHeight: 44, padding: '0 10px', borderRadius: 10, border: BORDE, background: 'var(--surface)', color: 'var(--text)', font: 'inherit', minWidth: 0, width: '100%', boxSizing: 'border-box' as const }

  return (
    <article style={{ border: o.recomendada ? '2px solid var(--primary)' : BORDE, borderRadius: 14, padding: 14, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, alignContent: 'start' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ fontFamily: 'var(--font-marca-display), ui-rounded, system-ui, sans-serif', fontSize: 16, minWidth: 0, overflowWrap: 'anywhere' }}>{o.compania ?? 'Compañía sin leer'}</strong>
        <Badge>{esActual ? 'Póliza actual' : 'Oferta'}</Badge>
        {o.recomendada && <Badge>Recomendada</Badge>}
        <Badge>{rotuloEstadoOferta(o.estado)}</Badge>
      </div>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{o.producto ?? `Producto: ${NO_FIGURA}`}</span>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
        <span><span style={{ color: 'var(--muted)', fontSize: 12 }}>Prima total</span><br /><strong>{importeOFalta(o.primaTotal)}</strong></span>
        <span><span style={{ color: 'var(--muted)', fontSize: 12 }}>Prima neta</span><br />{importeOFalta(o.primaNeta)}</span>
      </div>
      <span style={{ fontSize: 12, color: lectura.clave === 'ok' ? 'var(--muted)' : 'var(--negative)' }}>{lectura.texto}</span>
      {avisos.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--warning)' }}>
          {avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}

      {editando ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
          <input aria-label="Compañía" placeholder="Compañía" value={f.compania} onChange={(e) => setF({ ...f, compania: e.target.value })} style={campo} />
          <input aria-label="Producto" placeholder="Producto" value={f.producto} onChange={(e) => setF({ ...f, producto: e.target.value })} style={campo} />
          <input aria-label="Prima total" inputMode="decimal" placeholder="Prima total (vacío = no figura)" value={f.primaTotal} onChange={(e) => setF({ ...f, primaTotal: e.target.value })} style={campo} />
          <input aria-label="Prima neta" inputMode="decimal" placeholder="Prima neta (vacío = no figura)" value={f.primaNeta} onChange={(e) => setF({ ...f, primaNeta: e.target.value })} style={campo} />
          {err && <span style={{ fontSize: 12, color: 'var(--negative)' }}>{err}</span>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" disabled={ocupado} onClick={() => void guardar()} style={btnStyle('primario')}>Guardar</button>
            <button type="button" onClick={() => setEditando(false)} style={btnStyle('secundario')}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" disabled={ocupado} onClick={abrir} style={btnStyle('secundario')}>Editar datos</button>
          {o.estado === 'revisada'
            ? <button type="button" disabled={ocupado} onClick={() => void onParchear({ estado: 'extraida' }, 'Vuelve a «Por revisar».')} style={btnStyle('secundario')}>Quitar revisión</button>
            : <button type="button" disabled={ocupado} onClick={() => void onParchear({ estado: 'revisada' }, 'Marcada como revisada.')} style={btnStyle('primario')}>Revisada</button>}
          {!esActual && (
            <button type="button" disabled={ocupado} onClick={() => void onParchear({ recomendada: !o.recomendada }, o.recomendada ? 'Ya no es la recomendada.' : 'Marcada como recomendada.')} style={btnStyle('secundario')}>
              {o.recomendada ? 'Quitar recomendada' : 'Recomendada'}
            </button>
          )}
          <button type="button" disabled={ocupado} onClick={() => { if (window.confirm('¿Descartar esta oferta? Dejará de entrar en el cuadro y el presupuesto (se puede recuperar).')) void onParchear({ estado: 'descartada' }, 'Oferta descartada.') }} style={btnStyle('sutil')}>Descartar</button>
        </div>
      )}
      {!esActual && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, fontSize: 13 }}>
          <input type="checkbox" checked={elegida} onChange={(e) => onElegir(e.target.checked)} style={{ width: 20, height: 20 }} />
          Va al presupuesto
        </label>
      )}
    </article>
  )
}

function Cuadro({ datos, porId, celda, setCelda, verTodas, setVerTodas, ocupado, onGuardar }: {
  datos: Datos
  porId: Map<string, OfertaVista>
  celda: { clave: string; ofertaId: string } | null
  setCelda: (c: { clave: string; ofertaId: string } | null) => void
  verTodas: boolean; setVerTodas: (v: boolean) => void
  ocupado: boolean
  onGuardar: (o: OfertaVista, garantias: Record<string, import('@central/module-seguros').ValorGarantia>) => Promise<boolean>
}) {
  const filas = datos.comparacion.filas
  const visibles = verTodas ? filas : filas.slice(0, FILAS_INICIO)
  const cols = datos.comparacion.ofertas.filter((c) => porId.has(c.id))
  const nombre = (id: string) => { const o = porId.get(id); return `${o?.compania ?? 'Sin compañía'}${o?.rol === 'actual' ? ' (actual)' : ''}` }
  const sel = celda ? { fila: filas.find((x) => x.clave === celda.clave), oferta: porId.get(celda.ofertaId) } : null

  const Celda = ({ fila, ofertaId }: { fila: FilaMatriz; ofertaId: string }) => {
    const c = fila.celdas.find((x) => x.ofertaId === ofertaId)
    const marca = c ? marcaDeCelda(c) : null
    const o = porId.get(ofertaId)
    const activa = celda?.clave === fila.clave && celda.ofertaId === ofertaId
    return (
      <button type="button" onClick={() => setCelda(activa ? null : { clave: fila.clave, ofertaId })}
        aria-label={`${fila.etiqueta}, ${nombre(ofertaId)}: ver evidencia y editar`}
        style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', width: '100%', minHeight: 44, padding: '6px 8px', fontSize: 12, borderLeft: marca ? `3px solid ${COLOR_MARCA[marca.clave]}` : '3px solid transparent', background: activa ? 'var(--primary-light)' : undefined }}>
        {lineasDeValor(c?.valor).map((l) => <div key={l} style={{ color: l === NO_FIGURA ? 'var(--muted)' : undefined }}>{l}</div>)}
        {marca && <div style={{ color: COLOR_MARCA[marca.clave], fontWeight: 600 }}>{marca.texto}</div>}
        {o && citaNoEncontrada(o, fila.clave) && <div style={{ color: 'var(--warning)' }}>Cita sin encontrar</div>}
      </button>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Cuadro comparativo</div>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Toca una celda para ver de dónde sale la cifra (página y texto del PDF) y corregirla. Las marcas comparan con la póliza actual.</span>

      <div className="ofe-tabla" style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + cols.length * 160 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8, fontSize: 12, borderBottom: BORDE }}>Garantía</th>
              {cols.map((c) => <th key={c.id} style={{ textAlign: 'left', padding: 8, fontSize: 12, borderBottom: BORDE }}>{nombre(c.id)}<br /><span style={{ fontWeight: 400, color: 'var(--muted)' }}>{importeOFalta(c.primaTotal)}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila) => (
              <tr key={fila.clave}>
                <th scope="row" style={{ textAlign: 'left', padding: 8, fontSize: 13, fontWeight: 500, borderBottom: BORDE, verticalAlign: 'top' }}>{fila.etiqueta}{!fila.canonica && <span style={{ color: 'var(--muted)', fontSize: 11 }}> · literal</span>}</th>
                {cols.map((c) => <td key={c.id} style={{ borderBottom: BORDE, verticalAlign: 'top', padding: 0 }}><Celda fila={fila} ofertaId={c.id} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ofe-cards" style={{ gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        {visibles.map((fila) => (
          <div key={fila.clave} style={{ border: BORDE, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600 }}>{fila.etiqueta}</div>
            {cols.map((c) => (
              <div key={c.id} style={{ borderTop: BORDE }}>
                <div style={{ padding: '4px 10px 0', fontSize: 11, color: 'var(--muted)' }}>{nombre(c.id)}</div>
                <Celda fila={fila} ofertaId={c.id} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {filas.length > FILAS_INICIO && (
        <button type="button" onClick={() => setVerTodas(!verTodas)} style={btnStyle('secundario')}>
          {verTodas ? 'Ver menos' : `Ver más (${filas.length - FILAS_INICIO})`}
        </button>
      )}

      {sel?.fila && sel.oferta && (
        <EditorCelda key={`${sel.oferta.id}:${sel.fila.clave}`} fila={sel.fila} oferta={sel.oferta} ocupado={ocupado}
          onCerrar={() => setCelda(null)}
          onGuardar={async (campos) => {
            let g = sel.oferta!.garantias
            for (const [campo, valor] of campos) g = conGarantiaEditada(g, sel.fila!.clave, campo, valor)
            if (await onGuardar(sel.oferta!, g)) setCelda(null)
          }} />
      )}
    </div>
  )
}

function EditorCelda({ fila, oferta, ocupado, onCerrar, onGuardar }: {
  fila: FilaMatriz; oferta: OfertaVista; ocupado: boolean; onCerrar: () => void
  onGuardar: (campos: [CampoGarantia, number | 'incluida' | 'excluida' | null][]) => Promise<void>
}) {
  const v = oferta.garantias[fila.clave]
  const [estado, setEstado] = useState<string>(v?.estado ?? '')
  const [capital, setCapital] = useState(importeParaInput(v?.capital))
  const [limite, setLimite] = useState(importeParaInput(v?.limite))
  const [franq, setFranq] = useState(importeParaInput(v?.franquicia))
  const [err, setErr] = useState<string | null>(null)
  const campo = { minHeight: 44, padding: '0 10px', borderRadius: 10, border: BORDE, background: 'var(--surface)', color: 'var(--text)', font: 'inherit', minWidth: 0, width: '100%', boxSizing: 'border-box' as const }

  async function guardar() {
    const c = parsearImporteEs(capital), l = parsearImporteEs(limite), f = parsearImporteEs(franq)
    if (c === 'invalido' || l === 'invalido' || f === 'invalido') { setErr('Escribe los importes como 1.234,56 (vacío = no figura).'); return }
    await onGuardar([['estado', estado === 'incluida' || estado === 'excluida' ? estado : null], ['capital', c], ['limite', l], ['franquicia', f]])
  }

  return (
    <div style={{ border: '2px solid var(--primary)', borderRadius: 14, padding: 14, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <strong style={{ fontSize: 14 }}>{fila.etiqueta} · {oferta.compania ?? 'Sin compañía'}</strong>
      <div style={{ fontSize: 13 }}>
        <span style={{ color: 'var(--muted)' }}>Evidencia en el PDF: </span>
        {v?.evidencia?.texto
          ? <><strong>{v.evidencia.pagina !== null ? `pág. ${v.evidencia.pagina}` : 'página sin indicar'}</strong> — «{v.evidencia.texto}»</>
          : <span>sin cita ({NO_FIGURA}). No des por buena una cifra sin mirar el PDF.</span>}
        {citaNoEncontrada(oferta, fila.clave) && <div style={{ color: 'var(--warning)' }}>Esta cita NO se ha encontrado en el texto del PDF: míralo con lupa.</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
        <label style={{ fontSize: 12 }}>Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)} style={campo}>
            <option value="">{NO_FIGURA}</option><option value="incluida">Incluida</option><option value="excluida">Excluida</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>Capital<input inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} placeholder={NO_FIGURA} style={campo} /></label>
        <label style={{ fontSize: 12 }}>Límite<input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder={NO_FIGURA} style={campo} /></label>
        <label style={{ fontSize: 12 }}>Franquicia<input inputMode="decimal" value={franq} onChange={(e) => setFranq(e.target.value)} placeholder={NO_FIGURA} style={campo} /></label>
      </div>
      {err && <span style={{ fontSize: 12, color: 'var(--negative)' }}>{err}</span>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" disabled={ocupado} onClick={() => void guardar()} style={btnStyle('primario')}>Guardar celda</button>
        <button type="button" onClick={onCerrar} style={btnStyle('secundario')}>Cerrar</button>
      </div>
    </div>
  )
}

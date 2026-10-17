'use client'

// «Consultas a compañías» (fase 1, spec 2026-10-15-correduria-consultas-companias §4.1/§5): Alberto ELIGE a quién
// (nada premarcado), redacta borradores (uno por compañía), los edita y envía UNO A UNO con confirmación.
// 🚨 Redactar NO envía. El DNI nunca llega aquí entero: solo `docEnmascarado`. `null` ≠ `[]`.
// Se carga al abrir la sección; la lógica no trivial vive en `consultas-vista.ts` (con test).

import { useCallback, useMemo, useState } from 'react'
import { AREAS_CONTACTO, RAMOS, etiquetaArea, etiquetaRamo as etiquetaDeRamo, type AreaContacto } from '@central/module-seguros'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { interpretarPanel, leerConsultas, type CompaniaConsulta, type ConsultaDTO, type DocumentoConsulta, type PanelConsultas } from '@/lib/correduria/consultas-companias-asegura'
import { fechaEs, motivoDe, type Respuesta } from './piezas-riesgo'
import {
  AVISO_ADJUNTO, agruparCompanias, avisoFaltan, contarSeleccion, destinatariosMarcados, diasEspera, etiquetaRamo, filaCompetencia,
  mostrarAvisoAdjunto, ordenarConsultas, rotuloContador, rotuloEstado, textoErrorEnvio, textoErrorPanel, tonoEstado,
} from './consultas-vista'

const BORDE = '1px solid var(--border, rgba(128,128,128,.25))'
const campo: React.CSSProperties = { padding: '10px 12px', border: BORDE, borderRadius: 8, fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box', font: 'inherit' }
const fila: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, cursor: 'pointer' }
const casilla: React.CSSProperties = { width: 22, height: 22, marginTop: 10, flexShrink: 0 }
const rejilla: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }

async function llamar(url: string, init: RequestInit): Promise<Respuesta> {
  try {
    const res = await fetch(url, init)
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { ok: res.ok, status: res.status, json }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}
const enviarJson = (metodo: string, url: string, cuerpo: unknown) => llamar(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })

export default function ConsultasCompanias({ oportunidadId, hoy }: { oportunidadId: string; hoy: string }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<PanelConsultas | null>(null)
  const [cargando, setCargando] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [panel, setPanel] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [identidad, setIdentidad] = useState(true)
  const [competencia, setCompetencia] = useState(false)
  const [adjuntos, setAdjuntos] = useState<Set<string>>(new Set())
  const [antes, setAntes] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async (primera = false) => {
    setCargando(true)
    try {
      const res = await fetch(`/api/correduria/consultas-companias?oportunidadId=${encodeURIComponent(oportunidadId)}`, { cache: 'no-store' })
      const l = interpretarPanel(res.status, await res.json().catch(() => null))
      if (l.estado === 'ok') {
        setDatos(l.datos); setErrorCarga(null)
        if (primera) setAntes(l.datos.responderAntesPropuesta ?? '')
      } else setErrorCarga(textoErrorPanel(l))
    } catch {
      setErrorCarga(textoErrorPanel({ estado: 'error', motivo: 'sin conexión' }))
    } finally { setCargando(false) }
  }, [oportunidadId])

  function alternar() {
    const abre = !abierto
    setAbierto(abre)
    if (abre && !datos && !cargando) void cargar(true)
  }

  const companias = useMemo(() => datos?.companias ?? [], [datos])
  const grupos = useMemo(() => agruparCompanias(companias, datos?.ramo ?? null), [companias, datos?.ramo])
  const cuenta = useMemo(() => contarSeleccion(companias, marcados), [companias, marcados])
  const consultas = useMemo(() => ordenarConsultas(datos?.consultas ?? []), [datos?.consultas])
  const borradores = consultas.filter((c) => c.estado === 'borrador')
  const faltan = datos ? avisoFaltan(datos.faltan, datos.ramo) : null
  const aviso_adj = datos?.avisoAdjuntos ?? AVISO_ADJUNTO

  function alternarContacto(id: string) {
    setMarcados((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function alternarAdjunto(id: string) {
    setAdjuntos((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function redactar() {
    if (!datos) return
    const destinatarios = destinatariosMarcados(companias, marcados)
    if (destinatarios.length === 0) return
    setOcupado('redactar'); setAviso(null)
    const r = await enviarJson('POST', '/api/correduria/consultas-companias/borradores', {
      oportunidadId, destinatarios, incluirIdentidad: identidad, incluirCompetencia: competencia && !!datos.competencia,
      adjuntos: [...adjuntos], responderAntes: antes || null,
    })
    setOcupado(null)
    // Con varias compañías, alguna pudo quedar creada antes del fallo: se recarga SIEMPRE para no esconderla.
    if (!r.ok) { setAviso({ ok: false, texto: `Borradores NO redactados (o no todos): ${motivoDe(r)}. Mira abajo cuáles hay.` }); await cargar(false); return }
    const nuevos = leerConsultas(r.json?.consultas)
    const conPlantilla = Array.isArray(r.json?.redaccion) ? (r.json.redaccion as Array<{ por?: unknown }>).filter((x) => x?.por === 'plantilla').length : 0
    const nota = conPlantilla > 0 ? ` ${conPlantilla === 1 ? 'Uno lleva' : `${conPlantilla} llevan`} la plantilla fija porque la IA no respondió: revísalo con más cuidado.` : ''
    setAviso({ ok: true, texto: `${nuevos.length} ${nuevos.length === 1 ? 'borrador redactado' : 'borradores redactados'}. No se ha enviado nada: revísalos y envía uno a uno.${nota}` })
    setPanel(false); setMarcados(new Set()); setAdjuntos(new Set()); setCompetencia(false)
    await cargar(false)
  }

  return (
    <section style={{ ...cardStyle, ...rejilla }}>
      <button type="button" onClick={alternar} aria-expanded={abierto} style={{ all: 'unset', cursor: 'pointer', minHeight: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Consultas a compañías {datos ? `· ${datos.consultas.length}` : ''}</span>
        <span aria-hidden style={{ color: 'var(--muted)' }}>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <>
          <style>{`.cc-tabla{display:block}.cc-cards{display:none}@media (max-width:720px){.cc-tabla{display:none}.cc-cards{display:grid}}`}</style>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Pide precio o criterio técnico a comerciales y técnicos de compañías. Un correo por compañía, redactado como borrador: no sale nada hasta que tú lo apruebes y lo envíes.
          </p>
          {cargando && !datos && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>}
          {errorCarga && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{errorCarga}</p>}
          {aviso && <p role="status" style={{ margin: 0, fontSize: 13, color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>{aviso.texto}</p>}

          {datos && (
            <>
              <div>
                <button type="button" onClick={() => setPanel((v) => !v)} aria-expanded={panel} style={{ ...btnStyle('primario'), minHeight: 44 }}>
                  {panel ? 'Cerrar panel' : 'Consultar a compañías'}
                </button>
              </div>

              {panel && (
                <div style={{ ...rejilla, border: BORDE, borderRadius: 12, padding: 12 }}>
                  {faltan && <p role="note" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{faltan}</p>}
                  {companias.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>No hay compañías con contactos dados de alta. Añade uno desde «+ Añadir contacto» en cualquier compañía.</p>}

                  {grupos.delRamo.map((c) => <TarjetaCompania key={c.codigoDgs} comp={c} ramo={datos.ramo} marcados={marcados} onMarcar={alternarContacto} onCambio={() => cargar(false)} setAviso={setAviso} />)}
                  {grupos.delRamo.length === 0 && grupos.otras.length > 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Ninguna compañía tiene contactos clasificados para este ramo ({datos.ramo ?? 'sin ramo'}). Mira «Otras compañías».</p>
                  )}
                  {grupos.otras.length > 0 && (
                    <details>
                      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>Otras compañías · {grupos.otras.length}</summary>
                      <div style={{ ...rejilla, marginTop: 8 }}>
                        {grupos.otras.map((c) => <TarjetaCompania key={c.codigoDgs} comp={c} ramo={datos.ramo} marcados={marcados} onMarcar={alternarContacto} onCambio={() => cargar(false)} setAviso={setAviso} />)}
                      </div>
                    </details>
                  )}

                  {/* Pie */}
                  <div style={{ ...rejilla, borderTop: BORDE, paddingTop: 12 }}>
                    <label style={fila}>
                      <input type="checkbox" checked={identidad} onChange={(e) => setIdentidad(e.target.checked)} style={casilla} />
                      <span style={{ fontSize: 14 }}>
                        Incluir identidad del cliente
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                          {textoIdentidad(datos.tomador)}
                        </span>
                      </span>
                    </label>
                    {datos.competencia && (
                      <label style={fila}>
                        <input type="checkbox" checked={competencia} onChange={(e) => setCompetencia(e.target.checked)} style={casilla} />
                        <span style={{ fontSize: 14 }}>
                          Incluir referencia de competencia
                          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                            {(() => { const f = filaCompetencia(datos.competencia, eur); return `${f.compania} · ${f.prima} · ${f.coberturas}` })()}
                          </span>
                        </span>
                      </label>
                    )}
                    <Adjuntos documentos={datos.documentos} leidos={datos.documentosLeidos} aviso={aviso_adj} elegidos={[...adjuntos]} onAlternar={alternarAdjunto} />
                    <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, fontSize: 13 }}>
                      Responder antes de
                      <input type="date" value={antes} onChange={(e) => setAntes(e.target.value)} style={{ ...campo, maxWidth: 220 }} />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {datos.responderAntesPropuesta ? `Propuesta: ${fechaEs(datos.responderAntesPropuesta)} (vencimiento − 15 días). Editable.` : 'Sin vencimiento conocido: no se propone fecha. Puedes poner una.'}
                      </span>
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 14 }}>{rotuloContador(cuenta)}</strong>
                      <button type="button" onClick={() => void redactar()} disabled={cuenta.personas === 0 || ocupado !== null} style={{ ...btnStyle('primario'), minHeight: 44 }}>
                        {ocupado === 'redactar' ? 'Redactando…' : 'Redactar borradores'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {borradores.map((c) => (
                <Borrador key={c.id} c={c} documentos={datos.documentos} documentosLeidos={datos.documentosLeidos} aviso={c.avisoAdjuntos ?? aviso_adj} docEnmascarado={datos.tomador?.docEnmascarado ?? null} onCambio={() => cargar(false)} setAviso={setAviso} />
              ))}

              <TablaConsultas consultas={consultas.filter((c) => c.estado !== 'borrador')} competencia={datos.competencia} hoy={hoy} />
            </>
          )}
        </>
      )}
    </section>
  )
}

/** Qué identidad saldría con la casilla marcada. Sin dato o sin poder leerlo se DICE (nunca se da por buena). */
function textoIdentidad(t: PanelConsultas['tomador']): string {
  if (!t) return 'No se ha podido leer el tomador: no se sabe qué identidad saldría.'
  const nombre = t.nombre ?? 'nombre no consta'
  if (!t.docLegible) return `${nombre} · el documento no se ha podido leer: con la casilla marcada NO se podrá enviar hasta arreglarlo.`
  return `${nombre} · ${t.docEnmascarado ?? 'documento no consta (no se podrá enviar con identidad)'}`
}

function Adjuntos({ documentos, leidos, aviso, elegidos, onAlternar }: {
  documentos: DocumentoConsulta[]; leidos: boolean; aviso: string; elegidos: readonly string[]; onAlternar: (id: string) => void
}) {
  // Un adjunto ya elegido que ya no está en la lista se sigue enseñando (no se pierde en silencio al guardar).
  const ids = new Set(documentos.map((d) => d.id))
  return (
    <fieldset style={{ border: BORDE, borderRadius: 8, margin: 0, padding: 8, minWidth: 0 }}>
      <legend style={{ fontSize: 13, padding: '0 4px' }}>Adjuntos (opcional, ninguno por defecto)</legend>
      {!leidos ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>No se han podido leer los documentos de la ficha: no es que no haya, es que no se han podido mirar.</p>
      ) : documentos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>No hay documentos en la ficha ni en la oportunidad para adjuntar.</p>
      ) : null}
      {documentos.map((d) => (
        <label key={d.id} style={fila}>
          <input type="checkbox" checked={elegidos.includes(d.id)} onChange={() => onAlternar(d.id)} style={casilla} />
          <span style={{ fontSize: 14, overflowWrap: 'anywhere', paddingTop: 10 }}>
            {d.nombre}{d.competencia && <> <Badge tono="aviso">competencia</Badge></>}
          </span>
        </label>
      ))}
      {elegidos.filter((id) => !ids.has(id)).map((id) => (
        <div key={id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--warning)' }}>Un adjunto elegido ya no aparece en la ficha.</span>
          <button type="button" onClick={() => onAlternar(id)} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Quitarlo</button>
        </div>
      ))}
      {mostrarAvisoAdjunto(elegidos) && <p role="note" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--warning)' }}>{aviso}</p>}
    </fieldset>
  )
}

/** Casillas de ramos (los del enum `tipo_seguro`, con su nombre): nada de texto libre que asegura rechazaría. */
function SelectorRamos({ elegidos, onCambio }: { elegidos: readonly string[]; onCambio: (r: string[]) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 4 }}>
      {RAMOS.map((r) => (
        <label key={r.v} style={{ ...fila, alignItems: 'center' }}>
          <input type="checkbox" checked={elegidos.includes(r.v)} style={{ ...casilla, marginTop: 0 }}
            onChange={() => onCambio(elegidos.includes(r.v) ? elegidos.filter((x) => x !== r.v) : [...elegidos, r.v])} />
          <span style={{ fontSize: 13 }}>{r.label}</span>
        </label>
      ))}
    </div>
  )
}

function TarjetaCompania({ comp, ramo, marcados, onMarcar, onCambio, setAviso }: {
  comp: CompaniaConsulta; ramo: string | null; marcados: Set<string>; onMarcar: (id: string) => void
  onCambio: () => Promise<void>; setAviso: (a: { ok: boolean; texto: string } | null) => void
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [ramosEd, setRamosEd] = useState<string[]>([])
  const [alta, setAlta] = useState(false)
  const vacio = { nombre: '', cargo: '', area: '' as AreaContacto | '', email: '', ramos: [] as string[], clasificar: false }
  const [f, setF] = useState(vacio)
  const [ocupado, setOcupado] = useState(false)

  async function guardarRamos(id: string, ramos: string[] | null) {
    setOcupado(true)
    const r = await enviarJson('PATCH', '/api/correduria/consultas-companias/contactos', { contactoId: id, ramos })
    setOcupado(false)
    if (!r.ok) { setAviso({ ok: false, texto: `Ramos NO guardados: ${motivoDe(r)}` }); return }
    setEditando(null); setAviso({ ok: true, texto: 'Ramos guardados.' }); await onCambio()
  }
  async function crear() {
    setOcupado(true)
    const r = await enviarJson('POST', '/api/correduria/consultas-companias/contactos', {
      codigoDgs: comp.codigoDgs, nombre: f.nombre, cargo: f.cargo || null, area: f.area || null, email: f.email,
      // Sin marcar «clasificar» = sin clasificar (null), nunca «todos» ni «ninguno».
      ramos: f.clasificar ? f.ramos : null,
    })
    setOcupado(false)
    if (!r.ok) { setAviso({ ok: false, texto: `Contacto NO añadido: ${motivoDe(r)}` }); return }
    setAlta(false); setF(vacio); setAviso({ ok: true, texto: 'Contacto añadido.' }); await onCambio()
  }

  return (
    <div style={{ border: BORDE, borderRadius: 10, padding: 10, ...rejilla, gap: 6 }}>
      <strong style={{ fontSize: 14 }}>{comp.nombre}</strong>
      {comp.contactos.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Sin contactos dados de alta.</span>}
      {comp.contactos.map((c) => {
        const etq = etiquetaRamo(c, ramo)
        const area = c.area ? etiquetaArea(c.area as AreaContacto) ?? c.area : null
        return (
          <div key={c.id} style={rejilla}>
            <label style={fila}>
              <input type="checkbox" checked={marcados.has(c.id)} onChange={() => onMarcar(c.id)} style={casilla} disabled={!c.email} />
              <span style={{ fontSize: 14, minWidth: 0, overflowWrap: 'anywhere', paddingTop: 2 }}>
                {c.nombre}
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{[c.cargo, area, c.email ?? 'sin email: no se le puede escribir'].filter(Boolean).join(' · ')}</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  {etq && <Badge tono="positivo">{etq}</Badge>}
                  {c.ramos === null && <Badge tono="neutral" title="Sin clasificar: no se sabe qué ramos lleva">sin clasificar</Badge>}
                  {c.ramos !== null && c.ramos.length === 0 && <Badge tono="neutral" title="Revisado: no lleva ningún ramo">sin ramos</Badge>}
                  {c.ramos !== null && c.ramos.length > 0 && !etq && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.ramos.map(etiquetaDeRamo).join(', ')}</span>}
                </span>
              </span>
            </label>
            {editando === c.id ? (
              <div style={rejilla}>
                <SelectorRamos elegidos={ramosEd} onCambio={setRamosEd} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" disabled={ocupado} onClick={() => void guardarRamos(c.id, ramosEd)} style={{ ...btnStyle('primario'), minHeight: 44 }}>
                    {ramosEd.length === 0 ? 'Guardar: no lleva ninguno' : 'Guardar ramos'}
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => void guardarRamos(c.id, null)} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Dejar sin clasificar</button>
                  <button type="button" onClick={() => setEditando(null)} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setEditando(c.id); setRamosEd(c.ramos ?? []) }} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>Editar ramos</button>
            )}
          </div>
        )
      })}
      {alta ? (
        <div style={rejilla}>
          <input aria-label="Nombre" placeholder="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} style={campo} />
          <input aria-label="Cargo" placeholder="Cargo (opcional)" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} style={campo} />
          <select aria-label="Área" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as AreaContacto | '' })} style={campo}>
            <option value="">Área (sin indicar)</option>
            {AREAS_CONTACTO.map((a) => <option key={a} value={a}>{etiquetaArea(a)}</option>)}
          </select>
          <input aria-label="Email" type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={campo} />
          <label style={fila}>
            <input type="checkbox" checked={f.clasificar} onChange={(e) => setF({ ...f, clasificar: e.target.checked })} style={casilla} />
            <span style={{ fontSize: 14, paddingTop: 10 }}>Indicar ahora qué ramos lleva (si no, queda «sin clasificar»)</span>
          </label>
          {f.clasificar && <SelectorRamos elegidos={f.ramos} onCambio={(ramos) => setF({ ...f, ramos })} />}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={ocupado || !f.nombre.trim() || !f.email.trim()} onClick={() => void crear()} style={{ ...btnStyle('primario'), minHeight: 44 }}>Añadir</button>
            <button type="button" onClick={() => { setAlta(false); setF(vacio) }} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAlta(true)} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>+ Añadir contacto</button>
      )}
    </div>
  )
}

function Borrador({ c, documentos, documentosLeidos, aviso, docEnmascarado, onCambio, setAviso }: {
  c: ConsultaDTO; documentos: DocumentoConsulta[]; documentosLeidos: boolean; aviso: string; docEnmascarado: string | null
  onCambio: () => Promise<void>; setAviso: (a: { ok: boolean; texto: string } | null) => void
}) {
  const adjuntosIniciales = c.adjuntos.map((a) => a.id)
  const [asunto, setAsunto] = useState(c.asunto)
  const [cuerpo, setCuerpo] = useState(c.cuerpo)
  const [adj, setAdj] = useState<string[]>(adjuntosIniciales)
  const [antes, setAntes] = useState(c.responderAntes ?? '')
  const [ocupado, setOcupado] = useState<'guardar' | 'enviar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sucio = asunto !== c.asunto || cuerpo !== c.cuerpo || antes !== (c.responderAntes ?? '') || adj.join() !== adjuntosIniciales.join()
  // Lo que se ENVÍA manda: con la casilla marcada, solo sale identidad si la línea del tomador sigue en el cuerpo.
  const llevaIdentidad = c.identidadIncluida && (docEnmascarado === null || cuerpo.includes(docEnmascarado))
  const bloqueado = c.envioSinConfirmar

  async function guardar(): Promise<boolean> {
    setOcupado('guardar'); setError(null)
    const r = await enviarJson('PATCH', `/api/correduria/consultas-companias/${encodeURIComponent(c.id)}`, { asunto, cuerpo, adjuntos: adj, responderAntes: antes || null })
    setOcupado(null)
    if (!r.ok) { setError(`Borrador NO guardado: ${motivoDe(r)}`); if (r.status === 409) await onCambio(); return false }
    setAviso({ ok: true, texto: 'Borrador guardado.' }); await onCambio(); return true
  }
  async function enviar() {
    const para = c.destinatarios.map((d) => d.nombre ?? d.email ?? 'sin nombre').join(', ')
    const adjTxt = adj.length > 0 ? ` Con ${adj.length} ${adj.length === 1 ? 'adjunto' : 'adjuntos'}.` : ''
    if (!window.confirm(`Se envía AHORA por correo a ${c.companiaNombre} (${para}), desde hola@grupoasegura.es.${llevaIdentidad ? ' El correo lleva el nombre y el DNI/NIE/CIF ENTERO del cliente.' : ' Sin identidad del cliente.'}${adjTxt} ¿Enviar?`)) return
    if (sucio && !(await guardar())) return
    setOcupado('enviar'); setError(null)
    const r = await enviarJson('POST', `/api/correduria/consultas-companias/${encodeURIComponent(c.id)}/enviar`, { confirmar: true })
    setOcupado(null)
    if (!r.ok) {
      setError(textoErrorEnvio(r.status, r.json))
      // 409, «salió sin registrar» o «no se sabe»: recargar enseña el estado real (y bloquea el botón si quedó reservado).
      if (r.status === 409 || r.status === 0 || r.status >= 500) await onCambio()
      return
    }
    setAviso({ ok: true, texto: `Consulta enviada a ${c.companiaNombre}.` }); await onCambio()
  }

  return (
    <div style={{ border: BORDE, borderRadius: 10, padding: 10, ...rejilla }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14 }}>{c.companiaNombre}{c.codigoRef ? <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {c.codigoRef}</span> : null}</strong>
        <Badge tono={bloqueado ? 'aviso' : tonoEstado(c.estado)}>{bloqueado ? 'Envío sin confirmar' : rotuloEstado(c.estado)}</Badge>
      </div>
      {bloqueado && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          Este correo pudo salir y no quedó registrado (o se está enviando ahora). No se edita ni se reenvía desde aquí: mira Enviados de Gmail ({c.codigoRef ?? 'su código'}) y avisa para marcarla a mano.
        </p>
      )}
      <span style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
        Para: {c.destinatarios.map((d) => `${d.nombre ?? 'Sin nombre'}${d.email ? ` <${d.email}>` : ''}`).join(', ') || 'sin destinatarios'}
        {' · '}{llevaIdentidad ? 'lleva identidad del cliente' : 'sin identidad del cliente'}{c.competenciaIncluida ? ' · con referencia de competencia' : ''}
      </span>
      <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, fontSize: 13 }}>Asunto
        <input value={asunto} onChange={(e) => setAsunto(e.target.value)} disabled={bloqueado} maxLength={300} style={campo} />
      </label>
      <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, fontSize: 13 }}>Cuerpo
        <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} disabled={bloqueado} rows={10} style={{ ...campo, minHeight: 160, resize: 'vertical' }} />
      </label>
      {c.identidadIncluida && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Aquí ves el documento enmascarado{docEnmascarado ? ` (${docEnmascarado})` : ''}: al enviar, asegura pone el documento ENTERO en su sitio. No lo retoques; si borras esa línea, el correo sale sin identidad.
        </span>
      )}
      <Adjuntos documentos={documentos} leidos={documentosLeidos} aviso={aviso} elegidos={adj} onAlternar={(id) => setAdj((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
      <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, fontSize: 13 }}>Responder antes de
        <input type="date" value={antes} onChange={(e) => setAntes(e.target.value)} disabled={bloqueado} style={{ ...campo, maxWidth: 220 }} />
      </label>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void guardar()} disabled={bloqueado || !sucio || ocupado !== null} style={{ ...btnStyle('secundario'), minHeight: 44 }}>{ocupado === 'guardar' ? 'Guardando…' : 'Guardar borrador'}</button>
        <button type="button" onClick={() => void enviar()} disabled={bloqueado || ocupado !== null || c.destinatarios.length === 0} style={{ ...btnStyle('primario'), minHeight: 44, overflowWrap: 'anywhere' }}>{ocupado === 'enviar' ? 'Enviando…' : `Aprobar y enviar a ${c.companiaNombre}`}</button>
      </div>
    </div>
  )
}

function TablaConsultas({ consultas, competencia, hoy }: { consultas: ConsultaDTO[]; competencia: PanelConsultas['competencia']; hoy: string }) {
  if (consultas.length === 0 && !competencia) return <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Todavía no se ha enviado ninguna consulta.</p>
  const comp = competencia ? filaCompetencia(competencia, eur) : null
  const cel = { padding: '8px 6px', borderTop: BORDE, fontSize: 13, textAlign: 'left' as const, verticalAlign: 'top' as const }
  const contactos = (c: ConsultaDTO) => c.destinatarios.map((d) => d.nombre ?? d.email ?? 'Sin nombre').join(', ') || '—'
  const espera = (c: ConsultaDTO) => { const d = diasEspera(c.enviadaAt, c.respondidaAt, hoy); return d === null ? '—' : `${d} ${d === 1 ? 'día' : 'días'}` }
  return (
    <>
      <div className="cc-tabla" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Compañía', 'Contactos', 'Estado', 'Enviada', 'Respondida', 'Espera'].map((h) => <th key={h} style={{ ...cel, borderTop: 'none', fontWeight: 600 }}>{h}</th>)}</tr></thead>
          <tbody>
            {comp && <tr><td style={cel}><strong>Competencia</strong></td><td style={cel} colSpan={5}>{comp.compania} · {comp.prima} · {comp.coberturas}</td></tr>}
            {consultas.map((c) => (
              <tr key={c.id}>
                <td style={cel}>{c.companiaNombre}</td><td style={cel}>{contactos(c)}</td>
                <td style={cel}><Badge tono={tonoEstado(c.estado)}>{rotuloEstado(c.estado)}</Badge></td>
                <td style={cel}>{fechaEs(c.enviadaAt) ?? '—'}</td><td style={cel}>{fechaEs(c.respondidaAt) ?? '—'}</td><td style={cel}>{espera(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cc-cards" style={{ gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        {comp && <div style={{ border: BORDE, borderRadius: 10, padding: 10, fontSize: 13 }}><strong>Competencia</strong><br />{comp.compania} · {comp.prima} · {comp.coberturas}</div>}
        {consultas.map((c) => (
          <div key={c.id} style={{ border: BORDE, borderRadius: 10, padding: 10, fontSize: 13, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>{c.companiaNombre}</strong><Badge tono={tonoEstado(c.estado)}>{rotuloEstado(c.estado)}</Badge></div>
            <span style={{ overflowWrap: 'anywhere' }}>{contactos(c)}</span>
            <span>Enviada: {fechaEs(c.enviadaAt) ?? '—'} · Respondida: {fechaEs(c.respondidaAt) ?? '—'} · Espera: {espera(c)}</span>
          </div>
        ))}
      </div>
    </>
  )
}

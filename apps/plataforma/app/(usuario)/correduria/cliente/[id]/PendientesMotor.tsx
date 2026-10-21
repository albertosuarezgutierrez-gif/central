'use client'

// Pendientes del presupuesto de MOTOR por bloque (20/10/2026). Tres bloques (Personas · Riesgo · Póliza actual y bonificaciones);
// cada uno enseña ARRIBA solo lo que falta o hay que confirmar (la unión de lo que piden las compañías activas), editable ahí, y
// pliega lo completo en un <details>. Quien calcula los pendientes es `PrecioBots` (tiene el formulario y las compañías) y los
// PUBLICA aquí; los bloques de la página los leen. Sin publicación (aún no se sabe qué falta) los bloques se ven enteros, como
// antes: «no se ha mirado» ≠ «no falta nada». Sin proveedor (pantalla completa del cotizador) PrecioBots los pinta en línea.
//
// Los campos se guardan con las MISMAS funciones de `PrecioBots` (tarificador-bots-extra.ts); aquí solo se pintan.
// 🚨 Lo de la ficha se nombra («se toma de la ficha»), nunca se pinta su valor. Lo SUPUESTO se marca «Confirmar».
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cardStyle } from '@/components/ui'
import type { BloqueObligatorio } from '@central/module-tarificacion'
import type { PendientesPorBloque, Pendiente } from '@/lib/tarificador-pendientes'
import {
  ROTULO_BLOQUE, bloqueDeChip, bloquesEnLinea, camposCompletosDeBloque, idBloqueMotor, rotuloCompleto, rotuloEstadoPendiente, textoChip, tituloChip, vistaBloque,
} from '@/lib/tarificador-pendientes-vista'
import { abrirSeccion } from '../../oportunidad/[id]/SeccionPlegable'

/** Un campo suelto del adaptador ya resuelto para pintar (valor visible, opciones, y cómo fue su último guardado). */
export type CampoPanel = {
  clave: string; etiqueta: string; ayuda?: string; placeholder?: string; bloque: BloqueObligatorio
  opciones?: readonly { valor: string; etiqueta: string }[]
  texto?: boolean; maxLength?: number
  /** Fecha: `<input type="date">` (valor ISO). */
  fecha?: boolean
  valor: string
  /** Último guardado de ESTE campo: `ok:false` = NO se guardó (se dice el motivo y el campo se marca). `null` = sin intento. */
  guardado: { ok: boolean; texto: string } | null
}

export type PanelPendientes = {
  pendientes: PendientesPorBloque
  /** Faltantes generales del formulario que no son un campo suelto (matrícula, marca…). */
  sueltos: string[]
  campos: CampoPanel[]
  /** compañía → nombre rotulado. */
  nombres: Record<string, string>
  /** compañía → por qué su bot no puede encolar con esta ficha (no es un dato del presupuesto). */
  bloqueos: Record<string, string>
}

export type AccionesPanel = { cambiar: (clave: string, valor: string) => void; guardar: (clave: string, valor: string) => void }
type Publicado = { panel: PanelPendientes; acciones: AccionesPanel }

type Ctx = { publicado: Publicado | null; publicar: (p: Publicado | null) => void }
export const PendientesMotorContext = createContext<Ctx | null>(null)

export function PendientesMotorProvider({ children }: { children: ReactNode }) {
  const [publicado, setPublicado] = useState<Publicado | null>(null)
  const publicar = useCallback((p: Publicado | null) => setPublicado(p), [])
  const valor = useMemo(() => ({ publicado, publicar }), [publicado, publicar])
  return <PendientesMotorContext.Provider value={valor}>{children}</PendientesMotorContext.Provider>
}

/** Sección plegada de la pantalla del riesgo (`RiesgoPantalla`) donde vive cada bloque de motor. */
const SECCION_DE_BLOQUE: Record<BloqueObligatorio, string> = { personas: 'sec-intervinientes', riesgo: 'sec-objeto', poliza: 'sec-historial' }

/**
 * Lleva al bloque (el scroller de plataforma es `LayoutShell`: `scrollIntoView` vale). En la pantalla del riesgo el bloque vive en
 * una `SeccionPlegable` PEREZOSA (plegada = sin montar, sin id que buscar): se abre la sección y se va al bloque cuando ya está.
 */
export function irABloque(bloque: BloqueObligatorio, abrirCompleto = false) {
  const id = idBloqueMotor(bloque)
  const desplegarCompleto = () => { if (abrirCompleto) { const d = document.getElementById(`${id}-completo`); if (d instanceof HTMLDetailsElement) d.open = true } }
  if (document.getElementById(SECCION_DE_BLOQUE[bloque])) {
    abrirSeccion(SECCION_DE_BLOQUE[bloque], id)
    window.setTimeout(desplegarCompleto, 60)
    return
  }
  desplegarCompleto()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const ENTRADA: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }

function Insignia({ estado }: { estado: Pendiente['estado'] }) {
  const color = estado === 'falta' ? 'var(--negative)' : estado === 'supuesto' ? 'var(--warning)' : 'var(--muted)'
  return <span style={{ fontSize: 12, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap', flex: 'none' }}>{rotuloEstadoPendiente(estado)}</span>
}

/** Control de un campo suelto. El guardado fallido se dice y marca el campo: nunca parece guardado. */
function ControlCampo({ campo, acciones, estado }: { campo: CampoPanel; acciones: AccionesPanel; estado?: Pendiente['estado'] }) {
  const mal = campo.guardado?.ok === false
  const estilo = { ...ENTRADA, ...(mal ? { borderColor: 'var(--negative)' } : {}) }
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 13, minWidth: 0 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{campo.etiqueta}</span>
        {estado && <Insignia estado={estado} />}
      </span>
      {campo.ayuda && <span style={{ color: 'var(--muted)', fontSize: 12 }}>{campo.ayuda}</span>}
      {campo.opciones ? (
        <select value={campo.valor} aria-invalid={mal || undefined} style={estilo}
          onChange={(e) => { const v = e.target.value; acciones.cambiar(campo.clave, v); acciones.guardar(campo.clave, v) }}>
          {campo.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      ) : (
        <input type={campo.fecha ? 'date' : undefined} inputMode={campo.fecha ? undefined : campo.texto ? 'text' : 'numeric'} maxLength={campo.maxLength} autoComplete="off" value={campo.valor} placeholder={campo.placeholder}
          aria-invalid={mal || undefined} style={estilo}
          onChange={(e) => acciones.cambiar(campo.clave, e.target.value)} onBlur={(e) => acciones.guardar(campo.clave, e.target.value)} />
      )}
      {campo.guardado && (
        <span role={mal ? 'alert' : 'status'} style={{ fontSize: 12, color: mal ? 'var(--negative)' : 'var(--muted)', overflowWrap: 'anywhere' }}>
          {mal ? `No guardado: ${campo.guardado.texto}` : campo.guardado.texto}
        </span>
      )}
    </label>
  )
}

/**
 * Lo pendiente de UN bloque (props puras): controles editables, lo de la ficha nombrado, y lo que se completa abajo.
 * `completarAbajo`: solo la ficha de la oportunidad tiene el bloque de siempre plegado debajo; en la pantalla completa del
 * cotizador no existe ese destino, así que no se ofrece «Completar abajo» (se remite al formulario de arriba).
 */
export function PendientesBloqueVista({ bloque, panel, acciones, completarAbajo = true }: { bloque: BloqueObligatorio; panel: PanelPendientes; acciones: AccionesPanel; completarAbajo?: boolean }) {
  const v = vistaBloque(panel.pendientes.bloques[bloque], panel.pendientes.evaluado)
  if (v.listo && v.deLaFicha.length === 0) return <p style={{ margin: 0, fontSize: 13, color: 'var(--positive)' }}>Bots: nada pendiente en este bloque.</p>
  if (!v.hayPendiente && v.deLaFicha.length === 0) {
    // Sin evaluar (formulario incompleto o ninguna compañía evaluada): NO se dice que esté listo; se dice qué falta para saberlo.
    return (
      <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)', overflowWrap: 'anywhere' }}>
        Aún no se sabe qué piden las compañías{panel.sueltos.length ? `: falta ${panel.sueltos.join(', ')}` : ''}. Completa los datos del formulario.
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {v.aEditar.map((p) => {
        const campo = p.campoExtra ? panel.campos.find((c) => c.clave === p.campoExtra) : undefined
        const quien = p.companias.map((c) => panel.nombres[c] ?? c).join(', ')
        return (
          <div key={p.clave} style={{ display: 'grid', gap: 4, minWidth: 0 }}>
            {campo ? <ControlCampo campo={campo} acciones={acciones} estado={p.estado} /> : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{p.etiqueta}</span>
                <Insignia estado={p.estado} />
                {completarAbajo ? (
                  <button type="button" onClick={() => irABloque(bloque, true)}
                    style={{ all: 'unset', cursor: 'pointer', color: 'var(--primary)', textDecoration: 'underline', minHeight: 44, display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box' }}>
                    Completar abajo
                  </button>
                ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Se completa en el formulario de arriba.</span>}
              </div>
            )}
            {quien && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Lo pide: {quien}.</span>}
          </div>
        )
      })}
      {v.deLaFicha.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
          Se toma de la ficha: {v.deLaFicha.map((p) => p.etiqueta).join(', ')}.
        </p>
      )}
    </div>
  )
}

/** Campos sueltos del bloque que NO están pendientes: se editan en «<Bloque> · completo». */
function CamposCompletos({ bloque, panel, acciones }: { bloque: BloqueObligatorio; panel: PanelPendientes; acciones: AccionesPanel }) {
  const campos = camposCompletosDeBloque(panel.pendientes, panel.campos, bloque)
  if (campos.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {campos.map((c) => <ControlCampo key={c.clave} campo={c} acciones={acciones} />)}
    </div>
  )
}

/**
 * Envoltorio de un bloque de la página (Personas = intervinientes · Riesgo = vehículo · Póliza = historial). Si PrecioBots ya
 * publicó qué falta: título con su estado, pendientes arriba y el bloque de siempre PLEGADO en «<Bloque> · completo». Si no,
 * se pinta el bloque tal cual (nada se esconde sin saber qué falta).
 */
export function BloqueMotor({ bloque, activo, children }: { bloque: BloqueObligatorio; activo: boolean; children: ReactNode }) {
  const ctx = useContext(PendientesMotorContext)
  const pub = activo ? ctx?.publicado ?? null : null
  if (!pub) return <>{children}</>
  const v = vistaBloque(pub.panel.pendientes.bloques[bloque], pub.panel.pendientes.evaluado)
  return (
    <section id={idBloqueMotor(bloque)} aria-labelledby={`${idBloqueMotor(bloque)}-t`} style={{ ...cardStyle, display: 'grid', gap: 12, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)', scrollMarginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2 id={`${idBloqueMotor(bloque)}-t`} style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{ROTULO_BLOQUE[bloque]}</h2>
        <span style={{ fontSize: 13, fontWeight: 600, color: v.hayPendiente ? 'var(--negative)' : v.listo ? 'var(--positive)' : 'var(--warning)' }}>{v.resumen}</span>
      </div>
      <PendientesBloqueVista bloque={bloque} panel={pub.panel} acciones={pub.acciones} />
      <details id={`${idBloqueMotor(bloque)}-completo`} open={v.plegarCompleto ? undefined : true} style={{ minWidth: 0 }}>
        <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>{rotuloCompleto(bloque)}</summary>
        <div style={{ display: 'grid', gap: 12, marginTop: 8, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <CamposCompletos bloque={bloque} panel={pub.panel} acciones={pub.acciones} />
          {children}
        </div>
      </details>
    </section>
  )
}

/**
 * Sin proveedor (pantalla completa del cotizador): los bloques en línea. Pinta lo pendiente Y los campos sueltos ya completos
 * (uso, ámbito, clase de permiso, sexo, cilindrada…) plegados en «<Bloque> · completo»: si no, un campo no pendiente
 * desaparecería y no se podría corregir. El formulario del cotizador queda arriba, así que no hay «Completar abajo».
 */
export function PendientesEnLinea({ panel, acciones }: { panel: PanelPendientes; acciones: AccionesPanel }) {
  const con = bloquesEnLinea(panel.pendientes, panel.campos)
  if (con.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 12, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {con.map((b) => {
        const v = vistaBloque(panel.pendientes.bloques[b], panel.pendientes.evaluado)
        const completos = camposCompletosDeBloque(panel.pendientes, panel.campos, b)
        return (
          <section key={b} id={idBloqueMotor(b)} style={{ display: 'grid', gap: 8, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)', scrollMarginTop: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{ROTULO_BLOQUE[b]} · {v.resumen}</h3>
            <PendientesBloqueVista bloque={b} panel={panel} acciones={acciones} completarAbajo={false} />
            {completos.length > 0 && (
              <details id={`${idBloqueMotor(b)}-completo`} style={{ minWidth: 0 }}>
                <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>{rotuloCompleto(b)}</summary>
                <div style={{ marginTop: 8, minWidth: 0 }}><CamposCompletos bloque={b} panel={panel} acciones={acciones} /></div>
              </details>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Chips por compañía: «Allianz listo» · «Mapfre faltan 2» · «Generali no disponible». Los que faltan llevan a su bloque. */
export function ChipsCompanias({ panel }: { panel: PanelPendientes }) {
  return (
    <ul aria-label="Estado de los datos por compañía" style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {panel.pendientes.companias.map((r) => {
        const nombre = panel.nombres[r.compania] ?? r.compania
        const bloqueo = panel.bloqueos[r.compania] ?? null
        const bloque = bloqueDeChip(r, panel.pendientes)
        const texto = textoChip(r, nombre, bloqueo)
        const color = r.estado === 'listo' && !bloqueo ? 'var(--positive)' : r.estado === 'no_disponible' ? 'var(--muted)' : r.estado === 'faltan' ? 'var(--negative)' : 'var(--warning)'
        const estilo: React.CSSProperties = {
          display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', boxSizing: 'border-box', borderRadius: 999,
          border: `1px solid ${color}`, color, fontSize: 13, fontWeight: 700, textDecoration: 'none', maxWidth: '100%',
        }
        const title = tituloChip(r, panel.pendientes, nombre, bloqueo)
        return (
          <li key={r.compania} style={{ minWidth: 0 }}>
            {bloque ? (
              <a href={`#${idBloqueMotor(bloque)}`} title={title} style={estilo}
                onClick={(e) => { if (document.getElementById(idBloqueMotor(bloque)) || document.getElementById(SECCION_DE_BLOQUE[bloque])) { e.preventDefault(); irABloque(bloque) } }}>{texto}</a>
            ) : <span title={title} style={estilo}>{texto}</span>}
          </li>
        )
      })}
    </ul>
  )
}

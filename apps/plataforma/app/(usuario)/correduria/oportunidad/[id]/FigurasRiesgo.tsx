'use client'

// «Intervinientes» del riesgo: una tarjeta por papel (tomador, propietario, conductores). Tocar una
// abre su selector: el cliente de la oportunidad, sus vínculos y «+ Nueva persona». Cada persona es
// una FICHA (cliente_id), nunca texto suelto, y se agrupa por su id — dos homónimos no se funden.

import { useCallback, useEffect, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import { ROTULO_ROL, textoFaltan, type FiguraRiesgo, type Riesgo } from '@/lib/riesgo-asegura'
import { interpretarSolicitudesDatos, type SolicitudesDatos } from '@/lib/seguimiento-asegura'
import type { RolFigura } from '@central/module-seguros'
import NuevaPersona from './NuevaPersona'
import EditarFichaModal from './EditarFichaModal'
import PedirDatosFigura from './PedirDatosFigura'
import { llamarFiguras, motivoDe } from './piezas-riesgo'
import { ramoConEnlaceDatos } from './variante'

type Opcion = { clienteId: string; nombre: string; detalle: string }

/**
 * ¿Quien entre en ese papel va a conducir? Mismo criterio que `leerRiesgo` de asegura: en coche o
 * moto conducen los conductores, y el tomador solo si no hay un conductor habitual en otra ficha.
 */
function conduceEnRiesgo(rol: RolFigura, ramo: string, figuras: FiguraRiesgo[]): boolean {
  if (ramo !== 'auto' && ramo !== 'moto') return false
  if (rol === 'conductor_habitual' || rol === 'conductor_ocasional') return true
  return rol === 'tomador' && !figuras.some((g) => g.rol === 'conductor_habitual')
}

export default function FigurasRiesgo({ riesgo, ocupado, onCambio, onError }: {
  riesgo: Riesgo
  ocupado: boolean
  onCambio: (texto: string) => void
  onError: (texto: string) => void
}) {
  const [abierto, setAbierto] = useState<RolFigura | null>(null)
  const [nueva, setNueva] = useState<RolFigura | null>(null)
  const [editando, setEditando] = useState<RolFigura | null>(null)
  const [enviando, setEnviando] = useState(false)
  const op = riesgo.oportunidad
  // Los enlaces de datos de este riesgo, UNA lectura para todas las figuras (luego se reparten por persona).
  const conEnlace = ramoConEnlaceDatos(op.ramo)
  const [enlaces, setEnlaces] = useState<SolicitudesDatos | null>(null)
  const leerEnlaces = useCallback(async () => {
    if (!conEnlace) return
    try {
      const res = await fetch(`/api/correduria/solicitud-datos?oportunidadId=${encodeURIComponent(op.id)}`, { cache: 'no-store' })
      setEnlaces(interpretarSolicitudesDatos(res.status, await res.json().catch(() => null)))
    } catch {
      setEnlaces({ estado: 'error', motivo: 'sin conexión' })
    }
  }, [conEnlace, op.id])
  useEffect(() => { void leerEnlaces() }, [leerEnlaces])

  // El cliente de la oportunidad y sus vínculos, UNA vez por ficha (identidad = clienteId).
  const opciones: Opcion[] = []
  const vistos = new Set<string>()
  const poner = (o: Opcion) => { if (!vistos.has(o.clienteId)) { vistos.add(o.clienteId); opciones.push(o) } }
  poner({ clienteId: op.clienteId, nombre: op.clienteNombre, detalle: 'el cliente' })
  for (const v of riesgo.vinculos) poner({ clienteId: v.clienteId, nombre: v.nombre, detalle: v.tipo ? `${v.tipo} de ${op.clienteNombre}` : 'vinculado' })

  async function asignar(rol: RolFigura, o: Opcion) {
    setEnviando(true)
    const r = await llamarFiguras('POST', { accion: 'asignar', oportunidadId: op.id, rol, clienteId: o.clienteId })
    setEnviando(false)
    if (!r.ok) { onError(`No se ha podido poner a ${o.nombre} como ${ROTULO_ROL[rol].toLowerCase()}: ${motivoDe(r)}`); return }
    setAbierto(null)
    onCambio(`${o.nombre} es ahora ${ROTULO_ROL[rol].toLowerCase()}.`)
  }

  async function quitar(rol: RolFigura, f: FiguraRiesgo) {
    setEnviando(true)
    const r = await llamarFiguras('DELETE', { oportunidadId: op.id, rol })
    setEnviando(false)
    if (!r.ok) { onError(`No se ha podido quitar a ${f.nombre}: ${motivoDe(r)}`); return }
    setAbierto(null)
    onCambio(rol === 'tomador' ? `El tomador vuelve a ser ${op.clienteNombre}.` : `${ROTULO_ROL[rol]}: vuelve a ser el mismo que el tomador.`)
  }

  const bloqueado = enviando || ocupado
  // «Pedirle los datos» va en la PRIMERA tarjeta de cada persona (quien es propietario y conductor sale una vez).
  const primeraDe = new Map<string, RolFigura>()
  for (const rol of riesgo.roles) {
    const f = riesgo.figuras.find((x) => x.rol === rol)
    if (f && !primeraDe.has(f.clienteId)) primeraDe.set(f.clienteId, rol)
  }

  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 12, minWidth: 0 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Intervinientes</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Cambiar a una persona no toca los presupuestos ya pedidos: cuenta para la próxima variante.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
        {riesgo.roles.map((rol) => {
          const f = riesgo.figuras.find((x) => x.rol === rol) ?? null
          const esTomador = rol === 'tomador'
          const nombre = f ? f.nombre : 'El mismo que el tomador'
          // `vinculo` es el tipo de relación tal cual («Padre/Madre»): dice qué es esa persona DEL cliente.
          const vinculo = f
            ? f.porDefecto || f.clienteId === op.clienteId
              ? 'el cliente'
              : f.vinculo
                ? `${f.vinculo} de ${op.clienteNombre}`
                : 'sin vínculo en su ficha'
            : null
          const falta = f ? textoFaltan(f.faltan) : null
          const puedeQuitar = f !== null && !f.porDefecto && !(esTomador && f.clienteId === op.clienteId)
          const abiertoAqui = abierto === rol
          return (
            <div key={rol} style={{ border: `1px solid ${abiertoAqui ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 12, padding: 12, display: 'grid', gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{ROTULO_ROL[rol]}</div>
              <div style={{ fontWeight: 700, color: f ? 'var(--text)' : 'var(--muted)', overflowWrap: 'anywhere' }}>{nombre}</div>
              {vinculo && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{vinculo}</div>}
              {falta && <div><Badge tono={f?.faltan === null ? 'neutral' : 'aviso'}>{falta}</Badge></div>}
              {f && conEnlace && f.clienteId !== op.clienteId && primeraDe.get(f.clienteId) === rol && (() => {
                const suyas = enlaces?.estado === 'ok' ? enlaces.solicitudes.filter((s) => s.personaId === f.clienteId) : []
                // Se ofrece si le falta algo (o no se pudo leer su ficha), o si ya hay un enlace suyo que enseñar.
                if (!(f.faltan === null || f.faltan.length > 0 || suyas.length > 0)) return null
                if (enlaces === null) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Mirando si ya se le pidieron los datos…</div>
                return (
                  <>
                    {enlaces.estado === 'error' && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>No se han podido mirar los enlaces de datos ({enlaces.motivo}).</div>
                    )}
                    <PedirDatosFigura
                      oportunidadId={op.id} personaId={f.clienteId} nombre={f.nombre}
                      solicitudes={suyas} sinLeer={enlaces.estado === 'error'} onCambio={() => void leerEnlaces()}
                    />
                  </>
                )
              })()}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={bloqueado} aria-expanded={abiertoAqui}
                  onClick={() => { setAbierto(abiertoAqui ? null : rol); setNueva(null) }}
                  style={{ ...btnStyle(abiertoAqui ? 'secundario' : 'sutil', 'sm'), minHeight: 44, color: 'var(--primary)' }}>
                  {abiertoAqui ? 'Cerrar' : 'Cambiar'}
                </button>
                {f && (
                  <button type="button" disabled={bloqueado} onClick={() => setEditando(rol)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, color: 'var(--primary)' }}>
                    Editar datos
                  </button>
                )}
                {puedeQuitar && f && (
                  <button type="button" disabled={bloqueado} onClick={() => void quitar(rol, f)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
                    Quitar
                  </button>
                )}
              </div>

              {abiertoAqui && (
                <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {opciones.map((o) => {
                    const actual = f?.clienteId === o.clienteId
                    return (
                      <button key={o.clienteId} type="button" disabled={bloqueado || actual} onClick={() => void asignar(rol, o)}
                        style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left', height: 'auto' }}>
                        <span style={{ minWidth: 0 }}>
                          <strong>{o.nombre}</strong> <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {o.detalle}{actual ? ' · ahora' : ''}</span>
                        </span>
                      </button>
                    )
                  })}
                  {riesgo.vinculos.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>No tiene familiares ni otros vínculos en su ficha.</div>
                  )}
                  <button type="button" disabled={bloqueado} onClick={() => setNueva(nueva === rol ? null : rol)}
                    style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, color: 'var(--primary)', justifyContent: 'flex-start' }}>
                    + Nueva persona
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editando && (() => {
        const f = riesgo.figuras.find((x) => x.rol === editando)
        if (!f) return null
        return (
          <EditarFichaModal
            oportunidadId={op.id} clienteId={f.clienteId} nombre={f.nombre}
            conduce={riesgo.figuras.some((g) => g.clienteId === f.clienteId && conduceEnRiesgo(g.rol, op.ramo, riesgo.figuras))}
            refresco={riesgo} onCerrar={() => setEditando(null)}
          />
        )
      })()}

      {nueva && (
        <NuevaPersona
          rol={nueva}
          ramo={op.ramo}
          conduce={conduceEnRiesgo(nueva, op.ramo, riesgo.figuras)}
          oportunidadId={op.id}
          clienteNombre={op.clienteNombre}
          onCerrar={() => setNueva(null)}
          onHecho={(texto) => { setNueva(null); setAbierto(null); onCambio(texto) }}
        />
      )}
    </section>
  )
}

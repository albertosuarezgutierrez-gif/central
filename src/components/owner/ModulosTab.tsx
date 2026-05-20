'use client'
// src/components/owner/ModulosTab.tsx
// Panel de activación de módulos por restaurante
// El dueño activa/desactiva módulos desde aquí
// VeriFactu y el núcleo son obligatorios y no se pueden desactivar

import { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'
import { invalidarCacheModulos } from '@/hooks/useModulo'

interface Props {
  restauranteId: string
  sh: () => Record<string, string>
}

// Definición de módulos con agrupación, descripción e impacto
const MODULOS = [
  // NÚCLEO — no desactivable
  { id: 'voz',        label: 'Voz',         grupo: 'nucleo', desc: 'PTT, transcripción Whisper, BRAIN IA, respuesta Elvira.' },
  { id: 'mesas',      label: 'Mesas',       grupo: 'nucleo', desc: 'Plano de sala, zonas y estados en tiempo real.' },
  { id: 'comandas',   label: 'Comandas',    grupo: 'nucleo', desc: 'Gestión completa de comandas, cobro y cuentas.' },
  { id: 'cobro',      label: 'Cobro',       grupo: 'nucleo', desc: 'Stripe Terminal y Bizum MONEI.' },
  { id: 'impresion',  label: 'Impresión',   grupo: 'nucleo', desc: 'Bridge, impresoras ESC/POS y tickets.' },
  { id: 'turnos',     label: 'Turnos',      grupo: 'nucleo', desc: 'Apertura y cierre de turno, caja.' },
  { id: 'verifactu',  label: 'VeriFactu',   grupo: 'nucleo', desc: 'Obligatorio por ley. Facturas con hash SHA-256 y QR AEAT.', legal: true },
  // INCLUIDOS EN CUOTA
  { id: 'kds',            label: 'KDS Cocina',       grupo: 'base', desc: 'Pantalla de cocina con estados por plato.' },
  { id: 'supervisor',     label: 'Supervisor',       grupo: 'base', desc: 'Alertas de tiempos: mesas sin comanda, cuentas sin cobrar, etc.' },
  { id: 'forecaster',     label: 'Eventos IA',    grupo: 'base', desc: 'Predicción de demanda con eventos y meteorología.' },
  { id: 'fichajes',       label: 'Fichajes',         grupo: 'base', desc: 'Control de jornada laboral (RD-ley 8/2019).' },
  { id: 'escaner',        label: 'Escáner IA',       grupo: 'base', desc: 'Sube fotos de albaranes, facturas y cartas. La IA los clasifica.' },
  { id: 'analytics',      label: 'Analytics',        grupo: 'base', desc: 'Métricas de ventas, tiempos y rendimiento del servicio.' },
  // OPCIONALES
  { id: 'almacen',        label: 'Almacén',          grupo: 'opcional', desc: 'Stock, movimientos y reposición automática. Requiere actualización diaria para ser útil. Desbloquea escandallos y pedidos a proveedor.' },
  { id: 'carta_vinos',    label: 'Carta de vinos',   grupo: 'opcional', desc: 'Catálogo de vinos, WineScanner IA y recomendador por plato.' },
  { id: 'qr',             label: 'QR Mesa',          grupo: 'opcional', desc: 'Carta digital, pedido y cobro desde el móvil del cliente (+12€/mesa/mes).' },
  { id: 'storefront',     label: 'Storefront',       grupo: 'opcional', desc: 'Tienda online propia para delivery y recogida.' },
  { id: 'reservas',       label: 'Reservas',         grupo: 'opcional', desc: 'Gestión de reservas, cubiertas y asignación de mesas.' },
  { id: 'rrhh',           label: 'RRHH',             grupo: 'opcional', desc: 'Candidatos y análisis de CVs con IA. Para el responsable de selección.' },
  { id: 'contabilidad',   label: 'Contabilidad',     grupo: 'opcional', desc: 'Asientos automáticos y exportación a A3/Sage/Holded. Necesita VeriFactu activo.' },
  { id: 'asistente',      label: 'Asistente IA',     grupo: 'opcional', desc: 'Chat con IA para resolver dudas de gestión, horarios y tareas del día.' },
]

const NUCLEO = new Set(MODULOS.filter(m => m.grupo === 'nucleo').map(m => m.id))

const GRUPOS_LABEL: Record<string, { label: string; color: string; bgColor: string; desc: string }> = {
  nucleo:   { label: 'Núcleo',            color: '#085041', bgColor: '#E1F5EE', desc: 'Siempre activos. No se pueden desactivar.' },
  base:     { label: 'Incluidos en cuota', color: '#27500A', bgColor: '#EAF3DE', desc: 'Actívalos o desactívalos según necesites. Sin coste adicional.' },
  opcional: { label: 'Opcionales',        color: '#633806', bgColor: '#FAEEDA', desc: 'Módulos avanzados. Consulta condiciones con tu asesor ia.rest.' },
}

export default function ModulosTab({ restauranteId, sh }: Props) {
  const [activos, setActivos] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/owner/modulos', { headers: sh() })
      const d = await r.json()
      setActivos(d.modulos_activos ?? [])
    } catch { /* usa todos por defecto */ }
    finally { setCargando(false) }
  }, [sh])

  useEffect(() => { cargar() }, [cargar])

  const toggle = (id: string) => {
    if (NUCLEO.has(id)) return // protegido
    setActivos(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
    setOk(false)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      await fetch('/api/owner/modulos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ modulos_activos: activos }),
      })
      invalidarCacheModulos(restauranteId)
      setOk(true)
    } finally { setGuardando(false) }
  }

  if (cargando) return (
    <div style={{ padding: 24, fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando módulos...</div>
  )

  const grupos = ['nucleo', 'base', 'opcional'] as const

  return (
    <div style={{ maxWidth: 640, padding: '0 0 40px' }}>
      {/* Cabecera */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', fontWeight: 700, marginBottom: 6 }}>
          CONFIG · MÓDULOS
        </div>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 24, color: C.ink, marginBottom: 8 }}>
          Módulos activos
        </div>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
          Activa solo lo que necesitas. Cada módulo desactivado deja de aparecer en el panel y deja de lanzar consultas — tu equipo ve una interfaz más limpia.
        </div>
      </div>

      {/* Grupos */}
      {grupos.map(grupo => {
        const info = GRUPOS_LABEL[grupo]
        const modulosGrupo = MODULOS.filter(m => m.grupo === grupo)
        return (
          <div key={grupo} style={{ marginBottom: 28 }}>
            {/* Header grupo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                fontFamily: SM, fontSize: 10, fontWeight: 700, padding: '3px 9px',
                borderRadius: 20, background: info.bgColor, color: info.color,
                letterSpacing: '.3px',
              }}>
                {info.label}
              </span>
              <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{info.desc}</span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {modulosGrupo.map(m => {
                const esActivo = activos.includes(m.id)
                const esNucleo = NUCLEO.has(m.id)
                return (
                  <div key={m.id}
                    onClick={() => toggle(m.id)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '11px 14px',
                      background: esActivo ? C.bone : C.paper,
                      border: `1px solid ${esActivo ? C.rule : C.ruleS}`,
                      borderRadius: 8,
                      cursor: esNucleo ? 'default' : 'pointer',
                      opacity: esNucleo ? 1 : esActivo ? 1 : 0.6,
                      transition: 'all .15s',
                    }}>
                    {/* Toggle visual */}
                    <div style={{
                      width: 36, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 2,
                      background: esActivo ? C.green : C.ruleS,
                      position: 'relative', transition: 'background .15s',
                    }}>
                      <div style={{
                        position: 'absolute', top: 3,
                        left: esActivo ? 18 : 3,
                        width: 14, height: 14, borderRadius: 7,
                        background: '#fff', transition: 'left .15s',
                      }} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                        <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>
                          {m.label}
                        </span>
                        {m.legal && (
                          <span style={{
                            fontFamily: SM, fontSize: 9, fontWeight: 700,
                            background: '#FCEBEB', color: '#A32D2D',
                            padding: '1px 6px', borderRadius: 5, letterSpacing: '.3px',
                          }}>
                            OBLIGATORIO POR LEY
                          </span>
                        )}
                        {esNucleo && !m.legal && (
                          <span style={{
                            fontFamily: SM, fontSize: 9, color: C.ink4,
                            padding: '1px 6px',
                          }}>
                            siempre activo
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, lineHeight: 1.4 }}>
                        {m.desc}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Botón guardar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <button onClick={guardar} disabled={guardando}
          style={{
            fontFamily: SN, fontSize: 13, fontWeight: 600,
            background: guardando ? C.ruleS : C.red,
            color: guardando ? C.ink3 : '#fff',
            border: 'none', borderRadius: 6, padding: '10px 20px',
            cursor: guardando ? 'not-allowed' : 'pointer',
          }}>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {ok && (
          <span style={{ fontFamily: SN, fontSize: 12, color: C.green }}>
            ✓ Cambios guardados. Recarga la app para verlos reflejados.
          </span>
        )}
      </div>
    </div>
  )
}

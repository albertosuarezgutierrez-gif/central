'use client'
// src/components/owner/DiagnosticoTab.tsx
// Panel de diagnóstico del sistema para /owner y /jefe
// El dueño puede ver qué pasa sin necesitar llamar a soporte

import React, { useState, useEffect, useCallback } from 'react'

/* ─── Tokens de diseño (idénticos a owner/page.tsx) ─── */
const C = {
  paper:'#F6F1E7', paper2:'#EFE7D6', paper3:'#E5DAC2', bone:'#FBF8F1',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6',
  red:'#D9442B', redD:'#A8311E', redS:'#F4D8CF',
  amber:'#E8A33B', amberD:'#A8761A', amberS:'#F7E3B6',
  green:'#3F7D44', greenS:'#D4E4D2',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

/* ─── Tipos ─── */
interface BridgeToken {
  nombre: string
  ultimo_ping: string | null
  minutos_desde_ping: number | null
  ok: boolean
  bridge_version: string | null
  estado: 'online' | 'advertencia' | 'offline' | 'sin_actividad'
}

interface ComandaResumen {
  id: string
  mesa: string
  estado: string
  created_at: string
  updated_at: string
}

interface ErrorResumen {
  id: string
  nivel: 'info' | 'warning' | 'critical'
  categoria: string
  mensaje: string
  funcion_origen: string | null
  created_at: string
  resuelto: boolean
}

interface ImpresoraResumen {
  nombre: string
  activa: boolean
  configurada: boolean
  connection_type: string
  ultimo_ping: string | null
  ip_address: string | null
  port: number
  mac_address: string | null
}

interface DiagnosticoData {
  ok: boolean
  timestamp: string
  estado_general: 'ok' | 'advertencia' | 'error'
  turno_activo: { id: string; nombre: string; estado: string; created_at: string } | null
  bridge: { tokens: BridgeToken[]; hay_bridge: boolean }
  comandas: { ultimas: ComandaResumen[]; total_24h: number }
  errores: { propios: ErrorResumen[]; globales_ultima_hora: ErrorResumen[]; total_pendientes: number }
  impresoras: ImpresoraResumen[]
}

/* ─── Helpers ─── */
function relativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

function estadoColor(estado: string): string {
  if (estado === 'ok' || estado === 'online' || estado === 'lista' || estado === 'cerrada') return C.green
  if (estado === 'advertencia' || estado === 'warning') return C.amber
  return C.red
}

function estadoBg(estado: string): string {
  if (estado === 'ok' || estado === 'online') return C.greenS
  if (estado === 'advertencia' || estado === 'warning') return C.amberS
  return C.redS
}

const ESTADO_COMANDA: Record<string, string> = {
  nueva: 'Nueva', en_curso: 'En cocina', lista: 'Lista', cerrada: 'Cerrada',
}

const CAT_LABEL: Record<string, string> = {
  ear: 'Voz/Whisper', brain: 'IA/BRAIN', courier: 'Rutas', vox: 'TTS',
  auth: 'Auth', stripe: 'Pagos', verifactu: 'VeriFactu', push: 'Push',
  edge: 'Edge Function', db: 'Base de datos', system: 'Sistema',
}

/* ─── Componente principal ─── */
interface Props {
  restauranteId: string
}

export default function DiagnosticoTab({ restauranteId }: Props) {
  const [data, setData]       = useState<DiagnosticoData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null)
  const [activandoBridge, setActivandoBridge] = useState<Record<string, 'idle'|'activando'|'ok'|'nolocal'>>({})

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/diagnostico', {
        headers: { 'x-ia-restaurante-id': restauranteId },
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()
      setData(json)
      setUltimaActualizacion(new Date())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el diagnóstico')
    } finally {
      setCargando(false)
    }
  }, [restauranteId])

  const activarBridge = useCallback(async (nombre: string) => {
    setActivandoBridge(prev => ({ ...prev, [nombre]: 'activando' }))
    try {
      const res = await fetch('http://localhost:47801/ping', {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        setActivandoBridge(prev => ({ ...prev, [nombre]: 'ok' }))
        setTimeout(() => cargar(), 4000)
      } else {
        setActivandoBridge(prev => ({ ...prev, [nombre]: 'nolocal' }))
      }
    } catch {
      setActivandoBridge(prev => ({ ...prev, [nombre]: 'nolocal' }))
    }
  }, [cargar])

  // Cargar al montar y cada 60 segundos
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 60_000)
    return () => clearInterval(t)
  }, [cargar])

  /* ── Loading ── */
  if (cargando) return (
    <div style={{ padding: '48px 0', textAlign: 'center', fontFamily: SM, fontSize: 12, color: C.ink4 }}>
      Comprobando el sistema…
    </div>
  )

  /* ── Error de red ── */
  if (error) return (
    <div style={{ background: C.redS, border: `1px solid ${C.red}`, borderRadius: 8, padding: '24px', margin: '16px 0' }}>
      <div style={{ fontFamily: SN, fontWeight: 600, color: C.redD, marginBottom: 4 }}>
        No se pudo cargar el diagnóstico
      </div>
      <div style={{ fontFamily: SM, fontSize: 12, color: C.redD }}>{error}</div>
      <button onClick={cargar} style={{
        marginTop: 12, fontFamily: SN, fontSize: 12, background: C.red, color: '#fff',
        border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer',
      }}>
        Reintentar
      </button>
    </div>
  )

  if (!data) return null

  const { estado_general, turno_activo, bridge, comandas, errores, impresoras } = data

  /* ── Banner estado general ── */
  const bannerTexto = estado_general === 'ok'
    ? '✓ Todo funciona correctamente'
    : estado_general === 'advertencia'
    ? '⚠ Hay una advertencia — revisa los detalles abajo'
    : '✗ Se ha detectado un problema — revisa los detalles abajo'

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 20, fontStyle: 'italic', color: C.ink }}>
            Estado del sistema
          </div>
          {ultimaActualizacion && (
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 2 }}>
              Actualizado {relativo(ultimaActualizacion.toISOString())} · se actualiza cada 60s
            </div>
          )}
        </div>
        <button onClick={cargar} style={{
          fontFamily: SN, fontSize: 12, color: C.ink3,
          background: C.paper2, border: `1px solid ${C.rule}`,
          borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
        }}>
          ↺ Actualizar
        </button>
      </div>

      {/* Banner general */}
      <div style={{
        background: estadoBg(estado_general),
        border: `1px solid ${estadoColor(estado_general)}`,
        borderRadius: 8, padding: '14px 18px', marginBottom: 24,
      }}>
        <span style={{ fontFamily: SN, fontWeight: 600, fontSize: 14, color: estadoColor(estado_general) }}>
          {bannerTexto}
        </span>
      </div>

      {/* ── Sección: Turno activo ── */}
      <Section titulo="Turno">
        {turno_activo ? (
          <Row
            label="Turno activo"
            valor={turno_activo.nombre || 'En curso'}
            detalle={`Abierto ${relativo(turno_activo.created_at)}`}
            ok={true}
          />
        ) : (
          <Row
            label="Turno"
            valor="Sin turno activo"
            detalle="Ábrelo desde la pestaña Turno antes del servicio"
            ok={false}
            esAdvertencia
          />
        )}
        <Row
          label="Comandas últimas 24h"
          valor={String(comandas.total_24h)}
          detalle={comandas.total_24h === 0 ? 'Sin actividad' : `${comandas.total_24h} comanda${comandas.total_24h > 1 ? 's' : ''} registradas`}
          ok={true}
        />
      </Section>

      {/* ── Sección: Impresoras y bridge ── */}
      <Section titulo="Impresoras">
        {!bridge.hay_bridge && impresoras.length === 0 && (
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, padding: '8px 0' }}>
            Sin impresoras configuradas. Ve a Config → Impresoras para añadir una.
          </div>
        )}

        {/* Impresoras configuradas */}
        {impresoras.map((imp, i) => {
          const ping = imp.ultimo_ping ? new Date(imp.ultimo_ping).getTime() : null
          const minPing = ping ? Math.floor((Date.now() - ping) / 60000) : null
          const bridgeOnline = bridge.tokens.some(b => b.estado === 'online')
          const ok = imp.activa && imp.configurada && (
            imp.connection_type === 'cloudprnt'
              ? minPing !== null && minPing < 5
              : bridgeOnline  // ip_local depende del bridge
          )
          const valorImpresora = ok ? 'Online'
            : !imp.activa ? 'Desactivada'
            : !imp.configurada ? 'Sin configurar'
            : imp.connection_type !== 'cloudprnt' && !bridgeOnline ? 'Bridge desconectado'
            : 'Sin actividad reciente'
          const ipLabel = imp.ip_address ? `${imp.ip_address}:${imp.port}` : null
          const lastOctet = imp.ip_address ? parseInt(imp.ip_address.split('.')[3] ?? '0') : 0
          const ipDinamica = lastOctet > 20 && lastOctet !== 100 && lastOctet !== 200 && lastOctet !== 254
          return (
            <div key={i}>
              <Row
                label={imp.nombre}
                valor={valorImpresora}
                detalle={
                  imp.connection_type === 'cloudprnt' && minPing !== null
                    ? `CloudPRNT · último ping ${minPing}m`
                    : imp.connection_type !== 'cloudprnt'
                    ? `Bridge local${ipLabel ? ` · ${ipLabel}` : ''}`
                    : imp.connection_type
                }
                ok={ok}
                esAdvertencia={!imp.activa || !imp.configurada}
              />
              {/* MAC + consejo IP fija */}
              {imp.mac_address && (
                <div style={{
                  margin: '4px 0 8px 0',
                  padding: '8px 12px',
                  background: ipDinamica ? 'rgba(232,163,59,.08)' : 'rgba(63,125,68,.08)',
                  border: `1px solid ${ipDinamica ? 'rgba(232,163,59,.25)' : 'rgba(63,125,68,.25)'}`,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column' as const,
                  gap: 3,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.ink2, letterSpacing: '.03em' }}>
                      MAC: {imp.mac_address}
                    </span>
                    {ipLabel && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.ink4 }}>
                        · IP: {ipLabel}
                      </span>
                    )}
                  </div>
                  {ipDinamica ? (
                    <div style={{ fontSize: 11, color: C.amber, lineHeight: 1.4 }}>
                      ⚠ IP dinámica — puede cambiar si el router se reinicia.{' '}
                      <strong style={{ color: C.amber }}>
                        Entra en tu router ({imp.ip_address?.split('.').slice(0,3).join('.')}.1) → DHCP → Reserva de IP
                        y fija la MAC anterior a la IP {imp.ip_address}.
                      </strong>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: C.green }}>
                      ✓ IP parece estable
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Bridge tokens */}
        {bridge.tokens.map((b, i) => {
          const bEstado = activandoBridge[b.nombre]
          const mostrarBoton = (b.estado === 'offline' || b.estado === 'sin_actividad') && bEstado !== 'ok'
          return (
          <div key={i}>
            <Row
              label={`Bridge: ${b.nombre}`}
              valor={
                b.estado === 'online' ? 'Conectado' :
                b.estado === 'advertencia' ? `Sin ping desde hace ${b.minutos_desde_ping}m` :
                b.estado === 'offline' ? `Desconectado (${b.minutos_desde_ping}m sin señal)` :
                'Sin actividad'
              }
              detalle={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>
                    {b.estado === 'offline'
                      ? 'Comprueba que el PC/tablet con el bridge está encendido y conectado a la red'
                      : b.ultimo_ping
                      ? `Último contacto ${relativo(b.ultimo_ping)}`
                      : 'Nunca se ha conectado'}
                  </span>
                  {b.bridge_version && (
                    <span style={{
                      fontFamily: SM,
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: b.ok ? C.greenS : C.amberS,
                      color: b.ok ? C.green : C.amberD,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      v{b.bridge_version}
                    </span>
                  )}
                </span>
              }
              ok={b.ok}
              esAdvertencia={b.estado === 'advertencia'}
            />
            {/* Botón activar bridge — solo visible desde el PC con el bridge */}
            {mostrarBoton && (
              <div style={{ margin: '4px 0 12px 17px' }}>
                <button
                  onClick={() => activarBridge(b.nombre)}
                  disabled={bEstado === 'activando'}
                  style={{
                    fontFamily: SN, fontSize: 12, fontWeight: 600,
                    background: bEstado === 'activando' ? C.paper3 : C.red,
                    color: bEstado === 'activando' ? C.ink4 : '#fff',
                    border: 'none', borderRadius: 6,
                    padding: '7px 16px', cursor: bEstado === 'activando' ? 'default' : 'pointer',
                    transition: 'background .15s',
                  }}
                >
                  {bEstado === 'activando' ? 'Conectando…' : '⏻ Activar Bridge'}
                </button>
                {bEstado === 'nolocal' && (
                  <div style={{
                    marginTop: 8,
                    padding: '10px 14px',
                    background: C.amberS,
                    border: `1px solid ${C.amber}`,
                    borderRadius: 6,
                    maxWidth: 420,
                  }}>
                    <div style={{ fontFamily: SN, fontWeight: 600, fontSize: 12, color: C.amberD, marginBottom: 3 }}>
                      El bridge no está ejecutándose en este PC
                    </div>
                    <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, lineHeight: 1.5 }}>
                      Este botón solo funciona desde el PC donde está instalado el bridge.
                      Si estás en ese PC, ábrelo desde el <strong>Menú Inicio → ia.rest Bridge</strong>,
                      o reinstálalo desde{' '}
                      <a href="/descargar" target="_blank" style={{ color: C.red, textDecoration: 'underline' }}>
                        iarest.es/descargar
                      </a>.
                    </div>
                  </div>
                )}
                {bEstado === 'ok' && (
                  <div style={{
                    marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: SN, fontSize: 12, color: C.green,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                    Bridge respondiendo — actualizando estado en 4 segundos…
                  </div>
                )}
              </div>
            )}
          </div>
          )
        })}
      </Section>

      {/* ── Sección: Últimas comandas ── */}
      {comandas.ultimas.length > 0 && (
        <Section titulo="Últimas comandas">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {comandas.ultimas.map((c) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 0', borderBottom: `1px solid ${C.rule}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontFamily: SM, fontSize: 11, fontWeight: 700,
                    color: C.ink2, minWidth: 32,
                  }}>
                    {c.mesa}
                  </span>
                  <span style={{
                    fontFamily: SN, fontSize: 11, padding: '2px 8px', borderRadius: 999,
                    background: estadoBg(c.estado),
                    color: estadoColor(c.estado),
                    border: `1px solid ${estadoColor(c.estado)}33`,
                  }}>
                    {ESTADO_COMANDA[c.estado] ?? c.estado}
                  </span>
                </div>
                <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                  {relativo(c.created_at)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Sección: Errores ── */}
      {(errores.total_pendientes > 0 || errores.globales_ultima_hora.length > 0) && (
        <Section titulo={`Errores pendientes (${errores.total_pendientes})`}>
          {[...errores.propios, ...errores.globales_ultima_hora].map((err) => (
            <div key={err.id} style={{
              background: err.nivel === 'critical' ? C.redS : C.amberS,
              border: `1px solid ${err.nivel === 'critical' ? C.red : C.amber}`,
              borderRadius: 6, padding: '10px 14px', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{
                  fontFamily: SM, fontSize: 10, fontWeight: 700,
                  color: err.nivel === 'critical' ? C.redD : C.amberD,
                  textTransform: 'uppercase',
                }}>
                  {err.nivel === 'critical' ? 'Crítico' : 'Aviso'} · {CAT_LABEL[err.categoria] ?? err.categoria}
                </span>
                <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                  {relativo(err.created_at)}
                </span>
              </div>
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>
                {err.mensaje}
              </div>
              {err.funcion_origen && (
                <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginTop: 3 }}>
                  {err.funcion_origen}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* ── Todo limpio ── */}
      {errores.total_pendientes === 0 && errores.globales_ultima_hora.length === 0 && (
        <div style={{
          background: C.greenS, border: `1px solid ${C.green}`,
          borderRadius: 8, padding: '16px 20px', textAlign: 'center',
        }}>
          <div style={{ fontFamily: SE, fontSize: 16, fontStyle: 'italic', color: C.green }}>
            Sin errores registrados
          </div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 2 }}>
            El sistema no ha reportado ningún problema en las últimas 24h
          </div>
        </div>
      )}

      {/* Aviso al dueño */}
      <div style={{
        marginTop: 24, padding: '12px 16px',
        background: C.paper2, border: `1px solid ${C.rule}`,
        borderRadius: 6, fontFamily: SN, fontSize: 12, color: C.ink3,
      }}>
        <strong style={{ color: C.ink2 }}>¿Hay un problema?</strong> Si el sistema muestra todo en verde
        y algo no funciona, el problema está en el dispositivo o la red local del restaurante —
        no en el software. Comprueba el WiFi o la impresora directamente.
      </div>
    </div>
  )
}

/* ─── Sub-componentes ─── */
function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontFamily: SM, fontSize: 9, letterSpacing: '.1em', color: C.ink4,
        textTransform: 'uppercase', marginBottom: 10,
        paddingBottom: 6, borderBottom: `1px solid ${C.rule}`,
      }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

function Row({ label, valor, detalle, ok, esAdvertencia = false }: {
  label: string; valor: string; detalle?: string | React.ReactNode; ok: boolean; esAdvertencia?: boolean
}) {
  const color = ok ? C.green : esAdvertencia ? C.amber : C.red
  const dot   = ok ? C.green : esAdvertencia ? C.amber : C.red
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.rule}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: dot, marginTop: 5, flexShrink: 0,
        }} />
        <div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, fontWeight: 500 }}>
            {label}
          </div>
          {detalle && (
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 2 }}>
              {detalle}
            </div>
          )}
        </div>
      </div>
      <div style={{
        fontFamily: SM, fontSize: 11, color, flexShrink: 0, fontWeight: 600,
      }}>
        {valor}
      </div>
    </div>
  )
}

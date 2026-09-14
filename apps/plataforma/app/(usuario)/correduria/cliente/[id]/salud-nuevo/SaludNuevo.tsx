'use client'

// Hermana de `.../vida-nuevo/VidaNuevo.tsx`, mismo patrón para SALUD.
// 🚧 Ver el aviso de `page.tsx`: el `risk` que se manda al vendor NO está
// verificado. `modalidadDeseada` es una nota para el corredor: NUNCA viaja al
// vendor (no hay campo confirmado donde ponerla).

import { useState } from 'react'
import { btnStyle, Badge, cardStyle, CardHeader } from '@/components/ui'
import { eur } from '@/lib/dinero'
import type { Opcion, Reparo, Supuesto, Precio, Fallo, ConsumoPuerto } from '@/lib/salud-nuevo-asegura'
import { pedirCotizacionSalud } from './acciones'

function euroODash(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : eur(n)
}

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%',
}

const CAMPOS_A_MANO: Record<string, { etiqueta: string; tipo: string } | undefined> = {
  dni: { etiqueta: 'DNI', tipo: 'text' },
  nombre: { etiqueta: 'Nombre', tipo: 'text' },
  apellido1: { etiqueta: 'Primer apellido', tipo: 'text' },
  telefono: { etiqueta: 'Móvil', tipo: 'tel' },
  fechaNacimiento: { etiqueta: 'Fecha de nacimiento', tipo: 'date' },
}

type Resultado =
  | { estado: 'idle' }
  | { estado: 'cotizando' }
  | {
      estado: 'ok'
      coste: string
      restantesHoy: number | null
      simulado: boolean
      avisoSimulacion: string | null
      resumen: string
      precios: Precio[]
      fallos: Fallo[]
      supuestos: Supuesto[]
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  | { estado: 'error'; mensaje: string; tope?: boolean; gastoDesconocido: boolean }

export default function SaludNuevo({
  clienteId,
  etiquetaCliente,
  faltanInicial,
  civiles,
  estadoCivil,
  estadoCivilMotivo,
  consumo,
  simulacion,
}: {
  clienteId: string
  etiquetaCliente: string
  faltanInicial: Reparo[] | null
  civiles: Opcion[]
  estadoCivil: Opcion | null
  estadoCivilMotivo: string | null
  consumo: ConsumoPuerto
  simulacion: boolean
}) {
  const [estadoCivilId, setEstadoCivilId] = useState(estadoCivil?.id ?? '')
  const [capital, setCapital] = useState('')
  const [modalidadDeseada, setModalidadDeseada] = useState('')
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  const faltaCivil = !estadoCivilId
  const faltaCapital = !capital.trim() || !(Number(capital) > 0)

  const aMano = (faltanInicial ?? []).filter((f) => f.campo === 'sexo' || CAMPOS_A_MANO[f.campo])
  const aManoSinRellenar = aMano.filter((f) => !(correcciones[f.campo] ?? '').trim())
  const huerfanos = (faltanInicial ?? []).filter(
    (f) => !RESUELTOS_EN_PANTALLA.has(f.campo as string) && !CAMPOS_A_MANO[f.campo],
  )

  const cotizando = resultado.estado === 'cotizando'
  const consumoPermite = consumo.estado === 'ok' ? consumo.veredicto.permitido : consumo.estado === 'no_disponible'
  const faltaAlgo = faltaCivil || faltaCapital || aManoSinRellenar.length > 0
  const puedePulsar = !cotizando && !faltaAlgo && (simulacion || consumoPermite)

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    const r = await pedirCotizacionSalud({
      clienteId,
      resueltos: {
        estadoCivilId,
        capital: Number(capital),
        // 🔒 `modalidadDeseada` NUNCA viaja al vendor: no hay campo confirmado
        // donde ponerla. Solo se manda como CORRECCIÓN informativa, que asegura
        // también descarta al construir la petición.
      },
      correcciones,
    })
    switch (r.estado) {
      case 'faltan':
        setResultado({ estado: 'faltan', faltan: r.faltan })
        return
      case 'tope':
        setResultado({ estado: 'error', mensaje: r.mensaje, tope: true, gastoDesconocido: false })
        return
      case 'proyecto_vigente':
      case 'ramo':
      case 'no_encontrada':
      case 'sin_configurar':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: false })
        return
      case 'error':
        setResultado({ estado: 'error', mensaje: r.mensaje, gastoDesconocido: r.gastoDesconocido })
        return
      case 'ok':
        setResultado({
          estado: 'ok',
          coste: r.coste,
          restantesHoy: r.restantesHoy,
          simulado: r.simulado,
          avisoSimulacion: r.avisoSimulacion,
          resumen: r.resumen,
          precios: r.precios,
          fallos: r.fallos,
          supuestos: r.supuestos,
        })
        return
      default: {
        const _exhaustivo: never = r
        return _exhaustivo
      }
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {faltanInicial === null && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13 }}>
          No se ha podido precalificar la ficha de {etiquetaCliente || 'este cliente'}: no se sabe qué datos
          personales faltan. Puedes seguir eligiendo el capital abajo (es gratis); el servidor cortará antes
          de gastar si falta algo.
        </div>
      )}

      <div style={cardStyle}>
        <CardHeader title="1 · La cobertura" sub="Salud no encaja bien en «capital»: es lo único mínimo disponible hoy sin el contrato del vendor. Lo teclea el corredor." />
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Campo etiqueta="Capital / importe de referencia (€)" falta={faltaCapital}>
            <input type="number" min={0} step={1000} value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="15000" style={input} />
          </Campo>
          <Campo etiqueta="Modalidad deseada" falta={false} ayuda="Nota para el corredor: NO viaja al vendor (no hay campo confirmado).">
            <input value={modalidadDeseada} onChange={(e) => setModalidadDeseada(e.target.value)} placeholder="p. ej. con dental" style={input} />
          </Campo>
        </div>
      </div>

      <div style={cardStyle}>
        <CardHeader
          title="2 · El tomador"
          sub={aMano.length > 0 ? 'Los datos personales NUNCA se suponen: los que falten se teclean aquí.' : 'La ficha trae todo lo personal; solo hay que confirmar el estado civil.'}
        />
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <Campo etiqueta="Estado civil" falta={faltaCivil} ayuda={estadoCivil ? `Viene de la ficha («${estadoCivil.nombre}»). Se puede cambiar.` : (estadoCivilMotivo ?? 'La ficha no lo dice o no casa con el catálogo: elígelo.')}>
            <select value={estadoCivilId} onChange={(e) => setEstadoCivilId(e.target.value)} style={input}>
              <option value="">Elige estado civil</option>
              {civiles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        </div>

        {aMano.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 8px' }}>
              De la ficha faltan {aMano.length === 1 ? 'este dato' : `estos ${aMano.length} datos`}. Rellénalos aquí —
              no se inventan solos:
            </p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {aMano.some((f) => f.campo === 'sexo') && (
                <Campo etiqueta="Sexo" falta={!(correcciones.sexo ?? '').trim()}>
                  <select value={correcciones.sexo ?? ''} onChange={(e) => setCorrecciones((c) => ({ ...c, sexo: e.target.value }))} style={input}>
                    <option value="">Elige</option>
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                  </select>
                </Campo>
              )}
              {aMano.filter((f) => CAMPOS_A_MANO[f.campo]).map((f) => (
                <Campo key={f.campo} etiqueta={CAMPOS_A_MANO[f.campo]!.etiqueta} falta={!(correcciones[f.campo] ?? '').trim()} ayuda={f.motivo}>
                  <input
                    type={CAMPOS_A_MANO[f.campo]!.tipo}
                    value={correcciones[f.campo] ?? ''}
                    onChange={(e) => setCorrecciones((c) => ({ ...c, [f.campo]: e.target.value }))}
                    style={input}
                  />
                </Campo>
              ))}
            </div>
          </div>
        )}

        {huerfanos.length > 0 && (
          <div style={{ ...cardStyle, marginTop: 12, borderColor: 'var(--negative)', padding: 12 }}>
            <strong style={{ color: 'var(--negative)' }}>Esto no se arregla desde esta pantalla:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {huerfanos.map((f) => <li key={f.campo}><strong>{f.campo}</strong>: {f.motivo}</li>)}
            </ul>
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              Hay que corregirlo en la ficha del cliente. Si se pulsa igualmente, el servidor lo rechaza sin gastar nada.
            </p>
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, borderColor: simulacion ? 'var(--warning)' : 'var(--negative)', borderWidth: 2 }}>
        <CardHeader title={simulacion ? '3 · Simular precio' : '3 · Pedir precio'} />
        {simulacion ? (
          <p style={{ fontSize: 13 }}>
            🧪 <strong>No se llama a ninguna compañía.</strong> El precio lo inventa central para poder ver la
            pantalla funcionando. No cuesta nada y no cuenta contra el tope.
          </p>
        ) : (
          <p style={{ fontSize: 13 }}>
            <strong style={{ color: 'var(--negative)' }}>Este clic gasta 0,50€ reales.</strong> Un solo intento:
            la petición no es idempotente, así que reintentar crea otro proyecto y otro cargo. El esquema de este
            ramo <strong>no está verificado</strong>: el primer intento puede fallar.
          </p>
        )}

        <Contador consumo={consumo} simulacion={simulacion} />

        <button type="button" onClick={() => void cotizar()} disabled={!puedePulsar} style={{ ...btnStyle('primario'), width: '100%', maxWidth: 420, marginTop: 12 }}>
          {cotizando ? (simulacion ? 'Simulando…' : 'Cotizando… (puede tardar hasta 2 min)') : simulacion ? 'Simular precio — no cuesta nada' : 'Pedir precio — cuesta 0,50€'}
        </button>
        {faltaAlgo && (
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
            El botón se enciende cuando no falte nada arriba. Corregir arriba no cuesta nada.
          </p>
        )}

        {resultado.estado === 'faltan' && (
          <div style={{ marginTop: 12 }}>
            <Badge tono="positivo">No se ha gastado nada</Badge>
            <ul style={{ fontSize: 13 }}>{resultado.faltan.map((f) => <li key={f.campo}><strong>{f.campo}</strong>: {f.motivo}</li>)}</ul>
          </div>
        )}
        {resultado.estado === 'error' && (
          <p style={{ color: 'var(--negative)', fontSize: 13, marginTop: 12, whiteSpace: 'pre-wrap' }}>
            {resultado.tope ? '🛑 Tope alcanzado: ' : '⚠️ '}{resultado.mensaje}
            {resultado.gastoDesconocido && <> <strong>No se sabe si esto se ha cobrado.</strong> Comprueba el consumo antes de volver a pulsar.</>}
          </p>
        )}
        {resultado.estado === 'ok' && <Precios r={resultado} simulacion={simulacion} />}
      </div>
    </div>
  )
}

function Campo({ etiqueta, falta, faltaTexto, ayuda, children }: { etiqueta: string; falta: boolean; faltaTexto?: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        <span>{etiqueta}</span>
        {falta && <Badge tono="aviso">falta{faltaTexto ? ` · ${faltaTexto}` : ''}</Badge>}
      </label>
      {children}
      {ayuda && <span style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginTop: 4 }}>{ayuda}</span>}
    </div>
  )
}

function Contador({ consumo, simulacion }: { consumo: ConsumoPuerto; simulacion: boolean }) {
  if (simulacion) return null
  if (consumo.estado === 'error') return <p style={{ color: 'var(--negative)', fontSize: 13 }}>{consumo.error}</p>
  if (consumo.estado === 'no_disponible') {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        No se ha podido leer el contador de gasto. {consumo.porque} El tope lo sigue aplicando asegura: si estuviera
        alcanzado, la respuesta lo dirá y no se cobrará nada.
      </p>
    )
  }
  return (
    <p style={{ color: consumo.veredicto.permitido ? 'var(--muted)' : 'var(--negative)', fontSize: 13 }}>
      Gastado este mes: <strong>{consumo.gastadoMes}</strong>
      {consumo.veredicto.permitido ? <> · quedan hoy <strong>{consumo.veredicto.restantesHoy}</strong> cotizaciones.</> : <> — {consumo.veredicto.explicacion}</>}
    </p>
  )
}

function Precios({ r, simulacion }: { r: Extract<Resultado, { estado: 'ok' }>; simulacion: boolean }) {
  return (
    <div style={{ marginTop: 12 }}>
      {r.simulado && (
        <div style={{ ...cardStyle, borderColor: 'var(--warning)', background: 'var(--warning-bg)', marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--warning)' }}>🧪 ESTO ES UNA SIMULACIÓN</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            {r.avisoSimulacion ?? 'Precio inventado por central para probar la pantalla: ninguna compañía lo ha dado y no se ha gastado ni un céntimo.'}
          </p>
        </div>
      )}
      {simulacion && !r.simulado && (
        <p style={{ color: 'var(--negative)', fontSize: 13, marginBottom: 12 }}>
          ⚠️ Esta pantalla se abrió en modo simulación, pero la respuesta no viene marcada como simulada: trátala
          como una cotización REAL y comprueba el consumo antes de volver a pulsar.
        </p>
      )}
      <p style={{ fontWeight: 700, margin: '0 0 4px' }}>{r.resumen}</p>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Coste de esta consulta: {r.coste}
        {r.restantesHoy !== null ? <> · quedan hoy {r.restantesHoy}.</> : <> · el libro de consumo no se ha mirado (no hacía falta).</>}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              <th style={th}>Compañía</th><th style={th}>Producto</th><th style={th}>Cobertura</th>
              <th style={th}>Prima anual</th><th style={th}>Franquicia</th><th style={th}>Firmeza</th>
            </tr>
          </thead>
          <tbody>
            {r.precios.map((p, i) => (
              <tr key={`${p.compania}-${p.producto}-${i}`}>
                <td style={td}>{p.compania ?? '—'}</td>
                <td style={td}>{p.producto ?? '—'}</td>
                <td style={td}>{p.categoria ?? <span style={{ color: 'var(--muted)' }}>sin declarar</span>}</td>
                <td style={td}>
                  <strong>{euroODash(p.primaEur)}</strong>
                  {r.simulado && <> <Badge tono="aviso">simulado</Badge></>}
                </td>
                <td style={td}>{p.franquiciaEur === null || p.franquiciaEur === undefined ? <span style={{ color: 'var(--muted)' }}>no la declara</span> : euroODash(p.franquiciaEur)}</td>
                <td style={td}><Badge tono={p.firmeza === 'firme' ? 'positivo' : 'aviso'} title={p.avisos?.join(' · ')}>{p.firmeza ?? 'sin determinar'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!r.simulado && r.precios.some((p) => p.firmeza !== 'firme') && (
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Los precios marcados como estimado o condicionado no son ofertas cerradas: la compañía puede cambiarlos al verificar los datos.</p>
      )}
      {r.fallos.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ color: 'var(--muted)', cursor: 'pointer', minHeight: 24, fontSize: 12 }}>
            {r.fallos.length} {r.fallos.length === 1 ? 'producto' : 'productos'} sin precio — ver por qué
          </summary>
          <ul style={{ margin: '6px 0 0', fontSize: 13 }}>
            {r.fallos.map((f, i) => (
              <li key={`${f.compania}-${i}`}>
                <strong>{f.compania ?? '—'}</strong>{f.producto ? ` · ${f.producto}` : ''}: {f.motivo ?? 'sin motivo declarado'}
                {f.tambienDioPrecio && <> <Badge tono="positivo">esta compañía sí dio otro precio</Badge></>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.supuestos.length > 0 && (
        <div style={{ marginTop: 12, borderLeft: '3px solid var(--warning)', paddingLeft: 10 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 4px' }}>Este precio sale con estos supuestos. Si alguno no es cierto, la prima real cambia:</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {r.supuestos.map((s, i) => (
              <li key={`${String(s.campo)}-${String(s.valor)}-${i}`}>
                <strong>{String(s.campo)}</strong>: {s.oculto ? <span style={{ color: 'var(--muted)' }}>(dato personal, se queda en asegura)</span> : <code>{String(s.valor)}</code>} — {s.porque}
                {s.optimista && <> <Badge tono="aviso">puede abaratar el precio</Badge></>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--border)' }

const RESUELTOS_EN_PANTALLA = new Set<string>(['capital', 'fechaEfecto', 'estadoCivil', 'sexo'])

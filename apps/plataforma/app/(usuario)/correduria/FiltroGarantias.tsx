'use client'

// Filtro por garantías + «ocultar al cliente» ANTES de preparar el presupuesto (28/09/2026).
// UN solo componente para todas las parrillas del corredor (retarificar y los «-nuevo» de cada
// ramo): sustituye al `<PrepararPresupuesto>` suelto y lo monta dentro, pasándole lo oculto.
//
// Lee la tarificación GUARDADA (gratis, un GET): solo ella trae el uuid de cada precio —la clave
// para ocultarlo— y sus garantías. 🚨 «Recargar» vuelve a LEER lo guardado; NUNCA vuelve a tarificar.
//
// Las coberturas se leen en segundo plano justo después de tarificar, así que lo normal es abrir
// esto con `garantias: null` en todos: se dice «Leyendo coberturas…», jamás «no incluye».

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EyeOff, Eye, RefreshCw } from 'lucide-react'

import { Badge, btnIcono, btnStyle } from '@/components/ui'
import { CeldaCompania } from './CeldaCompania'
import { eur } from '@/lib/dinero'
import { filtrarPorGarantias, interruptoresGarantias, ramoDeCatalogo } from '@central/module-seguros'
import {
  claveCompania,
  estaOculta,
  ocultarParaPreparar,
  opcionesDeParrilla,
  quedaAlgunaVisible,
  type OpcionParrilla,
} from '@/lib/filtro-garantias-parrilla'
import PrepararPresupuesto from './poliza/[id]/retarificar/PrepararPresupuesto'
import { pedirPreciosGuardados, type RespuestaPreciosGuardados } from './garantias-acciones'

const PAGINA = 50

type Carga = { estado: 'cargando' } | RespuestaPreciosGuardados

export default function FiltroGarantias({
  ramo,
  origen,
  tarificacionId,
  simulado,
}: {
  /** Ramo de la parrilla (`auto`, `moto`, `hogar`, `decesos`, `salud`, `vida`). Sin catálogo → sin interruptores. */
  ramo: string | null
  /** De dónde se lee lo guardado: la póliza (retarificar) o el cliente + ramo (cliente nuevo). */
  origen: { polizaId: string } | { clienteId: string; ramo: string }
  /**
   * La cotización que se acaba de pagar en pantalla. Si lo guardado es OTRA, no se filtra ni se
   * oculta sobre ella (sería decidir sobre precios que no son estos). `null` = la pantalla no lo sabe
   * (decesos/salud/vida): se usa la última guardada y se enseña su fecha.
   */
  tarificacionId: string | null
  simulado: boolean
}) {
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [ocultosPrecio, setOcultosPrecio] = useState<ReadonlySet<string>>(new Set())
  const [ocultasCompania, setOcultasCompania] = useState<ReadonlySet<string>>(new Set())
  const [preparado, setPreparado] = useState(false)
  const [mostrar, setMostrar] = useState(PAGINA)
  const [verSinDato, setVerSinDato] = useState(false)

  // El origen llega como objeto literal nuevo en cada render: se fija por su contenido.
  const claveOrigen = JSON.stringify(origen)
  const leer = useCallback(async () => {
    setCarga((c) => (c.estado === 'ok' ? c : { estado: 'cargando' }))
    try {
      setCarga(await pedirPreciosGuardados(JSON.parse(claveOrigen)))
    } catch {
      setCarga({ estado: 'error', mensaje: 'No se ha podido hablar con asegura.' })
    }
  }, [claveOrigen])
  const [recargando, setRecargando] = useState(false)
  async function recargar() {
    setRecargando(true)
    await leer()
    setRecargando(false)
  }

  useEffect(() => {
    void leer()
  }, [leer])

  // Sin id de la pantalla, solo vale una guardada de AHORA (margen de 10 min): una más vieja sería
  // otra consulta, y preparar sobre ella enseñaría al cliente precios que no son los de esta pantalla.
  const [montadoEn] = useState(() => Date.now())
  const esEsta = (c: { cotizacionId: string; creadaEn: string }) =>
    tarificacionId !== null
      ? c.cotizacionId === tarificacionId
      : Number.isFinite(Date.parse(c.creadaEn)) && Date.parse(c.creadaEn) >= montadoEn - 10 * 60_000
  const guardada = carga.estado === 'ok' && esEsta(carga) ? carga : null
  const otra = carga.estado === 'ok' && guardada === null
  const cotizacionPreparar = tarificacionId ?? guardada?.cotizacionId ?? null

  const { opciones, sinId, estado } = useMemo(
    () => (guardada ? opcionesDeParrilla(guardada.precios) : { opciones: [] as OpcionParrilla[], sinId: 0, estado: 'no_manda' as const }),
    [guardada],
  )
  const ramoCat = ramoDeCatalogo(ramo)
  const interruptores = useMemo(() => (ramoCat ? interruptoresGarantias(ramoCat, opciones) : []), [ramoCat, opciones])
  const filtro = useMemo(() => filtrarPorGarantias(opciones, marcadas), [opciones, marcadas])
  const ocultas = { companias: ocultasCompania, precios: ocultosPrecio }
  const companias = useMemo(() => {
    const m = new Map<string, { nombre: string; n: number }>()
    for (const o of opciones) {
      const k = claveCompania(o.compania)
      const x = m.get(k)
      if (x) x.n++
      else m.set(k, { nombre: o.compania, n: 1 })
    }
    return [...m.entries()].map(([clave, v]) => ({ clave, ...v })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [opciones])

  const ocultar = guardada ? ocultarParaPreparar(opciones, ocultas) : undefined
  const bloqueado = guardada && opciones.length > 0 && !quedaAlgunaVisible(opciones, ocultas)
    ? 'Has ocultado todas las opciones: no queda nada que enseñarle al cliente.'
    : null
  const etiquetasMarcadas = interruptores.filter((i) => marcadas.includes(i.clave)).map((i) => i.etiqueta.toLowerCase())

  function alternar<T>(s: ReadonlySet<T>, v: T): Set<T> {
    const n = new Set(s)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }

  const fila = (o: OpcionParrilla) => {
    const oculta = estaOculta(o, ocultas)
    const porCompania = ocultasCompania.has(claveCompania(o.compania))
    return (
      <li
        key={o.id}
        style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: oculta ? 0.5 : 1, minWidth: 0,
        }}
      >
        <div style={{ flex: '0 0 76px', minWidth: 0 }}>
          <CeldaCompania compania={o.compania} producto={o.producto} />
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, lineHeight: 1.3 }}>
          <div style={{ overflowWrap: 'anywhere' }}>{o.categoria ?? <span style={{ color: 'var(--muted)' }}>cobertura sin declarar</span>}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            {o.franquiciaEur === null ? 'franquicia no declarada' : o.franquiciaEur === 0 ? 'sin franquicia' : `franquicia ${eur(o.franquiciaEur)}`}
            {ramoCat === 'decesos' && (
              o.capitalServicioEur !== null ? <> · capital {eur(o.capitalServicioEur)}</> : <> · capital no consta</>
            )}
          </div>
          {oculta && <Badge tono="aviso">{porCompania ? 'compañía oculta' : 'oculta al cliente'}</Badge>}
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
          <strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{o.primaEur === null ? '—' : eur(o.primaEur)}</strong>
          {o.firmeza !== 'firme' && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{o.firmeza}</div>}
        </div>
        {!porCompania && (
          <button
            type="button"
            disabled={preparado}
            onClick={() => setOcultosPrecio((s) => alternar(s, o.id))}
            style={{ ...btnIcono('sutil'), flex: '0 0 auto' }}
            aria-pressed={ocultosPrecio.has(o.id)}
            aria-label={ocultosPrecio.has(o.id) ? 'Volver a enseñar al cliente' : 'Ocultar al cliente'}
            title={ocultosPrecio.has(o.id) ? 'Volver a enseñar al cliente' : 'Ocultar al cliente'}
          >
            {ocultosPrecio.has(o.id) ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </li>
    )
  }

  return (
    <section style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12, minWidth: 0 }}>
      <p style={{ margin: '0 0 4px' }}>
        <strong>Qué verá el cliente</strong>
      </p>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Toca el ojo para quitar un precio. Leer esto es gratis: no vuelve a cotizar.
      </p>

      {carga.estado === 'cargando' && <p className="muted">Leyendo la cotización guardada…</p>}
      {carga.estado === 'error' && (
        <p className="err">
          No se ha podido leer la cotización guardada ({carga.mensaje}). Sin ella no se puede filtrar por garantías ni
          ocultar opciones; el presupuesto se prepara con todas.{' '}
          <button type="button" onClick={recargar} disabled={recargando} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
            <RefreshCw size={14} /> {recargando ? 'Leyendo…' : 'Reintentar'}
          </button>
        </p>
      )}
      {carga.estado === 'ninguna' && (
        <p className="muted">
          {simulado
            ? 'Esta cotización es simulada y no se guarda: no hay garantías que filtrar.'
            : 'Asegura no tiene todavía una cotización real guardada para esto, así que no se puede filtrar ni ocultar.'}
        </p>
      )}
      {otra && (
        <p className="muted">
          La cotización guardada que devuelve asegura no es la de esta pantalla (se guardan solo las reales
          {'polizaId' in origen ? ' y, por póliza, solo las de auto' : ''}): no se filtra ni se oculta sobre precios que no son estos.
        </p>
      )}

      {guardada && (
        <>
          {tarificacionId === null && (
            <p className="muted" style={{ fontSize: 12 }}>
              Cotización guardada del {guardada.creadaEn ? new Date(guardada.creadaEn).toLocaleString('es-ES') : 'fecha no consta'}.
            </p>
          )}
          {(estado === 'leyendo' || estado === 'parcial') && (
            <p style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span>
                Leyendo coberturas…{' '}
                {estado === 'parcial'
                  ? `${opciones.filter((o) => o.garantias !== null).length} de ${opciones.length} leídas.`
                  : 'Se leen solas justo después de cotizar; tarda un momento.'}
              </span>
              <button type="button" onClick={recargar} disabled={recargando} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                <RefreshCw size={14} /> {recargando ? 'Leyendo…' : 'Recargar'}
              </button>
            </p>
          )}
          {estado === 'no_manda' && opciones.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>Asegura no manda todavía las garantías de cada precio: se puede ocultar, pero no filtrar.</p>
          )}
          {sinId > 0 && (
            <p className="muted" style={{ fontSize: 12 }}>
              {sinId} precio{sinId === 1 ? '' : 's'} llega{sinId === 1 ? '' : 'n'} sin identificador y no se puede{sinId === 1 ? '' : 'n'} ocultar por separado (sí ocultando su compañía).
            </p>
          )}

          {interruptores.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0' }}>Garantías que debe incluir:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {interruptores.map((i) => {
                  const on = marcadas.includes(i.clave)
                  return (
                    <button
                      key={i.clave}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setMarcadas((m) => (on ? m.filter((x) => x !== i.clave) : [...m, i.clave]))
                        setMostrar(PAGINA)
                      }}
                      style={{ ...btnStyle(on ? 'primario' : 'secundario', 'sm'), minHeight: 44 }}
                    >
                      {i.etiqueta} <span style={{ opacity: 0.7 }}>({i.conSi})</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {companias.length > 1 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0' }}>Compañías (toca para ocultarla entera):</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {companias.map((c) => {
                  const oculta = ocultasCompania.has(c.clave)
                  return (
                    <button
                      key={c.clave}
                      type="button"
                      disabled={preparado}
                      aria-pressed={oculta}
                      onClick={() => setOcultasCompania((s) => alternar(s, c.clave))}
                      style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, textDecoration: oculta ? 'line-through' : undefined }}
                      title={oculta ? 'Volver a mostrar esta compañía al cliente' : 'Ocultar compañía al cliente'}
                    >
                      {oculta ? <EyeOff size={14} /> : <Eye size={14} />} {c.nombre} ({c.n})
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {opciones.length > 0 && (
            <>
              <p style={{ fontSize: 13, margin: '8px 0 0' }}>
                <strong>{filtro.visibles.length}</strong> {marcadas.length ? `incluyen ${etiquetasMarcadas.join(' y ')}` : 'opciones'}, de la más barata a la más cara.
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{filtro.visibles.slice(0, mostrar).map(fila)}</ul>
              {filtro.visibles.length > mostrar && (
                <button type="button" onClick={() => setMostrar((n) => n + PAGINA)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, marginTop: 6 }}>
                  Ver {Math.min(PAGINA, filtro.visibles.length - mostrar)} más
                </button>
              )}

              {marcadas.length > 0 && filtro.sinDato.length > 0 && (
                <div style={{ marginTop: 10, borderLeft: '3px solid var(--warning)', paddingLeft: 10 }}>
                  <button type="button" onClick={() => setVerSinDato((v) => !v)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }} aria-expanded={verSinDato}>
                    {filtro.sinDato.length} no dice{filtro.sinDato.length === 1 ? '' : 'n'} si incluye{filtro.sinDato.length === 1 ? '' : 'n'} {etiquetasMarcadas.join(' y ')}
                    {' '}— {verSinDato ? 'ocultar lista' : 'ver'}
                  </button>
                  {/* Montaje perezoso: la lista solo existe en el DOM si se abre. */}
                  {verSinDato && <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{filtro.sinDato.slice(0, PAGINA).map(fila)}</ul>}
                  {verSinDato && filtro.sinDato.length > PAGINA && (
                    <p className="muted" style={{ fontSize: 12 }}>Y {filtro.sinDato.length - PAGINA} más: afina el filtro para verlas.</p>
                  )}
                </div>
              )}
              {marcadas.length > 0 && filtro.descartadas > 0 && (
                <p className="muted" style={{ fontSize: 13 }}>
                  {filtro.descartadas} no la{marcadas.length === 1 ? '' : 's'} incluye{filtro.descartadas === 1 ? '' : 'n'} (lo dice la propia compañía).
                </p>
              )}
              <p className="muted" style={{ fontSize: 12 }}>
                El filtro es para ti: al cliente se le prepara todo lo que no ocultes, y él filtra en su presupuesto.
              </p>
            </>
          )}
        </>
      )}

      {cotizacionPreparar !== null && (
        <PrepararPresupuesto
          tarificacionId={cotizacionPreparar}
          simulado={simulado}
          ocultar={ocultar}
          bloqueado={bloqueado}
          onPreparado={() => setPreparado(true)}
        />
      )}
    </section>
  )
}

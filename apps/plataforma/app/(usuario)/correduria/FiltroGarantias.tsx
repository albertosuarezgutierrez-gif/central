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
import { Check, RefreshCw } from 'lucide-react'

import { btnStyle } from '@/components/ui'
import { CeldaCompania } from './CeldaCompania'
import { eur } from '@/lib/dinero'
import { filtrarPorGarantias, interruptoresGarantias, ramoDeCatalogo } from '@central/module-seguros'
import {
  claveCompania,
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
  // Se ELIGE lo que se manda (Alberto, 28/09/2026: «seleccionar las que quiero, no quitar las que no»).
  // Por dentro se sigue mandando `ocultar` = todo lo NO elegido: asegura no cambia.
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set())
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
  const ocultas = useMemo(
    () => ({ companias: new Set<string>(), precios: new Set(opciones.filter((o) => !elegidas.has(o.id)).map((o) => o.id)) }),
    [opciones, elegidas],
  )

  const ocultar = guardada ? ocultarParaPreparar(opciones, ocultas) : undefined
  const nElegidas = opciones.filter((o) => elegidas.has(o.id) && o.primaEur !== null).length
  const bloqueado = guardada && opciones.length > 0 && !quedaAlgunaVisible(opciones, ocultas)
    ? 'Marca al menos una opción para mandársela al cliente.'
    : null
  const etiquetasMarcadas = interruptores.filter((i) => marcadas.includes(i.clave)).map((i) => i.etiqueta.toLowerCase())

  function alternar<T>(s: ReadonlySet<T>, v: T): Set<T> {
    const n = new Set(s)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }

  const fila = (o: OpcionParrilla) => {
    const marcada = elegidas.has(o.id)
    const sinPrima = o.primaEur === null
    return (
      <li key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          role="checkbox"
          aria-checked={marcada}
          disabled={preparado || sinPrima}
          onClick={() => setElegidas((s) => alternar(s, o.id))}
          title={sinPrima ? 'Sin prima: no se puede mandar' : marcada ? 'Quitar del presupuesto' : 'Mandar esta opción'}
          style={{
            display: 'flex', gap: 10, alignItems: 'center', width: '100%', minHeight: 56, padding: '10px 4px',
            background: marcada ? 'var(--primary-light)' : 'transparent', border: 0, textAlign: 'left',
            color: 'inherit', font: 'inherit', cursor: preparado || sinPrima ? 'default' : 'pointer', minWidth: 0,
          }}
        >
          <span
            aria-hidden
            style={{
              flex: '0 0 24px', height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${marcada ? 'var(--primary)' : 'var(--border)'}`, background: marcada ? 'var(--primary)' : 'var(--surface)', color: '#fff',
            }}
          >
            {marcada && <Check size={16} strokeWidth={3} />}
          </span>
          <span style={{ flex: '0 0 72px', minWidth: 0 }}>
            <CeldaCompania compania={o.compania} producto={o.producto} />
          </span>
          <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, lineHeight: 1.3 }}>
            <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{o.categoria ?? <span style={{ color: 'var(--muted)' }}>cobertura sin declarar</span>}</span>
            <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>
              {o.franquiciaEur === null ? 'franquicia no declarada' : o.franquiciaEur === 0 ? 'sin franquicia' : `franquicia ${eur(o.franquiciaEur)}`}
              {ramoCat === 'decesos' && (
                o.capitalServicioEur !== null ? <> · capital {eur(o.capitalServicioEur)}</> : <> · capital no consta</>
              )}
            </span>
          </span>
          <span style={{ flex: '0 0 auto', textAlign: 'right' }}>
            <strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{sinPrima ? '—' : eur(o.primaEur as number)}</strong>
            {o.firmeza !== 'firme' && <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{o.firmeza}</span>}
          </span>
        </button>
      </li>
    )
  }

  // Atajos de selección: sobre lo que se VE (con el filtro de garantías aplicado).
  const conPrima = (xs: readonly OpcionParrilla[]) => xs.filter((o) => o.primaEur !== null)
  const baratas = (xs: readonly OpcionParrilla[]) => [...conPrima(xs)].sort((a, b) => (a.primaEur as number) - (b.primaEur as number))
  const atajos: { rotulo: string; ids: () => string[] }[] = [
    { rotulo: 'Las 3 más baratas', ids: () => baratas(filtro.visibles).slice(0, 3).map((o) => o.id) },
    {
      rotulo: 'La más barata de cada compañía',
      ids: () => {
        const vistas = new Set<string>()
        return baratas(filtro.visibles).filter((o) => {
          const k = claveCompania(o.compania)
          if (vistas.has(k)) return false
          vistas.add(k)
          return true
        }).map((o) => o.id)
      },
    },
    { rotulo: 'Todas las que se ven', ids: () => conPrima(filtro.visibles).map((o) => o.id) },
  ]

  return (
    <section style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12, minWidth: 0 }}>
      <p style={{ margin: '0 0 4px' }}>
        <strong>Qué verá el cliente</strong>
      </p>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Marca las opciones que le quieres mandar. Leer esto es gratis: no vuelve a cotizar.
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
            <p className="err" style={{ fontSize: 12 }}>
              {sinId} precio{sinId === 1 ? '' : 's'} llega{sinId === 1 ? '' : 'n'} sin identificador: no se puede{sinId === 1 ? '' : 'n'} marcar ni quitar, y
              {sinId === 1 ? ' irá' : ' irán'} en el presupuesto aunque no lo{sinId === 1 ? '' : 's'} marques.
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

          {opciones.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0' }}>Marcar rápido:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {atajos.map((x) => (
                  <button key={x.rotulo} type="button" disabled={preparado} onClick={() => setElegidas(new Set(x.ids()))} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                    {x.rotulo}
                  </button>
                ))}
                {elegidas.size > 0 && (
                  <button type="button" disabled={preparado} onClick={() => setElegidas(new Set())} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
                    Ninguna
                  </button>
                )}
              </div>
            </div>
          )}

          {opciones.length > 0 && (
            <>
              <p style={{ fontSize: 13, margin: '8px 0 0' }}>
                <strong>{filtro.visibles.length}</strong> {marcadas.length ? `incluyen ${etiquetasMarcadas.join(' y ')}` : 'opciones'}, de la más barata a la más cara ·{' '}
                <strong>{nElegidas}</strong> marcada{nElegidas === 1 ? '' : 's'} para mandar.
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
                El filtro de garantías es solo para buscar: al cliente le llega lo que marques, y lo que quede marcado aunque el filtro lo esconda.
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
          enviadas={nElegidas}
          origen={origen}
          bloqueado={bloqueado}
          onPreparado={() => setPreparado(true)}
        />
      )}
    </section>
  )
}

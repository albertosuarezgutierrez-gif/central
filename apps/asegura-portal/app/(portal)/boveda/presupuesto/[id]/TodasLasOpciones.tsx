'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { filtrarPorGarantias, interruptoresGarantias, type RamoGarantias } from '@central/module-seguros'

import type { OpcionCliente } from '@/lib/presupuesto'
import { montarTabla } from '@/lib/tabla-coberturas'
import {
  ESPERA_ACTIVIDAD_MS,
  POR_PAGINA,
  alternarComparar,
  alternarGarantia,
  compararDeshabilitado,
  etiquetasDe,
  filaDeOpcion,
  garantiasDeActual,
  listaY,
  paginar,
  preseleccion,
  textoDescartadas,
  textoSinDato,
  textoVerMas,
} from '@/lib/todas-las-opciones'
import { AceptarOpcion } from './AceptarOpcion'
import { CompararIA } from './CompararIA'
import { LogoCompania } from './LogoCompania'
import { Plegable } from './RestoDeOpciones'

/**
 * «Todas las opciones»: la lista ENTERA de precios congelados (la portada incluida, marcada
 * «Recomendada»), con los interruptores de garantías, paginada de 10 en 10.
 *
 *  · Los interruptores salen PRESELECCIONADOS con lo que el cliente pidió (`necesidades`), y se dice.
 *  · Lo que no dice si incluye una garantía marcada NO desaparece: va aparte, plegado y en perezoso.
 *  · Elegir reusa `AceptarOpcion` con las MISMAS reglas que la portada (las decide la página).
 *  · Comparar dos → `CompararIA` con esas dos.
 *  · Telemetría (garantías marcadas + comparadas) con 3 s de espera, sin bloquear ni avisar de nada,
 *    y NUNCA desde la vista de corredor.
 *
 * 📱 Escritorio: interruptores a la izquierda y lista a la derecha. Móvil: chips que se envuelven
 * encima de la lista. Lo decide `globals.css` (`.todas-*`), no dos árboles.
 */
export function TodasLasOpciones({ presupuestoId, ramo, opciones, necesidades, coberturasActual, corredor, puedeAceptar, bloqueoDatos, telefono }: {
  presupuestoId: string
  ramo: RamoGarantias | null
  /** Las no ocultas (el filtro `ocultaAt: null` ya lo aplica `leerOpciones`). */
  opciones: OpcionCliente[]
  necesidades: string | null
  /** Coberturas de la póliza actual. `null` = no hay póliza o no se pudieron leer. */
  coberturasActual: string[] | null
  corredor: boolean
  /** Mismas condiciones que la portada: no caducado, no retirado, no aceptado y enviado. */
  puedeAceptar: boolean
  bloqueoDatos: string | null
  telefono: { tel: string; texto: string }
}) {
  const interruptores = useMemo(() => (ramo === null ? [] : interruptoresGarantias(ramo, opciones)), [ramo, opciones])
  const inicial = useMemo(() => preseleccion(ramo, necesidades, interruptores), [ramo, necesidades, interruptores])
  const [marcadas, setMarcadas] = useState<string[]>(inicial)
  const [cuantas, setCuantas] = useState(POR_PAGINA)
  const [comparadas, setComparadas] = useState<string[]>([])
  const [comparando, setComparando] = useState(false)
  const [eligiendo, setEligiendo] = useState<string | null>(null)

  const actual = useMemo(() => (ramo === null ? null : garantiasDeActual(ramo, coberturasActual)), [ramo, coberturasActual])
  const resultado = useMemo(() => filtrarPorGarantias(opciones, marcadas), [opciones, marcadas])
  const pagina = paginar(resultado.visibles, cuantas)
  const filtroActivo = marcadas.length > 0
  const etiquetas = etiquetasDe(ramo, marcadas)
  const porId = useMemo(() => new Map(opciones.map((o) => [o.id, o])), [opciones])

  // ── Telemetría: solo tras un cambio DEL CLIENTE, con 3 s de calma ──────────
  const tocado = useRef(false)
  useEffect(() => {
    if (corredor || !tocado.current) return
    const t = setTimeout(() => {
      fetch('/api/presupuesto/actividad', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presupuestoId, garantias: marcadas, comparadas }),
        keepalive: true,
      }).catch(() => {})
    }, ESPERA_ACTIVIDAD_MS)
    return () => clearTimeout(t)
  }, [corredor, presupuestoId, marcadas, comparadas])

  function cambiarGarantia(clave: string) {
    tocado.current = true
    setMarcadas((m) => alternarGarantia(m, clave, interruptores))
    setCuantas(POR_PAGINA)
  }
  function limpiar() {
    tocado.current = true
    setMarcadas([])
    setCuantas(POR_PAGINA)
  }
  function cambiarComparar(id: string) {
    tocado.current = true
    setComparadas((s) => alternarComparar(s, id))
    setComparando(false)
  }

  const pareja = comparadas.map((id) => porId.get(id)).filter((o): o is OpcionCliente => o !== undefined)
  const paraIA = pareja.map((o) => ({ id: o.id, compania: o.compania, producto: o.producto, primaEur: o.primaEur, franquiciaEur: o.franquiciaEur, coberturas: o.coberturasDetalle }))

  const fila = (o: OpcionCliente) => {
    const f = filaDeOpcion(o, { ramo, actual, todas: opciones })
    const marcada = comparadas.includes(o.id)
    const abierta = eligiendo === o.id
    return (
      <li key={o.id} className="todas-fila" data-recomendada={f.recomendada ? 'si' : undefined}>
        <div className="todas-fila-cabeza">
          <span className="todas-logo"><LogoCompania nombre={o.compania} alto={28} /></span>
          <div className="todas-fila-datos">
            {f.recomendada && <span className="chip acento todas-recomendada">Recomendada</span>}
            <strong className="todas-compania">{f.compania}</strong>
            <span className="todas-producto">{f.producto}</span>
          </div>
          <div className="todas-precio">
            <span className={f.sinPrecio ? 'pendiente' : 'todas-prima'}>{f.prima}</span>
            {f.firmeza !== null && <span className="todas-firmeza">{f.firmeza}</span>}
          </div>
        </div>
        <ul className="todas-detalles">
          <li>{f.franquicia}</li>
          {f.capital !== null && <li>{f.capital}</li>}
          {f.cambios !== null && <li>{f.cambios}</li>}
          {f.cambiosSinDato !== null && <li className="suave">{f.cambiosSinDato}</li>}
          {f.noIncluye !== null && <li>{f.noIncluye}</li>}
          {f.sinConfirmar !== null && <li className="suave">{f.sinConfirmar}</li>}
        </ul>
        <div className="todas-acciones">
          <label className="todas-comparar">
            <input
              type="checkbox"
              checked={marcada}
              disabled={compararDeshabilitado(comparadas, o.id)}
              onChange={() => cambiarComparar(o.id)}
            />
            Comparar
          </label>
          {puedeAceptar && o.primaEur !== null && (
            <button
              type="button"
              className={abierta ? 'boton-tenue' : 'boton'}
              aria-expanded={abierta}
              onClick={() => setEligiendo(abierta ? null : o.id)}
            >
              {abierta ? 'Cerrar' : 'Elegir esta'}
            </button>
          )}
        </div>
        {abierta && (
          <AceptarOpcion
            presupuestoId={presupuestoId}
            opcionId={o.id}
            prima={o.primaEur}
            compania={o.compania}
            corredor={corredor}
            bloqueoDatos={bloqueoDatos}
          />
        )}
      </li>
    )
  }

  const verMas = textoVerMas(pagina.quedan)
  const descartadas = filtroActivo ? textoDescartadas(resultado.descartadas, marcadas.length) : null

  return (
    <section className="seccion" aria-labelledby="todas-opciones-titulo">
      <h2 id="todas-opciones-titulo" style={{ marginTop: 0 }}>Todas las opciones ({opciones.length})</h2>

      <div className="todas-rejilla">
        {interruptores.length > 0 && (
          <div className="todas-filtros">
            <h3 className="todas-filtros-titulo">Qué quieres que incluya</h3>
            {inicial.length > 0 && <p className="suave todas-filtros-nota">Hemos marcado lo que nos pediste.</p>}
            <div className="todas-interruptores" role="group" aria-label="Garantías">
              {interruptores.map((i) => {
                const activo = marcadas.includes(i.clave)
                return (
                  <button
                    key={i.clave}
                    type="button"
                    className="todas-interruptor"
                    aria-pressed={activo}
                    onClick={() => cambiarGarantia(i.clave)}
                  >
                    {i.etiqueta} <span className="todas-cuenta">({i.conSi})</span>
                  </button>
                )
              })}
            </div>
            {filtroActivo && (
              <button type="button" className="todas-limpiar" onClick={limpiar}>Quitar filtros</button>
            )}
          </div>
        )}

        <div className="todas-lista-col">
          {filtroActivo && (
            <p className="suave" style={{ margin: '0 0 8px', fontSize: 14 }} role="status">
              {resultado.visibles.length === 1 ? '1 opción incluye' : `${resultado.visibles.length} opciones incluyen`} {listaY(etiquetas)}.
            </p>
          )}

          {comparadas.length === 2 && pareja.length === 2 && (
            comparando ? (
              <CompararIA
                key={comparadas.join('|')}
                presupuestoId={presupuestoId}
                opciones={paraIA}
                tabla={montarTabla(paraIA)}
                corredor={corredor}
                telefono={telefono}
                onCerrar={() => setComparando(false)}
              />
            ) : (
              <button type="button" className="boton" style={{ minHeight: 44, marginBottom: 12 }} onClick={() => setComparando(true)}>
                Comparar con IA: {pareja[0].compania} y {pareja[1].compania}
              </button>
            )
          )}
          {comparadas.length === 1 && (
            <p className="suave" style={{ margin: '0 0 8px', fontSize: 14 }}>Marca otra opción para compararlas con la IA.</p>
          )}

          {resultado.visibles.length === 0 ? (
            <p className="pendiente" style={{ margin: 0 }}>
              Ninguna opción dice incluir todo lo que has marcado. Quita alguna garantía o mira abajo las que no lo dicen.
            </p>
          ) : (
            <ul className="todas-lista">{pagina.mostradas.map(fila)}</ul>
          )}
          {verMas !== null && (
            <button type="button" className="boton-tenue todas-ver-mas" onClick={() => setCuantas(pagina.siguiente)}>
              {verMas}
            </button>
          )}

          {filtroActivo && resultado.sinDato.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Plegable titulo={textoSinDato(resultado.sinDato.length, etiquetas)}>
                <SinDato lista={resultado.sinDato} fila={fila} />
              </Plegable>
            </div>
          )}
          {descartadas !== null && (
            <p className="suave" style={{ margin: '10px 0 0', fontSize: 14 }}>{descartadas}</p>
          )}
        </div>
      </div>
    </section>
  )
}

/** Las que no dicen si incluyen lo marcado: también paginadas, dentro del plegable perezoso. */
function SinDato({ lista, fila }: { lista: OpcionCliente[]; fila: (o: OpcionCliente) => React.ReactNode }) {
  const [cuantas, setCuantas] = useState(POR_PAGINA)
  const p = paginar(lista, cuantas)
  const verMas = textoVerMas(p.quedan)
  return (
    <>
      <p className="suave" style={{ margin: '0 0 8px', fontSize: 13 }}>
        No es que no la incluyan: su lista de coberturas no lo dice. Pídeme su condicionado y lo miro.
      </p>
      <ul className="todas-lista">{p.mostradas.map(fila)}</ul>
      {verMas !== null && (
        <button type="button" className="boton-tenue todas-ver-mas" onClick={() => setCuantas(p.siguiente)}>{verMas}</button>
      )}
    </>
  )
}

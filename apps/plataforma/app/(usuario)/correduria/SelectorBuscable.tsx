'use client'

/**
 * Un `<select>` nativo del catálogo de Codeoscopic, con buscador.
 *
 * Las listas del catálogo son largas: ~100 marcas, decenas de modelos por marca
 * y decenas de versiones por modelo — algunas con el nombre IDÉNTICO («1.0 TGDI
 * TECNO 4X2» tres veces seguidas, que son tres códigos Base7 distintos). Sin
 * filtro eso es bajar a ojo por la lista y, al llegar, elegir a ciegas entre
 * filas gemelas.
 *
 * Sigue siendo un `<select>` nativo a propósito —teclado, móvil y accesibilidad
 * gratis—: lo que se añade encima es un filtro de texto. Tres detalles que no
 * son decoración:
 *
 *  1. La opción ya elegida NUNCA se filtra fuera (ver `filtrarOpciones`).
 *  2. El código se pinta SOLO junto a los nombres repetidos, para que dos filas
 *     gemelas se puedan distinguir.
 *  3. Por debajo de `MINIMO_PARA_BUSCAR` opciones no aparece: en una lista de
 *     cinco, un buscador es un trasto.
 *
 * Y la `pista` (la versión que traía otra póliza de la misma matrícula) entra
 * como TEXTO DEL BUSCADOR, nunca como selección: es texto histórico de otra
 * póliza, no un código del catálogo, y quién es la versión lo sigue decidiendo
 * el corredor.
 */

import { useMemo, useState } from 'react'
import {
  consultaSugerida,
  etiquetarOpciones,
  filtrarOpciones,
  type OpcionSimple,
} from '@/lib/filtrar-opciones'

/** Por debajo de esto la lista se recorre con la vista y el buscador solo estorba. */
const MINIMO_PARA_BUSCAR = 8

type Props = {
  id?: string
  valor: string
  onCambiar: (id: string) => void
  opciones: readonly OpcionSimple[]
  deshabilitado?: boolean
  /** Lo que dice la opción vacía: «Cargando…», «Elige marca»… */
  textoVacio: string
  /** Cómo se llama esto en singular y en plural, para los textos del buscador. */
  nombre: string
  plural: string
  /** Ejemplos concretos en el hueco del buscador; si no, uno genérico. */
  marcador?: string
  /** Texto de otra fuente con el que PREfiltrar (solo la versión lo usa). */
  pista?: string | null
  style?: React.CSSProperties
}

export function SelectorBuscable(props: Props) {
  const { opciones, pista = null } = props
  const etiquetadas = useMemo(() => etiquetarOpciones(opciones), [opciones])
  // 🚨 La pista solo prefiltra si el buscador SE VE. Sin él no hay caja que
  // enseñe el filtro ni botón para quitarlo: las opciones descartadas serían
  // inalcanzables y la pantalla no diría por qué. Y con menos de 8 no hace
  // ninguna falta: se leen de un vistazo.
  const sugerida = useMemo(
    () =>
      pista && opciones.length >= MINIMO_PARA_BUSCAR ? consultaSugerida(etiquetadas, pista) : '',
    [etiquetadas, opciones.length, pista],
  )

  // El `key` arranca el filtro de cero cada vez que cambia el catálogo (otra
  // marca, otro combustible): un texto viejo sobre una lista nueva dejaría el
  // desplegable en blanco teniendo opciones. Se hace remontando y no con un
  // efecto que llame a `setState`, que es una ronda de renders de más.
  const clave = `${sugerida}#${etiquetadas.map((v) => v.id).join(',')}`
  return <Cuerpo key={clave} {...props} etiquetadas={etiquetadas} sugerida={sugerida} />
}

function Cuerpo({
  id,
  valor,
  onCambiar,
  opciones,
  deshabilitado = false,
  textoVacio,
  nombre,
  plural,
  marcador,
  style,
  etiquetadas,
  sugerida,
}: Props & { etiquetadas: (OpcionSimple & { etiqueta: string })[]; sugerida: string }) {
  const [consulta, setConsulta] = useState(sugerida)
  const [tocado, setTocado] = useState(false)

  const visibles = useMemo(
    () => filtrarOpciones(etiquetadas, consulta, valor),
    [etiquetadas, consulta, valor],
  )

  const hayBuscador = opciones.length >= MINIMO_PARA_BUSCAR
  const filtrando = consulta.trim() !== ''
  const desdePista = filtrando && !tocado && sugerida !== '' && consulta === sugerida

  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      {hayBuscador && (
        <input
          type="search"
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value)
            setTocado(true)
          }}
          disabled={deshabilitado}
          placeholder={marcador ?? `Buscar ${nombre}…`}
          aria-label={`Buscar ${nombre} en el catálogo`}
          style={{ minHeight: 44, width: '100%', ...style }}
        />
      )}

      <select
        id={id}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        disabled={deshabilitado}
        style={{ minHeight: 44, ...style }}
      >
        <option value="">{textoVacio}</option>
        {visibles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.etiqueta}
          </option>
        ))}
      </select>

      {hayBuscador && filtrando && (
        <p style={{ fontSize: 12, margin: 0, color: 'var(--muted)' }}>
          {visibles.length === 0 ? (
            <>
              Ninguna coincidencia con «{consulta.trim()}» entre {opciones.length} {plural}.
            </>
          ) : (
            <>
              {visibles.length} de {opciones.length} {plural}
              {desdePista && <> — filtro puesto por la pista de otra póliza, no es una selección</>}.
            </>
          )}{' '}
          {/*
            Es la ÚNICA salida del filtro, así que va a los 44 px táctiles de la
            regla responsive. Y con estilos propios: `.ghost` solo existe dentro
            del `<style>` acotado de `.retarificar`, así que en los embudos de
            auto y moto el botón saldría sin estilar.
          */}
          <button
            type="button"
            onClick={() => {
              setConsulta('')
              setTocado(true)
            }}
            style={{
              minHeight: 44,
              padding: '4px 12px',
              fontSize: 12,
              background: 'transparent',
              color: 'inherit',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Quitar filtro
          </button>
        </p>
      )}
    </div>
  )
}

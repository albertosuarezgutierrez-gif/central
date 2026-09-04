'use client'

/**
 * La escalera del Catastro para los seguros de inmueble (hogar, comercio,
 * comunidades). Cuatro peldaños, del más cómodo al más costoso, y se BAJA solo
 * cuando el anterior no ha podido:
 *
 *   1. La persona escribe su dirección → se consulta el Catastro.
 *   2. Si no aparece, se le ofrece que la busquemos por ella: variantes
 *      deterministas primero y, solo si ninguna resuelve, una IA que PROPONE
 *      escrituras alternativas — cada una reconsultada al Catastro.
 *   3. Si aun así no sale, puede pegar su referencia catastral.
 *   4. Y en el último caso, rellena los campos a mano: están siempre debajo,
 *      no hay que pedir permiso para llegar a ellos.
 *
 * 🚨 NINGÚN DATO ENTRA SOLO. Todo lo que devuelve el Catastro se ENSEÑA con su
 * contexto (dirección, uso, localidad) y solo se copia al formulario cuando la
 * persona pulsa «Usar estos datos». Es el mismo criterio que la fecha estimada
 * desde la matrícula, y por la misma razón: el Catastro puede estar
 * desactualizado —o ser el piso de al lado— y quien firma la póliza es ella.
 * Meterle 76 m² de OTRA vivienda no da error, no se ve, y en un siniestro se
 * paga como infraseguro: cobra menos de lo que creía.
 *
 * 🚨 Y LOS ESTADOS DE FALLO NO SE COLAPSAN. «El Catastro no responde» ≠ «ahí no
 * hay nada» ≠ «no entendemos la dirección» ≠ «esa calle es ambigua» ≠ «hay
 * quince pisos y no sabemos cuál es el tuyo» ≠ «la IA no está disponible».
 * Cada uno lleva a un peldaño DISTINTO, y juntarlos en un «no se ha encontrado»
 * manda a la persona a teclearlo todo a mano cuando bastaba con reintentar.
 */

import { useId, useState } from 'react'
import type { OpcionInmueble, RespuestaCatastro, SinDatoHogar, SugerenciaHogar } from '@/lib/catastro'

/** Lo que este bloque sabe copiar al formulario, con su etiqueta para el resumen. */
const ETIQUETA: Record<keyof SugerenciaHogar, string> = {
  metrosCuadrados: 'Metros cuadrados',
  anioConstruccion: 'Año de construcción',
  codigoPostal: 'Código postal',
}

/** Por qué NO hay un dato. Se dice: un hueco callado parece un dato que no existe. */
const MOTIVO: Record<SinDatoHogar['motivo'], string> = {
  no_publicado: 'el Catastro no lo publica para este inmueble',
  fuera_de_rango: 'el valor que da no nos cuadra y preferimos no ponerlo',
  campo_desconocido: 'no tenemos dónde guardarlo (avísanos si lo ves)',
}

type Candidato = { direccion: string; origen: 'determinista' | 'ia'; resultado: RespuestaCatastro }

type Fase =
  | { f: 'inicio' }
  | { f: 'consultando' }
  | { f: 'buscando' }
  | { f: 'resultado'; r: Extract<RespuestaCatastro, { estado: 'ok' }>; de: string | null }
  | { f: 'elegir'; r: Extract<RespuestaCatastro, { estado: 'elegir' }> }
  | { f: 'candidatos'; lista: Candidato[]; iaConsultada: boolean; incompleta: boolean }
  | { f: 'aviso'; clave: ClaveAviso; sugerible: boolean }

type ClaveAviso =
  | 'no_encontrado'
  | 'via_ambigua'
  | 'direccion_ilegible'
  | 'referencia_invalida'
  | 'referencia_de_finca'
  | 'catastro_no_responde'
  | 'sin_candidatos'
  | 'ia_no_disponible'
  | 'sin_red'

const AVISO: Record<ClaveAviso, string> = {
  no_encontrado: 'El Catastro no encuentra nada en esa dirección.',
  via_ambigua: 'Hay varias calles con ese nombre en el municipio. Prueba a escribirla más completa.',
  direccion_ilegible: 'No hemos sabido separar la calle del número. Prueba «Calle Mayor 12».',
  referencia_invalida: 'Esa referencia no tiene la forma de una referencia catastral.',
  referencia_de_finca:
    'Esa es la referencia de la FINCA (el edificio o la parcela), no la de tu vivienda. La de tu piso tiene 20 caracteres.',
  catastro_no_responde:
    'El Catastro no responde ahora mismo. No es que tu inmueble no esté: vuelve a intentarlo en un rato.',
  sin_candidatos: 'Hemos probado varias formas de escribirla y el Catastro no ha confirmado ninguna.',
  ia_no_disponible:
    'La ayuda para buscar la dirección no está disponible ahora mismo. No es que no exista tu inmueble.',
  sin_red: 'No hemos podido conectar. Vuelve a intentarlo.',
}

export type DatosAceptados = {
  /** Campos del catálogo del ramo, ya en texto de formulario. */
  valores: Record<string, string>
  /** La de 20 caracteres, del inmueble. */
  referencia: string
}

export function BuscarInmueble({
  idPrefix,
  disabled,
  referenciaActual,
  aceptar,
}: {
  idPrefix: string
  disabled: boolean
  referenciaActual?: string
  /**
   * 🚨 OPCIONAL, Y ES UNA SALVAGUARDA. Una pantalla que todavía no sabe guardar
   * la referencia catastral ni los campos del ramo no puede ofrecerse a
   * buscarlos: el resultado sería una consulta cuyo «Usar estos datos» no lleva
   * a ninguna parte. Sin esto, el bloque no se pinta.
   */
  aceptar?: (d: DatosAceptados) => void
}) {
  const base = useId()
  const [direccion, setDireccion] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [provincia, setProvincia] = useState('')
  const [referencia, setReferencia] = useState('')
  const [porReferencia, setPorReferencia] = useState(false)
  const [fase, setFase] = useState<Fase>({ f: 'inicio' })

  if (!aceptar) return null

  const ocupado = disabled || fase.f === 'consultando' || fase.f === 'buscando'
  const id = (s: string) => `${s}-${idPrefix}-${base}`

  async function pedir(url: string, cuerpo: unknown): Promise<{ ok: true; datos: unknown } | { ok: false }> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      return { ok: true, datos: await res.json() }
    } catch {
      return { ok: false }
    }
  }

  /** Una respuesta de `/api/catastro` → la fase que le corresponde. */
  function encajar(datos: unknown, de: string | null): Fase {
    const r = datos as RespuestaCatastro & { error?: string }
    if (r?.estado === 'ok') return { f: 'resultado', r, de }
    if (r?.estado === 'elegir') return { f: 'elegir', r }
    if (r?.estado === 'no_encontrado') return { f: 'aviso', clave: 'no_encontrado', sugerible: true }
    if (r?.estado === 'via_ambigua') return { f: 'aviso', clave: 'via_ambigua', sugerible: true }
    if (r?.estado === 'direccion_ilegible') return { f: 'aviso', clave: 'direccion_ilegible', sugerible: true }
    if (r?.estado === 'referencia_invalida') return { f: 'aviso', clave: 'referencia_invalida', sugerible: false }
    if (r?.estado === 'catastro_no_responde')
      return { f: 'aviso', clave: 'catastro_no_responde', sugerible: false }
    return { f: 'aviso', clave: 'sin_red', sugerible: false }
  }

  async function consultarDireccion() {
    setFase({ f: 'consultando' })
    const r = await pedir('/api/catastro', { direccion, municipio, provincia })
    setFase(r.ok ? encajar(r.datos, null) : { f: 'aviso', clave: 'sin_red', sugerible: false })
  }

  async function consultarReferencia(valor: string, de: string | null) {
    // Los 14 caracteres son la FINCA, no la vivienda: se distingue AQUÍ para
    // poder decírselo, en vez de un «no es válida» que no ayuda a corregir.
    const compacta = valor.toUpperCase().replace(/[\s.\-/]/g, '')
    if (compacta.length === 14) {
      setFase({ f: 'aviso', clave: 'referencia_de_finca', sugerible: false })
      return
    }
    setFase({ f: 'consultando' })
    const r = await pedir('/api/catastro', { referencia: compacta })
    setFase(r.ok ? encajar(r.datos, de) : { f: 'aviso', clave: 'sin_red', sugerible: false })
  }

  async function pedirAyuda() {
    setFase({ f: 'buscando' })
    const r = await pedir('/api/catastro/sugerir', { direccion, municipio, provincia })
    if (!r.ok) return setFase({ f: 'aviso', clave: 'sin_red', sugerible: false })
    const d = r.datos as {
      estado?: string
      candidatos?: Candidato[]
      iaConsultada?: boolean
      busquedaIncompleta?: boolean
    }
    if (d?.estado === 'candidatos' && d.candidatos?.length) {
      setFase({
        f: 'candidatos',
        lista: d.candidatos,
        iaConsultada: d.iaConsultada === true,
        incompleta: d.busquedaIncompleta === true,
      })
      return
    }
    const clave: ClaveAviso =
      d?.estado === 'ia_no_disponible'
        ? 'ia_no_disponible'
        : d?.estado === 'catastro_no_responde'
          ? 'catastro_no_responde'
          : d?.estado === 'direccion_ilegible'
            ? 'direccion_ilegible'
            : 'sin_candidatos'
    setFase({ f: 'aviso', clave, sugerible: false })
  }

  function usar(r: Extract<RespuestaCatastro, { estado: 'ok' }>) {
    const valores: Record<string, string> = {}
    for (const k of Object.keys(ETIQUETA) as (keyof SugerenciaHogar)[]) {
      const v = r.sugerencia[k]
      if (v !== null) valores[k] = String(v)
    }
    aceptar?.({ valores, referencia: r.referencia })
    setFase({ f: 'inicio' })
    setPorReferencia(false)
  }

  return (
    <div className="catastro" aria-label="Buscar el inmueble en el Catastro">
      <p className="editor-ayuda">
        Si nos dices dónde está, el Catastro nos da los metros, el año y el código postal. Lo verás antes de
        que entre nada: <strong>no rellenamos nada por tu cuenta</strong>. También puedes saltarte esto y
        escribirlo tú abajo.
      </p>

      {referenciaActual && (
        <p className="editor-ayuda">
          Referencia catastral guardada: <strong>{referenciaActual}</strong>
        </p>
      )}

      {!porReferencia ? (
        <>
          <div className="editor-campo">
            <label htmlFor={id('dir')}>Dirección del inmueble</label>
            <input
              id={id('dir')}
              className="campo"
              value={direccion}
              disabled={ocupado}
              placeholder="Calle Mayor 12, 3º B"
              onChange={(e) => setDireccion(e.target.value)}
            />
          </div>
          <div className="editor-campo">
            <label htmlFor={id('mun')}>Municipio</label>
            <input
              id={id('mun')}
              className="campo"
              value={municipio}
              disabled={ocupado}
              onChange={(e) => setMunicipio(e.target.value)}
            />
          </div>
          <div className="editor-campo">
            <label htmlFor={id('prov')}>Provincia</label>
            <input
              id={id('prov')}
              className="campo"
              value={provincia}
              disabled={ocupado}
              onChange={(e) => setProvincia(e.target.value)}
            />
          </div>
          <div className="editor-acciones">
            <button
              type="button"
              className="boton"
              disabled={ocupado || direccion.trim().length < 3 || municipio.trim().length < 2 || provincia.trim().length < 2}
              onClick={consultarDireccion}
            >
              {fase.f === 'consultando' ? 'Consultando el Catastro…' : 'Buscar en el Catastro'}
            </button>
            <button type="button" className="boton secundario" disabled={ocupado} onClick={() => setPorReferencia(true)}>
              Tengo la referencia catastral
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="editor-campo">
            <label htmlFor={id('ref')}>Referencia catastral</label>
            <p className="editor-ayuda" id={id('ref-ayuda')}>
              20 caracteres. Está en el recibo del IBI y en la escritura. La de 14 es la del edificio entero, no
              la de tu vivienda.
            </p>
            <input
              id={id('ref')}
              className="campo"
              value={referencia}
              disabled={ocupado}
              aria-describedby={id('ref-ayuda')}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
          <div className="editor-acciones">
            <button
              type="button"
              className="boton"
              disabled={ocupado || referencia.trim().length < 14}
              onClick={() => consultarReferencia(referencia, null)}
            >
              {fase.f === 'consultando' ? 'Consultando el Catastro…' : 'Consultar esta referencia'}
            </button>
            <button type="button" className="boton secundario" disabled={ocupado} onClick={() => setPorReferencia(false)}>
              Volver a la dirección
            </button>
          </div>
        </>
      )}

      {fase.f === 'buscando' && <p className="editor-ayuda">Probando otras formas de escribir la dirección…</p>}

      {fase.f === 'aviso' && (
        <div className="aviso-linea">
          <p>{AVISO[fase.clave]}</p>
          {fase.sugerible && (
            <button type="button" className="boton" disabled={ocupado} onClick={pedirAyuda}>
              Búscala por mí
            </button>
          )}
          {!fase.sugerible && fase.clave !== 'referencia_invalida' && fase.clave !== 'referencia_de_finca' && (
            <button type="button" className="boton secundario" disabled={ocupado} onClick={() => setPorReferencia(true)}>
              Prefiero poner la referencia catastral
            </button>
          )}
        </div>
      )}

      {fase.f === 'elegir' && (
        <div className="aviso-linea">
          <p>
            {fase.r.interiorNoCaso
              ? `Hemos encontrado ${fase.r.via}, pero el piso y la puerta que has puesto no casan con el Catastro: esta es la lista del portal ENTERO. Elige el tuyo.`
              : `Hay varios inmuebles en ${fase.r.via}. Elige el tuyo.`}
          </p>
          <ul className="catastro-lista">
            {fase.r.inmuebles.map((i: OpcionInmueble) => (
              <li key={i.referencia}>
                <button
                  type="button"
                  className="boton secundario"
                  disabled={ocupado}
                  onClick={() => consultarReferencia(i.referencia, i.etiqueta)}
                >
                  {i.etiqueta}
                  {i.codigoPostal ? ` · ${i.codigoPostal}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fase.f === 'candidatos' && (
        <div className="aviso-linea">
          <p>
            Estas direcciones sí existen en el Catastro. <strong>Elige la tuya</strong> — no sabemos cuál es, solo
            que las escribimos distinto.
          </p>
          {fase.incompleta && (
            <p>
              ⚠️ El Catastro dejó de responder a mitad, así que la lista puede estar incompleta: si no ves la tuya,
              vuelve a intentarlo antes de darla por perdida.
            </p>
          )}
          <ul className="catastro-lista">
            {fase.lista.map((c) => (
              <li key={c.direccion}>
                <button
                  type="button"
                  className="boton secundario"
                  disabled={ocupado}
                  onClick={() => setFase(encajar(c.resultado, c.direccion))}
                >
                  {c.direccion}
                </button>
                <span className="chip">{c.origen === 'ia' ? 'propuesta por IA' : 'reescrita por nosotros'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fase.f === 'resultado' && (
        <div className="editor-destacado">
          <p>
            {fase.de ? `${fase.de} — ` : ''}
            {fase.r.contexto.direccion ?? 'Inmueble encontrado'}
            {fase.r.contexto.localidad ? `, ${fase.r.contexto.localidad}` : ''}
            {fase.r.contexto.uso ? ` · uso ${fase.r.contexto.uso}` : ''}
          </p>
          <dl className="datos-leidos">
            {(Object.keys(ETIQUETA) as (keyof SugerenciaHogar)[]).map((k) => (
              <div key={k}>
                <dt>{ETIQUETA[k]}</dt>
                <dd>{fase.r.sugerencia[k] ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {fase.r.sinDato.length > 0 && (
            <p className="editor-ayuda">
              Falta: {fase.r.sinDato.map((s) => `${ETIQUETA[s.campo as keyof SugerenciaHogar] ?? s.campo} (${MOTIVO[s.motivo]})`).join('; ')}.
              Puedes ponerlo tú abajo.
            </p>
          )}
          {fase.r.supuestos.length > 0 && (
            <p className="editor-ayuda">Ojo, damos por supuesto: {fase.r.supuestos.join('; ')}.</p>
          )}
          {fase.r.avisos.map((a) => (
            <p className="aviso-linea" key={a}>
              {a}
            </p>
          ))}
          <div className="editor-acciones">
            <button type="button" className="boton" disabled={disabled} onClick={() => usar(fase.r)}>
              Usar estos datos
            </button>
            <button type="button" className="boton secundario" disabled={disabled} onClick={() => setFase({ f: 'inicio' })}>
              No es mi inmueble
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

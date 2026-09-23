'use client'

// La ficha de HOGAR de una póliza YA EXISTENTE (retarificar), DENTRO de
// `/correduria` — mismo modelo que `.../cliente/[id]/hogar-nuevo/Formulario.tsx`
// (hogar sin póliza): la ficha se LEE, no se rellena; cada fila dice de dónde
// sale su valor y el corredor solo toca lo que esté mal.
//
// El recálculo al corregir un campo va al SERVIDOR (`pedirPrecalificacionHogar`,
// gratis) por el mismo motivo que su hermana: `apps/plataforma` no importa las
// funciones puras de asegura (dos apps, se hablan por el puerto HTTP y por
// nada más), así que recalcular aquí sin ellas duplicaría `resumen-hogar.ts`
// con riesgo de divergir.
//
// El botón de pedir precio SÍ reutiliza `pedirCotizacion` de `./acciones.ts`
// — la misma acción que usa el auto de esta pantalla: el puerto de asegura
// (`POST /api/operador/codeoscopic/retarificar`) ya rama por ramo con la
// MISMA función `prepararRetarificacion()`, así que no hace falta una acción
// de cotizar propia para hogar.

import { useState } from 'react'
import { eur } from '@/lib/dinero'
import type {
  Fila,
  Opcion,
  PrecalificacionHogar,
  Precio,
  Reparo,
  Supuesto,
} from '@/lib/hogar-retarificar-asegura'
import { pedirCotizacion } from './acciones'
import { pedirLimitesHogar, pedirPrecalificacionHogar } from './acciones-hogar'
import type { RangoCapital, RespuestaLimitesHogar } from '@/lib/retarificar-asegura'

type Grupo = 'donde' | 'como' | 'protecciones' | 'capitales' | 'tomador' | 'cotizacion'

const GRUPOS: { id: Grupo; titulo: string; nota?: string }[] = [
  { id: 'donde', titulo: 'Dónde está', nota: 'La compañía exige la calle entera, no solo el código postal.' },
  { id: 'como', titulo: 'Cómo es' },
  { id: 'protecciones', titulo: 'Protecciones', nota: 'Cada una que tengas baja el precio. Lo que no sepamos va como «no».' },
  { id: 'capitales', titulo: 'Qué se asegura' },
  { id: 'tomador', titulo: 'El tomador', nota: 'Nada de aquí se supone: o está en la ficha o falta.' },
  { id: 'cotizacion', titulo: 'La cotización' },
]

/** Campo de la fila → clave del cuerpo `resueltos`. Solo dos difieren de nombre
 *  (`estadoCivil`→`estadoCivilId`); el resto de catálogo comparte nombre. */
const CAMPO_A_RESUELTO: Record<string, string> = {
  municipioId: 'municipioId',
  estadoCivil: 'estadoCivilId',
  tipoViaId: 'tipoViaId',
  propietarioEsTomador: 'propietarioEsTomador',
  tipoVivienda: 'tipoVivienda',
  uso: 'uso',
  ocupacion: 'ocupacion',
  ubicacion: 'ubicacion',
  material: 'material',
  calidad: 'calidad',
  alarma: 'alarma',
  puertasSecundarias: 'puertasSecundarias',
  asentamiento: 'asentamiento',
}
/** Los nueve campos de catálogo cuya «letra pequeña» viaja como supuesto. */
const CAMPOS_CATALOGO_9 = [
  'tipoVivienda', 'uso', 'ocupacion', 'ubicacion', 'material', 'calidad', 'alarma', 'puertasSecundarias', 'asentamiento',
]

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
      supuestos: Supuesto[]
    }
  | { estado: 'faltan'; faltan: Reparo[] }
  | { estado: 'error'; mensaje: string; tope?: boolean; gastoDesconocido: boolean }

function euroODash(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : eur(n)
}

export default function RetarificadorHogar({
  polizaId,
  preInicial,
}: {
  polizaId: string
  preInicial: PrecalificacionHogar
}) {
  const [pre, setPre] = useState(preInicial)
  const [resueltos, setResueltos] = useState<Record<string, unknown>>({})
  const [correcciones, setCorrecciones] = useState<Record<string, unknown>>({})
  const [recalculando, setRecalculando] = useState(false)
  const [errorRecalculo, setErrorRecalculo] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [resultado, setResultado] = useState<Resultado>({ estado: 'idle' })

  async function recalcular(nuevosResueltos: Record<string, unknown>, nuevasCorrecciones: Record<string, unknown>) {
    setRecalculando(true)
    try {
      const r = await pedirPrecalificacionHogar({ polizaId, resueltos: nuevosResueltos, correcciones: nuevasCorrecciones })
      if (r.estado === 'ok') {
        setPre(r.pre)
        setErrorRecalculo(null)
      } else {
        // 🚨 El valor SÍ ha quedado guardado en `resueltos`/`correcciones` y viajará al
        // pedir precio, aunque la ficha en pantalla no se haya podido refrescar con él.
        // Callar aquí dejaría creer que la corrección no se guardó.
        setErrorRecalculo(
          `No se ha podido recalcular la ficha con ese cambio: ${r.mensaje} El valor SÍ ha quedado guardado ` +
            'y viajará al pedir precio — corrígelo o inténtalo de nuevo antes de pulsar «Pedir precio».',
        )
      }
    } finally {
      setRecalculando(false)
    }
  }

  function abrir(f: Fila) {
    setEditando(f.campo)
    setBorrador(aTexto(f))
  }

  function guardar(f: Fila) {
    const valor = deTexto(f, borrador)
    const claveResuelto = CAMPO_A_RESUELTO[f.campo]
    if (claveResuelto) {
      const nuevos = { ...resueltos, [claveResuelto]: valor }
      setResueltos(nuevos)
      setEditando(null)
      void recalcular(nuevos, correcciones)
    } else {
      const nuevas = { ...correcciones, [f.campo]: valor }
      setCorrecciones(nuevas)
      setEditando(null)
      void recalcular(resueltos, nuevas)
    }
  }

  function deshacer(f: Fila) {
    const claveResuelto = CAMPO_A_RESUELTO[f.campo]
    setEditando(null)
    if (claveResuelto) {
      const { [claveResuelto]: _fuera, ...resto } = resueltos
      void _fuera
      setResueltos(resto)
      void recalcular(resto, correcciones)
    } else {
      const { [f.campo]: _fuera, ...resto } = correcciones
      void _fuera
      setCorrecciones(resto)
      void recalcular(resueltos, resto)
    }
  }

  /**
   * Envía el valor EFECTIVO de cada campo (el de `pre.resumen.filas`, que ya viene recalculado
   * en el servidor tras cada corrección), no solo los que el corredor ha tocado. Mandar únicamente
   * `resueltos` (el acumulador de ediciones manuales) dejaba fuera los valores por defecto de los
   * campos sin tocar — inofensivo en la mayoría (el vendor pide el resto y sale un 422 "faltan
   * datos"), pero `propietarioEsTomador` tiene un default del SERVIDOR en `true`: si el corredor
   * corrige otro campo y pulsa «Pedir precio» sin haber tocado ese, la petición se queda sin la
   * clave y el vendor podría tarificar con el propietario equivocado sin avisar de nada (hallazgo
   * de `agente-architect`, 17/09/2026).
   */
  function cuerpoResueltosFinal(): Record<string, unknown> {
    const porCampo = new Map(pre.resumen.filas.map((f) => [f.campo, f]))
    const supuestos: Record<string, boolean> = {}
    const ids: Record<string, string | null> = {}
    for (const campo of CAMPOS_CATALOGO_9) {
      ids[campo] = cadena(porCampo.get(campo)?.valor)
      supuestos[campo] = !(campo in resueltos) && porCampo.get(campo)?.procedencia === 'supuesto'
    }
    supuestos.tipoVia = !('tipoViaId' in resueltos) && porCampo.get('tipoViaId')?.procedencia === 'supuesto'
    return {
      municipioId: entero(porCampo.get('municipioId')?.valor),
      estadoCivilId: cadena(porCampo.get('estadoCivil')?.valor) ?? '',
      tipoViaId: cadena(porCampo.get('tipoViaId')?.valor),
      ...ids,
      propietarioEsTomador: porCampo.get('propietarioEsTomador')?.valor === true,
      supuestos,
    }
  }

  async function cotizar() {
    setResultado({ estado: 'cotizando' })
    let r: Awaited<ReturnType<typeof pedirCotizacion>>
    try {
      r = await pedirCotizacion({ polizaId, resueltos: cuerpoResueltosFinal(), correcciones })
    } catch (e) {
      // Se cortó entre el navegador y plataforma: la cotización pudo llegar a Codeoscopic.
      setResultado({ estado: 'error', mensaje: e instanceof Error ? e.message : String(e), gastoDesconocido: true })
      return
    }
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
          supuestos: r.supuestos,
        })
        return
      default: {
        const _exhaustivo: never = r
        return _exhaustivo
      }
    }
  }

  const cotizando = resultado.estado === 'cotizando'
  const consumoPermite = pre.consumo.estado === 'ok' ? pre.consumo.veredicto.permitido : pre.consumo.estado === 'no_disponible'
  const puedePulsar =
    pre.ramo.estado === 'disponible' &&
    pre.fallosCatalogo.length === 0 &&
    pre.resumen.listo &&
    !cotizando &&
    !recalculando &&
    consumoPermite

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {pre.primaActual !== null && (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Lo que paga hoy
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 800, color: 'var(--brand)' }}>
            {eur(pre.primaActual)} <span style={{ fontSize: 13, fontWeight: 500 }} className="muted">al año</span>
          </p>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
            Cada precio que llegue se compara con esta cifra.
          </p>
        </div>
      )}

      {errorRecalculo && <div className="card err">{errorRecalculo}</div>}

      {pre.fallosCatalogo.length > 0 && (
        <div className="card err">
          No se han podido leer estos catálogos: {pre.fallosCatalogo.join(', ')}. Todos son obligatorios para el
          vendor, así que no se puede cotizar todavía. No es un problema de la ficha.
        </div>
      )}

      {pre.resumen.faltan.length > 0 && (
        <div className="card">
          <h2 style={{ color: 'var(--danger)' }}>Falta esto para poder pedir precio</h2>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {pre.resumen.faltan.map((f) => (
              <li key={f.campo} style={{ marginBottom: 6 }}>
                <strong>{f.etiqueta}</strong>: {f.falta}{' '}
                <a href={`#fila-${f.campo}`} onClick={() => abrir(f)}>
                  corregir ↓
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {GRUPOS.map((g) => {
        const filas = pre.resumen.filas.filter((f) => f.grupo === g.id)
        if (filas.length === 0) return null
        return (
          <div className="card" key={g.id}>
            <h2>{g.titulo}</h2>
            {g.nota && (
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {g.nota}
              </p>
            )}
            <div style={{ marginTop: 8 }}>
              {filas.map((f) => (
                <FilaFicha
                  key={f.campo}
                  fila={f}
                  editando={editando === f.campo}
                  borrador={borrador}
                  setBorrador={setBorrador}
                  abrir={() => abrir(f)}
                  cerrar={() => setEditando(null)}
                  guardar={() => guardar(f)}
                  deshacer={() => deshacer(f)}
                  pre={pre}
                />
              ))}
            </div>
            {g.id === 'capitales' && (
              <RecomendarCapital
                // Solo cuando lo ÚNICO que falta es el capital: con otro hueco el
                // vendor contestaría 400 y el botón prometería algo que no llega.
                bloqueo={
                  pre.ramo.estado !== 'disponible'
                    ? 'hogar no tarifica para esta organización (o no se ha podido comprobar).'
                    : pre.fallosCatalogo.length > 0
                      ? `no se han podido leer los catálogos: ${pre.fallosCatalogo.join(', ')}.`
                      : recalculando
                        ? 'recalculando…'
                        : pre.resumen.faltan.some((f) => !CAMPOS_CAPITAL.has(f.campo))
                          ? `antes falta: ${pre.resumen.faltan
                              .filter((f) => !CAMPOS_CAPITAL.has(f.campo))
                              .map((f) => f.etiqueta)
                              .join(', ')}.`
                          : null
                }
                pedir={() => pedirLimitesHogar({ polizaId, resueltos: cuerpoResueltosFinal(), correcciones })}
                usar={(capitales) => {
                  const nuevas = { ...correcciones, ...capitales }
                  setCorrecciones(nuevas)
                  void recalcular(resueltos, nuevas)
                }}
              />
            )}
          </div>
        )
      })}

      <div className="card">
        <h2>Pedir precio</h2>
        {pre.ramo.estado !== 'disponible' && (
          <p className="err">
            {pre.ramo.estado === 'ausente'
              ? `Hogar NO está entre los ramos que Codeoscopic tarifica para esta organización (hay: ${pre.ramo.ramos.join(', ')}). Hay que pedírselo a Codeoscopic; hasta entonces el botón no hace nada.`
              : 'No se ha podido comprobar si hogar tarifica para esta organización (la lista de ramos no llegó). No se cotiza a ciegas.'}
          </p>
        )}
        {pre.consumo.estado === 'error' ? (
          <p className="err">{pre.consumo.error}</p>
        ) : pre.consumo.estado === 'no_disponible' ? (
          <p className="muted">
            No se ha podido leer el contador de gasto. {pre.consumo.porque} El tope lo sigue aplicando asegura: si
            estuviera alcanzado, la respuesta lo dirá y no se cobrará nada.
          </p>
        ) : (
          <p className={pre.consumo.veredicto.permitido ? 'muted' : 'err'}>
            Gastado este mes: <strong>{pre.consumo.gastadoMes}</strong>
            {pre.consumo.veredicto.permitido ? (
              <> · quedan hoy <strong>{pre.consumo.veredicto.restantesHoy}</strong> cotizaciones.</>
            ) : (
              <> — {pre.consumo.veredicto.explicacion}</>
            )}
          </p>
        )}
        {pre.resumen.optimistas.length > 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            ⚠️ {pre.resumen.optimistas.length} de los supuestos ABARATAN el precio (
            {pre.resumen.optimistas.map((f) => f.etiqueta.toLowerCase()).join(', ')}): si el cliente los desmiente,
            la prima real sube.
          </p>
        )}

        <button
          type="button"
          className="primary"
          onClick={() => void cotizar()}
          disabled={!puedePulsar}
          style={{ minHeight: 44, width: '100%', maxWidth: 420 }}
        >
          {cotizando ? 'Cotizando… (puede tardar hasta 2 min)' : 'Pedir precio (0,50€)'}
        </button>
        {!pre.resumen.listo && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            El botón se enciende cuando no falte nada arriba. Corregir la ficha no cuesta nada.
          </p>
        )}

        {resultado.estado === 'faltan' && (
          <div style={{ marginTop: 12 }}>
            <p className="badge ok">No se ha gastado nada</p>
            <ul>
              {resultado.faltan.map((f) => (
                <li key={f.campo}>
                  <strong>{f.campo}</strong>: {f.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {resultado.estado === 'error' && (
          <p className="err" style={{ marginTop: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {resultado.tope ? '🛑 Tope alcanzado: ' : '⚠️ '}
            {resultado.mensaje}
            {resultado.gastoDesconocido && (
              <>
                {' '}
                <strong>No se sabe si esto se ha cobrado.</strong> Comprueba el consumo antes de volver a pulsar.
              </>
            )}
          </p>
        )}

        {resultado.estado === 'ok' && <Precios r={resultado} primaActual={pre.primaActual} />}
      </div>
    </div>
  )
}

// ─── Capitales recomendados por Codeoscopic ──────────────────────────────────

const CAMPOS_CAPITAL = new Set(['capitalContinente', 'capitalContenido'])

/**
 * `POST /home/recommend-limits`. Es una RECOMENDACIÓN: se enseña con su horquilla
 * y el corredor decide si la usa — nunca se escribe sola en la ficha. El coste no
 * está confirmado por Codeoscopic, y el botón lo dice.
 */
function RecomendarCapital({
  bloqueo,
  pedir,
  usar,
}: {
  /** `null` = se puede pedir; si no, POR QUÉ no (se enseña tal cual). */
  bloqueo: string | null
  pedir: () => Promise<RespuestaLimitesHogar>
  usar: (capitales: Partial<Record<'capitalContinente' | 'capitalContenido', number>>) => void
}) {
  const [estado, setEstado] = useState<RespuestaLimitesHogar | 'pidiendo' | null>(null)
  const pidiendo = estado === 'pidiendo'
  const habilitado = bloqueo === null
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <button
        type="button"
        onClick={async () => {
          setEstado('pidiendo')
          try {
            setEstado(await pedir())
          } catch (e) {
            // Se cortó entre el navegador y plataforma: la llamada pudo llegar a Codeoscopic.
            setEstado({ estado: 'error', mensaje: e instanceof Error ? e.message : String(e), gastoDesconocido: true })
          }
        }}
        disabled={!habilitado || pidiendo}
        style={{ minHeight: 44 }}
      >
        {pidiendo ? 'Pidiendo recomendación… (puede tardar más de 1 min)' : 'Recomendar capitales (Codeoscopic)'}
      </button>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
        {habilitado
          ? 'Codeoscopic calcula continente y contenido para esta vivienda. No está confirmado que sea gratis: cuenta en el consumo.'
          : `Apagado: ${bloqueo}`}
      </p>
      {estado !== null && estado !== 'pidiendo' && estado.estado === 'ok' && (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <RangoFila titulo="Continente" rango={estado.continente} usar={(v) => usar({ capitalContinente: v })} />
          <RangoFila titulo="Contenido" rango={estado.contenido} usar={(v) => usar({ capitalContenido: v })} />
          {estado.continente?.media != null && estado.contenido?.media != null && (
            <button
              type="button"
              className="primary"
              onClick={() =>
                usar({ capitalContinente: estado.continente!.media!, capitalContenido: estado.contenido!.media! })
              }
              style={{ minHeight: 44, justifySelf: 'start' }}
            >
              Usar los dos recomendados
            </button>
          )}
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Se aplica a esta cotización, no se guarda en la póliza. Si el cliente prefiere otra cifra, cámbiala en su
            fila de arriba.
          </p>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {estado.coste}
            {estado.restantesHoy !== null ? ` · quedan hoy ${estado.restantesHoy}` : ''}
          </p>
        </div>
      )}
      {estado !== null && estado !== 'pidiendo' && estado.estado === 'faltan' && (
        <div style={{ marginTop: 8 }}>
          <p className="badge ok">No se ha gastado nada</p>
          <ul>
            {estado.faltan.map((f) => (
              <li key={f.campo}>
                <strong>{f.campo}</strong>: {f.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {estado !== null && estado !== 'pidiendo' && (estado.estado === 'error' || estado.estado === 'tope' || estado.estado === 'sin_configurar') && (
        <p className="err" style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {estado.estado === 'tope' ? '🛑 Tope alcanzado: ' : '⚠️ '}
          {estado.mensaje}
          {estado.estado === 'error' && estado.gastoDesconocido && (
            <>
              {' '}
              <strong>No se sabe si esto ha costado.</strong>
            </>
          )}
        </p>
      )}
    </div>
  )
}

function RangoFila({ titulo, rango, usar }: { titulo: string; rango: RangoCapital | null; usar: (v: number) => void }) {
  if (rango === null) {
    return (
      <p style={{ margin: 0 }}>
        <strong>{titulo}</strong>: <span className="muted">Codeoscopic no ha recomendado ninguno</span>
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <span>
        <strong>{titulo}</strong>: {rango.media !== null ? eur(rango.media) : '—'}
        <span className="muted" style={{ fontSize: 12 }}>
          {' '}
          (de {rango.minimo !== null ? eur(rango.minimo) : '—'} a {rango.maximo !== null ? eur(rango.maximo) : '—'})
        </span>
      </span>
      {[rango.minimo, rango.media, rango.maximo]
        .filter((v, i, a): v is number => v !== null && a.indexOf(v) === i)
        .map((v) => (
          <button key={v} type="button" onClick={() => usar(v)} style={{ minHeight: 44 }}>
            Usar {eur(v)}
          </button>
        ))}
    </div>
  )
}

// ─── Una fila de la ficha ────────────────────────────────────────────────────

function FilaFicha({
  fila,
  editando,
  borrador,
  setBorrador,
  abrir,
  cerrar,
  guardar,
  deshacer,
  pre,
}: {
  fila: Fila
  editando: boolean
  borrador: string
  setBorrador: (v: string) => void
  abrir: () => void
  cerrar: () => void
  guardar: () => void
  deshacer: () => void
  pre: PrecalificacionHogar
}) {
  const sePuedeTocar = fila.editable || fila.falta !== null

  return (
    <div
      id={`fila-${fila.campo}`}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border)' }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
          {fila.etiqueta}
        </div>
        {!editando && (
          <>
            <div style={{ fontSize: 14, wordBreak: 'break-word' }}>
              {fila.falta !== null && fila.legible === '—' ? <span className="muted">—</span> : fila.legible}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
              {fila.procedencia && (
                <span className={`badge ${fila.procedencia === 'corregido' ? 'ok' : ''}`} style={{ fontSize: 11 }}>
                  {PROCEDENCIAS[fila.procedencia] ?? fila.procedencia}
                </span>
              )}
              {fila.optimista && (
                <span className="badge warn" style={{ fontSize: 11 }}>
                  esto puede subir
                </span>
              )}
              {fila.falta !== null && (
                <span className="badge danger" style={{ fontSize: 11 }}>
                  falta: {fila.falta}
                </span>
              )}
            </div>
            {fila.porque && (
              <details style={{ marginTop: 4 }}>
                <summary className="muted" style={{ fontSize: 12, cursor: 'pointer', minHeight: 24 }}>
                  por qué
                </summary>
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  {fila.porque}
                </p>
              </details>
            )}
          </>
        )}

        {editando && (
          <div style={{ marginTop: 4 }}>
            <ControlCampo fila={fila} borrador={borrador} setBorrador={setBorrador} pre={pre} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <button type="button" className="primary" onClick={guardar} style={{ minHeight: 44 }}>
                Guardar
              </button>
              <button type="button" className="ghost" onClick={cerrar} style={{ minHeight: 44 }}>
                Cancelar
              </button>
              {fila.procedencia === 'corregido' && (
                <button type="button" className="ghost" onClick={deshacer} style={{ minHeight: 44 }}>
                  Volver al valor de la ficha
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!editando && sePuedeTocar && (
        <button
          type="button"
          className="ghost"
          onClick={abrir}
          aria-label={`Corregir ${fila.etiqueta}`}
          title={`Corregir ${fila.etiqueta}`}
          style={{ minWidth: 44, minHeight: 44, flex: '0 0 auto' }}
        >
          ✏️
        </button>
      )}
    </div>
  )
}

const PROCEDENCIAS: Record<string, string> = {
  poliza: 'de la póliza',
  volcado: 'del volcado de 2026',
  catastro: 'del Catastro',
  ficha: 'de la ficha del cliente',
  supuesto: 'supuesto',
  corregido: 'lo has puesto tú',
}

function ControlCampo({
  fila,
  borrador,
  setBorrador,
  pre,
}: {
  fila: Fila
  borrador: string
  setBorrador: (v: string) => void
  pre: PrecalificacionHogar
}) {
  const alto: React.CSSProperties = { minHeight: 44 }

  if (fila.control === 'siNo') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 14 }}>
        <input type="checkbox" checked={borrador === 'si'} onChange={(e) => setBorrador(e.target.checked ? 'si' : 'no')} style={{ width: 20, height: 20 }} />
        Sí
      </label>
    )
  }
  if (fila.control === 'siNoNoSe') {
    return (
      <select value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto}>
        <option value="">No se sabe (no viaja)</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    )
  }
  if (fila.control === 'municipio') {
    return (
      <>
        <select value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto}>
          <option value="">{pre.municipios.length === 0 ? 'Sin código postal utilizable' : 'Elige municipio'}</option>
          {pre.municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        {pre.municipios.length > 1 && (
          <span className="muted" style={{ fontSize: 12 }}>
            Este CP tiene {pre.municipios.length} municipios: decide tú.
          </span>
        )}
      </>
    )
  }
  if (fila.control === 'opcion' || fila.campo === 'tipoViaId') {
    const esVia = fila.campo === 'tipoViaId'
    const lista: Opcion[] = esVia ? pre.vias : fila.campo === 'estadoCivil' ? pre.estadosCiviles : (fila.catalogo ? pre.catalogos[fila.catalogo] : undefined) ?? []
    const porDefecto = esVia ? pre.defectos['road-types'] : fila.catalogo ? pre.defectos[fila.catalogo] : null
    return (
      <select value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} disabled={lista.length === 0}>
        <option value="">{lista.length === 0 ? 'Catálogo no disponible' : 'Elige'}</option>
        {lista.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
            {o.id === porDefecto ? ' (el de la pantalla)' : ''}
          </option>
        ))}
      </select>
    )
  }
  if (fila.control === 'fecha') {
    return <input type="date" value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} />
  }
  if (fila.control === 'numero' || fila.control === 'euros') {
    return <input type="number" min={0} inputMode="decimal" value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} />
  }
  return <input value={borrador} onChange={(e) => setBorrador(e.target.value)} style={alto} />
}

// ─── Conversión entre el valor de la fila y el control ───────────────────────

function aTexto(f: Fila): string {
  if (f.control === 'siNo') return f.valor === true ? 'si' : 'no'
  if (f.control === 'siNoNoSe') return typeof f.valor === 'boolean' ? (f.valor ? 'si' : 'no') : ''
  if (f.valor === null || f.valor === undefined) return ''
  return String(f.valor)
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function entero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function deTexto(f: Fila, t: string): unknown {
  switch (f.control) {
    case 'siNo':
      return t === 'si'
    case 'siNoNoSe':
      return t === '' ? null : t === 'si'
    case 'numero':
    case 'euros':
    case 'municipio': {
      const n = Number(t.trim())
      return t.trim() === '' || !Number.isFinite(n) ? null : n
    }
    default:
      return t.trim() === '' ? null : t.trim()
  }
}

// ─── El resultado ────────────────────────────────────────────────────────────

/**
 * El precio nuevo frente al que paga hoy. Sin prima actual NO se inventa una
 * comparación: se dice que no consta, que es distinto de «no hay diferencia».
 */
function Diferencia({ primaActual, nueva }: { primaActual: number | null; nueva: number | null }) {
  if (primaActual === null) return <span className="muted">no consta lo que paga hoy</span>
  if (nueva === null || Number.isNaN(nueva)) return <span className="muted">—</span>
  const delta = nueva - primaActual
  if (Math.abs(delta) < 0.005) return <span className="muted">igual</span>
  const sube = delta > 0
  return (
    <span style={{ color: sube ? 'var(--danger)' : 'var(--ok)', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {sube ? '▲ sube' : '▼ ahorra'} {eur(Math.abs(delta))}
    </span>
  )
}

function Precios({ r, primaActual }: { r: Extract<Resultado, { estado: 'ok' }>; primaActual: number | null }) {
  return (
    <div style={{ marginTop: 12 }}>
      {r.simulado && (
        <div className="card" style={{ borderColor: 'var(--warn)', background: 'rgba(217, 119, 6, 0.08)', marginBottom: 12 }}>
          <p style={{ margin: 0, fontWeight: 700, color: 'var(--warn)' }}>🧪 ESTO ES UNA SIMULACIÓN</p>
          <p style={{ margin: '4px 0 0' }}>
            {r.avisoSimulacion ?? 'Precio inventado por central para probar la pantalla: ninguna compañía lo ha dado y no se ha gastado ni un céntimo.'}
          </p>
        </div>
      )}
      <p>
        <strong>{r.resumen}</strong>
      </p>
      <p className="muted">
        Coste de esta consulta: {r.coste}
        {r.restantesHoy !== null && <> · quedan hoy {r.restantesHoy}</>}.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Compañía</th>
              <th>Producto</th>
              <th>Prima anual</th>
              <th>{primaActual === null ? 'Diferencia' : 'Frente a lo que paga hoy'}</th>
              <th>Firmeza</th>
            </tr>
          </thead>
          <tbody>
            {r.precios.map((p, i) => (
              <tr key={`${p.compania}-${p.producto}-${i}`}>
                <td>{p.compania ?? '—'}</td>
                <td>{p.producto ?? '—'}</td>
                <td>{euroODash(p.primaEur)}</td>
                <td>
                  <Diferencia primaActual={primaActual} nueva={p.primaEur ?? null} />
                </td>
                <td>
                  <span className={`badge ${p.firmeza === 'firme' ? 'ok' : 'warn'}`} title={p.avisos?.join(' · ')}>
                    {p.firmeza ?? 'sin determinar'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.supuestos.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 8 }}>
            Este precio sale con estos supuestos:
          </p>
          <ul>
            {r.supuestos.map((s) => (
              <li key={`${String(s.campo)}-${String(s.valor)}`}>
                <strong>{String(s.campo)}</strong>: <code>{s.oculto ? '(dato personal, se queda en asegura)' : String(s.valor)}</code> — {s.porque}
                {s.optimista && (
                  <>
                    {' '}
                    <span className="badge warn">puede abaratar el precio</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

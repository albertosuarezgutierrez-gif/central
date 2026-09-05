'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { etiquetaRol, type PersonaDePolizas, type PersonaFicha } from '@central/module-seguros'
import EditarCliente from '../../EditarCliente'
import Relaciones from '../../Relaciones'
import { btnStyle } from '@/components/ui'
import type { Ficha, IntervinienteFicha } from '@/lib/ficha-asegura'
import type { RelacionCartera } from '@/lib/relaciones-asegura'
import {
  interpretarQuitarInterviniente,
  textoMotivoInterviniente,
  type RespuestaQuitarInterviniente,
} from '@/lib/intervinientes-asegura'
import { Tarjeta, etiquetaPoliza } from './piezas'

/**
 * Con quién se habla de esta ficha: **una sola lista de personas** y los datos
 * de la propia ficha.
 *
 * 🚨 Hasta el 05/09/2026 eran DOS tarjetas —👤 quién sale en sus pólizas (lo que
 * dice CIMA) y 👪 los vínculos declarados (lo nuestro)— y la misma persona salía
 * en las dos sin que nada lo dijera: el conductor habitual arriba, el
 * administrador autorizado abajo, y cruzarlas era cosa del que miraba. La
 * pregunta que traen es una sola: «¿a quién llamo y con qué derecho?».
 *
 * La fusión la hace `unificarPersonas` (módulo puro, testeado) **por FICHA y
 * nunca por nombre**, y cada fila conserva sus dos caras por separado: fundir la
 * procedencia sería borrar de dónde sale cada dato, y solo el vínculo abre las
 * pólizas en el portal del cliente.
 *
 * El reparto de responsabilidades: `Relaciones` es el dueño de la lista y de
 * todo lo que se escribe en `cliente_relaciones`; lo que se puede hacer con los
 * PAPELES de una persona en las pólizas (quitarla de una) se le pasa como
 * `renderPapeles`, porque es otra API —`/api/correduria/intervinientes`— y su
 * estado vive aquí.
 *
 * Es un client component porque desde aquí se QUITA a una persona de una póliza
 * (03/09/2026). Todo lo que recibe son datos planos del puerto; la página que lo
 * monta sigue siendo server.
 */
export default function TabContactos({ ficha, personas }: {
  ficha: Ficha
  /** `null` = asegura no pudo leer quién interviene; NO es «no hay nadie». */
  personas: PersonaDePolizas[] | null
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [resultado, setResultado] = useState<RespuestaQuitarInterviniente | null>(null)

  const filas = ficha.intervinientes ?? []
  const idsPorEtiqueta = etiquetasDePolizas(ficha)

  async function quitar(fila: IntervinienteFicha, quien: string, dondePoliza: string) {
    if (fila.id === null) return
    if (!confirm(
      `¿Quitar a ${quien} de la póliza ${dondePoliza}? Deja de figurar ahí como ${etiquetaRol(fila.rol)}. ` +
      'El resto de sus pólizas no se tocan.',
    )) return
    setOcupado(fila.id)
    setResultado(null)
    try {
      const res = await fetch('/api/correduria/intervinientes', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intervinienteId: fila.id }),
      })
      const r = interpretarQuitarInterviniente(res.status, await res.json().catch(() => null))
      setResultado(r)
      // La lista la calcula la página con la ficha entera: se recarga en vez de
      // recomponerla aquí, que es lo que ya hacen las otras escrituras de la ficha.
      if (r.estado === 'ok') router.refresh()
    } catch {
      setResultado({ estado: 'error', motivo: 'red' })
    } finally {
      setOcupado(null)
    }
  }

  /** Lo que dice CIMA de una persona: un papel por póliza, con lo que se puede
   *  hacer con él. Va como render-prop dentro de la fila que pinta `Relaciones`. */
  function renderPapeles(p: PersonaFicha<RelacionCartera>) {
    const quien = p.nombre ?? 'esta persona'
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, fontSize: 13 }}>
        {papelesDe(p).map((papel, n) => (
          <Papel
            key={`${papel.rol}-${papel.etiqueta ?? ''}-${n}`}
            papel={papel}
            quien={quien}
            linea={lineaDe(p, papel.rol, papel.etiqueta, filas, idsPorEtiqueta)}
            ocupado={ocupado}
            onQuitar={quitar}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      {/* UNA lista: quién sale en sus pólizas y quién tiene vínculo declarado. */}
      <Tarjeta titulo="👥 Personas">
        <Relaciones
          clienteId={ficha.id}
          nombreFicha={ficha.nombre}
          inicial={ficha.relaciones}
          personas={personas}
          renderPapeles={renderPapeles}
          tipoPersona={tipoPersonaDe(ficha)}
        />
        {resultado && resultado.estado !== 'ok' && <Aviso r={resultado} />}
      </Tarjeta>

      {/* Editar: contactos (libres), dirección (libre) e identidad (solo con DNI recibido). */}
      <Tarjeta titulo="✏️ Datos del cliente">
        <EditarCliente
          clienteId={ficha.id}
          contactos={ficha.contactos}
          identidad={ficha.identidad}
          contacto={ficha.contacto}
          documentos={ficha.documentos}
        />
      </Tarjeta>
    </>
  )
}

/** Qué es la ficha, para ofrecer primero los vínculos de empresa en una sociedad.
 *  Solo se afirma con lo que asegura manda: `null` es «no se sabe», y adivinarlo
 *  por el nombre es justo lo que la regla de identidad prohíbe. */
function tipoPersonaDe(ficha: Ficha): 'fisica' | 'juridica' | null {
  const t = ficha.identidad?.tipoPersona
  return t === 'fisica' || t === 'juridica' ? t : null
}

/** Lo que `lineaDe` necesita saber de una persona: su identidad, nada más. */
type PersonaMinima = { fichaId: string | null; nombre: string | null }

/** Un papel («conductor ocasional del 1234ABC») con lo que se puede hacer con él. */
function Papel({ papel, quien, linea, ocupado, onQuitar }: {
  papel: { rol: string; etiqueta: string | null }
  quien: string
  linea: Coincidencia
  ocupado: string | null
  onQuitar: (fila: IntervinienteFicha, quien: string, dondePoliza: string) => void
}) {
  const texto = `${etiquetaRol(papel.rol)}${papel.etiqueta ? ` del ${papel.etiqueta}` : ''}`
  // En un `const`, el estrechamiento del union sobrevive dentro del `onClick`.
  const fila = linea.estado === 'unica' ? linea.fila : null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', overflowWrap: 'anywhere' }}>{texto}</span>

      {/* Una línea de CIMA no se ofrece para quitar: el puerto la rechaza con un
          409 porque el siguiente pull la recrearía. Se dice, en vez de pintar un
          botón que va a fallar. */}
      {fila?.origen === 'cima' && (
        <span
          style={{ fontSize: 11, color: 'var(--muted)' }}
          title="Esta línea la manda CIMA. Borrarla aquí no serviría: el siguiente pull la vuelve a crear. Para quitarla hay que corregirlo en la compañía."
        >
          · la manda CIMA
        </span>
      )}

      {fila !== null && fila.origen !== 'cima' && fila.id !== null && (
        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() => onQuitar(fila, quien, papel.etiqueta ?? 'esta póliza')}
          style={{ ...btnStyle('sutil'), fontSize: 12 }}
        >
          {ocupado === fila.id ? 'quitando…' : 'quitar'}
        </button>
      )}

      {/* Sin id no hay nada que mandar al puerto: se declara el hueco en vez de
          callarlo (asegura de una versión anterior). */}
      {fila !== null && fila.origen !== 'cima' && fila.id === null && (
        <span
          style={{ fontSize: 11, color: 'var(--muted)' }}
          title="La versión desplegada de asegura no manda el id de la línea, y sin él no se puede decir cuál quitar."
        >
          · no se puede quitar desde aquí
        </span>
      )}

      {linea.estado === 'ambigua' && (
        <span
          style={{ fontSize: 11, color: 'var(--muted)' }}
          title="Hay más de una línea que encaja con esta persona en esa póliza y no se puede distinguir cuál es. Quitar la que no es sería peor que no quitar ninguna."
        >
          · no se distingue cuál quitar
        </span>
      )}
    </div>
  )
}

function Aviso({ r }: { r: Exclude<RespuestaQuitarInterviniente, { estado: 'ok' }> }) {
  // El motivo del puerto se pinta TAL CUAL: el 409 de CIMA ya explica por qué no
  // se puede, y reescribirlo aquí sería inventar una razón distinta de la real.
  const texto =
    r.estado === 'invalido' ? `No se ha quitado: ${r.motivo}` :
    r.estado === 'no_encontrado' ? `Esa línea ya no está${r.motivo ? `: ${r.motivo}` : ''}.` :
    r.estado === 'sin_configurar' ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET).' :
    `No se ha podido quitar: ${textoMotivoInterviniente(r.motivo)}`
  const grave = r.estado === 'error' || r.estado === 'sin_configurar'
  return (
    <div
      role="alert"
      style={{
        border: `1px solid ${grave ? 'var(--negative)' : 'var(--border)'}`,
        color: grave ? 'var(--negative)' : 'var(--text)',
        borderRadius: 10, padding: '10px 12px', fontSize: 13,
      }}
    >
      {texto}
    </div>
  )
}

/**
 * Qué línea de `poliza_intervinientes` es un papel de la lista.
 *
 * `ninguna` NO es «no existe»: es «no se puede afirmar cuál es», y entonces no
 * se ofrece ningún botón. Es deliberadamente conservador — `personasDePolizas`
 * agrupa por NIF y aquí solo se ve la ficha y el nombre, así que ante la duda no
 * se ofrece quitar nada: borrar la línea equivocada mezcla los papeles de dos
 * personas distintas y no se ve (regla «agrupar por IDENTIDAD, nunca por la
 * etiqueta» del CLAUDE.md raíz).
 */
type Coincidencia =
  | { estado: 'unica'; fila: IntervinienteFicha }
  | { estado: 'ambigua' }
  | { estado: 'ninguna' }

function lineaDe(
  persona: PersonaMinima,
  rol: string,
  etiqueta: string | null,
  filas: IntervinienteFicha[],
  idsPorEtiqueta: Map<string, string[]>,
): Coincidencia {
  // Sin etiqueta no se sabe de qué póliza sale el papel; y una etiqueta que
  // apunta a dos pólizas (dos sin matrícula ni número, del mismo ramo y
  // compañía) tampoco distingue.
  if (etiqueta === null) return { estado: 'ninguna' }
  const ids = idsPorEtiqueta.get(etiqueta) ?? []
  if (ids.length === 0) return { estado: 'ninguna' }
  if (ids.length > 1) return { estado: 'ambigua' }
  const candidatas = filas.filter(f => !f.esTomador && f.polizaId === ids[0] && f.rol === rol && esLaMisma(f, persona))
  if (candidatas.length === 1) return { estado: 'unica', fila: candidatas[0] }
  return { estado: candidatas.length === 0 ? 'ninguna' : 'ambigua' }
}

/**
 * ¿Esta fila es de esta persona? Identificador primero (la ficha enlazada) y
 * solo se cae al nombre cuando NINGUNA de las dos lo tiene. Dos fichas distintas
 * no se funden jamás, coincida lo que coincida el nombre.
 */
function esLaMisma(fila: IntervinienteFicha, persona: PersonaMinima): boolean {
  if (fila.fichaId !== null || persona.fichaId !== null) return fila.fichaId !== null && fila.fichaId === persona.fichaId
  const a = normalizar(fila.nombre)
  const b = normalizar(persona.nombre)
  return a !== null && a === b
}

function normalizar(n: string | null): string | null {
  const s = n?.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()
  return s === undefined || s === '' ? null : s
}

/** Los papeles de una persona, uno por póliza (que es la unidad que se quita). */
function papelesDe(p: { papeles: { rol: string; polizas: string[] }[] }): { rol: string; etiqueta: string | null }[] {
  const out: { rol: string; etiqueta: string | null }[] = []
  for (const x of p.papeles) {
    // Sin etiqueta de póliza el papel se pinta igual («propietario»), pero no se
    // puede decir de cuál se quitaría: por eso viaja con `etiqueta: null`.
    if (x.polizas.length === 0) out.push({ rol: x.rol, etiqueta: null })
    else for (const et of x.polizas) out.push({ rol: x.rol, etiqueta: et })
  }
  return out
}

/** Etiqueta de póliza → sus ids. Es una lista porque dos pólizas pueden rotularse igual. */
function etiquetasDePolizas(ficha: Ficha): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const p of ficha.polizas) {
    const et = etiquetaPoliza(p)
    const ya = m.get(et)
    if (ya) ya.push(p.id)
    else m.set(et, [p.id])
  }
  return m
}


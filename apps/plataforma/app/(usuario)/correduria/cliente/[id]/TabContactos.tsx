'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SIN_VINCULO, etiquetaRol, type PersonaDePolizas } from '@central/module-seguros'
import EditarCliente from '../../EditarCliente'
import Relaciones from '../../Relaciones'
import AccionesContacto from '../../AccionesContacto'
import { btnStyle } from '@/components/ui'
import type { Ficha, IntervinienteFicha } from '@/lib/ficha-asegura'
import {
  interpretarQuitarInterviniente,
  textoMotivoInterviniente,
  type RespuestaQuitarInterviniente,
} from '@/lib/intervinientes-asegura'
import { Tarjeta, etiquetaPoliza } from './piezas'

/**
 * Con quién se habla de esta ficha: sus datos, quién sale en sus pólizas y qué
 * vínculos están declarados.
 *
 * Los tres bloques viven juntos a propósito: la pregunta que traen es la misma
 * («¿a quién llamo y con qué derecho?»), y separarlos obligaba a saltar de una
 * pestaña a otra para contestarla. Es también lo que permite que 👪 ofrezca
 * declarar el vínculo de quien sale en 👤 sin vínculo: las dos tarjetas comen
 * de la MISMA lista de personas, calculada una vez en la página.
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
  const sinVinculo = candidatasAVincular(personas)
  return (
    <>
      {/* Con quién se habla de verdad. «Relaciones» solo enseña lo declarado a
          mano y casi nadie lo tiene; esto es quién sale en SUS pólizas, que es
          lo que CIMA sí nos dice (Alberto, 02/09/2026). */}
      <Tarjeta titulo="👤 Personas en sus pólizas">
        <PersonasPolizas ficha={ficha} personas={personas} />
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

      {/* Quién es de quién y quién autoriza a quién a ver sus seguros. `null` = no se pudo leer, no «sin familia». */}
      <Tarjeta titulo="👪 Relaciones y autorizaciones">
        <Relaciones clienteId={ficha.id} nombreFicha={ficha.nombre} inicial={ficha.relaciones} sinVinculo={sinVinculo} />
      </Tarjeta>
    </>
  )
}


// Con quién se puede hablar de esta ficha, agrupado por PERSONA y no por
// póliza: GLOBAL 2 tiene tres furgonetas con tres conductores distintos y esa
// gente estaba enterrada póliza por póliza. Quién sale y cómo se agrupa lo
// decide `personasDePolizas`, testeado aparte.
function PersonasPolizas({ ficha, personas }: { ficha: Ficha; personas: PersonaDePolizas[] | null }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [resultado, setResultado] = useState<RespuestaQuitarInterviniente | null>(null)

  // Con `personas === null` no se pinta nada de esto, así que aquí la lista de
  // filas siempre existe; el `?? []` es solo para no cargar el tipo.
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

  // Tres estados, no dos: no es lo mismo «no se ha podido mirar» que «no hay nadie».
  if (personas === null) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>asegura no ha podido leer quién interviene en sus pólizas.</p>
  if (personas.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        {ficha.polizas.length === 0
          ? 'Todavía no tiene pólizas en la cartera.'
          : 'En sus pólizas no aparece nadie más que la propia ficha: la compañía no manda más intervinientes.'}
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, fontSize: 13 }}>
      {personas.map(p => (
        <div key={p.clave} style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {p.fichaId
              ? <Link href={`/correduria/cliente/${p.fichaId}`}>{p.nombre ?? (p.nombreIlegible ? '🔒 cifrado' : 'sin nombre')}</Link>
              : (p.nombre ?? (p.nombreIlegible ? '🔒 cifrado' : 'sin nombre'))}
          </span>
          {/* Llamar · WhatsApp · escribir a ESTA persona, no al tomador: son
              los conductores habituales, y es a ellos a quien hay que llamar.
              El icono de WhatsApp solo sale si el número es un móvil. */}
          {p.telefono && <> · <a href={`tel:${p.telefono.replace(/\s/g, '')}`}>📞 {p.telefono}</a></>}
          {' '}<AccionesContacto telefono={p.telefono} email={p.email} quien={p.nombre ?? 'esta persona'} />

          {/* Un papel por línea, cada uno con lo que se puede hacer con ÉL: lo
              que se quita es la fila de una póliza, no «a la persona». */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, marginTop: 2 }}>
            {papelesDe(p).map((papel, n) => (
              <Papel
                key={`${papel.rol}-${papel.etiqueta ?? ''}-${n}`}
                papel={papel}
                quien={p.nombre ?? 'esta persona'}
                linea={lineaDe(p, papel.rol, papel.etiqueta, filas, idsPorEtiqueta)}
                ocupado={ocupado}
                onQuitar={quitar}
              />
            ))}
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {p.relacionDeclarada
              ? (p.relacionDeclarada === SIN_VINCULO
                  ? '✅ revisado: no hay vínculo — sale en sus pólizas y no es nada suyo'
                  : `👪 ${p.relacionDeclarada}`)
              : p.fichaId
                ? 'sin vínculo declarado — abajo, en 👪 Relaciones y autorizaciones, hay un botón para anotarlo'
                : 'CIMA no la ha enlazado a una ficha propia: no se le puede declarar un vínculo todavía'}
          </div>
          {/* Dos filas con el mismo nombre no son un fallo de la pantalla: o son dos
              personas (padre e hijo con NIF distinto) o son dos fichas de la misma
              persona. Se dice cuál de las dos cosas es, y cuando no se sabe, se dice
              que no se sabe — nunca se funden dos identidades. */}
          {p.homonimia === 'distinta_persona' && (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              👥 Hay otra persona con este mismo nombre en sus pólizas, con NIF distinto: son dos, no una.
            </div>
          )}
          {p.homonimia === 'sin_distinguir' && (
            <div style={{ fontSize: 11, color: 'var(--warning)' }}>
              ⚠️ Aparece otra fila con este mismo nombre y no se puede distinguir (a alguna le falta el NIF):
              puede ser la misma persona con la ficha duplicada. No se funden desde aquí.
            </div>
          )}
        </div>
      ))}

      {resultado && resultado.estado !== 'ok' && <Aviso r={resultado} />}
    </div>
  )
}

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
  persona: PersonaDePolizas,
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
function esLaMisma(fila: IntervinienteFicha, persona: PersonaDePolizas): boolean {
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
function papelesDe(p: PersonaDePolizas): { rol: string; etiqueta: string | null }[] {
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

/**
 * Las personas de sus pólizas a las que SE PUEDE declarar un vínculo hoy:
 * tienen ficha propia y no tienen ninguno anotado. Sin ficha no hay a quién
 * vincular, y con vínculo ya no hace falta ofrecerlo.
 */
function candidatasAVincular(personas: PersonaDePolizas[] | null): { fichaId: string; nombre: string; papel: string; ojoDuplicada: boolean }[] {
  const out = new Map<string, { fichaId: string; nombre: string; papel: string; ojoDuplicada: boolean }>()
  for (const p of personas ?? []) {
    // Sin nombre legible no se puede ofrecer un botón que diga a quién vincula.
    if (p.fichaId === null || p.relacionDeclarada !== null || p.nombre === null) continue
    if (out.has(p.fichaId)) continue
    out.set(p.fichaId, {
      fichaId: p.fichaId,
      nombre: p.nombre,
      papel: p.papeles.map(x => etiquetaRol(x.rol)).join(' · '),
      // Otra fila se llama igual y no se puede distinguir: declarar el vínculo
      // aquí puede acabar en dos relaciones con la misma persona, una por ficha.
      ojoDuplicada: p.homonimia === 'sin_distinguir',
    })
  }
  return [...out.values()]
}

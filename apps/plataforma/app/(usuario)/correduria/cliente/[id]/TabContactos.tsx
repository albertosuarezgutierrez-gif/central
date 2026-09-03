import Link from 'next/link'
import { SIN_VINCULO, etiquetaRol, type PersonaDePolizas } from '@central/module-seguros'
import EditarCliente from '../../EditarCliente'
import Relaciones from '../../Relaciones'
import type { Ficha } from '@/lib/ficha-asegura'
import { Tarjeta } from './piezas'

/**
 * Con quién se habla de esta ficha: sus datos, quién sale en sus pólizas y qué
 * vínculos están declarados.
 *
 * Los tres bloques viven juntos a propósito: la pregunta que traen es la misma
 * («¿a quién llamo y con qué derecho?»), y separarlos obligaba a saltar de una
 * pestaña a otra para contestarla. Es también lo que permite que 👪 ofrezca
 * declarar el vínculo de quien sale en 👤 sin vínculo: las dos tarjetas comen
 * de la MISMA lista de personas, calculada una vez en la página.
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
    <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
      {personas.map(p => (
        <div key={p.clave}>
          <span style={{ fontWeight: 600 }}>
            {p.fichaId
              ? <Link href={`/correduria/cliente/${p.fichaId}`}>{p.nombre ?? (p.nombreIlegible ? '🔒 cifrado' : 'sin nombre')}</Link>
              : (p.nombre ?? (p.nombreIlegible ? '🔒 cifrado' : 'sin nombre'))}
          </span>
          <span style={{ color: 'var(--muted)' }}>
            {' · '}
            {p.papeles.map(x => `${etiquetaRol(x.rol)}${x.polizas.length ? ` del ${x.polizas.join(' y del ')}` : ''}`).join(' · ')}
          </span>
          {p.telefono && <> · <a href={`tel:${p.telefono.replace(/\s/g, '')}`}>📞 {p.telefono}</a></>}
          {p.email && <> · <a href={`mailto:${p.email}`}>✉️</a></>}
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
    </div>
  )
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

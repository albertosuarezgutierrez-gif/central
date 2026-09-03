import Link from 'next/link'
import { etiquetaRol, personasDePolizas } from '@central/module-seguros'
import EditarCliente from '../../EditarCliente'
import Relaciones from '../../Relaciones'
import type { Ficha } from '@/lib/ficha-asegura'
import { Tarjeta, etiquetaPoliza } from './piezas'

/**
 * Con quién se habla de esta ficha: sus datos, quién sale en sus pólizas y qué
 * vínculos están declarados.
 *
 * Los tres bloques viven juntos a propósito: la pregunta que traen es la misma
 * («¿a quién llamo y con qué derecho?»), y separarlos obligaba a saltar de una
 * pestaña a otra para contestarla.
 */
export default function TabContactos({ ficha }: { ficha: Ficha }) {
  return (
    <>
      {/* Con quién se habla de verdad. «Relaciones» solo enseña lo declarado a
          mano y casi nadie lo tiene; esto es quién sale en SUS pólizas, que es
          lo que CIMA sí nos dice (Alberto, 02/09/2026). */}
      <Tarjeta titulo="👤 Personas en sus pólizas">
        <PersonasPolizas ficha={ficha} />
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
        <Relaciones clienteId={ficha.id} nombreFicha={ficha.nombre} inicial={ficha.relaciones} />
      </Tarjeta>
    </>
  )
}


// Con quién se puede hablar de esta ficha, agrupado por PERSONA y no por
// póliza: GLOBAL 2 tiene tres furgonetas con tres conductores distintos y esa
// gente estaba enterrada póliza por póliza. Quién sale y cómo se agrupa lo
// decide `personasDePolizas`, testeado aparte.
function PersonasPolizas({ ficha }: { ficha: Ficha }) {
  const personas = personasDePolizas(
    ficha.intervinientes,
    ficha.polizas.map(p => ({ id: p.id, etiqueta: etiquetaPoliza(p) })),
    ficha.relaciones,
  )
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
              ? `👪 ${p.relacionDeclarada}`
              : p.fichaId
                ? 'sin vínculo declarado — se anota en 👪 Relaciones y autorizaciones'
                : 'CIMA no la ha enlazado a una ficha propia: no se le puede declarar un vínculo todavía'}
          </div>
        </div>
      ))}
    </div>
  )
}

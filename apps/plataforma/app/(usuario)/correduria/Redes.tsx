'use client'
import { useState } from 'react'
import { Megaphone, Copy, Check, ExternalLink } from 'lucide-react'
import Bloque from './Bloque'
import { Badge, btnStyle } from '@/components/ui'
import { BORRADORES, revisarBorrador, explicarRevision, MAX_LINKEDIN } from '@/lib/correduria/redes-borradores'

/**
 * Los borradores para LinkedIn, listos para copiar.
 *
 * ─── Por qué COPIAR y no publicar ──────────────────────────────────────────
 * Regla global de comunicaciones salientes: nada sale a un tercero sin que lo
 * mande Alberto. Aquí eso no es una limitación temporal a la espera de montar
 * la API — es el diseño. Cuando exista el adaptador de LinkedIn (el perfil
 * personal se puede publicar con `w_member_social`, que es self-serve), seguirá
 * publicando él pulsando un botón, y este bloque será donde lo pulse.
 *
 * ─── Por qué no hay «publicado» ni contador ────────────────────────────────
 * Sería el dato más útil de la pantalla y no se puede saber desde aquí: lo sabe
 * LinkedIn. Marcar a mano un «ya lo publiqué» crearía un registro que nadie
 * mantiene y que a la semana miente. Mejor no afirmar nada: la lista dice qué
 * hay escrito, no qué hay publicado, y lo dice en voz alta.
 */

const TEMA: Record<string, string> = {
  comunidades: 'Comunidades',
  comercio: 'Comercio y pyme',
  flota: 'Flota',
  hogar: 'Hogar',
  renovacion: 'Renovación',
  marca: 'Marca',
}

export default function Redes() {
  const [copiado, setCopiado] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(BORRADORES[0]?.id ?? null)

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000)
    } catch {
      // Sin permiso de portapapeles (o sin https) no se puede copiar. No se
      // dice «copiado» igualmente: eso mandaría a pegar un texto que no está.
      setCopiado(null)
      alert('El navegador no ha dejado copiar. Selecciona el texto y cópialo a mano.')
    }
  }

  return (
    <>
      <Bloque
        titulo="Borradores para LinkedIn"
        sub={`${BORRADORES.length} escritos. Ninguno se publica solo: se copian y los publicas tú. La lista dice qué hay ESCRITO, no qué hay publicado — eso solo lo sabe LinkedIn.`}
        Icono={Megaphone}
        primero
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {BORRADORES.map((b) => {
            const rev = revisarBorrador(b)
            const esta = abierto === b.id
            return (
              <div
                key={b.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 12,
                  background: 'var(--surface)',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <button
                      onClick={() => setAbierto(esta ? null : b.id)}
                      aria-expanded={esta}
                      style={{
                        background: 'none', border: 0, padding: 0, cursor: 'pointer',
                        font: 'inherit', fontWeight: 600, color: 'var(--text)', textAlign: 'left',
                      }}
                    >
                      {b.titulo}
                    </button>
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge tono="neutral">{TEMA[b.tema] ?? b.tema}</Badge>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {rev.largo} / {MAX_LINKEDIN} caracteres
                      </span>
                      {!rev.limpio && <Badge tono="negativo">revisar: {explicarRevision(rev)}</Badge>}
                    </div>
                  </div>
                  <button
                    onClick={() => copiar(b.id, b.texto)}
                    style={{ ...btnStyle('secundario'), minHeight: 44 }}
                  >
                    {copiado === b.id ? <Check size={15} /> : <Copy size={15} />}
                    <span style={{ marginLeft: 6 }}>{copiado === b.id ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                {esta && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
                      <strong>Para quién:</strong> {b.porQue}
                    </p>
                    {b.base && (
                      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
                        <strong>Norma citada:</strong> {b.base}
                      </p>
                    )}
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                        font: 'inherit', fontSize: 14, lineHeight: 1.55,
                        background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: 12,
                      }}
                    >
                      {b.texto}
                    </pre>
                    {b.enlace && (
                      <p style={{ fontSize: 12, margin: '8px 0 0' }}>
                        Enlace a añadir en el primer comentario:{' '}
                        <a href={b.enlace} target="_blank" rel="noreferrer">
                          {b.enlace} <ExternalLink size={12} style={{ verticalAlign: 'middle' }} />
                        </a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Bloque>

      {/* Lo que falta y solo puede hacer Alberto. Va escrito aquí y no en un
          documento porque es donde se va a leer: un pendiente que vive en un
          `.md` que nadie abre es un pendiente que no existe. */}
      <Bloque titulo="Lo que falta para que esto ruede" Icono={Megaphone}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          <li>
            <strong>Revisar el perfil de LinkedIn de Alberto</strong>: el titular y el «Acerca de». Es lo
            primero que lee quien llegue por un post, y desde aquí no se puede ver.
          </li>
          <li>
            <strong>Un post por semana, el mismo día.</strong> El riesgo de este plan no es la
            competencia: es el abandono. Seis borradores son seis semanas.
          </li>
          <li>
            <strong>El enlace, en el primer comentario</strong>, no en el cuerpo del post.
          </li>
          <li>
            <strong>Publicar desde el perfil personal, no desde una página de empresa.</strong> Además de
            ser lo que funciona en este nicho, es lo único automatizable sin aprobación de LinkedIn: el
            perfil se publica con permiso self-serve y la página de empresa exige entrar en su programa
            de partners.
          </li>
        </ul>
      </Bloque>
    </>
  )
}

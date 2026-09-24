'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { btnStyle } from '@/components/ui'
import { interpretarDescarte, textoMotivo, type ResultadoDescarte } from '@/lib/cliente-edicion-asegura'

/**
 * Quitar una ficha de la cartera — y devolverla.
 *
 * 🚨 **No borra nada.** Alberto pidió «poder eliminar» una ficha; lo que hace
 * esto es DESCARTARLA (`clientes.activo = false` en asegura): deja de salir en
 * el buscador, en la lista, en los contadores y en los avisos, pero la fila
 * sigue ahí con su historial, sus pólizas y sus documentos, y se puede
 * restaurar. Las tres razones están escritas en `apps/asegura/lib/cartera-edicion.ts`;
 * la más dura es que un borrado de verdad se lo comería la ingesta de CIMA, que
 * volvería a crear la ficha sin que nadie se enterara.
 *
 * Dos zonas, un solo componente (el estado y las llamadas son los mismos):
 *
 * - `zona="aviso"` — el cartel de ARRIBA. Solo se pinta si la ficha ya está
 *   descartada, y es el único sitio desde el que se restaura. Sin él, una ficha
 *   descartada se vería igual que cualquier otra y se trabajaría sobre ella sin
 *   saber que nadie más la ve.
 * - `zona="peligro"` — la zona de peligro del FINAL. Discreta a propósito:
 *   texto pequeño y un botón secundario en rojo, no un botón grande arriba.
 *
 * La confirmación va DELANTE y dentro del propio componente: hay que escribir
 * `DESCARTAR`. Un `confirm()` del navegador se acepta por reflejo, y esto quita
 * una ficha de la vista de todo el mundo.
 *
 * Y los tres estados de siempre: `activo === null` NO es «está activa», es «esta
 * versión de asegura no lo dice». En ese caso no se pinta ningún cartel (no se
 * afirma nada) y el botón sigue disponible: quien decide es el puerto.
 */
export default function DescartarCliente({
  clienteId,
  nombre,
  activo,
  polizasVivas,
  zona = 'peligro',
}: {
  clienteId: string
  nombre: string
  /** `false` = descartada · `true` = en la cartera · `null` = asegura no lo dice. */
  activo: boolean | null
  /**
   * Pólizas VIVAS que trae la ficha. Sirve para avisar ANTES de intentarlo;
   * quien decide de verdad es asegura, que lo vuelve a comprobar al escribir.
   */
  polizasVivas: number
  zona?: 'aviso' | 'peligro'
}) {
  const router = useRouter()
  const [paso, setPaso] = useState<'cerrado' | 'confirmando'>('cerrado')
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [r, setR] = useState<ResultadoDescarte | null>(null)

  const descartada = activo === false

  async function llamar(accion: 'descartar' | 'restaurar') {
    setEnviando(true)
    setR(null)
    try {
      const res = await fetch(accion === 'descartar' ? '/api/correduria/cliente' : '/api/correduria/cliente?restaurar=1', {
        method: accion === 'descartar' ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: clienteId, motivo: motivo.trim() || undefined }),
      })
      const json = await res.json().catch(() => null)
      const leido = interpretarDescarte(res.status, json)
      setR(leido)
      if (leido.estado === 'ok') {
        if (accion === 'descartar') {
          // Se sale de la ficha: ya no está en la cartera y quedarse en ella
          // invitaría a seguir trabajando sobre algo que nadie más ve.
          router.push('/correduria')
          router.refresh()
        } else {
          setPaso('cerrado')
          router.refresh()
        }
      }
    } catch {
      setR({ estado: 'error', motivo: 'red' })
    } finally {
      setEnviando(false)
    }
  }

  // ── Cartel de arriba ──────────────────────────────────────────────────────
  if (zona === 'aviso') {
    if (!descartada) return null
    return (
      <div
        style={{
          border: '1px solid var(--negative)',
          background: 'var(--negative-bg)',
          borderRadius: 12,
          padding: 14,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--negative)' }}>🚫 Ficha descartada</div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
          Esta ficha está fuera de la cartera: no sale en el buscador, ni en la lista, ni en los
          contadores, ni en los avisos. <strong>No se ha borrado nada</strong> — su historial, sus
          pólizas y sus documentos siguen aquí, y se pueden devolver a la cartera.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={() => llamar('restaurar')}
            disabled={enviando}
            style={{ ...btnStyle('secundario'), opacity: enviando ? 0.6 : 1 }}
          >
            {enviando ? 'Restaurando…' : '↩️ Restaurar en la cartera'}
          </button>
        </div>
        <Resultado r={r} accion="restaurar" />
      </div>
    )
  }

  // ── Zona de peligro (final de la ficha) ───────────────────────────────────
  // Si ya está descartada no hay nada que descartar: lo que toca (restaurar)
  // vive arriba, donde se ve sin bajar hasta el final.
  if (descartada) return null

  const bloqueadaPorPolizas = polizasVivas > 0
  const puede = texto.trim().toUpperCase() === 'DESCARTAR' && !bloqueadaPorPolizas

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Zona de peligro</div>

      {paso === 'cerrado' ? (
        <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
          <button
            type="button"
            onClick={() => {
              setR(null)
              setTexto('')
              setPaso('confirmando')
            }}
            // Tamaño normal (44px de alto): es la regla táctil del repo, y un
            // botón que abre una acción destructiva no se pulsa a tientas.
            style={{ ...btnStyle('secundario'), color: 'var(--negative)', borderColor: 'var(--negative)' }}
          >
            Descartar esta ficha
          </button>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', maxWidth: 620 }}>
            Deja de salir en el buscador y en la cartera. <strong>No borra nada</strong> y se puede
            deshacer. {bloqueadaPorPolizas
              ? `Ahora mismo no se puede: tiene ${polizasVivas} ${polizasVivas === 1 ? 'póliza viva' : 'pólizas vivas'}.`
              : ''}
          </p>
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--negative)',
            background: 'var(--negative-bg)',
            borderRadius: 12,
            padding: 12,
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--negative)' }}>
            Descartar «{nombre}»
          </div>

          {bloqueadaPorPolizas ? (
            <p style={{ margin: 0, fontSize: 13 }}>
              No se puede: esta ficha tiene <strong>{polizasVivas}</strong>{' '}
              {polizasVivas === 1 ? 'póliza viva' : 'pólizas vivas'} (las que entra o mantiene CIMA).
              Primero hay que darlas de baja en la compañía; mientras estén vivas, esta persona es un
              cliente de la correduría.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13 }}>
              La ficha dejará de salir en el buscador, la lista, los contadores y los avisos. No se
              borra: su historial, sus pólizas y sus documentos siguen en la base, y desde su propia
              ficha se puede restaurar. Si CIMA vuelve a traer una póliza suya, vuelve sola.
            </p>
          )}

          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
            Motivo (opcional, queda en el historial)
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Duplicado de la ficha de… / se dio de baja en 2019…"
              maxLength={500}
              style={campo}
            />
          </label>

          {!bloqueadaPorPolizas && (
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              Escribe <strong style={{ color: 'var(--text)' }}>DESCARTAR</strong> para confirmar
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                style={campo}
              />
            </label>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => llamar('descartar')}
              disabled={!puede || enviando}
              style={{
                ...btnStyle('secundario'),
                color: 'var(--negative)',
                borderColor: 'var(--negative)',
                opacity: !puede || enviando ? 0.5 : 1,
                cursor: !puede || enviando ? 'not-allowed' : 'pointer',
              }}
            >
              {enviando ? 'Descartando…' : 'Sí, descartar'}
            </button>
            <button type="button" onClick={() => setPaso('cerrado')} disabled={enviando} style={btnStyle('sutil')}>
              Cancelar
            </button>
          </div>

          <Resultado r={r} accion="descartar" />
        </div>
      )}
    </div>
  )
}

const campo: React.CSSProperties = {
  padding: '10px 12px',
  minHeight: 44,
  fontSize: 14,
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  width: '100%',
  maxWidth: 420,
  boxSizing: 'border-box',
}

/**
 * Qué ha respondido asegura. Cada estado tiene su frase: «no se ha podido
 * comprobar» NO se pinta como «no se ha podido descartar» a secas, porque lo que
 * hay que hacer después es distinto (reintentar, no llamar a la compañía).
 */
function Resultado({ r, accion }: { r: ResultadoDescarte | null; accion: 'descartar' | 'restaurar' }) {
  if (r === null || r.estado === 'ok') return null
  const texto =
    r.estado === 'tiene_polizas_vivas'
      ? r.polizasVivas === null
        ? 'No se descarta: la ficha tiene pólizas vivas (asegura no dice cuántas).'
        : `No se descarta: la ficha tiene ${r.polizasVivas} ${r.polizasVivas === 1 ? 'póliza viva' : 'pólizas vivas'}. Mientras estén vivas, es un cliente de la correduría.`
      : r.estado === 'no_encontrado'
        ? 'Esa ficha ya no está en la cartera de asegura (se ha consultado y no existe).'
        : r.estado === 'sin_configurar'
          ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET). No se ha hecho nada.'
          : r.estado === 'invalido'
            ? textoMotivo(r.motivo)
            : `No se ha podido ${accion}: ${textoMotivo(r.motivo)}`
  return (
    <p style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }} role="alert">
      ⚠️ {texto}
    </p>
  )
}

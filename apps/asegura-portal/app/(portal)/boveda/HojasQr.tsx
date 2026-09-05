'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { fechaEs } from '@/lib/fechas'
import type { HojaResumen } from '@/lib/hojas'

type Opcion = { id: string; etiqueta: string }

/**
 * Crear y anular la HOJA de la nevera.
 *
 * Alberto, 05/09/2026: *«crear QR y ahí seleccionas si todas las pólizas, una o
 * algunas… y luego se crea el QR»*, con *«el qr se puede borrar y se anularía el
 * acceso»*. Las reglas están en
 * `packages/module-seguros-portal/src/hoja-qr.ts`; aquí solo la pantalla.
 *
 * 🚨 Tres cosas que la pantalla tiene que DECIR y no se pueden quitar:
 *
 * 1. **Que «todas» incluye las pólizas FUTURAS.** Para una hoja de nevera suele
 *    ser lo que se quiere —que siga valiendo al cambiar de coche— pero es un
 *    ensanchamiento silencioso del acceso si nadie lo cuenta.
 * 2. **Que el enlace se ve UNA vez.** En la BD vive su hash, así que si se
 *    cierra esta pantalla sin imprimir, la hoja hay que anularla y crear otra.
 * 3. **Que anular no borra el papel.** Anular corta el acceso; el imán sigue en
 *    la nevera y hay que tirarlo, o alguien lo escaneará y creerá que el móvil
 *    falla.
 */
export function HojasQr({
  hojas,
  cartera,
  declaradas,
}: {
  hojas: HojaResumen[]
  cartera: Opcion[]
  declaradas: Opcion[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [todas, setTodas] = useState(true)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [nombre, setNombre] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // El enlace recién creado. Solo vive aquí, en memoria, hasta que se recarga.
  const [nuevo, setNuevo] = useState<string | null>(null)

  const opciones = [...cartera, ...declaradas]
  const vivas = hojas.filter((h) => h.anuladaEn === null)

  function alternar(id: string) {
    setElegidas((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  async function crear() {
    setError(null)
    setEnviando(true)
    try {
      const r = await fetch('/api/hojas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          todas,
          polizaIds: todas ? [] : [...elegidas],
          nombre: nombre.trim() || null,
        }),
      })
      const j = (await r.json()) as { enlace?: string; error?: string }
      if (!r.ok) {
        setError(textoError(j.error))
        return
      }
      setNuevo(j.enlace ?? null)
      setAbierto(false)
      setElegidas(new Set())
      setNombre('')
      // La lista se refresca sin desmontarla: el enlace nuevo sigue en pantalla.
      router.refresh()
    } catch {
      setError('No hemos podido crear la hoja. Inténtalo en un momento.')
    } finally {
      setEnviando(false)
    }
  }

  async function anular(id: string) {
    setError(null)
    try {
      const r = await fetch(`/api/hojas/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        setError('No hemos podido anular esa hoja. Inténtalo en un momento.')
        return
      }
      router.refresh()
    } catch {
      setError('No hemos podido anular esa hoja. Inténtalo en un momento.')
    }
  }

  return (
    <div>
      <p className="suave" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>
        Un papel con lo que hace falta después de un percance —compañía, número de póliza, qué está
        asegurado y a quién llamar— para la nevera o la guantera. El QR lleva un enlace, así que la
        hoja se mantiene al día sola.
      </p>

      {/* 🚨 `.confirmacion`, NO `.alarma`: esto se pintaba con el tono negativo
          y el título salía en ROJO puro. El negativo está reservado a lo que
          puede dejar a alguien sin cobertura, y gastarlo en una buena noticia
          lo devalúa para cuando haga falta de verdad. */}
      {nuevo && (
        <div className="confirmacion" role="status">
          <p className="confirmacion-titulo">Tu hoja está lista</p>
          {/* 🚨 Punto 2 de la cabecera: el enlace se enseña UNA vez. */}
          <p>
            Ábrela e imprímela ahora. <strong>Este enlace solo se ve esta vez</strong>: nosotros
            guardamos la hoja, no el enlace. Si lo pierdes, anula esta y crea otra.
          </p>
          <a className="boton auto" href={nuevo} target="_blank" rel="noreferrer">
            Abrir e imprimir
          </a>
        </div>
      )}

      {error && (
        <p className="error-linea" role="alert">
          {error}
        </p>
      )}

      {hojas.length === 0 ? (
        <p className="suave" style={{ margin: '0 0 12px' }}>Todavía no has creado ninguna hoja.</p>
      ) : (
        <ul className="hojas">
          {hojas.map((h) => (
            <li key={h.id} className="hoja-fila" data-anulada={h.anuladaEn ? 'si' : undefined}>
              <span className="hoja-cuerpo">
                <span className="hoja-titulo">{h.nombre ?? 'Hoja sin nombre'}</span>
                <span className="hoja-meta">
                  {/* 🚨 `null` = todas, NO cero. Pintar «0 pólizas» en la hoja que
                      más enseña de todas sería exactamente al revés. */}
                  {h.cuantasElegidas === null
                    ? 'Todas tus pólizas'
                    : h.cuantasElegidas === 1
                      ? '1 póliza'
                      : `${h.cuantasElegidas} pólizas`}
                  {' · '}
                  {h.anuladaEn
                    ? `anulada el ${fechaEs(h.anuladaEn)}`
                    : h.ultimoUsoEn
                      ? `última vez escaneada el ${fechaEs(h.ultimoUsoEn)}`
                      : 'nadie la ha escaneado todavía'}
                </span>
              </span>
              {/* El estado, en un chip: antes solo se sabía leyendo la línea
                  de meta, y la fila entera iba atenuada por debajo del
                  contraste mínimo. */}
              {h.anuladaEn !== null && <span className="chip">Anulada</span>}
              {h.anuladaEn === null && (
                <button type="button" className="boton-tenue" onClick={() => anular(h.id)}>
                  Anular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {opciones.length === 0 ? (
        <p className="suave" style={{ margin: '12px 0 0', fontSize: 13 }}>
          Cuando tengas alguna póliza aquí podrás crear tu hoja.
        </p>
      ) : !abierto ? (
        <button type="button" className="boton auto" onClick={() => setAbierto(true)} style={{ marginTop: 12 }}>
          Crear una hoja
        </button>
      ) : (
        <div className="hoja-formulario">
          {/* La forma de la casa (`CamposPoliza.tsx`): la etiqueta FUERA y
              `.campo` en el CONTROL. Con `.campo` sobre el <label>, el
              elemento se queda en `display:inline` —`width`, `min-height` y
              `padding` inertes— y el <input> sale sin estilar, a 25 px. */}
          <div className="editor-campo">
            <label htmlFor="hoja-nombre">Nombre (para distinguirla)</label>
            <input
              id="hoja-nombre"
              className="campo"
              type="text"
              value={nombre}
              maxLength={60}
              placeholder="Nevera de casa"
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <fieldset>
            <legend>Qué pólizas lleva</legend>
            <div className="opciones">
              <label className="opcion">
                <input type="radio" checked={todas} onChange={() => setTodas(true)} />
                <span>
                  Todas mis pólizas
                  {/* 🚨 Punto 1: se dice, no se descubre. */}
                  <span className="tenue"> — también las que contrate más adelante</span>
                </span>
              </label>
              <label className="opcion">
                <input type="radio" checked={!todas} onChange={() => setTodas(false)} />
                <span>Solo las que elija</span>
              </label>
            </div>

            {!todas && (
              <ul className="opciones">
                {opciones.map((o) => (
                  <li key={o.id}>
                    <label className="opcion">
                      <input type="checkbox" checked={elegidas.has(o.id)} onChange={() => alternar(o.id)} />
                      <span>{o.etiqueta}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <p className="suave" style={{ fontSize: 13, margin: '0 0 12px' }}>
            {/* 🚨 Punto 3: anular corta el acceso, no recoge el papel. */}
            Podrás anularla cuando quieras y el QR dejará de abrir nada — pero acuérdate de tirar el
            papel, o alguien lo escaneará y pensará que le falla el móvil.
          </p>

          <div className="acciones">
            <button type="button" className="boton auto" onClick={crear} disabled={enviando}>
              {enviando ? 'Creando…' : 'Crear la hoja'}
            </button>
            <button type="button" className="boton-tenue" onClick={() => setAbierto(false)} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {vivas.length > 0 && (
        <p className="suave" style={{ fontSize: 13, margin: '12px 0 0' }}>
          Tienes {vivas.length === 1 ? 'una hoja activa' : `${vivas.length} hojas activas`}.
        </p>
      )}
    </div>
  )
}


/**
 * Cada error dice una cosa distinta. `sin_enlace` no es «no se ha podido»: es
 * una avería NUESTRA, y decirlo evita que alguien reintente diez veces.
 */
function textoError(e: string | undefined): string {
  switch (e) {
    case 'sin_seleccion':
      return 'Elige al menos una póliza, o marca «todas».'
    case 'nada_visible':
      return 'Todavía no tenemos ninguna póliza tuya que poner en la hoja.'
    case 'demasiadas':
      return 'Tienes demasiadas hojas activas. Anula alguna antes de crear otra.'
    case 'sin_enlace':
      return 'Avería nuestra: no podemos formar el enlace de la hoja ahora mismo. No se ha creado nada.'
    case 'sin_sesion':
      return 'Tu sesión ha caducado. Vuelve a entrar.'
    default:
      return 'No hemos podido crear la hoja. Inténtalo en un momento.'
  }
}

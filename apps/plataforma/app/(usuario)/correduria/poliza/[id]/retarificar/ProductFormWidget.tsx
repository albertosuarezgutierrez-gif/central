'use client'

// Product Form Library de Codeoscopic: pinta en un <iframe> el formulario REAL
// de consentimiento/underwriting de la compañía, tal y como lo mantiene el
// vendor — sustituye al catálogo ESTÁTICO adivinado (`opciones-producto.ts`
// en asegura, hoy solo Allianz, y solo tras 3 errores reales en producción)
// por el formulario de verdad, para cualquier compañía y cualquier ramo.
//
// Documentación capturada el 17/09/2026 (el portal/OpenAPI está bloqueado
// desde el contenedor de la sesión por el proxy — se leyó vía Claude en
// Chrome): script `https://product-form.avant.codeoscopic.io/js.js`, clase
// `AvantProductForm(elementoODivId, dataCallback)`.
//
// 🚨 El iframe NO puede guardar el token OAuth2 (RFC 6749 §4.4: un cliente de
// navegador no es confidencial) — su `dataCallback` reenvía cada sub-petición
// del widget (catálogos, sub-formularios) a `pedirProductForm` (acción de
// servidor → asegura → Codeoscopic, con las credenciales reales). El CSP que
// exige el iframe vive en `next.config.ts` (`frame-src *.codeoscopic.io`).
//
// Se monta sobre una oferta YA confirmada por ReRate (`render(quote)`,
// «modify options of an EXISTING quote», según el propio portal): el `quote`
// es `quoteCrudo` (el `mainQuote` del vendor, sin parsear — ver
// `apps/asegura/lib/codeoscopic/emitir.ts::Oferta.quoteCrudo`). El resultado
// de `getProductOptions()` es lo que viaja como `product.options` en el
// Submit — se reenvía TAL CUAL, sin interpretar su forma.

import { useEffect, useRef, useState } from 'react'
import { pedirProductForm } from './acciones'

/* eslint-disable @typescript-eslint/no-explicit-any */
type InstanciaProductForm = {
  render: (a: unknown, b?: unknown, c?: unknown) => Promise<void> | void
  getProductOptions: () => Promise<unknown>
}

declare global {
  interface Window {
    AvantProductForm?: new (
      el: string | HTMLElement,
      dataCallback: (request: unknown) => Promise<unknown>,
    ) => InstanciaProductForm
  }
}

const SRC = 'https://product-form.avant.codeoscopic.io/js.js'

let scriptPromise: Promise<void> | null = null
function cargarScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.AvantProductForm) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptPromise = null // un fallo de red no deja el módulo atascado: se puede reintentar
      reject(new Error('no se pudo cargar el formulario de la compañía (product-form.avant.codeoscopic.io)'))
    }
    document.body.appendChild(s)
  })
  return scriptPromise
}

/** El `dataCallback` que exige `AvantProductForm`: reenvía la petición del
 *  widget, TAL CUAL, a la acción de servidor — nunca se interpreta aquí. */
async function dataCallback(request: unknown): Promise<unknown> {
  const req = (typeof request === 'object' && request !== null ? request : {}) as Record<string, unknown>
  if (typeof req.path !== 'string') throw new Error('la petición del formulario no trae `path`')
  const r = await pedirProductForm({
    method: typeof req.method === 'string' ? req.method : undefined,
    path: req.path,
    params: Array.isArray(req.params) ? req.params : undefined,
    body: typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : undefined,
  })
  if (r.estado !== 'ok') throw new Error(r.mensaje)
  return r.respuesta
}

type Estado = { paso: 'cargando' } | { paso: 'listo' } | { paso: 'error'; mensaje: string }

export function ProductFormWidget({
  quoteCrudo,
  onOptions,
}: {
  quoteCrudo: unknown
  /** `options` es lo que ha guardado el corredor (o `null` si aún no ha
   *  pulsado «Guardar»); `avisoValidacion` es el texto del widget si
   *  `getProductOptions()` no devolvió un array (`ValidationError`). */
  onOptions: (options: unknown[] | null, avisoValidacion: string | null) => void
}) {
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' })
  const contenedorId = useRef(`product-form-${Math.random().toString(36).slice(2)}`)
  const instancia = useRef<InstanciaProductForm | null>(null)
  const vivoRef = useRef(true)
  useEffect(
    () => () => {
      vivoRef.current = false
    },
    [],
  )

  useEffect(() => {
    if (quoteCrudo === null || quoteCrudo === undefined) {
      setEstado({ paso: 'error', mensaje: 'Esta oferta no trae el `quote` del vendor: no se puede pintar el formulario.' })
      return
    }
    let cancelado = false
    setEstado({ paso: 'cargando' })
    instancia.current = null
    cargarScript()
      .then(() => {
        if (cancelado || !vivoRef.current) return undefined
        if (!window.AvantProductForm) throw new Error('el script cargó pero no expone `AvantProductForm`')
        const inst = new window.AvantProductForm(contenedorId.current, dataCallback)
        instancia.current = inst
        return inst.render(quoteCrudo)
      })
      .then(() => {
        if (cancelado || !vivoRef.current) return
        setEstado({ paso: 'listo' })
      })
      .catch((e: unknown) => {
        if (cancelado || !vivoRef.current) return
        setEstado({ paso: 'error', mensaje: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelado = true
    }
    // Solo re-renderiza si cambia la oferta confirmada — no en cada render del panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteCrudo])

  async function guardarOpciones() {
    if (!instancia.current) return
    try {
      const r = await instancia.current.getProductOptions()
      // `Promise<readonly Object[] | ValidationError>`, sin fixture de cómo se
      // distingue una de otra: lo único seguro sin adivinar es que un array
      // ES la forma válida. Cualquier otra cosa se enseña tal cual llegó, sin
      // suponer que sea un objeto con un campo `message` o similar.
      if (Array.isArray(r)) {
        onOptions(r, null)
      } else {
        onOptions(null, typeof r === 'string' ? r : JSON.stringify(r))
      }
    } catch (e) {
      onOptions(null, e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div
        id={contenedorId.current}
        style={{
          minHeight: estado.paso === 'listo' ? 280 : 0,
          border: estado.paso === 'listo' ? '1px solid var(--border)' : 'none',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      />
      {estado.paso === 'cargando' && (
        <p className="muted" style={{ fontSize: 12 }}>
          Cargando el formulario de la compañía…
        </p>
      )}
      {estado.paso === 'error' && (
        <p className="err" style={{ fontSize: 12 }}>
          {estado.mensaje}
        </p>
      )}
      {estado.paso === 'listo' && (
        <button
          type="button"
          className="ghost"
          style={{ marginTop: 8, minHeight: 44 }}
          onClick={() => void guardarOpciones()}
        >
          Guardar las opciones del formulario
        </button>
      )}
    </div>
  )
}

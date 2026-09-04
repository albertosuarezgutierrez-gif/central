'use client'
import { Plus, House, Wrench, MoreHorizontal } from 'lucide-react'
import { btnStyle } from '@/components/ui'

/**
 * Las acciones de la cabecera de /correduria: UNA visible y el resto en un menú.
 *
 * 🚨 Por qué existe este componente en vez de tres `BtnLink` sueltos en el
 * `PageHeader`: en móvil `.page-header-acciones` es `width:100%` + `flex-wrap`,
 * y tres botones `md` (44px de alto) con rótulos largos —«Presupuesto de hogar»
 * mide ~200px con su icono— caben a uno y medio por fila. Resultado medido
 * sobre la captura de Alberto (03/09/2026, móvil de ~390px): **tres filas de
 * botones, ~176px de alto**, encima del buscador y de todo lo que es trabajo.
 * La pantalla que abre cada mañana empezaba con 520px de cabecera sobre 740 de
 * pantalla.
 *
 * Ninguna otra pantalla de la app pone tres acciones en la cabecera (el máximo
 * del resto son dos), y la única que llegó a tener siete —`/banca`— las colapsó
 * en un desplegable por este mismo motivo. Esto es esa misma decisión.
 *
 * Qué se queda fuera del menú y por qué: **«Nuevo cliente» es lo único que se
 * hace a diario**. Presupuesto de hogar y Mantenimiento son de cuando toca, y
 * el segundo ni siquiera es trabajo comercial: es una pasada de limpieza de
 * datos. Un botón permanente por una tarea de una tarde es ruido.
 *
 * Se usa `<details>` nativo y no un `useState` a propósito: cierra solo al
 * navegar y no arrastra el fallo que documenta `AccionesBanca` en banca
 * (`BancaClient.tsx`), donde cerrar el panel en el `onClick` desmontaba el
 * botón pulsado junto con el modal que ese mismo toque acababa de abrir.
 */
export default function AccionesCabecera() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <a href="/correduria/cliente/nuevo" style={{ ...btnStyle('primario'), textDecoration: 'none' }}>
        <Plus size={15} strokeWidth={1.75} aria-hidden /> Nuevo cliente
      </a>

      <details style={{ position: 'relative' }}>
        {/* `minWidth:44` para que el botón siga siendo táctil aunque solo lleve icono. */}
        <summary
          aria-label="Más acciones"
          style={{
            ...btnStyle('secundario'),
            minWidth: 44,
            listStyle: 'none',
            userSelect: 'none',
            cursor: 'pointer',
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
        </summary>

        {/* Mismo panel flotante que el resto de desplegables del repo:
            `maxWidth:'86vw'` para que no arrastre nunca el scroller horizontal
            de `LayoutShell` (que es toda la app, no esta caja). */}
        <div
          style={{
            position: 'absolute',
            zIndex: 30,
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 240,
            maxWidth: '86vw',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 8,
            boxShadow: 'var(--shadow)',
          }}
        >
          <a
            href="/correduria/hogar"
            style={{ ...btnStyle('secundario'), justifyContent: 'flex-start', textDecoration: 'none' }}
          >
            <House size={15} strokeWidth={1.75} aria-hidden /> Presupuesto de hogar
          </a>
          <a
            href="/correduria/mantenimiento"
            style={{ ...btnStyle('secundario'), justifyContent: 'flex-start', textDecoration: 'none' }}
          >
            <Wrench size={15} strokeWidth={1.75} aria-hidden /> Mantenimiento
          </a>
        </div>
      </details>
    </div>
  )
}

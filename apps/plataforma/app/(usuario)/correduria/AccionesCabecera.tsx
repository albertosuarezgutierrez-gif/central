'use client'
import { Plus, Wrench, Building2, MoreHorizontal, FileUp } from 'lucide-react'
import { btnStyle } from '@/components/ui'

/**
 * Las acciones de la cabecera de /correduria: UNA visible y el resto en un menú.
 *
 * 🚨 Por qué existe este componente en vez de varios `BtnLink` sueltos en el
 * `PageHeader`: en móvil `.page-header-acciones` es `width:100%` + `flex-wrap`,
 * y varios botones `md` (44px de alto) con rótulos largos apenas caben a uno y
 * medio por fila. Resultado medido sobre la captura de Alberto (03/09/2026,
 * móvil de ~390px): **tres filas de botones, ~176px de alto**, encima del
 * buscador y de todo lo que es trabajo. La pantalla que abre cada mañana
 * empezaba con 520px de cabecera sobre 740 de pantalla.
 *
 * Ninguna otra pantalla de la app pone tres acciones en la cabecera (el máximo
 * del resto son dos), y la única que llegó a tener siete —`/banca`— las colapsó
 * en un desplegable por este mismo motivo. Esto es esa misma decisión.
 *
 * Qué se queda fuera del menú y por qué. Hasta el 21/09/2026 la acción visible
 * era «Nuevo cliente», por ser la única diaria. Desde que se puede **subir la
 * póliza que manda el interesado** y que de ahí salgan la ficha y su
 * vencimiento, esa deja de ser la puerta normal: teclear un cliente a mano es
 * ahora el caso raro —el que no trae papel—, así que baja al menú y sube
 * «Subir póliza», que es lo que se hace con el móvil en la mano cuando llega un
 * lead por WhatsApp o por correo.
 *
 * Sigue habiendo UNA sola acción visible, y por el mismo motivo de siempre:
 * dos botones `md` con rótulo no caben en una fila de 390px. Compañías y
 * Mantenimiento son de consulta/de cuando toca, y el segundo ni siquiera es
 * trabajo comercial: es una pasada de limpieza de datos.
 *
 * ⚠️ **«Presupuesto de hogar» se quitó de aquí el 12/09/2026** (Alberto: no
 * tiene sentido ofrecerlo suelto — `/correduria/hogar` solo consulta el
 * Catastro, no genera ninguna propuesta; una propuesta real de verdad exige
 * tener antes el cliente creado y se pide desde su ficha con «Retarificar
 * hogar ↗»). La página sigue viva por si algo la enlaza, pero ya no tiene
 * entrada desde esta cabecera.
 *
 * Se usa `<details>` nativo y no un `useState` a propósito: cierra solo al
 * navegar y no arrastra el fallo que documenta `AccionesBanca` en banca
 * (`BancaClient.tsx`), donde cerrar el panel en el `onClick` desmontaba el
 * botón pulsado junto con el modal que ese mismo toque acababa de abrir.
 */
export default function AccionesCabecera() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {/* Enlace a una ruta de PLATAFORMA que redirige: la pantalla vive en
          asegura, pero su URL no se resuelve aquí (sería código de servidor en
          un bundle de cliente). Ver `subir-poliza/page.tsx`. */}
      <a href="/correduria/subir-poliza" style={{ ...btnStyle('primario'), textDecoration: 'none' }}>
        <FileUp size={15} strokeWidth={1.75} aria-hidden /> Subir póliza
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
            href="/correduria/cliente/nuevo"
            style={{ ...btnStyle('secundario'), justifyContent: 'flex-start', textDecoration: 'none' }}
          >
            <Plus size={15} strokeWidth={1.75} aria-hidden /> Nuevo cliente
          </a>
          <a
            href="/correduria/companias"
            style={{ ...btnStyle('secundario'), justifyContent: 'flex-start', textDecoration: 'none' }}
          >
            <Building2 size={15} strokeWidth={1.75} aria-hidden /> Compañías
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

# iarrhh — Rediseño visual (Portal del Empleado)

> Spec de diseño. Fecha: 2026-06-15. Vertical: `apps/rrhh`.
> Aprobado por Alberto sobre el mockup `apps/rrhh/mockups/iarrhh-preview.html`.

## Objetivo

Vestir las páginas que **ya funcionan** de `apps/rrhh` con la imagen de la casa (estilo
ia-rest), bajo la marca propia **iarrhh**. Es un cambio puramente de presentación: **no se
toca ninguna lógica de negocio, datos, auth ni API.** El resultado debe sentirse hermano de
ia-rest: papel cálido, tinta y un acento teal.

## No-objetivos (alcance excluido)

- NO se modifican rutas API (`app/api/**`), `lib/*`, `prisma/*`, auth/tenant, polling ni
  ningún flujo de datos.
- NO se añaden dependencias nuevas de runtime (las fuentes vía `next/font/google`).
- NO se cambia el comportamiento de los componentes (props, estado, fetch): solo su markup
  y estilos.

## Marca

- **Wordmark:** `ia·rrhh` — "ia" en peso fuerte (tinta), punto medio en teal, "rrhh" en peso
  medio (tinta-2). Fuente Inter Tight. Componente `components/Wordmark.tsx` (presentacional).
- **Monograma / icono:** cuadrado teal con "ia" en papel (SVG). Reemplaza los iconos PWA
  (`public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) por versiones teal.
- **White-label:** el modelo ya tiene `marca_color` y `marca_logo`. El teal es el *default*
  de iarrhh. Si una empresa define `marca_color`, el layout lo inyecta como `--accent` vía
  un `style` inline en el contenedor raíz (sin lógica nueva: solo se lee el valor que ya
  llega del servidor). Si no hay color, se usa el teal por defecto.

## Tokens de diseño (`app/globals.css`)

Se adopta la paleta de ia-rest con teal como acento. Variables CSS en `:root`:

```
--paper:#F6F1E7;  --paper-2:#EFE8DA;  --card:#FCFAF4;
--ink:#1A1714;    --ink-2:#4A443C;    --ink-3:#857C6E;
--line:#E2D9C7;   --line-2:#D6CAB2;
--accent:#2B6A6E (teal);  --accent-ink:#21565A;  --accent-soft:#DCEAEA;
--green:#3F7D44 (ok);  --vermilion:#D9442B (alerta);
```

Fuentes vía `next/font/google` en `app/layout.tsx`, expuestas como CSS vars:
**Inter Tight** (sans, UI), **Newsreader** (serif, titulares), **JetBrains Mono** (tokens/códigos).

Tailwind: se extiende `tailwind.config.ts` para mapear estos tokens a `colors`/`fontFamily`,
de modo que las clases (`bg-paper`, `text-ink`, `bg-accent`, etc.) usen las CSS vars.

## Layout del responsable (escritorio)

Nuevo componente presentacional `app/admin/Layout` (sidebar + main) usado por las páginas de
admin (Server Components que ya hacen el fetch). Solo envuelve el contenido existente:

- **Sidebar fija** izquierda: wordmark arriba, navegación (Empleados · Solicitudes),
  botón de notificaciones, pie con usuario y "cerrar sesión".
- **Main**: cabecera con título (Newsreader) + acción primaria; contenido en cartas/tabla
  sobre papel.

Páginas a vestir (sin tocar su lógica): `login`, `admin/empleados` (+ `EmpleadosClient`),
`admin/empleados/[id]` (+ `ExpedienteClient`), `admin/solicitudes` (+ `SolicitudesClient`).

## Portal del empleado (móvil primero)

Mantiene el ancho acotado (≈520px) y reorganiza en **cartas apiladas**: cabecera con
wordmark, "Mi documentación", chat tipo WhatsApp, solicitudes, envío de documento y lista de
documentos. Componentes: `ExpedienteEmpleado`, `ChatPanel`, `SolicitudesEmpleado`,
`ActivarPush`.

## Estrategia de implementación

1. Tokens + fuentes en `globals.css` + `layout.tsx` + `tailwind.config.ts`.
2. `Wordmark.tsx` + iconos PWA teal.
3. Layout admin con sidebar; vestir login y las 3 pantallas admin.
4. Vestir portal del empleado y sus componentes.
5. Reemplazar todos los `style={{…}}` inline por clases Tailwind con los tokens.

Cada paso es independiente y verificable visualmente. El criterio de "hecho" por componente:
mismo comportamiento, markup con clases Tailwind/tokens, sin estilos inline sueltos.

## Testing / verificación

- No hay tests unitarios de UI; la verificación es visual sobre la preview de Vercel
  (`central-rrhh`) y el happy-path ya existente (login responsable, alta empleado, portal
  empleado `/e/<token>`, chat, solicitud).
- Comprobar que `next build` de `apps/rrhh` sigue verde (no romper imports ni el SW/manifest).

## Riesgos

- **next/font** requiere red en build; ya se usa en otras apps de la casa, riesgo bajo.
- White-label por `--accent`: si `marca_color` trae un valor inválido, el navegador lo ignora
  y cae al teal — comportamiento aceptable, sin validación nueva.

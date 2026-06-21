# Auditoría — panel `plataforma` (ruta `/apartamentos`)

**Fecha:** 2026-06-15 · **Disparador:** `Application error: a server-side exception
has occurred` (Digest `2305530836`) en `plataforma-ten-flame.vercel.app/apartamentos`.

## 🔴 Crítico — RESUELTO

### Server Component con handlers de evento → crash en runtime
- **Dónde:** `apps/plataforma/app/(usuario)/apartamentos/page.tsx:56-57`
- **Qué:** la página es un Server Component (`export default async function`, sin
  `'use client'`) pero pasaba `onMouseEnter`/`onMouseLeave` a un `<div>`. En Next 15 /
  React 19 esto lanza al renderizar en el servidor *"Event handlers cannot be passed to
  Client Component props"* → la ruta entera devuelve el server-side exception.
- **Por qué el build no lo cazó:** es un error de **runtime**, no de compilación; además
  el proyecto lleva `typescript.ignoreBuildErrors: true`, así que todos los deploys
  salían `READY` aunque la página reventara al abrirla.
- **Fix:** hover movido a una clase CSS server-renderable (`.apt-card:hover` en
  `app/globals.css`) y handlers eliminados. Comportamiento visual idéntico, sin JS de
  cliente en el Server Component.

## 🟢 Verificado limpio
- `apartamentos/[id]/page.tsx` (detalle, mismo PR #255): Server Component **sin** handlers.
- Resto del segmento `(usuario)/`: todos los ficheros con `onClick`/`onChange`/… son
  `'use client'` (LogoutButton, CommandPalette, GestionSociedad, ComunicacionClient,
  BancaClient, ConfigClient, UserSidebar, ClientesClient). Ningún otro Server Component
  pasa funciones a elementos DOM.
- Builds de `plataforma` en Vercel: últimos 20 deploys en estado `READY`.

## ✅ Acción manual de Alberto
- Tras mergear, abrir `plataforma-ten-flame.vercel.app/apartamentos` y comprobar que carga
  el listado con las tarjetas (y el hover de sombra sigue funcionando).
- **Rollback:** si algo va mal, revertir el commit; los deploys previos siguen como
  candidatos de rollback en Vercel (no hubo cambios de BD ni de envs).

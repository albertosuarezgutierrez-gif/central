# Preaviso por voz en los cascos del camarero — Diseño

> Extensión de `2026-06-21-preaviso-marcha-cocina-sala-design.md`. Vertical `apps/ia-rest`.
> Fecha: 2026-06-21 · Estado: aprobado, Capas 1-2 a implementar; Capa 3 = Fase 2 (no ahora).

## Problema / idea

Además del banner visual en `/edge`, que el preaviso **suene por voz** en los cascos del
camarero ("Mesa 7: salen 2 Entrecot, 1 Lubina"), para que se entere sin mirar la pantalla.

## Realidad técnica (límites de la web)

Un push web despierta el móvil bloqueado pero **no puede reproducir voz/TTS** fiable desde el
service worker (en iOS, imposible). Por tanto el diseño es **por capas y degradado**: cada
dispositivo recibe lo mejor que permite.

## Capas

### Capa 1 — Voz con la app abierta (web, TODOS) — ESTE SPEC
- **Reutiliza la infra de voz que ya existe en `/edge`** (DRY): la función `speak()` (voz neural
  VOX + fallback `SpeechSynthesis` `es-ES`) y el flag de config existente `ttsOff`. No se crea
  lib ni toggle nuevos.
- Al llegar un preaviso por Realtime con `document.visibilityState === 'visible'` y la voz
  activada (`!ttsOff`) → `speak(textoPreaviso(mesa, platos))` lee "Mesa 7: salen 2 Entrecot…".
  Más un `navigator.vibrate` corto como cue táctil (patrón ya usado en la pantalla).
- `ttsOff` se lee vía ref dentro del handler Realtime para evitar stale closure.
- **Wake Lock (diferido):** mantener la pantalla despierta para que hable con el móvil en el
  bolsillo es un follow-up opcional (coste de batería); no entra en v1 para no arriesgar
  regresiones en la gestión de audio/sesión existente.

### Capa 2 — Móvil bloqueado en navegador (web, TODOS) — ESTE SPEC
- No hay voz (límite real). El push que ya envía el backend despierta el móvil con su **tono +
  vibración** estándar. Es el máximo fiable en web bloqueada. No requiere código nuevo más allá
  de asegurar que el push del preaviso ya se envía (ya implementado en `enviarPushACamarero`).

### Capa 3 — Voz real con móvil bloqueado (APK Android) — FASE 2, NO AHORA
- Donde el camarero use la APK Android de ia.rest, una versión nativa puede hablar con la
  pantalla apagada (push → TTS de Android en un servicio en primer plano). Trabajo nativo
  (FCM + foreground service + TTS), Android-only. Spec propio cuando se aborde la APK.

## Componentes (Capas 1-2)

- `src/app/edge/page.tsx` (modificar): en el handler Realtime de preaviso entrante (INSERT),
  cuando es nuevo para este camarero, `!ttsOffRef.current` y la pestaña visible → `speak(...)`
  + `navigator.vibrate`. Importar `textoPreaviso` de `@/lib/preaviso` (ya se importa
  `resumenPlatos`). Reutiliza `speak()` (módulo) ya definido en el fichero.

## Errores / casos límite
- Navegador sin `speechSynthesis` → el toggle se oculta o no hace nada (degrada al banner visual).
- Sin gesto de usuario previo, algunos navegadores bloquean el audio: el toggle (un tap) sirve
  como gesto de activación; "probar voz" al activarlo confirma que suena.
- Wake Lock no soportado → se ignora silenciosamente (la voz sigue funcionando en foreground).
- Pestaña oculta → no se habla (lo cubre el push/tono de la Capa 2).

## Fuera de alcance
- Capa 3 (voz nativa con móvil bloqueado) — Fase 2, APK Android.
- Screen Wake Lock para hablar con el móvil en el bolsillo — follow-up opcional.
- Voz para otros roles (cocina) — por ahora solo el camarero en `/edge`.

## Verificación
- `cd apps/ia-rest && npx tsc --noEmit` → 0 errores.
- Manual: en `/edge`, activar "🔊 Avisos por voz"; lanzar un preaviso desde `/kds` → se oye la
  voz leyendo los platos con la pantalla encendida.

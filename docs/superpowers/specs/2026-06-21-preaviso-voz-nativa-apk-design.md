# Fase 2 — Voz nativa del preaviso con el móvil BLOQUEADO (APK Android) — Diseño

> Extensión de `2026-06-21-preaviso-voz-cascos-design.md` (Capa 3). Vertical `apps/ia-rest`.
> Fecha: 2026-06-21 · Estado: diseño, pendiente construir.

## Problema
La voz web (Capa 1) solo suena con la app abierta y la pantalla visible. Con el móvil
bloqueado en navegador es imposible (sobre todo iOS). El objetivo de esta fase: que el camarero
**oiga el preaviso con la pantalla apagada** donde use la **APK Android** de ia.rest.

## Terreno real (descubierto en exploración)
- Existe proyecto Android nativo editable: `apps/ia-rest/android/` (Kotlin).
  - `MainActivity.kt` — WebView que carga la web + PTT por auricular; inyecta `window.isNativeApp`,
    `window.__APP_VERSION__`, `window.__APP_PLATFORM__='android'`.
  - `BridgeService.kt` — **servicio en primer plano** (foreground service) que ya mantiene
    **WebSocket Realtime a Supabase** (escucha `print_jobs` para impresoras en red). Corre con la
    pantalla apagada.
  - `BridgeInterface.kt` — puente JS↔Android (`@JavascriptInterface`).
- El push hoy es **Web Push (VAPID) + Service Worker** (`public/sw-alertas.js`), NO FCM. El SW no
  puede reproducir TTS de forma fiable con la pantalla bloqueada → por eso vamos por el servicio
  nativo, no por el push.

## Enfoque (sin FCM — reutiliza lo que ya existe)
El `BridgeService` ya está suscrito a Supabase Realtime. **Añadir una segunda suscripción** a
`postgres_changes` INSERT sobre la tabla `preavisos` filtrada por `restaurante_id`. Cuando llega
un preaviso cuya `comanda_id` pertenece al camarero logueado en ESTE dispositivo → hablar con el
**`android.speech.tts.TextToSpeech`** (locale `es-ES`) el texto del preaviso + vibrar. Funciona
con la pantalla apagada porque el foreground service sigue vivo y el TTS reproduce audio.

### Piezas
1. **Bridge de sesión** (`BridgeInterface.kt` + web): la web, al cargar `/edge`, pasa al nativo
   `restauranteId` y `camareroId` (de `ia_rest_session`) por un método del bridge
   (p. ej. `IARestBridge.setSesion(restauranteId, camareroId)`). El servicio necesita esos IDs
   para filtrar a quién hablar. También pasar el set de `comanda_id` del camarero, o resolverlo en
   el servicio (más simple: la web pasa el `camarero_id` y el servicio comprueba contra la comanda
   vía un campo; pero `preavisos` no trae `camarero_id`. Solución: la web mantiene en el nativo el
   conjunto de `comanda_id` del camarero — el mismo `misComandaIdsRef` que ya calcula `/edge`).
2. **Suscripción Realtime a `preavisos`** en `BridgeService.kt`: replicar el patrón de
   `print_jobs`. Filtro `restaurante_id=eq.X`, evento INSERT, estado `enviado`.
3. **TTS nativo**: inicializar `TextToSpeech` una vez; al recibir un preaviso del camarero, hablar
   `"Mesa N: salen ..."` (mismo formato que `textoPreaviso`). El texto del preaviso ya viene en la
   fila (`mesa`, `platos` JSONB) → se formatea en Kotlin igual que `lib/preaviso.ts`.
4. **Anti-duplicado con la voz web**: si la WebView está en primer plano y visible, NO hablar en
   nativo (la web ya habla, Capa 1). El bridge marca visible/oculto en `visibilitychange`; el
   servicio solo habla cuando la app está en background / pantalla apagada.
5. **Gate**: respetar el ajuste de voz del camarero (el mismo `ttsOff`/preferencia) — pasarlo al
   nativo por el bridge.

## Versionado / release (PASO DE ALBERTO)
- Subir `CURRENT_VERSION` en `MainActivity.kt`, `versionCode` en `android/app/build.gradle` y
  `version` en `public/app/version.json` (a 13), con `scripts/check-apk-release.sh`.
- **Compilar + firmar (keystore de `android/KEYSTORE-INFO.md`) + publicar la APK en el release de
  GitHub es manual de Alberto.** Claude escribe el Kotlin y prepara el bump; no genera el binario
  firmado en el entorno cloud.

## Fuera de alcance
- iOS (la APK es Android; en iOS sigue siendo solo el tono del push).
- Cambiar el push web (sigue igual como respaldo/cue).

## Verificación
- Compilación Kotlin local de Alberto (`./gradlew assembleRelease`) sin errores.
- Manual en dispositivo con APK v13: bloquear el móvil, lanzar preaviso desde `/kds` → el móvil
  habla el preaviso con la pantalla apagada.

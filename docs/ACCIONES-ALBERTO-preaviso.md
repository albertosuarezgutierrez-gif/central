# Preaviso de marcha — acciones manuales de Alberto

> Todo lo de software está hecho y en el PR #414. Esto es lo único que requiere tu mano
> (cosas que Claude no puede hacer desde el entorno cloud: firmar APK, regenerar PDF binarios,
> tocar producción, crear triggers en la UI de Claude).

## 1. Merge del PR #414
Cuando lo revises, márcalo *ready* y mergéalo. Build verde en los 5 proyectos. Al mergear,
Vercel despliega la web a producción (disparo automático del preaviso + voz web + docs) — **sin
pasos extra por tu parte en la web**.

## 2. Base de datos — NADA
Las migraciones (`preaviso_activo`, `preaviso_auto_min`, tabla `preavisos`) ya están **aplicadas**
en la BD de producción (`wswbehlcuxqxyinousql`, schema `iarest`). Verificado por MCP.

## 3. Activar la feature por restaurante (cuando quieras usarla)
En `/owner → Configuración → "Preaviso de marcha"`:
- Marca la casilla para activarlo (aparece el botón 📣 en el KDS).
- Opcional: pon minutos en "Disparo automático tras ___ min en cocina" (0 = solo manual).

## 4. APK Android v3.1 — build + firma + publicación (voz nativa + fix impresión)
El código Kotlin está escrito pero **no compilado** (el entorno cloud no tiene toolchain Android).
Incluye: voz del preaviso con pantalla apagada (`PreavisoVozService`) **y** el arreglo del bridge
de impresión (ya no apunta al proyecto Supabase viejo). Pasos:

1. **Subir versión a 13 / "3.1"** en estos 3 sitios (deben quedar sincronizados):
   - `android/app/src/main/java/es/iarest/app/MainActivity.kt` → `CURRENT_VERSION = 13`
   - `android/app/build.gradle` → `versionCode 13` y `versionName "3.1"`
   - `apps/ia-rest/public/app/version.json` → `"version": 13` **(esto último SOLO después de subir
     la APK al release, porque dispara el aviso de actualización a los móviles)**.
2. Compilar y firmar: `cd apps/ia-rest/android && ./gradlew assembleRelease`
   (usa el keystore `iarest-release.keystore`, credenciales en `android/KEYSTORE-INFO.md`).
3. Crear el release de GitHub `android-v3.1` y subir el `iarest.apk` generado.
4. Actualizar `public/app/version.json` (paso 1c) + commit. Verifica con
   `scripts/check-apk-release.sh` que las 3 versiones cuadran.

> Sin este paso: la voz web (app abierta) y el disparo automático YA funcionan. Lo que aporta la
> APK v3.1 es la voz con el móvil **bloqueado** y devolver el Realtime de impresión instantánea
> (mientras tanto el bridge imprime igual por polling cada 5s).

## 5. Regenerar los 3 PDF de manuales
Los PDF de `public/manuals/*.pdf` son binarios. Pega el texto de
`docs/manuals-texto-preaviso.md` (secciones camarero/cocina/owner) al regenerarlos. La ayuda en
app (chat 🤖) y `manual.html` ya están actualizadas automáticamente.

## 6. Trigger del agente nocturno de docs (1 vez, si no existe)
La rutina `Ejecuta /auditoria-diaria` (claude.ai/code → Rutinas, ~04:00) ahora también mantiene los
manuales de usuario. Si ya la tienes creada (ver `docs/RUTINAS-PROGRAMADAS.md`), no hay que hacer
nada. Si no, créala una vez.

---
### Resumen ultra-corto
- **Tú:** mergear #414 · (cuando uses la feature) activar toggle en /owner · build+firma+release
  APK v3.1 · regenerar 3 PDF.
- **Ya hecho/automático:** BD, web (al mergear), ayuda en app, manual.html, agente de docs.

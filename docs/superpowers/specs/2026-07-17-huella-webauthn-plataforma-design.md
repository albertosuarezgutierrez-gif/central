# Diseño — Login con huella (WebAuthn/passkey) en apps/plataforma

**Fecha:** 2026-07-17
**Vertical:** `apps/plataforma` (cuadro de mando)
**Estado:** aprobado por Alberto, pendiente de plan de implementación
**Alcance:** primera prueba, solo la cuenta de Alberto

## Objetivo

Permitir entrar en el panel (`plataforma`) usando la **huella dactilar / Face ID / PIN del
dispositivo** en lugar de escribir la contraseña, mediante el estándar web **WebAuthn/passkeys**.

La huella **nunca sale del dispositivo ni llega al servidor**: el móvil guarda el dato biométrico
y solo viaja una firma criptográfica. Por eso no se trata ningún dato biométrico en el servidor
(bien de privacidad y legal).

## Decisiones tomadas

- **Enfoque = ATAJO (no sustituto).** Se conserva el login email+contraseña. La huella es un
  método adicional que se activa por dispositivo. Si la huella falla o el dispositivo se pierde,
  la contraseña sigue siendo el respaldo. Es lo reversible y seguro para una prueba.
- **Librería = `@simplewebauthn`** (server + browser). Estándar de facto; encapsula la parte
  criptográfica delicada (attestation, COSE/CBOR, verificación de firmas). Sin coste, sin sacar
  datos fuera. Descartados: implementación a mano (criptografía delicada, fácil de hacer insegura)
  y SaaS externo de passkeys (mete un tercero y saca datos de usuarios; contra la filosofía del
  monorepo).
- **Dónde vive:** todo en `apps/plataforma` para iterar rápido en la prueba. La lógica pura se
  aísla en `lib/webauthn.ts` para poder **promoverla luego a `@central/core-identity`** (que ya
  gestiona los tokens de sesión) y reutilizarla en rrhh/sivra si la prueba convence.

## Arquitectura

Encaja sobre el login actual de plataforma: cookie `plataforma_session` (JWT HS256 + jti),
`bcrypt` para contraseñas, `getSession()` que casa `cuenta.sessionJti`. La huella **reutiliza**
`createSessionToken()` / `COOKIE_OPTS` de `lib/auth.ts` para emitir exactamente la misma sesión
que hoy — no se toca el modelo de sesión existente.

### Componentes

- **`lib/webauthn.ts`** (puro, testeable con `node --test`): genera opciones de registro y de
  autenticación, RP ID / origin, y helpers de challenge. Sin Prisma ni `@/`.
- **`lib/webauthn-store.ts`** (acceso a datos): CRUD de credenciales sobre Prisma, scoped por
  `cuenta_id`.
- **Endpoints** (App Router, `app/api/auth/webauthn/`):
  - `POST /register/options` — (sesión requerida) genera opciones de registro + guarda challenge.
  - `POST /register/verify` — (sesión requerida) verifica y persiste la credencial.
  - `POST /login/options` — genera opciones de autenticación + challenge.
  - `POST /login/verify` — verifica la firma y, si es válida, emite la cookie `plataforma_session`.
- **UI:**
  - Botón "🔑 Activar huella en este dispositivo" en el perfil/ajustes del usuario logueado.
  - Botón "Entrar con huella" en `/login`, mostrado solo si el navegador soporta WebAuthn; debajo,
    siempre, el formulario email+contraseña como respaldo.

### Datos (Supabase compartida)

Tabla nueva `webauthn_credentials`:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `cuenta_id` | text | FK lógica a `cuentas`; SIEMPRE se filtra por él |
| `credential_id` | text UNIQUE | id de la credencial WebAuthn |
| `public_key` | bytea/text | clave pública de la credencial |
| `counter` | bigint | contador anti-clonado; se valida y actualiza en cada login |
| `transports` | text[] | ej. `["internal","hybrid"]` |
| `device_name` | text | etiqueta legible, ej. "iPhone de Alberto" |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | |

- Migración en `apps/plataforma/prisma/sql/2026-07-17_webauthn_credentials.sql`, aplicada por
  Supabase MCP. Sin RLS (patrón del repo, BYPASSRLS), con `REVOKE` a `anon`/`authenticated`.
- El **challenge** de cada ceremonia se guarda en una **cookie httpOnly de vida corta (~60s)**,
  firmada, no en tabla — evita estado extra en BD.

## Flujos

### Flujo 1 — Activar la huella (usuario ya logueado)
1. Pulsa "🔑 Activar huella en este dispositivo".
2. `POST /register/options` → opciones + challenge (cookie corta).
3. El navegador dispara el sensor (huella/Face ID/PIN) → devuelve credencial pública.
4. `POST /register/verify` → verifica contra el challenge y guarda la fila en
   `webauthn_credentials` (scoped `cuenta_id`, con `device_name`).

### Flujo 2 — Entrar con la huella (`/login`)
1. Si hay soporte WebAuthn, aparece "Entrar con huella".
2. `POST /login/options` → challenge (cookie corta).
3. Sensor → firma → `POST /login/verify` verifica contra las credenciales guardadas, valida y
   sube el `counter`, actualiza `last_used_at`.
4. Si es válida, emite la cookie `plataforma_session` con `createSessionToken()` (misma sesión de
   siempre) y redirige a `/banca`.

## Errores y casos borde

- **Navegador sin soporte WebAuthn:** el botón no se muestra; degrada a contraseña.
- **Huella cancelada/fallida:** mensaje suave; el usuario sigue con email+contraseña.
- **Passkey atada al dominio:** la credencial vale solo para `plataforma-ten-flame.vercel.app`.
  Si en el futuro se usa un dominio propio, habrá que re-registrar la huella. **Caveat conocido.**
- **`counter` regresivo:** posible clonado → se rechaza la autenticación.
- **Challenge caducado/ausente:** se rechaza la ceremonia; reintentar.

## Reglas del repo que se cumplen

- **Multi-tenant:** toda query filtra por `cuenta_id`.
- **Sin secretos en repo:** reutiliza `JWT_SECRET` ya existente vía `lib/auth.ts`.
- **Responsive (≥320 px):** botón y flujo usables en móvil (es donde más sentido tiene); botones
  táctiles ≥44 px.
- **Sin dependencias de pago ni datos fuera.**

## Alcance de esta prueba (YAGNI)

**Incluye:** solo la cuenta de Alberto; un botón para activar y otro para entrar con huella.

**No incluye (futuro, si convence):** gestión de "mis dispositivos", borrar credenciales por UI,
passkeys para otros usuarios/otras verticales, promoción a `@central/core-identity`.

## Pruebas

- `lib/webauthn.ts` (puro) con `node --test`.
- El flujo real (registro + login con el sensor) se prueba a mano en el móvil una vez desplegado
  a preview/producción, ya que WebAuthn requiere un dispositivo real y HTTPS.

# F0 — Plan de troceo (comunicación multi-negocio)

> F0 = **núcleo en `apps/plataforma`** del sistema de comunicación (ver
> `docs/COMUNICACION-MULTINEGOCIO.md`). Se parte en **PRs pequeños, revisables y
> mergeables uno a uno**. Cada PR deja algo verificable.

## Orden y dependencias
```
F0.1 (BD) → F0.2 (API) → F0.5 (UI hub)
                    ├→ F0.6 (UI config dueño)
                    └→ F0.7 (notificaciones)
F0.3 (directorio adaptadores) → F0.4 (grupos dinámicos) → alimenta F0.5
```

## Los PRs

### F0.1 — Esquema de BD `comunicacion_*`  · *S*
Migración SQL en la BD compartida (tablas scoped por `cuenta_id`):
`comunicacion_nodos`, `comunicacion_grupos`, `comunicacion_grupo_miembros`,
`comunicacion_categorias`, `comunicacion_reglas`, `conversaciones`,
`conversacion_participantes`, `mensajes`. Índices por `cuenta_id`. Se aplica en Supabase.
**Verificable:** migración aplicada + un par de filas de ejemplo por SQL.

### F0.2 — Capa de acceso + API en plataforma  · *M*  · (dep: F0.1)
`apps/plataforma/lib/comunicacion.ts` + endpoints `app/api/comunicacion/*`:
crear/listar categorías, grupos y reglas; crear conversación; enviar/listar mensajes;
bandeja del nodo. Auth de plataforma (dueño) + **validación de reglas en servidor**.
**Verificable:** crear conversación y mensaje vía API; las reglas bloquean lo no permitido.

### F0.3 — Directorio por vertical (contrato + adaptadores)  · *M*  · (puede ir en paralelo a F0.2)
Nuevo método `listarDirectorio(refExt)` en `VerticalAdapter`:
- ialimp / sivra → BD compartida (usuarios/limpiadoras).
- ia-rest → **nuevo endpoint** `GET /api/operador/directorio` (Bearer secret), aditivo.
Devuelve `[{ ref_persona, nombre, rol, email?, push?, canales_pref? }]`.
**Verificable:** plataforma lista personas/roles reales de cada negocio.

### F0.4 — Grupos dinámicos  · *M*  · (dep: F0.3)
Resolución de grupos `tipo='dinamico'` (p. ej. "participantes de un evento de ia-rest")
contra el directorio/puerto de la vertical de origen. Contrato de orígenes soportados.
**Verificable:** un grupo dinámico expande a la lista correcta de personas.

### F0.5 — UI hub `/comunicacion` (dueño)  · *L*  · (dep: F0.2, F0.3)
Bandeja del dueño: selector de destinatario en árbol **holding · negocio · grupo · persona**,
redactar mensaje (categoría libre), hilos de conversación, leído/no leído.
**Verificable:** el dueño manda un mensaje a un negocio / grupo / persona y lo ve en el hilo.

### F0.6 — UI de configuración (dueño)  · *M*  · (dep: F0.2)
Gestionar **categorías libres**, **grupos estáticos**, **matriz de reglas** (quién habla/encarga
con quién — el dueño es la autoridad) y etiquetas de rol.
**Verificable:** el dueño crea una categoría, un grupo y una regla, y se respetan.

### F0.7 — Notificaciones  · *M*  · (dep: F0.2)
Al enviar mensaje, disparar **email** (`core-email`) y/o **push** (`core-push`) según la
`canales_pref` de cada persona (in-app ya lo cubre la bandeja). Best-effort, no bloqueante.
**Verificable:** una persona con preferencia email recibe el correo; otra con push, el push.

## Estado — F0 COMPLETO (2026-06-11)
F0.1→F0.7 implementados y mergeados. Pendientes (no bloqueantes, para más adelante):
- **Matriz de reglas (UI)**: el modelo y la validación existen (F0.2); falta la pantalla para
  que el dueño edite reglas negocio↔negocio (por ahora el dueño puede con todos).
- **Push** + **preferencia de canal por persona**: F0.7 avisa por email (Resend, best-effort);
  push necesita un store de suscripciones a nivel de plataforma.
- **Directorio de sivra** (single-tenant): `listarDirectorio` sin implementar aún.
- Para que el email salga en producción: `RESEND_API_KEY` (+ `MAIL_FROM`) en el proyecto Vercel `plataforma`.

## Notas
- Todo en `apps/plataforma` salvo el endpoint nuevo de ia-rest en F0.3 (aditivo, no toca el resto).
- F0 **no** incluye Nivel B (pedidos internos) — eso es F2 del diseño.
- Primer vertical para sacar la bandeja "dentro de la app" (Nivel A en cada app) es **F1**, no F0.

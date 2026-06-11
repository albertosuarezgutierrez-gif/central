# DISEÑO — Comunicación multi-negocio (red interna de la casa de marcas)

> Estado: **diseño, no implementado.** Decidido con Alberto (2026-06-11).
> Objetivo: que un dueño con varios negocios (de sectores distintos) pueda **comunicarse
> con todos** y que los negocios **se comuniquen entre ellos**, **100% adaptativo** (sin
> nada cableado a las verticales actuales) y **disponible en todos lados** (hub + dentro
> de cada app), **configurable por el dueño**.

## 1. Concepto
La casa de marcas ya modela `Cuenta → Sociedad → Negocio` en `apps/plataforma`. Cada
**Negocio** se identifica por `(app, refExt)` (vertical + id del tenant en esa vertical) y
plataforma ya sabe hablar con cada vertical (BD compartida para ialimp/sivra; **puerto HTTP**
para ia-rest). Sobre esa base montamos una **red de comunicación interna** entre el dueño y
sus negocios, y entre los negocios entre sí.

Dos niveles (ambos en el diseño; implementación por fases):

- **Nivel A — Mensajería / avisos:** chat e inbox unificado + notificaciones (email/push).
  Canales: dueño→negocio(s), negocio→dueño, **negocio↔negocio**.
- **Nivel B — Pedidos internos (B2B entre negocios):** un negocio **encarga** un servicio a
  otro (p. ej. el restaurante pide limpieza a la empresa de limpieza; los pisos piden catering
  al restaurante). Se materializa como un **Encargo** en la vertical destino; aquí enganchan
  los módulos compartidos `module-presupuestos`, `module-agenda`, `module-proveedores`,
  `module-feedback`, `module-crm`.

## 2. Principio "100% adaptativo"
- Un **Negocio** es `(app, refExt)` — añadir un negocio/sector nuevo lo integra sin tocar
  código de comunicación (nada hardcodeado a ialimp/sivra/ia-rest).
- El **dueño configura** en plataforma: su árbol de negocios (ya existe) + la **matriz de
  reglas** (quién puede hablar/encargar a quién, qué categorías) + el **catálogo de servicios**
  que ofrece cada negocio (para el nivel B).
- "En todos lados": el hub vive en plataforma **y** cada vertical muestra su bandeja
  (vía un puerto de comunicación por app, como ya hace el god-panel con `/api/operador/*`).

## 3. Modelo de datos (BD compartida, schema de plataforma)
Multi-tenant estricto: **todo scoped por `cuenta_id`**.

- `comunicacion_nodos` — destinatarios direccionables. Granularidad (decidida): **holding**
  (todos), **negocio**, **grupo/sección**, **persona**. `(id, cuenta_id, tipo['cuenta'|'negocio'|
  'grupo'|'persona'], negocio_id NULL, grupo_id NULL, ref_persona NULL, rol NULL, nombre)`. Las
  personas **no se duplican**: se resuelven contra el **directorio** de cada vertical (§4.1).
  Ej.: el dueño manda a *todo el holding*, a *un negocio*, a *"participantes del catering"* (grupo)
  o a *un camarero concreto* (persona).
- `comunicacion_grupos` — secciones/grupos de destinatarios. Pueden ser **estáticos** (lista de
  personas/rol elegida por el dueño) o **dinámicos** (derivados de una vertical, p. ej. los
  participantes de un evento/catering de ia-rest). `(id, cuenta_id, negocio_id NULL, nombre,
  tipo['estatico'|'dinamico'], origen_ref NULL)`.
- `comunicacion_categorias` — categorías de conversación **definidas por el dueño** (decidido:
  libres). `(id, cuenta_id, nombre, color, orden)`. Sustituye a una lista fija.
- `comunicacion_reglas` — la matriz adaptativa: `(cuenta_id, origen_nodo_id, destino_nodo_id,
  puede_mensajear bool, puede_encargar bool, categoria_ids uuid[])`. Default configurable por el dueño.
- `conversaciones` — `(id, cuenta_id, categoria_id, titulo, creado_por_nodo, estado, created_at)`.
- `conversacion_participantes` — `(conversacion_id, nodo_id, rol)`.
- `mensajes` — `(id, conversacion_id, autor_nodo_id, cuerpo, adjuntos jsonb, leido_por jsonb,
  created_at)`.
- `encargos_internos` (Nivel B) — `(id, cuenta_id, origen_nodo_id, destino_nodo_id, servicio,
  estado, conversacion_id, presupuesto_ref, agenda_ref, feedback_ref)`. Se proyecta como un
  Encargo real en la vertical destino vía su adaptador.

## 4. Entrega "en todos lados" (puertos por vertical)

### 4.1 Directorio de personas/roles por vertical (para direccionar por persona)
Como se decide a **persona/rol**, cada vertical debe exponer **quién trabaja en cada negocio**
y con qué rol. Las personas viven en las tablas de cada app (ia-rest `personal`; ialimp
`usuarios_empresa`/`limpiadoras`; sivra usuarios/limpiadoras). Se añade una capacidad al
adaptador/puerto: `listarDirectorio(refExt) → [{ ref_persona, nombre, rol, email?, push?,
canales_pref? }]`. plataforma **no duplica** el padrón; lo lee bajo demanda (ia-rest por HTTP,
ialimp/sivra por BD). Cada persona tiene su **preferencia de canal** (decidido: configurable
100% — hay quien tiene app, quien solo email, quien ambos): in-app / email / push o combinación.

### 4.2 Bandejas y puertos
- **Hub central** en plataforma: `/comunicacion` (dueño) + integrado en `/admin` (operador).
- **Puerto de comunicación por vertical** (mismo patrón que `OPERADOR_SHARED_SECRET`):
  - ia-rest → `GET/POST /api/operador/mensajes` (Bearer secret). Bandeja dentro de ia-rest.
  - ialimp / sivra → BD compartida directa (la app lee/escribe `mensajes` scoped por su `refExt`).
- **Notificaciones**: `core-email` (resumen/aviso) + `core-push` (tiempo real). Reutiliza la
  infраestructura existente; no se inventa transporte nuevo.

## 5. Seguridad / multi-tenant
- Todo filtrado por `cuenta_id`; un negocio solo ve las conversaciones donde participa.
- Las **reglas** se validan en servidor antes de crear conversación/mensaje/encargo.
- ia-rest por puerto HTTP con secreto (como el god-panel); ialimp/sivra por BD compartida.
- Adjuntos en `core-storage` (signed URLs), scoped por cuenta/negocio.

## 6. Fases de implementación
- **F0 — Núcleo en plataforma:** modelo de datos + matriz de reglas (UI mínima) + hub
  `/comunicacion` con bandeja dueño↔negocio y negocio↔negocio (solo plataforma, sin salir aún
  a cada app). Entregable visible y útil ya.
- **F1 — Nivel A completo ("en todos lados"):** notificaciones email/push + puerto de mensajes
  por vertical → bandeja **dentro de cada app** (empezando por una, p. ej. ialimp).
- **F2 — Nivel B (pedidos internos):** `encargos_internos` + proyección a Encargo en la vertical
  destino, con `module-presupuestos` + `module-agenda` + `module-feedback`. El marketplace interno.
- **F3 — IA (asistente de la casa de marcas):** enruta/resume/propone ("que limpieza vaya al
  restaurante el viernes" → crea el encargo). Reusa `core-ai`.

## 7. Decisiones tomadas
- Profundidad: **A + B**, diseño completo, implementación por fases. (A primero.)
- Alcance: **genérico/adaptativo** desde el modelo (un Negocio = `(app, refExt)`).
- Ubicación: **hub en plataforma + dentro de cada app**, **100% configurable por el dueño**.
- Categorías de conversación: **libres**, las define el dueño (`comunicacion_categorias`).
- Identidad de personas: **directorio por vertical** (§4.1), sin duplicar padrón.
- Destinatario: granularidad **holding · negocio · grupo/sección · persona** (`comunicacion_grupos`).
- Autorización: **el dueño es la autoridad** — controla quién puede comunicarse/encargar con quién.
- Canales: **configurables 100% por persona** (in-app / email / push o combinación).
- Roles: **mixto** — roles reales de cada vertical (vía directorio) **+** etiquetas libres del dueño.
- Grupos: **dinámicos desde F0** (además de estáticos) — p. ej. "participantes del catering" de
  un evento de ia-rest, resueltos vía el directorio/puerto de la vertical.

## 8. Diseño cerrado — listo para F0
Todas las decisiones de modelo están tomadas (§7). F0 (núcleo en plataforma) incluye: tablas
(`comunicacion_nodos/grupos/categorias/reglas/conversaciones/participantes/mensajes`), matriz de
reglas controlada por el dueño, granularidad holding/negocio/grupo/persona con grupos estáticos
y dinámicos, categorías libres, roles mixtos, y la capacidad `listarDirectorio` en el adaptador
de cada vertical. Única decisión menor diferida: **primer vertical** para la bandeja "dentro de
la app" en F1 (sugerencia: ialimp).

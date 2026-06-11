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

- `comunicacion_nodos` — participantes de la red. Un nodo es el **dueño** (Cuenta) o un
  **Negocio**. `(id, cuenta_id, tipo['cuenta'|'negocio'], negocio_id NULL, nombre)`.
- `comunicacion_reglas` — la matriz adaptativa: `(cuenta_id, origen_nodo_id, destino_nodo_id,
  puede_mensajear bool, puede_encargar bool, categorias text[])`. Default configurable por el dueño.
- `conversaciones` — `(id, cuenta_id, tipo['directiva'|'aviso'|'pedido'], titulo, creado_por_nodo,
  estado, created_at)`.
- `conversacion_participantes` — `(conversacion_id, nodo_id, rol)`.
- `mensajes` — `(id, conversacion_id, autor_nodo_id, cuerpo, adjuntos jsonb, leido_por jsonb,
  created_at)`.
- `encargos_internos` (Nivel B) — `(id, cuenta_id, origen_nodo_id, destino_nodo_id, servicio,
  estado, conversacion_id, presupuesto_ref, agenda_ref, feedback_ref)`. Se proyecta como un
  Encargo real en la vertical destino vía su adaptador.

## 4. Entrega "en todos lados" (puertos por vertical)
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

## 8. Abierto / a confirmar antes de F0
- ¿Roles dentro de un negocio (que un empleado concreto reciba el mensaje) o basta a nivel de
  negocio en F0?
- ¿Categorías de conversación fijas (directiva/aviso/pedido) o libres definidas por el dueño?
- ¿Primer vertical para sacar la bandeja "dentro de la app" en F1? (sugerencia: ialimp).

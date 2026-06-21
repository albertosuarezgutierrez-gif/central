# Preaviso de marcha cocina ⇄ sala — Diseño

> Vertical: **`apps/ia-rest`** (Voice POS hostelería). Schema BD: `iarest` (Supabase compartido).
> Fecha: 2026-06-21 · Estado: diseño aprobado, pendiente de plan de implementación.

## Problema / idea

Cuando un plato está a punto de salir de cocina (p. ej. un segundo de carne caliente),
el camarero necesita **desbarasar el plato anterior y montar el cubierto/plato correcto
ANTES** de que la comida salga. Hoy no hay nada que coordine ese momento: el camarero se
entera cuando el plato ya está hecho y enfriándose en el pase.

**Objetivo:** que la mesa esté montada justo a tiempo, de modo que cuando cocina emplata,
el plato va directo a la mesa sin esperar.

## Concepto en una frase

Cocina avisa "esto sale ya" → el camarero de esa mesa recibe el aviso, desbarasa y monta
→ confirma "mesa lista" → cocina lo ve y emplata sin que la comida espere. Un círculo
cerrado entre `/kds` (cocina) y `/edge` (camarero).

## Flujo

```
COCINA (/kds)                          SALA (/edge)
  │ pulsa "📣 Preaviso" en la mesa
  │  (cuando le faltan ~2 min)
  ├──────────── push + Realtime ──────►│ aviso: "Mesa 7: salen
  │ tarjeta → "Preaviso enviado ⏳"     │  2 Entrecot, 1 Lubina"
  │                                     │ camarero monta la mesa
  │◄──────────── Realtime ─────────────┤ pulsa "Mesa lista ✅"
  │ tarjeta → "Mesa lista ✅, emplatar" │
  │ marca listo → sigue flujo normal    │
```

## Decisiones de diseño

### Disparador — híbrido por fases, empezando manual
- **Fase 1 (este spec):** botón manual "📣 Preaviso" en `/kds`. Cocina manda; es quien
  mejor sabe cuándo faltan ~2 min para emplatar. Cero adivinación, reutiliza la infra de
  push existente.
- **Fase 2 (futuro, NO en este spec):** automático por tiempos aprendidos. El botón de la
  Fase 1 es justo lo que genera esos datos: registramos cuánta antelación dio cada preaviso
  (`listo_at - emitido_at`). Con datos fiables, el sistema puede avisar solo y dejar el botón
  como refuerzo.

Descartado "al marcar listo": no es un preaviso real (el plato ya está hecho). Descartado
"100% automático desde el día 1": depende de datos de tiempo por plato que aún no existen.

### Contenido del aviso — nombra los platos
- El aviso nombra los platos que salen ("Mesa 7: salen 2 Entrecot, 1 Lubina"). Esa info ya
  está en la comanda → **cero configuración**. El camarero, profesional, deduce el menaje.
- **Mejora opcional posterior (Fase 2):** flag de menaje por producto ("requiere cuchillo de
  carne / plato caliente") que enriquece el aviso. No bloquea nada y no entra en v1.

Descartado "genérico" ("viene comida"): demasiado pobre para justificar una notificación.
Descartado "específico" en v1: obliga a configurar menaje por producto = fricción de alta;
si no se rellena, el aviso sale vacío.

### Dirección — dos direcciones (círculo cerrado)
- Cocina avisa → camarero confirma "mesa lista" → cocina ve la confirmación y emplata.
- Evita que la comida se enfríe esperando a que el camarero monte. Pide un toque extra al
  camarero, pero es el que cierra el valor de la idea.

## Componentes (reusando infra existente)

### 1. Tabla `preavisos` (schema `iarest`)

```sql
CREATE TABLE IF NOT EXISTS iarest.preavisos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  UUID NOT NULL,
  comanda_id      UUID NOT NULL,            -- la mesa/comanda que va a salir
  mesa            TEXT,                     -- desnormalizado para el aviso ("7")
  platos          JSONB NOT NULL,           -- snapshot: [{nombre, cantidad}]
  estado          TEXT NOT NULL DEFAULT 'enviado',  -- 'enviado' | 'mesa_lista' | 'servido' | 'cancelado'
  emitido_por     TEXT,                     -- rol/id de cocina que pulsó
  emitido_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  mesa_lista_at   TIMESTAMPTZ,
  mesa_lista_por  UUID,                     -- camarero que confirmó
  listo_at        TIMESTAMPTZ,              -- cuándo cocina marcó listo (dato Fase 2)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_preavisos_restaurante ON iarest.preavisos(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_preavisos_comanda ON iarest.preavisos(comanda_id);
```

- RLS: `select/insert/update` por `restaurante_id` (patrón `current_setting('app.restaurante_id')`)
  + `service_role_all`. Columnas en español (convención del proyecto).
- `estado` con CHECK sobre los 4 valores exactos.

### 2. API `/api/preaviso`
- `POST` (desde cocina): crea el preaviso, hace snapshot de los platos de la comanda, dispara
  el push al camarero asignado a la mesa. Guard dedup: si ya hay un preaviso `enviado` para esa
  comanda/marcha, no crea otro.
- `PATCH` (desde sala): el camarero confirma → `estado='mesa_lista'`, `mesa_lista_at`,
  `mesa_lista_por`. Notifica de vuelta a cocina por Realtime.
- Patrón obligatorio: `getSession()` + `createServerClient()` + `getRestauranteId()`.
  Toda sesión emitida ya va firmada; aquí solo se consume.

### 3. Push al camarero asignado a la mesa
- Reutiliza la infra de `qr-call-waiter` / `push-send`. El destinatario es el camarero de la
  comanda (`comandas.camarero`).
- **Coordinación interna → web push, NUNCA email/Telegram** (regla del proyecto:
  operador→Telegram, usuarios finales→email, alertas internas→push).

### 4. UI `/kds` (cocina)
- Botón "📣 Preaviso" por mesa/marcha en la tarjeta de la comanda.
- Estados visibles en la tarjeta: "Preaviso enviado ⏳" → "Mesa lista ✅, emplatar".

### 5. UI `/edge` (camarero)
- Banner de aviso entrante ("Mesa 7: salen 2 Entrecot, 1 Lubina — monta la mesa") + botón
  "Mesa lista".
- Realtime por el canal `kds-{restaurante_id}` que ya existe (suscripción a `iarest.preavisos`,
  `schema: 'iarest'`).

## Errores / casos límite

- **Camarero sin push activo:** el aviso aparece igual en `/edge` por Realtime; cocina ve que
  el preaviso sigue en `enviado` (sin confirmar) → sabe que tiene que mirar.
- **Dedup:** un solo preaviso activo por comanda/marcha (guard en el POST).
- **Comanda cancelada:** el preaviso pasa a `cancelado`.
- **Multi-tenant:** todas las queries filtran por `restaurante_id` sin excepción.

## Fuera de alcance (YAGNI en v1)

- Disparador automático por tiempos aprendidos (Fase 2).
- Menaje específico por producto (Fase 2, opcional).
- Escalado/alarma si nadie confirma en X minutos (se puede apoyar luego en el supervisor de
  tiempos existente).

## Verificación

- `npx tsc --noEmit` con 0 errores (pre-push obligatorio del proyecto).
- Flujo manual: cocina pulsa preaviso → llega push + banner en `/edge` → camarero confirma →
  cocina ve "mesa lista". Comprobar dedup y cancelación.
- Migración SQL: `ALTER`/`CREATE ... IF NOT EXISTS`, RLS habilitada, índice en `restaurante_id`.

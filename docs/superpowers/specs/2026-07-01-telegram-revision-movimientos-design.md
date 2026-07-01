# Spec: Revisión de movimientos por Telegram con IA contextual

**Fecha:** 2026-07-01  
**Rama:** `claude/card-movement-import-check-1gxb09`

## Qué construimos

Tras importar un extracto de tarjeta, el bot de Telegram envía un resumen y, para cada movimiento ambiguo, un mensaje con botones de clasificación de deducibilidad. La IA usa el contexto de movimientos cercanos para sugerir clasificaciones con explicación. El usuario confirma o corrige, y el sistema aprende.

---

## Componentes

### 1. Migración de BD

Nueva columna en `movimientos_bancarios`:

```sql
ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS propiedad_id TEXT;
```

`propiedad_id` es el `propertyId` de Smoobu (ej. `prop_house_sevillana`). Nullable — solo se rellena si el movimiento está asignado a un piso concreto.

Fichero: `prisma/sql/2026-07-01_mov_propiedad_id.sql`

---

### 2. Selección de movimientos dudosos

Función `getMovimientosDudosos(cuentaId, cuentaBancariaIds, mes)` en `lib/banca.ts`:

- Selecciona movimientos de las cuentas del extracto recién importado, del mes dado
- Filtra: `requiere_revision = true OR (destino = 'seguros' AND NOT destino_confirmado AND banco != 'BBVA')`
- Excluye traspasos internos y movimientos ya confirmados
- Devuelve máx. 15 por import (los de mayor importe absoluto primero)

---

### 3. Sugerencia IA contextual

Función `sugerirDestinoConContexto(movimiento, movimientosDelMes)` en `lib/agente-movimientos.ts` (fichero nuevo):

**Lógica:**
1. Busca en `movimientosDelMes` movimientos con destino ya confirmado en un rango de ±10 días
2. Si hay un movimiento de mayor importe con destino `turistico_pisos` y el concepto del movimiento actual encaja semánticamente (montaje, transporte, instalación, entrega…) → confianza alta
3. Llama a `aiComplete` con el contexto serializado (concepto actual + movimientos cercanos con sus destinos) para que el LLM razone y devuelva `{ destino, confianza, explicacion }`
4. Si confianza ≥ 0.8 → sugerencia con botón "Sí, confirmar"; si < 0.8 → muestra las 3 opciones

**Prompt IA:** dado el movimiento X y estos movimientos cercanos del mismo mes con sus destinos confirmados, ¿cuál es el destino más probable de X? Responde con destino (`turistico_pisos`|`seguros`|`personal`), confianza (0-1) y una explicación corta en español para mostrar al usuario.

---

### 4. Mensajes Telegram

Extensión de `enviarResumenTarjeta(cuentaId, cuentaBancariaIds, mes)` en `lib/banca.ts`:

**Mensaje 1 — resumen:**
```
📥 Tarjeta {mes} importada — {n} movimientos
✅ {n_auto} clasificados automáticamente
❓ {n_dudosos} necesitan revisión

Total deducible: {x}€ | No deducible: {y}€
```

**Mensaje 2..N — uno por movimiento dudoso:**

*Con sugerencia IA (confianza ≥ 0.8):*
```
❓ {CONCEPTO} · {fecha} · {importe}€

🤖 {explicacion_ia}

  [✅ Sí, {destino_label}]  [✏️ Cambiar]  [⏭️ Saltar]
```

*Sin sugerencia (confianza < 0.8):*
```
❓ {CONCEPTO} · {fecha} · {importe}€

  [✅ Pisos — deducible]
  [✅ Correduría — deducible]
  [❌ Personal — no deducible]
  [⏭️ Saltar]
```

**Mensaje de seguimiento — si pulsa "Pisos" o "Sí, Pisos":**
```
📍 ¿Para qué piso?

  [House Sevillana]  [Luxury Busto]
  [Busto Reform]     [Dúplex]  [Todos]
```

**Confirmación final:**
```
✅ {CONCEPTO} → {destino_label} · {piso?}
   {aprendizaje_msg}
```

Donde `aprendizaje_msg` es:
- Si es comercio nuevo: "Regla guardada para futuros cargos de {comercio}"
- Si ya tenía regla pero la cambia: "Regla actualizada"
- Si fue sugerencia IA confirmada: "IA afinada ✓"

---

### 5. Callbacks Telegram — prefijo `mov_`

Manejados en `app/api/sivra/mensajes/telegram-webhook/route.ts`:

| Callback | Acción |
|---|---|
| `mov_pisos:<id>` | Envía mensaje de selección de piso |
| `mov_correduria:<id>` | Actualiza destino → `seguros`, confirma, aprende regla, envía confirmación |
| `mov_personal:<id>` | Actualiza destino → `personal`, confirma, aprende regla, envía confirmación |
| `mov_saltar:<id>` | No hace nada, envía "⏭️ Saltado" |
| `mov_cambiar:<id>` | Envía el mensaje con las 3 opciones (override de sugerencia IA) |
| `mov_prop:<id>:<propId>` | Guarda `propiedad_id`, actualiza destino → `turistico_pisos`, confirma, aprende regla, envía confirmación |

**Aprendizaje:** tras confirmar, inserta/actualiza en `banca_destino_reglas` usando el nombre del comercio limpio (sin "COMPRA EN ", normalizado a mayúsculas, máx. 40 chars) como clave.

---

### 6. Impacto en P&L por piso

`lib/sivra/pl-mensual.ts` — en el cálculo de costes por piso:

- Movimientos con `propiedad_id` definido: se suman directamente al piso correspondiente (sin reparto por fórmula)
- Movimientos con `destino = 'turistico_pisos'` pero sin `propiedad_id`: se reparten por la fórmula existente (sin cambio)

---

## Ficheros afectados

| Fichero | Cambio |
|---|---|
| `prisma/sql/2026-07-01_mov_propiedad_id.sql` | Nueva migración |
| `lib/banca.ts` | Extender `enviarResumenTarjeta` + añadir `getMovimientosDudosos` |
| `lib/agente-movimientos.ts` | Fichero nuevo — `sugerirDestinoConContexto` |
| `app/api/sivra/mensajes/telegram-webhook/route.ts` | Handlers `mov_*` |
| `lib/sivra/pl-mensual.ts` | Usar `propiedad_id` cuando está disponible |

---

## Lo que NO incluye esta versión

- Foto de ticket por Telegram (backlog agente facturas, Fase 3)
- Revisión de movimientos de cuenta corriente (solo tarjeta por ahora)
- UI en `/finanzas` para ver `propiedad_id` asignado (ya existe la tabla, se puede añadir después)
- Notificación de movimientos revisados en el dashboard

---

## Tests mínimos

- `sugerirDestinoConContexto`: caso con contexto IKEA+montaje → confianza alta; caso sin contexto → confianza baja
- Callbacks `mov_pisos` → `mov_prop` en secuencia: verifica que `propiedad_id` y `destino` quedan bien en BD
- `getMovimientosDudosos`: máx. 15, ordenados por importe absoluto desc

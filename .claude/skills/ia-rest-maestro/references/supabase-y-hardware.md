# ia.rest — Patrones Supabase y Hardware Bridge (Secciones 4-5)

# ═══════════════════════════════════════════════
# SECCIÓN 4 — MÓDULO SUPABASE PATTERNS
# ═══════════════════════════════════════════════

# ia.rest — Patrones Supabase & Next.js

Lee este archivo ANTES de escribir cualquier código de API route, Edge Function, o migración SQL en ia.rest.

---

## ⚠️ Reglas críticas (errores frecuentes)

### 1. API routes → SIEMPRE `createServerClient()` + `getSession()` + `getRestauranteId()`

```typescript
// ✅ CORRECTO — patrón completo obligatorio en cualquier API route
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: Request) {
  const supabase = createServerClient()
  const session = await getSession(supabase)
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = await getRestauranteId(session)
  // usar restauranteId en todas las queries
}

// ❌ ERROR — causa 401 en producción
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key)

// ❌ PATRÓN OBSOLETO — nunca usar
const token = req.headers.get('x-session-token')
// acceder sesiones_activas directamente sin getSession()
```

**Por qué:** `createClient` directo no envía cookies de sesión. `getSession()`/`getRestauranteId()` de `@/lib/session` son los únicos wrappers de auth del proyecto.

---

### 2. Dynamic routes Next.js App Router → `await params`

```typescript
// ✅ CORRECTO — params siempre Promise en App Router
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}

// También en API routes con segmento dinámico
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}

// ❌ ERROR — params síncrono
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params  // TypeError en runtime
}
```

---

### 3. `comandas.estado` — valores exactos

```typescript
// ✅ CORRECTO
estado: 'nueva'      // comanda recién creada
estado: 'en_curso'   // items en preparación
estado: 'lista'      // cocina marcó como lista
estado: 'cerrada'    // cobrada y cerrada

// ❌ ERROR — CHECK constraint falla
estado: 'pendiente'  // no existe
estado: 'abierta'    // no existe
```

---

### 4. `comanda_items` — campos obligatorios

```typescript
// ✅ SIEMPRE incluir nombre, restaurante_id, y formato_nombre si aplica
const item = {
  comanda_id: '...',
  producto_id: '...',
  nombre: producto.nombre,           // OBLIGATORIO — desnormalizado para historial
  restaurante_id: restauranteId,     // OBLIGATORIO — RLS lo exige
  cantidad: 2,
  precio_unitario: 8.50,
  formato_nombre: 'media',           // 'tapa' | 'media' | 'ración' | null
}

// ❌ ERROR — INSERT falla silenciosamente o viola RLS
const item = { comanda_id, producto_id, cantidad }
```

---

### 5. Patrón Turnos — 2 tipos coexisten (CRÍTICO)

```typescript
// Turno de SERVICIO (sala/mesa) → camarero_id IS NULL
// Turno de FICHAJE (personal)   → camarero_id = uuid

// ✅ SIEMPRE filtrar turno activo de SERVICIO así:
const { data: turno } = await supabase
  .from('turnos')
  .select('*')
  .eq('restaurante_id', restauranteId)
  .eq('estado', 'activo')
  .is('camarero_id', null)    // IS NULL — no .eq('camarero_id', null)
  .maybeSingle()              // maybeSingle — no .single() (puede no haber turno)

// ❌ ERROR — mata fichajes o explota
.eq('camarero_id', null)   // sintaxis incorrecta en Supabase JS para IS NULL
.single()                  // lanza error si no hay turno activo

// Camarero ficha desde /edge — POST /api/turnos/fichar
// Owner ve/modifica fichajes desde /owner → Fichajes
```

---

### 6. Guard impresión — reglas absolutas

```typescript
// ✅ CORRECTO — courier-route genera print_jobs al recibir comanda
// POST /api/comanda → courier automáticamente genera print_jobs → imprime

// ❌ NUNCA llamar /api/marchar tras /api/comanda
// El courier YA genera el push marchar internamente
// Llamarlo manualmente DUPLICA la impresión

// Guard dedup activo: 30s filtrando payload->>'tipo'='marchar'
// Si ves duplicados: verificar que no hay doble llamada a /api/marchar
```

---

## Patrón RLS — tabla nueva

Toda tabla nueva necesita al menos estas políticas:

```sql
-- Habilitar RLS
ALTER TABLE nueva_tabla ENABLE ROW LEVEL SECURITY;

-- SELECT: solo ve sus datos
CREATE POLICY "select_own" ON nueva_tabla
  FOR SELECT USING (restaurante_id = current_setting('app.restaurante_id')::uuid);

-- INSERT: solo inserta en su restaurante
CREATE POLICY "insert_own" ON nueva_tabla
  FOR INSERT WITH CHECK (restaurante_id = current_setting('app.restaurante_id')::uuid);

-- UPDATE: solo modifica sus datos
CREATE POLICY "update_own" ON nueva_tabla
  FOR UPDATE USING (restaurante_id = current_setting('app.restaurante_id')::uuid);

-- Service role lo puede todo (para Edge Functions)
CREATE POLICY "service_role_all" ON nueva_tabla
  USING (auth.role() = 'service_role');
```

> ia.rest usa `current_setting('app.restaurante_id')` para multi-tenant, no `auth.uid()`.

---

## Patrón Edge Function (Deno)

```typescript
// supabase/functions/mi-funcion/index.ts
// v1 — descripción de qué hace

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // SIEMPRE service role en EFs
  )

  try {
    const body = await req.json()
    // lógica aquí
    return new Response(JSON.stringify({ ok: true, data: {} }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

**Reglas EF:**
- Siempre usar `SUPABASE_SERVICE_ROLE_KEY` (no `ANON_KEY`) — necesitan escribir sin RLS
- Incrementar versión en el comentario al desplegar: `// v1`, `// v2`...
- CORS: siempre incluir el bloque OPTIONS

---

## RPCs importantes

### `validate_pin_with_rate_limit`
```typescript
const { data, error } = await supabase.rpc('validate_pin_with_rate_limit', {
  p_restaurante_id: restauranteId,
  p_pin: pin,
  p_ip_address: ipAddress
})
// Retorna: { valid: boolean, rol: string, camarero_id: uuid, blocked_until: timestamp }
```

### `rotate_kds_token`
```typescript
const { data } = await supabase.rpc('rotate_kds_token', {
  p_restaurante_id: restauranteId
})
// Retorna nuevo token para el KDS
```

---

## Multi-tenant — regla absoluta

**Siempre** filtrar por `restaurante_id`. Sin excepción.

```typescript
// ✅ CORRECTO
const { data } = await supabase
  .from('comandas')
  .select('*')
  .eq('restaurante_id', restauranteId)  // SIEMPRE
  .eq('estado', 'nueva')

// ❌ PELIGROSO — devuelve datos de todos los restaurantes
const { data } = await supabase
  .from('comandas')
  .select('*')
  .eq('estado', 'nueva')
```

---

## Realtime subscriptions

```typescript
// Patrón para escuchar comandas nuevas en KDS
const channel = supabase
  .channel(`kds-${restauranteId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'comandas',
      filter: `restaurante_id=eq.${restauranteId}`
    },
    (payload) => {
      setComandas(prev => [...prev, payload.new])
    }
  )
  .subscribe()

// Cleanup
return () => supabase.removeChannel(channel)
```

---

## pg_cron jobs activos

| Job # | Función | Frecuencia | Qué hace |
|---|---|---|---|
| 6 | alerta-ritmo-cron | Cada 2 min | Detecta mesas lentas y envía alertas |

### Añadir nuevo job de cron
```sql
SELECT cron.schedule(
  'nombre-del-job',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/mi-funcion',
      headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )
  $$
);
```

---

## Migraciones SQL — checklist

Antes de aplicar una migración:
- [ ] `ALTER TABLE` en lugar de recrear tablas (preserva datos)
- [ ] `IF NOT EXISTS` en columnas nuevas
- [ ] RLS habilitado + políticas creadas si es tabla nueva
- [ ] Índice en `restaurante_id` para performance
- [ ] Nombres de columnas en español (convención del proyecto)

```sql
-- Patrón añadir columna
ALTER TABLE mi_tabla
ADD COLUMN IF NOT EXISTS nueva_columna TEXT,
ADD COLUMN IF NOT EXISTS otra_columna BOOLEAN DEFAULT false;

-- Índice estándar
CREATE INDEX IF NOT EXISTS idx_mi_tabla_restaurante
ON mi_tabla(restaurante_id);
```

---

## Tablas nuevas añadidas (mayo 2026)

```
producto_formatos      — formatos T/M/R por producto (tapa/media/ración)
storefront_config      — configuración canales de venta online
pedidos_online         — pedidos del storefront (4 canales)
clientes_fiscales      — clientes con NIF para facturas personalizadas
facturas_cliente       — facturas emitidas a clientes con NIF propio
documentos_escaneados  — audit de SmartScanFAB (quién/tipo/confianza/estado)
voice_profiles         — perfiles de voz Azure (pendiente AZURE_SPEECH_KEY)
ia_training_log        — registro de inferencias por capa (patron/nim_8b_fast/claude_api)
cuentas                — multi-cuenta (N restaurantes por operador)
sugerencias            — sugerencias de mejora del personal
contract_acceptances   — aceptación contrato SaaS v1.0
candidatos             — candidatos RRHH
cv_analisis            — análisis IA de CVs (score 0-100, 9 roles hostelería)
```

---

## Patrón owner/jefe_sala — hooks en condicional

```typescript
// En componentes /owner y /jefe, sh() es función
// ✅ CORRECTO — sh es siempre función
const sh = (): Record<string, string> => ({ ... })
// llamar siempre como sh()

// Para hooks dentro de condicional → sub-componente DetalleView
// Nunca llamar hooks condicionalmente en el componente padre
function DetalleView({ id }: { id: string }) {
  const [data, setData] = useState(null)  // hook aquí, dentro del sub-componente
  // ...
}
```

---

## Errores frecuentes y soluciones

| Error | Causa | Fix |
|---|---|---|
| `401 Unauthorized` en API route | `createClient` directo | Usar `createServerClient()` + `getSession()` |
| `TypeError: params is not iterable` | dynamic route sin `await params` | `const { id } = await params` |
| INSERT silencioso sin datos | RLS bloqueando sin error | Verificar `restaurante_id` en payload |
| `violates check constraint` | `estado: 'pendiente'` | Usar `estado: 'nueva'` |
| `null value in column nombre` | comanda_items sin nombre | Incluir `nombre: producto.nombre` |
| Realtime no llega a KDS | Canal incorrecto | Verificar `filter` con `restaurante_id` |
| Impresión duplicada | Doble llamada a /api/marchar | Nunca llamar /api/marchar tras /api/comanda |
| Turno mata fichajes | .eq('camarero_id', null) | Usar .is('camarero_id', null) + .maybeSingle() |
| Hook en condicional error | useState/useEffect en if | Extraer a sub-componente DetalleView |

# ═══════════════════════════════════════════════
# SECCIÓN 5 — MÓDULO HARDWARE BRIDGE
# ═══════════════════════════════════════════════

# ia.rest — Hardware Bridge

Lee este archivo ANTES de tocar cualquier código relacionado con impresión, Cashdro o bridge.

---

## Arquitectura completa

```
Camarero confirma comanda
  → courier-route v16 (Edge Function)
    → bridge-agent v12 (Edge Function)
      → /heartbeat · /commands · /result · /log-error
        ↑
        bridge-local.js v6.0.1 (Node.js, polling TCP puro cada 3s)
        corriendo en: Android+Termux | PC/servidor | RPi Zero 2W
          → impresora ESC/POS TCP:9100
          → Cashdro HTTP API (localhost LAN) — pendiente módulo T3
```

---

## bridge-local.js v6.0.1

Script Node.js que corre en el hardware local del restaurante.
**No usa WebSockets ni push** — polling puro al bridge-agent cada 3 segundos.

### Novedades v6.0.1
- Fix retry+backoff en fallos de red
- Stale recovery: reintenta comandos atascados tras 90s sin respuesta
- Cloud Edition: soporta Supabase Realtime WSS además de polling HTTP

### Descarga
APK Android: `www.iarest.es/descargar`

### APK v2.0 (mayo 2026)
- Firmada RSA2048/SHA384
- versionCode=11, 4.4MB
- Incluye bridge-local.js embebido con Termux
- Permisos completos (PTT hardware, audio, red)

### Endpoints que consume (bridge-agent)
| Endpoint | Método | Qué hace |
|---|---|---|
| `/heartbeat` | POST | Registra que el bridge está vivo. Responde con comandos pendientes |
| `/commands` | GET | Descarga cola de comandos pendientes |
| `/result` | POST | Reporta resultado de ejecución (ok/error) |
| `/log-error` | POST | Envía errores al log central |

### connection_type
El campo `connection_type` en `impresoras` acepta exactamente estos valores:
```
tcp          → impresora IP directa (TCP:9100)
ip_local     → impresora en LAN vía IP local
usb_bridge   → impresora USB a través del bridge
```

### Protocolo ESC/POS
- Puerto TCP: **9100** (estándar térmicas Star/Epson/XPrinter)
- El bridge-local.js abre socket TCP raw y escribe bytes ESC/POS directamente
- **No CloudPRNT** para bridge local (CloudPRNT es para impresoras con WiFi propio)

---

## Bugs de impresión corregidos (mayo 2026)

| Bug | Descripción | Fix |
|---|---|---|
| B1 | courier sin `restaurante_id` en `courier` field | Añadido campo obligatorio |
| B2 | `zona_tipo` incorrecto en print_jobs | Normalizado a valores exactos |
| B3 | Dedup marchar fallaba | Guard 30s filtrando `payload->>'tipo'='marchar'` |

**Regla absoluta impresión:**
- NUNCA llamar `/api/marchar` tras `/api/comanda`
- El courier genera print_jobs automáticamente al recibir la comanda
- Llamar /api/marchar manualmente DUPLICA la impresión

---

## Tablas de BD relevantes

### `impresoras`
```sql
id, restaurante_id, nombre, tipo,
ip_address,           -- IP local de la impresora
connection_type,      -- 'tcp' | 'ip_local' | 'usb_bridge'
puerto (default 9100),
seccion_cocina_id,    -- qué partida imprime
activa BOOLEAN
```
> RLS activa — siempre filtrar por `restaurante_id`

### `bridge_tokens`
Token de autenticación del bridge-local.js. Rotación manual desde `/owner → Impresoras`.
```sql
id, restaurante_id, token (uuid),
activo BOOLEAN,
created_at, last_seen_at
```

### `bridge_devices`
Registro de dispositivos bridge activos (heartbeat).
```sql
id, restaurante_id, bridge_token_id,
device_name, ip_local,
last_heartbeat_at, version
```

### `bridge_commands`
Cola de comandos pendientes para el bridge.
```sql
id, restaurante_id, impresora_id,
payload JSONB,   -- { type: 'print', data: '...ESC/POS base64...' }
status,          -- 'pending' | 'sent' | 'done' | 'error'
created_at, executed_at
```

---

## Hardware recomendado

| Opción | Coste | Pros | Contras |
|---|---|---|---|
| **Android + Termux** | 0 € | El propio móvil del local, APK lista | Reinicio manual si se mata |
| **PC/servidor existente** | 0 € | Siempre encendido | Depende de PC del restaurante |
| **RPi Zero 2W** | ~25 € | Dedicado, silencioso, bajo consumo | Configuración inicial |

### Termux (Android) — setup mínimo
```bash
pkg install nodejs
node bridge-local.js --token <bridge_token> --url https://wswbehlcuxqxyinousql.supabase.co/functions/v1/bridge-agent
```

### RPi Zero 2W — setup producción
```bash
# En RPi OS Lite
curl -fsSL https://deb.nodesource.com/setup_20.x | bash
apt install nodejs
# bridge-local.js como systemd service para auto-start
```

---

## Cashdro (Módulo T3 — pendiente)

Cashdro es un cajón de efectivo inteligente con **HTTP API local en LAN**.

### Estado actual
- ✅ Cajón normal ESC/POS (apertura por pulso) funciona vía bridge
- 🔴 Cashdro HTTP API (gestión de efectivo, conteo, cierre) — **pendiente módulo T3**

### Cashdro HTTP API (cuando se implemente)
```
Base URL: http://<ip-cashdro-local>/api/v1
Métodos relevantes:
  POST /open      → abrir cajón
  GET  /status    → estado efectivo (billetes, monedas)
  POST /close     → cierre de caja con conteo
```
- La IP del Cashdro se configura en `restaurantes.cashdro_ip` (columna a añadir cuando T3)
- Las llamadas van desde bridge-local.js, **nunca desde Vercel** (es red local)

### Patrón de integración
```typescript
// bridge-local.js — handler de comando tipo 'cashdro_open'
case 'cashdro_open':
  const res = await fetch(`http://${config.cashdroIp}/api/v1/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: cmd.payload.reason })
  })
  return { ok: res.ok, status: res.status }
```

---

## CloudPRNT (alternativa a bridge local)

Para impresoras Star con WiFi integrado. **No necesita bridge-local.js**.

- Impresora hace polling a Supabase Edge Function directamente
- Protocolo: HTTPS con autenticación por `mac_address`
- Tabla relevante: `impresoras` con `tipo='cloudprnt'` y `mac_address`
- EF: `courier-route` gestiona la cola CloudPRNT

---

## Diagnóstico rápido

| Síntoma | Causa probable | Fix |
|---|---|---|
| "Bridge caído" en `/owner` | bridge-local.js no hace heartbeat | Reiniciar script en el hardware |
| Impresora no responde | IP incorrecta o puerto 9100 cerrado | Verificar IP en `impresoras.ip_address` |
| `connection_type` no reconocido | Valor incorrecto en BD | Solo acepta `tcp` / `ip_local` / `usb_bridge` |
| Token inválido | Token rotado o expirado | Generar nuevo token en `/owner → Impresoras` |
| Cashdro no abre | HTTP API no implementada | Módulo T3 pendiente |
| Impresión duplicada | Doble llamada a /api/marchar | Nunca llamar /api/marchar tras /api/comanda |
| Stale recovery | Comando atascado >90s | bridge v6.0.1 lo reintenta automáticamente |

---

## Convenciones

- El bridge-local.js **nunca** llama directamente a tablas de BD — solo a `bridge-agent`
- Los comandos de impresión viajan como base64 ESC/POS en el campo `payload.data`
- `bridge-agent` usa `SUPABASE_SERVICE_ROLE_KEY` para escribir en `bridge_commands`
- Versioning: incrementar versión en comentario del EF al desplegar (`// v12`, `// v13`...)


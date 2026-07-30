# ia.rest — Módulos QR y VeriFactu (Secciones 2-3)

# ═══════════════════════════════════════════════
# SECCIÓN 2 — MÓDULO QR
# ═══════════════════════════════════════════════

# ia.rest — Módulo QR

Lee este archivo ANTES de tocar cualquier código del módulo QR.

---

## Concepto

El cliente escanea un QR en su mesa → accede al menú digital → hace su pedido
→ la comanda llega al KDS exactamente igual que si la hubiera dictado el camarero.
Opcionalmente puede pagar desde el mismo flujo.

**Es un add-on al plan base:** +12 €/mesa/mes.

---

## Estado real (mayo 2026)

| Modo | Estado |
|---|---|
| `sin_pago` | ✅ Completamente funcional |
| `opcional` | 🟡 Connect live OK; solo falta `STRIPE_WEBHOOK_SECRET_QR` (endpoint live) para confirmar el pago |
| `obligatorio` | 🟡 Mismo estado que opcional |

**Split UI cliente:** Edge Function `qr-split` operativa, pero sin UI cliente implementada.
**Rotación token por turno:** pendiente implementar.

---

## Ruta del cliente

```
/q/[token]
```

El `token` identifica la sesión QR de la mesa. Se genera en `qr_sesiones_cliente`.
Un token distinto por mesa y turno — nunca reutilizar entre servicios.

---

## Edge Functions del módulo QR

| EF | Versión | Qué hace |
|---|---|---|
| `qr-session` | v2 | Crea/valida sesión QR de mesa. Devuelve config del restaurante y modo de pago |
| `qr-order` | v4 | Recibe pedido del cliente, crea comanda + comanda_items, notifica KDS |
| `qr-cobro` | v1 | Procesa cobro QR (Stripe) desde la sesión del cliente |
| `qr-connect` | v1 | Vincula sesión QR con comanda activa existente |
| `qr-split` | v1 | División de cuenta desde QR — EF ok, sin UI cliente |
| `qr-call-waiter` | v2 | El cliente llama al camarero — genera push al camarero asignado |

---

## Tabla: `qr_sesiones_cliente`

```sql
id UUID PRIMARY KEY,
restaurante_id UUID NOT NULL,
mesa_id UUID NOT NULL,
token TEXT UNIQUE NOT NULL,         -- token del QR en la URL /q/[token]
estado TEXT DEFAULT 'activa',       -- 'activa' | 'cerrada' | 'expirada'
modo_pago TEXT NOT NULL,            -- 'obligatorio' | 'opcional' | 'sin_pago'
comanda_id UUID,                    -- comanda asociada (puede ser null al inicio)
importe_minimo DECIMAL(10,2),       -- para modo obligatorio
created_at TIMESTAMPTZ DEFAULT now(),
expires_at TIMESTAMPTZ,             -- TTL de la sesión (por defecto turno activo)
metadata JSONB                      -- config extra: idioma, nombre_mesa, etc.
```

---

## Modos de pago QR

| Modo | Comportamiento |
|---|---|
| `obligatorio` | El cliente DEBE pagar desde el QR para confirmar. Útil para menú cerrado con precio mínimo |
| `opcional` | El cliente puede pagar desde el QR o pedir que venga el camarero |
| `sin_pago` | Solo pedido — el cobro siempre lo hace el camarero en mesa |

---

## Schema crítico — reglas que NO se pueden romper

### comanda_items en pedidos QR
```typescript
// ✅ SIEMPRE incluir nombre, restaurante_id y origen
const item = {
  comanda_id: sesion.comanda_id,
  producto_id: producto.id,
  nombre: producto.nombre,                  // OBLIGATORIO — desnormalizado
  restaurante_id: sesion.restaurante_id,    // OBLIGATORIO — RLS
  cantidad: 1,
  precio_unitario: producto.precio,
  origen: 'qr'                              // marcar origen QR para trazabilidad
}
```

### comandas.estado al crear desde QR
```typescript
// ✅ CORRECTO
estado: 'nueva'

// ❌ INCORRECTO — CHECK constraint falla
estado: 'pendiente'
estado: 'abierta'
```

---

## Flujo completo de pedido QR

```
1. Cliente escanea QR → GET /q/[token]
2. Next.js llama qr-session → valida token, devuelve config
3. Cliente ve menú → selecciona productos
4. Cliente confirma pedido → POST qr-order
   → crea comanda (estado='nueva') + items (con nombre+restaurante_id)
   → Realtime notifica KDS
   → Si modo='obligatorio' → redirige a cobro antes de confirmar en cocina
5. Cocina recibe en KDS igual que cualquier comanda
6. Cliente puede llamar al camarero → POST qr-call-waiter
   → push al camarero asignado a la mesa
```

---

## Flujo de cobro QR (cuando se desbloquee P2)

```
Cliente pulsa "Pagar" en /q/[token]
  → qr-cobro → crea PaymentIntent Stripe
    → cliente introduce tarjeta
      → webhook confirma pago
        → comanda.estado → 'cerrada'
          → verifactu-sign genera factura automáticamente
```

### Split de cuenta QR (EF ok, UI pendiente)
```
Cliente 1 pulsa "Dividir cuenta"
  → qr-split crea N sub-sesiones (una por comensal)
  → cada comensal accede por link
  → cada uno paga su parte independientemente
  → cuando todos han pagado → comanda se cierra automáticamente
```

---

## Configuración en `/owner → Config → QR`

```typescript
// Config por mesa
{
  qr_activo: boolean,
  modo_pago: 'obligatorio' | 'opcional' | 'sin_pago',
  importe_minimo: number | null,
  url_qr: string  // generado: /q/[token]
}
```

El panel muestra el QR descargable para imprimir y colocar en mesa.

---

## Variables de entorno requeridas

```bash
STRIPE_CLIENT_ID=...              # Connect — YA configurado (Saboga cobra live)
STRIPE_WEBHOOK_SECRET_QR=...      # webhook módulo QR — PENDIENTE (endpoint live) para cerrar opcional/obligatorio
```

> Connect ya está en live. Para activar el pago opcional/obligatorio del QR de mesa
> solo falta crear el endpoint de webhook live (`/api/qr/webhook`) y poner su
> `STRIPE_WEBHOOK_SECRET_QR` en Vercel. `sin_pago` funciona siempre.

---

## Integración con el resto del sistema

- **KDS**: comandas QR aparecen igual que las de voz. Campo `origen='qr'` en `comanda_items` permite filtrar.
- **Realtime**: `qr-order` publica en canal `kds-{restaurante_id}` — misma suscripción que usa el KDS.
- **VeriFactu**: el cobro QR genera factura automáticamente vía `verifactu-sign` si está configurado.
- **Push**: `qr-call-waiter` usa la misma infraestructura de `push-send` que usa cocina.

---

## Diagnóstico rápido

| Síntoma | Causa probable | Fix |
|---|---|---|
| Token inválido / sesión expirada | Token caducado o TTL superado | Regenerar QR desde `/owner → Config → QR` |
| Pedido no llega a KDS | `comanda_id` null en sesión | Verificar que `qr-order` crea la comanda antes del item |
| Error RLS en INSERT | Falta `restaurante_id` en comanda_items | Incluir siempre `restaurante_id` y `nombre` |
| Cobro QR falla | `STRIPE_CLIENT_ID` no configurado | P2 — añadir a Vercel env vars |
| Split no cierra comanda | Falta confirmación de todos los pagos | Verificar webhook suma importes |
| Push camarero no llega | `qr-call-waiter` sin suscripción activa | Camarero debe tener push activo en `/edge` |
| Modo opcional/obligatorio no funciona | Stripe env vars pendientes | Solo sin_pago disponible hasta resolver P2 |

# ═══════════════════════════════════════════════
# SECCIÓN 3 — MÓDULO VERIFACTU
# ═══════════════════════════════════════════════

# ia.rest — Módulo VeriFactu

Lee este archivo antes de tocar código relacionado con facturación en ia.rest.

---

## Contexto legal

**VeriFactu** es el estándar de facturación electrónica de la AEAT (España).
Obliga a encadenar facturas con hash SHA-256 para garantizar la integridad.

| Colectivo | Fecha obligatoria |
|---|---|
| Sociedades | **1 enero 2027** |
| Autónomos (resto de obligados) | **1 julio 2027** |

> ⚠️ **PLAZO APLAZADO UN AÑO.** El RD-ley 15/2025 (de 2 de diciembre, BOE 3-dic-2025)
> prorrogó las fechas originales del RD 254/2025 (que eran sociedades 1-ene-**2026** /
> resto 1-jul-**2026**). Las fechas vigentes son las de la tabla (2027).
> A junio de 2026 VeriFactu **aún NO es obligatorio** para los restaurantes clientes;
> sigue siendo un diferenciador (ya viene nativo) pero no comunicar "2026" como fecha límite.
> Fuente: nota AEAT "Ampliación del plazo de adaptación" + RD-ley 15/2025.
> **Pendiente:** confirmar en la sede oficial de la AEAT antes de usarlo en material legal/comercial.

---

## Arquitectura del módulo

```
Camarero dice "cuenta" o pulsa botón cuenta
  → /edge genera evento cierre
    → verifactu-sign v17 (Edge Function)
      → genera factura con hash SHA-256 encadenado
      → guarda en facturas_verifactu
      → devuelve QR AEAT + número factura
        → /owner → Facturas (listado con QR)

Factura con NIF de cliente (cliente empresa o particular):
  → camarero pulsa "Factura con NIF" en /edge
    → FacturaClienteModal v2 (autocomplete NIF debounce 250ms)
      → busca/crea en clientes_fiscales
        → POST /api/factura/cliente
          → guarda en facturas_cliente + facturas_verifactu
```

---

## Edge Function: `verifactu-sign`

Versión actual: **v17**

### Endpoint
```
POST /functions/v1/verifactu-sign
Authorization: Bearer <anon_key>
Content-Type: application/json
```

### Payload de entrada
```typescript
{
  restaurante_id: string,  // uuid
  comanda_id: string,      // uuid — comanda a facturar
  metodo_pago: 'efectivo' | 'tarjeta' | 'bizum' | 'dividida',
  importe_total: number,   // en euros, 2 decimales
  items: Array<{
    nombre: string,
    cantidad: number,
    precio_unitario: number,
    iva_tipo: 10 | 21      // IVA hostelería: 10% comida, 21% alcohol
  }>
}
```

### Respuesta
```typescript
{
  ok: true,
  factura_id: string,         // uuid en facturas_verifactu
  numero_factura: string,     // ej: "2026-001234"
  hash_sha256: string,
  hash_anterior: string,
  qr_url: string,
  pdf_url: string | null
}
```

---

## Tabla: `facturas_verifactu`

```sql
id UUID PRIMARY KEY,
restaurante_id UUID NOT NULL,
comanda_id UUID REFERENCES comandas,
numero_factura TEXT NOT NULL,        -- secuencial: "2026-000001"
fecha TIMESTAMPTZ NOT NULL,
importe_total DECIMAL(10,2),
iva_desglosado JSONB,                -- { "10": 45.50, "21": 12.30 }
items JSONB,                         -- copia desnormalizada
metodo_pago TEXT,
hash_sha256 TEXT NOT NULL,           -- hash de esta factura
hash_anterior TEXT,                  -- null solo en la primera factura
nif_emisor TEXT NOT NULL,
razon_social TEXT NOT NULL,
qr_content TEXT,                     -- contenido del QR AEAT
estado TEXT DEFAULT 'emitida',       -- 'emitida' | 'anulada'
created_at TIMESTAMPTZ DEFAULT now()
```

---

## Tabla: `clientes_fiscales`

Clientes con NIF para emitir facturas personalizadas.

```sql
id UUID PRIMARY KEY,
restaurante_id UUID NOT NULL,
nif TEXT NOT NULL,                   -- NIF/CIF del cliente
razon_social TEXT NOT NULL,
direccion TEXT,
email TEXT,
created_at TIMESTAMPTZ DEFAULT now(),
UNIQUE(restaurante_id, nif)
```

---

## Tabla: `facturas_cliente`

Facturas emitidas a clientes con NIF propio (además de facturas_verifactu).

```sql
id UUID PRIMARY KEY,
restaurante_id UUID NOT NULL,
comanda_id UUID REFERENCES comandas,
cliente_fiscal_id UUID REFERENCES clientes_fiscales,
factura_verifactu_id UUID REFERENCES facturas_verifactu,
numero_factura TEXT NOT NULL,
fecha TIMESTAMPTZ NOT NULL,
importe_total DECIMAL(10,2),
iva_desglosado JSONB,
items JSONB,
metodo_pago TEXT,
estado TEXT DEFAULT 'emitida',
created_at TIMESTAMPTZ DEFAULT now()
```

---

## API routes de facturación

### `GET/POST /api/clientes-fiscales`
```typescript
// GET — buscar cliente por NIF (autocomplete)
GET /api/clientes-fiscales?nif=B12345678

// POST — crear/actualizar cliente fiscal
POST /api/clientes-fiscales
{ nif, razon_social, direccion?, email? }
```

### `POST /api/factura/cliente`
```typescript
// Generar factura con NIF de cliente
POST /api/factura/cliente
{
  comanda_id: string,
  cliente_fiscal_id: string,    // o nif+razon_social para crear on-the-fly
  metodo_pago: string,
  items: Array<{ nombre, cantidad, precio_unitario, iva_tipo }>
}
```

---

## FacturaClienteModal v2

Modal en /edge para emitir facturas con NIF de cliente.

```typescript
// Características:
// - Autocomplete NIF con debounce 250ms (busca en clientes_fiscales)
// - Si no existe → formulario para crear nuevo cliente fiscal
// - Preview de factura antes de emitir
// - Cliente demo: EMPRESA DEMO SL B12345678
```

---

## Configuración del restaurante

Para generar facturas válidas, el restaurante DEBE tener:
- `nif` — NIF/CIF del restaurante
- `razon_social` — razón social legal
- `direccion_fiscal` — dirección completa

Ruta: `/owner → Restaurante → Datos fiscales`

```typescript
const { data: restaurante } = await supabase
  .from('restaurantes')
  .select('nif, razon_social, direccion_fiscal')
  .eq('id', restauranteId)
  .single()

if (!restaurante.nif || !restaurante.razon_social) {
  throw new Error('Configura NIF y razón social antes de generar facturas')
}
```

---

## Hash SHA-256 encadenado

```typescript
const facturaString = [
  restaurante.nif,
  factura.numero_factura,
  factura.fecha.toISOString(),
  factura.importe_total.toFixed(2),
  hashAnterior || '0'  // primera factura usa '0'
].join('|')

const hash = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(facturaString)
)
// convertir a hex string
```

> ⚠️ **No romper la cadena** — nunca borrar de `facturas_verifactu`.

---

## QR AEAT

```
https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?...
  nif=<NIF_EMISOR>
  &numserie=<NUMERO_FACTURA>
  &fecha=<FECHA_DDMMYYYY>   ← formato DDMMYYYY obligatorio
  &importe=<IMPORTE>
```

---

## Tipos de IVA en hostelería

| Tipo | % IVA | Aplica a |
|---|---|---|
| Reducido | 10% | Comida, bebidas no alcohólicas, servicios de restauración |
| General | 21% | Bebidas alcohólicas |

```typescript
function ivaParaProducto(producto: Producto): 10 | 21 {
  if (producto.categoria === 'bebidas' && producto.alcoholico) return 21
  return 10
}
```

---

## Anulación de facturas

Las facturas **no se borran** — se anulan con factura rectificativa.

```typescript
{
  tipo: 'rectificativa',
  factura_original_id: facturaId,
  importe_total: -importeOriginal,
  motivo_anulacion: 'Error en pedido' | 'Devolución' | 'Otro'
}
```

---

## Panel `/owner → Facturas`

Lista de facturas con:
- Número de factura + fecha/hora
- Importe con IVA desglosado
- Hash SHA-256 (primeros 8 chars)
- Cliente fiscal (si aplica)
- Botón QR (abre QR AEAT en modal)
- Botón PDF (descarga si está configurado)
- Estado: emitida / anulada

---

## Diagnóstico

| Error | Causa | Fix |
|---|---|---|
| "NIF no configurado" | `restaurantes.nif` vacío | `/owner → Restaurante → Datos fiscales` |
| Hash roto | Factura borrada de BD | Nunca borrar de `facturas_verifactu` |
| IVA incorrecto | Clasificación incorrecta | Verificar campo `alcoholico` en productos |
| QR inválido | Fecha mal formateada | Formato AEAT: `DDMMYYYY` |
| Número duplicado | Race condition | La secuencia la gestiona `verifactu-sign` con `FOR UPDATE` |
| Cliente no encontrado en autocomplete | NIF no existe en clientes_fiscales | El modal permite crear nuevo cliente on-the-fly |


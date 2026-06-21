# Diseño — E-recibo digital (ia.rest)

> Fecha: 2026-06-15 · Vertical: `apps/ia-rest` · Rama: `claude/modern-ticket-design-r4ngkz`
> Origen: idea de Alberto a partir de receiptmaker.ai → modernizar el ticket de cara al cliente.

## Resumen

Hoy el cliente solo ve un **ticket térmico** (ESC/POS 80mm, monocromo). Este proyecto añade
un **e-recibo digital**: al pedir la cuenta se imprime un **QR** en el ticket térmico que abre
en el móvil del cliente un recibo con diseño moderno (marca, color, total destacado, desglose
de IVA y, si existe, la verificación AEAT de la factura VeriFactu).

No sustituye al ticket térmico ni a la factura legal: es una **capa de presentación** sobre la
cuenta que ya se genera.

## Objetivos

- El cliente accede a un recibo digital bonito escaneando el QR del ticket térmico.
- Cero fricción: sin login, sin email, sin app. Solo escanear.
- Aislado y multi-tenant seguro: el token es el secreto; nunca se filtran datos de otro local.
- No tocar la facturación legal (VeriFactu) ni el flujo de impresión existente más allá de
  añadir el QR.

## No-objetivos (fase 2, fuera de este MVP)

- Descargar PDF de la factura.
- Pedir factura con NIF desde el móvil.
- Envío del recibo por email.
- Personalización fina de marca por restaurante (logo subido, color corporativo).

## Arquitectura

Tres piezas con fronteras claras:

### 1. Persistencia — tabla `recibos_digitales`

Snapshot inmutable de la cuenta en el momento de pedirla. Se lee en público solo por token.

```sql
CREATE TABLE IF NOT EXISTS recibos_digitales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT UNIQUE NOT NULL,          -- secreto en la URL /recibo/[token]
  local_id      UUID NOT NULL,                 -- restaurante (RLS)
  comanda_id    UUID,                          -- comanda asociada (trazabilidad)
  factura_verifactu_id UUID,                   -- si ya hay factura legal emitida
  snapshot      JSONB NOT NULL,                -- datos congelados (ver abajo)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ                    -- TTL opcional (p. ej. 30 días)
);
CREATE INDEX IF NOT EXISTS idx_recibos_token ON recibos_digitales(token);
CREATE INDEX IF NOT EXISTS idx_recibos_local ON recibos_digitales(local_id);
ALTER TABLE recibos_digitales ENABLE ROW LEVEL SECURITY;
-- Service role lo gestiona todo (insert desde courier, select desde la página pública).
CREATE POLICY "service_role_all" ON recibos_digitales USING (auth.role() = 'service_role');
```

`snapshot` (JSON, autocontenido para que el render no dependa de joins ni de datos que puedan
cambiar después):

```jsonc
{
  "restaurante": { "nombre": "Bodega La Solera", "razon_social": "...", "nif": "B...", "direccion": "..." },
  "mesa_label": "12", "zona_nombre": "Sevilla",
  "fecha": "2026-06-15T14:32:00.000Z",
  "numero_ticket": 128,
  "items": [{ "nombre": "Salmorejo", "cantidad": 2, "precio_unitario": 6.5 }],
  "total": 48.80,
  "iva": { "tipo": 10, "base": 44.36, "cuota": 4.44 },
  "aeat": null   // o { "qr_content": "...", "numero_factura": "...", "url": "..." } si hay factura
}
```

### 2. Generación — integración en el flujo de cuenta

En `src/lib/courier.ts` (`crearPrintJobCuenta`, ya recibe todos los datos de la cuenta):

1. Generar `token` url-safe de ~22 chars con `crypto.randomBytes(16)` → base64url (sin
   guiones, cómodo para QR; no exponer el uuid de la comanda).
2. Insertar fila en `recibos_digitales` con el snapshot construido desde los `CuentaParams`.
3. Construir la URL `${BASE}/recibo/${token}` (BASE = `https://www.iarest.es`, con fallback a
   `origin` como en `src/lib/qr-notify.ts`).
4. En `generarEscPosCuenta`, **añadir un bloque QR** con esa URL (reutilizando el generador
   ESC/POS de QR ya presente en `generarTicketCuenta`: `GS ( k`, modelo 2), centrado, con
   un microcopy: "Escanea para tu recibo digital".

El ticket de texto plano (fallback CloudPRNT) imprime la URL en texto, sin QR.

### 3. Presentación — ruta pública `app/recibo/[token]/page.tsx`

- **Server Component** (App Router, `await params`). Lee el recibo por token con
  `createServerClient()` (service role; el token ES la autorización — no hay sesión).
- Si el token no existe / expiró → 404 amable ("Este recibo ya no está disponible").
- Render **mobile-first** con el tema ia.rest (`src/lib/colors.ts`): cabecera con avatar de
  inicial + nombre del restaurante, lista de items, total destacado, desglose IVA, y —si
  `snapshot.aeat` no es null— un bloque "Factura verificable en AEAT" con su QR/enlace.
- Pie discreto "gestionado con ia.rest". Sin botones de acción en el MVP (los de fase 2 se
  añaden aquí después).

## Flujo completo

```
Camarero pide cuenta → POST /api/comanda/[id]/pedir-cuenta
  → crearPrintJobCuenta()
      → INSERT recibos_digitales (token + snapshot)
      → generarEscPosCuenta() imprime ticket térmico + QR a /recibo/[token]
Cliente escanea QR
  → GET /recibo/[token] (server component)
      → lee snapshot por token (service role)
      → renderiza e-recibo móvil con marca + IVA + (AEAT si hay factura)
```

## Manejo de errores

- Token inexistente/expirado → página 404 amable (no error técnico).
- Fallo al insertar `recibos_digitales` → se loguea pero **no bloquea la impresión** del ticket
  térmico (el recibo digital es aditivo; la cuenta debe imprimirse siempre).
- Snapshot sin IVA calculado → se calcula al vuelo igual que hoy en `generarEscPosCuenta`
  (`base = total / 1.10`, `cuota = total − base`).

## Pruebas / verificación

- `npx tsc --noEmit` limpio (regla del proyecto) y, antes de declarar "verde", `next build`.
- Migración aplicada en el schema `iarest` del proyecto compartido (no `public`).
- Manual: pedir cuenta en demo → ver QR en el ticket (o la URL en el log) → abrir
  `/recibo/[token]` en móvil y comprobar render + caso "con factura AEAT" y "sin factura".
- Caso multi-tenant: un token de un local no expone datos de otro (el snapshot es autocontenido
  y la fila lleva `local_id`).

## Notas de implementación

- Convención de columnas en español (proyecto).
- Toda query nueva fija el schema `iarest` (ya lo hacen `createServerClient` / EFs).
- La página pública NO usa `getSession()` (es cliente final sin sesión); el token es el secreto.
- Reutilizar el patrón de QR ESC/POS de `generarTicketCuenta` para no duplicar el encoder.
```

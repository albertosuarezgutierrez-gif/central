# ia.rest — Umbrales de escalado

> **INSTRUCCIÓN PARA CLAUDE**: Lee este archivo al inicio de cualquier sesión de desarrollo.
> Si detectas que ia.rest ha superado alguno de estos umbrales, avisa a Alberto
> ANTES de empezar el trabajo técnico. Igual que haces con el aviso de 50 clientes
> para el fine-tuning con ia_training_log.

---

## 🟢 Estado actual (mayo 2026)
- Clientes reales: **0** (STRIPE_MODE=test)
- Plan Vercel: **Pro** — 6.000 deploys/día, sin restricciones
- CI activo: lint + typecheck + build en ramas `main` y `dev`
- Tests E2E: ninguno (deliberado — ver decisión abajo)

---

## Umbrales y qué activar en cada uno

### 🔵 1er cliente real
**Avisar a Alberto para:**
- Activar `STRIPE_MODE=live` en Vercel (sk_live + webhook secret live)
- Configurar `STRIPE_CLIENT_ID` + `STRIPE_WEBHOOK_SECRET_QR` → activa cobro QR
- Verificar que VeriFactu genera facturas reales con NIF/razón social del cliente
- Activar Sentry o similar para error tracking en producción

---

### 🟡 5 clientes reales
**Activar:**
- **E2E tests con Playwright** — añadir al CI los 5 flujos críticos:
  - Login por PIN (cada rol)
  - Comanda voz → aparece en KDS
  - KDS marca listo → push al camarero
  - Cobro → factura VeriFactu generada
  - Panel owner: carta + supervisor
- **Monitoring básico**: uptime check en Vercel, alertas de Edge Function failures

---

### 🟠 10 clientes reales
**Activar:**
- **Tests de Edge Functions** unitarios (brain-parse, verifactu-sign, auth-pin-validate)
- **Sentry** con alertas por email para errores críticos en producción
- **Backup manual mensual** de la BD Supabase
- Revisar plan Supabase — el free tier tiene límites de conexiones concurrentes
- Considerar dominio de email corporativo para soporte (no gmail)

---

### 🔴 20 clientes reales
**Activar:**
- **Tests de carga básicos** (k6 o Artillery) — simular 20 restaurantes con comandas simultáneas
- **CDN para assets** estáticos (imágenes de carta, APK)
- Revisar plan Vercel (límites de bandwidth y funciones serverless)
- Documentación de onboarding para que Alberto no tenga que hacer setup manual de cada cliente

---

### 🚀 50 clientes reales
**Activar (ya preparado en BD):**
- **Fine-tuning propio** con `ia_training_log` — suficientes datos para modelo propio
- **API pública (#12)** — integraciones con TPV legacy, TheFork, reservas
- **Forecaster IA (#14)** — predicción de stock y demanda por restaurante
- Revisar si merece la pena **multi-región** Supabase (latencia clientes fuera de España)
- Contratar soporte técnico externo o primer empleado

---

### 💎 100 clientes reales
**Revisar arquitectura completa:**
- Supabase Pro plan obligatorio (o self-hosted)
- Vercel Pro ya activo — revisar SLA y soporte
- Separar base de datos por región si hay clientes internacionales
- Sistema de versioning de la API pública
- Proceso formal de QA antes de cada release

---

## Decisiones tomadas y por qué

| Decisión | Motivo |
|---|---|
| No E2E en CI hasta 5 clientes | Coste de mantenimiento > riesgo con 0-4 clientes |
| STRIPE_MODE=test hasta primer cliente | No arriesgar cobros reales antes de validar con cliente |
| Sin Sentry hasta primer cliente | Sin usuarios reales, los errores los detecta Alberto directamente |
| CI básico (lint+types+build) desde ya | ROI inmediato, 0 mantenimiento, protege contra deploys rotos |
| Plan Vercel Pro desde mayo 2026 | 6.000 deploys/día — flujo de desarrollo sin restricciones |

---

## Cómo saber cuántos clientes hay

```sql
-- En Supabase SQL Editor
SELECT COUNT(*) FROM restaurantes 
WHERE activo = true 
AND stripe_status = 'active';
```

O en Stripe Dashboard → Customers con suscripción activa.

---

*Última actualización: mayo 2026*

---

## Estrategia de actualizaciones — App Camarero (/edge)

### Mecanismo dual (activo desde mayo 2026)

| Mecanismo | Cuándo actúa | Comportamiento |
|---|---|---|
| **Banner SW** (`useServiceWorkerUpdate`) | En cualquier momento que el SW detecta versión nueva | Muestra banner vermilion "Nueva versión disponible" + botón "Actualizar ahora" — el camarero decide cuándo |
| **Auto-reload** (`useAutoReload`) | Al volver al app tras **≥30 min** en background | Recarga silenciosa automática sin intervención del camarero |

### Por qué 30 minutos (no menos)

**< 30 min** → el camarero puede estar mid-service: bloquea el móvil mientras atiende al cliente, vuelve, y un reload borraría la comanda en curso (estado React local, no enviada aún a Supabase). Con 30 min es imposible estar en mitad de una toma de pedido activa.

**30 min garantiza:**
- Cierre de cocina → reapertura → versión nueva ✅
- Entre servicios (comida/cena) → versión nueva ✅  
- Mid-service (bloqueo de pantalla normal) → **NO recarga** ✅

### El banner SW — no eliminar

Aunque el auto-reload cubre pausas largas, el banner es necesario porque:
1. Si el camarero tiene el móvil en mano todo el turno → nunca va a background 30 min → el auto-reload nunca se activa
2. Sin el banner, podría trabajar horas con versión desactualizada
3. El banner es **controlado**: el camarero elige el momento seguro para actualizar (entre comandas)

### Riesgo eliminado con el umbral de 30 min

> ⚠️ Con umbral de 5 min (versión descartada): camarero bloquea móvil 6 min mientras el cliente decide, vuelve → reload → pierde comanda dictada no enviada. Inaceptable mid-service.

*Actualizado: mayo 2026*

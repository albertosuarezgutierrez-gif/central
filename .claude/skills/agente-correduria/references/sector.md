# El sector — manual del agente de la correduría

> Acumulativo: cada ciclo el agente añade lo estructural que aprenda (por PR). Fecha cada
> adición. Lo coyuntural (titulares de la semana) va al informe de Telegram, NO aquí.

## 1. Marco regulatorio español (lo mínimo que un corredor no puede ignorar)
- **RD-ley 3/2020** transpone la **IDD** (Directiva de Distribución de Seguros): regula la
  distribución, la información precontractual y la formación. Deroga la vieja Ley 26/2006.
- **LCS — Ley 50/1980 de Contrato de Seguro**: el contrato en sí. Art. 22 (prórroga y
  oposición): el TOMADOR puede oponerse a la prórroga con **1 mes** de preaviso; el
  ASEGURADOR necesita **2 meses**. De ahí sale la ventana comercial de renovaciones.
- **DGSFP** (Dirección General de Seguros y Fondos de Pensiones): registro administrativo
  de mediadores. **Alberto = corredor de seguros, clave `CS-F/0170`** (persona física).
- Obligaciones del corredor: **análisis objetivo** (comparar un número suficiente de
  contratos del mercado — es lo que lo distingue del agente), información precontractual
  documentada, **seguro de RC profesional**, capacidad financiera, formación continua,
  y RGPD reforzado (salud en vida/decesos = categoría especial art. 9).
- Figuras de mediación: **corredor** (independiente, análisis objetivo, cobra comisión de
  la compañía y/u honorarios) vs **agente exclusivo** (una compañía) vs **agente
  vinculado** (varias, sin independencia). ASegura es correduría → corredor.

## 2. Operativa de una correduría (el día a día que el agente debe dominar)
- **Ciclo de una póliza:** tarificación → emisión → recibo (prima) → cartera →
  renovación/anulación. **Siniestro** = el momento de la verdad con el cliente.
- **Nueva producción vs cartera:** comisión de nueva producción (primer año) y comisión
  de cartera (renovaciones). El valor de una correduría ES su cartera: ingreso recurrente
  con tasa de caída (churn) baja si se trabaja la renovación.
- **Vencimientos = la máquina comercial:** 60-90 días antes del vencimiento se revisa la
  póliza, se retarifica en el multitarificador y se retiene o mejora. Una correduría que
  no trabaja vencimientos pierde cartera en silencio.
- **Recibos:** la compañía gira el recibo; la comisión llega por liquidación (CIMA/TIREA
  la estandariza). Impago de recibo → suspensión de cobertura (LCS art. 15) → aviso al
  cliente ANTES de que pase.

## 3. Estándares e infraestructura del sector
- **EIAC**: formato estándar de intercambio compañía↔mediador (ficheros de cartera,
  recibos, siniestros). Las compañías lo publican a diario; se descarga cuando se quiera
  (no es un stream: una pausa no pierde datos).
- **CIMA / TIREA**: plataforma de intercambio (liquidaciones, comisiones). La matriz de
  comisiones COBRADAS de plataforma `/correduria` sale de ahí (vía movimientos BBVA).
- **Multitarificadores**: el corredor tarifica N compañías de una vez. El de la casa es
  **Avant2 Sales Manager (Codeoscopic)** — ver §4.

## 4. Codeoscopic / Avant2 — LA fuente de tarificación y emisión
- Contrato **Workspace + API REST** firmado el **20/05/2026 a nombre de Alberto** (Grupo
  ASegura). Manuel (hermano) fue solo el integrador; sin relación contractual con
  Codeoscopic (dicho por su DPD, 22/05/2026). DPA art. 28 RGPD remitido el 25/05.
- Panel Avant2 operativo a nombre de Alberto (alta abril/2026; recuperación de contraseña
  → su Gmail). Compañías VIVAS en el panel: **Reale** (autos, motos, hogar, comercios,
  comunidades, decesos, vida) y **Fidelidade**. Claves entregadas a soporte: **Mapfre,
  Allianz, Catalana Occidente** (pendiente confirmar activación).
- **Integración API: EN SANDBOX desde jun/2026, sin cerrar.** Flujo Quote → preemisión →
  Submit → webhook (Basic Auth). Falta: batería completa en sandbox + idempotencia del
  `attempt_id` → entonces se enciende el flag de emisión. Contacto PM API: Juan Manuel
  Fernández. ⚠️ Decisión de Alberto (01/09/2026): las credenciales se piden a MANUEL
  (env vars de su Vercel), no a Codeoscopic.
- Higiene pendiente sin prisa: claves de portales de compañías viajaron por email en
  mayo/2026 (Mapfre, Catalana) → rotarlas cuando el traspaso lo permita.

## 5. El negocio real de ASegura (estado 01/09/2026)
- Cartera en el Supabase de ASEGURA (leída en vivo por plataforma): **50 pólizas en
  vigor · 995 sin fecha · 27.793 históricas · 2.742 clientes · 29.858 leads · 7
  siniestros**. ⚠️ «Sin fecha» = enriquecimiento pendiente, no «no vencen».
- El CRM lo desarrolló Manuel (favor de hermano, arranque del proyecto) pero **el negocio
  y la web son de Alberto**. El CRM aún no está operativo (nadie lo usa a diario) → el
  traspaso a `apps/asegura` va sin ventana, paso a paso (`docs/TRASPASO-CORREDURIA.md`).
- Ingesta diaria EIAC de las compañías → entra en ese Supabase (cron de Manuel).
- Los **29.858 leads** son el activo comercial dormido: nadie los trabaja hoy. RGPD manda:
  verificar base de legitimación antes de cualquier campaña (fase 3, con OK de Alberto).

/**
 * ROI Intranet — Google Apps Script (Drive)
 * Web App para subir, listar, leer y archivar facturas en Google Drive.
 *
 * SETUP:
 * 1. script.google.com → Nuevo proyecto → pega este código
 * 2. Edita ROOT_FOLDER_ID con el ID de tu carpeta de facturas en Drive
 * 3. Implementar → Nueva implementación → Web app
 *    - Ejecutar como: Yo (tu cuenta Google)
 *    - Acceso: Cualquier persona (Anyone)
 * 4. Copia la URL → Vercel env (sivra): DRIVE_SCRIPT_URL=<url>
 *
 * API (POST JSON con campo "action"):
 *  - upload  { fileBase64|base64Data, fileName, mimeType, fecha? } → { ok, fileId, url, carpeta, nombre }
 *  - list    {}                                       → { ok, files:[{id,nombre,mime}] }  (PDFs en RAÍZ, sin archivar)
 *  - get     { fileId }                               → { ok, fileBase64, mimeType, nombre }
 *  - archive { fileId, fecha }                        → { ok, carpeta }  (mueve a AÑO/MES)
 */

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────────
// Carpeta "FACTURAS Apartamentos / 2026" de Drive (misma raíz que usa la skill
// Claude `facturas-correo` — ver docs/DRIVE-ESTRUCTURA.md; el fileId NO cambia
// aunque la carpeta se reanide). Subcarpetas por mes "NN-MesNombre-2026", el
// mismo formato que ya usa esa skill (p.ej. "07-Julio-2026").
//
// 🚨 CORREGIDO 01/08/2026: apuntaba a "ALBERTO 2026 PERSONAL (SEGUROS)"
// (1pyW0_QNOCYuD_0az13sP7MpDyhhNVXt7) — TODA factura de negocio que procesaba
// el cron `facturas-scan` (apps/plataforma/lib/agente-facturas) se archivaba en
// el árbol personal en vez del de negocio (detectado con Castuera 10/07 y de
// nuevo con Giraldillo/ParkingLibre 01/08; avisos en la papelera Drive
// `_DUPLICADOS_BORRAR`). Repuntado a la raíz de negocio.
const ROOT_FOLDER_ID = "1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O";

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

// Carpetas de mes ya creadas con una grafía distinta a la estándar de arriba
// (histórico) — hay que seguir usando el nombre exacto para no crear una
// carpeta duplicada. Clave "YYYY-MM".
const MONTH_FOLDER_OVERRIDES = {
  "2026-05": "05-MAYO-2026",
};

function json_(obj) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  output.setContent(JSON.stringify(obj));
  return output;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || "upload";
    if (action === "upload")  return doUpload_(data);
    if (action === "list")    return doList_();
    if (action === "get")     return doGet_(data);
    if (action === "archive") return doArchive_(data);
    return json_({ ok: false, error: "acción desconocida: " + action });
  } catch (err) {
    return json_({ ok: false, error: err.toString() });
  }
}

function doGet(e) {
  return json_({ ok: true, status: "ROI Drive Script activo" });
}

// ── UPLOAD ──────────────────────────────────────────────────────────────────────
function doUpload_(data) {
  const fileBase64 = data.fileBase64 || data.base64Data;
  const { fileName, mimeType, fecha } = data;
  if (!fileBase64 || !fileName) return json_({ ok: false, error: "Faltan campos: fileBase64 o fileName" });

  const targetFolder = carpetaDestino_(fecha);
  const bytes = Utilities.base64Decode(fileBase64);
  const blob = Utilities.newBlob(bytes, mimeType || "application/pdf", fileName);
  const file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return json_({ ok: true, fileId: file.getId(), url: file.getUrl(), carpeta: targetFolder.getName(), nombre: file.getName() });
}

// ── LIST (PDFs en la raíz, aún sin archivar por año/mes) ─────────────────────────
function doList_() {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const it = root.getFiles();
  const files = [];
  while (it.hasNext()) {
    const f = it.next();
    const mime = f.getMimeType();
    if (mime === "application/pdf" || mime.indexOf("image/") === 0) {
      files.push({ id: f.getId(), nombre: f.getName(), mime: mime });
    }
  }
  return json_({ ok: true, files: files });
}

// ── GET (contenido en base64) ────────────────────────────────────────────────────
function doGet_(data) {
  if (!data.fileId) return json_({ ok: false, error: "Falta fileId" });
  const file = DriveApp.getFileById(data.fileId);
  const blob = file.getBlob();
  return json_({
    ok: true,
    fileBase64: Utilities.base64Encode(blob.getBytes()),
    mimeType: blob.getContentType(),
    nombre: file.getName(),
  });
}

// ── ARCHIVE (mover a AÑO/MES) ────────────────────────────────────────────────────
function doArchive_(data) {
  if (!data.fileId) return json_({ ok: false, error: "Falta fileId" });
  const file = DriveApp.getFileById(data.fileId);
  const target = carpetaDestino_(data.fecha || new Date().toISOString());
  file.moveTo(target);
  return json_({ ok: true, carpeta: target.getName() });
}

// ── HELPERS ──────────────────────────────────────────────────────────────────────
function nombreCarpetaMes_(d) {
  const anio = d.getFullYear();
  const mesIdx = d.getMonth(); // 0-11
  const mesNum = String(mesIdx + 1).padStart(2, "0");
  const clave = anio + "-" + mesNum;
  if (MONTH_FOLDER_OVERRIDES[clave]) return MONTH_FOLDER_OVERRIDES[clave];
  return mesNum + "-" + MONTH_NAMES[mesIdx] + "-" + anio;
}

function carpetaDestino_(fecha) {
  // ROOT_FOLDER_ID YA es la carpeta del año 2026 (no hace falta subcarpeta de año).
  let target = DriveApp.getFolderById(ROOT_FOLDER_ID);
  if (fecha) {
    const d = new Date(fecha);
    if (!isNaN(d.getTime())) {
      target = getOrCreateSubfolder_(target, nombreCarpetaMes_(d));
    }
  }
  return target;
}

function getOrCreateSubfolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

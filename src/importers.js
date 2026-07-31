import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

const EXCEL_EXTENSIONS = ["xlsx"];
const IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

function extensionOf(path) {
  const part = path.split(".").pop();
  return part ? part.toLowerCase() : "";
}

function baseName(path) {
  const file = path.split("/").pop() || "";
  return file.replace(/\.[^.]+$/, "");
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  trimValues: false,
});

function parseXml(xml, label) {
  try {
    return xmlParser.parse(xml);
  } catch {
    throw new Error(`${label}格式无法解析`);
  }
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textFromNode(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textFromNode).join("");
  if (typeof value === "object") {
    if (value["#text"] != null) return textFromNode(value["#text"]);
    if (value.t != null) return textFromNode(value.t);
    if (value.r != null) return textFromNode(value.r);
  }
  return "";
}

function columnFromReference(reference = "") {
  return (reference.match(/^[A-Z]+/i)?.[0] || "").toUpperCase();
}

function resolveSheetPath(target) {
  const normalized = target.replace(/\\/g, "/").replace(/^\//, "");
  if (normalized.startsWith("xl/")) return normalized;
  return `xl/${normalized.replace(/^\.\//, "")}`;
}

export async function readOptionNames(buffer) {
  const workbookZip = await JSZip.loadAsync(buffer);
  const workbookEntry = workbookZip.file("xl/workbook.xml");
  const relsEntry = workbookZip.file("xl/_rels/workbook.xml.rels");
  if (!workbookEntry || !relsEntry) throw new Error("Excel 工作簿结构不完整");

  const workbookDoc = parseXml(await workbookEntry.async("text"), "Excel 工作簿");
  const firstSheet = toArray(workbookDoc?.workbook?.sheets?.sheet)[0];
  if (!firstSheet) throw new Error("Excel 中没有可读取的工作表");
  const relationshipId = firstSheet["@id"];

  const relsDoc = parseXml(await relsEntry.async("text"), "Excel 工作簿关系");
  const relationship = toArray(relsDoc?.Relationships?.Relationship).find((node) => node["@Id"] === relationshipId);
  const sheetPath = relationship?.["@Target"] ? resolveSheetPath(relationship["@Target"]) : "xl/worksheets/sheet1.xml";
  const sheetEntry = workbookZip.file(sheetPath);
  if (!sheetEntry) throw new Error("无法读取 Excel 的第一个工作表");

  const sharedStrings = [];
  const sharedEntry = workbookZip.file("xl/sharedStrings.xml");
  if (sharedEntry) {
    const sharedDoc = parseXml(await sharedEntry.async("text"), "Excel 共享文本");
    for (const item of toArray(sharedDoc?.sst?.si)) sharedStrings.push(textFromNode(item));
  }

  const sheetDoc = parseXml(await sheetEntry.async("text"), "Excel 工作表");
  const rows = toArray(sheetDoc?.worksheet?.sheetData?.row);
  const cellValue = (cell) => {
    const type = cell["@t"];
    if (type === "inlineStr") return textFromNode(cell.is);
    const raw = textFromNode(cell.v);
    return type === "s" ? sharedStrings[Number(raw)] || "" : raw;
  };

  let headerRowIndex = -1;
  let optionColumn = "";
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const cells = toArray(rows[index]?.c);
    const match = cells.find((cell) => cellValue(cell).trim() === "选项名");
    if (match) {
      headerRowIndex = index;
      optionColumn = columnFromReference(match["@r"]);
      break;
    }
  }
  if (headerRowIndex < 0 || !optionColumn) throw new Error('Excel 必须包含表头为“选项名”的列');

  const names = rows.slice(headerRowIndex + 1).map((row) => {
    const cell = toArray(row?.c).find((node) => columnFromReference(node["@r"]) === optionColumn);
    return cell ? cellValue(cell).trim() : "";
  }).filter(Boolean);
  if (!names.length) throw new Error('“选项名”列中没有有效数据');
  return names;
}

function arrayBufferToDataUrl(buffer, mimeType) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function importExcel(file) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("当前仅支持 .xlsx 格式的 Excel 文件");
  const names = await readOptionNames(await file.arrayBuffer());
  return names.map((name) => ({ name, kind: "text", text: name, image: null }));
}

export async function importZip(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const excelEntries = entries.filter((entry) => EXCEL_EXTENSIONS.includes(extensionOf(entry.name)));
  if (!excelEntries.length) throw new Error("ZIP 中必须包含一个 Excel 文件");

  const names = await readOptionNames(await excelEntries[0].async("arraybuffer"));
  const imageEntries = entries.filter((entry) => {
    const normalized = entry.name.replace(/\\/g, "/");
    const inImagesFolder = normalized.startsWith("images/") || normalized.includes("/images/");
    return inImagesFolder && Boolean(IMAGE_MIME[extensionOf(normalized)]);
  });

  const imageMap = new Map();
  for (const entry of imageEntries) {
    const key = baseName(entry.name).trim().toLocaleLowerCase();
    if (!imageMap.has(key)) imageMap.set(key, entry);
  }

  const imported = [];
  for (const name of names) {
    const imageEntry = imageMap.get(name.toLocaleLowerCase());
    if (!imageEntry) {
      imported.push({ name, kind: "text", text: name, image: null });
      continue;
    }
    const ext = extensionOf(imageEntry.name);
    const image = arrayBufferToDataUrl(await imageEntry.async("arraybuffer"), IMAGE_MIME[ext]);
    imported.push({ name, kind: "composite", text: name, image });
  }
  return imported;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

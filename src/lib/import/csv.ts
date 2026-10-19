/** Minimal RFC 4180 parser: quoted fields, escaped quotes and newlines inside quotes. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/**
 * Rows as objects keyed by header name. Handles a leading BOM, lines that
 * were wrapped in quotes as a whole, and (with `alignRight`) rows missing
 * their leading cells, as in Oura's export.
 */
export function csvRecords(text: string, delimiter = ",", { alignRight = false } = {}): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""), delimiter);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((raw) => {
    const row = raw.length === 1 && keys.length > 1 && raw[0].includes(delimiter) ? parseCsv(raw[0], delimiter)[0] ?? raw : raw;
    const offset = alignRight && row.length < keys.length ? keys.length - row.length : 0;
    const record: Record<string, string> = {};
    keys.forEach((k, i) => (record[k] = (row[i - offset] ?? "").trim()));
    return record;
  });
}

/** A number from a cell, accepting a decimal comma; undefined when empty or invalid. */
export function cellNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

import { unzipSync } from "fflate";

import { download } from "./fetch";
import { target } from "./target";
import type { ArchiveResult, Finding } from "./types";

/**
 * A zip can be structurally perfect and still be useless: the real defect found
 * on this site was a 206-byte archive holding one empty folder and no files.
 * Header checks miss that, so archives get opened.
 */
export async function probeArchive(url: string): Promise<ArchiveResult> {
  const response = await download(url, { referer: target.origin + "/" });
  const base: ArchiveResult = {
    url,
    verdict: "ok",
    note: "",
    filename: response.filename,
    bytes: response.bytes.byteLength,
    entries: 0,
    files: 0,
    uncompressed: 0,
  };

  if (response.status === -1) {
    return { ...base, verdict: "dead", note: `下載失敗：${response.error}` };
  }
  if (response.status >= 400) {
    return { ...base, verdict: "dead", note: `HTTP ${response.status}` };
  }
  const missing = target.missingFileHints.some((hint) =>
    response.filename.toLowerCase().includes(hint.toLowerCase())
  );
  if (missing) {
    return {
      ...base,
      verdict: "dead",
      note: `伺服器回傳「${response.filename}」，後端檔案已不存在`,
    };
  }
  if (response.bytes.byteLength === 0) {
    return { ...base, verdict: "dead", note: "回傳 0 byte" };
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(response.bytes);
  } catch (error) {
    return {
      ...base,
      verdict: "dead",
      note: `無法解壓：${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const names = Object.keys(unzipped);
  const files = names.filter((name) => !name.endsWith("/"));
  const uncompressed = files.reduce(
    (total, name) => total + (unzipped[name]?.byteLength ?? 0),
    0
  );
  const result = {
    ...base,
    entries: names.length,
    files: files.length,
    uncompressed,
  };

  if (files.length === 0) {
    return {
      ...result,
      verdict: "dead",
      note: `壓縮檔內沒有任何檔案${
        names.length > 0 ? `（只有空資料夾 ${names[0]}）` : ""
      }`,
    };
  }
  if (uncompressed === 0) {
    return { ...result, verdict: "dead", note: "壓縮檔內所有檔案皆 0 byte" };
  }
  return {
    ...result,
    verdict: "ok",
    note: `${files.length} 個檔案，解壓後 ${Math.round(uncompressed / 1024)} KB`,
  };
}

export function archiveFinding(
  result: ArchiveResult,
  pages: string[]
): Finding | null {
  if (result.verdict === "ok") return null;
  return {
    id: `archive:${result.url}`,
    severity: result.verdict === "dead" ? "dead" : "suspect",
    category: "附件",
    title: `${result.filename || "壓縮檔"}：${result.note}`,
    detail:
      result.bytes > 0
        ? `檔案大小 ${result.bytes.toLocaleString("en-US")} byte，` +
          `壓縮項目 ${result.entries} 個、實際檔案 ${result.files} 個。`
        : result.note,
    url: result.url,
    label: result.filename,
    pages,
  };
}

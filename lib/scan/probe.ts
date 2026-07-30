import { peek } from "./fetch";
import { target } from "./target";
import type {
  ControlFingerprint,
  Finding,
  ResourceKind,
  ResourceResult,
  Verdict,
} from "./types";
import { shortLabel } from "./url";

const MAGIC: Record<string, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  zip: [0x50, 0x4b, 0x03, 0x04],
  docx: [0x50, 0x4b, 0x03, 0x04],
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  pptx: [0x50, 0x4b, 0x03, 0x04],
  odt: [0x50, 0x4b, 0x03, 0x04],
  ods: [0x50, 0x4b, 0x03, 0x04],
  doc: [0xd0, 0xcf, 0x11, 0xe0],
  xls: [0xd0, 0xcf, 0x11, 0xe0],
  ppt: [0xd0, 0xcf, 0x11, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47],
  gif: [0x47, 0x49, 0x46, 0x38],
  jpg: [0xff, 0xd8, 0xff],
  jpeg: [0xff, 0xd8, 0xff],
};

/** Cloudflare and friends answer 403 with an interstitial, not a real page. */
const BOT_WALL_RE =
  /just a moment|請稍候|正在執行安全驗證|cf-browser-verification|Attention Required/i;

export async function probeResource(
  url: string,
  kind: ResourceKind,
  control: ControlFingerprint
): Promise<ResourceResult> {
  const needsReferer =
    kind === "attachment" ||
    kind === "archive" ||
    kind === "image" ||
    kind === "opendata";
  const response = await peek(url, {
    referer: needsReferer ? target.origin + "/" : undefined,
  });

  const [verdict, note] = judge(url, kind, response, control);
  return {
    url,
    kind,
    verdict,
    status: response.status,
    note,
    filename: response.filename || undefined,
    bytes: response.head.byteLength,
    contentType: response.contentType || undefined,
  };
}

function judge(
  url: string,
  kind: ResourceKind,
  response: Awaited<ReturnType<typeof peek>>,
  control: ControlFingerprint
): [Verdict, string] {
  if (response.status === -1) {
    const message = response.error ?? "未知錯誤";
    if (/certificate|tls|ssl/i.test(message)) {
      return ["suspect", `TLS 憑證驗證失敗：${message}`];
    }
    return ["dead", `連線失敗：${message}`];
  }

  if (response.status === 401 || response.status === 403) {
    const host = hostOf(url);
    const walled =
      BOT_WALL_RE.test(response.text) ||
      (target.botWalledHosts as readonly string[]).includes(host);
    if (walled) {
      return [
        "blocked",
        `HTTP ${response.status}，對方以自動化防護阻擋檢測，需人工用瀏覽器確認`,
      ];
    }
    return ["blocked", `HTTP ${response.status}，可能需登入或被阻擋`];
  }

  if (response.status >= 400) return ["dead", `HTTP ${response.status}`];

  const filename = response.filename.toLowerCase();
  const isFile =
    kind === "attachment" || kind === "archive" || kind === "image";

  if (isFile) {
    // The CMS answers 200 with a zero-byte "檔案不存在" file when the blob is
    // gone, so status alone never reveals it.
    const missingByName =
      control.missingAttachmentName !== null &&
      response.filename === control.missingAttachmentName;
    const missingByHint = target.missingFileHints.some((hint) =>
      filename.includes(hint.toLowerCase())
    );
    if (missingByName || missingByHint) {
      return ["dead", `伺服器回傳「${response.filename}」，後端檔案已不存在`];
    }
    if (response.head.byteLength === 0) {
      return ["dead", "回傳 0 byte，檔案內容不存在"];
    }
    if (/html/i.test(response.contentType)) {
      return looksMissing(response.text)
        ? ["dead", "附件端點回傳錯誤頁面"]
        : ["suspect", "附件端點回傳 HTML 而不是檔案"];
    }
    const extension = filename.slice(filename.lastIndexOf(".") + 1);
    const magic = MAGIC[extension];
    if (magic && !startsWith(response.head, magic)) {
      return ["suspect", `${extension.toUpperCase()} 檔頭不符，檔案可能損壞`];
    }
    return ["ok", ""];
  }

  if (looksMissing(response.text)) {
    return ["dead", "伺服器回 200，但內容是查無資料的錯誤頁"];
  }
  if (response.head.byteLength === 0 && response.status !== 204) {
    return ["suspect", "回應為空"];
  }
  return ["ok", ""];
}

function looksMissing(text: string): boolean {
  if (!text) return false;
  return target.softNotFoundPatterns.some((pattern) => pattern.test(text));
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.byteLength < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function resourceFinding(
  result: ResourceResult,
  pages: string[]
): Finding | null {
  if (result.verdict === "ok") return null;
  const severity = result.verdict === "dead" ? "dead" : "suspect";
  const category =
    result.kind === "external"
      ? "外部連結"
      : result.kind === "attachment" || result.kind === "archive"
        ? "附件"
        : result.kind === "page"
          ? "頁面"
          : result.kind === "opendata"
            ? "開放資料"
            : "資源";
  return {
    id: `resource:${result.url}`,
    severity,
    category,
    title: result.filename
      ? `${result.filename}：${result.note}`
      : `${shortLabel(result.url)}：${result.note}`,
    detail: result.note,
    url: result.url,
    label: result.filename,
    pages,
  };
}

/**
 * Sample how the target behaves for things that certainly do not exist, so
 * missing-file detection rides on live evidence instead of a keyword list that
 * rots.
 */
export async function sampleControl(): Promise<ControlFingerprint> {
  const [attachment, page] = await Promise.all([
    peek(target.origin + target.bogusAttachmentPath, {
      referer: target.origin + "/",
    }),
    peek(target.origin + target.bogusPagePath),
  ]);
  const name = attachment.filename;
  const looksMissing =
    name.length > 0 &&
    (attachment.head.byteLength === 0 ||
      target.missingFileHints.some((hint) =>
        name.toLowerCase().includes(hint.toLowerCase())
      ));
  return {
    missingAttachmentName: looksMissing ? name : null,
    bogusPageStatus: page.status,
  };
}

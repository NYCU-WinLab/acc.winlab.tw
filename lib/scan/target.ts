/**
 * Everything specific to the site being audited lives here, so pointing this
 * tool at another CMS means editing one file.
 */
export const target = {
  origin: "https://acc.nycu.edu.tw",
  hostname: "acc.nycu.edu.tw",
  label: "國立陽明交通大學主計室",

  /** Entry points. The CMS publishes a sitemap per language. */
  seeds: [
    "/",
    "/acc/ch/index",
    "/acc/en/index",
    "/acc/ch/sitemap",
    "/acc/en/sitemap",
    "/acc/ch/sitemap.xml",
    "/acc/en/sitemap.xml",
  ],

  /**
   * List endpoints paginate server-side. Asking for one big page in a GET
   * avoids replaying the POST form (and its CSRF token) per page.
   */
  listPageSize: 200,
  listPagesToProbe: 3,

  /** Social share buttons rebuild a URL per page; not content links. */
  shareHosts: [
    "line.me",
    "social-plugins.line.me",
    "twitter.com",
    "x.com",
    "facebook.com",
    "www.facebook.com",
    "linkedin.com",
    "www.linkedin.com",
  ],

  /** Hosts that answer 403 to every non-browser client (Cloudflare et al). */
  botWalledHosts: ["accessibility.moda.gov.tw", "www.dgbas.gov.tw"],

  /** A path that cannot exist, used to sample the site's own 404 behaviour. */
  bogusPagePath: "/acc/ch/app/folder/999999999",
  bogusAttachmentPath: "/acc/ch/app/data/doc?module=nycu0038&detailNo=1&type=s",

  /** Filenames the CMS hands back instead of a real attachment. */
  missingFileHints: ["檔案不存在", "file not found", "not_found"],

  softNotFoundPatterns: [
    /查無(任何)?(資料|符合)/,
    /查詢無資料/,
    /沒有(任何)?(資料|符合)/,
    /無此頁面/,
    /頁面不存在/,
    /找不到(網頁|頁面|資料)/,
    /系統發生錯誤/,
    /Whitelabel Error Page/i,
    /no data found/i,
  ],

  /** Extensions that should come back as a file, not a page. */
  documentExtensions: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "odt",
    "ods",
    "odp",
    "csv",
    "txt",
    "rtf",
  ],
  archiveExtensions: ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp"],
  imageExtensions: ["jpg", "jpeg", "png", "gif", "svg", "webp", "ico", "bmp"],

  /** Politeness + Vercel function budget. */
  concurrency: {
    pages: 8,
    resources: 12,
    archives: 4,
  },
  batchSize: {
    pages: 20,
    resources: 50,
    archives: 8,
  },
  /** Cap on pages, so a CMS link loop cannot run the scan forever. */
  maxPages: 1200,
  requestTimeoutMs: 30_000,
  /** How long before the same visitor may trigger another scan. */
  cooldownSeconds: 600,
} as const;

export const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 " +
  "acc.winlab.tw-linkcheck/1.0";

export function absolute(path: string): string {
  return new URL(path, target.origin).toString();
}

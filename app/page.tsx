import Link from "next/link";

import { Container } from "@/components/blocks/container";
import { Corner } from "@/components/blocks/corner";
import { Stack } from "@/components/blocks/stack";
import { ScanPanel } from "@/components/scan-panel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { target } from "@/lib/scan/target";

export default function Page() {
  return (
    <>
      <Corner at="top-left" className="text-xs text-foreground/60">
        <Link href="/" className="hover:text-foreground">
          Acc
        </Link>
      </Corner>
      <Corner at="top-right" className="text-xs text-foreground/60">
        <a
          href="https://portal.winlab.tw"
          className="hover:text-foreground"
          rel="noreferrer noopener"
        >
          Portal
        </a>
      </Corner>
      <Corner at="bottom-left">
        <ThemeToggle hotkey="d" />
      </Corner>
      <Corner at="bottom-right" className="text-xs text-foreground/60">
        © {new Date().getFullYear()}
      </Corner>

      <Container className="py-20">
        <Stack gap="lg">
          <Stack gap="sm">
            <h1 className="font-medium">acc.winlab.tw</h1>
            <p className="text-sm text-foreground/60">
              檢查{" "}
              <a
                href={target.origin}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {target.label}
              </a>{" "}
              網站上的附件、外部連結與 email 是否仍然有效。
            </p>
          </Stack>
          <ScanPanel />
          <Notes />
        </Stack>
      </Container>
    </>
  );
}

function Notes() {
  return (
    <div className="flex flex-col gap-1 text-xs text-foreground/35">
      <p>
        檢查方式：附件會實際下載並驗證檔頭，壓縮檔會解開確認裡面真的有檔案，
        email 會比對連結與畫面顯示是否一致並查詢網域 MX 記錄。
      </p>
      <p>
        兩點外部掃描無法回答：email 帳號是否存在（需以人員名單內部核對），
        以及沒有任何連結指向的孤島頁面。
      </p>
    </div>
  );
}

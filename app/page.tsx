import Link from "next/link";

import { Container } from "@/components/blocks/container";
import { Corner } from "@/components/blocks/corner";
import { Stack } from "@/components/blocks/stack";
import { ScanPanel } from "@/components/scan-panel";
import { target } from "@/lib/scan/target";

export default function Page() {
  return (
    <>
      <Corner at="top-left">
        <Link href="/" className="hover:text-foreground">
          Acc
        </Link>
      </Corner>
      <Corner at="bottom-right">© {new Date().getFullYear()}</Corner>

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
              的附件、外部連結與 email。
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
      <p>附件實際下載並解壓驗證，email 比對顯示文字並查 MX。</p>
      <p>查不到：email 帳號是否存在、沒有連結指向的孤島頁面。</p>
    </div>
  );
}

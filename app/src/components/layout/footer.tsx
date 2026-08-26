import Link from "next/link";
import { TelegramLogo, XLogo } from "@phosphor-icons/react";

export function Footer() {
  return (
    <footer className="mt-8 bg-[#09090b] lg:mt-12">
      <div className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8 lg:pb-8">
        <div className="rounded-2xl border border-[#29292d] bg-[#151517] px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          <div className="flex flex-col gap-10 sm:gap-12">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Connect with us
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Link
                    href="https://x.com/ansemchainfun/"
                    target="_blank"
                    rel="noreferrer"
                  className="inline-flex h-10 w-10 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-100"
                  >
                    <XLogo size={18} weight="bold" />
                  </Link>
                  <Link
                    href="https://t.me/thehodlchain/"
                    target="_blank"
                    rel="noreferrer"
                  className="inline-flex h-10 w-10 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-100"
                  >
                    <TelegramLogo size={18} weight="fill" />
                  </Link>
                </div>
              </div>

            </div>

            <div className="flex flex-col gap-5 border-t border-zinc-200 pt-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-center gap-5 text-sm text-zinc-500">
                <span>
                  {new Date().getFullYear()} ANSEM. All Rights Reserved
                </span>
                <Link
                  href="#"
                  className="transition-colors hover:text-zinc-700"
                >
                  Privacy
                </Link>
              </div>
              <p className="text-4xl font-bold tracking-tight text-zinc-100 sm:text-6xl">
                ANSEM
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

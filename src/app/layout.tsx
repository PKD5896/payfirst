import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Serif_Devanagari } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const devanagari = Noto_Serif_Devanagari({ variable: "--font-noto-devanagari", subsets: ["devanagari"], weight: ["600"] });

export const metadata: Metadata = {
  title: "PayFirst · Handloom & ethnic wear",
  description: "A demo store testing UPI-prepaid checkout nudges with Flagsmith Experimentation.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d0b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${devanagari.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border bg-card/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight text-brand">PayFirst</span>
              <span className="hidden text-sm text-muted sm:inline">Handloom &amp; ethnic wear</span>
            </Link>
            <span className="text-xs text-muted">Free returns · Ships across India</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
          Demo store for the Flagsmith Experimentation Hackathon. No real payments or deliveries.
        </footer>
      </body>
    </html>
  );
}

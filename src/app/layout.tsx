import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Roster Availability",
  description: "Submit and review weekly staff availability",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col md:h-screen md:overflow-hidden">
        <header className="shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Roster Management
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-500 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-50">
                Submit Availability
              </Link>
              <Link
                href="/today"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Today&apos;s Events
              </Link>
              <Link
                href="/admin"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex flex-1 flex-col md:min-h-0 md:overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}

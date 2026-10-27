import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { KeyboardProvider } from "@/components/keyboard/keyboard-context";
import { KeyboardPanel } from "@/components/keyboard/keyboard-panel";
import { TouchGuard } from "@/components/shared/touch-guard";
import { START_PAGE_SCRIPT } from "@/lib/start-page";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "New Kandy Essence",
  description: "Stock & Purchasing Management System",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

// themeColor moved out of `metadata` and into `viewport` -- Next.js
// deprecated Metadata.themeColor in favor of this separate export.
export const viewport: Viewport = {
  themeColor: "#2563a8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* installed app opened on the Dashboard / root: go to the new bill, once per window session */}
        <script dangerouslySetInnerHTML={{ __html: START_PAGE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <KeyboardProvider>
          <TouchGuard />
          {children}
          <KeyboardPanel />
        </KeyboardProvider>
      </body>
    </html>
  );
}

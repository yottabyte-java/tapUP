import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

// WHY: DM Sans is the shared typeface in the product's design system.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "tapUP",
  description: "The spaza tab, but with a record.",
  // WHY: The manifest lets browsers install tapUP with its branded name, theme, and app icons.
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111A1E",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg font-sans text-foreground">
        <div className="app-shell">
          <main className="app-content">{children}</main>
          <DemoBanner />
        </div>
      </body>
    </html>
  );
}

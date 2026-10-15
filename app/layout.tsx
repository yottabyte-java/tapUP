import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// WHY: DM Sans is the shared typeface in the product's design system.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "tapUP",
  description: "The spaza tab, but with a record.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}

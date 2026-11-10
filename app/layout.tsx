import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";
import CookieNotice from "../components/CookieNotice";
import ThemeInitializer from "../components/ThemeInitializer";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  title: "EdgeNote | Let good ideas find their shape",
  description: "A thoughtful home for notes, drafts, and collaborative work.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${newsreader.variable}`}>
        <ThemeInitializer />
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
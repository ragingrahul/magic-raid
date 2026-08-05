import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cinzel"
});

export const metadata: Metadata = {
  title: "Adaptive AI Raid Boss",
  description: "MagicBlock-powered cooperative raid demo"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cinzel.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

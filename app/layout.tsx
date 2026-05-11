import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/ui/brand/ThemeProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap"
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "LectureMind",
  description: "LectureMind turns lecture videos into grounded study environments."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}

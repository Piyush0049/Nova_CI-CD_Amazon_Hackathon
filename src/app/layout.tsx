import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NerveFlow CI/CD Platform - AI-Powered Pipeline Generation",
  description:
    "Automatically generate and deploy CI/CD pipelines to AWS EC2 using Claude 4.6 Sonnet AI. Connect your GitHub repositories and deploy with one click. Modern, intelligent, and efficient.",
  keywords: [
    "CI/CD",
    "pipeline automation",
    "Claude 4.6 Sonnet",
    "AWS EC2 deployment",
    "GitHub integration",
    "DevOps automation",
    "AI-powered pipelines",
    "continuous integration",
    "continuous deployment",
  ],
  authors: [{ name: "NerveFlow CI/CD Platform" }],
  creator: "NerveFlow CI/CD Platform",
  publisher: "NerveFlow CI/CD Platform",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/logo.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    apple: [
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    type: "website",
    title: "NerveFlow CI/CD Platform - AI-Powered Pipeline Generation",
    description: "Automatically generate and deploy CI/CD pipelines to AWS EC2 using Claude 4.6 Sonnet AI",
    siteName: "NerveFlow CI/CD Platform",
    images: [
      {
        url: "/logo.svg",
        width: 512,
        height: 512,
        alt: "NerveFlow CI/CD Platform Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NerveFlow CI/CD Platform - AI-Powered Pipeline Generation",
    description: "Automatically generate and deploy CI/CD pipelines to AWS EC2 using Claude 4.6 Sonnet AI",
    images: ["/logo.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#06b6d4" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

import { Providers } from "@/components/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${plusJakarta.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

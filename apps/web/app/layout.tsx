import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

import { ServiceWorkerRegistration } from "./service-worker-registration";

export const metadata: Metadata = {
  applicationName: "وكيل",
  description: "اوصف ما تحتاجه بالعربي، ووكيل ينجزه لك.",
  manifest: "/manifest.webmanifest",
  title: {
    default: "وكيل",
    template: "%s — وكيل",
  },
};

export const viewport: Viewport = {
  // The mobile keyboard resizes the layout so the composer stays attached.
  interactiveWidget: "resizes-content",
  themeColor: "#0e0e15",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          rel="preload"
          href="/fonts/cairo-arabic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a
          href="#main"
          className="wk-focus-ring sr-only rounded-md bg-accent px-4 py-2 text-fg-on-accent focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-(--wk-z-toast)"
        >
          تخطَّ إلى المحتوى
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

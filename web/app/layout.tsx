import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Titillium_Web, JetBrains_Mono } from "next/font/google";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import AddFlightSheet from "@/components/add-flight-sheet-loader";
import { ServiceWorkerCleanup } from "@/components/service-worker-cleanup";
import "./globals.css";

const titillium = Titillium_Web({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-titillium",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyFlights",
  description: "Personal flight log with honest, ADS-B-accurate trajectories.",
  applicationName: "MyFlights",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MyFlights",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0A0B0D",
  // `resizes-content` helps browsers that honor interactive-widget shrink
  // the layout viewport around the keyboard. iOS Safari still needs the
  // visualViewport fallback in the shared sheet component.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${titillium.variable} ${jetbrains.variable}`}>
      <body className="bg-bg text-text-primary min-h-dvh flex flex-col">
        <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
          {children}
        </main>
        <Suspense fallback={null}>
          <ServiceWorkerCleanup />
          <BottomTabBar />
          <AddFlightSheet />
        </Suspense>
      </body>
    </html>
  );
}

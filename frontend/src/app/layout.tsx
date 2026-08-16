import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NetworkProvider } from "@/lib/network";
import { WalletProvider } from "@/lib/wallet";
import { AppDataProvider } from "@/lib/data";
import { ToastProvider } from "@/lib/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NeXora · Borrow, Lend, Earn on Stellar",
  description:
    "NeXora is an overcollateralized lending protocol on Stellar. Supply USDC to earn, lock XLM to borrow — with live oracle pricing and dynamic rates.",
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
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NetworkProvider>
          <WalletProvider>
            <AppDataProvider>
              <ToastProvider>{children}</ToastProvider>
            </AppDataProvider>
          </WalletProvider>
        </NetworkProvider>
      </body>
    </html>
  );
}

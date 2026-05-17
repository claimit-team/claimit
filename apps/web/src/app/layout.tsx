import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthInit } from "@/components/auth/auth-init";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClaimIt",
  description: "AI agent that monitors post-purchase prices and auto-generates refund claims",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthInit>
            <TooltipProvider>{children}</TooltipProvider>
          </AuthInit>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

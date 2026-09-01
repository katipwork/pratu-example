import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pratu flows — Next.js example",
  description:
    "Login, registration, recovery, 2FA and mobile OTP against Pratu v0.3.1",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <main className="flex min-h-screen flex-col items-center justify-center p-6">
          {children}
        </main>
      </body>
    </html>
  );
}

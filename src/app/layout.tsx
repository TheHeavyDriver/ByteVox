import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ByteVox Report Builder",
  description: "Upload a CSV, build a report, share it with every number traceable.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}

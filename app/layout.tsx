import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pesquisador",
  description: "Pesquisa de negócios com dados reais do Reddit, YouTube, Google e Hacker News",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

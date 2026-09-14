import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'НЕЧТО (Stay Away!) — Настольная хоррор-игра онлайн',
  description: 'Многопользовательская психологическая игра в жанре полярного выживания и хоррора по мотивам фильма «Нечто». Играйте с друзьями через голосовой чат Discord!',
  keywords: ['НЕЧТО', 'Stay Away', 'настольная игра', 'мафия', 'психологический хоррор', 'онлайн игра с друзьями', 'дискорд'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        <meta name="theme-color" content="#070a0e" />
      </head>
      <body className="antialiased select-none text-slate-100 min-h-screen flex flex-col">
        <main className="relative z-10 flex-1 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}

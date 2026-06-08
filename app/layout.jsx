import { Cinzel, Inter } from 'next/font/google';
import './globals.css';

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
  weight: ['400', '600', '700', '800']
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter'
});

export const metadata = {
  title: 'World Cup 2026 Predictor',
  description: 'FIFA World Cup 2026 match predictor — group stage and knockouts'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${inter.variable}`}>
      <body>
        <div className="bg">
          <div className="bgBlack" aria-hidden="true" />
          <div className="bgStarball wcStarball" aria-hidden="true" />
          <div className="bgVignette" aria-hidden="true" />
          <div className="bgGrain" aria-hidden="true" />
          <div className="container">{children}</div>
        </div>
      </body>
    </html>
  );
}

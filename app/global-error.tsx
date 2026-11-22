'use client';

import localFont from 'next/font/local';
import { Spill } from '@/components/errors/spill';
import './globals.css';
import '@/app/c/campus.css';
import '@/components/errors/spill.css';

// What is shown when the root layout itself breaks. It stands in for that layout, so it brings its own document and font.
const archivo = localFont({ src: '../public/fonts/Archivo.woff2', variable: '--font-archivo', weight: '100 900', declarations: [{ prop: 'font-stretch', value: '62% 125%' }] });

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return <html lang="en" className={archivo.variable}><body><title>Something broke · Loopd</title><Spill kind="broke" error={error} retry={retry} /></body></html>;
}

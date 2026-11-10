import 'server-only';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_PDF_BYTES = 3 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_PAGES = 100;

export class ResourceInputError extends Error {}

function checkedText(text: string): string {
  if (!text.trim()) throw new ResourceInputError('This file contains no searchable text.');
  if (text.includes('\0') || Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new ResourceInputError('Extracted text exceeds 256 KiB.');
  return text;
}

async function within<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new ResourceInputError('PDF extraction took too long. Try a smaller file.');
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ResourceInputError('PDF extraction took too long. Try a smaller file.')), remaining); })]);
  } finally {
    clearTimeout(timer!);
  }
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  if (bytes.length > MAX_PDF_BYTES) throw new ResourceInputError('PDF files must be 3 MiB or smaller.');
  if (!Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from('%PDF-'))) throw new ResourceInputError('This is not a readable PDF.');
  const deadline = Date.now() + 10_000;
  const task = getDocument({ data: bytes, useSystemFonts: false, stopAtErrors: true });
  try {
    const pdf = await within(task.promise, deadline);
    if (pdf.numPages > MAX_PAGES) throw new ResourceInputError('PDF files must have 100 pages or fewer.');
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await within(pdf.getPage(number), deadline);
      const content = await within(page.getTextContent(), deadline);
      const lines: string[] = [];
      let line = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += `${line ? ' ' : ''}${item.str}`;
        if (item.hasEOL) { lines.push(line); line = ''; }
      }
      if (line) lines.push(line);
      pages.push(lines.join('\n'));
      page.cleanup();
      if (Buffer.byteLength(pages.join('\f'), 'utf8') > MAX_TEXT_BYTES) throw new ResourceInputError('Extracted text exceeds 256 KiB.');
    }
    return checkedText(pages.join('\f'));
  } catch (error) {
    if (error instanceof ResourceInputError) throw error;
    throw new ResourceInputError('This PDF is encrypted, malformed, or has no readable text. Upload a text-based PDF.');
  } finally {
    await task.destroy();
  }
}

export async function parseResourceFile(file: File): Promise<{ title: string; mediaType: 'text/plain' | 'text/markdown' | 'application/pdf'; body: string }> {
  const title = file.name.trim();
  if (!title || title.length > 200 || /[\x00-\x1f]/.test(title)) throw new ResourceInputError('Choose a file with a shorter, plain filename.');
  const extension = title.split('.').at(-1)?.toLowerCase();
  if (!['txt', 'md', 'pdf'].includes(extension ?? '')) throw new ResourceInputError('Upload a .txt, .md, or text-based .pdf file.');
  if (file.size === 0) throw new ResourceInputError('This file is empty.');
  if (file.size > (extension === 'pdf' ? MAX_PDF_BYTES : MAX_TEXT_BYTES)) throw new ResourceInputError(extension === 'pdf' ? 'PDF files must be 3 MiB or smaller.' : 'Text files must be 256 KiB or smaller.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === 'pdf') return { title, mediaType: 'application/pdf', body: await extractPdf(bytes) };
  let body: string;
  try { body = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ResourceInputError('Text files must use UTF-8 encoding.'); }
  return { title, mediaType: extension === 'md' ? 'text/markdown' : 'text/plain', body: checkedText(body) };
}

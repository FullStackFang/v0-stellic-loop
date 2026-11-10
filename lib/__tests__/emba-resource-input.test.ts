import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseResourceFile } from '@/lib/emba/resource-input';

function file(name: string, bytes: Uint8Array | string) {
  return new File([bytes instanceof Uint8Array ? new Uint8Array(bytes).buffer as ArrayBuffer : bytes], name);
}
function pdf(text: string, pages = 1) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${'3 0 R '.repeat(pages)}] /Count ${pages} >>`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(output);
  output += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${start}\n%%EOF`;
  return new TextEncoder().encode(output);
}

it('accepts UTF-8 text and Markdown and rejects unsupported or invalid files', async () => {
  expect(await parseResourceFile(file('notes.md', '# Course notes'))).toEqual({ title: 'notes.md', mediaType: 'text/markdown', body: '# Course notes' });
  await expect(parseResourceFile(file('bad.docx', 'hello'))).rejects.toThrow('.txt, .md, or text-based .pdf');
  await expect(parseResourceFile(file('empty.txt', '  '))).rejects.toThrow('no searchable text');
  await expect(parseResourceFile(file('bad.txt', new Uint8Array([0xff])))).rejects.toThrow('UTF-8');
  await expect(parseResourceFile(file('large.txt', 'x'.repeat(256 * 1024 + 1)))).rejects.toThrow('256 KiB');
});

it('extracts text from a PDF and rejects malformed or scanned-only content', async () => {
  expect(await parseResourceFile(file('course.pdf', pdf('Hello course')))).toMatchObject({ title: 'course.pdf', mediaType: 'application/pdf', body: 'Hello course' });
  await expect(parseResourceFile(file('bad.pdf', 'not pdf'))).rejects.toThrow('readable PDF');
  await expect(parseResourceFile(file('scan.pdf', pdf('')))).rejects.toThrow('no searchable text');
  await expect(parseResourceFile(file('large.pdf', new Uint8Array(3 * 1024 * 1024 + 1)))).rejects.toThrow('3 MiB');
  await expect(parseResourceFile(file('many.pdf', pdf('Hello', 101)))).rejects.toThrow('100 pages');
  const encrypted = readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'encrypted-attachment.pdf'));
  await expect(parseResourceFile(file('encrypted.pdf', encrypted))).rejects.toThrow('encrypted');
});

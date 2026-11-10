export class EmbaError extends Error {
  constructor(public readonly code: 'forbidden' | 'not_found' | 'conflict' | 'unavailable') { super(code); }
}

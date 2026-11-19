'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The words an animal is found by, on the admin's card: each one a chip that can be taken off, and a box that adds one
 * on Enter or a comma. A word may be a phrase. The form gets them as one field, with commas between; a word typed and
 * not yet entered goes with them.
 */
export function WordsField({ name, words: first }: { name: string; words: string[] }) {
  const [words, setWords] = useState(first), [typed, setTyped] = useState(''), box = useRef<HTMLInputElement>(null);
  // "Clear" resets the form: the chips go back to what is saved.
  useEffect(() => {
    const form = box.current?.form, back = () => { setWords(first); setTyped(''); };
    form?.addEventListener('reset', back);
    return () => form?.removeEventListener('reset', back);
  }, [first]);
  const word = typed.trim().toLowerCase(), add = () => { if (word && !words.includes(word)) setWords([...words, word]); setTyped(''); };
  return <span className="cs-adm-words" onClick={() => box.current?.focus()}>
    <input type="hidden" name={name} value={[...words, word].filter(Boolean).join(',')} />
    {words.map(each => <span key={each}>{each}<button type="button" aria-label={`Remove ${each}`} onClick={() => setWords(words.filter(one => one !== each))}>×</button></span>)}
    <input ref={box} value={typed} aria-label="Add a search word" placeholder="add a word or phrase, then Enter" maxLength={40} onChange={event => setTyped(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); } else if (event.key === 'Backspace' && !typed) setWords(words.slice(0, -1)); }} />
  </span>;
}

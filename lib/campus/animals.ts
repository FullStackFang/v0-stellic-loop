/** public/animals, 01 to 36: icons by Tran Mau Tri Tam, CC BY 4.0. These are the ones given by default and at the door. */
export const ANIMALS = 36;
/** public/animals, 37 on: premium animals Loopd had made, by name. A person picks one; nobody is given one. */
export const PREMIUM = ['Dachshund', 'Cornell bear', 'Columbia lion', 'NYU bobcat', 'Baruch bearcat', 'Brooklyn bulldog', 'Oakland grizzly', 'Maryland terrapin', 'Buffalo bull', 'Georgetown bulldog', 'Quinnipiac bobcat', 'Wellesley goose'];
/** Animals that are one school's own, by number. They are neither core nor premium: free to people of that school, and offered to nobody else. A school may have more than one: CUNY has one for each college drawn so far, and all of CUNY may pick any of them. */
export const MASCOT: Record<number, string> = { 37: 'cornell', 38: 'columbia', 39: 'nyu', 40: 'cuny', 41: 'cuny', 42: 'oakland', 43: 'maryland', 44: 'buffalo', 45: 'georgetown', 46: 'quinnipiac', 47: 'wellesley' };
const face = (n: number) => String(n % (ANIMALS + PREMIUM.length) + 1).padStart(2, '0');
/** Where a page shows animal `n` of the set: WebP, made from its PNG by scripts/animals-webp.mjs (openspec loop-lighter-pages, D2). */
export const animal = (n: number) => `/animals/${face(n)}.webp`;
/** Animal `n`'s PNG, the drawing itself: for reading from disk on the server, where only the PNGs are shipped (next.config.ts). */
export const animalPng = (n: number) => `/animals/${face(n)}.png`;
/** The animal a person has until they pick one: the same one every time, for the same person. */
export const animalOf = (personId: string) => parseInt(personId.replace(/-/g, '').slice(0, 8), 16) % ANIMALS;
/** A pick that is not an animal: the photo of the person's sign-in account. */
export const PHOTO = -1;
/** A pick that is the animal a person had made from their own photo (lib/campus/custom-face.ts). */
export const CUSTOM = -2;
/** What a person may ask to be different when their animal is drawn once more. */
export const CHANGES = ['Fluffier', 'Bigger eyes', 'Different pose', 'Truer colors'] as const;
export const customFace = (token: string) => `/animals/custom/${token}`;
/** What each of the set's 36 is, in order: a made animal is drawn after the one nearest to the photo. */
export const NAMES = ['horse', 'snail', 'elephant', 'bee', 'octopus', 'pig', 'frog', 'chicken', 'dinosaur', 'cat', 'turtle', 'penguin', 'koala', 'sheep', 'panda', 'chick', 'fox', 'tortoise',
  'crab', 'giraffe', 'hedgehog', 'seal', 'shiba dog', 'cow', 'narwhal', 'grey panda', 'lamb', 'bat', 'hatching chick', 'axolotl', 'platypus', 'hamster', 'sloth', 'bluebird', 'jellyfish', 'snail with a sprout'];

/** public/animals, 01 to 36: icons by Tran Mau Tri Tam, CC BY 4.0. These are the ones given by default and at the door. */
export const ANIMALS = 36;
/** public/animals, 37 on: premium animals Loop had made, by name. A person picks one; nobody is given one. */
export const PREMIUM = ['Dachshund'];
export const animal = (n: number) => `/animals/${String(n % (ANIMALS + PREMIUM.length) + 1).padStart(2, '0')}.png`;
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

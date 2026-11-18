/** public/animals: 36 icons by Tran Mau Tri Tam, CC BY 4.0. */
export const ANIMALS = 36;
export const animal = (n: number) => `/animals/${String(n % ANIMALS + 1).padStart(2, '0')}.png`;
/** The animal a person has until they pick one: the same one every time, for the same person. */
export const animalOf = (personId: string) => parseInt(personId.replace(/-/g, '').slice(0, 8), 16) % ANIMALS;
/** A pick that is not an animal: the photo of the person's sign-in account. */
export const PHOTO = -1;

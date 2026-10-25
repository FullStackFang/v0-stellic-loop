import { describe, expect, it } from "vitest";
import { codeText, dropText, maybeText, onMissedText, onNoDayText, onText, oneMoreText } from "../copy";

const L = "https://board.test/m/" + "x".repeat(60 - "https://board.test/m/".length);
const TUE = "2027-02-16";

// GSM-7: the basic set counts 1, the extension table 2; 153 per segment once split.
const BASIC = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]$/;
const EXT = /^[\^{}\[~\]|€]$/;
function segments(s: string): number {
  let n = 0;
  for (const c of s) {
    if (BASIC.test(c)) n += 1;
    else if (EXT.test(c)) n += 2;
    else throw new Error(`not GSM-7: ${JSON.stringify(c)}`);
  }
  return n <= 160 ? 1 : Math.ceil(n / 153);
}

describe("text copy", () => {
  it("reads as the specs say", () => {
    expect(codeText("012345")).toBe("Quorum code: 012345. It expires in 10 minutes.");
    expect(onText("Suits", TUE, "7pm", 8, L)).toBe(`Suits is on: Tue 16, 7pm. 8 in. ${L} Got an idea? Post it on the board.`);
    expect(onText("Suits", TUE, null, 8, L)).toBe(`Suits is on: Tue 16. 8 in. ${L} Got an idea? Post it on the board.`);
    expect(onMissedText("Suits", TUE, 8, L)).toBe(`Suits is on for Tue 16, a day you didn't pick. 8 in. Still in? ${L}`);
    expect(onNoDayText("Suits", 8, L)).toBe(`Suits is on. 8 in. ${L} Got an idea? Post it on the board.`);
    expect(maybeText("Suits", 8, L)).toBe(`Suits is on. 8 in. You said maybe. In? ${L}`);
    expect(dropText("Marcus", "Suits", 7, L)).toBe(`Marcus dropped out of Suits. 7 in. ${L}`);
  });

  it("says Someone for a hidden name", () => {
    expect(dropText(null, "Suits", 7, L)).toBe(`Someone dropped out of Suits. 7 in. ${L}`);
  });

  it("says One more at one short, {k} more otherwise", () => {
    expect(oneMoreText(7, 8, "Suits", L)).toBe(`7 of 8 for Suits. One more and it's on. Send it to someone: ${L}`);
    expect(oneMoreText(6, 8, "Suits", L)).toBe(`6 of 8 for Suits. 2 more and it's on. Send it to someone: ${L}`);
  });

  it("stays within two segments at the longest title, time and name", () => {
    const title = "T".repeat(120), time = "m".repeat(40), name = "N".repeat(80);
    const bodies = [
      codeText("999999"),
      onText(title, TUE, time, 999, L),
      onMissedText(title, TUE, 999, L),
      onNoDayText(title, 999, L),
      maybeText(title, 999, L),
      dropText(name, title, 999, L),
      oneMoreText(997, 999, title, L),
    ];
    for (const b of bodies) expect(segments(b), b).toBeLessThanOrEqual(2);
  });
});

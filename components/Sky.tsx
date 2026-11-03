import type { Sky as SkyKind } from "@/lib/solar";
import { Rain } from "./Rain";
function makeStars() {
  let seed = 7;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  return Array.from({ length: 22 }, (_, i) => { const x = 14 + random() * 362, y = 18 + random() * 300, k = random(); return <circle key={i} cx={x} cy={y} r={k < .2 ? 2.4 : k < .6 ? 1.7 : 1.2} />; });
}
const stars = makeStars();
export function Sky({ sky }: { sky: SkyKind }) {
  return <div className="sky" aria-hidden="true"><svg className="stars" viewBox="0 0 390 844">{stars}</svg><div className="disc s" /><div className="disc m" />{sky !== "clear" ? <svg className="cloud" viewBox="0 0 190 96"><path d="M35 84C-3 84-3 38 30 34C33 0 88-6 105 23C139 6 171 27 164 47C200 51 192 84 164 84Z" /></svg> : null}{sky === "rain" ? <Rain /> : null}</div>;
}

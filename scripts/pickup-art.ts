// Opt-in, real spend (about 3.5 cents a picture): draws Conga's pickups as toy figures in the style of the animals, the
// way a member's own pet is drawn (lib/campus/custom-face.ts): one original animal and one short line, on GPT Image Flare.
//   node --import tsx scripts/pickup-art.ts [names...]
// Pictures land in public/demo/pickup-art/: one of each named (every one when none is named), as an object with no face.
import { generateImage } from 'ai';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const PICKUPS = {
  megaphone: 'a megaphone, red with a white band and a white bell',
  coffee: 'a takeaway coffee cup, white with a brown card sleeve and a white lid, a little steam rising',
  whistle: "a referee's whistle, sunny yellow, with a short red cord",
  // The cars that bring animals in: Ithaca's bus and Roosevelt Island's tram.
  bus: 'a small round city bus, sky blue with a white roof and big windows, seen from the side and a little above',
  tram: 'an aerial tramway cabin, red with big windows, hanging from a short grey arm on a cable, seen from the side and a little above',
  // What stands on the grounds, each seen from above at a slant, as on a game map.
  tree: 'a round leafy tree, a chubby green crown on a short brown trunk, seen from above at a slant',
  blossom: 'a cherry blossom tree, a chubby crown of soft pink blossom on a short brown trunk, seen from above at a slant',
  ferry: 'a small white passenger ferry boat with a blue cabin and big windows, seen from above at a slant',
  tug: 'a small red tugboat with a white cabin and a black funnel, seen from above at a slant',
  cab: 'a yellow New York taxi cab, seen from above at a slant',
  // The same cab driving away, for cabs going up the screen (the front view would look like it was reversing).
  cabback: 'a yellow New York taxi cab seen from behind and a little above, driving away from us and turned toward the upper left: its back bumper, red tail lights and rear window toward us, a small white TAXI sign on its roof, a checkered stripe along its side',
  clocktower: 'a tall slender stone clock tower with a pointed roof and a clock face, seen from above at a slant',
  lighthouse: 'a short grey stone lighthouse with eight sides and a yellow lamp at the top, seen from above at a slant',
  // The halls, each a small toy building seen from the front and a little above, as on a game map. One picture serves several halls.
  stonehall: 'a grey stone gothic college hall with a slate roof, arched windows and a short square tower, seen from the front and a little above',
  chapel: 'a small red-brick chapel with a slim spire and a round window, seen from the front and a little above',
  glasshall: 'a modern college building of pale stone and big blue glass windows, flat roof, seen from the front and a little above',
  brickhall: 'a long red-brick college hall with white window frames and a grey roof, seen from the front and a little above',
  armory: 'a big grey stone armory hall with a rounded arched roof and small corner towers, seen from the front and a little above',
  rink: 'an ice rink arena with a wide curved silver roof and red-brick walls, seen from the front and a little above',
  dome: 'a concert hall of pale brick with a shallow round dome and white columns at the front, seen from the front and a little above',
  museum: 'a modern concrete art museum, a blocky shape with a big open square gap through its middle, seen from the front and a little above',
  castle: 'a red-brick college dormitory that looks like a little castle, with turrets and a pointed roof, seen from the front and a little above',
  dorm: 'a cream college dormitory block, three floors, rows of blue windows and a flat roof, seen from the front and a little above',
  cafe: 'a small corner bagel cafe with a striped red awning and big windows, seen from the front and a little above',
  bloomberg: 'a modern low college building with a big flat roof canopy of blue solar panels sticking out over it, seen from the front and a little above',
  tata: 'a modern glass college building in two wings with a sloping cut between them, pale blue glass, seen from the front and a little above',
  tower: 'a tall slim modern residential tower, pale grey with thin vertical stripes, seen from the front and a little above',
  station: 'a small aerial tram station, red, with a big round opening where the cable car comes in, seen from the front and a little above',
  subway: 'a small subway station entrance with stairs going down, green railings and two round lamps, seen from the front and a little above',
  ruin: 'the stone ruin of an old gothic hospital, walls with empty arched windows and no roof, ivy and grass inside, seen from the front and a little above',
  farmhouse: 'a small white wooden farmhouse with a grey pitched roof and a chimney, seen from the front and a little above',
  stonechapel: 'a small grey stone church with a square bell tower and a red door, seen from the front and a little above',
  octagon: 'an eight-sided domed stone building with two long wings, seen from the front and a little above',
  // Four Freedoms Park at Roosevelt Island's south tip: the granite room at the point of the lawn.
  fourfreedoms: 'a memorial park at the tip of an island: a pale granite plaza open to the sky, walled on three sides by tall plain granite blocks, a big bronze head sculpture set in a granite niche at the back wall, a few round trees and a strip of green lawn leading up to it, seen from the front and a little above',
  // Columbia's Morningside campus and Manhattanville (maps.js 'columbia'); the founder said yes 2026-11-23.
  lowlibrary: 'a grand pale grey stone library with a wide low dome on top, a row of tall columns across its front and a broad flight of steps leading up to it, seen from the front and a little above',
  butler: 'a long pale stone library with a row of tall columns all along its front and names carved in a band above them, a flat roof, seen from the front and a little above',
  cathedral: 'a huge grey stone gothic cathedral with a big round rose window over its front doors and two short square towers, seen from the front and a little above',
  train: 'a New York subway car, silver with a red band along its side, a round red "1" sign on its front, seen from the side and a little above',
  almamater: 'a dark bronze statue with a soft green-brown patina of a seated robed woman with her arms held open, a laurel wreath on her head and an open book on her lap, on a square pale grey granite pedestal with a few steps, seen from the front and a little above',
  riverside: 'a massive square grey stone gothic church tower, much taller than it is wide, with tall narrow pointed windows up its sides and four small pinnacles at its top corners and no spire, a long low church nave at its foot, seen from the front and a little above',
  // Columbia Business School, at Manhattanville: two glass halls across a small square.
  kravis: 'a modern eleven-storey building of clear glass wrapped in thin white horizontal fins, slightly twisting floors, seen from the front and a little above',
  geffen: 'a modern eight-storey building of glass and white stone bands, its floors stacked a little out of line with each other, seen from the front and a little above',
  // NYU round Washington Square (maps.js 'nyu'); the founder said yes 2026-11-23.
  wsqarch: 'a white marble triumphal arch with one tall round archway, carved figures standing against its two front piers and a carved band along its flat top, seen from the front and a little above',
  wsqfountain: 'a round stone fountain: a wide shallow round basin with a pale grey stone rim, a tall jet of water spraying up from its middle and falling back into the water, seen from the front and a little above',
  bobst: 'a big plain square twelve-storey library block of red sandstone, flat walls with tall narrow vertical window slots running up them, a flat roof, seen from the front and a little above',
  judson: 'a yellow brick and pale stone romanesque church with round-arched windows and a tall square bell tower with a small open arcade at its top, seen from the front and a little above',
  silver: 'a ten-storey pale grey stone college building in the gothic style with tall narrow windows, purple flags hanging over its arched front door, seen from the front and a little above',
  kimmel: 'a modern ten-storey college student centre of reddish brown stone, a tall glass front showing a wide staircase climbing inside, purple banners at its door, seen from the front and a little above',
  stern: 'a modern business school building of brown brick with long horizontal bands of windows and a glass entrance, purple banners at its door, seen from the front and a little above',
  paulson: 'a tall new college building of glass and pale terracotta panels: a wide base with two towers of different heights rising from it, seen from the front and a little above',
  // Water that stands on the ground like a building: a small pond model, nothing moving on it.
  pond: 'a small round pond diorama: soft teal water edged with round pale stones, green lily pads with one pink flower, a clump of reeds with brown cattails at one side, and a little white duck, seen from the front and a little above',
  pondlong: 'a long oval pond diorama: soft teal water edged with round pale stones, green lily pads with one pink flower, reeds with brown cattails at one end and a small wooden jetty at the other, seen from the front and a little above',
  // Where a car lets its riders off: one roped-off queue that stands on every stop's felt platform.
  queue: 'a wide oval roped-off queue area, like at a cinema: ten short round wooden posts with round brass knob tops standing in an oval, joined by a thick soft cream plush cord hanging in gentle loops between them, the middle of the oval empty, seen from the front and a little above',
  // What a scattered line leaves on the ground; the game draws its count on it.
  sack: 'a plush drawstring sack, cream coloured and bulging full, tied at the top with a red cord, a small round tag with a paw print hanging from the cord',
  medal: 'a round gold medal with a star on its face, hanging from a short red and white ribbon',
  popper: 'a party popper cone, striped red and white, with colourful confetti and curly streamers bursting out of its open end',
};
const STYLE = 6; // the pig: one of the cleanest of the set

async function main() {
  try { process.loadEnvFile('.env.local'); } catch { /* the key can come from the shell */ }
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY in .env.local');
  const like = await sharp(`public/animals/${String(STYLE).padStart(2, '0')}.png`).resize(512, 512).flatten({ background: '#fff' }).png().toBuffer();
  const folder = 'public/demo/pickup-art';
  mkdirSync(folder, { recursive: true });
  const only = process.argv.slice(2);
  const asks = Object.entries(PICKUPS).filter(([name]) => !only.length || only.includes(name)).map(([name, what]) => [name,
    `Make ${what} as a toy figure in exactly the style of this picture: the same soft matte clay, chubby rounded simple shapes, soft colours and soft light. An object only, with no face. Transparent background, no shadow.`]);
  await Promise.all(asks.map(async ([label, text]) => {
    try {
      const { images } = await generateImage({
        model: 'openai/gpt-image-2.6-flare', size: '1024x1024', n: 1, maxRetries: 1, abortSignal: AbortSignal.timeout(180000),
        prompt: { images: [like], text },
        providerOptions: { openai: { background: 'transparent', output_format: 'png' } },
      });
      // Trimmed to the figure and kept at 512px at most; the game packs them smaller (scripts/conga-scenery.mjs).
      await Promise.all(images.map(async image => writeFileSync(`${folder}/${label}.png`,
        await sharp(image.uint8Array).trim().resize(512, 512, { fit: 'inside' }).png().toBuffer())));
      console.log(`${label}: ${images.length}`);
    } catch (error) {
      console.error(`${label}: failed. ${error instanceof Error ? error.message.slice(0, 300) : 'Unknown error'}`);
    }
  }));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

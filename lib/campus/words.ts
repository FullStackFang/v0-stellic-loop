// What an event is good for, in plain words, so that "exercise" finds a run, a hike and a pickup game (design D10).
// A fixed table the founder can read and correct: a word found in the title, the host name or the about text gives
// the event its "good for" words. No model is asked. The founder can still edit any event's words on the admin page.

export const MOST_WORDS = 12;

// [what to look for, as whole words] -> [what the event is good for]
const TABLE: [RegExp, string[]][] = [
  [/\b(run|runs|running|runners?|jog|jogging|5k|10k|marathon)\b/, ['run', 'exercise', 'workout', 'active', 'fitness', 'cardio', 'outside']],
  [/\b(hike|hikes|hiking|trail|trails|gorge|outing|outdoors?|nature|sunrise|camping|climb|climbing)\b/, ['exercise', 'active', 'outside', 'outdoors', 'nature', 'walk']],
  [/\b(basketball|soccer|volleyball|football|tennis|frisbee|hockey|lacrosse|softball|baseball|badminton|pickleball|squash|rugby|intramurals?|pickup|open gym)\b/, ['exercise', 'workout', 'active', 'sport', 'game', 'play', 'team']],
  [/\b(yoga|pilates|gym|fitness|workout|lift|lifting|spin|swim|swimming|zumba|vinyasa|meditation)\b/, ['exercise', 'workout', 'active', 'fitness', 'wellness']],
  [/\b(dance|dancing|ballroom|salsa|swing|bhangra)\b/, ['dance', 'exercise', 'active', 'music', 'social']],
  [/\b(dinner|lunch|brunch|breakfast|dumplings?|pizza|potluck|bbq|barbecue|tacos?|food|eat|eats|supper|treats|snacks|ramen|sushi|bake|baking|cooking|restaurant)\b/, ['food', 'eat', 'hungry', 'social', 'people']],
  [/\b(coffee|cafe|café|tea|boba)\b/, ['coffee', 'cafe', 'social', 'chill']],
  [/\b(study|studying|homework|problem set|pset|prelim|exam|finals|review session|office hours|tutoring|library)\b/, ['study', 'homework', 'work', 'focus', 'quiet', 'class']],
  [/\b(writing|thesis|write|sprint)\b/, ['write', 'writing', 'study', 'focus', 'quiet']],
  [/\b(chess|blitz|trivia|board games?|game night|games|poker|bingo|esports|gaming|puzzle|puzzles)\b/, ['game', 'games', 'play', 'indoor', 'chill']],
  [/\b(startups?|founders?|entrepreneurs?|entrepreneurship|venture|pitch|demo night|hackathon|builders?)\b/, ['startup', 'startups', 'founders', 'build', 'network', 'career']],
  [/\b(career|careers|resume|résumé|recruiting|internships?|jobs?|networking|interview|interviews)\b/, ['career', 'job', 'jobs', 'internship', 'network']],
  [/\b(talk|lecture|seminar|panel|fireside|speaker|colloquium|workshop|symposium)\b/, ['talk', 'learn']],
  [/\b(film|films|movie|movies|cinema|screening|shorts)\b/, ['film', 'movie', 'watch', 'chill']],
  [/\b(concert|music|band|orchestra|choir|a cappella|jazz|recital|open mic|karaoke|dj)\b/, ['music', 'listen', 'night']],
  [/\b(art|arts|gallery|museum|painting|drawing|crafts?|pottery|theatre|theater|comedy|improv)\b/, ['art', 'make', 'chill']],
  [/\b(volunteer|volunteering|service|cleanup|fundraiser|fundraising|drive)\b/, ['volunteer', 'help', 'community']],
  [/\b(social|mixer|party|hangout|meetup|happy hour)\b/, ['social', 'meet', 'people']],
  [/\b(code|coding|tech|engineering|robotics|ai|data|design)\b/, ['tech', 'build', 'learn']],
];

// Words that are one tag when typed after an @ ("@jogging" is "@running"), each of them something to do (openspec
// loop-campus-tags, design D4). Narrower than the table above on purpose: soccer and basketball are both sport there,
// and are not one tag. A row of one word only says that the word is something to do.
const SAME: string[][] = [
  'run runs running runner runners jog jogs jogging', 'hike hikes hiking', 'walk walks walking', 'bike bikes biking cycling',
  'swim swims swimming', 'climb climbs climbing bouldering', 'lift lifts lifting weights', 'dance dances dancing', 'ski skiing', 'skate skating',
  'study studying homework pset psets', 'cook cooking', 'bake baking', 'code coding', 'movie movies film films',
  'eat eats eating food dinner dining supper', 'lunch', 'brunch', 'breakfast', 'coffee', 'boba bubbletea', 'drinks drinking', 'party parties partying',
  'workout workouts exercise', 'meditate meditation', 'read reading bookclub', 'paint painting', 'draw drawing', 'music jam jamming', 'concert concerts',
  'boardgame boardgames', 'gaming videogames', 'bowl bowling', 'shop shopping', 'thrift thrifting', 'hackathon hackathons', 'volunteer volunteering',
  'yoga', 'pilates', 'soccer futbol', 'basketball hoops bball', 'volleyball', 'tennis', 'frisbee ultimate', 'pickleball', 'badminton', 'squash', 'golf',
  'football', 'baseball', 'softball', 'pingpong tabletennis', 'chess', 'poker', 'trivia', 'karaoke',
].map(row => row.split(' '));
/** A tag without its dashes and its plural "s": "college-town" is "collegetown", and "dumplings" is "dumpling". */
const bare = (slug: string) => slug.replace(/-/g, '').replace(/(?<=[a-z0-9]{3})(?<!s)s$/, '');

/**
 * Which row a tag falls under. Two tags with the same `key` mean the same thing: they are in one row above, or differ
 * only by a dash or a plural. `activity` says the table knows the word as something to do.
 */
export function tagRow(slug: string): { key: string; activity: boolean } {
  const word = bare(slug), row = SAME.find(words => words.some(each => bare(each) === word));
  return { key: row ? row[0] : word, activity: !!row };
}

const plain = (text: string | null | undefined) => (text ?? '').toLowerCase().replace(/[^a-z0-9é\s-]+/g, ' ');

/** Up to twelve "good for" words. Words from the title come first, then the host's, then the about text's. */
export function goodFor(title: string, about: string | null | undefined, host: string | null | undefined): string[] {
  const found: string[] = [];
  for (const text of [title, host, about].map(plain))
    for (const [look, words] of TABLE) if (look.test(text)) for (const word of words) if (!found.includes(word)) found.push(word);
  return found.slice(0, MOST_WORDS);
}

/** Words as the admin typed them: plain lowercase words, each once, at most twelve. */
export function cleanWords(typed: string): string[] {
  const words = [...new Set(typed.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))];
  if (words.length > MOST_WORDS) throw new Error('An event has at most twelve words');
  if (words.some(word => word.length > 30)) throw new Error('A word is at most 30 letters');
  return words;
}

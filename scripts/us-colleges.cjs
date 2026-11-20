// Builds lib/campus/us-colleges.json, the list "Sign up my school" searches, from the US government's college
// directory (IPEDS, "Institutional Characteristics: Directory information", https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip).
// Run by hand when the list should be renewed:  node scripts/us-colleges.cjs path/to/HD2024.csv
// Kept: schools that are open and grant degrees, two-year or four-year, without the offices that run a group of them. Each row is [name, city, state, web domain, size 0-5, short names].
const fs = require('fs'), path = require('path');

// Short names people type that the directory does not carry.
const SHORT = {
  'University of Michigan-Ann Arbor': ['umich', 'u of m', 'uofm'], 'Massachusetts Institute of Technology': ['mit'], 'New York University': ['nyu'],
  'University of California-Berkeley': ['ucb', 'cal', 'uc berkeley'], 'University of California-Los Angeles': ['ucla'], 'University of Southern California': ['usc'],
  'The University of Texas at Austin': ['ut', 'ut austin', 'utexas'], 'Pennsylvania State University-Main Campus': ['psu', 'penn state'], 'University of Pennsylvania': ['upenn', 'penn'],
  'Ohio State University-Main Campus': ['osu', 'ohio state'], 'University of Florida': ['uf'], 'Georgia Institute of Technology-Main Campus': ['gatech', 'georgia tech', 'gt'],
  'University of Illinois Urbana-Champaign': ['uiuc'], 'University of Wisconsin-Madison': ['uw madison'], 'University of Washington-Seattle Campus': ['uw', 'udub'],
  'University of North Carolina at Chapel Hill': ['unc'], 'University of Virginia-Main Campus': ['uva'], 'Virginia Polytechnic Institute and State University': ['vt', 'virginia tech'],
  'California Institute of Technology': ['caltech'], 'Carnegie Mellon University': ['cmu'], 'Boston University': ['bu'], 'Boston College': ['bc'], 'Northeastern University': ['neu'],
  'University of Chicago': ['uchicago'], 'Rutgers University-New Brunswick': ['rutgers', 'ru'], 'Michigan State University': ['msu'], 'Arizona State University Campus Immersion': ['asu'],
  'University of Maryland-College Park': ['umd'], 'Purdue University-Main Campus': ['purdue'], 'Texas A&M University-College Station': ['tamu', 'texas a&m', 'texas am'],
  'University of Minnesota-Twin Cities': ['umn'], 'Indiana University-Bloomington': ['iu'], 'University of Colorado Boulder': ['cu boulder'], 'Florida State University': ['fsu'],
  'University of Georgia': ['uga'], 'Louisiana State University and Agricultural & Mechanical College': ['lsu'], 'Brigham Young University': ['byu'], 'Southern Methodist University': ['smu'],
  'University of Notre Dame': ['notre dame', 'nd'], 'Johns Hopkins University': ['jhu'], 'Washington University in St Louis': ['washu', 'wustl'], 'University of Miami': ['umiami'],
  'University of California-San Diego': ['ucsd'], 'University of California-Davis': ['ucd', 'uc davis'], 'University of California-Irvine': ['uci'], 'University of California-Santa Barbara': ['ucsb'],
  'University of California-Santa Cruz': ['ucsc'], 'University of Massachusetts-Amherst': ['umass'], 'University of Connecticut': ['uconn'], 'Rensselaer Polytechnic Institute': ['rpi'],
  'Rochester Institute of Technology': ['rit'], 'University at Buffalo': ['ub', 'suny buffalo'], 'Stony Brook University': ['sbu', 'suny stony brook'], 'Binghamton University': ['suny binghamton'],
};

/** One line of the file, split on the commas that are not inside quotes. */
const cells = line => { const out = []; let at = '', quoted = false; for (const each of line) { if (each === '"') quoted = !quoted; else if (each === ',' && !quoted) { out.push(at); at = ''; } else at += each; } out.push(at); return out; };
const lines = fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean), head = cells(lines[0]);
const col = name => { const at = head.indexOf(name); if (at < 0) throw new Error(`No column ${name}`); return at; };
const [NAME, ALIAS, CITY, STATE, WEB, LEVEL, DEGREES, ACTIVE, SIZE] = ['INSTNM', 'IALIAS', 'CITY', 'STABBR', 'WEBADDR', 'ICLEVEL', 'DEGGRANT', 'CYACTIVE', 'INSTSIZE'].map(col);
const domain = web => web.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\d?\./, '');
const seen = new Set(), left = new Set(Object.keys(SHORT));
const rows = lines.slice(1).map(cells).filter(each => each[ACTIVE] === '1' && each[DEGREES] === '1' && ['1', '2'].includes(each[LEVEL]) && !each[NAME].toLowerCase().includes('system office')).map(each => {
  const name = each[NAME].trim().replace(/\s+/g, ' '), given = each[ALIAS].split(/[|,;]/).map(one => one.trim().replace(/\s+/g, ' ')).filter(one => one.length > 1 && one.length <= 40);
  left.delete(name);
  const town = each[CITY].trim().replace(/\s+/g, ' ');
  return [name, /[a-z]/.test(town) ? town : town.toLowerCase().replace(/\b[a-z]/g, one => one.toUpperCase()), each[STATE].trim(), domain(each[WEB]), Math.max(0, Number(each[SIZE]) || 0), [...new Set([...(SHORT[name] ?? []), ...given].map(one => one.toLowerCase()))]];
}).filter(each => { const key = each.slice(0, 3).join('|').toLowerCase(); return seen.has(key) ? false : seen.add(key); }).sort((a, b) => a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]));
if (left.size) throw new Error(`Short names for schools not in the file: ${[...left].join('; ')}`);
const to = path.join(__dirname, '..', 'lib', 'campus', 'us-colleges.json');
fs.writeFileSync(to, '[\n' + rows.map(each => JSON.stringify(each)).join(',\n') + '\n]\n');
console.log(`${rows.length} schools to ${to}`);

// Victorian Accident Coordination Centre (ACC) tow truck depot data.
// Source: Transport Victoria / VicRoads monthly allocation lists.
// Covers Melbourne Controlled Area only — regional Victoria is self-managed.

const DEPOTS = [
  // ── Southern ─────────────────────────────────────────────────────────────
  { depot: 604, region: 'S', company: null, suburbs: ['Highett','Beaumaris','Mentone','Dingley Village','Braeside','Aspendale'] },
  { depot: 776, region: 'S', company: null, suburbs: ['Highett','Beaumaris','Mentone','Dingley Village','Braeside','Aspendale'] },
  { depot: 605, region: 'S', company: 'Allcar Towing Group', suburbs: ['Clayton','Clayton South','Mulgrave','Clarinda','Springvale'] },
  { depot: 607, region: 'S', company: 'Sheen Group', suburbs: ['Frankston','Frankston South','Seaford','Sandhurst','Langwarrin'] },
  { depot: 736, region: 'S', company: null, suburbs: ['Mornington','Safety Beach','Merricks Beach','Balnarring'] },
  { depot: 758, region: 'S', company: null, suburbs: ['Cranbourne','Warneet','Clyde','Botanic Ridge'] },
  { depot: 765, region: 'S', company: 'Allcar Towing Group', suburbs: ['Somerville','Pearcedale','Somers'] },
  { depot: 767, region: 'S', company: 'Allcar Towing Group', suburbs: ['Portsea','St Andrews Beach','Rosebud','Arthurs Seat','Flinders','Point Leo'] },
  { depot: 802, region: 'S', company: 'Allcar Towing Group', suburbs: ['Heatherton','Moorabbin Airport','Mordialloc','Aspendale'] },
  { depot: 839, region: 'S', company: 'Melbourne Towing Service', suburbs: ['Melbourne','Toorak','Elwood','Southbank'] },
  { depot: 842, region: 'S', company: null, suburbs: ['Carrum Downs','Chelsea','Aspendale','Bangholme'] },
  { depot: 861, region: 'S', company: null, suburbs: ['Ormond','Beaumaris','Hampton','Brighton'] },
  // ── Eastern ──────────────────────────────────────────────────────────────
  { depot: 606, region: 'E', company: 'Sheen Group', suburbs: ['Montrose','Ringwood East','Warranwood','Mooroolbark','Upper Ferntree Gully','Scoresby','Rowville','Belgrave'] },
  { depot: 699, region: 'E', company: 'Berwick Towing Service', suburbs: ['Berwick','Lang Lang','Bunyip','Pakenham'] },
  { depot: 709, region: 'E', company: 'Allcar Towing Group', suburbs: ['Berwick','Officer','Cranbourne North','Narre Warren'] },
  { depot: 741, region: 'E', company: null, suburbs: ['Oakleigh','Clarinda','Springvale','Mulgrave'] },
  { depot: 743, region: 'E', company: null, suburbs: ['Cockatoo','Gembrook'] },
  { depot: 747, region: 'E', company: null, suburbs: ['Chadstone','Notting Hill','Oakleigh South','Hughesdale'] },
  { depot: 764, region: 'E', company: null, suburbs: ['Emerald','Selby'] },
  { depot: 814, region: 'E', company: 'Box Hill Towing', suburbs: ['Doncaster','Forest Hill','Burwood','Box Hill'] },
  { depot: 820, region: 'E', company: null, suburbs: ['Mount Waverley','Glen Waverley','Scoresby','Noble Park','Clayton'] },
  { depot: 825, region: 'E', company: 'Allcar Towing Group', suburbs: ['Lysterfield','Hallam','Lynbrook','Bangholme','Keysborough','Dandenong'] },
  { depot: 844, region: 'E', company: null, suburbs: ['Kooyong','Balwyn','Kew'] },
  { depot: 864, region: 'E', company: null, suburbs: ['Mount Waverley','Clarinda','Ormond','Malvern'] },
  { depot: 879, region: 'E', company: 'Box Hill Towing', suburbs: ['Doncaster','Doncaster East','Box Hill','Burwood','Balwyn'] },
  // ── Northern ─────────────────────────────────────────────────────────────
  { depot: 703, region: 'N', company: null, suburbs: ['Whittlesea','Doreen','Plenty','Reservoir','Lalor','Wollert'] },
  { depot: 704, region: 'N', company: null, suburbs: ['Melbourne Airport','Essendon','Albion','Cairnlea','Keilor'] },
  { depot: 719, region: 'N', company: 'Garden State Towing', suburbs: ['Fairfield','Kew','Fitzroy'] },
  { depot: 792, region: 'N', company: null, suburbs: ['Fairfield','Kew','Fitzroy'] },
  { depot: 744, region: 'N', company: null, suburbs: ['Yuroke','Craigieburn','Somerton','Jacana','Greenvale'] },
  { depot: 745, region: 'N', company: null, suburbs: ['Brunswick','Flemington','Coburg','Essendon'] },
  { depot: 781, region: 'N', company: null, suburbs: ['Watsonia','Rosanna','Ivanhoe','Bellfield'] },
  { depot: 799, region: 'N', company: 'Preston Towing', suburbs: ['Reservoir','Preston','Fawkner'] },
  { depot: 805, region: 'N', company: null, suburbs: ['Fawkner','Coburg','Essendon'] },
  { depot: 807, region: 'N', company: null, suburbs: ['Essendon','Melbourne Airport','Westmeadows','Tullamarine','Mickleham'] },
  { depot: 815, region: 'N', company: null, suburbs: ['Gowanbrae','Strathmore','Moonee Ponds','Aberfeldie','Avondale Heights','Keilor East','Tullamarine'] },
  { depot: 834, region: 'N', company: null, suburbs: ['Doreen','Wattle Glen','Warrandyte','Rosanna','Bundoora','Yarrambat'] },
  // ── Western ──────────────────────────────────────────────────────────────
  { depot: 700, region: 'W', company: 'Nationwide Group', suburbs: ['Melton','Harkness','Aintree','Plumpton','Mount Cottrell','Brookfield'] },
  { depot: 762, region: 'W', company: null, suburbs: ['Hillside','Kealba','Albion','Ravenhall','Rockbank'] },
  { depot: 803, region: 'W', company: 'Werribee Specialised Towing', suburbs: ['Werribee','Werribee South','Little River','Quandong'] },
  { depot: 804, region: 'W', company: null, suburbs: ['Braybrook'] },
  { depot: 857, region: 'W', company: null, suburbs: ['Braybrook','Spotswood','Williamstown','Altona','Truganina','Derrimut'] },
  { depot: 870, region: 'W', company: null, suburbs: ['Quandong','Williams Landing','Point Cook','Little River'] },
  { depot: 872, region: 'W', company: 'Altona Towing', suburbs: ['Brooklyn','Newport','Seaholme','Laverton','Derrimut','Altona North'] },
  { depot: 874, region: 'W', company: null, suburbs: ['Sunbury','Diggers Rest','Bulla'] },
]

export const REGION_LABELS = { S: 'Southern', E: 'Eastern', N: 'Northern', W: 'Western' }

export const REGION_STYLE = {
  S: { color: '#4a90d0', bg: '#04101a', border: '#1a3555' },
  E: { color: '#4a9a58', bg: '#051208', border: '#1a3520' },
  N: { color: '#c07820', bg: '#120e04', border: '#3a2808' },
  W: { color: '#8050c0', bg: '#0e0814', border: '#2c1848' },
}

// Reverse index: suburb (lowercase) → [{depot, region}]
// Sorted longest-first so "Mount Waverley" matches before "Waverley",
// "Frankston South" before "Frankston", etc.
const _map = new Map()
for (const { depot, region, suburbs } of DEPOTS) {
  for (const s of suburbs) {
    const k = s.toLowerCase()
    if (!_map.has(k)) _map.set(k, [])
    _map.get(k).push({ depot, region })
  }
}
const SUBURB_INDEX = Array.from(_map.entries())
  .map(([suburb, depots]) => ({ suburb, depots }))
  .sort((a, b) => b.suburb.length - a.suburb.length)

/**
 * Returns the company name for a depot number, or null if unknown.
 */
export function getCompanyForDepot(depotNum) {
  const d = DEPOTS.find(d => d.depot === Number(depotNum));
  return d?.company ?? null;
}

/**
 * Returns [{depot, region}] for the suburb found in `text` (an address string
 * or locality name). Returns [] when no ACC depot covers that area.
 * Longest suburb names are tested first to prevent partial matches.
 */
export function findDepotsForAddress(text) {
  if (!text) return []
  for (const { suburb, depots } of SUBURB_INDEX) {
    const escaped = suburb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return depots
  }
  return []
}

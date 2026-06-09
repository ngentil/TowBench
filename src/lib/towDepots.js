// Victorian Accident Coordination Centre (ACC) tow truck depot data.
// Source: Transport Victoria / VicRoads monthly allocation lists.
// Covers Melbourne Controlled Area only — regional Victoria is self-managed.

const DEPOTS = [
  // ── Southern ─────────────────────────────────────────────────────────────
  { depot: 604, region: 'S', suburbs: ['Highett','Beaumaris','Mentone','Dingley Village','Braeside','Aspendale'] },
  { depot: 776, region: 'S', suburbs: ['Highett','Beaumaris','Mentone','Dingley Village','Braeside','Aspendale'] },
  { depot: 605, region: 'S', suburbs: ['Clayton','Clayton South','Mulgrave','Clarinda','Springvale'] },
  { depot: 607, region: 'S', suburbs: ['Frankston','Frankston South','Seaford','Sandhurst','Langwarrin'] },
  { depot: 736, region: 'S', suburbs: ['Mornington','Safety Beach','Merricks Beach','Balnarring'] },
  { depot: 758, region: 'S', suburbs: ['Cranbourne','Warneet','Clyde','Botanic Ridge'] },
  { depot: 765, region: 'S', suburbs: ['Somerville','Pearcedale','Somers'] },
  { depot: 767, region: 'S', suburbs: ['Portsea','St Andrews Beach','Rosebud','Arthurs Seat','Flinders','Point Leo'] },
  { depot: 802, region: 'S', suburbs: ['Heatherton','Moorabbin Airport','Mordialloc','Aspendale'] },
  { depot: 839, region: 'S', suburbs: ['Melbourne','Toorak','Elwood','Southbank'] },
  { depot: 842, region: 'S', suburbs: ['Carrum Downs','Chelsea','Aspendale','Bangholme'] },
  { depot: 861, region: 'S', suburbs: ['Ormond','Beaumaris','Hampton','Brighton'] },
  // ── Eastern ──────────────────────────────────────────────────────────────
  { depot: 606, region: 'E', suburbs: ['Montrose','Ringwood East','Warranwood','Mooroolbark','Upper Ferntree Gully','Scoresby','Rowville','Belgrave'] },
  { depot: 699, region: 'E', suburbs: ['Berwick','Lang Lang','Bunyip','Pakenham'] },
  { depot: 709, region: 'E', suburbs: ['Berwick','Officer','Cranbourne North','Narre Warren'] },
  { depot: 741, region: 'E', suburbs: ['Oakleigh','Clarinda','Springvale','Mulgrave'] },
  { depot: 743, region: 'E', suburbs: ['Cockatoo','Gembrook'] },
  { depot: 747, region: 'E', suburbs: ['Chadstone','Notting Hill','Oakleigh South','Hughesdale'] },
  { depot: 764, region: 'E', suburbs: ['Emerald','Selby'] },
  { depot: 814, region: 'E', suburbs: ['Doncaster','Forest Hill','Burwood','Box Hill'] },
  { depot: 820, region: 'E', suburbs: ['Mount Waverley','Glen Waverley','Scoresby','Noble Park','Clayton'] },
  { depot: 825, region: 'E', suburbs: ['Lysterfield','Hallam','Lynbrook','Bangholme','Keysborough','Dandenong'] },
  { depot: 844, region: 'E', suburbs: ['Kooyong','Balwyn','Kew'] },
  { depot: 864, region: 'E', suburbs: ['Mount Waverley','Clarinda','Ormond','Malvern'] },
  { depot: 879, region: 'E', suburbs: ['Doncaster','Doncaster East','Box Hill','Burwood','Balwyn'] },
  // ── Northern ─────────────────────────────────────────────────────────────
  { depot: 703, region: 'N', suburbs: ['Whittlesea','Doreen','Plenty','Reservoir','Lalor','Wollert'] },
  { depot: 704, region: 'N', suburbs: ['Melbourne Airport','Essendon','Albion','Cairnlea','Keilor'] },
  { depot: 719, region: 'N', suburbs: ['Fairfield','Kew','Fitzroy'] },
  { depot: 792, region: 'N', suburbs: ['Fairfield','Kew','Fitzroy'] },
  { depot: 744, region: 'N', suburbs: ['Yuroke','Craigieburn','Somerton','Jacana','Greenvale'] },
  { depot: 745, region: 'N', suburbs: ['Brunswick','Flemington','Coburg','Essendon'] },
  { depot: 781, region: 'N', suburbs: ['Watsonia','Rosanna','Ivanhoe','Bellfield'] },
  { depot: 799, region: 'N', suburbs: ['Reservoir','Preston','Fawkner'] },
  { depot: 805, region: 'N', suburbs: ['Fawkner','Coburg','Essendon'] },
  { depot: 807, region: 'N', suburbs: ['Essendon','Melbourne Airport','Westmeadows','Tullamarine','Mickleham'] },
  { depot: 815, region: 'N', suburbs: ['Gowanbrae','Strathmore','Moonee Ponds','Aberfeldie','Avondale Heights','Keilor East','Tullamarine'] },
  { depot: 834, region: 'N', suburbs: ['Doreen','Wattle Glen','Warrandyte','Rosanna','Bundoora','Yarrambat'] },
  // ── Western ──────────────────────────────────────────────────────────────
  { depot: 700, region: 'W', suburbs: ['Melton','Harkness','Aintree','Plumpton','Mount Cottrell','Brookfield'] },
  { depot: 762, region: 'W', suburbs: ['Hillside','Kealba','Albion','Ravenhall','Rockbank'] },
  { depot: 803, region: 'W', suburbs: ['Werribee','Werribee South','Little River','Quandong'] },
  { depot: 804, region: 'W', suburbs: ['Braybrook'] },
  { depot: 857, region: 'W', suburbs: ['Braybrook','Spotswood','Williamstown','Altona','Truganina','Derrimut'] },
  { depot: 870, region: 'W', suburbs: ['Quandong','Williams Landing','Point Cook','Little River'] },
  { depot: 872, region: 'W', suburbs: ['Brooklyn','Newport','Seaholme','Laverton','Derrimut','Altona North'] },
  { depot: 874, region: 'W', suburbs: ['Sunbury','Diggers Rest','Bulla'] },
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

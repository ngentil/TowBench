const ADJS = ['rusty','greasy','turbo','loaded','heavy','mighty','speedy','gnarly','dusty','chunky','bolted','gritty','diesel','roaring','gruff','cranky','burly','smoky','steady','battered','locked','rigged','hooked','strapped','hauling','rolling','braking','lifting','towing','revving'];
const NOUNS = ['rig','wrecker','flatbed','hook','boom','dolly','axle','towbar','chain','strap','winch','hoist','crane','hauler','runner','carrier','trailer','truck','loader','driver','operator','spotter','pilot','convoy','depot','yard','dock','bridge','ramp','clearance'];

export const makeUsername = () => {
  const a = ADJS[Math.floor(Math.random() * ADJS.length)];
  const b = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a}_${b}_${Math.floor(Math.random() * 900) + 100}`;
};

export const checkUsernameAvailable = async (name) => {
  return !RESERVED_USERNAMES.has(name.toLowerCase());
};

export const generateAvailableUsername = async () => {
  for (let i = 0; i < 10; i++) {
    const name = makeUsername();
    if (await checkUsernameAvailable(name)) return name;
  }
  return makeUsername();
};

export const RESERVED_USERNAMES = new Set([
  'administrator','admins','administration',
  'moderator','mod','mods','staff','support','help',
  'towbench','tow_bench','towbench_admin','towbench_support',
  'root','superuser','sysadmin','system','bot','robot',
  'official','team','info','contact','security','abuse',
  'null','undefined','anonymous','guest','user','username',
  'owner','master','webmaster','postmaster','hostmaster',
]);

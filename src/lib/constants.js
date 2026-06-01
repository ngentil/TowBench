export const VICROADS_URL = 'https://api.opendata.transport.vic.gov.au/api/opendata/roads/disruptions/unplanned/v3';
export const VICROADS_KEY = import.meta.env.VITE_VICROADS_KEY || 'bb7fc352-3ce6-44d2-9628-63fefb64278d';

// VicRoads bridge height data. Defaults to bundled static snapshot; override
// with VITE_BRIDGE_URL to point at a live feed when one becomes available.
export const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '/bridges.json';

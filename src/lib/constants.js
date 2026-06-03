// VicRoads bridge height data. Defaults to bundled static snapshot; override
// with VITE_BRIDGE_URL to point at a live feed when one becomes available.
export const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '/bridges.json';

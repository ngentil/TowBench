import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { fetchNearbyBridges } from '../lib/osm';
import { isInSchedule } from '../lib/schedule';
import { loadSettings, getLastAlertTs, setLastAlertTs } from '../lib/storage';

export const LOCATION_TASK = 'bridge-alert-location';

const ALERT_COOLDOWN_MS = 45_000;
const SCAN_RADIUS_M     = 350;
const MARGIN_M          = 0.30;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;

  const { latitude, longitude } = data.locations[0].coords;

  const [settings, lastAlertTs] = await Promise.all([
    loadSettings(),
    getLastAlertTs(),
  ]);

  if (!isInSchedule(settings.schedule)) return;

  const now = Date.now();
  if (now - lastAlertTs < ALERT_COOLDOWN_MS) return;

  const bridges = await fetchNearbyBridges(latitude, longitude, SCAN_RADIUS_M);
  const danger  = bridges.filter(b => b.maxheight < settings.truckHeight + MARGIN_M);

  if (!danger.length) return;

  await setLastAlertTs(now);

  const closest  = danger[0];
  const gap      = (closest.maxheight - settings.truckHeight).toFixed(2);
  const clearStr = closest.maxheight.toFixed(1);
  const label    = closest.name ? `${closest.name} — ` : '';

  await Notifications.scheduleNotificationAsync({
    content: {
      title:    '⚠️ LOW BRIDGE',
      body:     `${label}${clearStr}m clearance (your truck ${settings.truckHeight}m, gap ${gap}m)`,
      sound:    true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate:  [0, 400, 100, 400],
    },
    trigger: null,
  });
});

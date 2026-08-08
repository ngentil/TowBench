import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  HEIGHT:   'truck_height',
  SCHEDULE: 'work_schedule',
  LAST_ALERT: 'last_alert_ts',
};

export const DEFAULTS = {
  truckHeight: 4.3,
  schedule: {
    enabled: false,
    days: [1, 2, 3, 4, 5],
    startHour: 6,
    startMin: 0,
    endHour: 18,
    endMin: 0,
  },
};

export async function loadSettings() {
  try {
    const [h, s] = await Promise.all([
      AsyncStorage.getItem(K.HEIGHT),
      AsyncStorage.getItem(K.SCHEDULE),
    ]);
    return {
      truckHeight: h != null ? parseFloat(h) : DEFAULTS.truckHeight,
      schedule:    s != null ? JSON.parse(s)  : DEFAULTS.schedule,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveTruckHeight(meters) {
  await AsyncStorage.setItem(K.HEIGHT, String(meters));
}

export async function saveSchedule(schedule) {
  await AsyncStorage.setItem(K.SCHEDULE, JSON.stringify(schedule));
}

export async function getLastAlertTs() {
  const v = await AsyncStorage.getItem(K.LAST_ALERT);
  return v ? parseInt(v) : 0;
}

export async function setLastAlertTs(ts) {
  await AsyncStorage.setItem(K.LAST_ALERT, String(ts));
}

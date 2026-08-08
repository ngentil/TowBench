import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { LOCATION_TASK } from '../tasks/locationTask';
import { fetchNearbyBridges } from '../lib/osm';
import { loadSettings } from '../lib/storage';
import { isInSchedule, scheduleLabel } from '../lib/schedule';

const C = {
  bg:      '#0a0a0a',
  card:    '#111',
  border:  '#1e1e1e',
  text:    '#e0e0e0',
  muted:   '#555',
  orange:  '#FF6B00',
  red:     '#c0392b',
  green:   '#27ae60',
  yellow:  '#f39c12',
};

export default function HomeScreen({ navigation }) {
  const [monitoring, setMonitoring] = useState(false);
  const [scanning,   setScanning]   = useState(false);
  const [bridges,    setBridges]    = useState([]);
  const [settings,   setSettings]   = useState(null);
  const [inSchedule, setInSchedule] = useState(true);
  const [status,     setStatus]     = useState('');
  const [coords,     setCoords]     = useState(null);

  const refresh = useCallback(async () => {
    const s = await loadSettings();
    setSettings(s);
    setInSchedule(isInSchedule(s.schedule));
    const active = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    setMonitoring(active);
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function requestPerms() {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') throw new Error('Location permission denied');
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== 'granted') throw new Error('Background location denied — tap "Always Allow" in Settings');
    const { status: notif } = await Notifications.requestPermissionsAsync();
    if (notif !== 'granted') throw new Error('Notification permission denied');
  }

  async function toggleMonitoring() {
    try {
      if (monitoring) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK);
        setMonitoring(false);
        setStatus('Monitoring stopped');
      } else {
        await requestPerms();
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy:                        Location.Accuracy.Balanced,
          distanceInterval:                40,
          deferredUpdatesInterval:         5000,
          showsBackgroundLocationIndicator: true,
          foregroundService: Platform.OS === 'android' ? {
            notificationTitle: 'Bridge Alert Active',
            notificationBody:  'Monitoring for low bridges',
            notificationColor: C.orange,
          } : undefined,
        });
        setMonitoring(true);
        setStatus('Monitoring started');
      }
    } catch (e) {
      setStatus(e.message);
    }
  }

  async function scanNow() {
    setScanning(true);
    setStatus('Scanning…');
    try {
      const s = await loadSettings();
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords(loc.coords);
      const nearby = await fetchNearbyBridges(loc.coords.latitude, loc.coords.longitude, 500);
      setBridges(nearby);

      const danger = nearby.filter(b => b.maxheight < s.truckHeight + 0.3);
      if (danger.length > 0) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setStatus(`⚠️ ${danger.length} low bridge${danger.length > 1 ? 's' : ''} within 500m`);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStatus(`Clear — ${nearby.length} bridge${nearby.length !== 1 ? 's' : ''} found, none too low`);
      }
    } catch (e) {
      setStatus(`Scan failed: ${e.message}`);
    } finally {
      setScanning(false);
    }
  }

  const truckH   = settings?.truckHeight ?? 4.3;
  const schedLbl = settings ? scheduleLabel(settings.schedule) : '';

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* Status banner */}
        <View style={[s.banner, { borderColor: monitoring ? C.green : C.border }]}>
          <View style={[s.dot, { backgroundColor: monitoring ? C.green : C.muted }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerTitle, { color: monitoring ? C.green : C.muted }]}>
              {monitoring ? 'MONITORING ACTIVE' : 'MONITORING OFF'}
            </Text>
            {settings?.schedule?.enabled && (
              <Text style={s.bannerSub}>
                Schedule: {schedLbl} {inSchedule ? '✓ in window' : '— outside window'}
              </Text>
            )}
          </View>
          <Text style={[s.bannerH, { color: C.orange }]}>{truckH}m</Text>
        </View>

        {/* Controls */}
        <View style={s.row}>
          <TouchableOpacity
            style={[s.btn, { borderColor: monitoring ? C.red : C.green, flex: 2 }]}
            onPress={toggleMonitoring}
          >
            <Text style={[s.btnTxt, { color: monitoring ? C.red : C.green }]}>
              {monitoring ? '■  Stop' : '▶  Start Monitoring'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, { borderColor: C.orange, flex: 1 }]}
            onPress={scanNow}
            disabled={scanning}
          >
            {scanning
              ? <ActivityIndicator size="small" color={C.orange} />
              : <Text style={[s.btnTxt, { color: C.orange }]}>⌖ Scan</Text>
            }
          </TouchableOpacity>
        </View>

        {status ? <Text style={s.statusLine}>{status}</Text> : null}

        {coords && (
          <Text style={s.coord}>
            {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </Text>
        )}

        {/* Bridge list */}
        {bridges.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={s.sectionLabel}>NEARBY BRIDGES</Text>
            {bridges.map(b => {
              const danger = b.maxheight < truckH + 0.3;
              const warn   = b.maxheight < truckH + 0.6;
              const color  = danger ? C.red : warn ? C.yellow : C.muted;
              return (
                <View key={b.id} style={[s.card, { borderLeftColor: color }]}>
                  <View style={s.cardRow}>
                    <Text style={[s.cardH, { color }]}>{b.maxheight.toFixed(1)}m</Text>
                    <Text style={s.cardName}>{b.name || b.road || 'Unnamed'}</Text>
                    {b.distance != null && (
                      <Text style={s.cardDist}>{Math.round(b.distance)}m away</Text>
                    )}
                  </View>
                  {danger && (
                    <Text style={[s.cardWarn, { color: C.red }]}>
                      TOO LOW — {(b.maxheight - truckH).toFixed(2)}m gap
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={[s.btn, { borderColor: C.border, marginTop: 24 }]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={[s.btnTxt, { color: C.muted }]}>⚙  Settings</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  scroll:      { padding: 16 },
  banner:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderRadius: 6, marginBottom: 14, backgroundColor: C.card },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  bannerTitle: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  bannerSub:   { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 9, color: '#555', marginTop: 3 },
  bannerH:     { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 20, fontWeight: '700' },
  row:         { flexDirection: 'row', gap: 8, marginBottom: 8 },
  btn:         { borderWidth: 1, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  btnTxt:      { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12, fontWeight: '700' },
  statusLine:  { fontSize: 10, color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginTop: 4, marginBottom: 4 },
  coord:       { fontSize: 9, color: '#333', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginBottom: 4 },
  sectionLabel:{ fontSize: 9, color: C.muted, letterSpacing: 2, marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  card:        { backgroundColor: C.card, borderLeftWidth: 3, borderRadius: 3, padding: 10, marginBottom: 6 },
  cardRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardH:       { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 16, fontWeight: '700', minWidth: 48 },
  cardName:    { flex: 1, fontSize: 11, color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  cardDist:    { fontSize: 9, color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  cardWarn:    { fontSize: 9, fontWeight: '700', marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
});

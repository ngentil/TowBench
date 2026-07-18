import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  ScrollView, StyleSheet, Switch, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { loadSettings, saveTruckHeight, saveSchedule, DEFAULTS } from '../lib/storage';
import { scheduleLabel } from '../lib/schedule';

const C = {
  bg:     '#0a0a0a',
  card:   '#111',
  border: '#1e1e1e',
  text:   '#e0e0e0',
  muted:  '#555',
  orange: '#FF6B00',
  green:  '#27ae60',
};

const DAYS = [
  { label: 'S', value: 0 },
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
];

function Stepper({ value, onChange, step = 0.05, min = 1.5, max = 6.0, fmt }) {
  return (
    <View style={s.stepperRow}>
      <TouchableOpacity style={s.stepBtn} onPress={() => onChange(Math.max(min, parseFloat((value - step).toFixed(2))))}>
        <Text style={s.stepBtnTxt}>−</Text>
      </TouchableOpacity>
      <Text style={s.stepVal}>{fmt ? fmt(value) : value}</Text>
      <TouchableOpacity style={s.stepBtn} onPress={() => onChange(Math.min(max, parseFloat((value + step).toFixed(2))))}>
        <Text style={s.stepBtnTxt}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function TimePicker({ hour, min, onChange }) {
  function adjustHour(delta) {
    let h = (hour + delta + 24) % 24;
    onChange(h, min);
  }
  function adjustMin(delta) {
    let m = (min + delta + 60) % 60;
    onChange(hour, m);
  }
  const fmt = (h) => {
    const p = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 || 12;
    return `${hh}:${String(min).padStart(2,'0')} ${p}`;
  };
  return (
    <View style={s.timeRow}>
      <TouchableOpacity style={s.timeBtn} onPress={() => adjustHour(-1)}><Text style={s.timeBtnTxt}>◀</Text></TouchableOpacity>
      <TouchableOpacity style={s.timeVal} onPress={() => adjustHour(1)}>
        <Text style={s.timeValTxt}>{fmt(hour)}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.timeBtn} onPress={() => adjustHour(1)}><Text style={s.timeBtnTxt}>▶</Text></TouchableOpacity>
      <TouchableOpacity style={[s.timeBtn, { marginLeft: 8 }]} onPress={() => adjustMin(-15)}><Text style={s.timeBtnTxt}>−15</Text></TouchableOpacity>
      <TouchableOpacity style={[s.timeBtn]} onPress={() => adjustMin(15)}><Text style={s.timeBtnTxt}>+15</Text></TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen() {
  const [height,   setHeight]   = useState(DEFAULTS.truckHeight);
  const [schedule, setSchedule] = useState(DEFAULTS.schedule);
  const [saved,    setSaved]    = useState(false);

  useFocusEffect(useCallback(() => {
    loadSettings().then(s => {
      setHeight(s.truckHeight);
      setSchedule(s.schedule);
    });
  }, []));

  async function save() {
    await Promise.all([saveTruckHeight(height), saveSchedule(schedule)]);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function toggleDay(day) {
    const days = schedule.days.includes(day)
      ? schedule.days.filter(d => d !== day)
      : [...schedule.days, day].sort((a, b) => a - b);
    setSchedule(sc => ({ ...sc, days }));
  }

  const fmtM = h => {
    const total = Math.round(h * 100);
    const ft    = Math.floor(total * 0.0328084 / 12);
    const ins   = Math.round((total * 0.0328084) - ft * 12);
    return `${h.toFixed(2)}m  (${ft}'${ins}")`;
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll}>

      <Text style={s.section}>VEHICLE HEIGHT</Text>
      <View style={s.card}>
        <Text style={s.label}>Truck height (roof / highest point)</Text>
        <Stepper value={height} onChange={setHeight} step={0.05} min={1.5} max={6.5} fmt={fmtM} />
        <Text style={s.hint}>Alert fires when a bridge clearance is less than your height + 30cm safety margin.</Text>
      </View>

      <Text style={s.section}>WORK SCHEDULE</Text>
      <View style={s.card}>
        <View style={s.switchRow}>
          <Text style={s.label}>Limit monitoring to work hours</Text>
          <Switch
            value={schedule.enabled}
            onValueChange={v => setSchedule(sc => ({ ...sc, enabled: v }))}
            trackColor={{ false: '#222', true: C.orange + '66' }}
            thumbColor={schedule.enabled ? C.orange : '#444'}
          />
        </View>
        {!schedule.enabled && (
          <Text style={s.hint}>Monitoring runs continuously when started.</Text>
        )}

        {schedule.enabled && (
          <>
            <Text style={[s.label, { marginTop: 14 }]}>Active days</Text>
            <View style={s.dayRow}>
              {DAYS.map(d => {
                const on = schedule.days.includes(d.value);
                return (
                  <TouchableOpacity
                    key={d.value}
                    style={[s.dayBtn, on && { backgroundColor: C.orange + '22', borderColor: C.orange }]}
                    onPress={() => toggleDay(d.value)}
                  >
                    <Text style={[s.dayBtnTxt, { color: on ? C.orange : C.muted }]}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[s.label, { marginTop: 14 }]}>Start time</Text>
            <TimePicker
              hour={schedule.startHour}
              min={schedule.startMin}
              onChange={(h, m) => setSchedule(sc => ({ ...sc, startHour: h, startMin: m }))}
            />

            <Text style={[s.label, { marginTop: 12 }]}>End time</Text>
            <TimePicker
              hour={schedule.endHour}
              min={schedule.endMin}
              onChange={(h, m) => setSchedule(sc => ({ ...sc, endHour: h, endMin: m }))}
            />

            <Text style={[s.hint, { marginTop: 10, color: C.orange + 'cc' }]}>
              {scheduleLabel(schedule)}
            </Text>
          </>
        )}
      </View>

      <TouchableOpacity style={[s.saveBtn, saved && { borderColor: C.green }]} onPress={save}>
        <Text style={[s.saveBtnTxt, { color: saved ? C.green : C.orange }]}>
          {saved ? '✓ Saved' : 'Save Settings'}
        </Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#0a0a0a' },
  scroll:     { padding: 16, paddingBottom: 40 },
  section:    { fontSize: 9, color: C.muted, letterSpacing: 2, marginTop: 20, marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  card:       { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 14, marginBottom: 8 },
  label:      { fontSize: 11, color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', marginBottom: 8 },
  hint:       { fontSize: 9, color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', lineHeight: 15, marginTop: 6 },
  switchRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn:    { width: 36, height: 36, borderWidth: 1, borderColor: C.border, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  stepBtnTxt: { fontSize: 18, color: C.orange, fontWeight: '700' },
  stepVal:    { flex: 1, fontSize: 13, color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', textAlign: 'center' },
  dayRow:     { flexDirection: 'row', gap: 6 },
  dayBtn:     { width: 36, height: 36, borderWidth: 1, borderColor: C.border, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  dayBtnTxt:  { fontSize: 11, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  timeRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeBtn:    { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: C.border, borderRadius: 4, backgroundColor: '#0d0d0d' },
  timeBtnTxt: { fontSize: 10, color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  timeVal:    { flex: 1, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 4, backgroundColor: '#0d0d0d' },
  timeValTxt: { fontSize: 13, color: C.text, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '700' },
  saveBtn:    { borderWidth: 1, borderColor: C.orange, borderRadius: 4, paddingVertical: 14, alignItems: 'center', marginTop: 24, backgroundColor: '#0d0d0d' },
  saveBtnTxt: { fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
});

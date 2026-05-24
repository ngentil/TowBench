import React, { useState, useEffect, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { ACC, MUT, BRD, TXT, GRN, SURF } from '../../lib/styles';
import { getRecentAllocations } from '../../lib/db/towing';
import useWeather from '../../hooks/useWeather';
import { supabase } from '../../lib/supabase';
import { timeIn, fmtTimer, fmtShort, haversineKm } from '../../lib/utils';

const ORANGE = '#e8870a';

const suburb = f => f.properties?.reference?.startIntersectionLocality || '';

const SORT_OPTIONS = [
  { key: 'recent',  label: 'Most Recent',     fn: (a, b) => new Date(b.properties?.lastUpdated || 0) - new Date(a.properties?.lastUpdated || 0) },
  { key: 'oldest',  label: 'Oldest First',    fn: (a, b) => new Date(a.properties?.lastUpdated || 0) - new Date(b.properties?.lastUpdated || 0) },
  { key: 'road',    label: 'Road Name (A–Z)', fn: (a, b) => (a.properties?.closedRoadName || '').localeCompare(b.properties?.closedRoadName || '') },
  { key: 'suburb',  label: 'Suburb (A–Z)',    fn: (a, b) => suburb(a).localeCompare(suburb(b)) },
  { key: 'lanes',   label: 'Lanes Impacted',  fn: (a, b) => (b.properties?.numberLanesImpacted || 0) - (a.properties?.numberLanesImpacted || 0) },
  { key: 'eventId', label: 'Event ID',        fn: (a, b) => Number(a.properties?.eventId || 0) - Number(b.properties?.eventId || 0) },
];

const EXPORT_PERIODS = [
  { label: 'Last 15 min',  hours: 0.25 },
  { label: 'Last 30 min',  hours: 0.5  },
  { label: 'Last 1 hour',  hours: 1    },
  { label: 'Last 2 hours', hours: 2    },
  { label: 'Last 4 hours', hours: 4    },
  { label: 'Last 8 hours', hours: 8    },
  { label: 'Last 12 hours',hours: 12   },
  { label: 'Last 24 hours',hours: 24   },
  { label: 'Last 2 days',  hours: 48   },
  { label: 'Last 7 days',  hours: 168  },
  { label: 'Last 14 days', hours: 336  },
  { label: 'Last 31 days', hours: 744  },
];

const NEARBY_OPTS = [0, 5, 10, 15, 20, 30];

function StatusBadge({ live }) {
  const color = live ? GRN : '#555';
  return (
    <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', padding: '1px 5px', border: `1px solid ${color}55`, borderRadius: 2, color, background: color + '15', textTransform: 'uppercase' }}>
      {live ? 'Active' : 'Cleared'}
    </span>
  );
}

function AllocationCard({ feature, fromLog, userPos, nearbyKm, acceptedJob, userEmail, onAccept, onRelease, handoverNote, onAddNote }) {
  const [open, setOpen]           = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [showNoteBox, setShowNoteBox] = useState(false);
  const p          = feature.properties || {};
  const road       = p.closedRoadName || '—';
  const sub        = suburb(feature);
  const crossSt    = p.reference?.startIntersectionRoadName || '';
  const eventId    = p.eventId || '—';
  const desc       = p.description || '';
  const lanes      = p.numberLanesImpacted;
  const impact     = p.impact?.impactType || '';
  const subType    = p.eventSubType || '';
  const eventType  = p.eventType || '';
  const melway     = p.melway || '';
  const created    = p.lastUpdated;
  const coords     = feature.geometry?.coordinates;
  const logMeta    = feature._logMeta;
  const elapsed    = timeIn(logMeta?.firstSeen || p.lastUpdated);
  const isLive     = !fromLog;

  const distKm = (userPos && coords)
    ? haversineKm(userPos.lat, userPos.lng, coords[1], coords[0])
    : null;
  const isNearby = distKm !== null && nearbyKm > 0 && distKm <= nearbyKm && isLive;

  const mapsUrl = coords
    ? `https://www.google.com/maps?q=${coords[1]},${coords[0]}`
    : null;

  const isAcceptedByMe    = isLive && acceptedJob && acceptedJob.accepted_by === userEmail;
  const isAcceptedByOther = isLive && acceptedJob && acceptedJob.accepted_by !== userEmail;
  const acceptedElapsed   = acceptedJob ? fmtTimer(acceptedJob.accepted_at) : null;
  const isOverdue         = isAcceptedByMe && (Date.now() - new Date(acceptedJob.accepted_at).getTime()) >= 60 * 60 * 1000;

  const borderLeft = isNearby || isOverdue ? '3px solid #cc2222' : `3px solid ${isLive ? GRN : '#333'}`;
  const border     = isNearby || isOverdue ? '1px solid #cc222255' : '1px solid #252525';

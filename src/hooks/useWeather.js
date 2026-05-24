import { useState, useEffect } from 'react';

const LAT = -37.814;
const LNG = 144.963;
const REFRESH_MS = 30 * 60 * 1000;
const RAIN_THRESHOLD = 60; // percent

export default function useWeather() {
  const [weather, setWeather] = useState({ rainSoon: false, maxProb: 0, hoursUntil: 0 });

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&hourly=precipitation_probability&forecast_days=1&timezone=Australia%2FMelbourne`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const probs = data.hourly?.precipitation_probability || [];
        const times = data.hourly?.time || [];
        const now   = new Date();
        const currentHour = now.getHours();

        // Look 3 hours ahead (current + 2 more)
        let maxProb = 0;
        let hoursUntil = 0;
        for (let offset = 0; offset <= 2; offset++) {
          const idx = times.findIndex(t => {
            const h = new Date(t).getHours();
            return h === (currentHour + offset) % 24;
          });
          if (idx >= 0 && probs[idx] > maxProb) {
            maxProb = probs[idx];
            hoursUntil = offset;
          }
        }

        setWeather({ rainSoon: maxProb >= RAIN_THRESHOLD, maxProb, hoursUntil });
      } catch { /* fail silently */ }
    };

    fetch_();
    const t = setInterval(fetch_, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  return weather;
}

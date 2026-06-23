import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const FALLBACK = {
  lat_a: -37.939185, lat_b: -0.0000071, lat_c: 0.0009726,
  lng_a: 144.763386, lng_b:  0.0009672, lng_c: 0.0000420,
}

export function useGridTransform() {
  const [coeffs, setCoeffs] = useState(null)

  useEffect(() => {
    supabase.from('grid_transform').select('lat_a,lat_b,lat_c,lng_a,lng_b,lng_c')
      .eq('id', 1).maybeSingle()
      .then(({ data }) => { if (data) setCoeffs(data) })
  }, [])

  const gridToLatLng = useCallback((sixFig, mapRef) => {
    if (mapRef && !/^M[\s\d]/.test(mapRef)) return null
    const s = (sixFig || '').replace(/\s/g, '')
    if (!/^\d{5,6}$/.test(s)) return null
    const p = s.padStart(6, '0')
    const x = parseInt(p.slice(0, 3), 10)
    const rawY = parseInt(p.slice(3), 10)
    const y = rawY > 500 ? rawY - 1000 : rawY
    const c = coeffs || FALLBACK
    const lat = c.lat_a + c.lat_b * x + c.lat_c * y
    const lng = c.lng_a + c.lng_b * x + c.lng_c * y
    if (lat < -39.5 || lat > -34.0 || lng < 141.0 || lng > 150.0) return null
    return { lat, lng }
  }, [coeffs])

  return gridToLatLng
}

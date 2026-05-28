import React, { useRef, useState } from 'react';
import { MUT, TXT, BRD } from '../../lib/styles';

// Internal canvas resolution 900×270 — displayed at 100% width × 90px via CSS.
// onSave(blob) called with a PNG Blob; onClear() called when canvas is wiped.
export default function SignatureCanvas({ label, onSave, onClear }) {
  const canvasRef  = useRef();
  const [drawing,  setDrawing]  = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const sx     = canvas.width  / rect.width;
    const sy     = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }

  function start(e) {
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.strokeStyle = TXT;
    ctx.lineWidth   = 2.2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasStrokes(true);
  }

  function end(e) { e.preventDefault(); setDrawing(false); }

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onClear?.();
  }

  function save() {
    if (!hasStrokes) return;
    canvasRef.current.toBlob(blob => onSave(blob), 'image/png');
  }

  const ghost = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, padding: '5px 0',
    borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <div style={{ fontSize: 8, color: MUT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={900} height={270}
        style={{
          width: '100%', height: 90, background: '#080808',
          border: `1px solid ${BRD}`, borderRadius: 2,
          touchAction: 'none', display: 'block',
        }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          style={{ ...ghost, flex: 1, background: 'none', border: '1px solid #222', color: '#444' }}
          onClick={clear}
        >
          Clear
        </button>
        <button
          style={{ ...ghost, flex: 2, background: hasStrokes ? '#1a1a1a' : 'none',
            border: `1px solid ${hasStrokes ? '#383838' : '#181818'}`,
            color: hasStrokes ? TXT : '#222' }}
          disabled={!hasStrokes}
          onClick={save}
        >
          {hasStrokes ? '✓ Save Signature' : 'Sign above'}
        </button>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ACC, MUT, TXT, GRN, RED, BRD, BRD2, inp, txa, btnA, btnG, sm } from '../../lib/styles';
import SignatureCanvas from './SignatureCanvas';
import { extractLicenceDetails } from '../../lib/licenceOcr';

const ORANGE = '#e8870a';

const TRADE_REASONS = [
  { key: 'trade',    label: 'Trade'    },
  { key: 'insurance',label: 'Insurance'},
  { key: 'stolen',   label: 'Stolen'   },
  { key: 'evidence', label: 'Evidence' },
  { key: 'impound',  label: 'Impound'  },
  { key: 'tow_safe', label: 'Tow Safe' },
];

const ACCIDENT_AUTH = [
  { key: 'vicroads_officer', label: 'VicRoads Officer' },
  { key: 'police',           label: 'Police'           },
  { key: 'driver',           label: 'Vehicle Driver'   },
  { key: 'owner',            label: 'Vehicle Owner'    },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionHead({ children }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 700, color: ACC, letterSpacing: '0.14em',
      textTransform: 'uppercase', borderBottom: `1px solid ${BRD2}`, paddingBottom: 6,
      marginBottom: 12, marginTop: 4 }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 7, color: MUT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function YesNo({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[true, false].map(v => (
        <button key={String(v)}
          style={{ ...btnG, ...sm, color: value === v ? TXT : MUT,
            borderColor: value === v ? TXT : BRD, background: value === v ? '#1e1e1e' : 'none' }}
          onClick={() => onChange(v)}>
          {v ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}

function SigSlot({ label, blob, onSave, onClear }) {
  const objUrl = blob ? URL.createObjectURL(blob) : null;
  return (
    <div style={{ marginBottom: 14 }}>
      {blob ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 7, color: MUT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={objUrl} alt="sig" style={{ height: 36, width: 'auto', maxWidth: 180,
              border: `1px solid ${BRD}`, borderRadius: 2 }} />
            <span style={{ fontSize: 8, color: GRN }}>✓ Signed</span>
            <button style={{ ...btnG, ...sm, padding: '2px 6px', fontSize: 8 }}
              onClick={() => { URL.revokeObjectURL(objUrl); onClear(); }}>
              Redo
            </button>
          </div>
        </div>
      ) : (
        <SignatureCanvas label={label} onSave={onSave} onClear={onClear} />
      )}
    </div>
  );
}

// ── Licence capture + OCR ─────────────────────────────────────────────────────

function LicenceCapture({ clientLabel, photoUrl, name, address, licenceNo,
  onCapture, ocrBusy, onName, onAddress, onLicenceNo }) {
  const ref = useRef();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0' }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: ORANGE, letterSpacing: '0.1em',
        textTransform: 'uppercase' }}>{clientLabel}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 64, height: 44, background: '#0a0a0a',
          border: `1px ${photoUrl ? 'solid' : 'dashed'} ${BRD}`, borderRadius: 2, flexShrink: 0,
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {photoUrl
            ? <img src={photoUrl} alt="lic" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 18, color: '#2a2a2a' }}>🪪</span>}
        </div>
        <div>
          <div style={{ fontSize: 7, color: MUT, marginBottom: 4 }}>Licence photo (OCR auto-fill)</div>
          <button style={{ ...btnG, ...sm }} onClick={() => ref.current?.click()}>
            {ocrBusy ? 'Reading…' : photoUrl ? 'Retake' : 'Capture'}
          </button>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) onCapture(e.target.files[0]); e.target.value = ''; }} />
      <input style={{ ...inp, fontSize: 11 }} value={name}      onChange={e => onName(e.target.value)}      placeholder="Full Name" />
      <input style={{ ...inp, fontSize: 11 }} value={address}   onChange={e => onAddress(e.target.value)}   placeholder="Address" />
      <input style={{ ...inp, fontSize: 11 }} value={licenceNo} onChange={e => onLicenceNo(e.target.value)} placeholder="Licence No." />
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function DocketForm({ job, companyId, onComplete }) {
  // Vehicle
  const [make,         setMake]         = useState('');
  const [model,        setModel]        = useState('');
  const [colour,       setColour]       = useState('');
  const [rego,         setRego]         = useState('');
  const [insuranceCo,  setInsuranceCo]  = useState('');
  const [clientMobile, setClientMobile] = useState('');
  const [furtherInstr, setFurtherInstr] = useState('');
  const [visualDamage, setVisualDamage] = useState('');

  // Trade
  const [tradeReason, setTradeReason] = useState('trade');
  const [chargeTo,    setChargeTo]    = useState('');
  const [claimNo,     setClaimNo]     = useState('');
  const [keysHeld,    setKeysHeld]    = useState(null);

  // Accident + shared authoriser
  const [authTypes,        setAuthTypes]        = useState([]);
  const [authPoliceSgt,    setAuthPoliceSgt]    = useState('');
  const [authPoliceNumber, setAuthPoliceNumber] = useState('');
  const [authPoliceRank,   setAuthPoliceRank]   = useState('');
  const [authPoliceStation,setAuthPoliceStation]= useState('');

  // Client 1
  const [c1Photo,   setC1Photo]   = useState('');
  const [c1Name,    setC1Name]    = useState('');
  const [c1Address, setC1Address] = useState('');
  const [c1Licence, setC1Licence] = useState('');

  // Client 2 (accident only, when both driver + owner ticked)
  const [c2Photo,   setC2Photo]   = useState('');
  const [c2Name,    setC2Name]    = useState('');
  const [c2Address, setC2Address] = useState('');
  const [c2Licence, setC2Licence] = useState('');

  // Salvage (accident)
  const [salvageRequired,  setSalvageRequired]  = useState(false);
  const [salvageLocation,  setSalvageLocation]  = useState('');
  const [salvagePosition,  setSalvagePosition]  = useState('');
  const [salvageTimeMin,   setSalvageTimeMin]   = useState('');
  const [salvageEmbedded,  setSalvageEmbedded]  = useState('');
  const [salvageEquipment, setSalvageEquipment] = useState('');
  const [pamphletGiven,    setPamphletGiven]    = useState(false);

  // Signatures
  const [sigAuthoriser, setSigAuthoriser] = useState(null);
  const [sigStorage,    setSigStorage]    = useState(null);
  const [sigPamphlet,   setSigPamphlet]   = useState(null);

  const [ocrBusy, setOcrBusy] = useState(null); // 1 | 2 | null
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState('');

  const isAccident = job.tow_type === 'accident' || job.tow_type === 'both';
  const isTrade    = job.tow_type === 'trade'    || job.tow_type === 'both';

  // Trade derived flags
  const tradeNeedsPolice    = isTrade && ['stolen','evidence','impound','tow_safe'].includes(tradeReason);
  const tradeNeedsOwnerSig  = isTrade && tradeReason === 'trade';
  const tradeIsInsurance    = isTrade && tradeReason === 'insurance';

  // Accident derived flags
  const accHasPolice = isAccident && authTypes.includes('police');
  const accHasDriver = isAccident && authTypes.includes('driver');
  const accHasOwner  = isAccident && authTypes.includes('owner');
  const showC1       = isAccident && (accHasDriver || accHasOwner);
  const showC2       = isAccident && accHasDriver && accHasOwner;
  const c1Label      = accHasDriver ? 'Vehicle Driver' : 'Vehicle Owner';

  function toggleAuth(key) {
    setAuthTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function uploadBlob(blob, name) {
    const path = `${companyId}/${job.id}/signatures/${name}_${Date.now()}.png`;
    const { error } = await supabase.storage.from('job-photos').upload(path, blob, { contentType: 'image/png' });
    if (error) throw error;
    return supabase.storage.from('job-photos').getPublicUrl(path).data.publicUrl;
  }

  async function runOcr(file, slot) {
    setOcrBusy(slot); setErr('');
    const ext  = (file.name?.split('.').pop() || 'jpg').toLowerCase();
    const path = `${companyId}/${job.id}/licences/c${slot}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('job-photos').upload(path, file);
    if (upErr) { setErr(upErr.message); setOcrBusy(null); return; }
    const url = supabase.storage.from('job-photos').getPublicUrl(path).data.publicUrl;
    if (slot === 1) setC1Photo(url);
    else            setC2Photo(url);
    try {
      const details = await extractLicenceDetails(file);
      if (details) {
        if (slot === 1) {
          if (details.name)       setC1Name(details.name);
          if (details.address)    setC1Address(details.address);
          if (details.licence_no) setC1Licence(details.licence_no);
        } else {
          if (details.name)       setC2Name(details.name);
          if (details.address)    setC2Address(details.address);
          if (details.licence_no) setC2Licence(details.licence_no);
        }
      }
    } catch { /* OCR failed silently — fields stay editable */ }
    setOcrBusy(null);
  }

  async function handleSubmit() {
    setBusy(true); setErr('');
    try {
      const [sigAuthUrl, sigStoreUrl, sigPampUrl] = await Promise.all([
        sigAuthoriser ? uploadBlob(sigAuthoriser, 'authoriser') : Promise.resolve(null),
        sigStorage    ? uploadBlob(sigStorage,    'storage')    : Promise.resolve(null),
        sigPamphlet   ? uploadBlob(sigPamphlet,   'pamphlet')   : Promise.resolve(null),
      ]);

      const { error: dErr } = await supabase.from('job_dockets').upsert({
        job_id:                   job.id,
        vehicle_make:             make.trim()         || null,
        vehicle_model:            model.trim()        || null,
        vehicle_colour:           colour.trim()       || null,
        vehicle_rego:             rego.trim()         || null,
        insurance_co:             insuranceCo.trim()  || null,
        client_mobile:            clientMobile.trim() || null,
        further_instructions:     furtherInstr.trim() || null,
        visual_damage:            visualDamage.trim() || null,
        trade_reason:             isTrade ? tradeReason                       : null,
        charge_to:                chargeTo.trim()     || null,
        claim_no:                 claimNo.trim()      || null,
        keys_held:                isTrade ? keysHeld                          : null,
        auth_types:               authTypes.length    ? authTypes             : null,
        auth_police_sgt:          authPoliceSgt.trim()     || null,
        auth_police_number:       authPoliceNumber.trim()  || null,
        auth_police_rank:         authPoliceRank.trim()    || null,
        auth_police_station:      authPoliceStation.trim() || null,
        client1_name:             c1Name.trim()    || null,
        client1_address:          c1Address.trim() || null,
        client1_licence_no:       c1Licence.trim() || null,
        client1_licence_photo_url:c1Photo          || null,
        client2_name:             c2Name.trim()    || null,
        client2_address:          c2Address.trim() || null,
        client2_licence_no:       c2Licence.trim() || null,
        client2_licence_photo_url:c2Photo          || null,
        sig_authoriser_url:       sigAuthUrl,
        sig_storage_url:          sigStoreUrl,
        sig_pamphlet_url:         sigPampUrl,
        salvage_required:         isAccident ? salvageRequired             : null,
        salvage_location:         salvageLocation.trim()  || null,
        salvage_position:         salvagePosition.trim()  || null,
        salvage_time_min:         salvageTimeMin ? parseInt(salvageTimeMin, 10) : null,
        salvage_embedded_in:      salvageEmbedded.trim()  || null,
        salvage_equipment:        salvageEquipment.trim() || null,
        pamphlet_given:           isAccident ? pamphletGiven               : null,
        updated_at:               new Date().toISOString(),
      }, { onConflict: 'job_id' });
      if (dErr) throw dErr;

      const { error: jErr } = await supabase.from('dispatched_jobs')
        .update({ docket_form_at: new Date().toISOString() })
        .eq('id', job.id);
      if (jErr) throw jErr;

      onComplete();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Vehicle details ─────────────────────────────── */}
      <SectionHead>Vehicle Details</SectionHead>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <Field label="Make">
          <input style={{ ...inp, fontSize: 11 }} value={make} onChange={e => setMake(e.target.value)} placeholder="Toyota" />
        </Field>
        <Field label="Model">
          <input style={{ ...inp, fontSize: 11 }} value={model} onChange={e => setModel(e.target.value)} placeholder="Corolla" />
        </Field>
        <Field label="Colour">
          <input style={{ ...inp, fontSize: 11 }} value={colour} onChange={e => setColour(e.target.value)} placeholder="Silver" />
        </Field>
      </div>

      <Field label="Registration">
        <input style={{ ...inp, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}
          value={rego} onChange={e => setRego(e.target.value.toUpperCase())} placeholder="ABC123" />
      </Field>

      <Field label="Visual Damage">
        <textarea style={{ ...inp, resize: 'vertical', minHeight: 48, lineHeight: 1.5, fontSize: 11 }}
          value={visualDamage} onChange={e => setVisualDamage(e.target.value)}
          placeholder="e.g. Front-end impact, airbags deployed, all four corners" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <Field label="Insurance Co">
          <input style={{ ...inp, fontSize: 11 }} value={insuranceCo} onChange={e => setInsuranceCo(e.target.value)} placeholder="AAMI" />
        </Field>
        <Field label="Client Mobile">
          <input style={{ ...inp, fontSize: 11 }} value={clientMobile} onChange={e => setClientMobile(e.target.value)} placeholder="04…" />
        </Field>
      </div>

      <Field label="Further Instructions">
        <textarea style={{ ...inp, resize: 'vertical', minHeight: 40, lineHeight: 1.5, fontSize: 11 }}
          value={furtherInstr} onChange={e => setFurtherInstr(e.target.value)} placeholder="Optional" />
      </Field>

      {/* ── Trade form ─────────────────────────────────── */}
      {isTrade && (
        <>
          <SectionHead>Trade Form</SectionHead>

          <Field label="Sub-Reason">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {TRADE_REASONS.map(({ key, label }) => (
                <button key={key}
                  style={{ ...btnG, ...sm, fontSize: 9,
                    color: tradeReason === key ? TXT : MUT,
                    borderColor: tradeReason === key ? ACC : BRD,
                    background: tradeReason === key ? ACC + '22' : 'none' }}
                  onClick={() => setTradeReason(key)}>
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Charge To">
            <input style={{ ...inp, fontSize: 11 }} value={chargeTo} onChange={e => setChargeTo(e.target.value)}
              placeholder="Company / individual name" />
          </Field>

          {tradeIsInsurance && (
            <Field label="Claim Number">
              <input style={{ ...inp, fontSize: 11 }} value={claimNo} onChange={e => setClaimNo(e.target.value)} placeholder="Claim #" />
            </Field>
          )}

          <Field label="Keys Held?">
            <YesNo value={keysHeld} onChange={setKeysHeld} />
          </Field>

          {/* Trade owner/agent → licence + sig */}
          {tradeNeedsOwnerSig && (
            <>
              <div style={{ height: 1, background: BRD2, margin: '6px 0 12px' }} />
              <LicenceCapture
                clientLabel="Owner / Agent"
                photoUrl={c1Photo}
                name={c1Name}
                address={c1Address}
                licenceNo={c1Licence}
                onCapture={f => runOcr(f, 1)}
                ocrBusy={ocrBusy === 1}
                onName={setC1Name}
                onAddress={setC1Address}
                onLicenceNo={setC1Licence}
              />
              <SigSlot label="Owner / Agent signature authorising tow"
                blob={sigAuthoriser} onSave={setSigAuthoriser} onClear={() => setSigAuthoriser(null)} />
            </>
          )}

          {/* Police details for stolen / evidence / impound / tow safe */}
          {tradeNeedsPolice && (
            <>
              <div style={{ height: 1, background: BRD2, margin: '6px 0 12px' }} />
              <div style={{ fontSize: 8, fontWeight: 700, color: ORANGE, letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 10 }}>Police Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <Field label="SGT Name">
                  <input style={{ ...inp, fontSize: 11 }} value={authPoliceSgt}    onChange={e => setAuthPoliceSgt(e.target.value)}    placeholder="Sgt Smith" />
                </Field>
                <Field label="Officer Number">
                  <input style={{ ...inp, fontSize: 11 }} value={authPoliceNumber} onChange={e => setAuthPoliceNumber(e.target.value)} placeholder="12345" />
                </Field>
                <Field label="Rank">
                  <input style={{ ...inp, fontSize: 11 }} value={authPoliceRank}   onChange={e => setAuthPoliceRank(e.target.value)}   placeholder="Sergeant" />
                </Field>
                <Field label="Station">
                  <input style={{ ...inp, fontSize: 11 }} value={authPoliceStation} onChange={e => setAuthPoliceStation(e.target.value)} placeholder="Preston" />
                </Field>
              </div>
              <SigSlot label="Police officer signature"
                blob={sigAuthoriser} onSave={setSigAuthoriser} onClear={() => setSigAuthoriser(null)} />
            </>
          )}
        </>
      )}

      {/* ── Accident form ──────────────────────────────── */}
      {isAccident && (
        <>
          <SectionHead>Accident Form</SectionHead>

          <Field label="Who was present? (select all that apply)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ACCIDENT_AUTH.map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={authTypes.includes(key)} onChange={() => toggleAuth(key)}
                    style={{ accentColor: ACC, width: 14, height: 14 }} />
                  <span style={{ fontSize: 11, color: authTypes.includes(key) ? TXT : MUT }}>{label}</span>
                </label>
              ))}
            </div>
          </Field>

          {accHasPolice && (
            <>
              <div style={{ height: 1, background: BRD2, margin: '4px 0 10px' }} />
              <div style={{ fontSize: 8, fontWeight: 700, color: ORANGE, letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 10 }}>Police Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <Field label="SGT Name">
                  <input style={{ ...inp, fontSize: 11 }} value={authPoliceSgt}     onChange={e => setAuthPoliceSgt(e.target.value)}     placeholder="Sgt Smith" />
                </Field>
                <Field label="Officer Number">
                  <input style={{ ...inp, fontSize: 11 }} value={authPoliceNumber}  onChange={e => setAuthPoliceNumber(e.target.value)}  placeholder="12345" />
                </Field>
                <Field label="Rank">
                  <input style={{ ...inp, fontSize: 11 }} value={authPoliceRank}    onChange={e => setAuthPoliceRank(e.target.value)}    placeholder="Sergeant" />
                </Field>
                <Field label="Station">
                  <input style={{ ...inp, fontSize: 11 }} value={authPoliceStation} onChange={e => setAuthPoliceStation(e.target.value)} placeholder="Preston" />
                </Field>
              </div>
            </>
          )}

          {showC1 && (
            <>
              <div style={{ height: 1, background: BRD2, margin: '4px 0 10px' }} />
              <LicenceCapture
                clientLabel={c1Label}
                photoUrl={c1Photo}
                name={c1Name}
                address={c1Address}
                licenceNo={c1Licence}
                onCapture={f => runOcr(f, 1)}
                ocrBusy={ocrBusy === 1}
                onName={setC1Name}
                onAddress={setC1Address}
                onLicenceNo={setC1Licence}
              />
            </>
          )}

          {showC2 && (
            <>
              <div style={{ height: 1, background: BRD2, margin: '4px 0 10px' }} />
              <LicenceCapture
                clientLabel="Vehicle Owner"
                photoUrl={c2Photo}
                name={c2Name}
                address={c2Address}
                licenceNo={c2Licence}
                onCapture={f => runOcr(f, 2)}
                ocrBusy={ocrBusy === 2}
                onName={setC2Name}
                onAddress={setC2Address}
                onLicenceNo={setC2Licence}
              />
            </>
          )}

          {/* Salvage */}
          <div style={{ height: 1, background: BRD2, margin: '6px 0 12px' }} />
          <Field label="Salvage">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={salvageRequired} onChange={e => setSalvageRequired(e.target.checked)}
                style={{ accentColor: ACC, width: 14, height: 14 }} />
              <span style={{ fontSize: 11, color: salvageRequired ? TXT : MUT }}>Salvage required</span>
            </label>
            {salvageRequired && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Location">
                    <input style={{ ...inp, fontSize: 11 }} value={salvageLocation}  onChange={e => setSalvageLocation(e.target.value)}  placeholder="e.g. In drain" />
                  </Field>
                  <Field label="Position">
                    <input style={{ ...inp, fontSize: 11 }} value={salvagePosition}  onChange={e => setSalvagePosition(e.target.value)}  placeholder="e.g. On side" />
                  </Field>
                  <Field label="Time (min)">
                    <input style={{ ...inp, fontSize: 11 }} value={salvageTimeMin}   onChange={e => setSalvageTimeMin(e.target.value)}   placeholder="45" type="number" />
                  </Field>
                  <Field label="Equipment">
                    <input style={{ ...inp, fontSize: 11 }} value={salvageEquipment} onChange={e => setSalvageEquipment(e.target.value)} placeholder="Chains, snatch" />
                  </Field>
                </div>
                <Field label="Embedded In">
                  <input style={{ ...inp, fontSize: 11 }} value={salvageEmbedded} onChange={e => setSalvageEmbedded(e.target.value)} placeholder="e.g. Soft ground, barrier" />
                </Field>
              </div>
            )}
          </Field>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={pamphletGiven} onChange={e => setPamphletGiven(e.target.checked)}
              style={{ accentColor: ACC, width: 14, height: 14 }} />
            <span style={{ fontSize: 11, color: pamphletGiven ? TXT : MUT }}>VicRoads pamphlet given to client</span>
          </label>

          {/* Three signature slots */}
          <div style={{ height: 1, background: BRD2, margin: '4px 0 12px' }} />
          <SigSlot label="1. Driver confirms VicRoads pamphlet given"
            blob={sigPamphlet} onSave={setSigPamphlet} onClear={() => setSigPamphlet(null)} />
          <SigSlot label="2. Person authorising tow"
            blob={sigAuthoriser} onSave={setSigAuthoriser} onClear={() => setSigAuthoriser(null)} />
          <SigSlot label="3. Person organising storage"
            blob={sigStorage} onSave={setSigStorage} onClear={() => setSigStorage(null)} />
        </>
      )}

      {/* ── Submit ──────────────────────────────────────── */}
      <div style={{ height: 1, background: BRD2, margin: '8px 0 12px' }} />
      {err && (
        <div style={{ fontSize: 9, color: RED, marginBottom: 10, padding: '6px 8px',
          background: RED + '11', border: `1px solid ${RED}33`, borderRadius: 2 }}>
          {err}
        </div>
      )}
      <button
        style={{ ...btnA, width: '100%', fontSize: 11, padding: '12px 0', opacity: busy ? 0.5 : 1 }}
        disabled={busy}
        onClick={handleSubmit}
      >
        {busy ? 'Submitting…' : '✓  Submit Docket Form'}
      </button>
    </div>
  );
}

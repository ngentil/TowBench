// Diagnostic: test if Netlify can reach VicPagers HTTP polling endpoint
// Call this manually: /.netlify/functions/debug-vicpagers
exports.handler = async function () {
  const tests = {};

  // Test 1: polling endpoint
  try {
    const r = await fetch('https://vicpagers.net.au/socket.io/?EIO=4&transport=polling', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    tests.polling = { status: r.status, body: (await r.text()).slice(0, 200) };
  } catch (e) {
    tests.polling = { error: e.message };
  }

  // Test 2: VicEmergency  
  try {
    const r = await fetch('https://data.emergency.vic.gov.au/Show?pageId=getIncidentJSON', {
      signal: AbortSignal.timeout(8000),
    });
    tests.vicemergency = { status: r.status, bodyLen: (await r.text()).length };
  } catch (e) {
    tests.vicemergency = { error: e.message };
  }

  // Test 3: VicPagers root
  try {
    const r = await fetch('https://vicpagers.net.au/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    tests.root = { status: r.status };
  } catch (e) {
    tests.root = { error: e.message };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ netlifyIp: 'unknown', tests }, null, 2),
  };
};

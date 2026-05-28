// Replace this function body with a different OCR provider if needed.
export async function extractLicenceDetails(imageFile) {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!key) return null;

  const base64 = await fileToBase64(imageFile);
  const mediaType = imageFile.type || 'image/jpeg';

  let resp;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            {
              type: 'text',
              text: 'Extract these fields from this Australian driver licence. Reply with JSON only, no markdown fences: {"name":"full name","address":"full address","licence_no":"licence number","dob":"DD/MM/YYYY"}. Use null for any field not visible.',
            },
          ],
        }],
      }),
    });
  } catch {
    return null;
  }

  if (!resp.ok) return null;
  const json = await resp.json();
  const text = json.content?.[0]?.text?.trim() || '';
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const params = new URLSearchParams(location.search);
function readPendingFromUrl() {
  const raw = params.get('pending');
  if (!raw) return [];
  try {
    let data;try{data=JSON.parse(raw);}catch{data=JSON.parse(decodeURIComponent(raw));}
    return Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

export async function applyPendingCredits(api) {
  const events = readPendingFromUrl();
  if (!events.length) return { applied: 0, failed: 0, earnedHint: 0 };
  let applied = 0;
  let failed = 0;
  let earnedHint = 0;
  for (const event of events) {
    if (!event?.eventId) continue;
    try {
      const learned = Number(event.learned) || 0;
      const reviewed = Number(event.reviewed) || 0;
      const result = await api.creditLearning({
        eventId: String(event.eventId).slice(0, 128),
        learned,
        reviewed,
        checkIn: Boolean(event.checkIn),
      });
      if (result?.ok) {
        applied += 1;
        if (result.code !== 'ALREADY_CLAIMED' && result.code !== 'ALREADY_APPLIED') {
          earnedHint += learned * 10 + reviewed * 5;
        }
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { applied, failed, earnedHint };
}

export function notifyHost(event, detail) {
  try {
    window.parent?.postMessage?.(
      { protocolVersion: 1, type: 'event', event, detail },
      '*',
    );
  } catch {
    /* ignore */
  }
  const send=()=>{try{window.uni?.postMessage?.({data:{event,detail}});}catch{}};
  if(window.UniAppJSBridge)send();
  else if(window.uni)document.addEventListener('UniAppJSBridgeReady',send,{once:true});
}


import { MODULE_ONE_URL, countdown } from './training-room-state.js';

export function acceptsSharedRoomUpdate(current, incoming) {
  if (!incoming || !['closed', 'open', 'ending', 'ended'].includes(incoming.status)) return false;
  const previousTime = Date.parse(current?.serverTime);
  const nextTime = Date.parse(incoming.serverTime);
  if (Number.isFinite(previousTime) && (!Number.isFinite(nextTime) || nextTime < previousTime)) return false;
  if (current?.sessionId && current.sessionId === incoming.sessionId) {
    if (Number.isFinite(current.revision) && Number.isFinite(incoming.revision) && incoming.revision < current.revision) return false;
    if (current.status === 'ended' && incoming.status !== 'ended') return false;
    if (current.status === 'ending' && incoming.status === 'open') return false;
  }
  if (current?.sessionId && current.sessionId !== incoming.sessionId) {
    if (!incoming.sessionId && current.status !== 'ended') return false;
    const previousStart = Date.parse(current.startAt);
    const nextStart = Date.parse(incoming.startAt);
    if (Number.isFinite(previousStart) && Number.isFinite(nextStart) && nextStart < previousStart) return false;
  }
  return true;
}

export function sharedRoomNextStage(status) {
  // The server retains a finished coach's handoff when Patrick opens the next room.
  return status?.role === 'coach'
    && status?.removed !== true && status?.nextStageAvailable === true
    && status?.nextStageUrl === MODULE_ONE_URL;
}

export function sharedRoomClock(status, nowMs = Date.now()) {
  const start = Date.parse(status?.startAt);
  if (!status?.sessionId || !Number.isFinite(start) || status.status !== 'open' || nowMs < start) return null;
  return countdown((nowMs - start) / 1000);
}

export function sharedRoomMessage(status, { host = false, connection = 'idle', remotePresent = false } = {}) {
  if (!status) return { title: 'Activation room', copy: 'Checking the room…' };
  if (status.removed) return { title: 'You’ve left this call', copy: 'Patrick has cleared your place. Please contact him if you entered the wrong session.' };
  if (sharedRoomNextStage(status) && !status.hasSeat) return { title: 'Thanks for joining', copy: 'Your Activation call has finished. Your next step is below.' };
  if (status.status === 'ending') return { title: 'Closing the room', copy: host ? 'The room is closing. If needed, use Retry closing.' : 'Patrick is closing the call. Your next step will appear here.' };
  if (status.status === 'ended') return { title: 'Thanks for joining', copy: sharedRoomNextStage(status) ? 'Your next step is below.' : 'This call has finished. Patrick will open the room for the next session.' };
  if (!status.ready) return { title: 'We’ll be back shortly', copy: 'The video room is temporarily unavailable. Please try again shortly.' };
  if (connection === 'reconnecting') return { title: 'Reconnecting your call', copy: 'Your camera and microphone will reconnect automatically.' };
  if (connection === 'connected' && !remotePresent) return { title: host ? 'Waiting for your coach' : 'Waiting for Patrick', copy: 'You’re in the room.' };
  if (status.status === 'closed') return { title: host ? 'Ready when you are' : 'Your Activation room', copy: host ? 'Tap Enter to open the room and start your camera.' : 'Patrick will open the room when it’s time for your call.' };
  if (host) return { title: 'Your room is open', copy: 'Tap Enter to join. Your coach enters from the Activation page.' };
  if (status.busy && !status.mayJoin) return { title: 'Call in progress', copy: 'Please wait. Patrick is speaking with another coach.' };
  if (!status.hostPresent) return { title: 'Patrick will be here shortly', copy: 'Your Enter button will appear when Patrick is in the room.' };
  return { title: 'Patrick is waiting', copy: 'Tap Enter to join your call. Allow your camera and microphone when asked.' };
}

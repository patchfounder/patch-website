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

export function sharedRoomNextStage(status, nextStageUrl = MODULE_ONE_URL) {
  // The server retains a finished coach's handoff when Patrick opens the next room.
  return typeof nextStageUrl === 'string' && nextStageUrl.length > 0
    && status?.role === 'coach'
    && status?.removed !== true && status?.nextStageAvailable === true
    && status?.nextStageUrl === nextStageUrl;
}

export function sharedRoomClock(status, nowMs = Date.now()) {
  const start = Date.parse(status?.startAt);
  if (!status?.sessionId || !Number.isFinite(start) || status.status !== 'open' || nowMs < start) return null;
  return countdown((nowMs - start) / 1000);
}

export function sharedRoomMessage(status, { host = false, connection = 'idle', remotePresent = false, stageTitle = 'Activation', nextStageUrl = MODULE_ONE_URL } = {}) {
  if (!status) return { title: `${stageTitle} room`, copy: '' };
  if (status.removed) return { title: 'You’ve left this call', copy: 'Patrick has cleared your place. Please contact him if you entered the wrong session.' };
  if (sharedRoomNextStage(status, nextStageUrl) && !status.hasSeat) return { title: 'Thanks for joining', copy: `Your ${stageTitle} call has finished. Your next step is below.` };
  if (status.status === 'ending') return { title: 'Closing the room', copy: host ? 'The room is closing. If needed, use Retry closing.' : nextStageUrl ? 'Patrick is closing the call. Your next step will appear here.' : 'Patrick is closing the call.' };
  if (status.status === 'ended') return { title: 'Thanks for joining', copy: sharedRoomNextStage(status, nextStageUrl) ? 'Your next step is below.' : 'This call has finished. Patrick will open the room for the next session.' };
  if (!status.ready) return { title: `${stageTitle} room`, copy: '' };
  if (connection === 'reconnecting') return { title: 'Reconnecting your call', copy: 'Your camera and microphone will reconnect automatically.' };
  if (connection === 'connected' && !remotePresent) return { title: host ? 'Waiting for your coach' : 'Waiting for Patrick', copy: '' };
  if (status.status === 'closed') return { title: host ? 'Ready when you are' : `Your ${stageTitle} room`, copy: host ? '' : 'Patrick will open the room when it’s time for your call.' };
  if (host) return { title: 'Your room is open', copy: '' };
  if (status.busy && !status.mayJoin) return { title: 'Call in progress', copy: 'Please wait. Patrick is speaking with another coach.' };
  if (!status.hostPresent) return { title: 'Patrick will be here shortly', copy: '' };
  return { title: 'Patrick is waiting', copy: '' };
}

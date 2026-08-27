import { api, state } from './store.js';
import { el, esc } from './util.js';
import { icon } from './icons.js';
import { avatar, toast } from './ui.js';

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' }
  ]
};

let active = null;
let pending = null;
let lastSignal = 0;
let poller = null;
let started = false;
const seen = new Set();

function durationText(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function supported() {
  return !!(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection);
}

async function grabMedia(withVideo) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: withVideo ? { facingMode: 'user', width: { ideal: 720 } } : false
    });
  } catch (error) {
    if (error.name === 'NotAllowedError') throw new Error('Нет доступа к микрофону. Разрешите его в настройках');
    if (error.name === 'NotFoundError') throw new Error('Камера или микрофон не найдены');
    throw new Error('Не удалось включить микрофон');
  }
}

function overlay(peer, withVideo, role) {
  const view = el(`
    <div class="call-view">
      <video class="call-remote" playsinline autoplay ${withVideo ? '' : 'hidden'}></video>
      <video class="call-local" playsinline autoplay muted ${withVideo ? '' : 'hidden'}></video>
      <div class="call-body">
        ${avatar(peer, 96)}
        <div class="strong" style="font-size:20px;margin-top:14px;text-align:center">${esc(peer?.displayName || 'Собеседник')}</div>
        <div class="small muted" data-status style="margin-top:4px">${role === 'caller' ? 'Вызываем' : 'Соединяем'}</div>
      </div>
      <div class="call-actions">
        <button class="call-btn" data-mic>${icon('mic', 24)}</button>
        <button class="call-btn" data-cam ${withVideo ? '' : 'hidden'}>${icon('video', 24)}</button>
        <button class="call-btn" data-speaker>${icon('volume', 24)}</button>
        <button class="call-btn call-end" data-end>${icon('phone', 24)}</button>
      </div>
    </div>`);
  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';
  return view;
}

function ringtone(stop) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 480;
  osc.connect(gain);
  osc.start();
  let on = false;
  const timer = setInterval(() => {
    on = !on;
    gain.gain.setTargetAtTime(on ? 0.06 : 0, ctx.currentTime, 0.02);
  }, 700);
  const kill = () => {
    clearInterval(timer);
    try {
      osc.stop();
      ctx.close();
    } catch {}
  };
  if (stop) stop(kill);
  return kill;
}

function teardown(reason) {
  if (!active) return;
  const call = active;
  active = null;
  clearInterval(call.timer);
  call.stopRing?.();
  call.stream?.getTracks().forEach((track) => track.stop());
  call.remoteStream?.getTracks().forEach((track) => track.stop());
  try {
    call.pc?.close();
  } catch {}
  document.body.style.overflow = '';
  call.view?.remove();
  if (call.notifySide) api.callSignal?.(call.chatId, call.peer.id, 'end', {}).catch(() => {});
  api.callClear?.(call.chatId).catch(() => {});
  if (call.connectedAt) {
    api
      .sendMessage(call.chatId, { kind: 'call', body: `Звонок ${durationText((Date.now() - call.connectedAt) / 1000)}` })
      .catch(() => {});
    window.dispatchEvent(new CustomEvent('spokum:message', { detail: { chatId: call.chatId } }));
  } else if (call.role === 'caller') {
    api.sendMessage(call.chatId, { kind: 'call', body: 'Звонок без ответа' }).catch(() => {});
  }
  if (reason) toast(reason);
}

function wire(call) {
  const { pc, view } = call;
  const status = view.querySelector('[data-status]');
  const remoteVideo = view.querySelector('.call-remote');
  const localVideo = view.querySelector('.call-local');
  const audio = new Audio();
  audio.autoplay = true;
  call.audio = audio;

  call.remoteStream = new MediaStream();
  audio.srcObject = call.remoteStream;
  remoteVideo.srcObject = call.remoteStream;
  if (call.withVideo) localVideo.srcObject = call.stream;

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      if (!call.remoteStream.getTracks().includes(track)) call.remoteStream.addTrack(track);
    });
    audio.play().catch(() => {});
    remoteVideo.play().catch(() => {});
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    api.callSignal?.(call.chatId, call.peer.id, 'ice', { candidate: event.candidate.toJSON() }).catch(() => {});
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      call.stopRing?.();
      call.stopRing = null;
      if (!call.connectedAt) {
        call.connectedAt = Date.now();
        call.timer = setInterval(() => {
          status.textContent = durationText((Date.now() - call.connectedAt) / 1000);
        }, 500);
      }
      view.querySelector('.call-body').classList.toggle('shrink', call.withVideo);
    }
    if (pc.connectionState === 'failed') teardown('Связь не установилась');
    if (pc.connectionState === 'disconnected') status.textContent = 'Связь пропала';
  };

  view.querySelector('[data-mic]').onclick = (event) => {
    const track = call.stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    event.currentTarget.classList.toggle('off', !track.enabled);
    event.currentTarget.innerHTML = icon(track.enabled ? 'mic' : 'mute', 24);
  };

  view.querySelector('[data-cam]').onclick = (event) => {
    const track = call.stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    event.currentTarget.classList.toggle('off', !track.enabled);
    event.currentTarget.innerHTML = icon(track.enabled ? 'video' : 'cam_off', 24);
  };

  view.querySelector('[data-speaker]').onclick = (event) => {
    audio.volume = audio.volume > 0.5 ? 0.35 : 1;
    event.currentTarget.classList.toggle('off', audio.volume < 0.5);
  };

  view.querySelector('[data-end]').onclick = () => {
    call.notifySide = true;
    teardown();
  };
}

export async function startCall(chat, options = {}) {
  if (active) return toast('Звонок уже идёт', 'err');
  if (!supported()) return toast('Браузер не умеет звонки', 'err');
  if (!chat?.peer?.id) return toast('Звонить можно в личном чате', 'err');

  const withVideo = !!options.video;
  let stream;
  try {
    stream = await grabMedia(withVideo);
  } catch (error) {
    return toast(error.message, 'err');
  }

  const pc = new RTCPeerConnection(ICE);
  const view = overlay(chat.peer, withVideo, 'caller');
  active = { pc, view, stream, chatId: chat.id, peer: chat.peer, role: 'caller', withVideo, notifySide: true };
  active.stopRing = ringtone();
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  wire(active);

  try {
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: withVideo });
    await pc.setLocalDescription(offer);
    await api.callSignal(chat.id, chat.peer.id, 'offer', {
      sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: offer.type, sdp: offer.sdp },
      video: withVideo,
      from: {
        id: state.user?.id,
        displayName: state.user?.displayName,
        username: state.user?.username,
        avatar: state.user?.avatar,
        hue: state.user?.hue
      }
    });
  } catch (error) {
    teardown(error.message || 'Звонок не прошёл');
    return;
  }

  active.giveUp = setTimeout(() => {
    if (active && !active.connectedAt) teardown('Собеседник не ответил');
  }, 45000);
}

function incoming(signal) {
  if (active || pending) {
    api.callSignal?.(signal.chatId, signal.fromId, 'busy', {}).catch(() => {});
    return;
  }
  const from = signal.payload?.from || { id: signal.fromId, displayName: 'Входящий звонок' };
  const withVideo = !!signal.payload?.video;
  const view = el(`
    <div class="call-view">
      <div class="call-body">
        ${avatar(from, 96)}
        <div class="strong" style="font-size:20px;margin-top:14px;text-align:center">${esc(from.displayName || 'Собеседник')}</div>
        <div class="small muted" style="margin-top:4px">${withVideo ? 'Видеозвонок' : 'Входящий звонок'}</div>
      </div>
      <div class="call-actions">
        <button class="call-btn call-end" data-decline>${icon('phone', 24)}</button>
        <button class="call-btn call-take" data-accept>${icon('phone', 24)}</button>
      </div>
    </div>`);
  document.body.appendChild(view);
  document.body.style.overflow = 'hidden';
  const stopRing = ringtone();
  navigator.vibrate?.([300, 200, 300]);

  const close = () => {
    stopRing();
    clearTimeout(timeout);
    document.body.style.overflow = '';
    view.remove();
    if (pending && pending.view === view) pending = null;
  };

  let timeout = 0;
  timeout = setTimeout(() => {
    close();
    api.callSignal?.(signal.chatId, signal.fromId, 'end', {}).catch(() => {});
  }, 40000);
  pending = { chatId: signal.chatId, view, close: () => close() };

  view.querySelector('[data-decline]').onclick = () => {
    close();
    api.callSignal?.(signal.chatId, signal.fromId, 'end', {}).catch(() => {});
  };

  view.querySelector('[data-accept]').onclick = async () => {
    close();
    let stream;
    try {
      stream = await grabMedia(withVideo);
    } catch (error) {
      api.callSignal?.(signal.chatId, signal.fromId, 'end', {}).catch(() => {});
      return toast(error.message, 'err');
    }
    const pc = new RTCPeerConnection(ICE);
    const stage = overlay(from, withVideo, 'callee');
    active = { pc, view: stage, stream, chatId: signal.chatId, peer: from, role: 'callee', withVideo, notifySide: true };
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    wire(active);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp));
      for (const candidate of active.pending || []) await pc.addIceCandidate(candidate).catch(() => {});
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api.callSignal(signal.chatId, signal.fromId, 'answer', {
        sdp: { type: answer.type, sdp: answer.sdp }
      });
    } catch (error) {
      teardown('Не удалось принять звонок');
    }
  };
}

async function handle(signal) {
  if (!signal) return;
  const stamp = `${signal.id || ''}:${signal.kind}:${signal.chatId}`;
  if (seen.has(stamp)) return;
  seen.add(stamp);
  if (seen.size > 400) seen.clear();
  lastSignal = Math.max(lastSignal, Number(signal.id) || 0);

  if (signal.kind === 'end' && pending && pending.chatId === signal.chatId) {
    pending.close();
    return;
  }

  if (signal.kind === 'offer') return incoming(signal);
  if (!active || active.chatId !== signal.chatId) return;

  if (signal.kind === 'answer') {
    try {
      await active.pc.setRemoteDescription(new RTCSessionDescription(signal.payload.sdp));
      clearTimeout(active.giveUp);
      for (const candidate of active.pending || []) await active.pc.addIceCandidate(candidate).catch(() => {});
      active.pending = [];
    } catch {}
    return;
  }

  if (signal.kind === 'ice' && signal.payload?.candidate) {
    const candidate = new RTCIceCandidate(signal.payload.candidate);
    if (!active.pc.remoteDescription) {
      active.pending = active.pending || [];
      active.pending.push(candidate);
      return;
    }
    active.pc.addIceCandidate(candidate).catch(() => {});
    return;
  }

  if (signal.kind === 'busy') {
    active.notifySide = false;
    teardown('Собеседник занят');
    return;
  }

  if (signal.kind === 'end') {
    active.notifySide = false;
    teardown('Звонок завершён');
  }
}

export function initCalls() {
  if (started) return;
  started = true;
  window.addEventListener('spokum:call', (event) => handle(event.detail));
  clearInterval(poller);
  poller = setInterval(async () => {
    if (!state.user || !api.callInbox) return;
    try {
      const { signals } = await api.callInbox(lastSignal);
      for (const signal of signals) await handle(signal);
    } catch {}
  }, 3500);
}

export function stopCalls() {
  clearInterval(poller);
  poller = null;
  started = false;
  pending?.close();
  teardown();
}

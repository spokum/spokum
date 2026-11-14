import { api } from '../store.js';

export async function isAiModerationEnabled() {
  const state = await api.aiModerationState();
  return !!state.enabled;
}

export async function setAiModerationEnabled(on) {
  return api.setAiModerationEnabled(!!on);
}

export async function getAiReports() {
  const { reports } = await api.aiModerationReports();
  return reports || [];
}

export async function resolveReport(id, resolved = true) {
  return api.resolveAiModerationReport(id, resolved);
}

export async function removeReport(id) {
  return resolveReport(id, true);
}

export async function clearAiReports() {
  return api.clearAiModerationReports();
}

async function moderate(text, context) {
  const result = await api.moderateContent(String(text || ''), context);
  return {
    enabled: !!result.enabled,
    allowed: result.allowed !== false,
    removed: !!result.removed || result.allowed === false,
    reason: result.reason || '',
    rule: result.rule || '',
    punishment: result.punishment || '',
    muted: !!result.muted,
    muteUntil: result.muteUntil || 0,
    verified: !!result.verified,
    approvalToken: result.approvalToken || null
  };
}

export function moderatePost(text) {
  return moderate(text, 'post');
}

export function moderateComment(text) {
  return moderate(text, 'comment');
}

export function moderateMessage(text) {
  return moderate(text, 'message');
}

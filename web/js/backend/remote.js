const TOKEN_KEY = 'spokum.token.v1';

export function createRemote(base) {
  const root = base.replace(/\/$/, '');
  let token = localStorage.getItem(TOKEN_KEY);

  async function call(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(root + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok) throw new Error(data.error || 'Ошибка сети');
    return data;
  }

  function setToken(value) {
    token = value;
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }

  const query = (params) => {
    const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''));
    const text = search.toString();
    return text ? `?${text}` : '';
  };

  return {
    mode: 'remote',
    async listAnnouncements() {
      try {
        return await call('GET', '/api/announcements');
      } catch {
        return { announcements: [] };
      }
    },
    createAnnouncement(payload) {
      return call('POST', '/api/announcements', payload);
    },
    deleteAnnouncement(id) {
      return call('DELETE', `/api/announcements/${id}`);
    },
    async bumpViews() {
      return { ok: true };
    },
    async uploadMedia(dataUrl) {
      return dataUrl;
    },
    async callSignal(chatId, toId, kind, payload) {
      return call('POST', `/api/chats/${chatId}/call`, { toId, kind, payload });
    },
    async callInbox() {
      return { signals: [] };
    },
    async callClear() {
      return { ok: true };
    },
    wipePosts(userId) {
      return call('POST', `/api/admin/users/${userId}/wipe`);
    },
    resetLook(userId) {
      return call('POST', `/api/admin/users/${userId}/reset-look`);
    },
    renameUser(userId, name) {
      return call('POST', `/api/admin/users/${userId}/rename`, { name });
    },
    get token() {
      return token;
    },
    socketUrl() {
      if (!token) return null;
      return `${root.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`;
    },

    async register(payload) {
      const data = await call('POST', '/api/auth/register', payload);
      setToken(data.token);
      return { user: data.user };
    },
    async login(payload) {
      const data = await call('POST', '/api/auth/login', payload);
      setToken(data.token);
      return { user: data.user };
    },
    async logout() {
      try {
        await call('POST', '/api/auth/logout');
      } finally {
        setToken(null);
      }
      return { ok: true };
    },
    async me() {
      if (!token) return { user: null };
      try {
        return await call('GET', '/api/me');
      } catch {
        setToken(null);
        return { user: null };
      }
    },
    updateMe: (patch) => call('PATCH', '/api/me', patch),
    changePassword: (payload) => call('POST', '/api/me/password', payload),
    sessions: () => call('GET', '/api/me/sessions'),
    dropSession: (id) => call('DELETE', `/api/me/sessions/${encodeURIComponent(id)}`),

    searchUsers: (q) => call('GET', `/api/users${query({ q })}`),
    getUser: (name) => call('GET', `/api/users/${encodeURIComponent(name)}`),

    listPosts: (params = {}) => call('GET', `/api/posts${query(params)}`),
    createPost: (payload) => call('POST', '/api/posts', payload),
    deletePost: (id) => call('DELETE', `/api/posts/${id}`),
    toggleLike: (id) => call('POST', `/api/posts/${id}/like`, {}),
    listComments: (id) => call('GET', `/api/posts/${id}/comments`),
    addComment: (id, text) => call('POST', `/api/posts/${id}/comments`, { text }),

    contacts: () => call('GET', '/api/contacts'),
    addContact: (id) => call('POST', `/api/contacts/${id}`, {}),
    removeContact: (id) => call('DELETE', `/api/contacts/${id}`),

    chats: () => call('GET', '/api/chats'),
    createChat: (payload) => call('POST', '/api/chats', payload),
    addMember: (chatId, userId) => call('POST', `/api/chats/${chatId}/members`, { userId }),
    messages: (chatId) => call('GET', `/api/chats/${chatId}/messages`),
    sendMessage: (chatId, payload) => call('POST', `/api/chats/${chatId}/messages`, payload),
    markRead: (chatId) => call('POST', `/api/chats/${chatId}/read`, {}),
    callSignal: (chatId, action) => call('POST', `/api/chats/${chatId}/call`, { action }),

    report: (payload) => call('POST', '/api/reports', payload),
    modReports: () => call('GET', '/api/mod/reports'),
    closeReport: (id, status) => call('POST', `/api/mod/reports/${id}/close`, { status }),
    modQueue: () => call('GET', '/api/mod/queue'),
    removePost: (id, reason) => call('POST', `/api/mod/posts/${id}/remove`, { reason }),
    punish: (payload) => call('POST', '/api/mod/punish', payload),
    strikes: (userId) => call('GET', `/api/mod/strikes${query({ userId })}`),

    adminStats: () => call('GET', '/api/admin/stats'),
    adminUsers: (q) => call('GET', `/api/admin/users${query({ q })}`),
    setFlags: (id, flags) => call('POST', `/api/admin/users/${id}/flags`, flags),
    setState: (id, payload) => call('POST', `/api/admin/users/${id}/state`, payload),
    adminActions: () => call('GET', '/api/admin/actions'),
    revertAction: (id, payload) => call('POST', `/api/admin/actions/${id}/revert`, payload || {}),
    adminAudit: () => call('GET', '/api/admin/audit'),

    saveScore: (game, score) => call('POST', '/api/games/score', { game, score }),
    leaderboard: (game) => call('GET', `/api/games/leaderboard${query({ game })}`)
  };
}

const sessions = new Map();

export const getSession = (userId) => sessions.get(userId) || {};
export const setSession = (userId, data) => sessions.set(userId, data);
export const clearSession = (userId) => sessions.delete(userId);
export const updateSession = (userId, patch) =>
  sessions.set(userId, { ...getSession(userId), ...patch });

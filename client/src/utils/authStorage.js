const STORAGE_KEY = 'owner';

/**
 * Reads owner auth data safely from localStorage, then sessionStorage.
 * Returns null if data is absent, invalid, or corrupt JSON.
 */
export const getStoredOwner = () => {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      return JSON.parse(local);
    }
  } catch (e) {
    console.error('Failed to parse owner from localStorage:', e);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // ignore storage errors
    }
  }

  try {
    const session = sessionStorage.getItem(STORAGE_KEY);
    if (session) {
      return JSON.parse(session);
    }
  } catch (e) {
    console.error('Failed to parse owner from sessionStorage:', e);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // ignore storage errors
    }
  }

  return null;
};

/**
 * Returns which storage holds the owner token: 'local' | 'session' | null
 */
export const getStoredOwnerStorageType = () => {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return 'local';
  } catch (_) {
    // ignore
  }
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return 'session';
  } catch (_) {
    // ignore
  }
  return null;
};

/**
 * Stores owner data.
 * If remember is true: persists to localStorage, clears sessionStorage.
 * If remember is false: persists to sessionStorage, clears localStorage.
 */
export const setStoredOwner = (data, remember = true) => {
  const serialized = JSON.stringify(data);
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Error saving owner to localStorage:', e);
    }
  } else {
    try {
      sessionStorage.setItem(STORAGE_KEY, serialized);
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Error saving owner to sessionStorage:', e);
    }
  }
};

/**
 * Clears owner data from both localStorage and sessionStorage.
 */
export const clearStoredOwner = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // ignore
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // ignore
  }
};

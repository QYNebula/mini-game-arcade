const arcadeSaves = (() => {
  const prefix = "mini-game-arcade:save:";

  function read(gameId) {
    try {
      const save = JSON.parse(window.localStorage.getItem(prefix + gameId));
      if (
        !save || !Number.isSafeInteger(save.version) || save.version < 1 ||
        typeof save.savedAt !== "string" || !Number.isFinite(Date.parse(save.savedAt)) ||
        typeof save.summary !== "string" || !Object.hasOwn(save, "state")
      ) {
        return null;
      }

      return save;
    } catch {
      return null;
    }
  }

  function write(gameId, { version, summary, state }) {
    if (!Number.isSafeInteger(version) || version < 1 || typeof summary !== "string") {
      return false;
    }

    try {
      const snapshot = { version, summary, state, savedAt: new Date().toISOString() };
      const encoded = JSON.stringify(snapshot);
      if (!Object.hasOwn(JSON.parse(encoded), "state")) {
        return false;
      }

      window.localStorage.setItem(prefix + gameId, encoded);
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({ read, write });
})();

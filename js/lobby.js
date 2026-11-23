(() => {
  const gameList = document.querySelector("#game-list");
  const librarySummary = document.querySelector("#library-summary");
  const gameFilters = document.querySelector("#game-filters");
  const browseGames = document.querySelector("#browse-games");
  const filters = [...document.querySelectorAll("[data-category]")];
  const cardTemplate = document.querySelector("#game-card-template");

  const gameDialog = document.querySelector("#game-dialog");
  const gameTitle = document.querySelector("#game-title");
  const gameCategory = document.querySelector("#game-category");
  const gameImage = document.querySelector("#game-image");
  const gameDescription = document.querySelector("#game-description");
  const plannedNote = document.querySelector("#planned-note");
  const gameProgress = document.querySelector("#game-progress");
  const gameActions = document.querySelector("#game-actions");
  const resumeGame = document.querySelector("#resume-game");
  const newGame = document.querySelector("#new-game");
  const restartPrompt = document.querySelector("#restart-prompt");
  const cancelRestart = document.querySelector("#cancel-restart");
  const confirmRestart = document.querySelector("#confirm-restart");

  const savesDialog = document.querySelector("#saves-dialog");
  const savesEmpty = document.querySelector("#saves-empty");
  const saveList = document.querySelector("#save-list");
  const saveTemplate = document.querySelector("#save-template");
  const dateFormat = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });
  let currentGame;

  function coverUrl(game) {
    return `assets/${game.id}.webp`;
  }

  function gameSave(game) {
    for (const key of [game.saveKey || game.id, ...(game.priorSaveKeys || [])]) {
      const save = arcadeSaves.read(key);
      if (save) return save;
    }
    return null;
  }

  function renderGames(category) {
    const games = category === "all" ? arcadeGames : arcadeGames.filter((game) => game.category === category);
    const cards = games.map((game, index) => {
      const card = cardTemplate.content.cloneNode(true);
      const image = card.querySelector("img");
      const status = card.querySelector('[data-role="status"]');
      image.loading = index < 3 ? "eager" : "lazy";
      image.src = coverUrl(game);
      status.textContent = game.entry ? "可玩" : "候选";
      status.classList.toggle("is-playable", Boolean(game.entry));
      card.querySelector('[data-role="category"]').textContent = arcadeCategories[game.category];
      card.querySelector('[data-role="title"]').textContent = game.title;
      card.querySelector('[data-role="summary"]').textContent = game.summary;
      const open = card.querySelector("button");
      if (game.directEntry) open.removeAttribute("aria-haspopup");
      open.addEventListener("click", () => {
        if (game.directEntry) launchGame(game);
        else showGame(game);
      });
      return card;
    });

    gameList.replaceChildren(...cards);
    const isEmpty = games.length === 0;
    gameList.hidden = isEmpty;
    librarySummary.classList.toggle("library-empty", isEmpty);
    if (isEmpty) {
      librarySummary.textContent = category === "all"
        ? "游戏上线后会显示在这里。"
        : "这个分类暂无游戏。";
      return;
    }

    librarySummary.textContent = games.every((game) => !game.entry)
      ? `${games.length} 款候选游戏`
      : `${games.length} 款游戏`;
  }

  function refreshGameSave() {
    const save = currentGame.entry ? gameSave(currentGame) : null;
    gameProgress.hidden = !save;
    gameProgress.textContent = save ? `上次进度 · ${save.summary || "已有存档"}` : "";
    resumeGame.hidden = !save;
    newGame.classList.toggle("button-primary", !save);
    newGame.classList.toggle("button-secondary", Boolean(save));
  }

  function showGame(game) {
    currentGame = game;
    gameTitle.textContent = game.title;
    gameCategory.textContent = arcadeCategories[game.category];
    gameImage.src = coverUrl(game);
    gameDescription.textContent = game.description;
    plannedNote.hidden = Boolean(game.entry);
    gameActions.hidden = !game.entry;
    restartPrompt.hidden = true;
    refreshGameSave();
    gameDialog.showModal();
    gameDialog.scrollTop = 0;
  }

  function launchGame(game, mode) {
    const url = new URL(game.entry, document.baseURI);
    if (mode) url.searchParams.set("mode", mode);
    window.location.assign(url);
  }

  function renderSaves() {
    const entries = [];
    for (const game of arcadeGames) {
      if (!game.entry) continue;
      const save = gameSave(game);
      if (save) entries.push({ game, save });
    }

    entries.sort((a, b) => Date.parse(b.save.savedAt) - Date.parse(a.save.savedAt));
    const rows = entries.map(({ game, save }) => {
      const row = saveTemplate.content.cloneNode(true);
      row.querySelector("img").src = coverUrl(game);
      row.querySelector('[data-role="title"]').textContent = game.title;
      row.querySelector('[data-role="summary"]').textContent = save.summary || "已有存档";
      const time = row.querySelector("time");
      time.dateTime = save.savedAt;
      time.textContent = dateFormat.format(new Date(save.savedAt));
      const button = row.querySelector("button");
      button.setAttribute("aria-label", `继续${game.title}`);
      button.addEventListener("click", () => {
        if (gameSave(game)) launchGame(game, "resume");
        else renderSaves();
      });
      return row;
    });

    saveList.replaceChildren(...rows);
    savesEmpty.hidden = rows.length > 0;
  }

  for (const button of filters) {
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-pressed") === "true") return;
      for (const filter of filters) filter.setAttribute("aria-pressed", String(filter === button));
      renderGames(button.dataset.category);
    });
  }

  document.querySelector("#open-saves").addEventListener("click", () => {
    renderSaves();
    savesDialog.showModal();
  });

  resumeGame.addEventListener("click", () => {
    if (gameSave(currentGame)) launchGame(currentGame, "resume");
    else refreshGameSave();
  });

  newGame.addEventListener("click", () => {
    if (!gameSave(currentGame)) {
      launchGame(currentGame, "new");
      return;
    }

    gameActions.hidden = true;
    restartPrompt.hidden = false;
    cancelRestart.focus();
  });

  cancelRestart.addEventListener("click", () => {
    restartPrompt.hidden = true;
    gameActions.hidden = false;
    newGame.focus();
  });

  confirmRestart.addEventListener("click", () => launchGame(currentGame, "new"));

  window.addEventListener("storage", () => {
    if (savesDialog.open) renderSaves();
    if (gameDialog.open) refreshGameSave();
  });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    if (savesDialog.open) renderSaves();
    if (gameDialog.open) {
      restartPrompt.hidden = true;
      gameActions.hidden = !currentGame.entry;
      refreshGameSave();
    }
  });

  const categories = new Set(arcadeGames.map((game) => game.category));
  const hasGames = arcadeGames.length > 0;
  gameFilters.hidden = categories.size < 2;
  for (const filter of filters) {
    filter.hidden = filter.dataset.category !== "all" && !categories.has(filter.dataset.category);
  }
  browseGames.hidden = !hasGames;
  renderGames("all");
})();

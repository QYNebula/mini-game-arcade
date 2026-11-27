const oneDay = 24 * 60 * 60 * 1000;

export function traceFor(room, job) {
  const { id, game } = room.match;
  const part = job.outreach ? "dm_outreach" : job.purpose !== "speech" ? job.purpose :
    job.channel !== "public" ? job.tactical ? "tactics" : job.plan ? "dm_draft" : job.stranger ? "dm_plan" : "chat" :
    job.plan ? "public_draft" : "public_plan";
  return {
    room: room.code, match: id, trace: id + "/" + (job.traceRoot ?? job.id), job: job.id,
    seat: job.seat, day: game.day, phase: game.phase, stage: game.stage, part, channel: job.channel ?? null,
  };
}

export function writeDiagnostic(ctx, database, trace, event, details = {}) {
  if (!database) return;
  const values = [
    Date.now(), trace.room, trace.match, trace.trace, trace.job, trace.seat, trace.day,
    trace.phase, trace.stage, trace.part, trace.channel, event, JSON.stringify(details),
  ];
  const write = Promise.resolve().then(() => database.prepare(
    "INSERT INTO ai_diagnostics (at_ms, room_code, match_id, trace_id, job_id, seat, game_day, phase, stage, part, channel, event, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(...values).run());
  ctx.waitUntil(write.catch(() => console.error("Renmin diagnostic write failed")));
}

export function purgeDiagnostics(database, now) {
  return database.prepare("DELETE FROM ai_diagnostics WHERE at_ms < ?").bind(now - oneDay).run();
}

const knownChannel = /^(?:public|audit|corrupt|dm:[1-9]:[1-9])$/;

function roomMessage(row) {
  return {
    channel: knownChannel.test(row.channel) ? row.channel : "unknown",
    id: Number.isSafeInteger(row.id) ? row.id : null,
    seat: Number.isInteger(row.actor) ? row.actor : null,
    day: Number.isInteger(row.day) ? row.day : null,
  };
}

export function describeSentInput(body) {
  const { messages, model } = JSON.parse(body);
  const packet = JSON.parse(messages.at(-1).content);
  const chat = {};
  for (const field of ["publicChat", "dmChat", "incoming", "ownRemarks", "ownPublicRemarks"]) {
    if (Array.isArray(packet[field])) chat[field] = packet[field].map(roomMessage);
  }
  for (const [channel, rows] of Object.entries(packet.threads || {})) {
    chat["history." + (knownChannel.test(channel) ? channel : "unknown")] = rows.map(roomMessage);
  }
  const messagesUsed = Object.values(chat).flat();
  return {
    model, chat,
    channels: [...new Set(messagesUsed.map((row) => row.channel))].sort(),
    publicCount: new Set(messagesUsed.filter((row) => row.channel === "public").map((row) => row.id)).size,
    sources: {
      publicNotices: (packet.officialNotices || []).map(({ day, kind }) => ({ day, kind })),
      privateNotices: (packet.privateNotices || []).map(({ day, kind }) => ({ day, kind })),
      ownCards: (packet.ownEvidence || []).map(({ day, source }) => ({ day, source })),
      pastChoices: Array.isArray(packet.ownPriorChoices) ? packet.ownPriorChoices.length : 0,
      savedReads: Object.keys(packet.ownSuspicions || {}).length,
    },
  };
}

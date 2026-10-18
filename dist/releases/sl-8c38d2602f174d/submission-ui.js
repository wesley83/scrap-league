import { submission, recognized } from "./boards.js";
import { nameField, rememberDriver } from "./driver-profile.js";
import { time } from "./builds.js";

export function submissionStatus(entry) {
  if (!entry) return "Finish saved locally. Add your name to share this time.";
  if (entry.state === "confirmed")
    return "Time confirmed on the public leaderboard.";
  if (entry.state === "rejected")
    return (
      entry.message ||
      "The server rejected this time. Your local result is kept."
    );
  return (
    "Time queued on this device under “" +
    entry.run.alias +
    "”. " +
    (entry.serverRetryAt > Date.now()
      ? "The server asked us to wait before retrying."
      : "It will retry when a connection is available. You can close this window.")
  );
}

// Board reads are optional. The durable submission path never depends on them.
export async function showSubmission({
  document,
  result,
  settings,
  store,
  boards,
  identities,
  dialog,
  current,
}) {
  const initial = submission(result, settings.driverAlias);
  recognized(initial, await identities);
  if (!current()) return;
  const body = document.createElement("div"),
    field = nameField(document, settings.driverAlias),
    intro = document.createElement("p"),
    status = document.createElement("p"),
    boardStatus = document.createElement("p"),
    list = document.createElement("ol"),
    submit = document.createElement("button");
  intro.textContent =
    time(result.elapsedMs) +
    " · " +
    result.trackName +
    ". Your name and time become public when submitted. Casual client-reported times expire five days after receipt.";
  status.setAttribute("role", "status");
  status.dataset.submissionStatus = "";
  list.className = "board-list";
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = "Submit this time";
  submit.disabled = true;
  field.form.append(submit);
  body.append(intro, field.form, status, boardStatus, list);
  let entry = null,
    busy = false,
    refreshToken = 0;
  const update = () => {
    status.textContent = submissionStatus(entry);
    field.input.readOnly = !!entry;
    if (entry) field.input.value = entry.run.alias;
    submit.disabled = !!entry || busy || !store;
    submit.textContent = entry
      ? entry.state === "confirmed"
        ? "Submitted"
        : entry.state === "rejected"
          ? "Not accepted"
          : "Already queued"
      : "Submit this time";
  };
  const refresh = async () => {
    const token = ++refreshToken;
    boardStatus.textContent = list.children.length
      ? "Refreshing saved display…"
      : "Loading matching times…";
    try {
      const board = await boards.refresh(initial);
      if (!body.isConnected || token !== refreshToken) return;
      list.replaceChildren();
      for (const row of board.rows) {
        const li = document.createElement("li"),
          name = document.createElement("bdi"),
          value = document.createElement("strong");
        name.textContent = row.alias;
        value.textContent = time(row.elapsedMs);
        li.append(name, value);
        list.append(li);
      }
      boardStatus.textContent = board.stale
        ? "Saved times · refresh failed. " + board.error
        : board.rows.length
          ? "Latest matching times"
          : "No matching times yet. Set the first one.";
    } catch (error) {
      if (body.isConnected && token === refreshToken)
        boardStatus.textContent =
          "Times unavailable. You can still queue your result. " +
          error.message;
    }
  };
  const reconcile = async () => {
    if (busy) return;
    busy = true;
    try {
      await store?.retryRuns(result.id);
      await boards.pump();
      const saved = await store?.get("outbox:" + result.id);
      if (body.isConnected) {
        entry = saved || entry;
        update();
        await refresh();
      }
    } catch (error) {
      if (body.isConnected)
        status.textContent = error.message + " Your queued time is retained.";
    } finally {
      busy = false;
      if (body.isConnected) update();
    }
  };
  field.form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || entry) return;
    busy = true;
    submit.disabled = true;
    try {
      const alias = field.read(),
        run = submission(result, alias);
      await rememberDriver(settings, store, alias);
      entry = await store.enqueueRun(run);
      if (body.isConnected) update();
    } catch (error) {
      if (body.isConnected)
        status.textContent =
          error.message + " Your entry is kept; correct it or retry.";
    } finally {
      busy = false;
      submit.disabled = !!entry || !store;
    }
    if (entry) void reconcile();
  };
  dialog("ADD YOUR TIME", body, [
    { label: "Refresh / retry", keep: true, action: reconcile },
    { label: "Close" },
  ]);
  field.input.focus();
  try {
    entry = await store?.get("outbox:" + result.id);
    if (!body.isConnected) return;
    update();
    if (!store)
      status.textContent =
        "Device storage is unavailable. Download your result to keep it.";
  } catch (error) {
    status.textContent = "Could not read saved submissions: " + error.message;
    return;
  }
  void refresh();
}

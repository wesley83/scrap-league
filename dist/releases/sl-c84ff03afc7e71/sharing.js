import qr from "./vendor/qr.js";
import { time } from "./builds.js";
export const GAME_URL = "https://hire-poker-8313.onpagelove.com/";
export function resultInvitation(
  result,
  { date = "", slug = "", publishedId = "", crew = null } = {},
) {
  const url = new URL(GAME_URL);
  if (
    crew &&
    /^[a-z-]+$/.test(crew.slug) &&
    ["bronze", "silver", "gold"].includes(crew.tier)
  )
    url.hash = `crew=${crew.slug}:${crew.tier}`;
  else if (result.mode === "daily" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    url.hash = "daily=" + date;
  else if (publishedId)
    url.hash = "workshop=" + encodeURIComponent(publishedId);
  else if (slug) url.hash = "track=" + encodeURIComponent(slug);
  const position =
    result.classification?.findIndex((c) => c.id === "player") + 1;
  const place =
    result.mode === "league" && position > 0
      ? `${position} of ${result.classification.length} racers`
      : "";
  const lines = [
    "Scrap League · " + result.trackName,
    `${result.dnf ? "DNF" : time(result.elapsedMs)} · ${result.laps} laps · ${result.mode}${place ? " · " + place : ""}`,
    date ? `Daily Spec · ${date} UTC` : "",
    result.performanceDegraded ? "Local result · performance degraded" : "",
    "Build your car. Find your line. Try this circuit.",
  ];
  const text = lines.filter(Boolean).join("\n");
  return {
    title: "Scrap League",
    text,
    url: url.href,
    complete: text + "\n" + url.href,
    date,
    place,
  };
}
export async function shareInvitation(
  invitation,
  {
    navigator: nav = globalThis.navigator,
    manual = () => {},
    copied = () => {},
  } = {},
) {
  if (typeof nav?.share === "function") {
    try {
      await nav.share({
        title: invitation.title,
        text: invitation.text,
        url: invitation.url,
      });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
    }
  }
  try {
    if (typeof nav?.clipboard?.writeText !== "function")
      throw Error("Clipboard unavailable");
    await nav.clipboard.writeText(invitation.complete);
    copied();
    return "copied";
  } catch {
    manual(invitation.complete);
    return "manual";
  }
}
export async function scorecard(
  result,
  invitation,
  { document: doc = globalThis.document } = {},
) {
  await doc.fonts?.ready;
  const canvas = doc.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ece6d5";
  c.fillRect(0, 0, 1200, 630);
  c.fillStyle = "#253126";
  c.fillRect(0, 0, 1200, 106);
  c.fillStyle = "#e9c34b";
  c.font = "64px LeagueDisplay, sans-serif";
  c.fillText("SCRAP LEAGUE", 52, 78);
  c.fillStyle = "#253126";
  c.font = "42px LeagueDisplay, sans-serif";
  c.fillText(result.trackName.toUpperCase(), 52, 176, 840);
  c.font = "112px LeagueDisplay, sans-serif";
  c.fillText(result.dnf ? "DNF" : time(result.elapsedMs), 52, 300, 850);
  c.font = "28px LeagueText, sans-serif";
  c.fillText(
    `${result.laps} LAPS / ${result.mode.toUpperCase()}${invitation.place ? " / " + invitation.place : ""}`,
    56,
    362,
    800,
  );
  if (invitation.date)
    c.fillText(invitation.date + " UTC · DAILY SPEC", 56, 410);
  c.font = "24px LeagueText, sans-serif";
  c.fillText(
    result.performanceDegraded
      ? "Local result · performance degraded"
      : "Build your car. Find your line.",
    56,
    478,
    800,
  );
  c.fillText("Race at hire-poker-8313.onpagelove.com", 56, 574, 800);
  const code = qr(0, "M");
  code.addData(invitation.url);
  code.make();
  const modules = code.getModuleCount(),
    cell = Math.floor(244 / (modules + 8)),
    size = (modules + 8) * cell,
    x = 1148 - size,
    y = 330;
  c.fillStyle = "#fff";
  c.fillRect(x, y, size, size);
  c.fillStyle = "#18201b";
  for (let row = 0; row < modules; row++)
    for (let col = 0; col < modules; col++)
      if (code.isDark(row, col))
        c.fillRect(x + (col + 4) * cell, y + (row + 4) * cell, cell, cell);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(Error("Scorecard could not be created.")),
      "image/png",
    ),
  );
}

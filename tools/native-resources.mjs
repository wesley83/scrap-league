import { DOMParser } from "linkedom";
import { esc } from "../app/model.js";
// Native includes are sufficient here. Avoid server-JavaScript method dispatch:
// the isolated unknown-slug probe returned a provider memory-budget error.
export function nativeResources(index, release, bundle) {
  const doc = new DOMParser().parseFromString(index, "text/html");
  doc.querySelector('script[src="bootstrap.js"]')?.remove();
  const prefix = "/releases/" + release + "/";
  const styles = [...doc.querySelectorAll('head link[rel="stylesheet"]')]
    .map((link) => {
      const href = link.getAttribute("href");
      if (!/^[a-z0-9-]+\.css$/.test(href))
        throw Error(
          "Native shell requires a local release stylesheet: " + href,
        );
      const copy = link.cloneNode(true);
      copy.setAttribute("href", prefix + href);
      return copy.outerHTML;
    })
    .join("");
  const shell =
    '<!doctype html><html><head><title>Scrap League shared shell</title></head><body><div id="game-shell">' +
    styles +
    doc.body.innerHTML +
    '<script src="' +
    prefix +
    'bootstrap.js" defer></script></div></body></html>';
  const wrapper = (path, identity = "") =>
    '<!doctype html><html lang="en" xmlns:p="https://pagelove.org/1.0"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>Scrap League circuit Workshop</title><link rel="icon" href="' +
    prefix +
    'icon.svg"></head><body><p:include resource="' +
    prefix +
    'native-shell.html" selector="#game-shell"></p:include><div id="routed-track" data-track-id="' +
    esc(identity) +
    '" hidden>' +
    (path
      ? '<p:include resource="' +
        esc(path) +
        '" selector="article"></p:include>'
      : "") +
    '</div><noscript><a href="/">Open Scrap League</a> to choose a circuit.</noscript></body></html>';
  const files = [
    { url: prefix + "native-shell.html", name: "shell.html", text: shell },
    ...["editor", "track"].flatMap((mode) => [
      {
        url: "/" + mode + "/:slug",
        name: mode + "-fallback.html",
        text: wrapper(""),
      },
      {
        url: "/" + mode + "/index.html",
        name: mode + "-index.html",
        text: wrapper(""),
      },
      ...bundle.catalog.map((entry) => {
        const track = bundle.tracks.find((t) => t.track.id === entry.id).track;
        return {
          url: "/" + mode + "/" + track.slug,
          name: mode + "-" + track.slug + ".html",
          text: wrapper("/content/" + entry.path, track.id),
        };
      }),
    ]),
  ];
  return files;
}

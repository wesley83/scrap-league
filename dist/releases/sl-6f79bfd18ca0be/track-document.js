import { parseTrack, serializeTrack, structuralErrors } from "./model.js";

const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

// This semantic subtree is the Workshop's editable source. Numeric projections
// are frozen and rebuilt after a source change; command candidates are temporary.
export class TrackDocument {
  constructor(root, Parser = DOMParser) {
    this.root = root;
    this.Parser = Parser;
    this.revision = 0;
  }
  replace(value) {
    if (!value) {
      this.root.replaceChildren();
      this.projection = null;
      this.revision++;
      return;
    }
    const errors = structuralErrors(value);
    if (errors.length) throw Error(errors.join(" "));
    const html = serializeTrack(value),
      candidate = parseTrack(html, this.Parser);
    const doc = new this.Parser().parseFromString(html, "text/html");
    // Commit the whole aggregate once validation succeeds. Partial roads are
    // legal drafts; geometric race readiness remains the compiler's decision.
    this.root.replaceChildren(
      doc.querySelector('[itemtype="urn:ScrapLeague:Track"]'),
    );
    this.projection = freeze(candidate);
    this.revision++;
  }
  read() {
    return this.projection || null;
  }
  html() {
    return this.projection
      ? serializeTrack(parseTrack(this.root.innerHTML, this.Parser))
      : "";
  }
}

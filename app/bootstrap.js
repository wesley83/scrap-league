// Deliberately has no static dependencies: failed app imports cannot disable recovery.
(() => {
  const loading = document.getElementById("loading");
  const message = document.getElementById("loading-message");
  const retry = document.getElementById("startup-retry");
  const stage = document.getElementById("stage");
  const header = document.getElementById("header");
  stage.inert = header.inert = true;
  let finished = false;
  const fail = (reason) => {
    if (finished) return;
    loading.hidden = false;
    // Recovery must remain readable even when the base stylesheet is missing.
    loading.style.cssText = "position:fixed;inset:0;z-index:9999;overflow:auto;padding:32px;background:#142b31;color:#f7f0df;font:18px/1.5 system-ui";
    loading.setAttribute("role", "alert");
    retry.hidden = false;
    message.textContent =
      "The yard could not open. " +
      reason +
      " Your saved progress and drafts are kept.";
    retry.focus();
  };
  const timer = setTimeout(
    () => fail("Loading took too long. Check your connection and try again."),
    20000,
  );
  retry.onclick = () => location.reload();
  const styles = getComputedStyle(document.documentElement);
  if (["--scrap-core-ready", "--scrap-arcade-ready"].some(
    (name) => styles.getPropertyValue(name).trim() !== "1",
  )) {
    clearTimeout(timer);
    fail("A required game stylesheet did not load. Check your connection and reload.");
    return;
  }
  import("./main.js")
    .then((module) => module.ready)
    .then(() => {
      finished = true;
      clearTimeout(timer);
      loading.hidden = true;
      stage.inert = header.inert = false;
    })
    .catch((error) => {
      clearTimeout(timer);
      fail(error.message || "A required game file did not load.");
    });
})();

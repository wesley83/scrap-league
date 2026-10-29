// Deliberately has no static dependencies: failed app imports cannot disable recovery.
(() => {
  const loading = document.getElementById("loading");
  const message = document.getElementById("loading-message");
  const retry = document.getElementById("startup-retry");
  let finished = false;
  const fail = (reason) => {
    if (finished) return;
    loading.hidden = false;
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
  import("./main.js")
    .then((module) => module.ready)
    .then(() => {
      finished = true;
      clearTimeout(timer);
      loading.hidden = true;
    })
    .catch((error) => {
      clearTimeout(timer);
      fail(error.message || "A required game file did not load.");
    });
})();

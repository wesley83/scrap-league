export function workerRequest(
  worker,
  type,
  { timeout = 12000, token = crypto.randomUUID() } = {},
) {
  return new Promise((resolve, reject) => {
    if (!worker) return reject(Error("Offline worker is unavailable."));
    const channel = new MessageChannel();
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      channel.port1.close();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      worker.postMessage({ type: "CANCEL_UPDATE", token });
      finish(Error("Offline operation timed out; retry from the yard."));
    }, timeout);
    channel.port1.onmessage = (e) => {
      if (e.data?.token !== token) return;
      finish(
        e.data.ok
          ? null
          : Error(e.data.error || "Offline verification failed."),
        e.data,
      );
    };
    worker.postMessage({ type, token, deadline: Date.now() + timeout - 1000 }, [
      channel.port2,
    ]);
  });
}

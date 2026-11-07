if ("serviceWorker" in navigator && window.isSecureContext) {
  const workerUrl = new URL("../../sw.js", import.meta.url);
  navigator.serviceWorker.register(workerUrl, { scope: new URL("../../", import.meta.url).pathname }).catch((error) => {
    console.warn("离线缓存未启用：", error);
  });
}

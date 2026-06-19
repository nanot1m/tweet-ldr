chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "CAPTURE_VISIBLE_TAB") {
    const windowId = sender.tab && sender.tab.windowId;

    chrome.tabs.captureVisibleTab(
      windowId,
      { format: "png" },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        sendResponse({ ok: true, dataUrl });
      },
    );

    return true;
  }

  if (message.type === "DOWNLOAD_URL") {
    chrome.downloads.download(
      {
        url: message.url,
        filename: sanitizeDownloadPath(message.filename || "tweet-ldr-download"),
        saveAs: Boolean(message.saveAs),
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        sendResponse({ ok: true, downloadId });
      },
    );

    return true;
  }

  if (message.type === "OPEN_URL") {
    chrome.tabs.create({ url: message.url, active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true, tabId: tab.id });
    });

    return true;
  }

  return false;
});

function sanitizeDownloadPath(filename) {
  return String(filename)
    .replace(/[\\:*?"<>|]+/g, "-")
    .replace(/(^|\/)\.+(?=\/|$)/g, "$1")
    .slice(0, 180);
}

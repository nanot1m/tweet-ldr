(() => {
  const MESSAGE_SOURCE = "tweet-ldr-page-hook";

  patchFetch();
  patchXhr();

  function patchFetch() {
    if (!window.fetch) {
      return;
    }

    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(...args) {
      const response = await originalFetch.apply(this, args);
      inspectResponse(response);
      return response;
    };
  }

  function patchXhr() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this.tweetLdrUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function patchedSend(...args) {
      this.addEventListener("load", () => {
        try {
          if (typeof this.responseText === "string") {
            inspectText(this.responseText);
          }
        } catch {
          // Some XHR response types do not allow responseText access.
        }
      });

      return originalSend.apply(this, args);
    };
  }

  function inspectResponse(response) {
    const contentType = response.headers && response.headers.get("content-type");
    if (!contentType || !contentType.includes("json")) {
      return;
    }

    response
      .clone()
      .text()
      .then(inspectText)
      .catch(() => {});
  }

  function inspectText(text) {
    const urls = extractMp4Urls(text);
    if (!urls.length) {
      return;
    }

    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: "VIDEO_URLS",
        urls,
      },
      window.location.origin,
    );
  }

  function extractMp4Urls(text) {
    const matches = String(text).match(/https?:\\?\/\\?\/video\.twimg\.com[^"'\\\s]+?\.mp4(?:\?[^"'\\\s]*)?/g) || [];
    return [...new Set(matches.map(normalizeUrl).filter(Boolean))];
  }

  function normalizeUrl(url) {
    try {
      return JSON.parse(`"${url.replace(/"/g, '\\"')}"`);
    } catch {
      return url.replace(/\\\//g, "/");
    }
  }
})();

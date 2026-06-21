const BUTTON_GROUP_CLASS = "tweet-ldr-controls";
const PROCESS_ATTR = "data-tweet-ldr-ready";
const MEDIA_URL_LIMIT = 120;
const CAPTURE_HIDE_CLASS = "tweet-ldr-capturing";
const CAPTURE_TARGET_ATTR = "data-tweet-ldr-capture-target";
const PAGE_HOOK_SOURCE = "tweet-ldr-page-hook";
const TWEELOAD_HASH_PREFIX = "#tweet-ldr-url=";

const mediaUrls = [];

const observer = new MutationObserver(() => {
  scheduleEnhanceTweets();
});

let enhanceQueued = false;

listenForPageHookMessages();
startTweetEnhancer();

function startTweetEnhancer() {
  if (!document.documentElement) {
    window.addEventListener("DOMContentLoaded", startTweetEnhancer, { once: true });
    return;
  }

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scheduleEnhanceTweets();
}

function scheduleEnhanceTweets() {
  if (enhanceQueued) {
    return;
  }

  enhanceQueued = true;
  window.requestAnimationFrame(() => {
    enhanceQueued = false;
    enhanceTweets();
  });
}

function enhanceTweets() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet) => {
    if (tweet.hasAttribute(PROCESS_ATTR)) {
      return;
    }

    const actionBar = tweet.querySelector('[role="group"]');
    if (!actionBar) {
      return;
    }

    tweet.setAttribute(PROCESS_ATTR, "true");
    actionBar.appendChild(createControls(tweet));
  });
}

function createControls(tweet) {
  const group = document.createElement("div");
  group.className = BUTTON_GROUP_CLASS;

  const videoButton = createButton("Download video", videoIcon());
  videoButton.addEventListener("click", (event) => {
    event.stopPropagation();
    downloadTweetVideo(tweet, videoButton).catch(() => {
      flashButton(videoButton, "Video failed");
    });
  });

  const screenshotButton = createButton("Copy tweet screenshot", cameraIcon());
  screenshotButton.addEventListener("click", (event) => {
    event.stopPropagation();
    saveTweetScreenshot(tweet, screenshotButton).catch(() => {
      flashButton(screenshotButton, "Capture failed");
    });
  });

  group.append(videoButton, screenshotButton);
  return group;
}

function createButton(label, icon) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tweet-ldr-button";
  button.title = label;
  button.dataset.tweetLdrLabel = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon;
  return button;
}

async function downloadTweetVideo(tweet, button) {
  if (button.disabled) {
    return;
  }

  setButtonBusy(button, true);

  try {
    const video = findTweetVideo(tweet);
    if (!video) {
      flashButton(button, "No video found");
      return;
    }

    const directUrl = getDirectVideoUrl(video);
    if (directUrl) {
      setButtonStatus(button, "Starting...");
      await requestDownload(directUrl, `${tweetFileBase(tweet)}.mp4`, true);
      flashButton(button, "Download started");
      return;
    }

    const loadedMediaUrl = getLoadedMediaUrl(tweet, video);
    if (loadedMediaUrl) {
      setButtonStatus(button, "Starting...");
      const didDownload = await downloadValidatedMediaUrl(loadedMediaUrl, `${tweetFileBase(tweet)}.mp4`);
      if (didDownload) {
        flashButton(button, "Download started");
        return;
      }

      flashButton(button, "Recording fallback");
    }

    if (await openTweetInTweeload(tweet)) {
      flashButton(button, "Opened Tweeload");
      return;
    }

    await recordVideoElement(video, tweetFileBase(tweet), button);
  } finally {
    setButtonBusy(button, false);
  }
}

function findTweetVideo(tweet) {
  return tweet.querySelector("video");
}

function getDirectVideoUrl(video) {
  const candidates = [
    video.currentSrc,
    video.src,
    ...Array.from(video.querySelectorAll("source")).map((source) => source.src),
  ];

  return candidates.find((url) => url && !url.startsWith("blob:")) || null;
}

function listenForPageHookMessages() {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    if (!event.data || event.data.source !== PAGE_HOOK_SOURCE || event.data.type !== "VIDEO_URLS") {
      return;
    }

    event.data.urls.forEach(rememberMediaUrl);
  });
}

function rememberMediaUrl(url) {
  if (!isDownloadableTwitterVideoUrl(url) || mediaUrls.includes(url)) {
    return;
  }

  mediaUrls.push(url);

  if (mediaUrls.length > MEDIA_URL_LIMIT) {
    mediaUrls.shift();
  }
}

function isDownloadableTwitterVideoUrl(url) {
  return /^https:\/\/video\.twimg\.com\//.test(url) &&
    /\.mp4(?:[?#]|$)/.test(url) &&
    !/[?&]container=fmp4(?:&|$)/.test(url);
}

function getLoadedMediaUrl(tweet, video) {
  const mediaId = getTweetMediaId(tweet, video);
  const candidates = mediaUrls
    .map((url) => ({
      url,
      score: scoreMediaUrl(url, mediaId),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates.length ? candidates[0].url : null;
}

async function downloadValidatedMediaUrl(url, filename) {
  try {
    const response = await fetch(url, {
      credentials: "include",
      cache: "force-cache",
    });

    if (!response.ok) {
      return false;
    }

    const blob = await response.blob();
    if (blob.size < 10240 || !blob.type.includes("video")) {
      return false;
    }

    const objectUrl = URL.createObjectURL(blob);
    await requestDownload(objectUrl, filename, true);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    return true;
  } catch {
    return false;
  }
}

async function openTweetInTweeload(tweet) {
  const tweetUrl = getTweetPermalink(tweet);
  if (!tweetUrl) {
    return false;
  }

  const response = await sendMessage({
    type: "OPEN_URL",
    url: `https://tweeload.com/${TWEELOAD_HASH_PREFIX}${encodeURIComponent(tweetUrl)}`,
  });

  return response.ok;
}

function getTweetPermalink(tweet) {
  const statusId = getTweetStatusId(tweet);
  const username = getTweetUsername(tweet, statusId);
  if (!username || !statusId) {
    return null;
  }

  return `https://x.com/${username}/status/${statusId}`;
}

function getTweetStatusId(tweet) {
  const time = tweet.querySelector("time");
  const timeLink = time && time.closest("a[href]");
  const timeStatusId = timeLink && extractStatusId(timeLink.href);
  if (timeStatusId) {
    return timeStatusId;
  }

  const links = getTweetLinks(tweet);
  for (const link of links) {
    const statusId = extractStatusId(link.href);
    if (statusId) {
      return statusId;
    }
  }

  return null;
}

function getTweetUsername(tweet, statusId) {
  const links = getTweetLinks(tweet);
  for (const link of links) {
    const username = extractUsernameFromStatusUrl(link.href, statusId);
    if (username) {
      return username;
    }
  }

  const userNameBlock = tweet.querySelector('[data-testid="User-Name"]');
  const handleText = userNameBlock && userNameBlock.textContent;
  const handle = handleText && handleText.match(/@([A-Za-z0-9_]{1,15})/);
  return handle ? handle[1] : null;
}

function getTweetLinks(tweet) {
  return Array.from(tweet.querySelectorAll("a[href]"));
}

function extractStatusId(href) {
  try {
    const url = new URL(href);
    return (url.pathname.match(/\/status\/(\d+)/) || [])[1] || null;
  } catch {
    return null;
  }
}

function extractUsernameFromStatusUrl(href, statusId) {
  try {
    const url = new URL(href);
    const parts = url.pathname.split("/").filter(Boolean);
    const statusIndex = parts.indexOf("status");
    if (statusIndex < 1 || parts[statusIndex + 1] !== statusId) {
      return null;
    }

    const username = parts[statusIndex - 1];
    return isPublicXUsername(username) ? username : null;
  } catch {
    return null;
  }
}

function isPublicXUsername(username) {
  return /^[A-Za-z0-9_]{1,15}$/.test(username) && !["i", "intent", "share"].includes(username);
}

function getTweetMediaId(tweet, video) {
  const urls = [
    video.poster,
    ...Array.from(tweet.querySelectorAll("img[src]")).map((image) => image.src),
  ];

  for (const url of urls) {
    const mediaId = extractMediaId(url);
    if (mediaId) {
      return mediaId;
    }
  }

  return null;
}

function extractMediaId(url) {
  const match = String(url).match(/\/(?:amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\/(\d+)\//);
  return match ? match[1] : null;
}

function scoreMediaUrl(url, mediaId) {
  let score = 1;

  if (mediaId && url.includes(`/${mediaId}/`)) {
    score += 10000;
  } else if (mediaId) {
    return 0;
  }

  const resolution = url.match(/\/(\d+)x(\d+)\//);
  if (resolution) {
    score += Number(resolution[1]) * Number(resolution[2]);
  }

  return score;
}

async function recordVideoElement(video, fileBase, button) {
  if (!video.captureStream || !window.MediaRecorder) {
    flashButton(button, "Recording unsupported");
    return;
  }

  const stream = video.captureStream();
  if (!stream.getTracks().length) {
    flashButton(button, "Play video first");
    return;
  }

  const wasLooping = video.loop;
  video.loop = false;

  const recorderType = pickRecorderType();
  const chunks = [];
  const recorder = new MediaRecorder(
    stream,
    recorderType ? { mimeType: recorderType.mimeType } : undefined,
  );

  setButtonStatus(button, "Recording...");

  try {
    await new Promise((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) {
          chunks.push(event.data);
        }
      });

      let stopTimer = 0;
      let progressTimer = 0;
      const recordingStartedAt = performance.now();
      const updateProgress = () => {
        setButtonStatus(button, getRecordingProgress(video, recordingStartedAt));
      };
      const stop = () => {
        window.clearTimeout(stopTimer);
        window.clearInterval(progressTimer);
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      recorder.addEventListener("error", () => {
        stop();
        reject(new Error("The browser could not record this video."));
      });

      recorder.addEventListener("stop", resolve, { once: true });

      video.addEventListener("ended", stop, { once: true });
      recorder.start(1000);
      updateProgress();
      progressTimer = window.setInterval(updateProgress, 500);

      if (Number.isFinite(video.duration) && video.duration > 0) {
        try {
          video.currentTime = 0;
        } catch {
          // Some streams cannot seek; recording still works from the current point.
        }

        stopTimer = window.setTimeout(stop, Math.ceil(video.duration * 1000) + 1000);
      }

      video.play().catch((error) => {
        stop();
        reject(error);
      });
    });
  } finally {
    video.loop = wasLooping;
  }

  if (!chunks.length) {
    flashButton(button, "No video data");
    return;
  }

  const savedType = recorder.mimeType || (recorderType && recorderType.mimeType) || "video/webm";
  const extension = extensionForMimeType(savedType);
  const blob = new Blob(chunks, { type: savedType });
  const url = URL.createObjectURL(blob);
  setButtonStatus(button, "Saving...");
  await requestDownload(url, `${fileBase}.${extension}`, true);
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  flashButton(button, "Saved");
}

function pickRecorderType() {
  return [
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
    { mimeType: "video/mp4;codecs=h264,aac", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ].find((type) => MediaRecorder.isTypeSupported(type.mimeType));
}

function extensionForMimeType(mimeType) {
  if (mimeType.includes("mp4")) {
    return "mp4";
  }

  if (mimeType.includes("webm")) {
    return "webm";
  }

  return "webm";
}

function getRecordingProgress(video, recordingStartedAt) {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const percent = clamp(Math.round((currentTime / video.duration) * 100), 0, 100);
    return `Recording ${percent}%`;
  }

  const seconds = Math.max(0, Math.floor((performance.now() - recordingStartedAt) / 1000));
  return `Recording ${seconds}s`;
}

async function saveTweetScreenshot(tweet, button) {
  flashButton(button, "Capturing...");

  let capture;
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }

  tweet.setAttribute(CAPTURE_TARGET_ATTR, "true");
  document.documentElement.classList.add(CAPTURE_HIDE_CLASS);

  try {
    await waitForPaint();
    capture = await sendMessage({ type: "CAPTURE_VISIBLE_TAB" });
  } finally {
    document.documentElement.classList.remove(CAPTURE_HIDE_CLASS);
    tweet.removeAttribute(CAPTURE_TARGET_ATTR);
  }

  if (!capture || !capture.ok) {
    flashButton(button, "Capture failed");
    return;
  }

  const dataUrl = await cropCaptureToTweet(capture.dataUrl, tweet);
  const didCopy = await copyPngDataUrlToClipboard(dataUrl);
  flashButton(button, didCopy ? "Copied" : "Copy failed");
}

async function copyPngDataUrlToClipboard(dataUrl) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    return false;
  }

  try {
    const blob = await dataUrlToBlob(dataUrl);
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type || "image/png"]: blob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function waitForPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

async function cropCaptureToTweet(dataUrl, tweet) {
  const image = await loadImage(dataUrl);
  const rect = tweet.getBoundingClientRect();
  const scaleX = image.naturalWidth / window.innerWidth;
  const scaleY = image.naturalHeight / window.innerHeight;
  const capturePadding = 0;

  const sourceX = clamp((rect.left - capturePadding) * scaleX, 0, image.naturalWidth);
  const sourceY = clamp((rect.top - capturePadding) * scaleY, 0, image.naturalHeight);
  const sourceWidth = clamp((rect.width + capturePadding * 2) * scaleX, 1, image.naturalWidth - sourceX);
  const sourceHeight = clamp((rect.height + capturePadding * 2) * scaleY, 1, image.naturalHeight - sourceY);
  const decorationScale = Math.max(scaleX, scaleY, 1);
  const outputPadding = Math.round(36 * decorationScale);
  const shadowBlur = Math.round(24 * decorationScale);
  const shadowOffsetY = Math.round(10 * decorationScale);
  const radius = Math.round(22 * decorationScale);
  const targetX = outputPadding;
  const targetY = outputPadding;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth + outputPadding * 2);
  canvas.height = Math.round(sourceHeight + outputPadding * 2);

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.shadowColor = "rgba(15, 20, 25, 0.28)";
  context.shadowBlur = shadowBlur;
  context.shadowOffsetY = shadowOffsetY;
  context.fillStyle = "#fff";
  roundedRect(context, targetX, targetY, sourceWidth, sourceHeight, radius);
  context.fill();
  context.restore();

  context.save();
  roundedRect(context, targetX, targetY, sourceWidth, sourceHeight, radius);
  context.clip();
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    targetX,
    targetY,
    sourceWidth,
    sourceHeight,
  );
  context.restore();

  return canvas.toDataURL("image/png");
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", reject, { once: true });
    image.src = src;
  });
}

function tweetFileBase(tweet) {
  const tweetUrl = getTweetPermalink(tweet);
  const statusId = tweetUrl && (tweetUrl.match(/\/status\/(\d+)/) || [])[1];
  const suffix = statusId || new Date().toISOString().replace(/[:.]/g, "-");
  return `tweet-ldr/tweet-${suffix}`;
}

function requestDownload(url, filename, saveAs) {
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    downloadInPage(url, filename);
    return Promise.resolve({ ok: true });
  }

  return sendMessage({
    type: "DOWNLOAD_URL",
    url,
    filename,
    saveAs,
  });
}

function downloadInPage(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.split("/").pop() || "tweet-ldr-download";
  link.rel = "noopener";
  link.style.display = "none";
  document.documentElement.appendChild(link);
  link.click();
  link.remove();
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response || { ok: false, error: "No response from extension." });
    });
  });
}

function flashButton(button, text) {
  setButtonStatus(button, text);
  window.clearTimeout(button.tweetLdrStatusTimer);
  button.tweetLdrStatusTimer = window.setTimeout(() => {
    clearButtonStatus(button);
  }, 1800);
}

function setButtonBusy(button, isBusy) {
  button.disabled = isBusy;
  button.setAttribute("aria-disabled", String(isBusy));
}

function setButtonStatus(button, text) {
  button.dataset.tweetLdrStatus = text;
  button.title = text;
  button.setAttribute("aria-label", text);
  window.clearTimeout(button.tweetLdrStatusTimer);
}

function clearButtonStatus(button) {
  const label = button.dataset.tweetLdrLabel || "";
  delete button.dataset.tweetLdrStatus;
  button.title = label;
  button.setAttribute("aria-label", label);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function videoIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h8A2.5 2.5 0 0 1 17 5.5v2.1l2.5-1.7A1 1 0 0 1 21 6.7v10.6a1 1 0 0 1-1.5.8L17 16.4v2.1a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 4 18.5v-13Zm2.5-.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-13a.5.5 0 0 0-.5-.5h-8Zm10.5 5v4l2 1.3V8.7L17 10Z"/></svg>';
}

function cameraIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9.2 4 7.8 6H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-2.8l-1.4-2H9.2ZM5 8h3.8l1.4-2h3.6l1.4 2H19a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm7 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/></svg>';
}

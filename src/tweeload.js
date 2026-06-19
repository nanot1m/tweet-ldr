const HASH_PREFIX = "#tweet-ldr-url=";

submitTweetUrlFromHash();

function submitTweetUrlFromHash() {
  if (!window.location.hash.startsWith(HASH_PREFIX)) {
    return;
  }

  const tweetUrl = decodeURIComponent(window.location.hash.slice(HASH_PREFIX.length));
  if (!/^https:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/.test(tweetUrl)) {
    return;
  }

  const form = document.querySelector("form.download__form");
  const input = form && form.querySelector('input[name="url"]');
  if (!form || !input) {
    return;
  }

  input.value = tweetUrl;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  form.requestSubmit();
}

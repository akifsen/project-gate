const USER_ID = "1";
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const loading = document.querySelector("[data-testid=loading]");
const empty = document.querySelector("[data-testid=empty-state]");
const image = document.querySelector("[data-testid=avatar-image]");
const success = document.querySelector("[data-testid=success]");
const validation = document.querySelector("[data-testid=validation-error]");
const uploading = document.querySelector("[data-testid=uploading]");
const params = new URLSearchParams(location.search);
ensureSession();

if (params.get("state") === "loading") {
  loading.hidden = false;
  empty.hidden = true;
} else if (params.get("state") === "server-error") {
  const probe = await fetch("/api/error-probe");
  if (!probe.ok) {
    // The broken client swallows the failure and never reveals the error state.
  }
} else {
  loading.hidden = false;
  const meta = await fetch(`/api/users/${USER_ID}/avatar-meta`);
  const data = await meta.json();
  loading.hidden = true;
  if (data.url) showPreview(data.url);
  else empty.hidden = false;
}

document.querySelector("form").addEventListener("submit", (event) => {
  event.preventDefault();
  const file = document.querySelector("[data-testid=avatar-input]").files?.[0];
  if (file) void submit(file);
});

async function submit(file) {
  validation.hidden = true;
  success.hidden = true;
  if (!ALLOWED.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
    validation.hidden = false;
    return;
  }
  uploading.hidden = false;
  const body = new FormData();
  body.append("avatar", file);
  const response = await fetch(`/api/users/${USER_ID}/avatar`, {
    method: "POST",
    body,
    headers: { "x-user-id": USER_ID },
  });
  uploading.hidden = true;
  if (response.status === 413 || response.status === 422) {
    validation.hidden = false;
    return;
  }
  if (!response.ok) return;
  image.src = URL.createObjectURL(file);
  image.hidden = false;
  empty.hidden = true;
  success.hidden = false;
}

function ensureSession() {
  if (document.cookie.split("; ").some((row) => row.startsWith("avatar-session="))) return;
  document.cookie = `avatar-session=${Math.random().toString(36).slice(2)}; path=/`;
}

function showPreview(url) {
  image.src = url;
  image.hidden = false;
  empty.hidden = true;
}

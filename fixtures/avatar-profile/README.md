# Avatar profile fixture

This small Node application is the V1 proof for Project Gate. The files at the repository root are intentionally broken:

- `public/styles.css` forces a 980px page below 700px, so the 390px viewport overflows.
- `auth.mjs` allows any caller to replace any user's avatar.
- `store.mjs` discards uploads, and `public/main.js` only keeps a blob preview, so a refresh loses the avatar.
- `public/main.js` does not reveal the server-error state.

`fixed/` contains the corrected versions of those files. The end-to-end test copies them over and runs `projectgate verify`, which should carry the unchanged mime unit check and re-run the failed checks.

Browser checks set an `avatar-session` cookie and the server stores avatars under that session. API checks do not send the cookie, so an authorization or upload request cannot hide the empty profile state from a later browser check. A reload in the same browser check keeps the cookie, which is what the refresh criterion observes.

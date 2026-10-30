export function layout(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · agentbridge</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 3rem auto; padding: 0 1rem; }
    label { display: block; margin: 0.75rem 0 0.25rem; }
    input { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button { margin-top: 1rem; padding: 0.5rem 1rem; }
    .error { color: #b00020; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

export function signInPage(baseUrl: string) {
  return layout(
    "Sign in",
    `<form id="signin">
  <label>Email<input name="email" type="email" required /></label>
  <label>Password<input name="password" type="password" required /></label>
  <button type="submit">Sign in</button>
  <p class="error" id="err"></p>
</form>
<script type="module">
  const base = ${JSON.stringify(baseUrl)};
  document.getElementById("signin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const query = new URLSearchParams(location.search);
    const res = await fetch(base + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
        ...(query.has("sig") ? { oauth_query: location.search.slice(1) } : {}),
      }),
    });
    if (!res.ok) {
      document.getElementById("err").textContent = "Sign in failed";
      return;
    }
    const data = await res.json();
    const redirect = query.get("redirect");
    location.href = data.url || (redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/");
  });
</script>`,
  );
}

export function consentPage() {
  return layout(
    "Consent",
    `<p>Authorize this MCP client to access agentbridge on your account.</p>
<button id="accept">Authorize</button><button id="deny">Deny</button>
<p class="error" id="err"></p>
<script type="module">
  async function consent(accept) {
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: location.search.slice(1) }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error("Consent failed. Please sign in and try again.");
      location.href = data.url;
    } catch (err) { document.getElementById("err").textContent = err.message; }
  }
  document.getElementById("accept").onclick = () => consent(true);
  document.getElementById("deny").onclick = () => consent(false);
</script>`,
  );
}

export function devicePage() {
  return layout(
    "Device authorization",
    `<form id="device">
  <label>Device code<input name="user_code" required placeholder="ABCD-1234" /></label>
  <button type="submit">Continue</button>
  <p class="error" id="err"></p>
</form>
<div id="approve" hidden>
  <p id="meta"></p>
  <button id="approveBtn">Approve</button>
  <button id="denyBtn">Deny</button>
</div>
<script type="module">
  let userCode = new URLSearchParams(location.search).get("user_code") || "";
  const form = document.getElementById("device");
  if (userCode) form.user_code.value = userCode;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    userCode = form.user_code.value.trim().replace(/-/g, "").toUpperCase();
    const res = await fetch("/api/auth/device?user_code=" + encodeURIComponent(userCode), {
      credentials: "include",
    });
    if (!res.ok) {
      document.getElementById("err").textContent = "Invalid or expired code. Sign in first.";
      return;
    }
    const data = await res.json();
    document.getElementById("meta").textContent =
      "Client: " + (data.client_id || "unknown") + " · Scopes: " + (data.scope || "none");
    form.hidden = true;
    document.getElementById("approve").hidden = false;
  });

  document.getElementById("approveBtn").onclick = async () => {
    await fetch("/api/auth/device/approve", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userCode }),
    });
    alert("Device approved");
    location.href = "/";
  };
  document.getElementById("denyBtn").onclick = async () => {
    await fetch("/api/auth/device/deny", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userCode }),
    });
    alert("Device denied");
    location.href = "/";
  };
</script>`,
  );
}

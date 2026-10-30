import { Resend } from "resend";
import type { Env } from "../../env.js";

let resend: Resend | null = null;

function getResend(env: Env) {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  if (!resend) {
    resend = new Resend(apiKey);
  }
  return resend;
}

export type SendVerificationEmailInput = {
  email: string;
  name?: string | null;
  url: string;
};

export async function sendVerificationEmail(
  env: Env,
  input: SendVerificationEmailInput,
) {
  const client = getResend(env);

  if (!client) {
    console.info(
      `[auth] verification link for ${input.email} (set RESEND_API_KEY to send email):\n${input.url}`,
    );
    return;
  }

  const { error } = await client.emails.send({
    from: env.RESEND_FROM,
    to: input.email,
    subject: "Verify your agentbridge email",
    text: `Verify your email for agentbridge\n\n${input.url}\n\nIf you did not create an account, you can ignore this email.`,
    html: `<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
    <p>Hi${input.name ? ` ${escapeHtml(input.name)}` : ""},</p>
    <p>Verify your email for <strong>agentbridge</strong>.</p>
    <p><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Verify email</a></p>
    <p style="font-size:13px;color:#555;">Or copy this link:<br /><a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>
    <p style="font-size:12px;color:#777;">If you did not create an account, you can ignore this email.</p>
  </body>
</html>`,
  });

  if (error) {
    throw new Error(error.message);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

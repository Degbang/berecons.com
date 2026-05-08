const TO_EMAIL_FALLBACK = "bereconsllc@gmail.com";

const FORM_SCHEMAS = {
  "website-development-questionnaire": {
    title: "Website Development Questionnaire",
    fields: [
      ["client_name", "Client"],
      ["questionnaire_date", "Date"],
      ["q_company_overview", "1. Company name and products/services"],
      ["q_value_proposition", "2. Unique value proposition"],
      ["q_competitors", "3. Top 3 competitors"],
      ["q_primary_goal", "4. Primary website goal"],
      ["q_secondary_goals", "5. Secondary goals"],
      ["q_ideal_customer", "6. Ideal customer"],
      ["q_target_action", "7. Desired visitor action"],
      ["q_success_metrics", "8. Success metrics"],
      ["contact_name", "Contact name"],
      ["contact_email", "Contact email"],
    ],
  },
  "quote-request": {
    title: "Quote Request",
    fields: [
      ["quote_client_name", "Client name"],
      ["quote_contact_email", "Contact email"],
      ["quote_project_type", "Project type"],
      ["quote_timeline", "Preferred timeline"],
      ["quote_budget", "Budget range"],
      ["quote_project_summary", "Project summary"],
    ],
  },
};

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? value.trim() : String(value ?? "")])
  );
}

function buildEmailText(schema, data, submittedFrom) {
  const lines = [`Berecons ${schema.title}`, ""];

  for (const [fieldName, label] of schema.fields) {
    lines.push(`${label}:`);
    lines.push(data[fieldName] || "Not provided");
    lines.push("");
  }

  lines.push("Submitted from:");
  lines.push(submittedFrom || "Not provided");

  return lines.join("\n");
}

function buildEmailHtml(schema, data, submittedFrom) {
  const rows = schema.fields
    .map(
      ([fieldName, label]) => `
        <tr>
          <td style="padding:10px 12px;border:1px solid #d9e3f0;font-weight:600;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:10px 12px;border:1px solid #d9e3f0;white-space:pre-wrap;">${escapeHtml(data[fieldName] || "Not provided")}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#081234;line-height:1.5;">
      <h1 style="margin:0 0 16px;font-size:20px;">Berecons ${escapeHtml(schema.title)}</h1>
      <table style="border-collapse:collapse;width:100%;max-width:900px;">
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:16px 0 0;"><strong>Submitted from:</strong> ${escapeHtml(submittedFrom || "Not provided")}</p>
    </div>
  `;
}

async function sendWithResend(env, subject, replyTo, text, html) {
  const resendApiKey = env.RESEND_API_KEY;
  const fromEmail = env.RESEND_FROM_EMAIL;
  const toEmail = env.FORM_TO_EMAIL || TO_EMAIL_FALLBACK;

  if (!resendApiKey || !fromEmail) {
    throw new Error("Missing RESEND_API_KEY or RESEND_FROM_EMAIL.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject,
      text,
      html,
      reply_to: replyTo || undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend request failed: ${errorText}`);
  }
}

export async function onRequestPost({ request, env }) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { message: "Invalid JSON payload." });
  }

  const formType = typeof payload?.formType === "string" ? payload.formType : "";
  const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
  const replyTo = typeof payload?.replyTo === "string" ? payload.replyTo.trim() : "";
  const submittedFrom = typeof payload?.submittedFrom === "string" ? payload.submittedFrom.trim() : "";
  const data = normalizeData(payload?.data);
  const schema = FORM_SCHEMAS[formType];

  if (!schema) {
    return jsonResponse(400, { message: "Unsupported form type." });
  }

  if (!subject) {
    return jsonResponse(400, { message: "Missing email subject." });
  }

  try {
    const text = buildEmailText(schema, data, submittedFrom);
    const html = buildEmailHtml(schema, data, submittedFrom);
    await sendWithResend(env, subject, replyTo, text, html);
    return jsonResponse(200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed.";
    return jsonResponse(500, { message });
  }
}

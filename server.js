const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

class BereconsAppServer {
  constructor(options = {}) {
    this.rootDir = options.rootDir || __dirname;
    this.port = Number(options.port || process.env.PORT || 3000);
    this.host = options.host || process.env.HOST || "0.0.0.0";
    this.maxBodySizeBytes = 1024 * 1024;
    this.formToEmailFallback = "bereconsllc@gmail.com";
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        console.error("[Berecons] unhandled request error", error);
        this.sendJson(res, 500, { message: "Internal server error." });
      });
    });
  }

  async start() {
    await this.loadEnvFile(".dev.vars");
    await this.loadEnvFile(".env");

    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        console.info(`[Berecons] server listening on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  async loadEnvFile(fileName) {
    const filePath = path.join(this.rootDir, fileName);

    try {
      const contents = await fsp.readFile(filePath, "utf8");
      contents.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) return;

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        if (!key || process.env[key]) return;

        process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
      });
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }
  }

  async handleRequest(req, res) {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/quote-submit") {
      if (req.method !== "POST") {
        this.sendJson(res, 405, { message: "Method not allowed." }, { Allow: "POST" });
        return;
      }

      await this.handleQuoteSubmit(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      this.sendJson(res, 405, { message: "Method not allowed." }, { Allow: "GET, HEAD, POST" });
      return;
    }

    await this.serveStatic(requestUrl.pathname, req.method === "HEAD", res);
  }

  resolveStaticPath(requestPath) {
    const pathname = decodeURIComponent(requestPath || "/");
    const normalized = pathname === "/" ? "/index.html" : pathname;
    const safePath = path.normalize(normalized).replace(/^(\.\.[/\\])+/, "");
    return path.join(this.rootDir, safePath);
  }

  async serveStatic(requestPath, isHeadRequest, res) {
    const filePath = this.resolveStaticPath(requestPath);

    if (!filePath.startsWith(this.rootDir)) {
      this.sendPlainText(res, 403, "Forbidden.");
      return;
    }

    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        this.sendPlainText(res, 404, "Not found.");
        return;
      }
      throw error;
    }

    if (stat.isDirectory()) {
      await this.serveStatic(path.join(requestPath, "index.html"), isHeadRequest, res);
      return;
    }

    const relativePath = path.relative(this.rootDir, filePath).replaceAll(path.sep, "/");
    const headers = {
      "Content-Type": this.getContentType(filePath),
      "Content-Length": stat.size,
      ...this.getCacheHeaders(`/${relativePath}`),
    };

    res.writeHead(200, headers);
    if (isHeadRequest) {
      res.end();
      return;
    }

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on("error", reject);
      stream.on("end", resolve);
      stream.pipe(res);
    });
  }

  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".css": "text/css; charset=utf-8",
      ".gif": "image/gif",
      ".html": "text/html; charset=utf-8",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".mp4": "video/mp4",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".ttf": "font/ttf",
      ".txt": "text/plain; charset=utf-8",
      ".webp": "image/webp",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    };

    return types[ext] || "application/octet-stream";
  }

  getCacheHeaders(relativePath) {
    if (relativePath === "/" || relativePath === "/index.html" || relativePath.endsWith(".html")) {
      return {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      };
    }

    if (relativePath === "/styles.css" || relativePath === "/script.js") {
      return {
        "Cache-Control": "public, max-age=0, must-revalidate",
      };
    }

    if (
      relativePath === "/assets/hero.mp4" ||
      relativePath.endsWith(".jpg") ||
      relativePath.endsWith(".png")
    ) {
      return {
        "Cache-Control": "public, max-age=0, must-revalidate",
      };
    }

    if (relativePath.startsWith("/assets/fonts/")) {
      return {
        "Cache-Control": "public, max-age=31536000, immutable",
      };
    }

    return {
      "Cache-Control": "public, max-age=0, must-revalidate",
    };
  }

  async readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";

      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
        if (Buffer.byteLength(body, "utf8") > this.maxBodySizeBytes) {
          reject(new Error("Payload too large."));
          req.destroy();
        }
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(body || "{}"));
        } catch {
          reject(new Error("Invalid JSON payload."));
        }
      });
      req.on("error", reject);
    });
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  normalizeData(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : String(value ?? ""),
      ])
    );
  }

  getFormSchemas() {
    return {
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
  }

  buildEmailText(schema, data, submittedFrom) {
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

  buildEmailHtml(schema, data, submittedFrom) {
    const rows = schema.fields
      .map(
        ([fieldName, label]) => `
        <tr>
          <td style="padding:10px 12px;border:1px solid #d9e3f0;font-weight:600;vertical-align:top;">${this.escapeHtml(label)}</td>
          <td style="padding:10px 12px;border:1px solid #d9e3f0;white-space:pre-wrap;">${this.escapeHtml(data[fieldName] || "Not provided")}</td>
        </tr>`
      )
      .join("");

    return `
      <div style="font-family:Arial,sans-serif;color:#081234;line-height:1.5;">
        <h1 style="margin:0 0 16px;font-size:20px;">Berecons ${this.escapeHtml(schema.title)}</h1>
        <table style="border-collapse:collapse;width:100%;max-width:900px;">
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:16px 0 0;"><strong>Submitted from:</strong> ${this.escapeHtml(submittedFrom || "Not provided")}</p>
      </div>
    `;
  }

  async sendWithResend(subject, replyTo, text, html) {
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const toEmail = process.env.FORM_TO_EMAIL || this.formToEmailFallback;

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

  async handleQuoteSubmit(req, res) {
    let payload;

    try {
      payload = await this.readJsonBody(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request.";
      const status = message === "Payload too large." ? 413 : 400;
      this.sendJson(res, status, { message });
      return;
    }

    const formSchemas = this.getFormSchemas();
    const formType = typeof payload?.formType === "string" ? payload.formType : "";
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const replyTo = typeof payload?.replyTo === "string" ? payload.replyTo.trim() : "";
    const submittedFrom =
      typeof payload?.submittedFrom === "string" ? payload.submittedFrom.trim() : "";
    const data = this.normalizeData(payload?.data);
    const schema = formSchemas[formType];

    if (!schema) {
      this.sendJson(res, 400, { message: "Unsupported form type." });
      return;
    }

    if (!subject) {
      this.sendJson(res, 400, { message: "Missing email subject." });
      return;
    }

    try {
      const text = this.buildEmailText(schema, data, submittedFrom);
      const html = this.buildEmailHtml(schema, data, submittedFrom);
      await this.sendWithResend(subject, replyTo, text, html);
      this.sendJson(res, 200, { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email send failed.";
      this.sendJson(res, 500, { message });
    }
  }

  sendJson(res, status, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body, "utf8"),
      ...extraHeaders,
    });
    res.end(body);
  }

  sendPlainText(res, status, message) {
    res.writeHead(status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": Buffer.byteLength(message, "utf8"),
    });
    res.end(message);
  }
}

if (require.main === module) {
  const app = new BereconsAppServer();
  app.start().catch((error) => {
    console.error("[Berecons] failed to start", error);
    process.exitCode = 1;
  });
}

module.exports = { BereconsAppServer };

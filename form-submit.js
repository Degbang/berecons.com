(function initBereconsFormSubmit() {
  const PRIMARY_SUBMIT_ENDPOINT = "/api/quote-submit";
  const LOCAL_FALLBACK_SUBMIT_ENDPOINT = "https://www.berecons.com/api/quote-submit";

  function isLocalPreviewHost() {
    const { protocol, hostname } = window.location;
    return protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1";
  }

  function getSubmitEndpoints() {
    return isLocalPreviewHost()
      ? [PRIMARY_SUBMIT_ENDPOINT, LOCAL_FALLBACK_SUBMIT_ENDPOINT]
      : [PRIMARY_SUBMIT_ENDPOINT];
  }

  async function submitToEndpoint(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    let data = null;
    let text = "";

    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    } else {
      try {
        text = await response.text();
      } catch {
        text = "";
      }
    }

    if (!response.ok) {
      const error = new Error(
        data && typeof data.message === "string" && data.message.trim()
          ? data.message.trim()
          : "Submission failed. Try again in a moment."
      );
      error.status = response.status;
      error.isHtmlResponse = contentType.includes("text/html") || /<html/i.test(text);
      throw error;
    }

    return data;
  }

  async function submitPayload(payload) {
    let lastError = null;

    for (const endpoint of getSubmitEndpoints()) {
      try {
        return await submitToEndpoint(endpoint, payload);
      } catch (error) {
        lastError = error;
        const canRetryWithFallback =
          endpoint !== LOCAL_FALLBACK_SUBMIT_ENDPOINT &&
          isLocalPreviewHost() &&
          (error?.status === 404 ||
            error?.status === 405 ||
            error?.status === 501 ||
            error?.isHtmlResponse === true ||
            error instanceof TypeError);

        if (!canRetryWithFallback) {
          throw error;
        }
      }
    }

    throw lastError || new Error("Submission failed. Try again in a moment.");
  }

  window.BereconsFormSubmit = {
    submitPayload,
  };
})();

(function initContactForm() {
  const form = document.querySelector(".inquiry-form");
  if (!form || !window.BereconsFormSubmit) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const feedback = document.getElementById("inquiry-form-feedback");

  function setFeedback(message, state) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.remove("is-error", "is-success");
    if (state) feedback.classList.add(state);
  }

  function buildPayload() {
    const data = Object.fromEntries(new FormData(form).entries());
    const identity = data.organisation?.trim() || data.name?.trim() || "Contact";

    return {
      formType: "contact-inquiry",
      subject: `[Berecons] Contact Inquiry - ${identity}`,
      replyTo: data.email?.trim() || "",
      submittedFrom: window.location.href,
      data,
    };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback("", "");

    if (!form.reportValidity()) return;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }
    setFeedback("Sending inquiry...", "is-success");

    try {
      await window.BereconsFormSubmit.submitPayload(buildPayload());
      form.reset();
      setFeedback("Inquiry sent successfully.", "is-success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed.";
      setFeedback(message, "is-error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Send Message";
      }
    }
  });
})();

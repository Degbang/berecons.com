(function initQuoteV2() {
  const form = document.getElementById("quote-v2-form");
  if (!form || !window.BereconsFormSubmit) return;

  const panels = [...form.querySelectorAll("[data-quote-v2-panel]")];
  const indicators = [...document.querySelectorAll(".quote-v2-progress .quote-v2-step")];
  const prevButton = document.getElementById("quote-v2-prev");
  const nextButton = document.getElementById("quote-v2-next");
  const submitButton = document.getElementById("quote-v2-submit");
  const feedback = document.getElementById("quote-v2-feedback");

  if (!panels.length || !prevButton || !nextButton || !submitButton) return;

  const DRAFT_KEY = "berecons-quote-v2-draft";
  let activeStep = 0;

  function setFeedback(message, state) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.remove("is-error", "is-success");
    if (state) feedback.classList.add(state);
  }

  function getStepRequiredFields(stepIndex) {
    const panel = panels[stepIndex];
    if (!panel) return [];
    return [...panel.querySelectorAll("[required]")];
  }

  function setStep(stepIndex) {
    activeStep = Math.max(0, Math.min(stepIndex, panels.length - 1));

    panels.forEach((panel, index) => {
      const isActive = index === activeStep;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });

    indicators.forEach((indicator, index) => {
      indicator.classList.toggle("is-active", index === activeStep);
    });

    if (activeStep === 0) {
      prevButton.textContent = "Save Draft";
      nextButton.textContent = "Continue to Step 2 →";
      nextButton.hidden = false;
      submitButton.hidden = true;
      return;
    }

    prevButton.textContent = "← Previous";
    if (activeStep < panels.length - 1) {
      nextButton.textContent = `Continue to Step ${activeStep + 2} →`;
      nextButton.hidden = false;
      submitButton.hidden = true;
    } else {
      nextButton.hidden = true;
      submitButton.hidden = false;
    }
  }

  function validateCurrentStep() {
    const requiredFields = getStepRequiredFields(activeStep);
    const invalidField = requiredFields.find((field) => !field.checkValidity());
    if (!invalidField) return true;
    invalidField.reportValidity();
    invalidField.focus();
    setFeedback("Complete required fields before continuing.", "is-error");
    return false;
  }

  function serializeFormData() {
    return Object.fromEntries(new FormData(form).entries());
  }

  function loadDraft() {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;
      Object.entries(data).forEach(([name, value]) => {
        const field = form.elements.namedItem(name);
        if (!field) return;
        if (field instanceof RadioNodeList) return;
        field.value = String(value ?? "");
      });
    } catch {
      // Ignore localStorage issues.
    }
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(serializeFormData()));
      setFeedback("Draft saved locally.", "is-success");
    } catch {
      setFeedback("Unable to save draft in this browser session.", "is-error");
    }
  }

  async function submitQuestionnaire() {
    const data = serializeFormData();
    const subject = `[Berecons] Website Development Questionnaire - ${data.client_name || "Client"}`;

    const payload = {
      formType: "website-development-questionnaire",
      subject,
      replyTo: data.contact_email || "",
      submittedFrom: window.location.href,
      data,
    };

    await window.BereconsFormSubmit.submitPayload(payload);
  }

  prevButton.addEventListener("click", () => {
    if (activeStep === 0) {
      saveDraft();
      return;
    }
    setFeedback("", "");
    setStep(activeStep - 1);
  });

  nextButton.addEventListener("click", () => {
    setFeedback("", "");
    if (!validateCurrentStep()) return;
    setStep(activeStep + 1);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback("", "");

    if (!validateCurrentStep()) return;

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    setFeedback("Sending questionnaire...", "is-success");

    try {
      await submitQuestionnaire();
      form.reset();
      window.localStorage.removeItem(DRAFT_KEY);
      setStep(0);
      setFeedback("Questionnaire sent successfully.", "is-success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed.";
      setFeedback(message, "is-error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send Questionnaire";
    }
  });

  loadDraft();
  setStep(0);
})();

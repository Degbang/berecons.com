(function initQuotePage() {
  const form = document.getElementById("quote-form");
  const quoteRequestForm = document.getElementById("quote-request-form");
  if (!form && !quoteRequestForm) return;

  const root = document.documentElement;
  const siteHeader = document.getElementById("site-header");
  const launchRow = document.querySelector(".quote-entry-actions");
  const drawer = document.querySelector("[data-quote-drawer]");
  const drawerTitle = document.getElementById("quote-drawer-title");
  const drawerViews = [...document.querySelectorAll("[data-quote-view]")];
  const openButtons = [...document.querySelectorAll("[data-quote-open]")];
  const closeButtons = [...document.querySelectorAll("[data-quote-close]")];
  const stepCards = [...document.querySelectorAll("[data-quote-step]")];
  const progressFill = document.getElementById("quote-progress-fill");
  const feedback = document.getElementById("quote-feedback");
  const quoteRequestFeedback = document.getElementById("quote-request-feedback");
  const prevButton = document.getElementById("quote-prev");
  const nextButton = document.getElementById("quote-next");
  const submitButton = document.getElementById("quote-submit");
  const quoteRequestSubmitButton = document.getElementById("quote-request-submit");
  const questionnaireDateField = document.getElementById("questionnaire_date");
  const questionnaireClientField = document.getElementById("client_name");
  const questionnaireEmailField = document.getElementById("contact_email");
  const quoteClientField = document.getElementById("quote_client_name");
  const quoteEmailField = document.getElementById("quote_contact_email");

  let activeStep = 0;
  let activeView = "questionnaire";

  const viewTitles = {
    questionnaire: "Fill Questionnaire",
    quote: "Get Quote",
  };
  const SUBMIT_ENDPOINT = "/api/quote-submit";

  function setFeedback(target, message, state) {
    if (!target) return;
    target.textContent = message;
    target.classList.remove("is-error", "is-success");
    if (state) target.classList.add(state);
  }

  function getTodayValue() {
    const now = new Date();
    const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
  }

  function setButtonBusy(button, isBusy, idleLabel, busyLabel) {
    if (!button) return;
    button.disabled = isBusy;
    button.textContent = isBusy ? busyLabel : idleLabel;
  }

  async function submitFormRequest(payload) {
    const response = await fetch(SUBMIT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let result = null;

    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok) {
      const message =
        result && typeof result.message === "string" && result.message.trim()
          ? result.message.trim()
          : "Submission failed. Try again in a moment.";
      throw new Error(message);
    }

    return result;
  }

  function formDataToObject(formData) {
    return Object.fromEntries(formData.entries());
  }

  function buildQuestionnairePayload(formData) {
    const clientName = questionnaireClientField?.value.trim() || "Client";
    const replyTo = questionnaireEmailField?.value.trim() || "";

    return {
      formType: "website-development-questionnaire",
      subject: `Berecons Website Development Questionnaire - ${clientName}`,
      replyTo,
      submittedFrom: window.location.href,
      data: formDataToObject(formData),
    };
  }

  function buildQuoteRequestPayload(formData) {
    const clientName = quoteClientField?.value.trim() || "Client";
    const replyTo = quoteEmailField?.value.trim() || "";

    return {
      formType: "quote-request",
      subject: `Berecons Quote Request - ${clientName}`,
      replyTo,
      submittedFrom: window.location.href,
      data: formDataToObject(formData),
    };
  }

  function syncQuoteRequestFields() {
    if (quoteClientField && questionnaireClientField && !quoteClientField.value.trim()) {
      quoteClientField.value = questionnaireClientField.value.trim();
    }

    if (quoteEmailField && questionnaireEmailField && !quoteEmailField.value.trim()) {
      quoteEmailField.value = questionnaireEmailField.value.trim();
    }
  }

  function syncDrawerOffset() {
    if (!launchRow) return;
    const launchRect = launchRow.getBoundingClientRect();
    const headerBottom = siteHeader ? siteHeader.getBoundingClientRect().bottom : 0;
    const top = Math.max(Math.round(launchRect.bottom + 18), Math.round(headerBottom + 16));
    root.style.setProperty("--quote-drawer-top", `${top}px`);
  }

  function setDrawerView(view) {
    activeView = view === "quote" ? "quote" : "questionnaire";

    if (drawerTitle) {
      drawerTitle.textContent = viewTitles[activeView];
    }

    drawerViews.forEach((panel) => {
      const isActive = panel.dataset.quoteView === activeView;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
    });

    openButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.quoteOpen === activeView);
      button.classList.toggle("is-primary", button.dataset.quoteOpen === activeView);
    });

    if (activeView === "quote") {
      syncQuoteRequestFields();
    }
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("quote-drawer-open");
  }

  function openDrawer(view) {
    if (!drawer) return;
    syncDrawerOffset();
    setDrawerView(view);
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("quote-drawer-open");

    if (activeView === "questionnaire") {
      setActiveStep(activeStep);
    }
  }

  function getStepRequiredFields(stepCard) {
    return [...stepCard.querySelectorAll("[required]")];
  }

  function updateProgress() {
    const totalSteps = stepCards.length || 1;
    const progress = ((activeStep + 1) / totalSteps) * 100;

    if (progressFill) progressFill.style.width = `${progress}%`;
  }

  function setActiveStep(index) {
    activeStep = Math.max(0, Math.min(index, stepCards.length - 1));

    stepCards.forEach((card, cardIndex) => {
      const isActive = cardIndex === activeStep;
      card.hidden = !isActive;
      card.classList.toggle("is-active", isActive);
    });

    if (prevButton) prevButton.disabled = activeStep === 0;
    if (nextButton) nextButton.hidden = activeStep === stepCards.length - 1;
    if (submitButton) submitButton.hidden = activeStep !== stepCards.length - 1;

    updateProgress();
    setFeedback(feedback, "", "");
  }

  openButtons.forEach((button) => {
    button.addEventListener("click", () => openDrawer(button.dataset.quoteOpen));
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeDrawer);
  });

  if (drawer) {
    drawer.addEventListener("click", (event) => {
      if (event.target === drawer) closeDrawer();
    });
  }

  if (prevButton) {
    prevButton.addEventListener("click", () => setActiveStep(activeStep - 1));
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      const currentStep = stepCards[activeStep];
      if (!currentStep) return;

      const invalidField = getStepRequiredFields(currentStep).find((field) => !field.value.trim());
      if (invalidField) {
        invalidField.reportValidity();
        invalidField.focus();
        setFeedback(feedback, "Complete this step before moving on.", "is-error");
        return;
      }

      setActiveStep(activeStep + 1);
    });
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(feedback, "", "");

      if (!form.reportValidity()) {
        setFeedback(feedback, "Complete all required questions before sending.", "is-error");
        return;
      }

      const formData = new FormData(form);
      const payload = buildQuestionnairePayload(formData);

      setButtonBusy(submitButton, true, "Send questionnaire", "Sending...");
      setFeedback(feedback, "Sending your questionnaire...", "is-success");

      try {
        await submitFormRequest(payload);
        form.reset();
        if (questionnaireDateField) {
          questionnaireDateField.value = getTodayValue();
        }
        setActiveStep(0);
        setFeedback(feedback, "Questionnaire sent successfully.", "is-success");
        window.setTimeout(() => {
          closeDrawer();
        }, 300);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Submission failed. Try again.";
        setFeedback(feedback, message, "is-error");
      } finally {
        setButtonBusy(submitButton, false, "Send questionnaire", "Sending...");
      }
    });
  }

  if (quoteRequestForm) {
    quoteRequestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(quoteRequestFeedback, "", "");

      if (!quoteRequestForm.reportValidity()) {
        setFeedback(quoteRequestFeedback, "Complete the required fields before sending.", "is-error");
        return;
      }

      const formData = new FormData(quoteRequestForm);
      const payload = buildQuoteRequestPayload(formData);

      setButtonBusy(quoteRequestSubmitButton, true, "Send quote request", "Sending...");
      setFeedback(quoteRequestFeedback, "Sending your quote request...", "is-success");

      try {
        await submitFormRequest(payload);
        quoteRequestForm.reset();
        syncQuoteRequestFields();
        setFeedback(quoteRequestFeedback, "Quote request sent successfully.", "is-success");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Submission failed. Try again.";
        setFeedback(quoteRequestFeedback, message, "is-error");
      } finally {
        setButtonBusy(quoteRequestSubmitButton, false, "Send quote request", "Sending...");
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  window.addEventListener("resize", syncDrawerOffset);
  window.addEventListener("load", syncDrawerOffset);

  if (questionnaireDateField && !questionnaireDateField.value) {
    questionnaireDateField.value = getTodayValue();
  }

  if (questionnaireClientField) {
    questionnaireClientField.addEventListener("input", syncQuoteRequestFields);
  }

  if (questionnaireEmailField) {
    questionnaireEmailField.addEventListener("input", syncQuoteRequestFields);
  }

  setDrawerView("questionnaire");
  if (form) {
    setActiveStep(0);
  }
  openDrawer("questionnaire");
})();

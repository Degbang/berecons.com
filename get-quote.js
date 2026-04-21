(function initQuotePage() {
  const form = document.getElementById("quote-form");
  if (!form) return;

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
  const prevButton = document.getElementById("quote-prev");
  const nextButton = document.getElementById("quote-next");
  const submitButton = document.getElementById("quote-submit");

  let activeStep = 0;
  let activeView = "questionnaire";

  const viewTitles = {
    questionnaire: "Fill Questionnaire",
    quote: "Get Billing",
  };

  const emailSchema = [
    {
      title: "1. Company Overview",
      entries: [
        ["1. What is your company/organisation's name and what products/services do you offer?", "q_company_overview"],
        ["2. What is your unique value proposition? (What makes you different/better than your competitors?)", "q_value_proposition"],
        ["3. Who are your top 3 main competitors? (Please provide their website URLs if possible).", "q_competitors"],
      ],
    },
    {
      title: "2. Primary Goals",
      entries: [
        ["1. What is the single most important goal for this new website? (e.g., Generate leads, sell products online, build an email list, increase brand awareness).", "q_primary_goal"],
        ["2. What are 2-3 secondary goals?", "q_secondary_goals"],
      ],
    },
    {
      title: "3. Target Audience",
      entries: [
        ["1. Who is your ideal customer? (Please describe their demographics, interests, and pain points).", "q_ideal_customer"],
        ["2. What action do you want them to take when they visit your site? (e.g., \"Contact Us,\" \"Download a Whitepaper,\" \"Buy Now\").", "q_target_action"],
      ],
    },
    {
      title: "4. Success Metrics",
      entries: [
        ["1. How will we measure the success of the website? (e.g., Number of contact form submissions, conversion rate, online sales revenue, reduced bounce rate).", "q_success_metrics"],
      ],
    },
  ];

  function setFeedback(message, state) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.remove("is-error", "is-success");
    if (state) feedback.classList.add(state);
  }

  function formatDateValue(value) {
    if (!value || !value.includes("-")) return value;
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
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
    setFeedback("", "");
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
        setFeedback("Complete this step before moving on.", "is-error");
        return;
      }

      setActiveStep(activeStep + 1);
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setFeedback("", "");

    if (!form.reportValidity()) {
      setFeedback("Complete all required questions before preparing the email draft.", "is-error");
      return;
    }

    const formData = new FormData(form);
    const clientName = String(formData.get("client_name") || "Client").trim() || "Client";
    const subject = `Berecons Website Development Questionnaire - ${clientName}`;
    const body = buildEmailBody(formData);

    setFeedback("Opening your email draft.", "is-success");
    window.location.href = `mailto:bereconsllc@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  function buildEmailBody(formData) {
    const clientName = String(formData.get("client_name") || "").trim() || "Not provided";
    const questionnaireDate = formatDateValue(String(formData.get("questionnaire_date") || "").trim()) || "Not provided";
    const contactName = String(formData.get("contact_name") || "").trim() || "Not provided";
    const contactEmail = String(formData.get("contact_email") || "").trim() || "Not provided";

    const lines = [
      "berecons",
      "Berecons, LLC Website Development Questionnaire",
      `Client: ${clientName}`,
      `Date: ${questionnaireDate}`,
      "",
      "Thank you for taking the time to complete the following questionnaire. Your detailed answers will help us understand your vision and build a website that effectively achieves your marketing goals. Please be as specific as possible.",
      "",
      "Part 1: Project Overview & Goals",
      "",
    ];

    emailSchema.forEach((section) => {
      lines.push(section.title);
      section.entries.forEach(([label, name]) => {
        lines.push(label);
        lines.push(String(formData.get(name) || "").trim() || "Not provided");
        lines.push("");
      });
    });

    lines.push("Contact name");
    lines.push(contactName);
    lines.push("");
    lines.push("Contact email");
    lines.push(contactEmail);

    return lines.join("\n");
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  window.addEventListener("resize", syncDrawerOffset);
  window.addEventListener("load", syncDrawerOffset);

  setDrawerView("questionnaire");
  setActiveStep(0);
  syncDrawerOffset();
})();

(function () {
  "use strict";

  // Reading progress bar
  var progressBar = document.getElementById("gw-progress");
  function updateProgress() {
    if (!progressBar) return;
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.body.scrollHeight - window.innerHeight;
    var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = Math.min(progress, 100) + "%";
  }
  window.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();

  // Anchor nav active section tracking
  var anchorNav = document.getElementById("gw-anchor-nav");
  if (!anchorNav) return;

  var anchorLinks = anchorNav.querySelectorAll("a[href^='#']");
  var sections = [];
  anchorLinks.forEach(function (link) {
    var id = link.getAttribute("href").slice(1);
    var el = document.getElementById(id);
    if (el) sections.push({ link: link, el: el });
  });

  function updateActiveAnchor() {
    if (!sections.length) return;
    var scrollY = (window.scrollY || document.documentElement.scrollTop) + 140;
    var active = sections[0];
    sections.forEach(function (s) {
      if (s.el.offsetTop <= scrollY) active = s;
    });
    anchorLinks.forEach(function (l) { l.classList.remove("is-active"); });
    if (active) active.link.classList.add("is-active");
  }

  window.addEventListener("scroll", updateActiveAnchor, { passive: true });
  updateActiveAnchor();

  // Floating CTA: show after 18% scroll, hide near footer
  var floatCta = document.querySelector('.gw-float-cta');
  if (floatCta) {
    function updateFloatCta() {
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var docHeight = document.body.scrollHeight - window.innerHeight;
      var footerEl  = document.querySelector('.site-footer');
      var footerTop = footerEl ? footerEl.getBoundingClientRect().top : Infinity;
      var pastThreshold = docHeight > 0 && (scrollTop / docHeight) > 0.18;
      var nearFooter    = footerTop < window.innerHeight + 80;
      if (pastThreshold && !nearFooter) {
        floatCta.classList.add('is-visible');
      } else {
        floatCta.classList.remove('is-visible');
      }
    }
    window.addEventListener('scroll', updateFloatCta, { passive: true });
    updateFloatCta();
  }

  // Process step switcher
  var processTriggers = document.querySelectorAll('[data-gw-step-trigger]');
  var processPanels = document.querySelectorAll('[data-gw-step-panel]');
  if (processTriggers.length && processPanels.length) {
    var processIcons = {
      "1": '<span class="gw-process-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9" /><path d="M16.5 15.5 19 18l4-4" /></svg></span>',
      "2": '<span class="gw-process-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6 4.5h8l4 4v11H6z" /><path d="M14 4.5V9h4" /><path d="M8.5 13h7M8.5 16h5" /></svg></span>',
      "3": '<span class="gw-process-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M5 18.5h14" /><path d="M7.5 18.5V11M12 18.5V7.5M16.5 18.5v-4.5" /><path d="M6.5 9.5 11 5l3 3 4-4" /></svg></span>',
      "4": '<span class="gw-process-step-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4.5 7.5h15v9h-15z" /><path d="M8 15h8M8 11h4" /><path d="M19.5 9.5 22 12l-2.5 2.5" /></svg></span>'
    };

    processTriggers.forEach(function (trigger) {
      var stepId = trigger.getAttribute('data-gw-step-trigger');
      var label = trigger.textContent.trim();
      trigger.innerHTML =
        (processIcons[stepId] || '') +
        '<span class="gw-process-step-label">' + label + '</span>' +
        '<span class="gw-process-step-num">' + stepId.padStart(2, '0') + '</span>';
    });

    function setProcessStep(stepId) {
      processTriggers.forEach(function (trigger) {
        var isActive = trigger.getAttribute('data-gw-step-trigger') === stepId;
        trigger.classList.toggle('is-active', isActive);
        trigger.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      processPanels.forEach(function (panel) {
        var isActive = panel.getAttribute('data-gw-step-panel') === stepId;
        panel.classList.toggle('is-active', isActive);
        if (isActive) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      });
    }

    processTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        setProcessStep(trigger.getAttribute('data-gw-step-trigger'));
      });
    });
  }
})();

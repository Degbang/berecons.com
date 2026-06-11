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
})();

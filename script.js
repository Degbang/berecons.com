const body = document.body;
body.classList.add("has-js");

const BUILD_VERSION = "20260227-16";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

console.info(`[Berecons] build ${BUILD_VERSION}`);

const header = document.getElementById("site-header");
const menuToggle = document.getElementById("menu-toggle");
const siteNav = document.getElementById("site-nav");

const navLinks = [...document.querySelectorAll(".site-nav .nav-link")];
const sectionAnchors = [...document.querySelectorAll(".section-anchor")];
const transitionLinks = [...document.querySelectorAll("[data-transition-link][href^='#']")];
const revealItems = [...document.querySelectorAll("[data-reveal]")];
const statValues = [...document.querySelectorAll(".stat-value[data-count]")];

const preloader = document.getElementById("preloader");
const preloaderProgress = document.getElementById("preloader-progress");

const transitionLayer = document.getElementById("page-transition");
const transitionPanels = [...document.querySelectorAll(".transition-col")];
const transitionCenter = document.querySelector(".transition-center");
const transitionTarget = document.getElementById("transition-target");

let transitionBusy = false;
let shouldForceHomeOnReload = false;
let headerStateFrame = 0;

function ensureBuildVersionFreshness() {
  const buildKey = "berecons-build-version";

  try {
    const previousBuild = window.sessionStorage.getItem(buildKey);
    if (previousBuild && previousBuild !== BUILD_VERSION) {
      window.location.reload();
      return;
    }
    window.sessionStorage.setItem(buildKey, BUILD_VERSION);
  } catch {
    // Ignore storage access issues (private mode/security policies).
  }

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    try {
      const activeBuild = window.sessionStorage.getItem(buildKey);
      if (activeBuild && activeBuild !== BUILD_VERSION) {
        window.location.reload();
        return;
      }
      window.sessionStorage.setItem(buildKey, BUILD_VERSION);
    } catch {
      // Ignore storage access issues (private mode/security policies).
    }
  });
}

function requestHeaderStateSync() {
  if (headerStateFrame) return;
  headerStateFrame = window.requestAnimationFrame(() => {
    headerStateFrame = 0;
    setHeaderState();
  });
}

function closeMenu() {
  if (!siteNav || !menuToggle) return;
  siteNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

function finishPreloader() {
  if (!preloader) {
    body.classList.remove("is-loading");
    if (shouldForceHomeOnReload) {
      forceHomeViewport();
      window.requestAnimationFrame(forceHomeViewport);
    }
    return;
  }

  preloader.classList.add("is-hidden");
  body.classList.remove("is-loading");
  if (shouldForceHomeOnReload) {
    forceHomeViewport();
    window.requestAnimationFrame(forceHomeViewport);
  }
  window.setTimeout(() => preloader.remove(), 760);
}

function initPreloader() {
  if (!preloader || !preloaderProgress) {
    body.classList.remove("is-loading");
    return;
  }

  if (prefersReducedMotion || !window.gsap) {
    preloaderProgress.style.width = "100%";
    window.setTimeout(finishPreloader, 900);
    return;
  }

  const gsap = window.gsap;
  const loaderDuration = 3.1;
  gsap.to(preloaderProgress, {
    width: "100%",
    duration: loaderDuration,
    ease: "power2.out",
    onComplete: () => {
      gsap.to(preloader, {
        autoAlpha: 0,
        duration: 0.65,
        ease: "power2.inOut",
        onComplete: finishPreloader,
      });
    },
  });
}

function initHeroMedia() {
  const hero = document.getElementById("home");
  const heroVideo = hero?.querySelector(".hero-bg-video");
  if (!hero || !heroVideo) return;

  let switchedToVideo = false;
  const retryTimers = new Set();
  let visibilityHandler = null;

  const clearRetryTimers = () => {
    retryTimers.forEach((timerId) => window.clearTimeout(timerId));
    retryTimers.clear();
  };

  const scheduleRetry = (delayMs) => {
    const timerId = window.setTimeout(() => {
      retryTimers.delete(timerId);
      tryPlay();
    }, delayMs);
    retryTimers.add(timerId);
  };

  const cleanupActivationHooks = () => {
    clearRetryTimers();
    heroVideo.removeEventListener("playing", revealWhenFrameReady);
    heroVideo.removeEventListener("timeupdate", revealWhenFrameReady);
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
    }
  };

  const commitVideoReveal = () => {
    if (switchedToVideo) return;
    switchedToVideo = true;
    hero.classList.add("has-video");
    cleanupActivationHooks();
  };

  const revealWhenFrameReady = () => {
    if (switchedToVideo) return;
    if (heroVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    if (typeof heroVideo.requestVideoFrameCallback === "function") {
      heroVideo.requestVideoFrameCallback(() => commitVideoReveal());
      return;
    }

    if (heroVideo.currentTime > 0 || !heroVideo.paused) {
      commitVideoReveal();
    }
  };

  const tryPlay = () => {
    if (switchedToVideo) return;
    const playPromise = heroVideo.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.then(revealWhenFrameReady).catch(() => {});
    }
  };

  heroVideo.muted = true;
  heroVideo.defaultMuted = true;
  heroVideo.loop = true;
  heroVideo.preload = "auto";
  heroVideo.playsInline = true;
  heroVideo.setAttribute("playsinline", "true");
  heroVideo.setAttribute("webkit-playsinline", "true");
  heroVideo.setAttribute("preload", "auto");

  heroVideo.addEventListener("playing", revealWhenFrameReady);
  heroVideo.addEventListener("timeupdate", revealWhenFrameReady);
  heroVideo.addEventListener("loadeddata", tryPlay, { once: true });
  heroVideo.addEventListener("canplay", tryPlay, { once: true });
  heroVideo.addEventListener("error", clearRetryTimers);

  const nudgePlayback = () => {
    tryPlay();
    clearRetryTimers();
    scheduleRetry(700);
    scheduleRetry(1700);
  };

  nudgePlayback();
  window.addEventListener("load", nudgePlayback, { once: true });

  const unlockPlayback = () => {
    tryPlay();
  };

  document.addEventListener("pointerdown", unlockPlayback, { once: true, passive: true });
  document.addEventListener("touchstart", unlockPlayback, { once: true, passive: true });
  document.addEventListener("keydown", unlockPlayback, { once: true });

  visibilityHandler = () => {
    if (document.visibilityState !== "visible") return;
    tryPlay();
  };
  document.addEventListener("visibilitychange", visibilityHandler);
}

function setHeaderState() {
  if (!header) return;
  header.classList.add("is-solid");
  header.classList.add("is-on-hero");
  header.classList.remove("is-on-light");
  header.style.setProperty("--header-surface", "transparent");
  syncHeaderTheme();
}

function syncHeaderTheme() {
  if (!header || !sectionAnchors.length) return;

  const probeY = (header.offsetHeight || 0) + 18;
  let sectionAtProbe = null;

  for (const section of sectionAnchors) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= probeY && rect.bottom >= probeY) {
      sectionAtProbe = section;
      break;
    }
  }

  if (!sectionAtProbe) {
    sectionAtProbe = window.scrollY <= 8 ? sectionAnchors[0] : sectionAnchors[sectionAnchors.length - 1];
  }

  const isHero = sectionAtProbe.id === "home";
  const sectionSurface = sectionAtProbe.dataset.headerSurface?.trim();
  const resolvedSurface = isHero ? "transparent" : sectionSurface || "#ffffff";

  header.classList.toggle("is-on-hero", isHero);
  header.classList.toggle("is-on-light", !isHero);
  header.style.setProperty("--header-surface", resolvedSurface);
}

function initMenu() {
  if (!menuToggle || !siteNav) return;

  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
    siteNav.classList.toggle("is-open", !expanded);
  });

  navLinks.forEach((link) => link.addEventListener("click", closeMenu));

  document.addEventListener("click", (event) => {
    if (window.innerWidth > 860 || !siteNav.classList.contains("is-open")) return;
    const target = event.target;

    if (target instanceof Node && !siteNav.contains(target) && !menuToggle.contains(target)) {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) closeMenu();
  });
}

function initNavSpy() {
  if (!sectionAnchors.length || !navLinks.length) return;

  const navMap = new Map(navLinks.map((link) => [link.getAttribute("href")?.slice(1), link]));

  const activate = (id) => {
    navLinks.forEach((link) => link.classList.remove("is-active"));
    const active = navMap.get(id);
    if (active) active.classList.add("is-active");
  };

  if (!("IntersectionObserver" in window)) {
    activate(sectionAnchors[0].id);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        activate(entry.target.id);
        syncHeaderTheme();
      });
    },
    {
      rootMargin: "-42% 0px -42% 0px",
      threshold: 0,
    }
  );

  sectionAnchors.forEach((section) => observer.observe(section));
}

function getTargetScrollTop(target) {
  if (!target) return 0;
  const headerOffset = header ? header.offsetHeight : 0;
  const safeGap = 16;
  const rawTop = window.scrollY + target.getBoundingClientRect().top - headerOffset - safeGap;
  return Math.max(0, Math.round(rawTop));
}

function smoothScrollTo(target) {
  if (!target) return;
  window.scrollTo({ top: getTargetScrollTop(target), behavior: "smooth" });
}

function instantScrollTo(target) {
  if (!target) return;
  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top: getTargetScrollTop(target), behavior: "auto" });
  root.style.scrollBehavior = previousBehavior;
}

function formatTransitionLabel(rawLabel, targetId) {
  if (rawLabel && rawLabel.trim()) return rawLabel.trim().toUpperCase();
  if (targetId && targetId.trim()) return targetId.trim().replace(/[-_]/g, " ").toUpperCase();
  return "NAVIGATING";
}

function runSectionTransition(target, label) {
  if (!target) return;

  const desiredTop = getTargetScrollTop(target);
  if (Math.abs(window.scrollY - desiredTop) <= 4) {
    history.replaceState(null, "", `#${target.id}`);
    syncHeaderTheme();
    return;
  }

  if (prefersReducedMotion || !window.gsap || !transitionLayer || !transitionPanels.length) {
    smoothScrollTo(target);
    history.replaceState(null, "", `#${target.id}`);
    syncHeaderTheme();
    return;
  }

  if (transitionBusy) return;
  transitionBusy = true;

  const gsap = window.gsap;
  const targetLabel = formatTransitionLabel(label, target.id);
  const tl = gsap.timeline({
    onComplete: () => {
      transitionBusy = false;
    },
  });

  tl.add(() => transitionLayer.classList.add("is-active"));
  tl.set(transitionLayer, { autoAlpha: 1 });
  tl.set(transitionPanels, { scaleY: 0, transformOrigin: "bottom center" });
  if (transitionTarget) transitionTarget.textContent = targetLabel;
  if (transitionCenter) tl.set(transitionCenter, { autoAlpha: 0, y: 26, scale: 0.92 });

  tl.to(transitionPanels, {
    scaleY: 1,
    duration: 0.56,
    stagger: {
      each: 0.045,
      from: "random",
    },
    ease: "expo.inOut",
  });

  if (transitionCenter) {
    tl.to(
      transitionCenter,
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.32,
        ease: "power3.out",
      },
      "<+0.14"
    );
  }

  tl.add(() => {
    instantScrollTo(target);
    history.replaceState(null, "", `#${target.id}`);
    syncHeaderTheme();
  });

  if (transitionCenter) {
    tl.to(transitionCenter, {
      autoAlpha: 0,
      y: -18,
      scale: 0.95,
      duration: 0.24,
      ease: "power2.in",
    });
  }

  tl.to(transitionPanels, {
    scaleY: 0,
    transformOrigin: "top center",
    duration: 0.6,
    stagger: {
      each: 0.045,
      from: "end",
    },
    ease: "expo.inOut",
  });
  tl.set(transitionLayer, { autoAlpha: 0 });
  tl.add(() => transitionLayer.classList.remove("is-active"));
}

function initSectionTransitions() {
  if (!transitionLinks.length) return;

  transitionLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || !href.startsWith("#")) return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      closeMenu();
      runSectionTransition(target, link.dataset.transitionLabel);
    });
  });
}

function revealFallback() {
  revealItems.forEach((item) => {
    item.style.opacity = "1";
    item.style.transform = "none";
  });
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(value) {
  if (value < 0.5) return 4 * value * value * value;
  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function initGsapMotion() {
  if (!window.gsap) {
    revealFallback();
    return;
  }

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const hasScrollTrigger = Boolean(ScrollTrigger);
  if (hasScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  const heroTitleLines = gsap.utils.toArray(".hero-title-line");
  const animatedHeroTitleLines = heroTitleLines.filter(
    (line) => !line.classList.contains("hero-title-line-static")
  );
  const heroServicesSlider = document.querySelector(".hero-services-slider");
  const heroSubtitle = document.querySelector(".hero-subtitle");
  const heroTimeline = gsap.timeline({ delay: 0 });

  if (animatedHeroTitleLines.length) {
    heroTimeline.from(animatedHeroTitleLines, {
      yPercent: 24,
      duration: 0.78,
      ease: "power4.out",
      stagger: 0.12,
    });
  }

  if (heroServicesSlider) {
    heroTimeline.from(
      heroServicesSlider,
      {
        y: 16,
        opacity: 0,
        duration: 0.72,
        ease: "power2.out",
      },
      0.08
    );
  }

  if (heroSubtitle) {
    heroTimeline.from(
      heroSubtitle,
      {
        y: 30,
        duration: 0.64,
        ease: "power2.out",
      },
      0.18
    );
  }

  const panels = gsap.utils.toArray(".panel");
  if (hasScrollTrigger) {
    panels.forEach((panel) => {
      const hasDifferenceV2 = panel.id === "difference" && Boolean(panel.querySelector(".difference-v2-page"));
      if (panel.id === "home" || hasDifferenceV2) return;
      gsap.from(panel, {
        y: 92,
        scale: 0.985,
        duration: 0.9,
        ease: "power2.out",
        clearProps: "transform",
        scrollTrigger: {
          trigger: panel,
          start: "top 86%",
          once: true,
        },
      });
    });
  }

  const serviceCards = gsap.utils.toArray(".service-card");
  if (serviceCards.length) {
    gsap.set(serviceCards, { transformPerspective: 1100, transformOrigin: "center center" });
  }

  revealItems.forEach((item) => {
    if (item.closest("#home")) return;
    if (item.classList.contains("service-card")) return;
    if (item.closest("#team")) return;

    const effect = item.dataset.reveal || "fade-up";
    const from = { opacity: 1, y: 34, x: 0, scale: 1 };

    if (effect === "fade-left") from.x = -48;
    if (effect === "fade-right") from.x = 48;
    if (effect === "zoom") {
      from.y = 0;
      from.scale = 0.87;
    }

    const revealTo = {
      y: 0,
      x: 0,
      scale: 1,
      duration: 0.82,
      ease: "power2.out",
    };

    if (hasScrollTrigger) {
      revealTo.scrollTrigger = {
        trigger: item,
        start: "top 84%",
        once: true,
      };
    }

    gsap.fromTo(item, from, revealTo);
  });

}

function initNativeScrollEffects() {
  const homeSection = document.getElementById("home");
  const missionSection = document.getElementById("mission");
  const missionMark = document.querySelector("#mission .mission-slab-mark");
  const differenceSection = document.getElementById("difference");
  const hasDifferenceV2 = Boolean(differenceSection?.querySelector(".difference-v2-page"));
  const servicesSection = document.getElementById("services");
  const serviceCards = [...document.querySelectorAll("#services .service-card")];

  if (!homeSection && !missionSection && !differenceSection && !servicesSection) return;

  const applyDefaults = (forReducedMotion = false) => {
    if (homeSection) homeSection.style.setProperty("--hero-scroll-p", "0");
    if (missionSection) missionSection.style.setProperty("--mission-progress", "1");
    if (differenceSection && !hasDifferenceV2)
      differenceSection.style.setProperty("--difference-progress", forReducedMotion ? "1" : "0");
    if (missionMark) {
      missionMark.style.setProperty("--mission-mark-y", "0px");
      missionMark.style.setProperty("--mission-mark-scale", "1");
    }
    if (servicesSection) servicesSection.style.setProperty("--services-scroll-p", "0");
    serviceCards.forEach((card) => {
      card.style.setProperty("--card-y", "0px");
      card.style.setProperty("--card-rot", "0deg");
      card.style.setProperty("--card-scale", "1");
      card.style.setProperty("--card-opacity", "1");
    });
  };

  if (prefersReducedMotion) {
    applyDefaults(true);
    return;
  }

  let ticking = false;
  let servicesCardsReset = false;

  const render = () => {
    ticking = false;
    const viewportHeight = window.innerHeight || 1;

    if (homeSection) {
      const homeRect = homeSection.getBoundingClientRect();
      const travel = Math.max(homeRect.height - viewportHeight * 0.36, 1);
      const heroProgress = clampValue((-homeRect.top) / travel, 0, 1);
      homeSection.style.setProperty("--hero-scroll-p", heroProgress.toFixed(4));
    }

    if (missionSection) missionSection.style.setProperty("--mission-progress", "1");
    if (missionMark) {
      missionMark.style.setProperty("--mission-mark-y", "0px");
      missionMark.style.setProperty("--mission-mark-scale", "1");
    }

    if (differenceSection && !hasDifferenceV2) {
      const differenceRect = differenceSection.getBoundingClientRect();
      const visibleDifferencePx =
        Math.min(differenceRect.bottom, viewportHeight) - Math.max(differenceRect.top, 0);
      const differenceVisibleRatio = clampValue(
        visibleDifferencePx / Math.max(Math.min(differenceRect.height, viewportHeight), 1),
        0,
        1
      );
      const differenceProgress = easeInOutCubic(differenceVisibleRatio);
      differenceSection.style.setProperty("--difference-progress", differenceProgress.toFixed(4));
    }

    if (servicesSection && serviceCards.length) {
      const servicesRect = servicesSection.getBoundingClientRect();
      const servicesInActiveRange =
        servicesRect.top < viewportHeight * 1.15 && servicesRect.bottom > -viewportHeight * 0.2;

      if (!servicesInActiveRange && servicesCardsReset) {
        return;
      }

      servicesCardsReset = !servicesInActiveRange;
      servicesSection.style.setProperty("--services-scroll-p", servicesInActiveRange ? "1" : "0");

      serviceCards.forEach((card) => {
        card.style.setProperty("--card-y", "0px");
        card.style.setProperty("--card-rot", "0deg");
        card.style.setProperty("--card-scale", "1");
        card.style.setProperty("--card-opacity", "1");
      });
    }
  };

  const requestRender = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(render);
  };

  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", requestRender);
  requestRender();
}

function initServicesScrollReveal() {
  const servicesSection = document.getElementById("services");
  const servicesHead = document.querySelector("#services .services-summary-intro");
  const serviceCards = [...document.querySelectorAll("#services .services-summary-card")];

  if (servicesHead) servicesHead.classList.add("is-in-view");
  if (!servicesSection || !serviceCards.length) return;

  if (prefersReducedMotion || !window.gsap || !window.ScrollTrigger) {
    serviceCards.forEach((card) => {
      card.classList.add("is-in-view");
      card.style.opacity = "1";
      card.style.transform = "none";
    });
    return;
  }

  const gsap = window.gsap;
  const revealCards = () => {
    gsap.killTweensOf(serviceCards);
    gsap.set(serviceCards, {
      autoAlpha: 0,
      y: 34,
      scale: 0.98,
    });
    gsap.to(serviceCards, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.46,
      stagger: 0.08,
      ease: "power2.out",
      clearProps: "opacity,transform",
      onComplete: () => {
        serviceCards.forEach((card) => {
          card.classList.add("is-in-view");
          card.style.setProperty("--card-y", "0px");
          card.style.setProperty("--card-rot", "0deg");
          card.style.setProperty("--card-scale", "1");
          card.style.setProperty("--card-opacity", "1");
        });
      },
    });
  };

  window.ScrollTrigger.create({
    trigger: servicesSection,
    start: "top 82%",
    end: "bottom 24%",
    onEnter: revealCards,
    onEnterBack: revealCards,
    invalidateOnRefresh: true,
  });

  window.requestAnimationFrame(() => {
    const viewportHeight = window.innerHeight || 0;
    const rect = servicesSection.getBoundingClientRect();
    if (rect.top <= viewportHeight * 0.82 && rect.bottom >= viewportHeight * 0.24) {
      revealCards();
    }
  });
}

function initServicesSummaryCards() {
  const cards = [...document.querySelectorAll("#services .services-summary-card")];
  if (!cards.length) return;

  const mobileQuery = window.matchMedia("(max-width: 980px)");

  const setOpenState = (card, isOpen) => {
    card.classList.toggle("is-open", isOpen);
    card.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  const closeAll = (exceptCard = null) => {
    cards.forEach((card) => {
      if (card === exceptCard) return;
      setOpenState(card, false);
    });
  };

  const toggleCard = (card) => {
    const shouldOpen = !card.classList.contains("is-open");
    closeAll(card);
    setOpenState(card, shouldOpen);
  };

  const activateCard = (event) => {
    if (!mobileQuery.matches) return;
    const card = event.currentTarget;
    if (!card) return;
    toggleCard(card);
  };

  cards.forEach((card) => {
    card.setAttribute("aria-expanded", "false");
    card.addEventListener("click", activateCard);
    card.addEventListener("keydown", (event) => {
      if (!mobileQuery.matches) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activateCard(event);
    });
  });

  const syncLayoutState = () => {
    if (mobileQuery.matches) return;
    closeAll();
  };

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncLayoutState);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncLayoutState);
  }

  window.addEventListener("resize", syncLayoutState);
  syncLayoutState();
}

function initProcessTriadCircles() {
  const stage = document.querySelector("#process .process-venn-stage");
  const designCircle = document.getElementById("process-circle-design");
  const strategyCircle = document.getElementById("process-circle-strategy");
  const developmentCircle = document.getElementById("process-circle-development");
  const designClipCircle = document.getElementById("process-clip-circle-design");
  const strategyClipCircle = document.getElementById("process-clip-circle-strategy");
  const developmentClipCircle = document.getElementById("process-clip-circle-development");
  const designStrategyIntersection = document.getElementById("process-intersection-design-strategy");
  const designDevelopmentIntersection = document.getElementById("process-intersection-design-development");
  const strategyDevelopmentIntersection = document.getElementById("process-intersection-strategy-development");
  const designLabel = document.getElementById("process-label-design");
  const strategyLabel = document.getElementById("process-label-strategy");
  const developmentLabel = document.getElementById("process-label-development");

  if (
    !stage ||
    !designCircle ||
    !strategyCircle ||
    !developmentCircle ||
    !designClipCircle ||
    !strategyClipCircle ||
    !developmentClipCircle ||
    !designStrategyIntersection ||
    !designDevelopmentIntersection ||
    !strategyDevelopmentIntersection ||
    !designLabel ||
    !strategyLabel ||
    !developmentLabel
  ) {
    return;
  }

  const geometry = {
    radius: 170,
    durationMs: 4200,
    start: {
      design: { x: 500, y: 94 },
      strategy: { x: 210, y: 468 },
      development: { x: 790, y: 468 },
    },
    end: {
      design: { x: 500, y: 165 },
      strategy: { x: 350, y: 395 },
      development: { x: 650, y: 395 },
    },
  };

  const nodes = [
    {
      key: "design",
      circle: designCircle,
      clipCircle: designClipCircle,
      label: designLabel,
    },
    {
      key: "strategy",
      circle: strategyCircle,
      clipCircle: strategyClipCircle,
      label: strategyLabel,
    },
    {
      key: "development",
      circle: developmentCircle,
      clipCircle: developmentClipCircle,
      label: developmentLabel,
    },
  ];

  const lerp = (from, to, progress) => from + (to - from) * progress;

  const setProgress = (progress) => {
    const positions = {};
    const baseOpacity = (0.52 + progress * 0.48).toFixed(3);
    const intersectionOpacity = (progress * 0.9).toFixed(3);

    nodes.forEach((node) => {
      const start = geometry.start[node.key];
      const end = geometry.end[node.key];
      const x = lerp(start.x, end.x, progress);
      const y = lerp(start.y, end.y, progress);
      positions[node.key] = { x, y };
      node.circle.setAttribute("cx", x.toFixed(2));
      node.circle.setAttribute("cy", y.toFixed(2));
      node.circle.setAttribute("r", String(geometry.radius));
      node.circle.style.opacity = baseOpacity;
      node.clipCircle.setAttribute("cx", x.toFixed(2));
      node.clipCircle.setAttribute("cy", y.toFixed(2));
      node.clipCircle.setAttribute("r", String(geometry.radius));
      node.label.setAttribute("x", x.toFixed(2));
      node.label.setAttribute("y", y.toFixed(2));
      node.label.style.opacity = baseOpacity;
    });

    const syncIntersection = (element, sourcePosition) => {
      element.setAttribute("cx", sourcePosition.x.toFixed(2));
      element.setAttribute("cy", sourcePosition.y.toFixed(2));
      element.setAttribute("r", String(geometry.radius));
      element.style.opacity = intersectionOpacity;
    };

    syncIntersection(designStrategyIntersection, positions.design);
    syncIntersection(designDevelopmentIntersection, positions.design);
    syncIntersection(strategyDevelopmentIntersection, positions.strategy);
  };

  let rafId = 0;
  let sequenceId = 0;

  const resetToSeparated = () => {
    sequenceId += 1;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    setProgress(0);
  };

  const runMerge = () => {
    sequenceId += 1;
    const currentSequenceId = sequenceId;
    setProgress(0);

    if (prefersReducedMotion) {
      setProgress(1);
      return;
    }

    const easeOutCubic = (t) => 1 - (1 - t) ** 3;
    const startedAt = performance.now();

    const tick = (now) => {
      if (currentSequenceId !== sequenceId) return;
      const elapsed = now - startedAt;
      const t = Math.min(1, elapsed / geometry.durationMs);
      setProgress(easeOutCubic(t));

      if (t < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        setProgress(1);
        rafId = 0;
      }
    };

    rafId = window.requestAnimationFrame(tick);
  };

  resetToSeparated();

  if (!("IntersectionObserver" in window)) {
    runMerge();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          runMerge();
          return;
        }
        resetToSeparated();
      });
    },
    {
      threshold: 0.25,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  observer.observe(stage);
}

function initTeamSectionReveal() {
  const teamSection = document.getElementById("team");
  const revealTargets = teamSection ? [...teamSection.querySelectorAll(".team-reveal-target")] : [];
  if (!teamSection || !revealTargets.length) return;

  revealTargets.forEach((item, index) => {
    item.style.setProperty("--team-order", String(index % 10));
  });

  if (prefersReducedMotion) {
    revealTargets.forEach((item) => item.classList.add("is-in-view"));
    return;
  }

  // Never render a blank team section before motion hooks kick in.
  revealTargets.forEach((item) => item.classList.add("is-in-view"));
  body.classList.add("team-reveal-ready");

  if (window.gsap && window.ScrollTrigger) {
    const gsap = window.gsap;

    window.ScrollTrigger.create({
      trigger: teamSection,
      start: "top 76%",
      once: true,
      onEnter: () => {
        gsap.fromTo(
          revealTargets,
          { y: 34, scale: 0.985 },
          {
            y: 0,
            scale: 1,
            duration: 0.76,
            stagger: 0.055,
            ease: "power3.out",
            overwrite: "auto",
          }
        );
      },
    });

    return;
  }

  if (!("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in-view");
        }
      });
    },
    {
      threshold: 0.06,
      rootMargin: "0px 0px -6% 0px",
    }
  );

  revealTargets.forEach((item) => observer.observe(item));

  // Safety: never leave section invisible if observer is delayed.
  window.setTimeout(() => {
    revealTargets.forEach((item) => item.classList.add("is-in-view"));
  }, 900);
}

function initTeamEditorialBoard() {
  const teamSection = document.getElementById("team");
  const filters = teamSection ? [...teamSection.querySelectorAll("[data-team-filter]")] : [];
  const cards = teamSection ? [...teamSection.querySelectorAll(".team-editorial-card[data-team-dept]")] : [];
  const memberCount = teamSection?.querySelector("#team-members-count");
  const emptyNote = teamSection?.querySelector("#team-empty-note");
  const teamGrid = teamSection?.querySelector(".team-editorial-grid");
  if (!teamSection || !filters.length || !cards.length || !teamGrid) return;

  let activeFilter =
    filters.find((button) => button.classList.contains("is-active"))?.dataset.teamFilter || null;
  const showTimers = new WeakMap();

  const setAwaitingState = (isAwaiting) => {
    teamGrid.classList.toggle("is-awaiting", isAwaiting);
    if (emptyNote) {
      emptyNote.hidden = !isAwaiting;
    }
  };

  const updateMemberCount = (visibleCount) => {
    if (!memberCount) return;
    if (!activeFilter) {
      memberCount.textContent = "";
      memberCount.hidden = true;
      return;
    }
    const activeButton = filters.find((button) => button.dataset.teamFilter === activeFilter);
    const activeLabel = (activeButton?.textContent || "Team").trim();
    const noun = visibleCount === 1 ? "member" : "members";
    memberCount.hidden = false;
    memberCount.textContent = `${visibleCount} ${noun} - ${activeLabel}`;
  };

  const clearTimers = (card) => {
    const showTimer = showTimers.get(card);
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimers.delete(card);
    }
  };

  const syncButtons = () => {
    filters.forEach((button) => {
      const isActive = button.dataset.teamFilter === activeFilter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const setCardVisible = (card, visible) => {
    clearTimers(card);

    if (!visible) {
      card.hidden = true;
      card.classList.remove("is-visible", "is-hiding", "is-showing");
      return;
    }

    card.hidden = false;
    card.classList.add("is-visible");
    card.classList.remove("is-hiding");

    if (prefersReducedMotion) {
      card.classList.remove("is-showing");
      return;
    }

    card.classList.add("is-showing");
    const showTimer = window.setTimeout(() => {
      card.classList.remove("is-showing");
      showTimers.delete(card);
    }, 220);
    showTimers.set(card, showTimer);
  };

  const applyFilter = (nextFilter) => {
    activeFilter = nextFilter;
    syncButtons();
    setAwaitingState(!activeFilter);

    let visibleCount = 0;

    cards.forEach((card) => {
      const dept = (card.dataset.teamDept || "").trim();
      const shouldShow = Boolean(activeFilter) && dept === activeFilter;
      if (shouldShow) visibleCount += 1;
      setCardVisible(card, shouldShow);
    });

    updateMemberCount(visibleCount);
  };

  filters.forEach((button, index) => {
    button.addEventListener("click", () => {
      const nextFilter = button.dataset.teamFilter || null;
      if (nextFilter === activeFilter) {
        applyFilter(null);
        return;
      }
      applyFilter(nextFilter);
    });

    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + direction + filters.length) % filters.length;
      filters[nextIndex].focus();
    });
  });

  cards.forEach((card) => {
    card.hidden = true;
    card.classList.remove("is-visible", "is-hiding", "is-showing");
  });

  applyFilter(activeFilter);
}

function animateCounterFallback(element, target) {
  const steps = 44;
  let step = 0;

  const timer = window.setInterval(() => {
    step += 1;
    const value = Math.round((target * step) / steps);
    element.textContent = String(value);

    if (step >= steps) {
      window.clearInterval(timer);
      element.textContent = String(target);
    }
  }, 26);
}

function initCounters() {
  if (!statValues.length) return;

  if (window.gsap && window.ScrollTrigger && !prefersReducedMotion) {
    statValues.forEach((element) => {
      const target = Number(element.dataset.count || 0);
      const counter = { value: 0 };

      window.gsap.to(counter, {
        value: target,
        duration: 1.4,
        ease: "power2.out",
        snap: { value: 1 },
        onUpdate: () => {
          element.textContent = String(Math.round(counter.value));
        },
        scrollTrigger: {
          trigger: element,
          start: "top 82%",
          once: true,
        },
      });
    });
    return;
  }

  if (!("IntersectionObserver" in window)) {
    statValues.forEach((element) => {
      const target = Number(element.dataset.count || 0);
      element.textContent = String(target);
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        const target = Number(element.dataset.count || 0);
        animateCounterFallback(element, target);
        obs.unobserve(element);
      });
    },
    {
      threshold: 0.5,
    }
  );

  statValues.forEach((element) => observer.observe(element));
}

function initDifferenceCanvas() {
  const canvas = document.getElementById("numCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const differenceSection = document.getElementById("difference");

  const CW = 420;
  const CH = 310;
  const NUM_FONT = '900 270px "Perfectly Nineties", "Times New Roman", serif';
  const PLUS_SIZE = 82;
  const NUM_Y = 288;
  const NUM_X = 4;
  const TARGET = 15;
  const DURATION = 1600;
  const PARTICLE_COUNT = 55;
  const LINK_DISTANCE = 90;
  let animationStart = null;
  let hasStarted = false;

  const points = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * CW,
    y: Math.random() * CH,
    vx: (Math.random() - 0.5) * 0.42,
    vy: (Math.random() - 0.5) * 0.42,
    r: Math.random() * 2 + 0.8,
  }));

  const counterAt = (now) => {
    if (animationStart == null) animationStart = now;
    const progress = Math.min((now - animationStart) / DURATION, 1);
    return Math.round((1 - Math.pow(1 - progress, 3)) * TARGET);
  };

  const makeNumGradient = () => {
    const gradient = ctx.createLinearGradient(0, 0, CW * 0.75, CH);
    gradient.addColorStop(0, "#c2359c");
    gradient.addColorStop(0.45, "#7038bc");
    gradient.addColorStop(1, "#35b8b2");
    return gradient;
  };

  const makePlusGradient = (x, y) => {
    const gradient = ctx.createLinearGradient(x, y - PLUS_SIZE, x + PLUS_SIZE, y);
    gradient.addColorStop(0, "#a035a8");
    gradient.addColorStop(1, "#7840c8");
    return gradient;
  };

  const render = (now) => {
    ctx.clearRect(0, 0, CW, CH);

    const value = counterAt(now);
    const numberText = String(value);

    ctx.font = NUM_FONT;
    ctx.fillStyle = makeNumGradient();
    ctx.fillText(numberText, NUM_X, NUM_Y);

    const numWidth = ctx.measureText(numberText).width;
    const plusX = NUM_X + numWidth + 4;
    const plusY = 148;

    ctx.save();
    ctx.globalCompositeOperation = "source-atop";

    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      for (let j = i + 1; j < PARTICLE_COUNT; j += 1) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const distance = Math.hypot(dx, dy);
        if (distance >= LINK_DISTANCE) continue;

        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(points[j].x, points[j].y);
        ctx.strokeStyle = `rgba(255,255,255,${(1 - distance / LINK_DISTANCE) * 0.62})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }

    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fill();
    });

    ctx.restore();

    ctx.font = `900 ${PLUS_SIZE}px "Perfectly Nineties", "Times New Roman", serif`;
    ctx.fillStyle = makePlusGradient(plusX, plusY);
    ctx.fillText("+", plusX, plusY);

    points.forEach((point) => {
      point.x += point.vx;
      point.y += point.vy;
      if (point.x < 0 || point.x > CW) point.vx *= -1;
      if (point.y < 0 || point.y > CH) point.vy *= -1;
    });

    window.requestAnimationFrame(render);
  };

  const startCanvas = () => {
    if (hasStarted) return;
    hasStarted = true;
    animationStart = null;
    window.requestAnimationFrame(render);
  };

  if ("IntersectionObserver" in window && differenceSection) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        startCanvas();
        obs.disconnect();
      },
      {
        threshold: 0.35,
      }
    );
    observer.observe(differenceSection);
    return;
  }

  startCanvas();
}

function initDifferenceMainCounter() {
  const differenceSection = document.getElementById("difference");
  const mainCount = differenceSection?.querySelector("[data-difference-main-count]");
  if (!differenceSection || !mainCount) return;

  const target = Number(mainCount.getAttribute("data-difference-main-count") || 15);
  if (!Number.isFinite(target) || target <= 0) return;

  const setValue = (value) => {
    mainCount.textContent = String(Math.round(value));
  };

  if (prefersReducedMotion) {
    setValue(target);
    return;
  }

  let activeTween = null;
  let fallbackTimer = 0;
  let isInside = false;

  const stopAnimation = () => {
    if (activeTween && typeof activeTween.kill === "function") {
      activeTween.kill();
    }
    activeTween = null;

    if (fallbackTimer) {
      window.clearInterval(fallbackTimer);
      fallbackTimer = 0;
    }
  };

  const resetCounter = () => {
    stopAnimation();
    setValue(0);
  };

  const runFallback = () => {
    const steps = 72;
    let step = 0;
    fallbackTimer = window.setInterval(() => {
      step += 1;
      setValue((target * step) / steps);
      if (step >= steps) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = 0;
        setValue(target);
      }
    }, 32);
  };

  const playCounter = () => {
    resetCounter();
    if (window.gsap) {
      const state = { value: 0 };
      activeTween = window.gsap.to(state, {
        value: target,
        duration: 2.25,
        ease: "power2.out",
        snap: { value: 1 },
        onUpdate: () => setValue(state.value),
        onComplete: () => {
          setValue(target);
          activeTween = null;
        },
      });
      return;
    }

    runFallback();
  };

  if (!("IntersectionObserver" in window)) {
    playCounter();
    return;
  }

  resetCounter();

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target !== differenceSection) return;

        if (entry.isIntersecting && !isInside) {
          isInside = true;
          playCounter();
          return;
        }

        if (!entry.isIntersecting && isInside) {
          isInside = false;
          resetCounter();
        }
      });
    },
    {
      threshold: 0.42,
    }
  );

  observer.observe(differenceSection);
}

function initDifferencePointerParticle() {
  const differenceSection = document.getElementById("difference");
  const pointerTarget = differenceSection?.querySelector("[data-difference-pointer-target]");
  if (!differenceSection || !pointerTarget) return;

  const setPointer = (normX, normY, percentX, percentY) => {
    differenceSection.style.setProperty("--diff-pointer-x", normX.toFixed(4));
    differenceSection.style.setProperty("--diff-pointer-y", normY.toFixed(4));
    differenceSection.style.setProperty("--diff-pointer-px", `${percentX.toFixed(2)}%`);
    differenceSection.style.setProperty("--diff-pointer-py", `${percentY.toFixed(2)}%`);
  };

  const resetPointer = () => setPointer(0, 0, 50, 50);

  const updateFromPoint = (clientX, clientY) => {
    const rect = pointerTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const clampedX = clampValue(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const clampedY = clampValue(((clientY - rect.top) / rect.height) * 100, 0, 100);
    const normX = clampValue((clampedX - 50) / 50, -1, 1);
    const normY = clampValue((clampedY - 50) / 50, -1, 1);
    setPointer(normX, normY, clampedX, clampedY);
  };

  resetPointer();
  if (prefersReducedMotion) return;

  pointerTarget.addEventListener("pointermove", (event) => {
    updateFromPoint(event.clientX, event.clientY);
  });

  pointerTarget.addEventListener("pointerleave", resetPointer);
  pointerTarget.addEventListener("pointercancel", resetPointer);

  pointerTarget.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      updateFromPoint(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

  pointerTarget.addEventListener("touchend", resetPointer, { passive: true });
  pointerTarget.addEventListener("touchcancel", resetPointer, { passive: true });
}

function ensureRefreshStartsAtHome() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  const navEntry = performance.getEntriesByType("navigation")[0];
  const isReload =
    navEntry?.type === "reload" ||
    (typeof performance.navigation !== "undefined" && performance.navigation.type === 1);

  if (!isReload) return;

  shouldForceHomeOnReload = true;
  history.replaceState(null, "", "#home");

  const lockToHome = () => {
    if (!shouldForceHomeOnReload) return;
    forceHomeViewport();
    window.requestAnimationFrame(forceHomeViewport);
    window.setTimeout(forceHomeViewport, 80);
    window.setTimeout(forceHomeViewport, 220);
  };

  lockToHome();
  window.addEventListener("load", lockToHome, { once: true });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    lockToHome();
  });
}

function forceHomeViewport() {
  const homeSection = document.getElementById("home");
  if (homeSection) {
    instantScrollTo(homeSection);
  }

  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  root.style.scrollBehavior = previousBehavior;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  syncHeaderTheme();
}

window.addEventListener("scroll", requestHeaderStateSync, { passive: true });
window.addEventListener("resize", requestHeaderStateSync);
window.addEventListener("load", initPreloader);

ensureBuildVersionFreshness();
ensureRefreshStartsAtHome();
setHeaderState();
initMenu();
initNavSpy();
initSectionTransitions();
initHeroMedia();
body.classList.add("motion-ready");
initGsapMotion();
initNativeScrollEffects();
initDifferenceCanvas();
if (!document.querySelector("#difference .difference-v2-page")) {
  initDifferenceMainCounter();
  initDifferencePointerParticle();
}
initServicesSummaryCards();
initServicesScrollReveal();
initProcessTriadCircles();
initTeamEditorialBoard();
initTeamSectionReveal();
initCounters();

const body = document.body;
body.classList.add("has-js");

const BUILD_VERSION = "20260614-9";

function syncCurrentYear() {
  const year = String(new Date().getFullYear());
  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = year;
  });
}

syncCurrentYear();
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PRELOADER_SKIP_HOME_KEY = "berecons-skip-preloader-once";
const PRELOADER_SKIP_QUERY_PARAM = "skipPreloader";
const TRANSITION_REVEAL_KEY = "berecons-page-transition-reveal-once";

console.info(`[Berecons] build ${BUILD_VERSION}`);

const header = document.getElementById("site-header");
const menuToggle = document.getElementById("menu-toggle");
const siteNav = document.getElementById("site-nav");

const navLinks = [...document.querySelectorAll(".site-nav .nav-link")];
const sectionAnchors = [...document.querySelectorAll(".section-anchor")];
const transitionLinks = [...document.querySelectorAll("[data-transition-link][href]")];
const revealItems = [...document.querySelectorAll("[data-reveal]")];
const statValues = [...document.querySelectorAll(".stat-value[data-count]")];

const preloader = document.getElementById("preloader");
const preloaderMainPhase = preloader?.querySelector("[data-preloader-phase='main']");
const preloaderRethinkPhase = preloader?.querySelector("[data-preloader-phase='rethink']");
const preloaderServiceItems = preloader
  ? [...preloader.querySelectorAll(".preloader-service-item")]
  : [];

const transitionLayer = document.getElementById("page-transition");
const transitionPanels = [...document.querySelectorAll(".transition-col")];
const transitionCenter = document.querySelector(".transition-center");
const transitionTarget = document.getElementById("transition-target");

let transitionBusy = false;
let shouldForceHomeOnReload = false;
let headerStateFrame = 0;
let preloaderHasStarted = false;
let preloaderHasFinished = false;
let runDeferredHeroIntro = null;
const preloaderTimeoutIds = [];
let queuedPageLoadTransitionLabel = "";
let activeTransitionTimeline = null;

function schedulePreloaderTimeout(callback, delay) {
  const timeoutId = window.setTimeout(() => {
    const index = preloaderTimeoutIds.indexOf(timeoutId);
    if (index !== -1) preloaderTimeoutIds.splice(index, 1);
    callback();
  }, delay);
  preloaderTimeoutIds.push(timeoutId);
  return timeoutId;
}

function clearPreloaderTimeouts() {
  while (preloaderTimeoutIds.length) {
    window.clearTimeout(preloaderTimeoutIds.pop());
  }
}

function ensureBuildVersionFreshness() {
  const buildKey = "berecons-build-version";
  const reloadGuardKey = "berecons-build-reload-once";

  try {
    const previousBuild = window.sessionStorage.getItem(buildKey);
    const reloadGuard = window.sessionStorage.getItem(reloadGuardKey);
    if (previousBuild && previousBuild !== BUILD_VERSION && reloadGuard !== BUILD_VERSION) {
      window.sessionStorage.setItem(buildKey, BUILD_VERSION);
      window.sessionStorage.setItem(reloadGuardKey, BUILD_VERSION);
      window.location.reload();
      return;
    }
    window.sessionStorage.setItem(buildKey, BUILD_VERSION);
    window.sessionStorage.setItem(reloadGuardKey, BUILD_VERSION);
  } catch {
    // Ignore storage access issues (private mode/security policies).
  }

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    try {
      const activeBuild = window.sessionStorage.getItem(buildKey);
      const reloadGuard = window.sessionStorage.getItem(reloadGuardKey);
      if (activeBuild && activeBuild !== BUILD_VERSION && reloadGuard !== BUILD_VERSION) {
        window.sessionStorage.setItem(buildKey, BUILD_VERSION);
        window.sessionStorage.setItem(reloadGuardKey, BUILD_VERSION);
        window.location.reload();
        return;
      }
      window.sessionStorage.setItem(buildKey, BUILD_VERSION);
      window.sessionStorage.setItem(reloadGuardKey, BUILD_VERSION);
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

function closeMenu(options = {}) {
  if (!siteNav || !menuToggle) return;

  const { instant = false } = options;
  const wasOpen = siteNav.classList.contains("is-open");

  if (instant && wasOpen) {
    siteNav.classList.add("is-closing-instant");
    siteNav.classList.remove("is-open");
    siteNav.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      siteNav.classList.remove("is-closing-instant");
    });
    menuToggle.setAttribute("aria-expanded", "false");
    return;
  }

  siteNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

function closeMenuForTransition() {
  closeMenu({ instant: window.innerWidth <= 860 });
}

function isPrimaryNavigationClick(event) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function shouldSkipPreloaderForUrl(urlString) {
  if (!urlString) return false;

  try {
    const targetUrl = new URL(urlString, window.location.href);
    const pathname = targetUrl.pathname.toLowerCase();
    const normalizedPath = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const hash = targetUrl.hash.toLowerCase();
    const isHomeHash = !hash || hash === "#home";
    return normalizedPath.endsWith("/index.html") && isHomeHash;
  } catch {
    return false;
  }
}

function queueTransitionReveal(label) {
  try {
    window.sessionStorage.setItem(TRANSITION_REVEAL_KEY, label || "NAVIGATING");
  } catch {
    // Ignore storage access issues (private mode/security policies).
  }
}

function clearPendingTransitionRevealClass() {
  document.documentElement.classList.remove("transition-reveal-pending");
}

function resetTransitionLayerState() {
  if (!transitionLayer) return;

  transitionLayer.classList.remove("is-active");
  clearPendingTransitionRevealClass();

  if (window.gsap) {
    window.gsap.set(transitionLayer, { autoAlpha: 0 });
    if (transitionPanels.length) {
      window.gsap.set(transitionPanels, { scaleY: 0, transformOrigin: "bottom center" });
    }
    if (transitionCenter) {
      window.gsap.set(transitionCenter, { autoAlpha: 0, y: 26, scale: 0.92 });
    }
    return;
  }

  transitionLayer.style.opacity = "0";
  transitionLayer.style.visibility = "hidden";
}

function stopActiveTransitionTimeline() {
  if (!activeTransitionTimeline) return;

  try {
    activeTransitionTimeline.kill();
  } catch {
    // Ignore timeline kill edge cases.
  }

  activeTransitionTimeline = null;
  transitionBusy = false;
  resetTransitionLayerState();
}

function finishPreloader() {
  if (preloaderHasFinished) return;
  preloaderHasFinished = true;
  clearPreloaderTimeouts();

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
  if (queuedPageLoadTransitionLabel) {
    const pendingLabel = queuedPageLoadTransitionLabel;
    queuedPageLoadTransitionLabel = "";
    playPageLoadTransitionReveal(pendingLabel);
  }
  if (typeof runDeferredHeroIntro === "function") {
    runDeferredHeroIntro();
    runDeferredHeroIntro = null;
  }
  if (shouldForceHomeOnReload) {
    forceHomeViewport();
    window.requestAnimationFrame(forceHomeViewport);
  }
  schedulePreloaderTimeout(() => preloader.remove(), 760);
}

function initPreloader() {
  if (preloaderHasStarted) return;
  preloaderHasStarted = true;

  if (!preloader) {
    body.classList.remove("is-loading");
    return;
  }

  let shouldSkipPreloader = false;
  let shouldSkipPreloaderFromQuery = false;

  try {
    const currentUrl = new URL(window.location.href);
    shouldSkipPreloaderFromQuery =
      currentUrl.searchParams.get(PRELOADER_SKIP_QUERY_PARAM) === "1" &&
      shouldSkipPreloaderForUrl(currentUrl.href);

    if (shouldSkipPreloaderFromQuery) {
      currentUrl.searchParams.delete(PRELOADER_SKIP_QUERY_PARAM);
      window.history.replaceState(
        null,
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
      );
    }
  } catch {
    // Ignore URL parsing/history edge cases.
  }

  try {
    const shouldSkipPreloaderFromStorage =
      window.sessionStorage.getItem(PRELOADER_SKIP_HOME_KEY) === "1";
    shouldSkipPreloader = shouldSkipPreloaderFromStorage || shouldSkipPreloaderFromQuery;
    if (shouldSkipPreloaderFromStorage) {
      window.sessionStorage.removeItem(PRELOADER_SKIP_HOME_KEY);
    }
  } catch {
    shouldSkipPreloader = shouldSkipPreloaderFromQuery;
    // Ignore storage access issues (private mode/security policies).
  }

  if (shouldSkipPreloader) {
    finishPreloader();
    return;
  }

  // Fail-safe: never allow loading state to get stuck.
  schedulePreloaderTimeout(finishPreloader, prefersReducedMotion ? 9000 : 30000);

  if (preloader.classList.contains("is-hidden")) {
    finishPreloader();
    return;
  }

  const timings = prefersReducedMotion
    ? {
        serviceStep: 0.7,
        mainFade: 0.2,
        rethinkIn: 0.2,
        consultingDelay: 0.25,
        rethinkHold: 0.65,
        rethinkOut: 0.2,
        preloaderOut: 0.25,
      }
    : {
        serviceStep: 3.0,
        mainFade: 0.55,
        rethinkIn: 0.45,
        consultingDelay: 1.0,
        rethinkHold: 1.6,
        rethinkOut: 0.45,
        preloaderOut: 0.6,
      };

  const setPhase = (mainVisible, rethinkVisible) => {
    if (preloaderMainPhase) {
      preloaderMainPhase.classList.toggle("is-active", mainVisible);
      preloaderMainPhase.setAttribute("aria-hidden", mainVisible ? "false" : "true");
    }

    if (preloaderRethinkPhase) {
      preloaderRethinkPhase.classList.toggle("is-active", rethinkVisible);
      preloaderRethinkPhase.setAttribute("aria-hidden", rethinkVisible ? "false" : "true");
    }
  };

  if (!preloaderRethinkPhase) {
    schedulePreloaderTimeout(finishPreloader, 1200);
    return;
  }

  preloaderRethinkPhase.style.transitionDuration = `${timings.rethinkIn}s`;
  preloaderRethinkPhase.classList.remove("show-consulting");

  if (!preloaderMainPhase) {
    setPhase(false, true);

    let elapsed = timings.rethinkIn * 1000 + timings.consultingDelay * 1000;
    schedulePreloaderTimeout(() => {
      preloaderRethinkPhase.classList.add("show-consulting");
    }, elapsed);

    elapsed += timings.rethinkHold * 1000;
    schedulePreloaderTimeout(() => {
      preloaderRethinkPhase.classList.remove("show-consulting");
      setPhase(false, false);
    }, elapsed);

    elapsed += timings.rethinkOut * 1000;
    schedulePreloaderTimeout(() => {
      if (window.gsap) {
        try {
          window.gsap.to(preloader, {
            autoAlpha: 0,
            duration: timings.preloaderOut,
            ease: "power2.inOut",
            onComplete: finishPreloader,
          });
        } catch {
          finishPreloader();
        }
        return;
      }

      preloader.classList.add("is-hidden");
      schedulePreloaderTimeout(finishPreloader, timings.preloaderOut * 1000);
    }, elapsed);

    return;
  }

  preloaderMainPhase.style.transitionDuration = `${timings.mainFade}s`;

  const activateService = (targetIndex) => {
    preloaderServiceItems.forEach((item, index) => {
      const shouldShow = index <= targetIndex;
      item.classList.toggle("is-visible", shouldShow);
      item.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    });
  };

  if (preloaderServiceItems.length) {
    activateService(0);
  }

  preloaderServiceItems.slice(1).forEach((_, index) => {
    const serviceIndex = index + 1;
    schedulePreloaderTimeout(() => activateService(serviceIndex), serviceIndex * timings.serviceStep * 1000);
  });

  const mainHold =
    preloaderServiceItems.length > 0
      ? preloaderServiceItems.length * timings.serviceStep
      : prefersReducedMotion
        ? 0.8
        : 3.0;

  preloaderMainPhase.style.setProperty("--preloader-services-duration", `${Math.max(mainHold + 1.8, 5.5)}s`);

  setPhase(true, false);

  let elapsed = mainHold * 1000;

  schedulePreloaderTimeout(() => {
    setPhase(false, false);
  }, elapsed);

  elapsed += timings.mainFade * 1000;
  schedulePreloaderTimeout(() => {
    setPhase(false, true);
    preloaderRethinkPhase.classList.remove("show-consulting");
  }, elapsed);

  elapsed += timings.rethinkIn * 1000 + timings.consultingDelay * 1000;
  schedulePreloaderTimeout(() => {
    preloaderRethinkPhase.classList.add("show-consulting");
  }, elapsed);

  elapsed += timings.rethinkHold * 1000;
  schedulePreloaderTimeout(() => {
    preloaderRethinkPhase.classList.remove("show-consulting");
    setPhase(false, false);
  }, elapsed);

  elapsed += timings.rethinkOut * 1000;
  schedulePreloaderTimeout(() => {
    if (window.gsap) {
      try {
        window.gsap.to(preloader, {
          autoAlpha: 0,
          duration: timings.preloaderOut,
          ease: "power2.inOut",
          onComplete: finishPreloader,
        });
      } catch {
        finishPreloader();
      }
      return;
    }

    preloader.classList.add("is-hidden");
    schedulePreloaderTimeout(finishPreloader, timings.preloaderOut * 1000);
  }, elapsed);
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
  header.classList.remove("is-on-dark");
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

  const sectionSurface = sectionAtProbe.dataset.headerSurface?.trim();
  const normalizedSurface = sectionSurface ? sectionSurface.toLowerCase() : "";
  const isTransparentSurface = normalizedSurface === "transparent";
  const isHero = sectionAtProbe.id === "home" || isTransparentSurface;
  const resolvedSurface = isHero ? "transparent" : sectionSurface || "#ffffff";
  const isDarkSurface = !isHero && isDarkHeaderSurface(resolvedSurface);

  header.classList.toggle("is-on-hero", isHero);
  header.classList.toggle("is-on-light", !isHero && !isDarkSurface);
  header.classList.toggle("is-on-dark", isDarkSurface);
  header.style.setProperty("--header-surface", resolvedSurface);
}

function isDarkHeaderSurface(surface) {
  const value = (surface || "").trim().toLowerCase();
  if (!value || value === "transparent") return false;
  if (value === "#00072d") return true;

  const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return false;

  const hex = match[1];
  const fullHex =
    hex.length === 3
      ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
      : hex;

  const red = Number.parseInt(fullHex.slice(0, 2), 16);
  const green = Number.parseInt(fullHex.slice(2, 4), 16);
  const blue = Number.parseInt(fullHex.slice(4, 6), 16);

  // Relative luminance heuristic: darker surfaces should use light nav text.
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.45;
}

function initMenu() {
  if (!menuToggle || !siteNav) return;

  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
    siteNav.classList.toggle("is-open", !expanded);
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      closeMenu({
        instant:
          window.innerWidth <= 860 &&
          link.hasAttribute("data-transition-link") &&
          isPrimaryNavigationClick(event),
      });
    });
  });

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

function initHomePreloaderBypassLinks() {
  const homeLinks = [...document.querySelectorAll("a[href]")].filter((link) => {
    const href = link.getAttribute("href") || "";
    return href.toLowerCase().includes("index.html") && shouldSkipPreloaderForUrl(href);
  });
  if (!homeLinks.length) return;

  homeLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!isPrimaryNavigationClick(event)) return;
      const href = link.getAttribute("href") || "";
      if (!shouldSkipPreloaderForUrl(href)) return;
      try {
        window.sessionStorage.setItem(PRELOADER_SKIP_HOME_KEY, "1");
      } catch {
        // Ignore storage access issues (private mode/security policies).
      }
    });
  });
}

function initNavSpy() {
  if (!sectionAnchors.length || !navLinks.length) return;

  const inPageNavLinks = navLinks.filter((link) => {
    const href = link.getAttribute("href") || "";
    return href.startsWith("#") && href.length > 1;
  });

  // On multi-page nav layouts, preserve server-authored active states.
  if (inPageNavLinks.length < 2) return;

  const navMap = new Map(
    inPageNavLinks.map((link) => {
      const href = link.getAttribute("href") || "";
      return [href.slice(1), link];
    })
  );

  const activate = (id) => {
    inPageNavLinks.forEach((link) => link.classList.remove("is-active"));
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

  if (activeTransitionTimeline && !transitionBusy) {
    stopActiveTransitionTimeline();
  }

  if (transitionBusy) return;
  transitionBusy = true;

  const gsap = window.gsap;
  const targetLabel = formatTransitionLabel(label, target.id);
  let tl;
  const clearTransition = () => {
    if (activeTransitionTimeline === tl) {
      activeTransitionTimeline = null;
    }
    transitionBusy = false;
  };

  tl = gsap.timeline({
    onComplete: clearTransition,
    onInterrupt: clearTransition,
  });
  activeTransitionTimeline = tl;

  tl.add(() => transitionLayer.classList.add("is-active"));
  tl.set(transitionLayer, { autoAlpha: 1 });
  tl.set(transitionPanels, { scaleY: 0, transformOrigin: "bottom center" });
  if (transitionTarget) transitionTarget.textContent = targetLabel;
  if (transitionCenter) tl.set(transitionCenter, { autoAlpha: 0, y: 26, scale: 0.92 });

  tl.to(transitionPanels, {
    scaleY: 1,
    duration: 0.56,
    ease: "power4.inOut",
  });

  if (transitionCenter) {
    tl.to(
      transitionCenter,
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.34,
        ease: "power3.out",
      },
      "<+0.12"
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
      duration: 0.22,
      ease: "power2.in",
    });
  }

  tl.to(transitionPanels, {
    scaleY: 0,
    transformOrigin: "top center",
    duration: 0.56,
    ease: "power4.inOut",
  });
  tl.set(transitionLayer, { autoAlpha: 0 });
  tl.add(() => transitionLayer.classList.remove("is-active"));
}

function runPageTransitionNavigation(url, label) {
  if (!url) return;

  let targetUrl = null;
  try {
    targetUrl = new URL(url, window.location.href);
  } catch {
    window.location.assign(url);
    return;
  }

  if (shouldSkipPreloaderForUrl(targetUrl.href)) {
    targetUrl.searchParams.set(PRELOADER_SKIP_QUERY_PARAM, "1");
    try {
      window.sessionStorage.setItem(PRELOADER_SKIP_HOME_KEY, "1");
    } catch {
      // Ignore storage access issues (private mode/security policies).
    }
  }

  if (prefersReducedMotion || !window.gsap || !transitionLayer || !transitionPanels.length) {
    window.location.assign(targetUrl.href);
    return;
  }

  if (activeTransitionTimeline && !transitionBusy) {
    stopActiveTransitionTimeline();
  }

  if (transitionBusy) return;
  transitionBusy = true;

  const fallbackLabel = targetUrl.hash
    ? targetUrl.hash.replace(/^#/, "")
    : targetUrl.pathname.split("/").pop()?.replace(/\.html$/i, "") || "Navigating";
  const targetLabel = formatTransitionLabel(label || fallbackLabel, "");
  queueTransitionReveal(targetLabel);

  const gsap = window.gsap;
  let tl;
  const navigateOnComplete = () => {
    if (activeTransitionTimeline === tl) {
      activeTransitionTimeline = null;
    }
    transitionBusy = false;
    window.location.assign(targetUrl.href);
  };
  const clearInterrupted = () => {
    if (activeTransitionTimeline === tl) {
      activeTransitionTimeline = null;
    }
    transitionBusy = false;
    resetTransitionLayerState();
  };
  tl = gsap.timeline({
    onComplete: navigateOnComplete,
    onInterrupt: clearInterrupted,
  });
  activeTransitionTimeline = tl;

  tl.add(() => transitionLayer.classList.add("is-active"));
  tl.set(transitionLayer, { autoAlpha: 1 });
  tl.set(transitionPanels, { scaleY: 0, transformOrigin: "bottom center" });
  if (transitionTarget) transitionTarget.textContent = targetLabel;
  if (transitionCenter) tl.set(transitionCenter, { autoAlpha: 0, y: 26, scale: 0.92 });

  tl.to(transitionPanels, {
    scaleY: 1,
    duration: 0.56,
    ease: "power4.inOut",
  });

  if (transitionCenter) {
    tl.to(
      transitionCenter,
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.34,
        ease: "power3.out",
      },
      "<+0.12"
    );
  }
}

function initPageLoadTransitionReveal() {
  let queuedLabel = "";
  try {
    queuedLabel = window.sessionStorage.getItem(TRANSITION_REVEAL_KEY) || "";
    if (queuedLabel) {
      window.sessionStorage.removeItem(TRANSITION_REVEAL_KEY);
    }
  } catch {
    // Ignore storage access issues (private mode/security policies).
  }

  if (!queuedLabel) {
    clearPendingTransitionRevealClass();
    return;
  }
  const preloaderSuppressed = document.documentElement.classList.contains("skip-preloader-once");
  if (
    preloader &&
    !preloaderHasFinished &&
    !preloader.classList.contains("is-hidden") &&
    !preloaderSuppressed
  ) {
    queuedPageLoadTransitionLabel = queuedLabel;
    return;
  }

  playPageLoadTransitionReveal(queuedLabel);
}

function playPageLoadTransitionReveal(label) {
  if (!label) return;
  if (prefersReducedMotion || !window.gsap || !transitionLayer || !transitionPanels.length) {
    clearPendingTransitionRevealClass();
    resetTransitionLayerState();
    return;
  }

  if (activeTransitionTimeline && !transitionBusy) {
    stopActiveTransitionTimeline();
  }

  const gsap = window.gsap;
  const targetLabel = formatTransitionLabel(label, "");
  let tl;
  const clearTransition = () => {
    if (activeTransitionTimeline === tl) {
      activeTransitionTimeline = null;
    }
  };
  tl = gsap.timeline({
    onComplete: clearTransition,
    onInterrupt: clearTransition,
  });
  activeTransitionTimeline = tl;

  tl.add(() => {
    transitionLayer.classList.add("is-active");
    clearPendingTransitionRevealClass();
  });
  tl.set(transitionLayer, { autoAlpha: 1 });
  tl.set(transitionPanels, { scaleY: 1, transformOrigin: "top center" });
  if (transitionTarget) transitionTarget.textContent = targetLabel;
  if (transitionCenter) tl.set(transitionCenter, { autoAlpha: 1, y: 0, scale: 1 });

  if (transitionCenter) {
    tl.to(transitionCenter, {
      autoAlpha: 0,
      y: -16,
      scale: 0.95,
      duration: 0.24,
      ease: "power2.in",
    });
  }

  tl.to(
    transitionPanels,
    {
      scaleY: 0,
      transformOrigin: "top center",
      duration: 0.56,
      ease: "power4.inOut",
    },
    "<"
  );
  tl.set(transitionLayer, { autoAlpha: 0 });
  tl.add(() => {
    transitionLayer.classList.remove("is-active");
    clearPendingTransitionRevealClass();
  });
}

function initSectionTransitions() {
  if (!transitionLinks.length) return;

  transitionLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || !isPrimaryNavigationClick(event)) return;

      let targetUrl = null;
      try {
        targetUrl = new URL(href, window.location.href);
      } catch {
        return;
      }

      const currentUrl = new URL(window.location.href);
      const sameDocument =
        targetUrl.origin === currentUrl.origin &&
        targetUrl.pathname === currentUrl.pathname &&
        targetUrl.search === currentUrl.search;

      if (sameDocument && targetUrl.hash) {
        const target = document.querySelector(targetUrl.hash);
        if (!target) return;

        event.preventDefault();
        closeMenuForTransition();
        runSectionTransition(target, link.dataset.transitionLabel);
        return;
      }

      if (sameDocument) {
        event.preventDefault();
        closeMenuForTransition();
        return;
      }

      event.preventDefault();
      closeMenuForTransition();
      runPageTransitionNavigation(targetUrl.href, link.dataset.transitionLabel);
    });
  });
}

function revealFallback() {
  revealItems.forEach((item) => {
    if (item.classList.contains("site-footer") || item.closest(".site-footer")) return;
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

  const heroTitle = document.querySelector(".hero-title");
  const heroTitleWords = heroTitle
    ? Array.from(heroTitle.querySelectorAll(".hero-title-word"))
    : [];
  const heroActions = document.querySelector(".hero-actions");
  const heroActionLinks = heroActions
    ? Array.from(heroActions.querySelectorAll(".hero-primary-link, .hero-secondary-link"))
    : [];
  const heroTimeline = gsap.timeline({ paused: true });

  if (heroTitleWords.length) {
    heroTimeline.from(
      heroTitle,
      {
        filter: "blur(8px)",
        duration: 0.42,
        ease: "power2.out",
        clearProps: "filter",
      },
      0.02
    );

    heroTitleWords.forEach((word, index) => {
      heroTimeline.from(
        word,
        {
          yPercent: -190,
          y: -135,
          rotate: -7,
          autoAlpha: 0,
          duration: 0.78,
          ease: "power3.in",
        },
        index === 0 ? 0.02 : ">0.1"
      );

      heroTimeline.to(word, {
        keyframes: [
          { yPercent: 10, y: 10, rotate: 1.2, duration: 0.12, ease: "power2.in" },
          { yPercent: 0, y: 0, rotate: 0, duration: 0.3, ease: "bounce.out" },
          { x: -6, rotate: -0.8, duration: 0.04, ease: "none" },
          { x: 4, rotate: 0.55, duration: 0.04, ease: "none" },
          { x: 0, rotate: 0, duration: 0.035, ease: "none" },
        ],
        clearProps: "opacity,visibility,transform,x,y,rotate",
      });
    });
  } else if (heroTitle) {
    heroTimeline.from(heroTitle, {
      y: 10,
      autoAlpha: 0,
      duration: 0.6,
      ease: "power2.out",
      clearProps: "opacity,visibility,transform",
    }, 0);
  }

  if (heroActions) {
    heroTimeline.from(
      heroActions,
      {
        y: 14,
        autoAlpha: 0,
        duration: 0.55,
        ease: "power3.out",
      },
      0.62
    );
  }

  if (heroActionLinks.length) {
    heroTimeline.from(
      heroActionLinks,
      {
        y: 12,
        autoAlpha: 0,
        duration: 0.48,
        ease: "power3.out",
        stagger: 0.08,
      },
      0.7
    );
  }

  const hasPreloaderOverlay =
    preloader && !preloaderHasFinished && !preloader.classList.contains("is-hidden");

  if (hasPreloaderOverlay) {
    runDeferredHeroIntro = () => heroTimeline.play(0);
  } else {
    heroTimeline.play(0);
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
    if (item.closest(".team-section")) return;
    if (item.classList.contains("site-footer") || item.closest(".site-footer")) return;

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
  const solutionsDialog = document.getElementById("services-solutions-dialog");
  if (!cards.length || !solutionsDialog) return;

  const closeButtons = [...solutionsDialog.querySelectorAll("[data-dialog-close]")];
  const solutionTitle = solutionsDialog.querySelector("#services-solution-title");
  const solutionCopy = solutionsDialog.querySelector("#services-solution-copy");

  const openDialog = () => {
    if (typeof solutionsDialog.showModal === "function") {
      if (!solutionsDialog.open) solutionsDialog.showModal();
      return;
    }
    solutionsDialog.setAttribute("open", "open");
  };

  const closeDialog = () => {
    if (typeof solutionsDialog.close === "function") {
      if (solutionsDialog.open) solutionsDialog.close();
      return;
    }
    solutionsDialog.removeAttribute("open");
  };

  const openServiceDialog = (card) => {
    const headingText = card.querySelector("h3")?.textContent?.trim() || "Capabilities";
    const cleanHeading = headingText.replace(/^\d+\.\s*/, "").trim();
    const fullText =
      card.querySelector(".services-summary-full")?.textContent?.trim() ||
      card.querySelector(".services-summary-brief")?.textContent?.trim() ||
      "";

    if (solutionTitle) solutionTitle.textContent = cleanHeading;
    if (solutionCopy) solutionCopy.textContent = fullText;
    solutionsDialog.setAttribute("aria-label", `Capabilities - ${cleanHeading}`);
    openDialog();
  };

  cards.forEach((card) => {
    card.classList.remove("is-open");
    card.setAttribute("aria-expanded", "false");

    const cta = card.querySelector(".services-summary-cta");
    if (!cta) return;

    cta.textContent = "READ MORE";
    cta.setAttribute("role", "button");
    cta.setAttribute("tabindex", "0");
    cta.setAttribute("aria-haspopup", "dialog");
    cta.setAttribute("aria-controls", "services-solutions-dialog");

    cta.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openServiceDialog(card);
    });

    cta.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      openServiceDialog(card);
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeDialog);
  });

  solutionsDialog.addEventListener("click", (event) => {
    if (event.target !== solutionsDialog) return;
    closeDialog();
  });
}

function initSolutionsSelection() {
  const solutionsDoc = document.querySelector(".solutions-doc");
  const solutionBlocks = solutionsDoc ? [...solutionsDoc.querySelectorAll(".solutions-block[data-solution-key]")] : [];
  if (!solutionsDoc || !solutionBlocks.length) return;

  const focusBanner = document.getElementById("solutions-focus-banner");
  const focusLabel = document.getElementById("solutions-focus-label");
  const showAllButton = document.getElementById("solutions-show-all");
  const sectionOverview = document.getElementById("solutions-overview");

  const solutionsByKey = new Map(
    solutionBlocks
      .map((block) => {
        const solutionKey = block.dataset.solutionKey?.trim().toLowerCase() || "";
        return [solutionKey, block];
      })
      .filter(([solutionKey]) => Boolean(solutionKey))
  );

  const getSolutionLabel = (block) =>
    block?.querySelector(".solutions-block-kicker")?.textContent?.trim() ||
    block?.querySelector("h2")?.textContent?.trim() ||
    "Selected solution";

  const applySelection = (solutionKey, options = {}) => {
    const { updateHistory = true, keepScroll = false } = options;
    const normalizedKey = (solutionKey || "").trim().toLowerCase();
    const selectedBlock = normalizedKey ? solutionsByKey.get(normalizedKey) || null : null;
    const hasSelection = Boolean(selectedBlock);

    solutionBlocks.forEach((block) => {
      const showBlock = !hasSelection || block === selectedBlock;
      block.hidden = !showBlock;
      block.classList.toggle("is-selected-solution", hasSelection && block === selectedBlock);
    });

    if (focusBanner && focusLabel) {
      focusBanner.classList.toggle("is-active", hasSelection);
      focusLabel.textContent = hasSelection ? `Showing: ${getSolutionLabel(selectedBlock)}` : "";
    }

    if (showAllButton) {
      showAllButton.hidden = !hasSelection;
    }

    if (updateHistory) {
      const nextUrl = new URL(window.location.href);
      if (hasSelection && selectedBlock?.id) {
        nextUrl.searchParams.set("solution", normalizedKey);
        nextUrl.hash = `#${selectedBlock.id}`;
      } else {
        nextUrl.searchParams.delete("solution");
        nextUrl.hash = sectionOverview ? "#solutions-overview" : "";
      }
      window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    }

    if (!keepScroll) {
      if (hasSelection && selectedBlock) {
        instantScrollTo(selectedBlock);
      } else if (sectionOverview) {
        instantScrollTo(sectionOverview);
      }
    }

    requestHeaderStateSync();
  };

  showAllButton?.addEventListener("click", () => {
    applySelection("", { updateHistory: true, keepScroll: false });
  });

  const initialSolution = new URLSearchParams(window.location.search).get("solution");
  if (initialSolution && solutionsByKey.has(initialSolution.trim().toLowerCase())) {
    applySelection(initialSolution, { updateHistory: false, keepScroll: true });
    return;
  }

  applySelection("", { updateHistory: false, keepScroll: true });
}

function initCapabilitiesPage() {
  const capabilitiesRoot = document.querySelector(".capabilities-v3");
  if (!capabilitiesRoot) return;

  const filterButtons = [...capabilitiesRoot.querySelectorAll("[data-cap-filter]")];
  const capabilityBands = [...capabilitiesRoot.querySelectorAll("[data-cap-filter-tags]")];
  const subcapToggles = [...capabilitiesRoot.querySelectorAll("[data-subcap-toggle]")];
  const systemsDiagrams = [...capabilitiesRoot.querySelectorAll("[data-systems-diagram]")];
  const animatedTargets = [
    ...capabilitiesRoot.querySelectorAll("[data-cap-animate], .capability-timeline-wrap"),
  ];
  const impactValues = [...capabilitiesRoot.querySelectorAll("[data-impact-count]")];
  const digitalTabsRoot = capabilitiesRoot.querySelector("[data-digital-tabs]");
  let activateDigitalTab = null;

  const normalizeToken = (value) => value.trim().toLowerCase();
  const panelByFilter = new Map([
    ["research-data", "capability-01"],
    ["content", "capability-02"],
    ["systems", "capability-03"],
    ["strategy", "capability-04"],
    ["programmes", "capability-05"],
    ["technology", "capability-06"],
    ["policy-legal", "capability-07"],
  ]);

  let activeFilter = "research-data";
  let activePanel = null;
  let panelExitTimer = 0;

  const resolvePanel = (filter) => {
    const targetId = panelByFilter.get(filter) || panelByFilter.get("research-data");
    return targetId ? document.getElementById(targetId) : null;
  };

  const applyFilter = (nextFilter) => {
    const normalizedFilter = normalizeToken(nextFilter || "research-data");
    const nextPanel = resolvePanel(normalizedFilter);
    if (!nextPanel) return;

    filterButtons.forEach((button) => {
      const buttonFilter = normalizeToken(button.dataset.capFilter || "");
      const isActive = buttonFilter === normalizedFilter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    capabilityBands.forEach((band) => {
      if (band !== nextPanel && band !== activePanel) {
        band.hidden = true;
        band.classList.remove("is-cap-active", "is-cap-enter", "is-cap-exit");
      }
    });

    if (activePanel && activePanel !== nextPanel) {
      activePanel.classList.remove("is-cap-enter", "is-cap-active");
      activePanel.classList.add("is-cap-exit");

      if (panelExitTimer) window.clearTimeout(panelExitTimer);
      const exitingPanel = activePanel;
      panelExitTimer = window.setTimeout(() => {
        exitingPanel.hidden = true;
        exitingPanel.classList.remove("is-cap-exit");
      }, 240);
    }

    nextPanel.hidden = false;
    nextPanel.classList.remove("is-cap-exit");
    nextPanel.classList.add("is-cap-enter");
    window.requestAnimationFrame(() => {
      nextPanel.classList.add("is-cap-active");
      nextPanel.classList.remove("is-cap-enter");
    });

    const stageRevealNodes = [
      ...nextPanel.querySelectorAll(".capability-main > *, .capability-side > *, [data-cap-animate]"),
    ];
    if (prefersReducedMotion) {
      stageRevealNodes.forEach((node) => node.classList.add("is-stage-reveal"));
    } else {
      stageRevealNodes.forEach((node, index) => {
        node.classList.remove("is-stage-reveal");
        window.setTimeout(() => node.classList.add("is-stage-reveal"), 20 + index * 14);
      });
    }

    activeFilter = normalizedFilter;
    activePanel = nextPanel;
    if (nextPanel.id === "capability-06" && typeof activateDigitalTab === "function") {
      activateDigitalTab("1");
    }
    requestHeaderStateSync();
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = normalizeToken(button.dataset.capFilter || "research-data");
      const fallbackFilter = "research-data";
      const normalized = panelByFilter.has(filter) ? filter : fallbackFilter;
      if (normalized === activeFilter) return;
      applyFilter(normalized);
    });
  });

  capabilityBands.forEach((band) => {
    band.hidden = true;
    band.classList.remove("is-cap-active", "is-cap-enter", "is-cap-exit");
  });
  applyFilter("research-data");

  const mobileSubcapMedia = window.matchMedia("(max-width: 900px)");

  const syncSubcapPanels = () => {
    const isMobile = mobileSubcapMedia.matches;
    subcapToggles.forEach((toggleButton) => {
      const panelId = toggleButton.dataset.subcapToggle || "";
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;

      if (!isMobile) {
        panel.classList.add("is-open");
        toggleButton.setAttribute("aria-expanded", "true");
        return;
      }

      const isOpen = panel.classList.contains("is-open");
      toggleButton.textContent = isOpen ? "Hide sub-capabilities -" : "Show sub-capabilities +";
      toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  };

  subcapToggles.forEach((toggleButton) => {
    const panelId = toggleButton.dataset.subcapToggle || "";
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return;

    panel.classList.remove("is-open");
    toggleButton.setAttribute("aria-controls", panelId);
    toggleButton.setAttribute("aria-expanded", "false");

    toggleButton.addEventListener("click", () => {
      if (!mobileSubcapMedia.matches) return;
      const isOpen = panel.classList.toggle("is-open");
      toggleButton.textContent = isOpen ? "Hide sub-capabilities -" : "Show sub-capabilities +";
      toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });

  if (typeof mobileSubcapMedia.addEventListener === "function") {
    mobileSubcapMedia.addEventListener("change", syncSubcapPanels);
  } else if (typeof mobileSubcapMedia.addListener === "function") {
    mobileSubcapMedia.addListener(syncSubcapPanels);
  }
  syncSubcapPanels();

  systemsDiagrams.forEach((diagram) => {
    const nodes = [...diagram.querySelectorAll(".systems-node[data-tip]")];
    const tipNode = diagram.querySelector("[data-systems-tip]");
    if (!nodes.length || !tipNode) return;

    const defaultTip = tipNode.textContent?.trim() || "";

    const setActiveNode = (activeNode) => {
      nodes.forEach((node) => node.classList.toggle("is-active", node === activeNode));
      tipNode.textContent = activeNode?.dataset.tip || defaultTip;
    };

    nodes.forEach((node) => {
      node.addEventListener("mouseenter", () => setActiveNode(node));
      node.addEventListener("focus", () => setActiveNode(node));
      node.addEventListener("click", () => setActiveNode(node));
      node.addEventListener("mouseleave", () => setActiveNode(null));
      node.addEventListener("blur", () => setActiveNode(null));
    });
  });

  if (digitalTabsRoot) {
    const tabButtons = [...digitalTabsRoot.querySelectorAll("[data-digital-tab]")];
    const tabPanels = [...digitalTabsRoot.querySelectorAll("[data-digital-panel]")];

    const setDigitalTab = (tabId) => {
      const nextButton = tabButtons.find((button) => button.dataset.digitalTab === tabId) || tabButtons[0];
      if (!nextButton) return;
      const nextId = nextButton.dataset.digitalTab;

      tabButtons.forEach((button) => {
        const isActive = button === nextButton;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
        button.setAttribute("tabindex", isActive ? "0" : "-1");
      });

      tabPanels.forEach((panel) => {
        const isActive = panel.dataset.digitalPanel === nextId;
        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
      });
    };
    activateDigitalTab = setDigitalTab;

    tabButtons.forEach((button, index) => {
      button.addEventListener("click", () => setDigitalTab(button.dataset.digitalTab || "1"));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextIndex = (index + direction + tabButtons.length) % tabButtons.length;
        const nextButton = tabButtons[nextIndex];
        if (!nextButton) return;
        nextButton.focus();
        setDigitalTab(nextButton.dataset.digitalTab || "1");
      });
    });

    setDigitalTab("1");
  }

  if (prefersReducedMotion) {
    animatedTargets.forEach((target) => target.classList.add("is-in-view"));
  } else if ("IntersectionObserver" in window) {
    const motionObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in-view");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.16,
      }
    );
    animatedTargets.forEach((target) => motionObserver.observe(target));
  } else {
    animatedTargets.forEach((target) => target.classList.add("is-in-view"));
  }

  const renderImpactValue = (element, value) => {
    const prefix = element.dataset.impactPrefix || "";
    const suffix = element.dataset.impactSuffix || "";
    element.textContent = `${prefix}${value}${suffix}`;
  };

  const animateImpactValue = (element) => {
    const target = Number.parseInt(element.dataset.impactCount || "0", 10);
    if (!Number.isFinite(target)) return;

    const duration = 1100;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      renderImpactValue(element, current);
      if (progress < 1) {
        window.requestAnimationFrame(tick);
      } else {
        renderImpactValue(element, target);
      }
    };

    window.requestAnimationFrame(tick);
  };

  if (!impactValues.length) return;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    impactValues.forEach((element) => {
      const target = Number.parseInt(element.dataset.impactCount || "0", 10);
      renderImpactValue(element, Number.isFinite(target) ? target : 0);
    });
    return;
  }

  const impactObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        animateImpactValue(element);
        observer.unobserve(element);
      });
    },
    {
      threshold: 0.4,
    }
  );

  impactValues.forEach((element) => impactObserver.observe(element));
}

function initCapabilitiesExportFilters() {
  const root = document.querySelector(".capabilities-export");
  if (!root) return;

  const sectionNav = root.querySelector(".cap-export-nav");
  const filterButtons = [...root.querySelectorAll("[data-cap-export-filter]")];
  if (!filterButtons.length) return;

  const targets = filterButtons
    .map((button) => {
      const targetId = button.dataset.capExportFilter || "";
      const target = targetId ? document.getElementById(targetId) : null;
      return target ? { button, target, id: targetId } : null;
    })
    .filter(Boolean);
  if (!targets.length) return;

  const getScrollOffset = () => {
    const headerOffset = header ? header.getBoundingClientRect().height : 0;
    const navOffset = sectionNav ? sectionNav.getBoundingClientRect().height : 0;
    return headerOffset + navOffset - 1;
  };

  let activeFilterId = "";
  let navPeekTimer = null;

  const showSectionNav = () => {
    if (!sectionNav) return;
    if (navPeekTimer) {
      window.clearTimeout(navPeekTimer);
    }
    sectionNav.classList.add("is-peeking");
    sectionNav.removeAttribute("aria-hidden");
    sectionNav.inert = false;
    navPeekTimer = window.setTimeout(() => {
      sectionNav.classList.remove("is-peeking");
      sectionNav.setAttribute("aria-hidden", "true");
      sectionNav.inert = true;
    }, prefersReducedMotion ? 2200 : 1700);
  };

  const hideSectionNav = () => {
    if (!sectionNav) return;
    if (navPeekTimer) {
      window.clearTimeout(navPeekTimer);
      navPeekTimer = null;
    }
    sectionNav.classList.remove("is-peeking");
    sectionNav.setAttribute("aria-hidden", "true");
    sectionNav.inert = true;
  };

  const setActiveFilter = (targetId, options = {}) => {
    const { reveal = true } = options;
    if (targetId === activeFilterId) return;
    activeFilterId = targetId;
    filterButtons.forEach((button) => {
      const isActive = button.dataset.capExportFilter === targetId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      if (isActive && sectionNav && window.innerWidth <= 900) {
        button.scrollIntoView({
          block: "nearest",
          inline: "center",
        });
      }
    });
    if (reveal) showSectionNav();
  };

  hideSectionNav();

  filterButtons.forEach((button) => {
    button.setAttribute("aria-pressed", button.classList.contains("is-active") ? "true" : "false");
    button.addEventListener("click", () => {
      const targetId = button.dataset.capExportFilter || "";
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;

      setActiveFilter(targetId, { reveal: true });
      const top = target.getBoundingClientRect().top + window.scrollY - getScrollOffset();
      window.scrollTo({
        top: Math.max(0, top),
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
      requestHeaderStateSync();
    });
  });

  const syncActiveFilter = () => {
    const probeY = window.scrollY + getScrollOffset() + 2;
    const activeTarget =
      targets
        .slice()
        .reverse()
        .find(({ target }) => target.offsetTop <= probeY) || targets[0];
    setActiveFilter(activeTarget.id, { reveal: activeFilterId !== "" });
  };

  window.addEventListener("scroll", syncActiveFilter, { passive: true });
  window.addEventListener("resize", syncActiveFilter);
  syncActiveFilter();
}

function initCapabilitiesExportMotion() {
  const root = document.querySelector(".capabilities-export");
  if (!root) return;

  const motionSections = [...root.querySelectorAll(".cap-export-hero, .cap-export-section")];
  if (!motionSections.length) return;

  const buttonById = new Map(
    [...root.querySelectorAll("[data-cap-export-filter]")].map((button) => [button.dataset.capExportFilter, button])
  );
  buttonById.forEach((button) => button.style.setProperty("--cap-filter-progress", "0"));

  body.classList.add("capabilities-export-motion-ready");

  const setLiveState = (section, nextState) => {
    section.classList.toggle("is-live", nextState);
  };

  if (prefersReducedMotion) {
    motionSections.forEach((section) => section.classList.add("is-live"));
    return;
  }

  const compactMotion = window.matchMedia("(max-width: 900px)").matches;
  const chapterRise = compactMotion ? 32 : 68;
  const chapterDrift = compactMotion ? -14 : -28;

  if (window.gsap && window.ScrollTrigger) {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);

    const animateCluster = (timeline, elements, vars, position = 0) => {
      if (!elements.length) return;
      timeline.from(
        elements,
        {
          autoAlpha: 0,
          duration: 0.82,
          ease: "power3.out",
          stagger: 0.08,
          ...vars,
        },
        position
      );
    };

    const animateList = (timeline, listItems, options = {}, position = 0.18) => {
      if (!listItems.length) return;
      const {
        fromX = 0,
        fromY = 0,
        stagger = 0.08,
        ease = "power3.out",
        duration = 0.82,
        scale = 1,
      } = options;

      const resolveOffset = (offset, index, element) => {
        if (typeof offset === "function") return offset(index, element);
        if (Array.isArray(offset)) return offset[index] ?? 0;
        return offset;
      };

      timeline.from(
        listItems,
        {
          autoAlpha: 0,
          duration,
          ease,
          stagger,
          x: (index, element) => resolveOffset(fromX, index, element),
          y: (index, element) => resolveOffset(fromY, index, element),
          scale,
        },
        position
      );
    };

    motionSections.forEach((section) => {
      const sectionId = section.id;
      const container = section.querySelector(".cap-export-container");
      if (container) {
        gsap.fromTo(
          container,
          {
            y: chapterRise,
            scale: compactMotion ? 0.96 : 0.88,
            transformOrigin: "50% 50%",
          },
          {
            y: 0,
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: section,
              start: "top bottom",
              end: "top 36%",
              scrub: 0.9,
            },
          }
        );

        gsap.to(container, {
          y: chapterDrift,
          scale: compactMotion ? 0.978 : 0.94,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "bottom 72%",
            end: "bottom top",
            scrub: 1.0,
          },
        });
      }

      ScrollTrigger.create({
        trigger: section,
        start: "top 70%",
        end: "bottom 34%",
        onUpdate: ({ progress }) => {
          const normalized = progress.toFixed(3);
          section.style.setProperty("--cap-progress", normalized);
          const filterButton = buttonById.get(sectionId);
          if (filterButton) filterButton.style.setProperty("--cap-filter-progress", normalized);
        },
        onToggle: ({ isActive }) => setLiveState(section, isActive),
      });
    });

    motionSections.forEach((section) => {
      const timeline = gsap.timeline({
        defaults: { overwrite: "auto" },
        scrollTrigger: {
          trigger: section,
          start: "top 72%",
          end: "bottom 34%",
          toggleActions: "play reverse play reverse",
        },
      });

      if (section.classList.contains("cap-export-hero")) {
        const heroTitle = section.querySelector("h1");
        const heroCopy = section.querySelector("p");
        animateCluster(timeline, [heroTitle], {
          y: compactMotion ? 120 : 180,
          scale: 0.72,
          transformOrigin: "50% 100%",
          duration: 1.1,
          ease: "expo.out",
        }, 0);
        animateCluster(timeline, [heroCopy], {
          y: 60,
          x: compactMotion ? 0 : 40,
          scale: 0.9,
          duration: 0.9,
          ease: "power4.out",
        }, 0.28);
        return;
      }

      const copyChildren = [...section.querySelectorAll(".cap-export-copy > *")];
      const listItems = [...section.querySelectorAll(".cap-export-list li")];
      const sideParagraphs = [...section.querySelectorAll(".cap-export-side > p:not(.cap-export-note)")];
      const sideLink = section.querySelector(".cap-export-link");
      const note = section.querySelector(".cap-export-note");

      if (section.id === "cap-export-research") {
        animateCluster(timeline, copyChildren, {
          y: 0, x: compactMotion ? -60 : -180,
          scale: 0.86,
          transformOrigin: "0% 50%",
          duration: 1.0,
          ease: "expo.out",
        }, 0);
        animateList(timeline, listItems, {
          fromX: compactMotion ? 28 : 84,
          fromY: 0,
          ease: "power3.out",
          duration: 0.74,
          stagger: 0.06,
        }, 0.18);
        animateCluster(timeline, [sideLink], { y: 40, x: 20 }, 0.58);
        return;
      }

      if (section.id === "cap-export-content") {
        const quote = section.querySelector("blockquote");
        const quoteIndex = copyChildren.indexOf(quote);
        const introCopy = quoteIndex === -1 ? copyChildren : copyChildren.filter((item) => item !== quote);
        animateCluster(timeline, introCopy, {
          x: compactMotion ? 40 : 160,
          scale: 0.88,
          transformOrigin: "100% 50%",
          duration: 1.0,
          ease: "expo.out",
        }, 0);
        if (quote) {
          timeline.from(quote, {
            autoAlpha: 0,
            y: compactMotion ? 50 : 100,
            rotateX: -28,
            scaleY: 0.6,
            transformOrigin: "50% 0%",
            duration: 0.9,
            ease: "back.out(1.4)",
          }, 0.24);
        }
        animateList(timeline, listItems, {
          fromX: compactMotion ? -28 : -82,
          fromY: 0,
          ease: "power3.out",
          duration: 0.72,
          stagger: 0.06,
        }, 0.2);
        animateCluster(timeline, [sideLink], { x: -40, y: 0 }, 0.6);
        return;
      }

      if (section.id === "cap-export-systems") {
        const diagram = section.querySelector(".cap-export-diagram");
        const lines = diagram ? [...diagram.querySelectorAll("line")] : [];
        const circles = diagram ? [...diagram.querySelectorAll("circle")] : [];
        const labels = diagram ? [...diagram.querySelectorAll("text")] : [];

        animateCluster(timeline, copyChildren, {
          y: compactMotion ? 60 : 120,
          scale: 0.88,
          transformOrigin: "50% 0%",
          duration: 1.0,
          ease: "expo.out",
        }, 0);
        animateList(timeline, listItems, {
          fromX: compactMotion ? 24 : 72,
          fromY: 0,
          ease: "power3.out",
          duration: 0.72,
          stagger: 0.06,
        }, 0.2);
        animateCluster(timeline, [diagram], {
          x: compactMotion ? 24 : 90,
          y: 60,
          scale: 0.6,
          rotate: compactMotion ? 0 : -30,
          transformOrigin: "50% 50%",
          duration: 1.1,
          ease: "elastic.out(1, 0.55)",
        }, 0.14);

        if (lines.length) {
          gsap.set(lines, { strokeDasharray: 300, strokeDashoffset: 300, opacity: 0 });
          timeline.to(lines, {
            strokeDashoffset: 0, opacity: 1,
            duration: 1.0, ease: "power3.out", stagger: 0.07,
          }, 0.32);
        }

        if (circles.length) {
          timeline.from(circles, {
            autoAlpha: 0, scale: 0.1,
            x: (i) => [-80, 30, -30, 60, 90][i] || 0,
            y: (i) => [30, -80, 80, -20, 0][i] || 0,
            duration: 0.78,
            ease: "elastic.out(1.2, 0.5)",
            stagger: 0.07,
          }, 0.38);
        }

        animateCluster(timeline, labels, { y: 24, autoAlpha: 0 }, 0.52);
        animateCluster(timeline, [sideLink], { y: 30 }, 0.64);
        return;
      }

      if (section.id === "cap-export-strategy") {
        const quote = section.querySelector("blockquote");
        const quoteIndex = copyChildren.indexOf(quote);
        const introCopy = quoteIndex === -1 ? copyChildren : copyChildren.filter((item) => item !== quote);
        // Left column slams in from far right
        animateCluster(timeline, introCopy, {
          x: compactMotion ? 60 : 200,
          scale: 0.82,
          transformOrigin: "100% 50%",
          duration: 1.1,
          ease: "expo.out",
        }, 0);
        if (quote) {
          timeline.from(quote, {
            autoAlpha: 0,
            scaleX: 0,
            transformOrigin: "0% 50%",
            duration: 0.7,
            ease: "power4.out",
          }, 0.26);
        }
        // Right column slams in from far left
        animateCluster(timeline, sideParagraphs, {
          x: compactMotion ? -50 : -180,
          scale: 0.85,
          duration: 1.0,
          ease: "expo.out",
        }, 0.08);
        animateList(timeline, listItems, {
          fromX: compactMotion ? -26 : -78,
          fromY: 0,
          ease: "power3.out",
          duration: 0.72,
          stagger: 0.06,
        }, 0.24);
        animateCluster(timeline, [sideLink], { x: -50 }, 0.62);
        return;
      }

      if (section.id === "cap-export-programmes") {
        const timelineSteps = [...section.querySelectorAll(".cap-export-timeline div")];
        const stepBadges = timelineSteps.map((step) => step.querySelector("span")).filter(Boolean);
        const stepLabels = timelineSteps.map((step) => step.querySelector("strong")).filter(Boolean);
        animateCluster(timeline, copyChildren, {
          y: compactMotion ? 80 : 150,
          scale: 0.84,
          transformOrigin: "50% 100%",
          duration: 1.0,
          ease: "expo.out",
        }, 0);
        animateList(timeline, listItems, {
          fromX: compactMotion ? 20 : 64,
          fromY: 0,
          ease: "power3.out",
          duration: 0.72,
          stagger: 0.06,
        }, 0.16);
        // Domino cascade - each step tilts in from top
        timeline.from(timelineSteps, {
          autoAlpha: 0,
          y: compactMotion ? -60 : -140,
          rotate: (i) => (i % 2 === 0 ? -12 : 12),
          scale: 0.7,
          transformOrigin: "50% 0%",
          duration: 1.0,
          ease: "elastic.out(1, 0.6)",
          stagger: 0.12,
        }, 0.28);
        timeline.from(stepBadges, {
          autoAlpha: 0, scale: 0.1,
          duration: 0.5, ease: "back.out(3)", stagger: 0.12,
        }, 0.38);
        timeline.from(stepLabels, {
          autoAlpha: 0, y: 12,
          duration: 0.4, ease: "power3.out", stagger: 0.1,
        }, 0.44);
        animateCluster(timeline, [sideLink], { y: 30, scale: 0.9 }, 0.68);
        return;
      }

      if (section.id === "cap-export-technology") {
        const headChildren = [...section.querySelectorAll(".cap-export-digital-head > *")];
        const stats = [...section.querySelectorAll(".cap-export-stats > div")];
        const panels = [...section.querySelectorAll(".cap-export-panels article")];
        const digitalNote = section.querySelector(".cap-export-digital-note");
        const dashboard = section.querySelector(".cap-export-dashboard");
        const dashboardStream = [...section.querySelectorAll(".cap-export-dashboard-stream article")];
        const dashboardIcons = [...section.querySelectorAll(".cap-export-dashboard aside span")];
        const dashboardCards = [...section.querySelectorAll(".cap-export-dashboard-metrics article")];
        const statusLine = section.querySelector(".cap-export-status p");
        const statusBars = [...section.querySelectorAll(".cap-export-status span")];
        const problems = [...section.querySelectorAll(".cap-export-problems article")];
        const darkLink = section.querySelector(".cap-export-link--dark");

        // Head cascade from bottom with stagger
        animateCluster(timeline, headChildren, {
          y: compactMotion ? 60 : 120, scale: 0.88,
          transformOrigin: "50% 100%",
          duration: 0.96, ease: "expo.out",
        }, 0);
        // Stats pop in like dice
        timeline.from(stats, {
          autoAlpha: 0, y: compactMotion ? 50 : 100, scale: 0.5,
          rotate: (i) => [-8, 0, 8][i] || 0,
          duration: 0.8, ease: "back.out(2.2)", stagger: 0.12,
        }, 0.2);
        // Panels slide in alternating diagonal
        timeline.from(panels, {
          autoAlpha: 0,
          x: (i) => (i % 2 === 0 ? (compactMotion ? -40 : -110) : (compactMotion ? 40 : 110)),
          y: (i) => i * (compactMotion ? 10 : 20),
          scale: 0.88,
          duration: 0.84, ease: "expo.out", stagger: 0.09,
        }, 0.28);
        animateCluster(timeline, [digitalNote], { y: 24, x: 0 }, 0.5);
        // Dashboard flips in from right with 3D perspective
        timeline.from(dashboard, {
          autoAlpha: 0,
          x: compactMotion ? 40 : 180,
          y: compactMotion ? 10 : 30,
          rotateY: compactMotion ? 0 : -22,
          scale: 0.78,
          transformOrigin: "100% 50%",
          duration: 1.0, ease: "expo.out",
        }, 0.3);
        // Dashboard stream tiles fall in from top
        timeline.from(dashboardStream, {
          autoAlpha: 0, y: compactMotion ? -30 : -70,
          x: (i) => (i - 1) * (compactMotion ? 12 : 28),
          scale: 0.8, rotate: (i) => (i - 1) * 4,
          duration: 0.72, ease: "back.out(1.6)", stagger: 0.1,
        }, 0.46);
        timeline.from(dashboardIcons, {
          autoAlpha: 0, scale: 0.2, rotate: -180,
          duration: 0.52, ease: "back.out(2.5)", stagger: 0.07,
        }, 0.44);
        // Dashboard metric cards cascade diagonally
        timeline.from(dashboardCards, {
          autoAlpha: 0,
          x: (i) => i * (compactMotion ? 12 : 24),
          y: (i) => i * (compactMotion ? 8 : 18),
          scale: 0.78, rotate: (i) => i * 3,
          duration: 0.64, ease: "back.out(1.8)", stagger: 0.09,
        }, 0.52);
        animateCluster(timeline, [statusLine], { x: 40, opacity: 0 }, 0.6);
        timeline.from(
          statusBars,
          {
            scaleX: 0,
            transformOrigin: "0% 50%",
            autoAlpha: 0,
            duration: 0.44,
            ease: "power2.out",
            stagger: 0.05,
          },
          0.68
        );
        timeline.from(
          problems,
          {
            autoAlpha: 0,
            y: compactMotion ? 32 : 74,
            rotateX: compactMotion ? 0 : -8,
            transformOrigin: "50% 100%",
            duration: 0.82,
            ease: "power3.out",
            stagger: 0.08,
          },
          0.42
        );
        animateCluster(timeline, [darkLink], { y: 24 }, 0.78);
        return;
      }

      if (section.id === "cap-export-legal") {
        const icons = [...section.querySelectorAll(".cap-export-icons div")];
        animateCluster(timeline, copyChildren, {
          x: compactMotion ? 50 : 160,
          scale: 0.84,
          transformOrigin: "100% 50%",
          duration: 1.0,
          ease: "expo.out",
        }, 0);
        // Icons spin in like balance scales settling
        timeline.from(icons, {
          autoAlpha: 0,
          scale: 0.2,
          rotate: (i) => [-180, 0, 180][i] || 0,
          y: compactMotion ? 30 : 70,
          duration: 0.88,
          ease: "elastic.out(1.1, 0.5)",
          stagger: 0.12,
        }, 0.22);
        animateList(timeline, listItems, {
          fromX: compactMotion ? -28 : -84,
          fromY: 0,
          ease: "power3.out",
          duration: 0.72,
          stagger: 0.06,
        }, 0.18);
        animateCluster(timeline, [note], { y: 30, x: -24 }, 0.56);
        animateCluster(timeline, [sideLink], { x: -50 }, 0.66);
        return;
      }

      if (section.id === "cap-export-groundwork") {
        const quote = section.querySelector("blockquote");
        const quoteIndex = copyChildren.indexOf(quote);
        const introCopy = quoteIndex === -1 ? copyChildren : copyChildren.filter((item) => item !== quote);
        // Emerge from the ground - scale from bottom, y large
        animateCluster(timeline, introCopy, {
          y: compactMotion ? 100 : 200,
          scale: 0.72,
          transformOrigin: "50% 100%",
          duration: 1.1,
          ease: "expo.out",
        }, 0);
        if (quote) {
          timeline.from(quote, {
            autoAlpha: 0,
            clipPath: "inset(100% 0% 0% 0%)",
            y: 40,
            duration: 0.82,
            ease: "power4.out",
          }, 0.28);
        }
        // List items emerge from below like stakes being driven
        animateList(timeline, listItems, {
          fromX: 0,
          fromY: compactMotion ? 24 : 56,
          ease: "power3.out",
          duration: 0.76,
          stagger: 0.06,
        }, 0.2);
        animateCluster(timeline, sideParagraphs, { y: 50, scale: 0.9 }, 0.4);
        animateCluster(timeline, [sideLink], { y: 50, scale: 0.88 }, 0.64);
        return;
      }

      animateCluster(timeline, copyChildren, { y: compactMotion ? 70 : 140, scale: 0.88, ease: "expo.out" }, 0);
      animateList(timeline, listItems, {
        fromX: compactMotion ? 24 : 70,
        fromY: 0,
        ease: "power3.out",
        duration: 0.72,
        stagger: 0.06,
      }, 0.2);
      animateCluster(timeline, sideParagraphs, { y: 40, x: -20 }, 0.28);
      animateCluster(timeline, [note, sideLink], { y: 36 }, 0.56);
    });

    ScrollTrigger.refresh();
    return;
  }

  if (!("IntersectionObserver" in window)) {
    motionSections.forEach((section) => section.classList.add("is-live"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        setLiveState(entry.target, entry.isIntersecting);
      });
    },
    {
      threshold: 0.22,
      rootMargin: "-10% 0px -10% 0px",
    }
  );

  motionSections.forEach((section) => observer.observe(section));
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

function initProcessFlowReveal() {
  const section = document.getElementById("process");
  const kicker = section?.querySelector(".process-flow-kicker");
  const headline = document.getElementById("process-flow-headline");
  const strategyCol = document.getElementById("process-flow-col-strategy");
  const divider1 = document.getElementById("process-flow-div-1");
  const designCol = document.getElementById("process-flow-col-design");
  const divider2 = document.getElementById("process-flow-div-2");
  const developmentCol = document.getElementById("process-flow-col-development");

  if (!section || !strategyCol || !divider1 || !designCol || !divider2 || !developmentCol) return;

  const sequence = [
    { element: kicker, delay: 120 },
    { element: headline, delay: 150 },
    { element: strategyCol, delay: 700 },
    { element: divider1, delay: 1150 },
    { element: designCol, delay: 1200 },
    { element: divider2, delay: 1650 },
    { element: developmentCol, delay: 1700 },
  ].filter(({ element }) => Boolean(element));

  const revealAllImmediately = () => {
    sequence.forEach(({ element }) => element.classList.add("is-visible"));
  };

  const playSequence = () => {
    sequence.forEach(({ element, delay }) => {
      window.setTimeout(() => element.classList.add("is-visible"), delay);
    });
  };

  if (prefersReducedMotion) {
    revealAllImmediately();
    return;
  }

  if (!("IntersectionObserver" in window)) {
    playSequence();
    return;
  }

  let hasPlayed = false;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || hasPlayed) return;
        hasPlayed = true;
        playSequence();
        observer.disconnect();
      });
    },
    {
      threshold: 0.25,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  observer.observe(section);
}

function initTeamSectionReveal() {
  const teamSection = document.querySelector(".team-section");
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

function initTeamRosterSlider() {
  const viewport = document.querySelector("[data-team-slider-viewport]");
  const track = viewport?.querySelector("[data-team-slider-track]");
  const prevButton = document.querySelector("[data-team-slider-prev]");
  const nextButton = document.querySelector("[data-team-slider-next]");
  const countLabel = document.querySelector("[data-team-slider-count]");
  const cards = track ? [...track.querySelectorAll(".ppl-card:not([hidden])")] : [];

  if (!viewport || !track || !prevButton || !nextButton || !cards.length) return;

  viewport.tabIndex = 0;

  const formatCount = (value) => String(value).padStart(2, "0");

  const getCardStep = () => {
    const sampleCard = cards[0];
    if (!sampleCard) return viewport.clientWidth;

    const trackStyles = window.getComputedStyle(track);
    const gap = parseFloat(trackStyles.columnGap || trackStyles.gap || "0");
    return sampleCard.getBoundingClientRect().width + gap;
  };

  const getActiveIndex = () => {
    const step = Math.max(getCardStep(), 1);
    return clampValue(Math.round(viewport.scrollLeft / step), 0, Math.max(cards.length - 1, 0));
  };

  const syncSliderState = () => {
    const maxScroll = Math.max(viewport.scrollWidth - viewport.clientWidth, 0);
    const activeIndex = getActiveIndex();

    prevButton.disabled = viewport.scrollLeft <= 4;
    nextButton.disabled = viewport.scrollLeft >= maxScroll - 4;

    if (countLabel) {
      countLabel.textContent = `${formatCount(activeIndex + 1)} / ${formatCount(cards.length)}`;
    }
  };

  const scrollByStep = (direction) => {
    const step = getCardStep();
    viewport.scrollBy({
      left: step * direction,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  prevButton.addEventListener("click", () => scrollByStep(-1));
  nextButton.addEventListener("click", () => scrollByStep(1));

  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByStep(-1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByStep(1);
    }
  });

  let syncFrame = 0;
  const requestSync = () => {
    if (syncFrame) return;
    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = 0;
      syncSliderState();
    });
  };

  viewport.addEventListener("scroll", requestSync, { passive: true });
  window.addEventListener("resize", requestSync);

  syncSliderState();
}

function initTeamAboutMediaFade() {
  const aboutMedia = document.querySelector(".team-about-media");
  const aboutLabel = aboutMedia?.querySelector(".team-about-label");
  const aboutImage = aboutMedia?.querySelector(".team-about-image");
  if (!aboutMedia || !aboutLabel) return;

  aboutLabel.classList.remove("is-faded");
  if (aboutImage) aboutImage.style.transform = "translate3d(0, 0%, 0) scale(1.08)";

  if (prefersReducedMotion) {
    if (aboutImage) aboutImage.style.transform = "none";
    return;
  }

  let rafId = 0;

  const renderAboutMediaParallax = () => {
    rafId = 0;
    const rect = aboutMedia.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 1;
    const progress = clampValue((viewportHeight - rect.top) / (viewportHeight + rect.height), 0, 1);
    const offsetPercent = (progress - 0.5) * 8;
    const scale = 1.12 - progress * 0.12;
    const labelOpacity = clampValue(1 - progress * 1.4, 0, 1);

    if (aboutImage) {
      aboutImage.style.transform = `translate3d(0, ${offsetPercent.toFixed(3)}%, 0) scale(${scale.toFixed(3)})`;
    }
    aboutLabel.style.opacity = labelOpacity.toFixed(3);
  };

  const requestParallaxUpdate = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(renderAboutMediaParallax);
  };

  renderAboutMediaParallax();
  window.addEventListener("scroll", requestParallaxUpdate, { passive: true });
  window.addEventListener("resize", requestParallaxUpdate);
}

function initTeamEditorialBoard() {
  const teamSection = document.querySelector(".team-section");
  const filters = teamSection ? [...teamSection.querySelectorAll("[data-team-filter]")] : [];
  const cards = teamSection ? [...teamSection.querySelectorAll(".team-editorial-card[data-team-dept]")] : [];
  const memberCount = teamSection?.querySelector("#team-members-count");
  const emptyNote = teamSection?.querySelector("#team-empty-note");
  const teamGrid = teamSection?.querySelector(".team-editorial-grid");
  if (!teamSection || !filters.length || !cards.length || !teamGrid) return;

  let activeFilter =
    filters.find((button) => button.classList.contains("is-active"))?.dataset.teamFilter || null;
  const showTimers = new WeakMap();

  const closeAllCardDetails = () => {
    cards.forEach((card) => {
      card.classList.remove("is-open");
      card.setAttribute("aria-expanded", "false");
    });
  };

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
    const noun = visibleCount === 1 ? "member" : "members";
    memberCount.hidden = false;
    memberCount.textContent = `${visibleCount} ${noun}`;
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
      card.classList.remove("is-visible", "is-hiding", "is-showing", "is-open");
      card.setAttribute("aria-expanded", "false");
      return;
    }

    card.hidden = false;
    card.classList.add("is-visible");
    card.classList.remove("is-hiding", "is-open");
    card.setAttribute("aria-expanded", "false");

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
    closeAllCardDetails();

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
    if (!card.querySelector(".team-editorial-dummy")) {
      const dummy = document.createElement("span");
      dummy.className = "team-editorial-dummy";
      dummy.setAttribute("aria-hidden", "true");
      card.prepend(dummy);
    }

    card.hidden = true;
    card.classList.remove("is-visible", "is-hiding", "is-showing", "is-open");
    card.removeAttribute("tabindex");
    card.removeAttribute("role");
    card.removeAttribute("aria-expanded");
  });

  applyFilter(activeFilter);
}

function initFooterReveal() {
  const footer = document.querySelector(".site-footer");
  if (!footer) return;

  // Footer now behaves like a normal end-of-page block to avoid premature reveal glitches.
  document.documentElement.style.setProperty("--footer-reserve", "0px");
  footer.classList.add("is-in-view", "is-interactive", "is-docked");
}

function initAboutTopOverscrollLock() {
  if (!document.documentElement.classList.contains("about-page")) return;

  let touchStartY = 0;

  document.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      touchStartY = touch.clientY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      if (window.scrollY > 0) return;
      const touch = event.touches[0];
      if (!touch) return;
      if (touch.clientY > touchStartY + 1) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  window.addEventListener(
    "wheel",
    (event) => {
      if (window.scrollY <= 0 && event.deltaY < 0) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
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
        duration: 1.2,
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

function initClientsReveal() {
  const grid = document.querySelector(".about-template-clients-grid");
  if (!grid) return;

  if (!("IntersectionObserver" in window) || prefersReducedMotion) {
    grid.classList.add("is-visible");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        grid.classList.add("is-visible");
        observer.unobserve(grid);
      });
    },
    { threshold: 0.18 }
  );

  observer.observe(grid);
}

function initClientsTitleReveal() {
  const title = document.querySelector("[data-client-title]");
  if (!title) return;

  const strips = [...title.querySelectorAll(".about-template-clients-title-strip")];
  if (!strips.length || typeof gsap === "undefined") return;

  if (prefersReducedMotion) {
    gsap.set(strips, { opacity: 1, x: 0, clearProps: "transform" });
    return;
  }

  gsap.set(strips, { opacity: 0, x: 54 });

  const revealTo = {
    opacity: 1,
    x: 0,
    duration: 1.18,
    stagger: 0.2,
    ease: "power3.out",
    clearProps: "transform",
  };

  if (hasScrollTrigger) {
    revealTo.scrollTrigger = {
      trigger: title,
      start: "top 84%",
      once: true,
    };
  }

  gsap.to(strips, revealTo);
}

function initAboutHeroSignals() {
  const signalRail = document.querySelector("[data-about-hero-signals]");
  const signalTags = signalRail ? [...signalRail.querySelectorAll("[data-about-hero-tag]")] : [];

  if (!signalRail || !signalTags.length) return;

  signalTags.forEach((tag, index) => {
    tag.style.setProperty("--about-tag-order", String(index));
    tag.tabIndex = 0;
  });

  let activeIndex = 0;
  let cycleTimer = 0;
  let isVisible = false;

  const setActiveTag = (index) => {
    signalTags.forEach((tag, tagIndex) => {
      tag.classList.toggle("is-active", tagIndex === index);
    });
  };

  const stopCycle = () => {
    if (!cycleTimer) return;
    window.clearInterval(cycleTimer);
    cycleTimer = 0;
  };

  const startCycle = () => {
    if (cycleTimer || prefersReducedMotion || signalTags.length < 2 || !isVisible) return;
    cycleTimer = window.setInterval(() => {
      activeIndex = (activeIndex + 1) % signalTags.length;
      setActiveTag(activeIndex);
    }, 1500);
  };

  const activateTag = (index) => {
    activeIndex = index;
    setActiveTag(index);
    stopCycle();
  };

  const resumeCycle = () => {
    if (!isVisible) return;
    startCycle();
  };

  setActiveTag(activeIndex);

  if (prefersReducedMotion) return;

  signalTags.forEach((tag, index) => {
    tag.addEventListener("pointerenter", () => activateTag(index));
    tag.addEventListener("focusin", () => activateTag(index));
    tag.addEventListener("pointerleave", resumeCycle);
    tag.addEventListener("focusout", (event) => {
      if (tag.contains(event.relatedTarget)) return;
      resumeCycle();
    });
  });

  if (!("IntersectionObserver" in window)) {
    isVisible = true;
    startCycle();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target !== signalRail) return;
        isVisible = entry.isIntersecting;

        if (!isVisible) {
          stopCycle();
          setActiveTag(activeIndex);
          return;
        }

        startCycle();
      });
    },
    { threshold: 0.45 }
  );

  observer.observe(signalRail);
}

function initAboutStatsExperience() {
  const aboutStatsSection = document.getElementById("about-stats");
  const aboutStatsInner = aboutStatsSection?.querySelector(".about-template-stats-inner");
  const statCards = aboutStatsInner ? [...aboutStatsInner.querySelectorAll("[data-about-stat-card]")] : [];
  const statNumbers = aboutStatsInner
    ? [...aboutStatsInner.querySelectorAll(".about-template-stat-number[data-about-count-end]")]
    : [];

  if (!aboutStatsSection || !aboutStatsInner || !statCards.length || !statNumbers.length) return;

  const activeKeys = statCards
    .map((card) => card.dataset.aboutStatCard || "")
    .filter(Boolean);

  const renderCounter = (element, value) => {
    const prefix = element.dataset.aboutCountPrefix || "";
    const suffix = element.dataset.aboutCountSuffix || "";
    element.textContent = `${prefix}${Math.round(value)}${suffix}`;
  };

  const setFinalCounters = () => {
    statNumbers.forEach((element) => {
      renderCounter(element, Number(element.dataset.aboutCountEnd || 0));
    });
  };

  let activeIndex = 0;
  let cycleTimer = 0;
  let hasPlayed = false;
  let isVisible = false;

  const setActive = (key) => {
    if (!key) return;
    aboutStatsSection.dataset.aboutActive = key;
  };

  const stopCycle = () => {
    if (!cycleTimer) return;
    window.clearInterval(cycleTimer);
    cycleTimer = 0;
  };

  const startCycle = () => {
    if (cycleTimer || prefersReducedMotion || activeKeys.length < 2) return;
    cycleTimer = window.setInterval(() => {
      activeIndex = (activeIndex + 1) % activeKeys.length;
      setActive(activeKeys[activeIndex]);
    }, 2200);
  };

  const animateCounter = (element, delay) => {
    const start = Number(element.dataset.aboutCountStart || 0);
    const end = Number(element.dataset.aboutCountEnd || 0);
    const duration = Number(element.dataset.aboutCountDuration || 1500);

    window.setTimeout(() => {
      const startTime = performance.now();
      element.classList.add("is-counting");
      renderCounter(element, start);

      const frame = (now) => {
        const progress = clampValue((now - startTime) / duration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const wobble = Math.sin(progress * Math.PI * 6) * (end - start) * 0.035 * (1 - progress);
        const value = start + (end - start) * eased + wobble;
        renderCounter(element, value);

        if (progress < 1) {
          window.requestAnimationFrame(frame);
          return;
        }

        renderCounter(element, end);
        element.classList.remove("is-counting");
      };

      window.requestAnimationFrame(frame);
    }, delay);
  };

  const playCounters = () => {
    statNumbers.forEach((element, index) => {
      animateCounter(element, index * 180);
    });
  };

  if (prefersReducedMotion) {
    setFinalCounters();
    return;
  }

  statCards.forEach((card) => {
    const key = card.dataset.aboutStatCard || "";
    if (!key) return;

    const activateCard = () => {
      activeIndex = Math.max(activeKeys.indexOf(key), 0);
      setActive(key);
      stopCycle();
    };

    const resumeCycle = () => {
      if (!isVisible) return;
      startCycle();
    };

    card.addEventListener("pointerenter", activateCard);
    card.addEventListener("focusin", activateCard);
    card.addEventListener("pointerleave", resumeCycle);
    card.addEventListener("focusout", (event) => {
      if (card.contains(event.relatedTarget)) return;
      resumeCycle();
    });
  });

  const setLiveState = (nextVisible) => {
    isVisible = nextVisible;
    aboutStatsSection.classList.toggle("is-live", nextVisible);

    if (!nextVisible) {
      stopCycle();
      setActive(activeKeys[activeIndex] || "years");
      return;
    }

    if (!hasPlayed) {
      hasPlayed = true;
      playCounters();
    }

    startCycle();
  };

  if (!("IntersectionObserver" in window)) {
    setLiveState(true);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target !== aboutStatsSection) return;
        setLiveState(entry.isIntersecting);
      });
    },
    {
      threshold: 0.35,
    }
  );

  observer.observe(aboutStatsSection);
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

function initPositioningScrollReveal() {
  const positioningSection = document.getElementById("positioning");
  const revealTargets = positioningSection
    ? [...positioningSection.querySelectorAll(".positioning-animate")]
    : [];

  if (!positioningSection || !revealTargets.length) return;

  revealTargets.forEach((item, index) => {
    item.style.setProperty("--positioning-order", String(index));
  });

  const setInView = (isInView) => {
    revealTargets.forEach((item) => item.classList.toggle("is-in-view", isInView));
  };

  if (prefersReducedMotion) {
    setInView(true);
    return;
  }

  body.classList.add("positioning-reveal-ready");

  if (!("IntersectionObserver" in window)) {
    setInView(true);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target !== positioningSection) return;
        const shouldReveal = entry.isIntersecting && entry.intersectionRatio >= 0.28;
        setInView(shouldReveal);
      });
    },
    {
      threshold: [0, 0.28, 0.5],
      rootMargin: "-8% 0px -8% 0px",
    }
  );

  observer.observe(positioningSection);
}

function initCapabilitiesGridReveal() {
  const capabilitiesSection = document.getElementById("services");
  const capabilityCards = capabilitiesSection
    ? [...capabilitiesSection.querySelectorAll(".capabilities-card")]
    : [];

  if (!capabilitiesSection || !capabilityCards.length) return;

  capabilityCards.forEach((card, index) => {
    card.style.setProperty("--cap-order", String(index));
  });

  const setInView = (isInView) => {
    capabilityCards.forEach((card) => card.classList.toggle("is-in-view", isInView));
  };

  if (prefersReducedMotion) {
    setInView(true);
    return;
  }

  body.classList.add("capabilities-reveal-ready");

  if (!("IntersectionObserver" in window)) {
    setInView(true);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target !== capabilitiesSection) return;
        const shouldReveal = entry.isIntersecting && entry.intersectionRatio >= 0.22;
        setInView(shouldReveal);
      });
    },
    {
      threshold: [0, 0.22, 0.5],
      rootMargin: "-6% 0px -6% 0px",
    }
  );

  observer.observe(capabilitiesSection);
}

function initMissionReadyParticles() {
  const missionSection = document.getElementById("mission");
  const readyWrap = missionSection?.querySelector(".mission-giant-word-wrap");
  const readyWord = readyWrap?.querySelector(".mission-slab-mark");
  const particleCanvas = readyWrap?.querySelector(".mission-ready-particles");
  if (!readyWrap || !readyWord || !particleCanvas) return;

  const ctx = particleCanvas.getContext("2d");
  if (!ctx) return;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let wrapRect = readyWrap.getBoundingClientRect();
  let rafId = 0;
  let pointerInside = false;
  let lastInteractionAt = 0;

  const orb = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    vx: 0,
    vy: 0,
  };

  let anchorX = 0;
  let anchorY = 0;

  const particles = [];
  const maxParticles = 680;

  const palette = [
    { r: 255, g: 255, b: 255, a: 0.88 },
    { r: 255, g: 255, b: 255, a: 0.62 },
    { r: 58, g: 206, b: 187, a: 0.72 },
    { r: 10, g: 31, b: 168, a: 0.68 },
  ];

  const recalcAnchor = () => {
    wrapRect = readyWrap.getBoundingClientRect();
    const wordRect = readyWord.getBoundingClientRect();
    const wordLeft = clampValue(wordRect.left - wrapRect.left, 0, wrapRect.width);
    const wordTop = clampValue(wordRect.top - wrapRect.top, 0, wrapRect.height);
    anchorX = wordLeft + wordRect.width * 0.24;
    anchorY = wordTop + wordRect.height * 0.55;

    const idleX = Math.max(22, wordLeft - Math.min(140, wrapRect.width * 0.2));
    const idleY = clampValue(wordTop + wordRect.height * 0.44, 18, wrapRect.height - 18);
    if (!Number.isFinite(orb.x) || orb.x === 0) {
      orb.x = idleX;
      orb.y = idleY;
      orb.tx = idleX;
      orb.ty = idleY;
    }
    if (!pointerInside) {
      orb.tx = idleX;
      orb.ty = idleY;
    }
  };

  const resizeCanvas = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    recalcAnchor();
    const width = Math.max(1, Math.round(wrapRect.width));
    const height = Math.max(1, Math.round(wrapRect.height));
    particleCanvas.width = Math.max(1, Math.round(width * dpr));
    particleCanvas.height = Math.max(1, Math.round(height * dpr));
    particleCanvas.style.width = `${width}px`;
    particleCanvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const startLoop = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    if (!rafId) return;
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const spawnAt = (x, y, burst = 1) => {
    const emissionCount = Math.max(1, Math.round((9 + Math.random() * 10) * burst));
    const moveAngle = Math.atan2(orb.vy, orb.vx);
    const baseAngle = Number.isFinite(moveAngle) ? moveAngle + Math.PI : Math.PI;
    const moveEnergy = Math.hypot(orb.vx, orb.vy);

    for (let i = 0; i < emissionCount; i += 1) {
      if (particles.length >= maxParticles) particles.shift();
      const color = palette[Math.floor(Math.random() * palette.length)];
      const angle = baseAngle + (Math.random() - 0.5) * 1.45;
      const speed = 0.45 + Math.random() * 2.5 + moveEnergy * 0.42;
      const lifespan = 34 + Math.random() * 54;
      const twirl = (Math.random() - 0.5) * 0.24;
      const size = 0.7 + Math.random() * 1.85;

      particles.push({
        x: x + (Math.random() - 0.5) * 2.8,
        y: y + (Math.random() - 0.5) * 2.8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.2,
        life: lifespan,
        maxLife: lifespan,
        size,
        drag: 0.965 - Math.random() * 0.012,
        twirl,
        seed: Math.random() * Math.PI * 2,
        color,
      });
    }
  };

  const emitFromPointer = (clientX, clientY, burst = 1) => {
    wrapRect = readyWrap.getBoundingClientRect();
    if (wrapRect.width <= 0 || wrapRect.height <= 0) return;
    orb.tx = clampValue(clientX - wrapRect.left, 0, wrapRect.width);
    orb.ty = clampValue(clientY - wrapRect.top, 0, wrapRect.height);
    lastInteractionAt = performance.now();
    spawnAt(orb.x || orb.tx, orb.y || orb.ty, burst);
    startLoop();
  };

  const tick = () => {
    rafId = window.requestAnimationFrame(tick);
    ctx.clearRect(0, 0, wrapRect.width, wrapRect.height);

    const now = performance.now();
    const sinceLastInteraction = now - lastInteractionAt;
    const idleDecay = clampValue(1 - sinceLastInteraction / 950, 0, 1);
    const tension = pointerInside ? 0.14 : 0.065;
    const damping = pointerInside ? 0.82 : 0.86;

    orb.vx += (orb.tx - orb.x) * tension;
    orb.vy += (orb.ty - orb.y) * tension;
    orb.vx *= damping;
    orb.vy *= damping;
    orb.x += orb.vx;
    orb.y += orb.vy;

    const streamBurst = pointerInside ? 1.28 : idleDecay * 0.72;
    if (streamBurst > 0.05) {
      spawnAt(orb.x, orb.y, streamBurst);
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= 1;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const age = particle.maxLife - particle.life;
      particle.vx += Math.sin(age * 0.07 + particle.seed) * particle.twirl;
      particle.vy += Math.cos(age * 0.06 + particle.seed) * particle.twirl * 0.55;
      particle.vx += (anchorX - particle.x) * 0.0004;
      particle.vy += (anchorY - particle.y) * 0.0003;
      particle.vy += 0.012;

      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= particle.drag;
      particle.vy *= particle.drag;

      const opacity = Math.pow(particle.life / particle.maxLife, 1.18) * particle.color.a;
      ctx.fillStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${opacity})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();

      if (
        particle.x < -24 ||
        particle.y < -24 ||
        particle.x > wrapRect.width + 24 ||
        particle.y > wrapRect.height + 24
      ) {
        particles.splice(i, 1);
      }
    }

    if (pointerInside || idleDecay > 0.02 || particles.length > 0) {
      ctx.save();
      ctx.shadowColor = "rgba(255, 255, 255, 0.72)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.arc(orb.x, orb.y, pointerInside ? 8.4 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(10, 31, 168, 0.2)";
      ctx.lineWidth = 1.25;
      ctx.arc(orb.x, orb.y, pointerInside ? 8.9 : 7.4, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (!pointerInside && idleDecay <= 0.02 && particles.length === 0 && Math.hypot(orb.vx, orb.vy) < 0.02) {
      stopLoop();
      ctx.clearRect(0, 0, wrapRect.width, wrapRect.height);
    }
  };

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  if (prefersReducedMotion) return;

  readyWrap.addEventListener("pointerenter", (event) => {
    pointerInside = true;
    emitFromPointer(event.clientX, event.clientY, 2.2);
  });

  readyWrap.addEventListener("pointermove", (event) => {
    pointerInside = true;
    emitFromPointer(event.clientX, event.clientY, 1);
  });

  readyWrap.addEventListener("pointerleave", () => {
    pointerInside = false;
    recalcAnchor();
  });

  readyWrap.addEventListener("pointercancel", () => {
    pointerInside = false;
    recalcAnchor();
  });

  readyWrap.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      pointerInside = true;
      emitFromPointer(touch.clientX, touch.clientY, 1.2);
    },
    { passive: true }
  );

  readyWrap.addEventListener("touchend", () => {
    pointerInside = false;
    recalcAnchor();
  });

  readyWrap.addEventListener("touchcancel", () => {
    pointerInside = false;
    recalcAnchor();
  });
}

function ensureRefreshStartsAtHome() {
  const homeSection = document.getElementById("home");
  if (!homeSection) return;

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
initPreloader();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPreloader, { once: true });
}

ensureBuildVersionFreshness();
ensureRefreshStartsAtHome();
setHeaderState();
initPageLoadTransitionReveal();
initHomePreloaderBypassLinks();
initMenu();
initNavSpy();
initSectionTransitions();
initHeroMedia();
body.classList.add("motion-ready");
initGsapMotion();
initNativeScrollEffects();
initMissionReadyParticles();
initDifferenceCanvas();
if (!document.querySelector("#difference .difference-v2-page")) {
  initDifferenceMainCounter();
  initDifferencePointerParticle();
}
initPositioningScrollReveal();
initCapabilitiesGridReveal();
initServicesSummaryCards();
initServicesScrollReveal();
initSolutionsSelection();
initCapabilitiesPage();
initCapabilitiesExportMotion();
initCapabilitiesExportFilters();
initProcessTriadCircles();
initProcessFlowReveal();
initTeamRosterSlider();
initTeamAboutMediaFade();
initTeamEditorialBoard();
initTeamSectionReveal();
initFooterReveal();
initAboutTopOverscrollLock();
initCounters();
initAboutHeroSignals();
initAboutStatsExperience();
initClientsTitleReveal();
initClientsReveal();

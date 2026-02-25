const body = document.body;
body.classList.add("has-js");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  const isLightPanel = sectionAtProbe.classList.contains("panel-light");
  header.classList.toggle("is-on-light", isLightPanel);
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

function smoothScrollTo(target) {
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function instantScrollTo(target) {
  if (!target) return;
  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  target.scrollIntoView({ behavior: "auto", block: "start" });
  root.style.scrollBehavior = previousBehavior;
}

function formatTransitionLabel(rawLabel, targetId) {
  if (rawLabel && rawLabel.trim()) return rawLabel.trim().toUpperCase();
  if (targetId && targetId.trim()) return targetId.trim().replace(/[-_]/g, " ").toUpperCase();
  return "NAVIGATING";
}

function runSectionTransition(target, label) {
  if (!target) return;

  const headerOffset = (header?.offsetHeight || 0) + 24;
  const targetTop = target.getBoundingClientRect().top;
  if (targetTop >= -24 && targetTop <= headerOffset) {
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

  const heroTimeline = gsap.timeline({ delay: 0.12 });
  heroTimeline
    .from(".hero-title-line", {
      yPercent: 118,
      opacity: 0,
      duration: 0.96,
      ease: "power4.out",
      stagger: 0.12,
    })
    .from(
      ".hero-subtitle",
      {
        y: 30,
        opacity: 0,
        duration: 0.64,
        ease: "power2.out",
      },
      0.18
    );

  const panels = gsap.utils.toArray(".panel");
  if (hasScrollTrigger) {
    panels.forEach((panel) => {
      if (panel.id === "home") return;
      gsap.from(panel, {
        y: 92,
        opacity: 0,
        scale: 0.985,
        duration: 0.9,
        ease: "power2.out",
        clearProps: "opacity,transform",
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

    const effect = item.dataset.reveal || "fade-up";
    const from = { opacity: 0, y: 34, x: 0, scale: 1 };

    if (effect === "fade-left") from.x = -48;
    if (effect === "fade-right") from.x = 48;
    if (effect === "zoom") {
      from.y = 0;
      from.scale = 0.87;
    }

    const revealTo = {
      opacity: 1,
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
  const servicesSection = document.getElementById("services");
  const serviceCards = [...document.querySelectorAll("#services .service-card")];

  if (!homeSection && !missionSection && !differenceSection && !servicesSection) return;

  const applyDefaults = (forReducedMotion = false) => {
    if (homeSection) homeSection.style.setProperty("--hero-scroll-p", "0");
    if (missionSection)
      missionSection.style.setProperty("--mission-progress", forReducedMotion ? "1" : "0");
    if (differenceSection)
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

    if (missionSection) {
      const missionRect = missionSection.getBoundingClientRect();
      const visibleMissionPx =
        Math.min(missionRect.bottom, viewportHeight) - Math.max(missionRect.top, 0);
      const missionVisibleRatio = clampValue(
        visibleMissionPx / Math.max(Math.min(missionRect.height, viewportHeight), 1),
        0,
        1
      );
      const missionProgress = easeInOutCubic(missionVisibleRatio);
      missionSection.style.setProperty("--mission-progress", missionProgress.toFixed(4));
      const missionCenter = missionRect.top + missionRect.height * 0.5;
      const missionCenterOffset = clampValue(
        (viewportHeight * 0.52 - missionCenter) / viewportHeight,
        -1,
        1
      );
      const missionY = missionCenterOffset * -52;
      const missionScale = 0.9 + missionProgress * 0.16;

      if (missionMark) {
        missionMark.style.setProperty("--mission-mark-y", `${missionY.toFixed(2)}px`);
        missionMark.style.setProperty("--mission-mark-scale", missionScale.toFixed(4));
      }
    }

    if (differenceSection) {
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
      const isProcessSection = servicesSection.classList.contains("process-section");
      const servicesRect = servicesSection.getBoundingClientRect();
      const servicesInActiveRange =
        servicesRect.top < viewportHeight * 1.15 && servicesRect.bottom > -viewportHeight * 0.2;

      if (!servicesInActiveRange) {
        if (!servicesCardsReset) {
          servicesSection.style.setProperty("--services-scroll-p", "0");
          serviceCards.forEach((card) => {
            card.style.setProperty("--card-y", "0px");
            card.style.setProperty("--card-rot", "0deg");
            card.style.setProperty("--card-scale", "1");
            card.style.setProperty("--card-opacity", "1");
          });
          servicesCardsReset = true;
        }
        return;
      }

      servicesCardsReset = false;
      const servicesProgress = clampValue(
        (viewportHeight - servicesRect.top) / (servicesRect.height + viewportHeight),
        0,
        1
      );

      servicesSection.style.setProperty("--services-scroll-p", servicesProgress.toFixed(4));

      serviceCards.forEach((card, index) => {
        const cardRect = card.getBoundingClientRect();
        const cardCenter = cardRect.top + cardRect.height * 0.5;
        const centerOffset = Math.abs(cardCenter - viewportHeight * 0.54);
        const centerReveal = clampValue(1 - centerOffset / (viewportHeight * 0.62), 0, 1);
        const edgeReveal = clampValue(
          (Math.min(cardRect.bottom, viewportHeight) - Math.max(cardRect.top, 0)) / Math.max(cardRect.height, 1),
          0,
          1
        );
        const cardProgress = clampValue(Math.min(1, centerReveal * 0.68 + edgeReveal * 0.52), 0, 1);
        const lane = (index % 3) - 1;
        const driftDirection = index % 2 === 0 ? 1 : -1;
        const drift = (servicesProgress - 0.5) * (isProcessSection ? 9 : 16) * driftDirection;
        const direction = cardCenter > viewportHeight * 0.54 ? 1 : -1;
        const travelBase = isProcessSection ? 40 : 58;
        const rotationBase = isProcessSection ? 2.4 : 6.8;
        const y = direction * (1 - cardProgress) * (travelBase + Math.abs(lane) * 10) + drift;
        const rotation = direction * (1 - cardProgress) * (rotationBase * driftDirection) + lane * 0.6;
        const scale = (isProcessSection ? 0.9 : 0.84) + cardProgress * (isProcessSection ? 0.1 : 0.16);
        const opacity = isProcessSection ? 1 : 0.16 + cardProgress * 0.84;

        card.style.setProperty("--card-y", `${y.toFixed(2)}px`);
        card.style.setProperty("--card-rot", `${rotation.toFixed(2)}deg`);
        card.style.setProperty("--card-scale", scale.toFixed(3));
        card.style.setProperty("--card-opacity", opacity.toFixed(3));
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
  const servicesHead = document.querySelector("#services .process-intro");
  const serviceCards = [...document.querySelectorAll("#services .process-card")];

  if (servicesHead) servicesHead.classList.add("is-in-view");
  if (!servicesSection || !serviceCards.length) return;

  if (prefersReducedMotion || !window.gsap || !window.ScrollTrigger) {
    serviceCards.forEach((card) => {
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
      y: 132,
      scale: 0.84,
    });
    gsap.to(serviceCards, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 1.6,
      stagger: 0.36,
      ease: "power3.out",
      clearProps: "opacity,transform",
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

function initAboutOverlapCircles() {
  const stage = document.querySelector("#about .about-overlap-stage");
  const circles = document.querySelector("#about .overlap-circles");
  const leftOutline = document.getElementById("overlap-left-outline");
  const rightOutline = document.getElementById("overlap-right-outline");
  const clipRight = document.getElementById("overlap-clip-right");
  const intersection = document.getElementById("overlap-intersection");
  const leftLabel = document.getElementById("overlap-label-left");
  const rightLabel = document.getElementById("overlap-label-right");

  if (
    !stage ||
    !circles ||
    !leftOutline ||
    !rightOutline ||
    !clipRight ||
    !intersection ||
    !leftLabel ||
    !rightLabel
  ) {
    return;
  }

  const geometry = {
    midX: 500,
    midY: 240,
    radius: 170,
    startDistance: 460,
    endDistance: 300,
    durationMs: 4200,
  };

  const setDistance = (distance) => {
    const half = distance / 2;
    const leftX = geometry.midX - half;
    const rightX = geometry.midX + half;

    leftOutline.setAttribute("cx", String(leftX));
    intersection.setAttribute("cx", String(leftX));
    leftLabel.setAttribute("x", String(leftX));

    rightOutline.setAttribute("cx", String(rightX));
    clipRight.setAttribute("cx", String(rightX));
    rightLabel.setAttribute("x", String(rightX));

    const overlapWidth = Math.max(0, geometry.radius * 2 - distance);
    intersection.style.opacity = overlapWidth > 0 ? "1" : "0";
  };

  let rafId = 0;
  let sequenceId = 0;

  const resetToSeparated = () => {
    sequenceId += 1;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    setDistance(geometry.startDistance);
  };

  const runMerge = () => {
    sequenceId += 1;
    const currentSequenceId = sequenceId;
    setDistance(geometry.startDistance);

    if (prefersReducedMotion) {
      setDistance(geometry.endDistance);
      intersection.style.opacity = "1";
      return;
    }

    const easeOutCubic = (t) => 1 - (1 - t) ** 3;
    const startedAt = performance.now();

    const tick = (now) => {
      if (currentSequenceId !== sequenceId) return;
      const elapsed = now - startedAt;
      const t = Math.min(1, elapsed / geometry.durationMs);
      const eased = easeOutCubic(t);
      const nextDistance =
        geometry.startDistance - (geometry.startDistance - geometry.endDistance) * eased;

      setDistance(nextDistance);

      if (t < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        setDistance(geometry.endDistance);
        intersection.style.opacity = "1";
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

function initZoomStorySequence() {
  const section = document.getElementById("zoom-story");
  const track = section?.querySelector(".zoom-story-track");
  const frame = section?.querySelector(".zoom-story-frame");
  const image = section?.querySelector(".zoom-story-image");
  const prompt = section?.querySelector(".zoom-story-prompt");
  const lineH1 = section?.querySelector(".zoom-line-h1");
  const lineH2 = section?.querySelector(".zoom-line-h2");
  const lineH3 = section?.querySelector(".zoom-line-h3");
  const lineV1 = section?.querySelector(".zoom-line-v1");
  const lineV2 = section?.querySelector(".zoom-line-v2");

  if (!section || !track || !frame || !image || !lineH1 || !lineH2 || !lineH3 || !lineV1 || !lineV2) {
    return;
  }

  if (prefersReducedMotion || !window.gsap || !window.ScrollTrigger) {
    frame.style.opacity = "1";
    frame.style.transform = "none";
    image.style.transform = "scale(1.05)";
    if (prompt) {
      prompt.style.opacity = "1";
      prompt.style.transform = "translate(-50%, -50%) scale(1)";
    }
    [lineH1, lineH2, lineH3].forEach((line) => {
      line.style.opacity = "1";
      line.style.transform = "scaleX(1)";
    });
    [lineV1, lineV2].forEach((line) => {
      line.style.opacity = "1";
      line.style.transform = "scaleY(1)";
    });
    return;
  }

  const gsap = window.gsap;

  gsap.set(frame, {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    borderRadius: 18,
  });

  gsap.set([lineH1, lineH2, lineH3], {
    autoAlpha: 0,
    scaleX: 0,
    transformOrigin: "left center",
  });

  gsap.set([lineV1, lineV2], {
    autoAlpha: 0,
    scaleY: 0,
  });

  gsap.set(lineV1, { transformOrigin: "bottom center" });
  gsap.set(lineV2, { transformOrigin: "top center" });
  gsap.set(image, { scale: 1.02 });
  if (prompt) {
    gsap.set(prompt, { autoAlpha: 0, scale: 0.72, xPercent: -50, yPercent: -50 });
  }

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: track,
      start: "top top",
      end: "bottom bottom",
      scrub: 1.05,
      invalidateOnRefresh: true,
    },
  });

  tl.to(
    [lineH1, lineH2],
    {
      autoAlpha: 1,
      scaleX: 1,
      duration: 0.18,
      stagger: 0.04,
      ease: "none",
    },
    0.04
  )
    .to(
      lineH3,
      {
        autoAlpha: 1,
        scaleX: 1,
        duration: 0.14,
        ease: "none",
      },
      0.14
    )
    .to(
      lineV1,
      {
        autoAlpha: 1,
        scaleY: 1,
        duration: 0.15,
        ease: "none",
      },
      0.1
    )
    .to(
      lineV2,
      {
        autoAlpha: 1,
        scaleY: 1,
        duration: 0.15,
        ease: "none",
      },
      0.18
    )
    .to(
      image,
      {
        scale: 1.02,
        duration: 0.2,
        ease: "none",
      },
      0.45
    )
    .to(
      image,
      {
        scale: 1.28,
        duration: 0.2,
        ease: "none",
      },
      0.66
    )
    .to(
      image,
      {
        scale: 1.72,
        duration: 0.2,
        ease: "none",
      },
      0.84
    )
    .to(
      frame,
      {
        borderRadius: 2,
        duration: 0.16,
        ease: "none",
      },
      0.84
    );

  if (prompt) {
    tl.to(
      prompt,
      {
        autoAlpha: 1,
        scale: 1.32,
        duration: 0.2,
        ease: "none",
      },
      0.84
    );
  }
}

function initTeamSectionReveal() {
  const teamSection = document.getElementById("team");
  const revealTargets = [...document.querySelectorAll(".team-reveal-target")];
  const orderedItems = [
    ...document.querySelectorAll(".team-dept.team-reveal-target"),
    ...document.querySelectorAll(".team-member-card.team-reveal-target"),
  ];
  const teamIntroItems = teamSection
    ? [...teamSection.querySelectorAll(".team-intro-strip, .team-intro-copy")]
    : [];
  const departments = teamSection ? [...teamSection.querySelectorAll(".team-dept")] : [];

  if (!revealTargets.length) return;

  orderedItems.forEach((item, index) => {
    item.style.setProperty("--team-order", String(index % 10));
  });

  if (prefersReducedMotion) {
    revealTargets.forEach((item) => item.classList.add("is-in-view"));
    return;
  }

  // Never render a blank team section before motion hooks kick in.
  revealTargets.forEach((item) => item.classList.add("is-in-view"));
  body.classList.add("team-reveal-ready");

  if (window.gsap && window.ScrollTrigger && teamSection) {
    const gsap = window.gsap;

    let sectionAnimated = false;

    const playSectionReveal = () => {
      if (sectionAnimated) return;
      sectionAnimated = true;

      gsap.fromTo(
        teamIntroItems,
        { autoAlpha: 0, y: 42 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.86,
          stagger: 0.12,
          ease: "power3.out",
          overwrite: "auto",
        }
      );

      gsap.fromTo(
        departments,
        { autoAlpha: 0, y: 54, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.76,
          stagger: 0.12,
          ease: "power3.out",
          overwrite: "auto",
        }
      );
    };

    const revealDepartmentCards = (dept) => {
      const members = [...dept.querySelectorAll(".team-member-card")];
      if (!members.length) return;

      gsap.fromTo(
        members,
        { autoAlpha: 0, y: 22 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.48,
          stagger: 0.06,
          ease: "power2.out",
          overwrite: "auto",
        }
      );
    };

    departments.forEach((dept) => {
      dept.addEventListener("team:dept-toggle", (event) => {
        const isOpen = Boolean(event.detail?.isOpen);
        if (isOpen) {
          revealDepartmentCards(dept);
        }
      });
    });

    const revealCurrentOpenDepartment = () => {
      const openDept = departments.find((dept) => dept.classList.contains("is-open"));
      if (!openDept) return;
      revealDepartmentCards(openDept);
    };

    window.ScrollTrigger.create({
      trigger: teamSection,
      start: "top 72%",
      once: true,
      onEnter: () => {
        playSectionReveal();
        revealCurrentOpenDepartment();
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
      threshold: 0.05,
      rootMargin: "0px 0px -5% 0px",
    }
  );

  revealTargets.forEach((item) => observer.observe(item));

  // Safety: never leave section invisible if observer is delayed.
  window.setTimeout(() => {
    revealTargets.forEach((item) => item.classList.add("is-in-view"));
  }, 1200);
}

function initTeamDepartmentAccordions() {
  const departments = [...document.querySelectorAll(".team-dept")];
  if (!departments.length) return;

  const getBody = (dept) => dept.querySelector(".team-dept-body");
  const getToggle = (dept) => dept.querySelector(".team-dept-toggle");

  const applyState = (dept, isOpen) => {
    const body = getBody(dept);
    const toggle = getToggle(dept);
    if (!body || !toggle) return;
    const wasOpen = dept.classList.contains("is-open");

    dept.classList.toggle("is-open", isOpen);
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    body.style.maxHeight = isOpen ? `${body.scrollHeight}px` : "0px";

    if (wasOpen !== isOpen) {
      dept.dispatchEvent(
        new CustomEvent("team:dept-toggle", {
          detail: { isOpen },
        })
      );
    }
  };

  const openOnly = (targetDept) => {
    departments.forEach((dept) => applyState(dept, dept === targetDept));
  };

  departments.forEach((dept, index) => {
    const toggle = getToggle(dept);
    if (!toggle) return;

    if (index === 0 || dept.classList.contains("is-open")) {
      applyState(dept, true);
    } else {
      applyState(dept, false);
    }

    toggle.addEventListener("click", () => openOnly(dept));
  });

  window.addEventListener("resize", () => {
    departments.forEach((dept) => {
      if (!dept.classList.contains("is-open")) return;
      const body = getBody(dept);
      if (!body) return;
      body.style.maxHeight = `${body.scrollHeight}px`;
    });
  });
}

function initTeamMemberCount() {
  const countTargets = [...document.querySelectorAll("[data-team-count]")];
  const memberItems = [...document.querySelectorAll("[data-member-name]")];
  if (!countTargets.length || !memberItems.length) return;

  const applyCount = () => {
    const uniqueNames = new Set();

    memberItems.forEach((item) => {
      const rawName = item.getAttribute("data-member-name");
      const name = rawName ? rawName.trim() : "";
      if (!name) return;
      uniqueNames.add(name.toLowerCase());
    });

    const count = String(uniqueNames.size);
    countTargets.forEach((target) => {
      target.textContent = count;
    });
  };

  applyCount();
  window.addEventListener("resize", applyCount);
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

ensureRefreshStartsAtHome();
setHeaderState();
initMenu();
initNavSpy();
initSectionTransitions();
initHeroMedia();
body.classList.add("motion-ready");
initGsapMotion();
initNativeScrollEffects();
initServicesScrollReveal();
initAboutOverlapCircles();
initZoomStorySequence();
initTeamSectionReveal();
initTeamMemberCount();
initTeamDepartmentAccordions();
initCounters();

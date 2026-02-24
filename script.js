const body = document.body;
body.classList.add("has-js");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

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

function closeMenu() {
  if (!siteNav || !menuToggle) return;
  siteNav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}

function finishPreloader() {
  if (!preloader) {
    body.classList.remove("is-loading");
    return;
  }

  preloader.classList.add("is-hidden");
  body.classList.remove("is-loading");
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

function setHeaderState() {
  if (!header) return;
  header.classList.toggle("is-solid", window.scrollY > 20);
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

function formatTransitionLabel(rawLabel, targetId) {
  if (rawLabel && rawLabel.trim()) return rawLabel.trim().toUpperCase();
  if (targetId && targetId.trim()) return targetId.trim().replace(/[-_]/g, " ").toUpperCase();
  return "NAVIGATING";
}

function runSectionTransition(target, label) {
  if (!target) return;

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
    target.scrollIntoView({ behavior: "auto", block: "start" });
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

function initSwiperSlider() {
  if (!window.Swiper || !document.querySelector(".showcase-swiper")) return;

  new window.Swiper(".showcase-swiper", {
    loop: true,
    speed: 900,
    grabCursor: true,
    centeredSlides: true,
    slidesPerView: 1.08,
    spaceBetween: 14,
    effect: "creative",
    creativeEffect: {
      limitProgress: 2,
      prev: {
        translate: ["-106%", 0, -160],
        rotate: [0, 0, -7],
        opacity: 0.56,
      },
      next: {
        translate: ["106%", 0, -160],
        rotate: [0, 0, 7],
        opacity: 0.56,
      },
    },
    autoplay: prefersReducedMotion
      ? false
      : {
          delay: 2400,
          disableOnInteraction: false,
        },
    navigation: {
      prevEl: ".showcase-prev",
      nextEl: ".showcase-next",
    },
    pagination: {
      el: ".showcase-pagination",
      clickable: true,
    },
    breakpoints: {
      720: {
        slidesPerView: 1.35,
        spaceBetween: 18,
      },
      1080: {
        slidesPerView: 1.8,
        spaceBetween: 20,
      },
    },
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
      ".hero-kicker, .hero-subtitle, .hero-actions",
      {
        y: 30,
        opacity: 0,
        duration: 0.64,
        ease: "power2.out",
        stagger: 0.1,
      },
      0.18
    )
    .from(
      ".hero-logo-stage",
      {
        scale: 0.82,
        opacity: 0,
        duration: 0.86,
        ease: "power3.out",
      },
      0.24
    )
    .from(
      ".hero-card",
      {
        y: 36,
        opacity: 0,
        duration: 0.58,
        ease: "power2.out",
        stagger: 0.1,
      },
      0.46
    );

  if (hasScrollTrigger) {
    const heroScrollTl = gsap.timeline({
      scrollTrigger: {
        trigger: "#home",
        start: "top top",
        end: "bottom top",
        scrub: 1.05,
      },
    });

    heroScrollTl
      .to(
        ".hero-title",
        {
          xPercent: -12,
          yPercent: -18,
          scale: 0.76,
          rotate: -2,
          opacity: 0.22,
          ease: "none",
        },
        0
      )
      .to(
        ".hero-kicker, .hero-subtitle, .hero-actions",
        {
          y: 72,
          opacity: 0,
          ease: "none",
        },
        0
      )
      .to(
        ".hero-bg-image-a",
        {
          scale: 1.22,
          yPercent: 11,
          ease: "none",
        },
        0
      )
      .to(
        ".hero-bg-image-b",
        {
          scale: 1.26,
          yPercent: -8,
          opacity: 0.52,
          ease: "none",
        },
        0
      );
  }

  const panels = gsap.utils.toArray(".panel");
  if (hasScrollTrigger) {
    panels.forEach((panel) => {
      if (panel.id === "home") return;
      gsap.from(panel, {
        y: 110,
        opacity: 0,
        clipPath: "inset(10% 0 10% 0 round 30px)",
        duration: 1.04,
        ease: "power3.out",
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

  if (supportsFinePointer) {
    const hero = document.getElementById("home");
    const cardNodes = [...document.querySelectorAll(".hero-card")];
    if (hero && cardNodes.length) {
      hero.addEventListener("pointermove", (event) => {
        const x = (event.clientX / window.innerWidth - 0.5) * 2;
        const y = (event.clientY / window.innerHeight - 0.5) * 2;

        cardNodes.forEach((card, index) => {
          const depth = (index + 1) * 6;
          gsap.to(card, {
            x: x * depth,
            y: y * depth,
            duration: 0.35,
            ease: "power2.out",
            overwrite: true,
          });
        });
      });

      hero.addEventListener("pointerleave", () => {
        cardNodes.forEach((card) => {
          gsap.to(card, {
            x: 0,
            y: 0,
            duration: 0.5,
            ease: "power3.out",
            overwrite: true,
          });
        });
      });
    }
  }
}

function initNativeScrollEffects() {
  const homeSection = document.getElementById("home");
  const servicesSection = document.getElementById("services");
  const serviceCards = [...document.querySelectorAll("#services .service-card")];

  if (!homeSection && !servicesSection) return;

  const applyDefaults = () => {
    if (homeSection) homeSection.style.setProperty("--hero-scroll-p", "0");
    if (servicesSection) servicesSection.style.setProperty("--services-scroll-p", "0");
    serviceCards.forEach((card) => {
      card.style.setProperty("--card-y", "0px");
      card.style.setProperty("--card-rot", "0deg");
      card.style.setProperty("--card-scale", "1");
      card.style.setProperty("--card-opacity", "1");
    });
  };

  if (prefersReducedMotion) {
    applyDefaults();
    return;
  }

  let ticking = false;

  const render = () => {
    ticking = false;
    const viewportHeight = window.innerHeight || 1;

    if (homeSection) {
      const homeRect = homeSection.getBoundingClientRect();
      const travel = Math.max(homeRect.height - viewportHeight * 0.36, 1);
      const heroProgress = clampValue((-homeRect.top) / travel, 0, 1);
      homeSection.style.setProperty("--hero-scroll-p", heroProgress.toFixed(4));
    }

    if (servicesSection && serviceCards.length) {
      const servicesRect = servicesSection.getBoundingClientRect();
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
        const drift = (servicesProgress - 0.5) * 16 * driftDirection;
        const direction = cardCenter > viewportHeight * 0.54 ? 1 : -1;
        const y = direction * (1 - cardProgress) * (58 + Math.abs(lane) * 14) + drift;
        const rotation = direction * (1 - cardProgress) * (6.8 * driftDirection) + lane * 0.9;
        const scale = 0.84 + cardProgress * 0.16;
        const opacity = 0.16 + cardProgress * 0.84;

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
  const servicesHead = document.querySelector("#services .section-head");
  const serviceCards = [...document.querySelectorAll("#services .service-card")];
  const revealTargets = [servicesHead, ...serviceCards].filter(Boolean);

  if (!revealTargets.length) return;

  serviceCards.forEach((card, index) => {
    card.style.setProperty("--card-order", String(index));
  });

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach((item) => item.classList.add("is-in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-in-view", entry.isIntersecting);
      });
    },
    {
      threshold: 0.24,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  revealTargets.forEach((item) => observer.observe(item));
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

window.addEventListener("scroll", setHeaderState, { passive: true });
window.addEventListener("resize", setHeaderState);
window.addEventListener("load", initPreloader);

setHeaderState();
initMenu();
initNavSpy();
initSectionTransitions();
initSwiperSlider();
initGsapMotion();
initNativeScrollEffects();
initServicesScrollReveal();
initCounters();

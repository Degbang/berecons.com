# Berecons.com Copilot Instructions

## Project Overview
Berecons.com is a corporate portfolio website showcasing research, strategy, business, content, project, and IT/Web services. The site features smooth scrolling navigation, sophisticated animations powered by GSAP, and a complex reveal system for content visibility.

## Architecture

### Core Patterns
- **Vanilla JS** with no build step: Single `script.js` (889 lines) handles all interactivity
- **Accessibility-first**: ARIA labels, semantic HTML, reduced-motion preferences respected globally
- **Progressive enhancement**: GSAP animations optional; fallbacks work without external libs
- **Data-driven attributes**: HTML uses `data-*` attributes extensively; JS queries these to wire behavior

### Key Modules (in execution order)
1. **`initPreloader()`**: GSAP timeline animates preloader progress; respects `prefers-reduced-motion`
2. **`initMenu()`**: Mobile hamburger toggle with click-outside close and responsive resize handling
3. **`initNavSpy()`**: IntersectionObserver tracks section visibility; updates active nav link & header theme
4. **`initSectionTransitions()`**: Complex GSAP timeline with staggered column reveal for section navigation
5. **`initGsapMotion()`**: Hero timeline, scroll-triggered parallax, element reveals with fallbacks
6. **`initNativeScrollEffects()`**: Scroll-based CSS variable updates for non-JS transforms (hero parallax, service cards drift)
7. **`initAboutOverlapCircles()`**: Complex easing progression for overlapping circle animations
8. **`initTeamSectionReveal()`**: IntersectionObserver reveals team cards with stagger ordering
9. **`initCounters()`**: Animates stat numbers via GSAP snap or fallback timers

## Critical Conventions

### Data Attributes (HTML Integration)
- `[data-reveal]`: Element should animate on scroll (values: "fade-up", "fade-left", "fade-right", "zoom")
- `[data-transition-link]`: Enables fancy section transitions (requires `href="#sectionId"`)
- `[data-transition-label]`: Custom text for transition overlay (falls back to section ID)
- `[data-count]`: Number to animate (used in stat counters)
- `[data-member-name]`: Unique team member identifier (used to count distinct members)
- `[data-team-count]`: Target element for injected team count (multiple uses OK)
- `[data-profile-link]`: Team member LinkedIn/profile URL (creates external link in `.team-row-link`)

### CSS Variables (Scroll Sync)
- `--hero-scroll-p`: Hero section scroll progress (0-1)
- `--about-zoom`, `--about-y`: About media parallax values
- `--services-scroll-p`: Services section progress
- `--card-y`, `--card-rot`, `--card-scale`, `--card-opacity`: Service card transforms
- `--card-order`: CSS order property for stagger
- `--overlap-left-shift`, `--overlap-right-shift`: Circle separation
- `--overlap-core-scale`, `--overlap-core-opacity`: Core animation state
- `--team-order`: Team row stagger index

### Accessibility Patterns
- Header theme (`is-on-light` class) syncs to section under probe point
- Mobile menu auto-closes on nav link click or resize > 860px
- Reduced motion preference disables all GSAP animations; CSS fallbacks render instantly
- Preloader checks `window.gsap` before using (graceful degradation)
- IntersectionObserver used as primary reveal mechanism; timer fallback for unsupported browsers

## Common Modifications

### Adding New Animated Elements
1. Add `data-reveal="[effect]"` to HTML
2. No JS changes needed; `initGsapMotion()` handles via query selector
3. Use existing effects or add new ones in easing branch

### Adding Team Members
1. Create `<article class="team-row team-reveal-target" data-member-name="Full Name">`
2. Populate `.team-row-role`, `.team-row-name`, `.team-row-link`
3. Set `data-profile-link` attribute; `initTeamProfileLinks()` auto-creates link
4. `initTeamMemberCount()` automatically increments unique member count

### Adjusting Animation Timings
- Hero timeline: `duration: 0.96`, stagger: `0.12` (lines 328-355)
- Service card reveals: `duration: 0.82` (line 424)
- Transition overlay: `duration: 0.56` for panel rise, `0.6` for fall (lines 224-250)
- Counters: `duration: 1.4` (line 752)

## External Dependencies
- **GSAP 3.12.5** + **ScrollTrigger**: From CDN (lines 3-4 in HTML)
- **Swiper 11**: Showcase slider from CDN (lines 1-2 in HTML); auto-configured at 720px/1080px breakpoints
- **Lato font**: Google Fonts preconnect (lines 6-10 in HTML)

## Performance Notes
- Scroll events use `requestAnimationFrame` with debounce flag to avoid jank
- `passive: true` listeners on scroll/resize events
- ScrollTrigger automates scroll listener optimization
- Hero parallax effect only runs if `supportsFinePointer` (hover + fine pointer device)
- Team count calculation uses `Set` for uniqueness; runs on init + resize

## Debugging Tips
1. Check `window.gsap` and `window.ScrollTrigger` availability (conditional logs will help)
2. Verify `data-*` attributes exist on elements before JS runs
3. Use browser DevTools to inspect computed CSS variables during scroll
4. Test with `prefers-reduced-motion: reduce` in DevTools to validate fallbacks
5. Team count mismatch? Check for trimming inconsistencies in `data-member-name` values

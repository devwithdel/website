document.addEventListener("DOMContentLoaded", () => {
  const renderIcons = () => {
    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  };
  renderIcons();

  const cursorDot = document.querySelector(".cursor-dot");
  if (cursorDot && window.matchMedia("(pointer: fine)").matches) {
    let cursorX = -20;
    let cursorY = -20;
    let cursorFrame;
    const moveCursor = () => {
      cursorDot.style.left = `${cursorX}px`;
      cursorDot.style.top = `${cursorY}px`;
      cursorFrame = null;
    };
    document.addEventListener("mousemove", (event) => {
      cursorX = event.clientX;
      cursorY = event.clientY;
      cursorDot.classList.add("is-active");
      document.body.classList.add("custom-cursor-on");
      if (!cursorFrame) cursorFrame = requestAnimationFrame(moveCursor);
    }, { passive: true });
    document.addEventListener("mouseleave", () => {
      cursorDot.classList.remove("is-active");
      document.body.classList.remove("custom-cursor-on");
    });
  }

  // Motion (vanilla) adds restrained, progressive-enhancement interactions.
  // The page remains fully usable if the CDN is unavailable or motion is reduced.
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReducedMotion) {
    import("https://cdn.jsdelivr.net/npm/motion@latest/+esm")
      .then(({ animate, inView }) => {
        const heroElements = [
          ".hero-content .eyebrow",
          ".hero-content h1",
          ".hero-role",
          ".hero-desc",
          ".hero-actions",
        ];

        heroElements.forEach((selector, index) => {
          const element = document.querySelector(selector);
          if (!element) return;
          animate(
            element,
            { opacity: [0, 1], y: [12, 0] },
            { duration: 0.45, delay: index * 0.06, easing: "ease-out" }
          );
        });

        const revealSelectors = [
          ".section-intro",
          ".about-grid > *",
          ".project-card",
          ".tech-pill",
          ".edu-item",
          ".pricing-card",
          ".cert-note",
          ".contact-grid--split > *",
        ];

        revealSelectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((element, index) => {
            element.style.opacity = "0";
            element.style.transform = "translateY(10px)";
            inView(
              element,
              () => {
                const animation = animate(
                  element,
                  { opacity: [0, 1], y: [10, 0] },
                  { duration: 0.38, delay: Math.min(index * 0.035, 0.14), easing: "ease-out" }
                );
                animation.finished?.then(() => element.style.removeProperty("transform"));
              },
              { amount: 0.12 }
            );
          });
        });
      })
      .catch(() => {
        // Motion is optional; no functionality depends on it.
      });
  }

  const themeOptions = Array.from(document.querySelectorAll("[data-theme]"));
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

  const getSavedTheme = () => {
    try {
      const saved = localStorage.getItem("theme");
      return saved === "dark" || saved === "light" || saved === "system" ? saved : "system";
    } catch (error) {
      return "system";
    }
  };

  const isDarkTheme = (theme) => theme === "dark" || (theme === "system" && systemTheme.matches);

  const syncThemeOptions = (theme) => {
    themeOptions.forEach((option) => {
      option.classList.toggle("is-active", option.dataset.theme === theme);
    });
  };

  let themeAnimationTimer;
  let themeTransitioning = false;
  const applyTheme = (theme, { animateFallback = false } = {}) => {
    const isDark = isDarkTheme(theme);
    if (animateFallback) {
      document.documentElement.classList.add("theme-anim");
      window.clearTimeout(themeAnimationTimer);
      themeAnimationTimer = window.setTimeout(() => document.documentElement.classList.remove("theme-anim"), 460);
    }
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    syncThemeOptions(theme);
    try { localStorage.setItem("theme", theme); } catch (error) {}
  };

  const revealTheme = (theme, event) => {
    const x = event?.clientX ?? window.innerWidth;
    const y = event?.clientY ?? window.innerHeight;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = document.startViewTransition(() => applyTheme(theme));
    transition.finished.finally(() => { themeTransitioning = false; });
    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 540, easing: "cubic-bezier(.32,.08,.24,1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(() => {});
  };

  let savedTheme = getSavedTheme();
  applyTheme(savedTheme);
  renderIcons();

  themeOptions.forEach((option) => {
    option.addEventListener("click", (event) => {
      const nextTheme = option.dataset.theme;
      if (themeTransitioning) return;
      if (nextTheme === savedTheme && isDarkTheme(nextTheme) === document.documentElement.classList.contains("dark")) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof document.startViewTransition !== "function") {
        applyTheme(nextTheme, { animateFallback: true });
      } else {
        themeTransitioning = true;
        revealTheme(nextTheme, event);
      }
      savedTheme = nextTheme;
    });
  });

  systemTheme.addEventListener?.("change", () => {
    if (savedTheme === "system") applyTheme("system");
  });

  
  const commandToggle = document.querySelector("#commandToggle");
  const commandPalette = document.querySelector("#commandPalette");
  const commandInput = document.querySelector("#commandInput");
  const commandResults = Array.from(document.querySelectorAll("#commandResults a"));
  const commandEmpty = document.querySelector("#commandEmpty");
  let lastFocusedElement = null;

  const closeCommandPalette = () => {
    if (!commandPalette || commandPalette.hidden) return;
    commandPalette.hidden = true;
    document.documentElement.classList.remove("modal-open");
    document.body.classList.remove("modal-open");
    if (lastFocusedElement && lastFocusedElement.focus) lastFocusedElement.focus();
  };

  const openCommandPalette = () => {
    if (!commandPalette) return;
    lastFocusedElement = document.activeElement;
    commandPalette.hidden = false;
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
    if (commandInput) {
      commandInput.value = "";
      commandInput.focus();
    }
    commandResults.forEach((result) => result.classList.remove("is-hidden"));
    if (commandEmpty) commandEmpty.hidden = true;
  };

  if (commandToggle && commandPalette) {
    commandToggle.addEventListener("click", openCommandPalette);
    commandPalette.addEventListener("click", (event) => {
      if (event.target === commandPalette) closeCommandPalette();
    });
    commandResults.forEach((result) => result.addEventListener("click", closeCommandPalette));
    commandInput?.addEventListener("input", () => {
      const query = commandInput.value.trim().toLowerCase();
      let visibleResults = 0;
      commandResults.forEach((result) => {
        const label = `${result.textContent} ${result.dataset.commandLabel || ""}`.toLowerCase();
        const matches = label.includes(query);
        result.classList.toggle("is-hidden", !matches);
        if (matches) visibleResults += 1;
      });
      if (commandEmpty) commandEmpty.hidden = visibleResults !== 0;
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        commandPalette.hidden ? openCommandPalette() : closeCommandPalette();
      }
      if (event.key === "Escape") closeCommandPalette();
    });
  }

  document.querySelectorAll("[data-copy-email]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const email = button.dataset.copyEmail;
      if (!email) return;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(email);
        } else {
          const helper = document.createElement("textarea");
          helper.value = email;
          helper.style.position = "fixed";
          helper.style.opacity = "0";
          document.body.appendChild(helper);
          helper.select();
          document.execCommand("copy");
          helper.remove();
        }
        const originalLabel = button.textContent;
        button.textContent = "Copied";
        button.classList.add("is-copied");
        window.setTimeout(() => {
          button.textContent = originalLabel;
          button.classList.remove("is-copied");
        }, 1800);
      } catch (error) {
        // The email remains available as a mailto link if clipboard access is blocked.
      }
    });
  });

  const certCards = document.querySelectorAll(".cert-note[data-cert]");

  let lastFocusedBeforeModal = null;

  const focusablesIn = (root) =>
    Array.from(
      root.querySelectorAll(
        'a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null);

  const openModal = (modal) => {
    lastFocusedBeforeModal = document.activeElement;
    modal.classList.add("is-active");
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");

    const closeBtn = modal.querySelector(".cert-modal-close");
    if (closeBtn) closeBtn.focus();
  };

  const closeModal = (modal) => {
    modal.classList.remove("is-active");
    document.documentElement.classList.remove("modal-open");
    document.body.classList.remove("modal-open");

    // Return focus to whatever opened the dialog so keyboard users keep their place.
    if (lastFocusedBeforeModal && lastFocusedBeforeModal.focus) {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  };

  // Keep Tab inside the dialog while it is open.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const openDialog = document.querySelector(".cert-modal-overlay.is-active");
    if (!openDialog) return;

    const items = focusablesIn(openDialog);
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  certCards.forEach((card) => {
    const targetModal = document.getElementById(card.getAttribute("data-cert"));
    if (!targetModal) return;

    card.addEventListener("click", () => openModal(targetModal));
  });

  const modals = document.querySelectorAll(".cert-modal-overlay");

  modals.forEach((modal) => {
    const closeBtn = modal.querySelector(".cert-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", () => closeModal(modal));

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const activeModal = document.querySelector(".cert-modal-overlay.is-active");
    if (activeModal) closeModal(activeModal);
  });

  
  const scrollProgressFill = document.querySelector("#scrollProgressFill");

  if (scrollProgressFill) {
    let ticking = false;

    const updateScrollProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
      scrollProgressFill.style.width = `${pct}%`;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollProgress);
        ticking = true;
      }
    };

    updateScrollProgress();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateScrollProgress);
  }

  
  const backToTopBtn = document.querySelector(".back-to-top");
  const siteFooter = document.querySelector("footer");

  if (backToTopBtn) {
    const restBottom = 28; 

    const positionBackToTop = () => {
      if (siteFooter) {
        const footerRect = siteFooter.getBoundingClientRect();
        const overlap = window.innerHeight - footerRect.top;
        backToTopBtn.style.bottom = overlap > 0 ? `${overlap + restBottom}px` : `${restBottom}px`;
      }
      backToTopBtn.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.6);
    };

    positionBackToTop();
    window.addEventListener("scroll", positionBackToTop, { passive: true });
    window.addEventListener("resize", positionBackToTop);

    backToTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  

  // ---- Marquee: the duplicated half is decorative, hide it from AT ------
  const techTrack = document.querySelector("#techTrack");

  if (techTrack) {
    const pills = Array.from(techTrack.children);
    const half = Math.ceil(pills.length / 2);
    pills.forEach((pill, i) => {
      if (i >= half) pill.setAttribute("aria-hidden", "true");
      else pill.removeAttribute("aria-hidden");
    });
  }

  // ---- Project images: degrade gracefully instead of showing a broken icon
  document.querySelectorAll(".project-img-wrapper img").forEach((img) => {
    img.addEventListener("error", () => {
      img.style.display = "none";
      if (img.parentElement) img.parentElement.classList.add("img-missing");
    });
  });

  const projectCards = Array.from(document.querySelectorAll("[data-project-card]"));
  let activeProject = 0;

  const setActiveProject = (index) => {
    if (!projectCards.length) return;
    activeProject = (index + projectCards.length) % projectCards.length;
    projectCards.forEach((card, cardIndex) => {
      let offset = (cardIndex - activeProject + projectCards.length) % projectCards.length;
      card.classList.toggle("is-active", offset === 0);
      card.classList.toggle("is-right", offset === 1);
      card.classList.toggle("is-left", offset > 1);
      card.setAttribute("aria-current", offset === 0 ? "true" : "false");
    });
    if (window.innerWidth <= 700) projectCards[activeProject].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  projectCards.forEach((card, index) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      setActiveProject(index);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActiveProject(index);
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = (index + 1) % projectCards.length;
        setActiveProject(nextIndex);
        projectCards[nextIndex].focus();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        const previousIndex = (index - 1 + projectCards.length) % projectCards.length;
        setActiveProject(previousIndex);
        projectCards[previousIndex].focus();
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveProject(0);
        projectCards[0].focus();
      }
      if (event.key === "End") {
        event.preventDefault();
        const lastIndex = projectCards.length - 1;
        setActiveProject(lastIndex);
        projectCards[lastIndex].focus();
      }
    });
  });
  setActiveProject(0);

  const subjectInput = document.querySelector("#subject");
  document.querySelectorAll("[data-pricing-subject]").forEach((button) => {
    button.addEventListener("click", () => {
      if (subjectInput) subjectInput.value = button.dataset.pricingSubject || "";
    });
  });

  const contactForm = document.querySelector(".contact-form-card form");

  if (contactForm && typeof Toastify !== "undefined") {
    const submitBtn = contactForm.querySelector("button[type='submit']");
    const defaultLabel = submitBtn ? submitBtn.innerHTML : "";

    const showToast = (text, background) => {
      Toastify({
        text,
        duration: 4500,
        gravity: "top",
        position: "right",
        close: true,
        style: { background },
      }).showToast();
    };

    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending...";
      }

      try {
        const response = await fetch(contactForm.action, {
          method: "POST",
          body: new FormData(contactForm),
          headers: { Accept: "application/json" },
        });

        if (!response.ok) throw new Error("Formspree request failed");

        showToast("Message sent! I'll get back to you soon.", "#0f172a");
        contactForm.reset();
      } catch (err) {
        showToast("Something went wrong. Please email me directly instead.", "#dc2626");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = defaultLabel;
        }
      }
    });
  }
});
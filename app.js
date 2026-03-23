document.addEventListener("DOMContentLoaded", () => {

  // === SLIDER ===
  const slides = document.querySelectorAll(".slide");
  const sliderEl = document.getElementById("slider");
  let index = 0;
  let timer = null;

  function nextSlide() {
    slides[index].classList.remove("active");
    index = (index + 1) % slides.length;
    slides[index].classList.add("active");
  }

  function startSlider() {
    timer = setInterval(nextSlide, 4000);
  }

  

  function stopSlider() {
    clearInterval(timer);
  }

  if (slides.length > 0) {
    startSlider();
    sliderEl.addEventListener("mouseenter", stopSlider);
    sliderEl.addEventListener("mouseleave", startSlider);
  }

  // === CATEGORY FILTER ===
  const categories = document.querySelectorAll(".cat");
  const sections = document.querySelectorAll("section[data-category]");

  categories.forEach(btn => {
    btn.addEventListener("click", () => {
      categories.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const filter = btn.dataset.filter;

      sections.forEach(section => {
        if (filter === "alla" || section.dataset.category === filter) {
          section.classList.remove("hidden");
        } else {
          section.classList.add("hidden");
        }
      });

      // Deals-sektionen visas alltid oavsett filter
      document.getElementById("deals-section").classList.remove("hidden");
    });
  });

  // === LOGIN MODAL ===
  const modal = document.getElementById("modal");
  const loginTrigger = document.getElementById("login-trigger");
  const modalClose = document.getElementById("modal-close");

  function openModal() {
    modal.classList.add("open");
    document.body.style.overflow = "hidden"; // prevent background scroll
  }

  function closeModal() {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  loginTrigger.addEventListener("click", openModal);
  modalClose.addEventListener("click", closeModal);

  // Close when clicking outside the sheet
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Social login buttons — replace these hrefs with real OAuth URLs later
  document.getElementById("btn-google").addEventListener("click", () => {
    alert("Omdirigerar till Google-inloggning...\n\n(Koppla ihop med Google OAuth för att aktivera)");
  });

  document.getElementById("btn-facebook").addEventListener("click", () => {
    alert("Omdirigerar till Facebook-inloggning...\n\n(Koppla ihop med Facebook OAuth för att aktivera)");
  });

  document.getElementById("btn-apple").addEventListener("click", () => {
    alert("Omdirigerar till Apple-inloggning...\n\n(Koppla ihop med Apple OAuth för att aktivera)");
  });

});
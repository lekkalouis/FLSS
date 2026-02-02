(() => {
  "use strict";

  const searchInput = document.querySelector("#app-search");
  const cards = Array.from(document.querySelectorAll("[data-app-card]"));
  const emptyState = document.querySelector("#no-results");
  const resultCount = document.querySelector("#result-count");

  const getSearchText = (card) =>
    `${card.dataset.title || ""} ${card.dataset.keywords || ""}`.toLowerCase();

  const updateResults = () => {
    if (!searchInput || !resultCount) return;

    const query = searchInput.value.trim().toLowerCase();
    let matches = 0;

    cards.forEach((card) => {
      const isMatch = !query || getSearchText(card).includes(query);
      card.classList.toggle("is-hidden", !isMatch);
      if (isMatch) matches += 1;
    });

    resultCount.textContent = String(matches);

    if (emptyState) {
      emptyState.hidden = matches !== 0;
    }
  };

  if (searchInput) {
    searchInput.addEventListener("input", updateResults);
  }

  updateResults();
})();

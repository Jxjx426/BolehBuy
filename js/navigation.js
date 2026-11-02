export function initializeNavigation() {
  const allowedPages = new Set(["dashboard", "simulator"]);
  const navigationLinks = [...document.querySelectorAll("[data-page]")]
    .filter((link) => allowedPages.has(link.dataset.page));
  const pages = [...document.querySelectorAll("[data-page-panel]")]
    .filter((page) => allowedPages.has(page.dataset.pagePanel));
  const breadcrumb = document.querySelector("#page-breadcrumb");
  const sidebar = document.querySelector("#sidebar");
  const menuToggle = document.querySelector("#menu-toggle");
  const brandLink = document.querySelector(".brand");

  function showPage(pageName) {
    if (!allowedPages.has(pageName)) return false;
    const selectedLink = document.querySelector(`[data-page="${pageName}"]`);
    const selectedPage = document.querySelector(`[data-page-panel="${pageName}"]`);
    if (!selectedLink || !selectedPage) return false;

    navigationLinks.forEach((link) => {
      const isActive = link === selectedLink;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    pages.forEach((page) => {
      page.hidden = page !== selectedPage;
      page.classList.toggle("is-visible", page === selectedPage);
    });
    breadcrumb.textContent = selectedLink.querySelector("span").textContent;
    sidebar.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    return true;
  }

  navigationLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const pageName = link.dataset.page;
      showPage(pageName);
      window.history.replaceState(null, "", `#${pageName}`);
    });
  });

  brandLink.addEventListener("click", (event) => {
    event.preventDefault();
    showPage("dashboard");
    window.history.replaceState(null, "", "#dashboard");
  });

  menuToggle.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  const initialPage = window.location.hash.slice(1);
  if (!initialPage || !showPage(initialPage)) showPage("dashboard");
}

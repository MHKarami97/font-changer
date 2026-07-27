/**
 * options.js - صفحه تنظیمات پیشرفته (MVC مشابه popup)
 */
class OptionsController {
  #repository;
  #tableBody;

  constructor(repository) {
    this.#repository = repository;
    this.#tableBody = document.querySelector("#sitesTable tbody");
  }

  async init() {
    await this.#renderSites();
    document.getElementById("addBtn").addEventListener("click", () => this.#addSite());
    document.getElementById("siteInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.#addSite();
    });
    document.getElementById("resetBtn").addEventListener("click", () => this.#reset());
  }

  async #renderSites() {
    const settings = await this.#repository.getSettings();
    this.#tableBody.innerHTML = "";
    settings.customSites.forEach((site) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${site}</td><td></td>`;
      const btn = document.createElement("button");
      btn.textContent = "حذف";
      btn.addEventListener("click", () => this.#removeSite(site));
      tr.lastElementChild.appendChild(btn);
      this.#tableBody.appendChild(tr);
    });
  }

  async #addSite() {
    const input = document.getElementById("siteInput");
    const value = input.value.trim().toLowerCase();
    if (!value) return;
    const settings = await this.#repository.getSettings();
    if (settings.customSites.includes(value)) return;
    await this.#repository.updateSettings({ customSites: [...settings.customSites, value] });
    input.value = "";
    await this.#renderSites();
  }

  async #removeSite(site) {
    const settings = await this.#repository.getSettings();
    await this.#repository.updateSettings({
      customSites: settings.customSites.filter((s) => s !== site)
    });
    await this.#renderSites();
  }

  async #reset() {
    await this.#repository.updateSettings({
      isGloballyEnabled: false,
      scope: "off",
      selectedFont: "Vazirmatn",
      fontWeight: "400",
      customSites: [],
      perSiteOverrides: {}
    });
    await this.#renderSites();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new OptionsController(new SettingsRepository()).init();
});

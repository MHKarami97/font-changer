/**
 * options.js - صفحه تنظیمات پیشرفته
 * از همان کلاس SiteListEditor مفهومی مشابه popup استفاده می‌کند، اما برای
 * سادگی این صفحه، پیاده‌سازی مستقل و سبک نگه داشته شده است.
 */
class SiteListTableEditor {
  #repository;
  #settingsKey;
  #tableBody;
  #inputEl;

  constructor(repository, settingsKey, tableBodySelector, inputId) {
    this.#repository = repository;
    this.#settingsKey = settingsKey;
    this.#tableBody = document.querySelector(tableBodySelector);
    this.#inputEl = document.getElementById(inputId);
  }

  async render() {
    const settings = await this.#repository.getSettings();
    const sites = settings[this.#settingsKey] || [];
    this.#tableBody.innerHTML = "";
    sites.forEach((site) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${site}</td><td></td>`;
      const btn = document.createElement("button");
      btn.textContent = "حذف";
      btn.addEventListener("click", () => this.#remove(site));
      tr.lastElementChild.appendChild(btn);
      this.#tableBody.appendChild(tr);
    });
  }

  async add() {
    const value = this.#inputEl.value.trim().toLowerCase();
    if (!value) return;
    const settings = await this.#repository.getSettings();
    const list = settings[this.#settingsKey] || [];
    if (list.includes(value)) return;
    await this.#repository.updateSettings({ [this.#settingsKey]: [...list, value] });
    this.#inputEl.value = "";
    await this.render();
  }

  async #remove(site) {
    const settings = await this.#repository.getSettings();
    const list = settings[this.#settingsKey] || [];
    await this.#repository.updateSettings({
      [this.#settingsKey]: list.filter((s) => s !== site)
    });
    await this.render();
  }
}

class OptionsController {
  #repository;
  #fontEditor;
  #rtlEditor;

  constructor(repository) {
    this.#repository = repository;
    this.#fontEditor = new SiteListTableEditor(repository, "customSites", "#sitesTable tbody", "siteInput");
    this.#rtlEditor = new SiteListTableEditor(repository, "rtlCustomSites", "#rtlSitesTable tbody", "rtlSiteInput");
  }

  async init() {
    await this.#fontEditor.render();
    await this.#rtlEditor.render();

    document.getElementById("addBtn").addEventListener("click", () => this.#fontEditor.add());
    document.getElementById("siteInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.#fontEditor.add();
    });

    document.getElementById("rtlAddBtn").addEventListener("click", () => this.#rtlEditor.add());
    document.getElementById("rtlSiteInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.#rtlEditor.add();
    });

    document.getElementById("resetBtn").addEventListener("click", () => this.#reset());
  }

  async #reset() {
    await this.#repository.updateSettings({
      isGloballyEnabled: false,
      scope: "off",
      selectedFont: "Vazirmatn",
      fontWeight: "400",
      customSites: [],
      perSiteOverrides: {},
      rtlScope: "off",
      rtlCustomSites: [],
      rtlPerSiteOverrides: {}
    });
    await this.#fontEditor.render();
    await this.#rtlEditor.render();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new OptionsController(new SettingsRepository()).init();
});

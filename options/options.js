/**
 * options.js
 * ------------------------------------------------------------------
 * MVC-style controller for the Options page.
 * - SiteListTableEditor: یک ادیتور عمومی جدول‌محور که با هر settingsKey
 *   (customSites / rtlCustomSites / excludedPaths) کار می‌کند (DRY).
 * - OptionsController: هماهنگ‌کننده‌ی سه ادیتور + قالب (تم) + دکمه‌ی ریست.
 */

class SiteListTableEditor {
  constructor(repository, settingsKey, tableBodySelector, inputId) {
    this.repository = repository;
    this.settingsKey = settingsKey;
    this.tableBody = document.querySelector(tableBodySelector);
    this.inputEl = document.getElementById(inputId);
  }

  async render() {
    var settings = await this.repository.getSettings();
    var sites = settings[this.settingsKey] || [];

    this.tableBody.innerHTML = "";
    sites.forEach((site) => {
      var tr = document.createElement("tr");
      tr.innerHTML = `<td>${site}</td><td></td>`;

      var btn = document.createElement("button");
      btn.textContent = "حذف";
      btn.addEventListener("click", () => this.remove(site));

      tr.lastElementChild.appendChild(btn);
      this.tableBody.appendChild(tr);
    });
  }

  async add() {
    var value = this.inputEl.value.trim().toLowerCase();
    if (!value) {
      return;
    }

    var settings = await this.repository.getSettings();
    var list = settings[this.settingsKey] || [];
    if (list.includes(value)) {
      return;
    }

    await this.repository.updateSettings({
      [this.settingsKey]: [...list, value],
    });

    this.inputEl.value = "";
    await this.render();
  }

  async remove(site) {
    var settings = await this.repository.getSettings();
    var list = settings[this.settingsKey] || [];

    await this.repository.updateSettings({
      [this.settingsKey]: list.filter((s) => s !== site),
    });

    await this.render();
  }
}

class OptionsController {
  constructor(repository) {
    this.repository = repository;
    this.themeManager = new ThemeManager(repository);

    this.fontEditor = new SiteListTableEditor(
      repository,
      "customSites",
      "#sitesTable tbody",
      "siteInput",
    );

    this.rtlEditor = new SiteListTableEditor(
      repository,
      "rtlCustomSites",
      "#rtlSitesTable tbody",
      "rtlSiteInput",
    );

    this.excludedPathsEditor = new SiteListTableEditor(
      repository,
      "excludedPaths",
      "#excludedPathsTable tbody",
      "excludedPathInput",
    );

    this.themeRadios = Array.from(
      document.querySelectorAll('input[name="theme"]'),
    );
  }

  async init() {
    var theme = await this.themeManager.applyStoredTheme();
    this.setThemeRadios(theme);

    await this.fontEditor.render();
    await this.rtlEditor.render();
    await this.excludedPathsEditor.render();

    document
      .getElementById("addBtn")
      .addEventListener("click", () => this.fontEditor.add());
    document.getElementById("siteInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.fontEditor.add();
      }
    });

    document
      .getElementById("rtlAddBtn")
      .addEventListener("click", () => this.rtlEditor.add());
    document.getElementById("rtlSiteInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.rtlEditor.add();
      }
    });

    document
      .getElementById("excludedPathAddBtn")
      .addEventListener("click", () => this.excludedPathsEditor.add());
    document
      .getElementById("excludedPathInput")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.excludedPathsEditor.add();
        }
      });

    this.themeRadios.forEach((radio) => {
      radio.addEventListener("change", async (e) => {
        if (!e.target.checked) return;
        await this.themeManager.setTheme(e.target.value);
      });
    });

    document
      .getElementById("resetBtn")
      .addEventListener("click", () => this.reset());
  }

  setThemeRadios(theme) {
    this.themeRadios.forEach((radio) => {
      radio.checked = radio.value === theme;
    });
  }

  async reset() {
    await this.repository.updateSettings({
      isGloballyEnabled: false,
      scope: "off",
      selectedFont: "Vazirmatn",
      fontWeight: "400",
      customSites: [],
      perSiteOverrides: {},
      rtlScope: "off",
      rtlCustomSites: [],
      rtlPerSiteOverrides: {},
      excludedPaths: [],
      theme: "dark",
    });

    var theme = await this.themeManager.applyStoredTheme();
    this.setThemeRadios(theme);

    await this.fontEditor.render();
    await this.rtlEditor.render();
    await this.excludedPathsEditor.render();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  var controller = new OptionsController(new SettingsRepository());
  controller.init();
});

/**
 * popup.js
 * ------------------------------------------------------------------
 * الگوی MVC ساده، به‌همراه یک کلاس کمکی SiteListEditor (Composition) که
 * منطق تکراری «افزودن/حذف دامنه به یک لیست» را هم برای فونت و هم برای
 * RTL Forcer بازاستفاده می‌کند (DRY - Don't Repeat Yourself).
 */

class PopupView {
  constructor() {
    this.globalToggle = document.getElementById("globalToggle");
    this.fontSelect = document.getElementById("fontSelect");
    this.weightSelect = document.getElementById("weightSelect");
    this.customSitesSection = document.getElementById("customSitesSection");
    this.currentSiteLabel = document.getElementById("currentSiteLabel");
    this.currentSiteToggle = document.getElementById("currentSiteToggle");
    this.scopeRadios = Array.from(
      document.querySelectorAll('input[name="scope"]'),
    );

    this.rtlCustomSitesSection = document.getElementById(
      "rtlCustomSitesSection",
    );
    this.rtlCurrentSiteLabel = document.getElementById("rtlCurrentSiteLabel");
    this.rtlCurrentSiteToggle = document.getElementById("rtlCurrentSiteToggle");
    this.rtlScopeRadios = Array.from(
      document.querySelectorAll('input[name="rtlScope"]'),
    );
  }

  populateFontOptions(fonts, selectedFont) {
    this.fontSelect.innerHTML = fonts
      .map(
        (font) =>
          `<option value="${font}" ${font === selectedFont ? "selected" : ""}>${font}</option>`,
      )
      .join("");
  }

  setGlobalToggle(isEnabled) {
    this.globalToggle.checked = isEnabled;
  }

  setWeight(weight) {
    this.weightSelect.value = weight;
  }

  setScope(scope) {
    this.scopeRadios.forEach((radio) => {
      radio.checked = radio.value === scope;
    });
    this.customSitesSection.style.display =
      scope === "custom" ? "flex" : "none";
  }

  setRtlScope(scope) {
    this.rtlScopeRadios.forEach((radio) => {
      radio.checked = radio.value === scope;
    });
    this.rtlCustomSitesSection.style.display =
      scope === "custom" ? "flex" : "none";
  }

  setCurrentSiteLabel(hostname) {
    this.currentSiteLabel.textContent = hostname;
    this.rtlCurrentSiteLabel.textContent = hostname;
  }

  setCurrentSiteToggle(isEnabled) {
    this.currentSiteToggle.checked = Boolean(isEnabled);
  }

  setRtlCurrentSiteToggle(isEnabled) {
    this.rtlCurrentSiteToggle.checked = Boolean(isEnabled);
  }
}

/**
 * SiteListEditor
 * ------------------------------------------------------------------
 * مسئولیت واحد: مدیریت افزودن/حذف/رندر یک لیست دامنه در storage.
 * با تزریق نام کلید تنظیمات (settingsKey) و المان‌های DOM، هم برای
 * customSites (فونت) و هم rtlCustomSites (RTL) بازاستفاده می‌شود.
 */
class SiteListEditor {
  #repository;
  #settingsKey;
  #inputEl;
  #addBtnEl;
  #listEl;
  #onChange;

  constructor(
    repository,
    settingsKey,
    { inputEl, addBtnEl, listEl },
    onChange,
  ) {
    this.#repository = repository;
    this.#settingsKey = settingsKey;
    this.#inputEl = inputEl;
    this.#addBtnEl = addBtnEl;
    this.#listEl = listEl;
    this.#onChange = onChange;
  }

  async render() {
    const settings = await this.#repository.getSettings();
    const sites = settings[this.#settingsKey] || [];
    this.#listEl.innerHTML = "";
    sites.forEach((site) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${site}</span>`;
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => this.#remove(site));
      li.appendChild(removeBtn);
      this.#listEl.appendChild(li);
    });
  }

  bindEvents() {
    this.#addBtnEl.addEventListener("click", () => this.#add());
    this.#inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.#add();
    });
  }

  async #add() {
    const value = this.#inputEl.value.trim().toLowerCase();
    if (!value) return;
    const settings = await this.#repository.getSettings();
    const list = settings[this.#settingsKey] || [];
    if (list.includes(value)) return;

    await this.#repository.updateSettings({
      [this.#settingsKey]: [...list, value],
    });
    this.#inputEl.value = "";
    await this.render();
    this.#onChange?.();
  }

  async #remove(site) {
    const settings = await this.#repository.getSettings();
    const list = settings[this.#settingsKey] || [];
    await this.#repository.updateSettings({
      [this.#settingsKey]: list.filter((s) => s !== site),
    });
    await this.render();
    this.#onChange?.();
  }
}

class PopupController {
  #repository;
  #view;
  #activeTab;
  #fontSiteEditor;
  #rtlSiteEditor;

  constructor(repository, view) {
    this.#repository = repository;
    this.#view = view;
  }

  async init() {
    this.#activeTab = await this.#getActiveTab();
    const settings = await this.#repository.getSettings();

    this.#view.populateFontOptions(FontsCatalog, settings.selectedFont);
    this.#view.setGlobalToggle(settings.isGloballyEnabled);
    this.#view.setWeight(settings.fontWeight);
    this.#view.setScope(settings.scope);
    this.#view.setRtlScope(settings.rtlScope);

    this.#fontSiteEditor = new SiteListEditor(
      this.#repository,
      "customSites",
      {
        inputEl: document.getElementById("customSiteInput"),
        addBtnEl: document.getElementById("addSiteBtn"),
        listEl: document.getElementById("customSitesList"),
      },
      () => this.#broadcastUpdate(),
    );

    this.#rtlSiteEditor = new SiteListEditor(
      this.#repository,
      "rtlCustomSites",
      {
        inputEl: document.getElementById("rtlCustomSiteInput"),
        addBtnEl: document.getElementById("rtlAddSiteBtn"),
        listEl: document.getElementById("rtlCustomSitesList"),
      },
      () => this.#broadcastUpdate(),
    );

    this.excludedPathsEditor = new SiteListEditor(
      this.repository,
      "excludedPaths",
      document.getElementById("excludedPathInput"),
      document.getElementById("excludedPathAddBtn"),
      document.getElementById("excludedPathsList"),
      this.broadcastUpdate,
    );
    await this.excludedPathsEditor.render();
    this.excludedPathsEditor.bindEvents();

    await this.#fontSiteEditor.render();
    await this.#rtlSiteEditor.render();
    this.#fontSiteEditor.bindEvents();
    this.#rtlSiteEditor.bindEvents();

    if (this.#activeTab?.url) {
      const hostname = this.#safeHostname(this.#activeTab.url);
      this.#view.setCurrentSiteLabel(hostname || "این صفحه پشتیبانی نمی‌شود");
      this.#view.setCurrentSiteToggle(settings.perSiteOverrides[hostname]);
      this.#view.setRtlCurrentSiteToggle(
        settings.rtlPerSiteOverrides[hostname],
      );
    }

    this.#bindEvents();
  }

  #safeHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  async #getActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  }

  async #notifyContentScript(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // تب ممکن است صفحه‌ای باشد که content script در آن اجرا نمی‌شود (مثل edge://)
    }
  }

  #bindEvents() {
    this.#view.globalToggle.addEventListener("change", async (e) => {
      await this.#repository.updateSettings({
        isGloballyEnabled: e.target.checked,
      });
      this.#broadcastUpdate();
    });

    this.#view.fontSelect.addEventListener("change", async (e) => {
      await this.#repository.updateSettings({ selectedFont: e.target.value });
      this.#broadcastUpdate();
    });

    this.#view.weightSelect.addEventListener("change", async (e) => {
      await this.#repository.updateSettings({ fontWeight: e.target.value });
      this.#broadcastUpdate();
    });

    this.#view.scopeRadios.forEach((radio) => {
      radio.addEventListener("change", async (e) => {
        if (!e.target.checked) return;
        await this.#repository.updateSettings({ scope: e.target.value });
        this.#view.setScope(e.target.value);
        this.#broadcastUpdate();
      });
    });

    this.#view.rtlScopeRadios.forEach((radio) => {
      radio.addEventListener("change", async (e) => {
        if (!e.target.checked) return;
        await this.#repository.updateSettings({ rtlScope: e.target.value });
        this.#view.setRtlScope(e.target.value);
        this.#broadcastUpdate();
      });
    });

    this.#view.currentSiteToggle.addEventListener("change", async (e) => {
      if (!this.#activeTab?.id) return;
      await this.#notifyContentScript(this.#activeTab.id, {
        type: "TOGGLE_CURRENT_SITE",
        payload: { feature: "font", isEnabled: e.target.checked },
      });
    });

    this.#view.rtlCurrentSiteToggle.addEventListener("change", async (e) => {
      if (!this.#activeTab?.id) return;
      await this.#notifyContentScript(this.#activeTab.id, {
        type: "TOGGLE_CURRENT_SITE",
        payload: { feature: "rtl", isEnabled: e.target.checked },
      });
    });
  }

  async #broadcastUpdate() {
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id)
        this.#notifyContentScript(tab.id, { type: "SETTINGS_UPDATED" });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const controller = new PopupController(
    new SettingsRepository(),
    new PopupView(),
  );
  controller.init();
});

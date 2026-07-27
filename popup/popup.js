/**
 * popup.js
 * ------------------------------------------------------------------
 * الگوی MVC ساده:
 *   - Model  : SettingsRepository (لایه lib)
 *   - View   : DOM عناصر popup.html
 *   - Controller: کلاس PopupController که رویدادها را به تغییرات Model
 *                 و View متصل می‌کند.
 */

class PopupView {
  constructor() {
    this.globalToggle = document.getElementById("globalToggle");
    this.fontSelect = document.getElementById("fontSelect");
    this.weightSelect = document.getElementById("weightSelect");
    this.customSitesSection = document.getElementById("customSitesSection");
    this.customSiteInput = document.getElementById("customSiteInput");
    this.addSiteBtn = document.getElementById("addSiteBtn");
    this.customSitesList = document.getElementById("customSitesList");
    this.currentSiteLabel = document.getElementById("currentSiteLabel");
    this.currentSiteToggle = document.getElementById("currentSiteToggle");
    this.scopeRadios = Array.from(document.querySelectorAll('input[name="scope"]'));
  }

  populateFontOptions(fonts, selectedFont) {
    this.fontSelect.innerHTML = fonts
      .map(
        (font) =>
          `<option value="${font}" ${font === selectedFont ? "selected" : ""}>${font}</option>`
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
    this.customSitesSection.style.display = scope === "custom" ? "flex" : "none";
  }

  renderCustomSites(sites, onRemove) {
    this.customSitesList.innerHTML = "";
    sites.forEach((site) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${site}</span>`;
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => onRemove(site));
      li.appendChild(removeBtn);
      this.customSitesList.appendChild(li);
    });
  }

  setCurrentSiteLabel(hostname) {
    this.currentSiteLabel.textContent = hostname;
  }

  setCurrentSiteToggle(isEnabled) {
    this.currentSiteToggle.checked = Boolean(isEnabled);
  }
}

class PopupController {
  #repository;
  #view;
  #activeTab;

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
    this.#view.renderCustomSites(settings.customSites, (site) =>
      this.#removeCustomSite(site)
    );

    if (this.#activeTab?.url) {
      const hostname = this.#safeHostname(this.#activeTab.url);
      this.#view.setCurrentSiteLabel(hostname || "این صفحه پشتیبانی نمی‌شود");
      this.#view.setCurrentSiteToggle(settings.perSiteOverrides[hostname]);
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async #notifyContentScript(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // تب ممکن است صفحه‌ای باشد که content script در آن اجرا نمی‌شود (مثل chrome://)
    }
  }

  #bindEvents() {
    this.#view.globalToggle.addEventListener("change", async (e) => {
      await this.#repository.updateSettings({ isGloballyEnabled: e.target.checked });
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

    this.#view.addSiteBtn.addEventListener("click", () => this.#addCustomSite());
    this.#view.customSiteInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.#addCustomSite();
    });

    this.#view.currentSiteToggle.addEventListener("change", async (e) => {
      if (!this.#activeTab?.id) return;
      await this.#notifyContentScript(this.#activeTab.id, {
        type: "TOGGLE_CURRENT_SITE",
        payload: { isEnabled: e.target.checked }
      });
    });
  }

  async #addCustomSite() {
    const value = this.#view.customSiteInput.value.trim().toLowerCase();
    if (!value) return;
    const settings = await this.#repository.getSettings();
    if (settings.customSites.includes(value)) return;

    const updated = [...settings.customSites, value];
    await this.#repository.updateSettings({ customSites: updated });
    this.#view.renderCustomSites(updated, (site) => this.#removeCustomSite(site));
    this.#view.customSiteInput.value = "";
    this.#broadcastUpdate();
  }

  async #removeCustomSite(site) {
    const settings = await this.#repository.getSettings();
    const updated = settings.customSites.filter((s) => s !== site);
    await this.#repository.updateSettings({ customSites: updated });
    this.#view.renderCustomSites(updated, (s) => this.#removeCustomSite(s));
    this.#broadcastUpdate();
  }

  async #broadcastUpdate() {
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) this.#notifyContentScript(tab.id, { type: "SETTINGS_UPDATED" });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const controller = new PopupController(new SettingsRepository(), new PopupView());
  controller.init();
});

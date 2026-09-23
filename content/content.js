/**
 * content.js
 * ------------------------------------------------------------------
 * نقطه ورود Content Script. مسئولیت‌ها بر اساس SRP بین چند کلاس تقسیم شده‌اند:
 *   - GoogleFontLoader      : بارگذاری فونت از Google Fonts
 *   - ShadowDomWalker       : پیمایش بازگشتی Light DOM + Shadow DOM
 *   - IconFontDetector      : تشخیص و محافظت از فونت آیکون‌ها (حتی داخل Shadow DOM)
 *   - FontApplier           : اعمال فونت روی <html> با CSS Injection
 *   - DirectionApplier      : اجباری‌کردن جهت صفحه به RTL (ویژگی مستقل)
 *   - UrlPatternMatcher     : تشخیص مسیرهای مستثنا (مثل google.com/maps) - lib/url-pattern-matcher.js
 *   - FontChangerController / DirectionController : Orchestrator هرکدام (Facade)
 *
 * قانون اولویت مسیرهای مستثنا:
 * excludedPaths بالاترین اولویت را نسبت به تمام تنظیمات دیگر (scope, perSiteOverrides,
 * rtlScope, rtlPerSiteOverrides) دارد. اگر آدرس جاری (hostname + pathname) با یکی از
 * الگوهای excludedPaths مطابقت داشته باشد، هم تغییر فونت و هم اجبار RTL غیرفعال می‌شوند،
 * حتی اگر کاربر برای همان سایت یک override دستی «فعال» ثبت کرده باشد.
 */

class GoogleFontLoader {
  static #LINK_ID = "__font-changer-google-font-link__";

  load(fontFamily, weight = "400") {
    const existing = document.getElementById(GoogleFontLoader.#LINK_ID);
    if (existing) existing.remove();

    const link = document.createElement("link");
    link.id = GoogleFontLoader.#LINK_ID;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@${weight}&display=swap`;
    (document.head || document.documentElement).appendChild(link);
  }

  remove() {
    const existing = document.getElementById(GoogleFontLoader.#LINK_ID);
    if (existing) existing.remove();
  }
}

/**
 * ShadowDomWalker
 * ------------------------------------------------------------------
 * مسئولیت واحد: پیمایش بازگشتی درخت DOM به‌همراه تمام Shadow Root های
 * قابل‌دسترسی (open) داخل آن.
 */
class ShadowDomWalker {
  /**
   * @param {ParentNode} root
   * @param {(element: Element) => void} visit
   */
  static walk(root, visit) {
    if (!root) return;
    const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    elements.forEach((el) => {
      visit(el);
      if (el.shadowRoot) {
        ShadowDomWalker.walk(el.shadowRoot, visit);
      }
    });
  }

  /**
   * @param {ParentNode} root
   * @returns {ShadowRoot[]}
   */
  static collectShadowRoots(root) {
    const roots = [];
    ShadowDomWalker.walk(root, (el) => {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    });
    return roots;
  }
}

/**
 * IconFontDetector
 * ------------------------------------------------------------------
 * تشخیص المان‌های آیکونی (بر اساس font-family محاسبه‌شده) در سراسر
 * Light DOM و Shadow DOM، و قفل‌کردن فونت اصلی آن‌ها با inline !important
 * تا با تغییر فونت سراسری صفحه دست‌نخورده باقی بمانند.
 */
class IconFontDetector {
  static #MARK_ATTRIBUTE = "data-fc-icon";

  static #ICON_FONT_KEYWORDS = [
    "material icons",
    "material symbols",
    "google symbols",
    "google material icons",
    "font awesome",
    "fontawesome",
    "glyphicons",
    "ionicons",
    "octicons",
    "feather",
    "bootstrap-icons",
    "iconfont",
    "dx-icons",
    "remixicon",
  ];

  #observers = [];
  #debounceTimer = null;

  /**
   * پیمایش کامل (Light DOM + Shadow DOM) و قفل‌کردن فونت اصلی آیکون‌ها.
   * باید پیش از تزریق قانون سراسری فونت اجرا شود.
   * @param {ParentNode} root
   */
  scan(root = document.body) {
    if (!root) return;
    ShadowDomWalker.walk(root, (el) => this.#lockIfIconFont(el));
  }

  /**
   * فعال‌سازی MutationObserver روی سند اصلی و تمام Shadow Root های موجود،
   * به‌همراه debounce برای جلوگیری از افت Performance روی سایت‌های پرتغییر.
   */
  observe(root = document.documentElement) {
    this.disconnect();

    const attach = (targetRoot) => {
      const observer = new MutationObserver(() => this.#scheduleRescan(root));
      observer.observe(targetRoot, { childList: true, subtree: true });
      this.#observers.push(observer);
    };

    attach(root);
    ShadowDomWalker.collectShadowRoots(root).forEach(attach);
  }

  disconnect() {
    this.#observers.forEach((observer) => observer.disconnect());
    this.#observers = [];
    if (this.#debounceTimer) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
  }

  #scheduleRescan(root) {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => {
      this.scan(root);
      this.observe(root);
    }, 200);
  }

  #lockIfIconFont(element) {
    if (!(element instanceof Element)) return;
    if (element.hasAttribute(IconFontDetector.#MARK_ATTRIBUTE)) return;

    const computedStyle =
      element.ownerDocument?.defaultView?.getComputedStyle(element);
    const computedFamily = computedStyle?.fontFamily?.toLowerCase() || "";
    const isIconFont = IconFontDetector.#ICON_FONT_KEYWORDS.some((keyword) =>
      computedFamily.includes(keyword),
    );

    if (isIconFont) {
      element.style.setProperty(
        "font-family",
        computedStyle.fontFamily,
        "important",
      );
      element.setAttribute(IconFontDetector.#MARK_ATTRIBUTE, "true");
    }
  }
}

class FontApplier {
  static #STYLE_ID = "__font-changer-style__";

  apply(fontFamily) {
    let styleTag = document.getElementById(FontApplier.#STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = FontApplier.#STYLE_ID;
      (document.head || document.documentElement).appendChild(styleTag);
    }
    styleTag.textContent = `
      html, body, * {
        font-family: "${fontFamily}", "Vazirmatn", "Tahoma", sans-serif !important;
      }
    `;
  }

  remove() {
    const styleTag = document.getElementById(FontApplier.#STYLE_ID);
    if (styleTag) styleTag.remove();
  }
}

/**
 * DirectionApplier
 * ------------------------------------------------------------------
 * قابلیت مستقل "اجبار جهت راست‌به‌چپ (RTL)".
 */
class DirectionApplier {
  static #STYLE_ID = "__font-changer-rtl-style__";
  static #ORIGINAL_DIR_ATTR = "data-fc-original-dir";
  static #NONE_MARKER = "__none__";

  apply() {
    const html = document.documentElement;

    if (!html.hasAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR)) {
      const originalDir =
        html.getAttribute("dir") || DirectionApplier.#NONE_MARKER;
      html.setAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR, originalDir);
    }

    html.setAttribute("dir", "rtl");

    let styleTag = document.getElementById(DirectionApplier.#STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = DirectionApplier.#STYLE_ID;
      (document.head || document.documentElement).appendChild(styleTag);
    }
    styleTag.textContent = `
      html, body {
        direction: rtl !important;
      }
    `;
  }

  remove() {
    const html = document.documentElement;

    if (html.hasAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR)) {
      const originalDir = html.getAttribute(
        DirectionApplier.#ORIGINAL_DIR_ATTR,
      );
      if (originalDir === DirectionApplier.#NONE_MARKER) {
        html.removeAttribute("dir");
      } else {
        html.setAttribute("dir", originalDir);
      }
      html.removeAttribute(DirectionApplier.#ORIGINAL_DIR_ATTR);
    }

    const styleTag = document.getElementById(DirectionApplier.#STYLE_ID);
    if (styleTag) styleTag.remove();
  }
}

class FontChangerController {
  #settingsRepository;
  #fontLoader;
  #fontApplier;
  #iconDetector;

  constructor(settingsRepository, fontLoader, fontApplier, iconDetector) {
    this.#settingsRepository = settingsRepository;
    this.#fontLoader = fontLoader;
    this.#fontApplier = fontApplier;
    this.#iconDetector = iconDetector;
  }

  /**
   * @param {boolean} isExcluded آیا آدرس جاری در excludedPaths است (بالاترین اولویت)
   */
  async run(isExcluded) {
    const settings = await this.#settingsRepository.getSettings();
    const hostname = window.location.hostname;

    const perSiteOverride = settings.perSiteOverrides[hostname];
    const strategy = ScopeStrategyFactory.create(settings.scope, "customSites");

    let shouldApply;
    if (isExcluded) {
      shouldApply = false;
    } else if (typeof perSiteOverride === "boolean") {
      shouldApply = perSiteOverride;
    } else {
      shouldApply =
        settings.isGloballyEnabled &&
        strategy.isApplicable(hostname, document, settings);
    }

    if (shouldApply) {
      // اسکن آیکون‌ها (Light + Shadow DOM) باید پیش از اعمال فونت انجام
      // شود تا Computed Style اصلی (قبل از override) خوانده شود.
      this.#iconDetector.scan(document.body);
      this.#iconDetector.observe(document.documentElement);
      this.#fontLoader.load(settings.selectedFont, settings.fontWeight);
      this.#fontApplier.apply(settings.selectedFont);
    } else {
      this.#iconDetector.disconnect();
      this.#fontLoader.remove();
      this.#fontApplier.remove();
    }
  }
}

class DirectionController {
  #settingsRepository;
  #directionApplier;

  constructor(settingsRepository, directionApplier) {
    this.#settingsRepository = settingsRepository;
    this.#directionApplier = directionApplier;
  }

  /**
   * @param {boolean} isExcluded آیا آدرس جاری در excludedPaths است (بالاترین اولویت)
   */
  async run(isExcluded) {
    const settings = await this.#settingsRepository.getSettings();
    const hostname = window.location.hostname;

    const perSiteOverride = settings.rtlPerSiteOverrides[hostname];
    const strategy = ScopeStrategyFactory.create(
      settings.rtlScope,
      "rtlCustomSites",
    );

    let shouldApply;
    if (isExcluded) {
      shouldApply = false;
    } else if (typeof perSiteOverride === "boolean") {
      shouldApply = perSiteOverride;
    } else {
      shouldApply = strategy.isApplicable(hostname, document, settings);
    }

    if (shouldApply) {
      this.#directionApplier.apply();
    } else {
      this.#directionApplier.remove();
    }
  }
}

(function bootstrap() {
  const settingsRepository = new SettingsRepository();

  const fontController = new FontChangerController(
    settingsRepository,
    new GoogleFontLoader(),
    new FontApplier(),
    new IconFontDetector(),
  );

  const directionController = new DirectionController(
    settingsRepository,
    new DirectionApplier(),
  );

  /**
   * محاسبه‌ی وضعیت مستثنا بودن آدرس جاری صفحه بر اساس excludedPaths.
   * این تابع در ابتدای هر runAll (و روی هر تغییر مسیر SPA) دوباره اجرا می‌شود
   * چون hostname ثابت است ولی pathname می‌تواند در اپ‌های تک‌صفحه‌ای تغییر کند.
   */
  const computeIsExcluded = async () => {
    const settings = await settingsRepository.getSettings();
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    return UrlPatternMatcher.isExcluded(
      hostname,
      pathname,
      settings.excludedPaths,
    );
  };

  const runAll = async () => {
    const isExcluded = await computeIsExcluded();
    await fontController.run(isExcluded);
    await directionController.run(isExcluded);
  };

  const start = () => {
    runAll();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "TOGGLE_CURRENT_SITE") {
        const { feature, isEnabled } = message.payload;
        const hostname = window.location.hostname;

        const overrideUpdate =
          feature === "rtl"
            ? settingsRepository.setRtlPerSiteOverride(hostname, isEnabled)
            : settingsRepository.setPerSiteOverride(hostname, isEnabled);

        overrideUpdate.then(runAll).then(() => sendResponse({ ok: true }));
        return true; // async response
      }

      if (message?.type === "SETTINGS_UPDATED") {
        runAll();
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // اپ‌های تک‌صفحه‌ای (SPA) مثل Google Maps بدون رفرش کامل صفحه، pathname را
  // تغییر می‌دهند. با پایش دوره‌ای pathname، exclude/scope دوباره ارزیابی می‌شود.
  var lastPathname = window.location.pathname;
  setInterval(function () {
    if (window.location.pathname !== lastPathname) {
      lastPathname = window.location.pathname;
      runAll();
    }
  }, 500);
})();

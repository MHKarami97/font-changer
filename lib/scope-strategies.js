/**
 * Strategy Pattern for determining WHETHER a rule (font or RTL) should be
 * applied to the current site.
 * هر Strategy یک کلاس مجزا با متد isApplicable(hostname, doc, settings) است.
 * اضافه کردن یک حالت جدید فقط نیاز به یک کلاس جدید دارد، بدون تغییر کد
 * موجود => Open/Closed Principle.
 */

class ScopeStrategy {
  /* eslint-disable-next-line no-unused-vars */
  isApplicable(hostname, doc, settings) {
    throw new Error("isApplicable() must be implemented by subclass");
  }
}

class AllSitesStrategy extends ScopeStrategy {
  isApplicable() {
    return true;
  }
}

class RtlOnlyStrategy extends ScopeStrategy {
  isApplicable(hostname, doc) {
    const htmlDir = doc.documentElement.getAttribute("dir");
    const bodyDir = doc.body ? doc.body.getAttribute("dir") : null;
    const computedDir = doc.defaultView
      ? doc.defaultView.getComputedStyle(doc.documentElement).direction
      : null;
    return (
      htmlDir === "rtl" || bodyDir === "rtl" || computedDir === "rtl"
    );
  }
}

/**
 * Strategy عمومی برای بررسی عضویت دامنه در یک لیست سفارشی.
 * با گرفتن نام کلید لیست در constructor، هم برای فونت (customSites) و
 * هم برای RTL Forcer (rtlCustomSites) قابل استفاده مجدد است (DRY).
 */
class CustomSitesStrategy extends ScopeStrategy {
  #settingsKey;

  constructor(settingsKey = "customSites") {
    super();
    this.#settingsKey = settingsKey;
  }

  isApplicable(hostname, doc, settings) {
    const list = settings[this.#settingsKey] || [];
    return list.some((entry) => hostname.endsWith(entry.trim().toLowerCase()));
  }
}

class OffStrategy extends ScopeStrategy {
  isApplicable() {
    return false;
  }
}

/**
 * Factory Pattern: بر اساس مقدار scope، Strategy مناسب را می‌سازد.
 * @param {string} scope "all" | "rtl" | "custom" | "off"
 * @param {string} customSitesKey نام کلید تنظیمات برای حالت custom (پیش‌فرض customSites)
 */
class ScopeStrategyFactory {
  static create(scope, customSitesKey = "customSites") {
    switch (scope) {
      case "all":
        return new AllSitesStrategy();
      case "rtl":
        return new RtlOnlyStrategy();
      case "custom":
        return new CustomSitesStrategy(customSitesKey);
      default:
        return new OffStrategy();
    }
  }
}

if (typeof globalThis !== "undefined") {
  globalThis.ScopeStrategyFactory = ScopeStrategyFactory;
}

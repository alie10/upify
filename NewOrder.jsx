import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

/**
 * Upify - New Order (Categories as Grid Cards)
 * - Loads active services from Supabase
 * - Orders by provider_service_id ASC
 * - Builds category list in the same order (first appearance => min provider_service_id)
 * - Shows categories as clickable cards (grid)
 * - Shows services for selected category
 * - Shows service description + "I read" checkbox
 *
 * NOTE:
 * - This file intentionally avoids selecting non-existent columns.
 * - It selects ONLY the columns we actually need.
 */

// --------- helpers ----------
function safeStr(v) {
  return typeof v === "string" ? v : "";
}

function normalizeCategory(cat) {
  // Keep original for display, but use a normalized key for grouping
  return safeStr(cat).trim();
}

function extractCategoryBadge(displayCategory) {
  // Optional: show a "badge" icon if the category contains emojis/symbols.
  // We'll just return the first 2 visible chars if they look like emoji/symbols.
  const s = safeStr(displayCategory).trim();
  if (!s) return "";
  // Heuristic: many categories start/end with emoji; we'll just show the first token.
  const firstToken = s.split(" ")[0];
  if (firstToken && firstToken.length <= 4) return firstToken;
  return "";
}

function isPositiveIntLike(x) {
  return Number.isInteger(x) && x >= 0;
}

// You can connect your existing price logic here later.
function computeCustomerTotalPrice({ service, quantity }) {
  // service.provider_rate_per_1000 is the base
  // then apply markup_percent/markup_fixed or defaults (handled elsewhere in your project)
  // For now we return null if we can't compute safely.
  if (!service) return null;

  const rate = Number(service.provider_rate_per_1000);
  if (!Number.isFinite(rate)) return null;

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 0;

  // Base cost = rate * qty/1000 (still provider cost). We should NOT show provider cost.
  // If you already store "customer_price_per_1000" or have markup defaults in app,
  // replace this section to compute final customer price.
  //
  // Placeholder: return null to avoid showing wrong pricing.
  return null;
}

// --------- component ----------
export default function NewOrder() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [services, setServices] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState(null);

  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [readDesc, setReadDesc] = useState(false);

  const [uiMsg, setUiMsg] = useState({ type: "", text: "" });

  // Load services once
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setLoadError("");
      setUiMsg({ type: "", text: "" });

      // IMPORTANT: select only columns that exist in your services table.
      // Based on our DB design, these are safe/common:
      // - id (uuid) OR provider_service_id (int/text)
      // - name/title/service_name (one of them exists)
      // - description
      // - category
      // - is_active
      // - provider_rate_per_1000
      //
      // Because your schema changed over time, we use a conservative select list.
      // If a column doesn't exist, Supabase will error.
      const selectCols = [
        "id",
        "provider_service_id",
        "category",
        "description",
        "provider_rate_per_1000",
        "min",
        "max",
        "name",
      ].join(",");

      const { data, error } = await supabase
        .from("services")
        .select(selectCols)
        .eq("is_active", true)
        .order("provider_service_id", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setLoadError(
          `خطأ في تحميل الخدمات من قاعدة البيانات. تأكد من أسماء الأعمدة في جدول services.\n${error.message}`
        );
        setServices([]);
        setLoading(false);
        return;
      }

      setServices(Array.isArray(data) ? data : []);
      setLoading(false);
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  // Build ordered categories (by first appearance in services[] which is ordered by provider_service_id)
  const categories = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const s of services) {
      const cat = normalizeCategory(s.category);
      if (!cat) continue;
      if (seen.has(cat)) continue;
      seen.add(cat);
      out.push({
        key: cat,
        label: cat,
        badge: extractCategoryBadge(cat),
      });
    }
    return out;
  }, [services]);

  // Services inside selected category
  const servicesInCategory = useMemo(() => {
    const cat = normalizeCategory(selectedCategory);
    if (!cat) return [];
    return services
      .filter((s) => normalizeCategory(s.category) === cat)
      .slice()
      .sort((a, b) => {
        const av = Number(a.provider_service_id);
        const bv = Number(b.provider_service_id);
        if (Number.isFinite(av) && Number.isFinite(bv)) return av - bv;
        return String(a.provider_service_id).localeCompare(String(b.provider_service_id));
      });
  }, [services, selectedCategory]);

  // Selected service object
  const selectedService = useMemo(() => {
    if (!selectedServiceId) return null;
    return services.find((s) => String(s.provider_service_id) === String(selectedServiceId)) || null;
  }, [services, selectedServiceId]);

  // Reset selections when category changes
  useEffect(() => {
    setSelectedServiceId(null);
    setReadDesc(false);
    setLink("");
    setQuantity(0);
  }, [selectedCategory]);

  // When service changes, reset desc confirmation
  useEffect(() => {
    setReadDesc(false);
  }, [selectedServiceId]);

  function showMsg(type, text) {
    setUiMsg({ type, text });
    // Auto clear after a bit
    window.clearTimeout(showMsg._t);
    showMsg._t = window.setTimeout(() => setUiMsg({ type: "", text: "" }), 4500);
  }

  function onPickCategory(catKey) {
    setSelectedCategory(catKey);
    showMsg("info", `تم اختيار الفئة: ${catKey}`);
  }

  function onPickService(providerServiceId) {
    setSelectedServiceId(providerServiceId);
    showMsg("info", `تم اختيار الخدمة: #${providerServiceId}`);
  }

  function validateBeforeSubmit() {
    if (!selectedCategory) return "اختر فئة أولًا.";
    if (!selectedService) return "اختر خدمة أولًا.";
    const trimmedLink = safeStr(link).trim();
    if (!trimmedLink) return "اكتب الرابط.";
    if (!readDesc) return "لازم تؤكد أنك قرأت وصف الخدمة.";
    if (!isPositiveIntLike(quantity)) return "الكمية لازم تكون رقم صحيح (0 أو أكثر).";
    if (quantity <= 0) return "الكمية لازم تكون أكبر من 0.";

    // Optional min/max validation if exists
    const min = Number(selectedService.min);
    const max = Number(selectedService.max);
    if (Number.isFinite(min) && quantity < min) return `أقل كمية لهذه الخدمة هي ${min}.`;
    if (Number.isFinite(max) && quantity > max) return `أقصى كمية لهذه الخدمة هي ${max}.`;

    return "";
  }

  async function createOrder() {
    const err = validateBeforeSubmit();
    if (err) {
      showMsg("error", err);
      return;
    }

    // NOTE: Upify API expects: service_id/provider_service_id + link + quantity
    // We’ll send provider_service_id as "service_id" OR "provider_service_id" depending on your Worker.
    // You previously had 400 invalid link/quantity issues, so we keep it clean.
    const payload = {
      provider_service_id: Number(selectedService.provider_service_id),
      link: safeStr(link).trim(),
      quantity: Number(quantity),
    };

    try {
      showMsg("info", "جارٍ إنشاء الطلب...");
      const apiBase = import.meta.env.VITE_API_BASE;
      if (!apiBase) {
        showMsg("error", "VITE_API_BASE غير موجود في البيئة.");
        return;
      }

      // Get Supabase access token for auth header
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        showMsg("error", "لازم تسجل دخول أولًا.");
        return;
      }

      const res = await fetch(`${apiBase}/v1/order/place`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        // customer-safe message from worker
        const msg = json?.message || "فشل إنشاء الطلب. راجع الرابط والكمية والخدمة.";
        showMsg("error", msg);
        return;
      }

      showMsg("success", "تم إنشاء الطلب بنجاح ✅");
      // reset after success
      setLink("");
      setQuantity(0);
      setReadDesc(false);
    } catch (e) {
      showMsg("error", `خطأ شبكة: ${e?.message || "Unknown error"}`);
    }
  }

  const customerTotal = useMemo(() => {
    return computeCustomerTotalPrice({ service: selectedService, quantity });
  }, [selectedService, quantity]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">طلب جديد</h1>
        <p className="text-sm text-gray-600 mt-1">
          اختر الفئة ثم الخدمة، اقرأ الوصف، ثم أكمل البيانات.
        </p>
      </div>

      {/* Message banner */}
      {uiMsg.text ? (
        <div
          className={[
            "mb-4 rounded-xl border px-4 py-3 text-sm",
            uiMsg.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : uiMsg.type === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-sky-200 bg-sky-50 text-sky-800",
          ].join(" ")}
        >
          {uiMsg.text}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-40 bg-gray-200 rounded" />
            <div className="h-10 w-full bg-gray-100 rounded" />
            <div className="h-10 w-full bg-gray-100 rounded" />
          </div>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 whitespace-pre-wrap">
          {loadError}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Categories grid */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">الفئات</h2>
                <span className="text-xs text-gray-500">{categories.length} فئة</span>
              </div>

              {categories.length === 0 ? (
                <div className="text-sm text-gray-600">لا توجد فئات متاحة.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categories.map((c) => {
                    const active = normalizeCategory(selectedCategory) === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => onPickCategory(c.key)}
                        className={[
                          "text-right rounded-2xl border px-4 py-4 transition",
                          "bg-white hover:bg-gray-50",
                          active ? "border-sky-300 ring-2 ring-sky-100" : "border-gray-200",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={[
                              "h-10 w-10 rounded-2xl flex items-center justify-center text-lg",
                              active ? "bg-sky-100" : "bg-gray-100",
                            ].join(" ")}
                            aria-hidden="true"
                          >
                            {c.badge || "📦"}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium leading-5">{c.label}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {servicesInCategory.length > 0 && active
                                ? `${servicesInCategory.length} خدمة`
                                : "اضغط لعرض الخدمات"}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Services + form */}
          <div className="lg:col-span-7 space-y-4">
            {/* Services list */}
            <div className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">الخدمات</h2>
                <span className="text-xs text-gray-500">
                  {selectedCategory ? `${servicesInCategory.length} خدمة` : "اختر فئة"}
                </span>
              </div>

              {!selectedCategory ? (
                <div className="text-sm text-gray-600">اختر فئة من اليسار لعرض الخدمات.</div>
              ) : servicesInCategory.length === 0 ? (
                <div className="text-sm text-gray-600">لا توجد خدمات داخل هذه الفئة.</div>
              ) : (
                <div className="max-h-[360px] overflow-auto pr-1 space-y-2">
                  {servicesInCategory.map((s) => {
                    const sid = String(s.provider_service_id);
                    const active = String(selectedServiceId) === sid;

                    // Service display name: try name, fallback to provider_service_id
                    const displayName = safeStr(s.name) || `Service #${sid}`;

                    return (
                      <button
                        key={sid}
                        type="button"
                        onClick={() => onPickService(sid)}
                        className={[
                          "w-full text-right rounded-2xl border px-4 py-3 transition",
                          "bg-white hover:bg-gray-50",
                          active ? "border-sky-300 ring-2 ring-sky-100" : "border-gray-200",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-sm font-medium leading-5">
                              {displayName}{" "}
                              <span className="text-xs text-gray-500">({sid})</span>
                            </div>

                            {/* Optional: show min/max as user-safe constraints */}
                            <div className="text-xs text-gray-500 mt-1">
                              {Number.isFinite(Number(s.min)) ? `Min: ${s.min}` : null}
                              {Number.isFinite(Number(s.min)) && Number.isFinite(Number(s.max))
                                ? " • "
                                : null}
                              {Number.isFinite(Number(s.max)) ? `Max: ${s.max}` : null}
                            </div>
                          </div>

                          <div className="text-xs text-gray-500 pt-0.5">ID</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order details */}
            <div className="rounded-2xl border bg-white p-4">
              <h2 className="font-semibold mb-3">بيانات الطلب</h2>

              {/* Link */}
              <label className="block text-sm font-medium mb-1">الرابط</label>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="ضع الرابط هنا"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
              />

              {/* Quantity */}
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">الكمية</label>
                <input
                  type="number"
                  value={quantity}
                  min={0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setQuantity(Math.max(0, Math.trunc(v)));
                  }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-300"
                />
                <p className="text-xs text-gray-500 mt-1">الافتراضي 0 — لازم تختار رقم أكبر من 0 لإنشاء طلب.</p>
              </div>

              {/* Description */}
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">وصف الخدمة</label>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap min-h-[90px]">
                  {selectedService
                    ? safeStr(selectedService.description) || "لا يوجد وصف لهذه الخدمة."
                    : "اختر خدمة لعرض الوصف."}
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={readDesc}
                    onChange={(e) => setReadDesc(e.target.checked)}
                    className="h-4 w-4"
                    disabled={!selectedService}
                  />
                  <span>أؤكد أنني قرأت وصف الخدمة</span>
                </label>
              </div>

              {/* Total price (optional placeholder) */}
              <div className="mt-4 rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">الإجمالي</span>
                  <span className="text-sm font-semibold">
                    {customerTotal === null ? "—" : customerTotal === 0 ? "0" : customerTotal}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  (سيتم عرض السعر النهائي للعميل فقط — بدون تكلفة المزود/الربح)
                </p>
              </div>

              {/* Submit */}
              <button
                type="button"
                onClick={createOrder}
                className="mt-4 w-full rounded-2xl bg-sky-600 text-white py-3 text-sm font-semibold hover:bg-sky-700 active:bg-sky-800 transition"
              >
                إنشاء الطلب
              </button>
              <p className="text-xs text-gray-500 mt-2">
                تذكير: لازم تختار خدمة وتقرأ الوصف وتضع رابط صحيح وكمية ضمن الحدود.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
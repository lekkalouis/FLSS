(() => {
  const FLAVOUR_COLORS = {
    Original: "#f59e0b",
    "Hot & Spicy": "#ef4444",
    "Worcester Sauce": "#f97316",
    "Red Wine & Garlic": "#b91c1c",
    Curry: "#eab308",
    Chutney: "#f97316",
    "Savoury Herb": "#22c55e",
    "Salt & Vinegar": "#38bdf8",
    Butter: "#fde047",
    "Sour Cream & Chives": "#a3e635",
    "Parmesan Cheese": "#facc15",
    "Cheese & Onion": "#fbbf24"
  };

  const PRODUCTS = [
    { sku: "FL002", title: "FL002 – Original Multi-Purpose Spice 200ml", flavour: "Original", size: "200ml", variantId: 42912375701551, weightKg: 0.195, prices: { standard: 45.0 } },
    { sku: "FL003", title: "FL003 – Original Multi-Purpose Spice 500g", flavour: "Original", size: "500g", variantId: 42912375734319, weightKg: 0.5, prices: { agent: 100.0 } },
    { sku: "FL004", title: "FL004 – Original Multi-Purpose Spice 1kg", flavour: "Original", size: "1kg", variantId: 42912375767087, weightKg: 1.007, prices: { standard: 200.0 } },
    { sku: "FL005", title: "FL005 – 750g Original Multi-Purpose Spice Bag", flavour: "Original", size: "750g", variantId: 43610261061679, weightKg: 0.75, prices: { standard: 78.0 } },
    { sku: "FL005-1", title: "FL005-1 – Original Multi-Purpose Spice Tub", flavour: "Original", size: "750g Tub", variantId: 43874490023983, weightKg: 0.75, prices: { standard: 110.0 } },
    { sku: "FL008", title: "FL008 – Hot & Spicy Multi-Purpose Spice 200ml", flavour: "Hot & Spicy", size: "200ml", variantId: 42912377012271, weightKg: 0.19, prices: { standard: 45.0 } },
    { sku: "FL009", title: "FL009 – Hot & Spicy Multi-Purpose Spice 500g", flavour: "Hot & Spicy", size: "500g", variantId: 42912377045039, weightKg: 0.51, prices: { standard: 100.0 } },
    { sku: "FL010", title: "FL010 – Hot & Spicy Multi-Purpose Spice 1kg", flavour: "Hot & Spicy", size: "1kg", variantId: 42912377077807, weightKg: 1.007, prices: { standard: 200.0 } },
    { sku: "FL014", title: "FL014 – Worcester Sauce Spice 200ml", flavour: "Worcester Sauce", size: "200ml", variantId: 42850656354351, weightKg: 0.2, prices: { standard: 45.0 } },
    { sku: "FL015", title: "FL015 – Worcester Sauce Spice 500g", flavour: "Worcester Sauce", size: "500g", variantId: 42850656387119, weightKg: 0.51, prices: { standard: 100.0 } },
    { sku: "FL016", title: "FL016 – Worcester Sauce Spice 1kg", flavour: "Worcester Sauce", size: "1kg", variantId: 42850656419887, weightKg: 1.007, prices: { standard: 200.0 } },
    { sku: "FL017", title: "FL017 – 750g Worcester Sauce Spice Bag", flavour: "Worcester Sauce", size: "750g", variantId: 43688854945839, weightKg: 0.75, prices: { standard: 78.0 } },
    { sku: "FL017-1", title: "FL017-1 – Worcester Sauce Spice Tub", flavour: "Worcester Sauce", size: "750g Tub", variantId: 43874490744879, weightKg: 0.75, prices: { standard: 110.0 } },
    { sku: "FL026", title: "FL026 – Red Wine & Garlic Sprinkle 200ml", flavour: "Red Wine & Garlic", size: "200ml", variantId: 42912378224687, weightKg: 0.2, prices: { standard: 45.0 } },
    { sku: "FL027", title: "FL027 – Red Wine & Garlic Sprinkle 500g", flavour: "Red Wine & Garlic", size: "500g", variantId: 42912378257455, weightKg: 0.51, prices: { standard: 100.0 } },
    { sku: "FL028", title: "FL028 – Red Wine & Garlic Sprinkle 1kg", flavour: "Red Wine & Garlic", size: "1kg", variantId: 42912378290223, weightKg: 1.007, prices: { standard: 200.0 } },
    { sku: "FL031", title: "FL031 – Flippen Lekka Curry Mix 250ml", flavour: "Curry", size: "250ml", variantId: 42912372031535, weightKg: 0.18, prices: { standard: 50.0 } },
    { sku: "FL032", title: "FL032 – Flippen Lekka Curry Mix 500g", flavour: "Curry", size: "500g", variantId: 42912372097071, weightKg: 0.51, prices: { standard: 110.0 } },
    { sku: "FL033", title: "FL033 – Flippen Lekka Curry Mix 1kg", flavour: "Curry", size: "1kg", variantId: 42912372129839, weightKg: 1.007, prices: { standard: 220.0 } },
    { sku: "FL035", title: "FL035 – Chutney Sprinkle 200ml", flavour: "Chutney", size: "200ml", variantId: 42873122291759, weightKg: 0.22, prices: { standard: 45.0 } },
    { sku: "FL037", title: "FL037 – Chutney Sprinkle 1kg", flavour: "Chutney", size: "1kg", variantId: 42873122357295, weightKg: 1.007, prices: { standard: 200.0 } },
    { sku: "FL038", title: "FL038 – Flippen Lekka Savoury Herb Mix 200ml", flavour: "Savoury Herb", size: "200ml", variantId: 43582507352111, weightKg: 0.12, prices: { standard: 45.0 } },
    { sku: "FL039", title: "FL039 – Flippen Lekka Savoury Herb Mix 500g", flavour: "Savoury Herb", size: "500g", variantId: 43582507384879, weightKg: 0.51, prices: { standard: 130.0 } },
    { sku: "FL041", title: "FL041 – Salt & Vinegar Seasoning 200ml", flavour: "Salt & Vinegar", size: "200ml", variantId: 42853317083183, weightKg: 0.22, prices: { standard: 45.0 } },
    { sku: "FL042", title: "FL042 – Salt & Vinegar Seasoning 500g", flavour: "Salt & Vinegar", size: "500g", variantId: 42853317115951, weightKg: 0.5, prices: { standard: 100.0 } },
    { sku: "FL043", title: "FL043 – Salt & Vinegar Seasoning 1kg", flavour: "Salt & Vinegar", size: "1kg", variantId: 42853317148719, weightKg: 0.2, prices: { standard: 200.0 } },
    { sku: "FL050", title: "FL050 – Butter Popcorn Sprinkle 100ml", flavour: "Butter", size: "100ml", variantId: 43609203376175, weightKg: 0.12, prices: { standard: 25.0 } },
    { sku: "FL053", title: "FL053 – Sour Cream & Chives Popcorn Sprinkle 100ml", flavour: "Sour Cream & Chives", size: "100ml", variantId: 43610081001519, weightKg: 0.12, prices: { standard: 25.0 } },
    { sku: "FL056", title: "FL056 – Chutney Popcorn Sprinkle 100ml", flavour: "Chutney", size: "100ml", variantId: 43610215350319, weightKg: 0.12, prices: { standard: 25.0 } },
    { sku: "FL059", title: "FL059 – Parmesan Cheese Popcorn Sprinkle 100ml", flavour: "Parmesan Cheese", size: "100ml", variantId: 43610217775151, weightKg: 0.11, prices: { standard: 25.0 } },
    { sku: "FL062", title: "FL062 – Cheese & Onion Popcorn Sprinkle 100ml", flavour: "Cheese & Onion", size: "100ml", variantId: 43610218037295, weightKg: 0.12, prices: { standard: 25.0 } },
    { sku: "FL065", title: "FL065 – Salt & Vinegar Popcorn Sprinkle 100ml", flavour: "Salt & Vinegar", size: "100ml", variantId: 43610218659887, weightKg: 0.15, prices: { standard: 25.0 } },
    { sku: "FLBS001", title: "FLBS001 – Original Multi Purpose Basting Sauce 375ml", flavour: "Original", size: "375ml", variantId: 43610234912815, weightKg: 0.42, prices: { standard: 30.0 } },
    { sku: "FLBS002", title: "FLBS002 – Original Multi Purpose Basting Sauce 12x375ml", flavour: "Original", size: "12 x 375ml", variantId: 43610234945583, weightKg: 5.0, prices: { standard: 360.0 } }
  ];

  const getFlavorColor = (flavour) =>
    FLAVOUR_COLORS[flavour] || "#94a3b8";

  const products = PRODUCTS.map((product) => ({
    ...product,
    flavourColor: getFlavorColor(product.flavour)
  }));

  const uniqueValues = (items, key) =>
    Array.from(
      new Set(items.map((item) => item[key]).filter(Boolean))
    ).sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));

  const filterProducts = (items, { query, flavour, size } = {}) => {
    const q = (query || "").trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !q
        ? true
        : item.sku.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q);
      const matchesFlavour = flavour ? item.flavour === flavour : true;
      const matchesSize = size ? item.size === size : true;
      return matchesQuery && matchesFlavour && matchesSize;
    });
  };

  window.FLSS_PRODUCTS = products;
  window.FLSS_PRODUCT_UTILS = {
    products,
    flavourColors: FLAVOUR_COLORS,
    getFlavorColor,
    uniqueValues,
    filterProducts
  };
})();

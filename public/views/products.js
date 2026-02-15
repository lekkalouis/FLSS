const CRATE_UNITS_BY_SIZE = {
  "100ml": 180,
  "200ml": 102,
  "500g": 40,
  "1kg": 20
};

const BASE_PRODUCTS = [
  {
    sku: "FL002",
    title: "Original Multi-Purpose Spice 200ml",
    flavour: "Original",
    size: "200ml",
    variantId: 42912375701551,
    weightKg: 0.195,
    prices: { standard: 45.0 }
  },
  {
    sku: "FL003",
    title: "Original Multi-Purpose Spice 500g",
    flavour: "Original",
    size: "500g",
    variantId: 42912375734319,
    weightKg: 0.5,
    prices: { standard: 100.0 }
  },
  {
    sku: "FL004",
    title: "Original Multi-Purpose Spice 1kg",
    flavour: "Original",
    size: "1kg",
    variantId: 42912375767087,
    weightKg: 1.007,
    prices: { standard: 200.0 }
  },
  {
    sku: "FL005",
    title: "Original Multi-Purpose Spice Bag 750g",
    flavour: "Original",
    size: "750g",
    variantId: 43610261061679,
    weightKg: 0.75,
    prices: { standard: 78.0 }
  },
  {
    sku: "FL005-1",
    title: "Original Multi-Purpose Spice Tub 750g",
    flavour: "Original",
    size: "750g Tub",
    variantId: 43874490023983,
    weightKg: 0.75,
    prices: { standard: 110.0 }
  },
  {
    sku: "FL008",
    title: "Hot & Spicy Multi-Purpose Spice 200ml",
    flavour: "Hot & Spicy",
    size: "200ml",
    variantId: 42912377012271,
    weightKg: 0.19,
    prices: { standard: 45.0 }
  },
  {
    sku: "FL009",
    title: "Hot & Spicy Multi-Purpose Spice 500g",
    flavour: "Hot & Spicy",
    size: "500g",
    variantId: 42912377045039,
    weightKg: 0.51,
    prices: { standard: 100.0 }
  },
  {
    sku: "FL010",
    title: "Hot & Spicy Multi-Purpose Spice 1kg",
    flavour: "Hot & Spicy",
    size: "1kg",
    variantId: 42912377077807,
    weightKg: 1.007,
    prices: { standard: 200.0 }
  },
  {
    sku: "FL014",
    title: "Worcester Sauce Spice 200ml",
    flavour: "Worcester Sauce",
    size: "200ml",
    variantId: 42850656354351,
    weightKg: 0.2,
    prices: { standard: 45.0 }
  },
  {
    sku: "FL015",
    title: "Worcester Sauce Spice 500g",
    flavour: "Worcester Sauce",
    size: "500g",
    variantId: 42850656387119,
    weightKg: 0.51,
    prices: { standard: 100.0 }
  },
  {
    sku: "FL016",
    title: "Worcester Sauce Spice 1kg",
    flavour: "Worcester Sauce",
    size: "1kg",
    variantId: 42850656419887,
    weightKg: 1.007,
    prices: { standard: 200.0 }
  },
  {
    sku: "FL017",
    title: "Worcester Sauce Spice Bag 750g",
    flavour: "Worcester Sauce",
    size: "750g",
    variantId: 43688854945839,
    weightKg: 0.75,
    prices: { standard: 78.0 }
  },
  {
    sku: "FL017-1",
    title: "Worcester Sauce Spice Tub 750g",
    flavour: "Worcester Sauce",
    size: "750g Tub",
    variantId: 43874490744879,
    weightKg: 0.75,
    prices: { standard: 110.0 }
  },
  {
    sku: "FL026",
    title: "Red Wine & Garlic Sprinkle 200ml",
    flavour: "Red Wine & Garlic",
    size: "200ml",
    variantId: 42912378224687,
    weightKg: 0.2,
    prices: { standard: 45.0 }
  },
  {
    sku: "FL027",
    title: "Red Wine & Garlic Sprinkle 500g",
    flavour: "Red Wine & Garlic",
    size: "500g",
    variantId: 42912378257455,
    weightKg: 0.51,
    prices: { standard: 100.0 }
  },
  {
    sku: "FL028",
    title: "Red Wine & Garlic Sprinkle 1kg",
    flavour: "Red Wine & Garlic",
    size: "1kg",
    variantId: 42912378290223,
    weightKg: 1.007,
    prices: { standard: 200.0 }
  },
  {
    sku: "FL031",
    title: "Flippen Lekka Curry Mix 250ml",
    flavour: "Curry",
    size: "250ml",
    variantId: 42912372031535,
    weightKg: 0.18,
    prices: { standard: 50.0 }
  },
  {
    sku: "FL032",
    title: "Flippen Lekka Curry Mix 500g",
    flavour: "Curry",
    size: "500g",
    variantId: 42912372097071,
    weightKg: 0.51,
    prices: { standard: 110.0 }
  },
  {
    sku: "FL033",
    title: "Flippen Lekka Curry Mix 1kg",
    flavour: "Curry",
    size: "1kg",
    variantId: 42912372129839,
    weightKg: 1.007,
    prices: { standard: 220.0 }
  },
  {
    sku: "FL035",
    title: "Chutney Sprinkle 200ml",
    flavour: "Chutney",
    size: "200ml",
    variantId: 42873122291759,
    weightKg: 0.22,
    prices: { standard: 45.0 }
  },
  {
    sku: "FL036",
    title: "Chutney Sprinkle 500g",
    flavour: "Chutney",
    size: "500g",
    variantId: 42873122324527,
    weightKg: 0.51,
    prices: { standard: 100.0 }
  },
  {
    sku: "FL037",
    title: "Chutney Sprinkle 1kg",
    flavour: "Chutney",
    size: "1kg",
    variantId: 42873122357295,
    weightKg: 1.007,
    prices: { standard: 200.0 }
  },
  {
    sku: "FL038",
    title: "Flippen Lekka Savoury Herb Mix 200ml",
    flavour: "Savoury Herb",
    size: "200ml",
    variantId: 43582507352111,
    weightKg: 0.12,
    prices: { standard: 45.0 }
  },
  {
    sku: "FL039",
    title: "Flippen Lekka Savoury Herb Mix 500g",
    flavour: "Savoury Herb",
    size: "500g",
    variantId: 43582507384879,
    weightKg: 0.51,
    prices: { standard: 130.0 }
  },
  {
    sku: "FL041",
    title: "Salt & Vinegar Seasoning 200ml",
    flavour: "Salt & Vinegar",
    size: "200ml",
    variantId: 42853317083183,
    weightKg: 0.22,
    prices: { standard: 45.0 }
  },
  {
    sku: "FL042",
    title: "Salt & Vinegar Seasoning 500g",
    flavour: "Salt & Vinegar",
    size: "500g",
    variantId: 42853317115951,
    weightKg: 0.5,
    prices: { standard: 100.0 }
  },
  {
    sku: "FL043",
    title: "Salt & Vinegar Seasoning 1kg",
    flavour: "Salt & Vinegar",
    size: "1kg",
    variantId: 42853317148719,
    weightKg: 0.2,
    prices: { standard: 200.0 }
  },
  {
    sku: "FL050",
    title: "Butter Popcorn Sprinkle 100ml",
    flavour: "Butter",
    size: "100ml",
    variantId: 43609203376175,
    weightKg: 0.12,
    prices: { standard: 25.0 }
  },
  {
    sku: "FL053",
    title: "Sour Cream & Chives Popcorn Sprinkle 100ml",
    flavour: "Sour Cream & Chives",
    size: "100ml",
    variantId: 43610081001519,
    weightKg: 0.12,
    prices: { standard: 25.0 }
  },
  {
    sku: "FL056",
    title: "Chutney Popcorn Sprinkle 100ml",
    flavour: "Chutney",
    size: "100ml",
    variantId: 43610215350319,
    weightKg: 0.12,
    prices: { standard: 25.0 }
  },
  {
    sku: "FL059",
    title: "Parmesan Cheese Popcorn Sprinkle 100ml",
    flavour: "Parmesan Cheese",
    size: "100ml",
    variantId: 43610217775151,
    weightKg: 0.11,
    prices: { standard: 25.0 }
  },
  {
    sku: "FL062",
    title: "Cheese & Onion Popcorn Sprinkle 100ml",
    flavour: "Cheese & Onion",
    size: "100ml",
    variantId: 43610218037295,
    weightKg: 0.12,
    prices: { standard: 25.0 }
  },
  {
    sku: "FL065",
    title: "Salt & Vinegar Popcorn Sprinkle 100ml",
    flavour: "Salt & Vinegar",
    size: "100ml",
    variantId: 43610218659887,
    weightKg: 0.15,
    prices: { standard: 25.0 }
  },
  {
    sku: "FLBS001",
    title: "Original Multi Purpose Basting Sauce 375ml",
    flavour: "Original",
    size: "375ml",
    variantId: 43610234912815,
    weightKg: 0.42,
    prices: { standard: 30.0 }
  },
  {
    sku: "GBOX",
    title: "Gift Box",
    flavour: "",
    size: "",
    variantId: null
  }
];

export const PRODUCT_LIST = BASE_PRODUCTS.map((product) => ({
  ...product,
  crateUnits: product.crateUnits ?? CRATE_UNITS_BY_SIZE[product.size] ?? 0
}));

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
    prices: {
      agent: 22.5,
      retail: 28.5,
      export: 25.0,
      private: 36.0,
      public: 45.0
    }
  },
  {
    sku: "FL003",
    title: "Original Multi-Purpose Spice 500g",
    flavour: "Original",
    size: "500g",
    variantId: 42912375734319,
    weightKg: 0.5,
    prices: {
      agent: 58.5,
      retail: 71.5,
      export: 72.5,
      private: 90.0,
      public: 100.0
    }
  },
  {
    sku: "FL004",
    title: "Original Multi-Purpose Spice 1kg",
    flavour: "Original",
    size: "1kg",
    variantId: 42912375767087,
    weightKg: 1.007,
    prices: {
      agent: 107.0,
      retail: 130.0,
      export: 135.0,
      private: 170.0,
      public: 200.0
    }
  },
  {
    sku: "FL005",
    title: "Original Multi-Purpose Spice Bag 750g",
    flavour: "Original",
    size: "750g",
    variantId: 43610261061679,
    weightKg: 0.75,
    prices: {
      agent: 75.0,
      retail: 110.0,
      export: null, // no 750g export listed
      private: 145.0,
      public: 78.0
    }
  },
  {
    sku: "FL008",
    title: "Hot & Spicy Multi-Purpose Spice 200ml",
    flavour: "Hot & Spicy",
    size: "200ml",
    variantId: 42912377012271,
    weightKg: 0.19,
    prices: {
      agent: 22.5,
      retail: 28.5,
      export: 25.0,
      private: 36.0,
      public: 45.0
    }
  },
  {
    sku: "FL031",
    title: "Flippen Lekka Curry Mix 250ml",
    flavour: "Curry",
    size: "250ml",
    variantId: 42912372031535,
    weightKg: 0.18,
    prices: {
      agent: 23.0,
      retail: 30.0,
      export: 26.0,
      private: 40.0,
      public: 50.0
    }
  },
  {
    sku: "FL032",
    title: "Flippen Lekka Curry Mix 500g",
    flavour: "Curry",
    size: "500g",
    variantId: 42912372097071,
    weightKg: 0.51,
    prices: {
      agent: 60.5,
      retail: 80.5,
      export: 82.5,
      private: 105.0,
      public: 110.0
    }
  },
  {
    sku: "FL033",
    title: "Flippen Lekka Curry Mix 1kg",
    flavour: "Curry",
    size: "1kg",
    variantId: 42912372129839,
    weightKg: 1.007,
    prices: {
      agent: 115.0,
      retail: 145.0,
      export: 155.0,
      private: 200.0,
      public: 220.0
    }
  },
  {
    sku: "FL050",
    title: "Butter Popcorn Sprinkle 100ml",
    flavour: "Butter",
    size: "100ml",
    variantId: 43609203376175,
    weightKg: 0.12,
    prices: {
      agent: 17.0,
      retail: 21.0,
      export: 22.0,
      private: 25.0,
      public: 25.0
    }
  },
  {
    sku: "FLBS001",
    title: "Original Multi Purpose Basting Sauce 375ml",
    flavour: "Original",
    size: "375ml",
    variantId: 43610234912815,
    weightKg: 0.42,
    prices: {
      agent: 22.0,
      retail: 24.0,
      export: 24.0,
      private: 30.0,
      public: 30.0
    }
  },
  {
    sku: "GBOX",
    title: "Gift Box",
    flavour: "",
    size: "",
    variantId: null,
    weightKg: 0,
    prices: {
      agent: null,
      retail: null,
      export: null,
      private: null,
      public: null
    }
  }
];

export const PRODUCT_LIST = BASE_PRODUCTS.map((product) => ({
  ...product,
  crateUnits: product.crateUnits ?? CRATE_UNITS_BY_SIZE[product.size] ?? 0
}));

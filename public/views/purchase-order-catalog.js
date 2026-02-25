const CATALOG_GROUPS = [
  {
    title: "FL raw spice blends (recipes)",
    items: [
      { sku: "FL-MP-PINTO", title: "Pinto Spice", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Original", icon: "🌿" },
      { sku: "MX-HERBS", title: "Herbs / Mixed Herbs", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "", icon: "🌿" },
      { sku: "LEAVES-BAY", title: "Herbs / Bay Leaves", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "", icon: "🌿" },
      { sku: "STICK-CINNA", title: "Herbs / Cinnamon Sticks", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "", icon: "🌿" },
      { sku: "MAIZE", title: "Maize", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "", icon: "🌽" },
      { sku: "BLEND-MP", title: "Flippen Lekka Spice Blend / Original Multi Purpose", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Original", icon: "🌿" },
      { sku: "BLEND-HS", title: "Flippen Lekka Spice Blend / Hot & Spicy", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Hot & Spicy", icon: "🔥" },
      { sku: "BLEND-CM", title: "Flippen Lekka Spice Blend / Curry Mix", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Curry", icon: "🍛" },
      { sku: "HEN-BB-BLEND", title: "Hennies Bietjie Blaf Spice Blend", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "", icon: "🌿" },
      { sku: "PS-CHO", title: "Popcorn Sprinkle / Cheese & Onion", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Cheese & Onion", icon: "🧀" },
      { sku: "PS-BUT", title: "Popcorn Sprinkle / Butter", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Butter", icon: "🧈" },
      { sku: "PS-PAR", title: "Popcorn Sprinkle / Parmesan", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Parmesan", icon: "🧀" },
      { sku: "FL-CM-GR", title: "FL Spice / Curry", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Curry", icon: "🍛" },
      { sku: "PS-SCC", title: "Popcorn Sprinkle / Sour Cream and Chives", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Sour Cream & Chives", icon: "🌿" },
      { sku: "PS-CHUT", title: "Popcorn Sprinkle / Chutney", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Chutney", icon: "🟣" },
      { sku: "FL-MP-GR", title: "FL Spice / Original", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Original", icon: "🌿" },
      { sku: "FL-WS-GR", title: "FL Spice / Worcester Sauce", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Worcester Sauce", icon: "🟣" },
      { sku: "PS-CHE", title: "Popcorn Sprinkle / Cheese", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Cheese", icon: "🧀" },
      { sku: "PS-SV", title: "Popcorn Sprinkle / Salt & Vinegar", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Salt & Vinegar", icon: "🧂" },
      { sku: "FL-CS-GR", title: "FL Spice / Chutney", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Chutney", icon: "🟣" },
      { sku: "FL-RG-GR", title: "FL Spice / Red Wine & Garlic", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Red Wine & Garlic", icon: "🧄" },
      { sku: "BLEND-SH", title: "Flippen Lekka Spice Blend / Savoury Herb Mix", uom: "kg", category: "FL raw spice blends (recipes)", flavour: "Savoury Herb", icon: "🌿" }
    ]
  },
  {
    title: "Containers , Lids and Bags",
    items: [
      { sku: "FLB100", title: "100ml PET Bottle", uom: "box", category: "Containers , Lids and Bags", flavour: "", icon: "🧴" },
      { sku: "FLB200", title: "200ml PET Bottle", uom: "box", category: "Containers , Lids and Bags", flavour: "", icon: "🧴" },
      { sku: "FL-CAP-O", title: "Flip Lid Cap / Orange", uom: "box", category: "Containers , Lids and Bags", flavour: "Orange", icon: "🟠" },
      { sku: "FL-CAP-R", title: "Flip Lid Cap / Red", uom: "box", category: "Containers , Lids and Bags", flavour: "Red", icon: "🔴" },
      { sku: "FL-CAP-P", title: "Flip Lid Cap / Purple", uom: "box", category: "Containers , Lids and Bags", flavour: "Purple", icon: "🟣" },
      { sku: "FL-CAP-LB", title: "Flip Lid Cap / Light Blue", uom: "box", category: "Containers , Lids and Bags", flavour: "Light Blue", icon: "🔵" },
      { sku: "FL-CAP-BRN", title: "Flip Lid Cap / Brown", uom: "box", category: "Containers , Lids and Bags", flavour: "Brown", icon: "🟤" }
    ]
  },
  {
    title: "Packaging and labelling",
    items: [
      { sku: "LBL-FL-MP", title: "FL Spice Label / Original", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Original", icon: "🏷️" },
      { sku: "LBL-FL-HS", title: "FL Spice Label / Hot & Spicy", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Hot & Spicy", icon: "🏷️" },
      { sku: "LBL-FL-CM", title: "FL Spice Label / Curry", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Curry", icon: "🏷️" },
      { sku: "LBL-FL-CS", title: "FL Spice Label / Chutney", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Chutney", icon: "🏷️" },
      { sku: "LBL-FL-RG", title: "FL Spice Label / Red Wine & Garlic", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Red Wine & Garlic", icon: "🏷️" },
      { sku: "LBL-FL-WS", title: "FL Spice Label / Worcester Sauce", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Worcester Sauce", icon: "🏷️" },
      { sku: "LBL-FL-SH", title: "FL Spice Label / Savoury Herb", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Savoury Herb", icon: "🏷️" },
      { sku: "LBL-PS-CHO", title: "Popcorn Sprinkle Label / Cheese & Onion", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Cheese & Onion", icon: "🏷️" },
      { sku: "LBL-PS-BUT", title: "Popcorn Sprinkle Label / Butter", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Butter", icon: "🏷️" },
      { sku: "LBL-PS-PAR", title: "Popcorn Sprinkle Label / Parmesan", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Parmesan", icon: "🏷️" },
      { sku: "LBL-PS-SCC", title: "Popcorn Sprinkle Label / Sour Cream and Chives", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Sour Cream & Chives", icon: "🏷️" },
      { sku: "LBL-PS-CHUT", title: "Popcorn Sprinkle Label / Chutney", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Chutney", icon: "🏷️" },
      { sku: "LBL-PS-CHE", title: "Popcorn Sprinkle Label / Cheese", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Cheese", icon: "🏷️" },
      { sku: "LBL-PS-SV", title: "Popcorn Sprinkle Label / Salt & Vinegar", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "Salt & Vinegar", icon: "🏷️" },
      { sku: "LBL-HEN-BB", title: "Hennies Bietjie Blaf Label", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "", icon: "🏷️" },
      { sku: "PACK-PAPER", title: "Packaging paper", uom: "ream", category: "Packaging and labelling", flavour: "", icon: "📦" },
      { sku: "CTN-12-100", title: "12 x 100ml cartons", uom: "bundle", category: "Packaging and labelling", flavour: "", icon: "📦" },
      { sku: "CTN-12-200", title: "12 x 200ml cartons", uom: "bundle", category: "Packaging and labelling", flavour: "", icon: "📦" },
      { sku: "CTN-24-200", title: "24 x 200ml cartons", uom: "bundle", category: "Packaging and labelling", flavour: "", icon: "📦" },
      { sku: "THERM-100X150", title: "Thermal Labels / 100x150", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "", icon: "🧾" },
      { sku: "THERM-100X50", title: "Thermal Labels / 100x50", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "", icon: "🧾" },
      { sku: "THERM-50X50-2UP", title: "Thermal Labels / 50x50 2up", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "", icon: "🧾" },
      { sku: "THERM-40X40-2UP", title: "Thermal Labels / 40x40 2up", uom: "roll", rollSize: 1000, category: "Packaging and labelling", flavour: "", icon: "🧾" },
      { sku: "TAPE-CLEAR", title: "Clear packaging tape", uom: "roll", category: "Packaging and labelling", flavour: "", icon: "📎" },
      { sku: "TAPE-FRAGILE", title: "Fragile packaging tape", uom: "roll", category: "Packaging and labelling", flavour: "", icon: "📎" }
    ]
  }
];

const PO_CATALOG = Object.freeze(CATALOG_GROUPS.map((group) => ({
  ...group,
  items: Object.freeze(group.items.map((item) => Object.freeze({ ...item })))
})));

const PO_CATALOG_ITEMS = Object.freeze(PO_CATALOG.flatMap((group) => group.items));

export { PO_CATALOG, PO_CATALOG_ITEMS };

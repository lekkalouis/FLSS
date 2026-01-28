(() => {
  const STORE_DIRECTORY = {
    Gauteng: [
      "Alberton",
      "Alpha Slaghuis",
      "Baobab Meats",
      "Big 5 Meat Market",
      "Biltong And Nut Hut",
      "Biltong Spot",
      "Boma Meat Deli",
      "Boma Meat Market (Moreleta Park)",
      "Boma Meat Market (Olympus)",
      "Boma Meat Market (Silverlakes)",
      "Bosveld Braai & Biltong",
      "Braai @ Moot",
      "Braai Chom",
      "Braai Mekka",
      "Brooklyn Biltong (Blaau Village)",
      "Brooklyn Biltong (Die Wilgers)",
      "Brooklyn Biltong (Ferndale)",
      "Brooklyn Biltong (Gezina)",
      "Brooklyn Biltong (Kyalami)",
      "Brooklyn Biltong (Waverley)",
      "Brooklyn Biltong (Wingtip)",
      "Bundu Bosveld Braai",
      "Carterville Fresh Meat",
      "Castle Gate (Pretoria)",
      "De Zoete Meat Deli",
      "Derdepark Butchery",
      "Die Water En Braai Winkel",
      "Don Amare Butchery",
      "Doornpark Vleismark",
      "Edelweiss Slaghuis",
      "Eland Slaghuis",
      "Farmers Meat Butchery",
      "Farmers Meat Market",
      "Fochville Tuisnywerheid",
      "Gooi Kole",
      "Groenkloof Oos Slaghuis (Glen Gables)",
      "Groenkloof Slaghuis",
      "Handelshuis N12",
      "Hardekool Slaghuis",
      "Hennies",
      "Hennies (Coming Soon)",
      "Hokaai (Faerie Glen)",
      "Hokaai (Lynnwood Golf Acres)",
      "Hokaai (Silverlakes)",
      "Hokaai Meat Market (Roodeplaat)",
      "Jansen's Meat Market",
      "JJ Meat Market",
      "Jou Slaghuis",
      "Kakiebos Vleismark",
      "Kameeldoring Braaihout",
      "Karee Slaghuis",
      "Kings Meat Deli (Castle Walk)",
      "Kings Meat Deli (Lynnwood Bridge)",
      "Legendary Butcher",
      "Lynx Meats",
      "Mambos Plastics",
      "Matts Meat Market",
      "Meat Mekka",
      "Meat Valley",
      "Meat World (Elarduspark)",
      "Meat World (Gateway Centurion)",
      "Meat World (Wonderboom)",
      "Meatworld Alberton",
      "Meatworld Boksburg",
      "Meatworld Edenvale",
      "Meatworld Krugersdorp",
      "Meatworld Northcliff",
      "Madivaal Slaghuis",
      "Mondanette",
      "Mondanette Butchery (Monument Park)",
      "Montagu",
      "Mountain View Slaghuis",
      "Nicks Butchery Roodepoort",
      "Noag Se Mark",
      "Penns Perfect Biltong",
      "Pick N Pay Wilro Park",
      "Plantation Farms",
      "Prime Cut Butchery",
      "R & M Express Biltong",
      "Rebel Food",
      "River Meat Deli",
      "Rouberto Building Materials",
      "Sampada Agri",
      "Sea Harvest (Xavier)",
      "Sea Harvest Factory Shop (Gezina)",
      "Sea Harvest Factory Shop (Rooihuiskraal)",
      "Sea Harvest Factory Shop (Silverton)",
      "Skaapstad (Silverlakes)",
      "Superspar (Menlyn Maine)",
      "Superspar (Monument Park)",
      "Superspar (Moreleta)",
      "Superspar (Saxby)",
      "Superspar (Sutherland)",
      "Superspar Parkrand",
      "Sweet And Salty Biltong Deli",
      "Telmark Butchery",
      "Tex Butchery",
      "The Biltong Shop",
      "The Butcher Brothers",
      "The Taste Butchery",
      "Tileba Slaghuis",
      "Toit's Slaghuis",
      "Tony's Meat Market",
      "Uitkyk Meat Market (Silverton)",
      "United Meat",
      "Vaal Slaghuis",
      "Van Zyls Meat Market",
      "VDM Meat Co",
      "Vleis Fabriek 1",
      "Vleis Fabriek 2",
      "Vuur En Vlam Butchery",
      "Waverley Slagtery",
      "Wierdapark Butchery"
    ],
    Mpumalanga: [
      "5 Star Superspar",
      "Belfast Superspar",
      "Breetbraai",
      "Brooklyn Biltong (Witbank)",
      "Butcherman",
      "Chop Chop Slaghuis",
      "Die Plaas Slaghuis",
      "El Madre Biltong & Braai",
      "Elvis Butchery",
      "Farm Inn",
      "Franks Meat (Middelburg)",
      "Franks Meat (Town Centre)",
      "Goudveld Slaghuis",
      "Hanynew Cold Storage",
      "Henrico's",
      "Henries (Coming Soon)",
      "Highland Superspar",
      "Highway Meat",
      "Hoofseun Vleiswerke",
      "Hyper Meat & Chicken",
      "Jitters Butchery And Take Aways",
      "Jumbo Meats",
      "Kalahari Slaghuis",
      "Kanonkop Superspar",
      "Kehls Superspar",
      "Lebambo's Supermarket",
      "Meat And Fish City",
      "Meat Masters",
      "Meatworld (Witbank)",
      "Midwater Superspar",
      "Nico's Slaghuis",
      "OK Express Secoray Shell Garage",
      "OK Foods Panorama Village Centre",
      "Parkville Butchery",
      "Saveway Superspar",
      "Secunda Superspar",
      "Super Braai Slaghuis",
      "The Deli Stroom",
      "Vleis Paleis",
      "Wonderpark Superspar"
    ],
    Limpopo: [
      "Alles Beste Padstal",
      "Beefmar Biltong",
      "Biltong Shop @ Pick N Pay",
      "Blyde Slaghuis",
      "Bosveld Biltong & Braai",
      "Bosveld Bou En Hardeware",
      "Bosveld Chemikaal",
      "Cross Spar",
      "Die Smaakbox",
      "Driehoek Slaghuis",
      "Ga-Raro Slaghuis",
      "Groblersdal Spar",
      "Groblersdal Vleismark",
      "JEM Slaghuis",
      "Lebamba",
      "Marula Hub",
      "Meatboys Mokopane",
      "Modimolle Superspar",
      "Soutpansberg Spar",
      "Sugar Hill OK",
      "Sugar Loaf OK",
      "The Steakshop Polokwane",
      "Tshipise Forever Resort",
      "Vivo Savemore",
      "Vivo Slaghuis",
      "Vleismark"
    ],
    "Eastern Cape": [
      "Ashram Superspar",
      "Balfour (East London)",
      "Beacon Bay (East London)",
      "Beesland Slaghuis",
      "Continental Deli",
      "Country Butcher",
      "Crossways Spar",
      "Dedi-Lee Superspar",
      "FS Biltong",
      "Gonubie Butcher Shop",
      "Hennies",
      "Kenton Butchery",
      "Lochners Biltong (Lorraine)",
      "Lochners Biltong (Moffat On Main)",
      "Lochners Biltong (Newton Park)",
      "Lochners Biltong (Summerstrand)",
      "Macnab's Plastics",
      "OK Foods Cambridge",
      "OK Foods Kidds Beach",
      "OK Meisies Halt",
      "Pine Creek",
      "Sebastian's Butchery",
      "Settlers Butchery",
      "Sparre Superspar",
      "Stadium Butchery",
      "Van Der Stel Slaghuis",
      "Victoria Butchery",
      "Weyers Country Meats",
      "William Moffett (Gqeberha)"
    ],
    "North West": [
      "Annette's Meat Products",
      "Ballie Park Spar",
      "Biltong & Steaks",
      "Body Fuel Express",
      "Bosveld Slaghuis",
      "Brits Pack 'N Spice",
      "Broederstroom Butchery",
      "Brooklyn Biltong (Brits)",
      "Brooklyn Biltong (Damdoryn)",
      "Goudchop N12 Vleismark",
      "Homestead Butchery",
      "Hyper Meat",
      "Jasmmyn Plaatprodukte",
      "North West Butchery",
      "Oos Einde Slaghuis",
      "Platteland Slaghuis",
      "Roosheuwel Slaghuis",
      "Rossouw Meat",
      "Schoemansville Butchery",
      "Sow Doringkruin",
      "Super Slaghuis",
      "Thorns Deli & Foodzone"
    ],
    "Northern Cape": [
      "Olifantshoek",
      "Port Nolloth",
      "Prieska",
      "Rhodesdene",
      "Springbok",
      "Towers KDV",
      "Village Mall",
      "Vredendal"
    ],
    "Free State": [
      "Bester Butchery",
      "Biltong & Braai",
      "Bloemfontein & Meat Deli",
      "Bloemfontein",
      "Hennies & Blades",
      "Iris Supermarket",
      "Pettoria?",
      "Phefumile Butchery",
      "Pioneer Valley",
      "Roux's Biltong Deli",
      "Uit Se Plek",
      "Viljoenskroon",
      "Welkom Mini Market",
      "Winburg Vleismark"
    ],
    "KwaZulu-Natal": [
      "Butcher Boys Ballito",
      "CJ Supplies",
      "Kgro Kitchen",
      "Klein Bosveld Slaghuis",
      "Kwagga Take Away",
      "M&S Butchery",
      "Maritzburg",
      "Mr Wozzies",
      "Natalia Meat Market",
      "Pick 'N Pay Pongola",
      "Richdens Superspar",
      "Shelly Beach Superspar",
      "Sugar & Spice",
      "The Banana Shop",
      "The Outspan Farmstall",
      "Umhlanga Meat Co",
      "Vryheid Padstal"
    ],
    "Western Cape": [
      "Bellville",
      "Brackenfell",
      "CAB Foods",
      "Durbanville"
    ],
    International: [
      "African Breeze",
      "African Hut",
      "Amazon.com.au",
      "Aubergine Foods",
      "Aubergine Foods CA",
      "Biltong St Marcus",
      "Kalahari Moon",
      "Keetmanshoop Spar",
      "KuierKos",
      "Nama Tota Butchery",
      "Namaqua Meat Market",
      "Out of Africa Trading",
      "Padstal Emporium",
      "Safari Outpost",
      "South Africa Snax",
      "Something From Home (NZ)",
      "South African Home Foods",
      "Springbok Delights",
      "Springbok Foods",
      "The South African Spaza Shop",
      "The Sussex Biltong Co",
      "Welkom USA",
      "Your South African Shop UK / Best Biltong"
    ]
  };

  const PROVINCE_CENTERS = {
    Gauteng: [-26.2041, 28.0473],
    Mpumalanga: [-25.4753, 30.9853],
    Limpopo: [-23.9045, 29.4689],
    "Eastern Cape": [-33.0153, 27.9116],
    "North West": [-25.6544, 27.2559],
    "Northern Cape": [-28.7282, 24.7499],
    "Free State": [-29.1211, 26.2140],
    "KwaZulu-Natal": [-29.8587, 31.0218],
    "Western Cape": [-33.9189, 18.4233],
    International: [10.0, 0.0]
  };

  const INTERNATIONAL_ANCHORS = [
    [-33.8688, 151.2093],
    [51.5074, -0.1278],
    [40.7128, -74.006],
    [43.6532, -79.3832],
    [-36.8485, 174.7633],
    [-22.9576, 18.4904]
  ];

  const map = L.map("map", { scrollWheelZoom: false }).setView([-28.5, 24.5], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const markersLayer = L.layerGroup().addTo(map);

  const provinceSelect = document.getElementById("provinceFilter");
  const storeSearch = document.getElementById("storeSearch");
  const storeList = document.getElementById("storeList");
  const storeSummary = document.getElementById("storeSummary");

  const provinces = Object.keys(STORE_DIRECTORY);
  const filters = ["All", "South Africa Only", ...provinces];

  provinceSelect.innerHTML = filters
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");

  const allStores = provinces.flatMap((province) =>
    STORE_DIRECTORY[province].map((name, index) => ({ name, province, index }))
  );

  const jitterPoint = (base, index) => {
    const angle = (index * 137.508) % 360;
    const radius = 0.12 + (index % 7) * 0.02;
    const rad = (Math.PI / 180) * angle;
    return [base[0] + Math.cos(rad) * radius, base[1] + Math.sin(rad) * radius];
  };

  const buildMarkers = (stores) => {
    markersLayer.clearLayers();
    const bounds = [];
    stores.forEach((store, idx) => {
      const base = PROVINCE_CENTERS[store.province] || [-28.5, 24.5];
      const position =
        store.province === "International"
          ? jitterPoint(INTERNATIONAL_ANCHORS[idx % INTERNATIONAL_ANCHORS.length], idx)
          : jitterPoint(base, store.index);
      bounds.push(position);
      const marker = L.circleMarker(position, {
        radius: 6,
        color: store.province === "International" ? "#f97316" : "#2563eb",
        fillColor: store.province === "International" ? "#fdba74" : "#93c5fd",
        fillOpacity: 0.85,
        weight: 1
      }).bindPopup(`<strong>${store.name}</strong><br>${store.province}`);
      markersLayer.addLayer(marker);
    });
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  const renderList = (stores) => {
    const grouped = stores.reduce((acc, store) => {
      acc[store.province] = acc[store.province] || [];
      acc[store.province].push(store);
      return acc;
    }, {});

    storeList.innerHTML = Object.keys(grouped)
      .sort()
      .map((province) => {
        const items = grouped[province]
          .map((store) => `<li>${store.name}</li>`)
          .join("");
        return `<div class="province-card"><h3>${province}</h3><ul>${items}</ul></div>`;
      })
      .join("");

    const count = stores.length;
    storeSummary.textContent = `${count} store${count === 1 ? "" : "s"} mapped.`;
  };

  const applyFilters = () => {
    const selected = provinceSelect.value;
    const query = storeSearch.value.trim().toLowerCase();

    let filtered = allStores;
    if (selected === "South Africa Only") {
      filtered = filtered.filter((store) => store.province !== "International");
    } else if (selected !== "All") {
      filtered = filtered.filter((store) => store.province === selected);
    }

    if (query) {
      filtered = filtered.filter((store) => store.name.toLowerCase().includes(query));
    }

    renderList(filtered);
    buildMarkers(filtered);
  };

  provinceSelect.addEventListener("change", applyFilters);
  storeSearch.addEventListener("input", applyFilters);

  applyFilters();
})();

let worldData = [];
let countryData = [];
let currentView = "overview";
let visibleSources = new Set(["solar", "wind", "hydro", "other"]);
let searchTerm = "";
let minGen = 5;

const GLOBAL_SHARE_2025 = 33.76;

const COLORS = {
  solar: "#f2b134",
  wind: "#5b9bd5",
  hydro: "#2e6f95",
  other: "#7a9a72",
  fossilNuclear: "#6b6259",
  accent: "#a78bfa",
  ink: "#e6ebee",
  muted: "#8a97a1"
};

const EXEMPLAR_COUNTRIES = [
  "China", "United States", "Germany", "Brazil",
  "Norway", "Costa Rica", "South Korea", "Iran"
];

const margin = { top: 20, right: 40, bottom: 54, left: 62 };
const width = 860 - margin.left - margin.right;
const height = 460 - margin.top - margin.bottom;

const fmtTWh = d3.format(",.0f");
const fmtPct = d3.format(".1f");

const svg = d3.select("#chart");
const tooltip = d3.select("#tooltip");

function clearChart() {
  svg.selectAll("*").remove();
  return svg.append("g")
    .attr("class", "chart-g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
}

function showTooltip(html, event) {
  const mainRect = document.querySelector(".room-main").getBoundingClientRect();
  tooltip
    .html(html)
    .style("left", (event.clientX - mainRect.left + 14) + "px")
    .style("top", (event.clientY - mainRect.top - 10) + "px")
    .attr("hidden", null);
}

function hideTooltip() {
  tooltip.attr("hidden", true);
}

const meterSvg = d3.select("#mix-meter");

const SEGMENT_MAP = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"]
};

const SEGMENT_RECTS = {
  a: { x: 4, y: 0, w: 16, h: 4 },
  g: { x: 4, y: 18, w: 16, h: 4 },
  d: { x: 4, y: 36, w: 16, h: 4 },
  f: { x: 0, y: 3, w: 4, h: 16 },
  b: { x: 20, y: 3, w: 4, h: 16 },
  e: { x: 0, y: 21, w: 4, h: 16 },
  c: { x: 20, y: 21, w: 4, h: 16 }
};

const DIGIT_CELL_WIDTH = 28;
const DOT_CELL_WIDTH = 12;

function buildMeter() {
  meterSvg.append("rect")
    .attr("x", 10).attr("y", 20).attr("width", 180).attr("height", 70)
    .attr("rx", 6)
    .attr("fill", "#10161b")
    .attr("stroke", COLORS.muted)
    .attr("stroke-width", 1);

  meterSvg.append("g").attr("id", "digit-display");

  meterSvg.append("text")
    .attr("x", 100).attr("y", 106)
    .attr("text-anchor", "middle")
    .attr("font-family", "Archivo, sans-serif")
    .attr("font-size", "9px")
    .attr("letter-spacing", "0.05em")
    .attr("fill", COLORS.muted)
    .text("% RENEWABLE");
}

function drawDigitGlyph(container, ch, xOffset) {
  const g = container.append("g").attr("transform", `translate(${xOffset},0)`);

  if (ch === ".") {
    g.append("rect")
      .attr("x", 3).attr("y", 36).attr("width", 5).attr("height", 5).attr("rx", 1)
      .attr("fill", COLORS.accent);
    return DOT_CELL_WIDTH;
  }

  const active = new Set(SEGMENT_MAP[ch] || []);
  Object.keys(SEGMENT_RECTS).forEach(seg => {
    const r = SEGMENT_RECTS[seg];
    g.append("rect")
      .attr("x", r.x).attr("y", r.y).attr("width", r.w).attr("height", r.h)
      .attr("rx", 1.5)
      .attr("fill", active.has(seg) ? COLORS.accent : "#232d34");
  });
  return DIGIT_CELL_WIDTH;
}

function setMeter(value) {
  const clamped = Math.max(0, Math.min(100, value));
  const str = clamped.toFixed(1);
  const container = meterSvg.select("#digit-display");
  container.selectAll("*").remove();

  const totalWidth = str.split("").reduce(
    (acc, ch) => acc + (ch === "." ? DOT_CELL_WIDTH : DIGIT_CELL_WIDTH), 0
  );
  const rowG = container.append("g").attr("transform", `translate(0,35)`);

  let x = 100 - totalWidth / 2;
  str.split("").forEach(ch => {
    const w = drawDigitGlyph(rowG, ch, x);
    x += w;
  });
}

buildMeter();


const READOUT_COPY = {
  overview: `For 25 years renewables held steady at about a fifth of the world's electricity, almost all of it hydropower. Then, starting around 2010, that share began to surge. By 2025 it reached ${fmtPct(GLOBAL_SHARE_2025)}%, driven almost entirely by solar and wind. Pick a storyline below to see how.`,
  source: `Solar and wind were rounding errors as recently as 2010. Since then, solar output has grown roughly 85 times over and wind nearly 8 times over. Solar alone added more electricity since 2020 (plus 1,925 TWh) than wind managed in its first 30 years combined (plus 1,588 TWh). Hydro, once nearly all of the world's renewable power, has barely doubled since 1985.`,
  country: `Scale and share are different stories. China now generates more solar and wind electricity than the United States, Germany, and Japan combined, yet fossil fuels still dominate its enormous grid. Meanwhile small systems like Norway and Costa Rica already run almost entirely on renewables. Hover any point to compare countries.`
};

const SCENE_LABEL = { overview: "OVERVIEW", source: "SOURCE STORY", country: "COUNTRY STORY" };

function updateChrome(view) {
  document.getElementById("readout-scene-label").textContent =
    view === "overview" ? "OVERVIEW" : `OVERVIEW \u203A ${SCENE_LABEL[view]}`;
  document.getElementById("readout-text").textContent = READOUT_COPY[view];

  const crumbSep = document.getElementById("crumb-sep");
  const crumbBranch = document.getElementById("crumb-branch");
  const crumbRoot = document.querySelector(".crumb-root");
  if (view === "overview") {
    crumbSep.hidden = true;
    crumbBranch.hidden = true;
    crumbRoot.classList.add("active");
  } else {
    crumbSep.hidden = false;
    crumbBranch.hidden = false;
    crumbBranch.textContent = SCENE_LABEL[view];
    crumbRoot.classList.remove("active");
  }

  document.getElementById("branch-buttons").hidden = view !== "overview";
  document.getElementById("btn-back").hidden = view === "overview";
  document.getElementById("source-controls").hidden = view !== "source";
  document.getElementById("country-controls").hidden = view !== "country";

  document.getElementById("meter-label").textContent =
    view === "country" ? "HOVER A COUNTRY" : "GLOBAL \u00B7 2025";
}

function drawAxes(g, xAxisGen, yAxisGen, xLabel, yLabel) {
  g.append("g").attr("class", "axis x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(xAxisGen);
  g.append("g").attr("class", "axis y-axis").call(yAxisGen);

  g.append("text").attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("x", width / 2).attr("y", height + 42)
    .text(xLabel);

  g.append("text").attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2).attr("y", -46)
    .text(yLabel);
}

function renderOverview() {
  const g = clearChart();

  const stacked = worldData.map(d => ({
    year: d.year,
    fossilNuclear: d.fossil + d.nuclear,
    hydro: d.hydro,
    other: d.other,
    wind: d.wind,
    solar: d.solar
  }));

  const keys = ["fossilNuclear", "hydro", "other", "wind", "solar"];
  const series = d3.stack().keys(keys)(stacked);

  const x = d3.scaleLinear().domain(d3.extent(worldData, d => d.year)).range([0, width]);
  const y = d3.scaleLinear().domain([0, 34000]).range([height, 0]);

  g.append("g").attr("class", "gridline")
    .call(d3.axisLeft(y).tickSize(-width).tickFormat("").ticks(6));

  const area = d3.area()
    .x(d => x(d.data.year))
    .y0(d => y(d[0]))
    .y1(d => y(d[1]));

  g.append("g").attr("class", "areas")
    .selectAll("path")
    .data(series)
    .join("path")
    .attr("fill", d => COLORS[d.key === "fossilNuclear" ? "fossilNuclear" : d.key])
    .attr("opacity", 0.92)
    .attr("d", area);

  drawAxes(
    g,
    d3.axisBottom(x).tickFormat(d3.format("d")).ticks(9),
    d3.axisLeft(y).tickFormat(d3.format("~s")),
    "Year",
    "Electricity generation (TWh)"
  );

  const idx2025 = worldData.findIndex(d => d.year === 2025);
  const idx2010 = worldData.findIndex(d => d.year === 2010);
  const solarBand2025 = series.find(s => s.key === "solar")[idx2025];
  const windBand2010 = series.find(s => s.key === "wind")[idx2010];

  const annotations = [
    {
      note: {
        title: `${fmtPct(GLOBAL_SHARE_2025)}% renewable by 2025`,
        label: "Up from about 19% in 1990. Nearly all the gain is solar and wind, stacked on top here.",
        wrap: 190
      },
      x: x(2025), y: y((solarBand2025[0] + solarBand2025[1]) / 2), dx: -100, dy: 180,
      connector: { end: "arrow" }
    },
    {
      note: {
        title: "The tipping point, ~2010",
        label: "Solar and wind costs fell far enough to start scaling fast.",
        wrap: 170
      },
      x: x(2010), y: y((windBand2010[0] + windBand2010[1]) / 2), dx: -180, dy: -90,
      connector: { end: "arrow" }
    }
  ];

  const makeAnnotations = d3.annotation()
    .type(d3.annotationCallout)
    .annotations(annotations);
  g.append("g").attr("class", "annotation-group").call(makeAnnotations);

  updateChrome("overview");
  setMeter(GLOBAL_SHARE_2025);
}

const SOURCE_LABELS = { solar: "SOLAR", wind: "WIND", hydro: "HYDRO", other: "OTHER RENEWABLES" };

const SOURCE_ICONS = {
  solar: `<svg class="source-icon" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><circle cx="7" cy="7" r="2.3"/><line x1="7" y1="0.8" x2="7" y2="2.6"/><line x1="7" y1="11.4" x2="7" y2="13.2"/><line x1="0.8" y1="7" x2="2.6" y2="7"/><line x1="11.4" y1="7" x2="13.2" y2="7"/><line x1="2.4" y1="2.4" x2="3.6" y2="3.6"/><line x1="10.4" y1="10.4" x2="11.6" y2="11.6"/><line x1="2.4" y1="11.6" x2="3.6" y2="10.4"/><line x1="10.4" y1="3.6" x2="11.6" y2="2.4"/></svg>`,
  wind: `<svg class="source-icon" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><line x1="7" y1="6" x2="7" y2="13.2"/><line x1="7" y1="6" x2="7" y2="0.8"/><line x1="7" y1="6" x2="11.3" y2="8.1"/><line x1="7" y1="6" x2="2.7" y2="8.1"/><circle cx="7" cy="6" r="0.9" fill="currentColor" stroke="none"/></svg>`,
  hydro: `<svg class="source-icon" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M1,5.5 Q3.5,2.5 6,5.5 T11,5.5"/><path d="M1,9.5 Q3.5,6.5 6,9.5 T11,9.5"/></svg>`,
  other: `<svg class="source-icon" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="M7,1 C11,3 11,9 7,13 C3,9 3,3 7,1 Z"/><line x1="7" y1="2.2" x2="7" y2="11.8"/></svg>`
};

function buildLegendToggles() {
  const wrap = d3.select("#legend-toggles");
  wrap.selectAll("*").remove();
  const keys = ["solar", "wind", "hydro", "other"];
  wrap.selectAll(".legend-toggle")
    .data(keys)
    .join("div")
    .attr("class", d => "legend-toggle" + (visibleSources.has(d) ? "" : " off"))
    .attr("tabindex", 0)
    .attr("role", "button")
    .html(d => `${SOURCE_ICONS[d]}<span class="swatch" style="background:${COLORS[d]}"></span>${SOURCE_LABELS[d]}`)
    .on("click", (event, d) => {
      if (visibleSources.has(d)) visibleSources.delete(d); else visibleSources.add(d);
      renderSourceScene(visibleSources);
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (visibleSources.has(d)) visibleSources.delete(d); else visibleSources.add(d);
        renderSourceScene(visibleSources);
      }
    });
}

function renderSourceScene(visibleSources) {
  const g = clearChart();

  const x = d3.scaleLinear().domain(d3.extent(worldData, d => d.year)).range([0, width]);
  const y = d3.scaleLog().domain([0.01, 5000]).range([height, 0]);

  g.append("g").attr("class", "gridline")
    .call(d3.axisLeft(y).tickValues([1, 10, 100, 1000]).tickSize(-width).tickFormat(""));

  const keys = ["solar", "wind", "hydro", "other"];
  const lineGen = d3.line().x(d => x(d.year)).y(d => y(Math.max(d.value, 0.01)));

  keys.filter(k => visibleSources.has(k)).forEach(key => {
    const values = worldData.map(d => ({ year: d.year, value: d[key] }));

    g.append("path")
      .datum(values)
      .attr("fill", "none")
      .attr("stroke", COLORS[key])
      .attr("stroke-width", 2.4)
      .attr("d", lineGen);

    g.selectAll(`.pt-${key}`)
      .data(values)
      .join("circle")
      .attr("class", `pt-${key}`)
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(Math.max(d.value, 0.01)))
      .attr("r", 8)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        showTooltip(
          `<span class="t-name">${SOURCE_LABELS[key]}, ${d.year}</span>${fmtTWh(d.value)} TWh`,
          event
        );
      })
      .on("mouseout", hideTooltip);
  });

  drawAxes(
    g,
    d3.axisBottom(x).tickFormat(d3.format("d")).ticks(9),
    d3.axisLeft(y).tickValues([1, 10, 100, 1000]).tickFormat(d3.format(",")),
    "Year",
    "Electricity generation, log scale (TWh)"
  );

  const annotations = [
    {
      note: {
        title: "Solar overtakes 30 years of wind growth in 5",
        label: "Solar added about 1,925 TWh since 2020 alone, more than wind's entire 1990 to 2020 gain.",
        wrap: 190
      },
      x: x(2025), y: y(2778.64), dx: -140, dy: 250,
      connector: { end: "arrow" }
    },
    {
      note: {
        title: "Hydro: steady, not surging",
        label: "The old renewable barely doubled in 40 years.",
        wrap: 150
      },
      x: x(2005), y: y(2911.77), dx: -250, dy: 40,
      connector: { end: "arrow" }
    }
  ];

  const makeAnnotations = d3.annotation()
    .type(d3.annotationCallout)
    .annotations(annotations.filter(a =>
      (a.note.title.includes("Solar") && visibleSources.has("solar")) ||
      (a.note.title.includes("Hydro") && visibleSources.has("hydro"))
    ));
  g.append("g").attr("class", "annotation-group").call(makeAnnotations);

  buildLegendToggles();
  updateChrome("source");
  setMeter(GLOBAL_SHARE_2025);
}

function renderCountryScene(searchTerm, minGen) {
  const g = clearChart();

  const x = d3.scaleLog().domain([5, 12000]).range([0, width]);
  const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);
  const rMax = d3.max(countryData, d => d.renewableTWh);
  const r = d3.scaleSqrt().domain([0, rMax]).range([3, 22]);

  g.append("g").attr("class", "gridline")
    .call(d3.axisLeft(y).tickSize(-width).tickFormat("").ticks(5));

  g.append("line")
    .attr("x1", 0).attr("x2", width)
    .attr("y1", y(GLOBAL_SHARE_2025)).attr("y2", y(GLOBAL_SHARE_2025))
    .attr("stroke", COLORS.accent).attr("stroke-dasharray", "4,3").attr("opacity", 0.6);
  g.append("text")
    .attr("x", width - 4).attr("y", y(GLOBAL_SHARE_2025) - 6)
    .attr("text-anchor", "end")
    .attr("class", "axis-label")
    .attr("fill", COLORS.accent)
    .text(`WORLD AVG ${fmtPct(GLOBAL_SHARE_2025)}%`);

  const visible = countryData.filter(d => d.gen >= minGen);
  const term = searchTerm.trim().toLowerCase();

  g.append("g").attr("class", "bubbles")
    .selectAll("circle")
    .data(visible)
    .join("circle")
    .attr("cx", d => x(d.gen))
    .attr("cy", d => y(d.share))
    .attr("r", d => r(d.renewableTWh))
    .attr("fill", d => EXEMPLAR_COUNTRIES.includes(d.country) ? COLORS.accent : "#4a5b66")
    .attr("stroke", d => EXEMPLAR_COUNTRIES.includes(d.country) ? "#eafffb" : "none")
    .attr("stroke-width", 1)
    .attr("opacity", d => {
      if (!term) return EXEMPLAR_COUNTRIES.includes(d.country) ? 0.95 : 0.55;
      return d.country.toLowerCase().includes(term) ? 1 : 0.12;
    })
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      showTooltip(
        `<span class="t-name">${d.country}</span>` +
        `${fmtPct(d.share)}% renewable &middot; ${fmtTWh(d.gen)} TWh total<br>` +
        `Solar ${fmtTWh(d.solar)} &middot; Wind ${fmtTWh(d.wind)} &middot; Hydro ${fmtTWh(d.hydro)}`,
        event
      );
      setMeter(d.share);
      document.getElementById("meter-label").textContent = d.country.toUpperCase();
    })
    .on("mouseout", () => {
      hideTooltip();
      setMeter(GLOBAL_SHARE_2025);
      document.getElementById("meter-label").textContent = "HOVER A COUNTRY";
    });

  g.append("g").attr("class", "exemplar-labels")
    .selectAll("text")
    .data(visible.filter(d => EXEMPLAR_COUNTRIES.includes(d.country)))
    .join("text")
    .attr("x", d => x(d.gen) + r(d.renewableTWh) + 5)
    .attr("y", d => y(d.share) + 3)
    .attr("class", "axis-label")
    .attr("fill", COLORS.ink)
    .attr("opacity", d => !term || d.country.toLowerCase().includes(term) ? 1 : 0.12)
    .text(d => d.country);

  drawAxes(
    g,
    d3.axisBottom(x).tickValues([10, 100, 1000, 10000]).tickFormat(d3.format(",")),
    d3.axisLeft(y).tickFormat(d => d + "%"),
    "Total electricity generation, log scale (TWh)",
    "Share from renewables (%)"
  );

  const china = countryData.find(d => d.country === "China");
  const annotations = [
    {
      note: {
        title: "Biggest scale, middling share",
        label: `China generates ${fmtTWh(china.gen)} TWh, more than double the US, but is still only ${fmtPct(china.share)}% renewable.`,
        wrap: 190
      },
      x: x(china.gen), y: y(china.share), dx: -160, dy: 60,
      connector: { end: "arrow" }
    },
    {
      note: {
        title: "Small grids, (almost) all renewable",
        label: "Norway and Costa Rica already run on nearly 100% hydro, wind & solar.",
        wrap: 170
      },
      x: x(160), y: y(99), dx: 90, dy: 55,
      connector: { end: "arrow" }
    }
  ];
  const makeAnnotations = d3.annotation().type(d3.annotationCallout).annotations(annotations);
  g.append("g").attr("class", "annotation-group").call(makeAnnotations);

  updateChrome("country");
  setMeter(GLOBAL_SHARE_2025);
}

document.getElementById("btn-source").addEventListener("click", () => {
  currentView = "source";
  renderSourceScene(visibleSources);
});
document.getElementById("btn-country").addEventListener("click", () => {
  currentView = "country";
  renderCountryScene(searchTerm, minGen);
});
document.getElementById("btn-back").addEventListener("click", () => {
  currentView = "overview";
  renderOverview();
});
document.querySelector(".crumb-root").addEventListener("click", () => {
  currentView = "overview";
  renderOverview();
});

document.getElementById("country-search").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderCountryScene(searchTerm, minGen);
});
document.getElementById("gen-slider").addEventListener("input", (e) => {
  minGen = +e.target.value;
  document.getElementById("gen-slider-label").textContent = `${minGen} TWh`;
  renderCountryScene(searchTerm, minGen);
});

Promise.all([
  d3.csv("data/world_electricity_by_source.csv", d3.autoType),
  d3.csv("data/countries_2025.csv", d3.autoType)
]).then(([world, countries]) => {
  worldData = world.map(d => ({
    year: d.year,
    solar: d.solar_electricity,
    wind: d.wind_electricity,
    hydro: d.hydro_electricity,
    other: d.other_renewable_electricity,
    fossil: d.fossil_electricity,
    nuclear: d.nuclear_electricity,
    renewShare: d.renewables_share_elec,
    total: d.electricity_generation
  }));

  countryData = countries.map(d => ({
    country: d.country,
    share: d.renewables_share_elec,
    solar: d.solar_electricity || 0,
    wind: d.wind_electricity || 0,
    hydro: d.hydro_electricity || 0,
    other: d.other_renewable_electricity || 0,
    fossil: d.fossil_electricity || 0,
    gen: d.electricity_generation,
    renewableTWh: (d.solar_electricity || 0) + (d.wind_electricity || 0) +
                  (d.hydro_electricity || 0) + (d.other_renewable_electricity || 0)
  }));

  renderOverview();
});


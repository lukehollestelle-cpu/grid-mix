/* ============================================================================
   THE GRID MIX
   Narrative visualization of global electricity generation by source
   (Our World in Data energy dataset — World 1985-2025, countries 2025)

   NARRATIVE STRUCTURE: Drill-down
     Scene "overview"  -> establishes the whole-world trend + the punchline
     Scene "source"    -> branch: how solar/wind overtook hydro (line chart)
     Scene "country"   -> branch: scale vs. share by country (bubble chart)
     Both branches allow free hover/filter exploration; a back trigger
     always returns to the overview.

   PARAMETERS (state variables):
     currentView      - "overview" | "source" | "country"
     visibleSources   - Set of source keys shown in the Source Story
     searchTerm       - text filter in the Country Story
     minGen           - minimum grid size (TWh) filter in the Country Story
     hoveredDatum     - datum currently under the pointer (drives tooltip + meter)

   TRIGGERS:
     #btn-source / #btn-country click   -> currentView = "source"/"country"
     #btn-back / breadcrumb root click  -> currentView = "overview"
     .legend-toggle click               -> toggle visibleSources, re-render
     #country-search input              -> searchTerm, re-render highlight
     #gen-slider input                  -> minGen, re-render filter
     mouseover/mouseout on marks        -> hoveredDatum, tooltip + meter update
   ============================================================================ */

// ---------------------------------------------------------------------------
// PARAMETERS
// ---------------------------------------------------------------------------
let worldData = [];
let countryData = [];
let currentView = "overview";
let visibleSources = new Set(["solar", "wind", "hydro", "other"]);
let searchTerm = "";
let minGen = 5;

const GLOBAL_SHARE_2025 = 33.76;
const GLOBAL_SHARE_1990 = 19.06;

// ---------------------------------------------------------------------------
// COLORS (mirrors the CSS custom properties, kept as JS hex for D3 .attr calls)
// ---------------------------------------------------------------------------
const COLORS = {
  solar: "#f2b134",
  wind: "#5b9bd5",
  hydro: "#2e6f95",
  other: "#7a9a72",
  fossilNuclear: "#6b6259",
  accent: "#35e0c4",
  ink: "#e6ebee",
  muted: "#8a97a1"
};

const EXEMPLAR_COUNTRIES = [
  "China", "United States", "Germany", "Brazil",
  "Norway", "Costa Rica", "South Korea", "Iran"
];

// ---------------------------------------------------------------------------
// LAYOUT CONSTANTS
// ---------------------------------------------------------------------------
const margin = { top: 20, right: 40, bottom: 54, left: 62 };
const width = 860 - margin.left - margin.right;
const height = 460 - margin.top - margin.bottom;

const fmtTWh = d3.format(",.0f");
const fmtPct = d3.format(".1f");

// ---------------------------------------------------------------------------
// SVG SCAFFOLD
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GRID MIX METER (signature element — 270 deg progress ring, 0-100%)
// ---------------------------------------------------------------------------
const meterSvg = d3.select("#mix-meter");
const meterCx = 100, meterCy = 95, meterR = 62;
const meterStartAngle = -135 * (Math.PI / 180);
const meterEndAngle = 135 * (Math.PI / 180);
const meterAngleScale = d3.scaleLinear().domain([0, 100]).range([meterStartAngle, meterEndAngle]);

let meterCurrentAngle = meterStartAngle;

function buildMeter() {
  const track = d3.arc()
    .innerRadius(meterR - 13).outerRadius(meterR)
    .startAngle(meterStartAngle).endAngle(meterEndAngle);

  meterSvg.append("path")
    .attr("d", track())
    .attr("transform", `translate(${meterCx},${meterCy})`)
    .attr("fill", "#182229");

  const ticks = [0, 25, 50, 75, 100];
  meterSvg.selectAll(".meter-tick")
    .data(ticks)
    .join("line")
    .attr("class", "meter-tick")
    .attr("x1", d => meterCx + (meterR - 15) * Math.sin(meterAngleScale(d)))
    .attr("y1", d => meterCy - (meterR - 15) * Math.cos(meterAngleScale(d)))
    .attr("x2", d => meterCx + (meterR + 2) * Math.sin(meterAngleScale(d)))
    .attr("y2", d => meterCy - (meterR + 2) * Math.cos(meterAngleScale(d)))
    .attr("stroke", COLORS.muted)
    .attr("stroke-width", 1);

  meterSvg.append("path").attr("id", "meter-fill").attr("fill", COLORS.accent);

  meterSvg.append("text")
    .attr("id", "meter-value")
    .attr("x", meterCx).attr("y", meterCy - 2)
    .attr("text-anchor", "middle")
    .attr("font-family", "IBM Plex Mono, monospace")
    .attr("font-size", "25px")
    .attr("font-weight", "500")
    .attr("fill", COLORS.accent)
    .text("--");

  meterSvg.append("text")
    .attr("x", meterCx).attr("y", meterCy + 18)
    .attr("text-anchor", "middle")
    .attr("font-family", "IBM Plex Mono, monospace")
    .attr("font-size", "9px")
    .attr("fill", COLORS.muted)
    .text("% RENEWABLE");
}

function setMeter(value, instant) {
  const clamped = Math.max(0, Math.min(100, value));
  const targetAngle = meterAngleScale(clamped);
  const fillArc = d3.arc().innerRadius(meterR - 13).outerRadius(meterR).startAngle(meterStartAngle);

  const sel = meterSvg.select("#meter-fill").attr("transform", `translate(${meterCx},${meterCy})`);
  const valueSel = meterSvg.select("#meter-value");
  const startAngle = meterCurrentAngle;

  if (instant) {
    sel.attr("d", fillArc.endAngle(targetAngle)());
    valueSel.text(clamped.toFixed(1));
    meterCurrentAngle = targetAngle;
    return;
  }

  sel.transition().duration(750).ease(d3.easeCubicOut)
    .attrTween("d", () => {
      const i = d3.interpolate(startAngle, targetAngle);
      return t => fillArc.endAngle(i(t))();
    })
    .on("end", () => { meterCurrentAngle = targetAngle; });

  valueSel.transition().duration(750)
    .tween("text", function () {
      const node = this;
      const current = parseFloat(d3.select(node).text()) || 0;
      const i = d3.interpolateNumber(current, clamped);
      return t => d3.select(node).text(i(t).toFixed(1));
    });
}

buildMeter();

// ---------------------------------------------------------------------------
// BREADCRUMB + READOUT + CONTROL VISIBILITY (shared UI chrome)
// ---------------------------------------------------------------------------
const READOUT_COPY = {
  overview: `For 25 years renewables held steady at about one-fifth of the world's electricity — almost all of it hydropower. Then, starting around 2010, that share began to surge. By 2025 it reached ${fmtPct(GLOBAL_SHARE_2025)}%, driven almost entirely by solar and wind. Pick a storyline below to see how.`,
  source: `Solar and wind were rounding errors as recently as 2010. Since then, solar output has grown roughly 85-fold and wind nearly 8-fold — solar alone added more electricity since 2020 (+1,925 TWh) than wind managed in its first 30 years combined (+1,588 TWh). Hydro, once nearly all of the world's renewable power, has barely doubled since 1985.`,
  country: `Scale and share are different stories. China now generates more solar and wind electricity than the United States, Germany, and Japan combined — yet fossil fuels still dominate its enormous grid. Meanwhile small systems like Norway and Costa Rica already run almost entirely on renewables. Hover any point to compare countries.`
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

// ---------------------------------------------------------------------------
// AXES HELPER
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// SCENE: OVERVIEW  (stacked area, fossil+nuclear beneath a renewables band)
// ---------------------------------------------------------------------------
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

  // annotations — point at the true edges of the stacked bands, not guessed numbers
  const idx2025 = worldData.findIndex(d => d.year === 2025);
  const idx2010 = worldData.findIndex(d => d.year === 2010);
  const solarBand2025 = series.find(s => s.key === "solar")[idx2025];
  const windBand2010 = series.find(s => s.key === "wind")[idx2010];

  const annotations = [
    {
      note: {
        title: `${fmtPct(GLOBAL_SHARE_2025)}% renewable by 2025`,
        label: "Up from ~19% in 1990 — nearly all the gain is solar and wind, stacked on top here.",
        wrap: 190
      },
      x: x(2025), y: y((solarBand2025[0] + solarBand2025[1]) / 2), dx: -180, dy: -60,
      connector: { end: "arrow" }
    },
    {
      note: {
        title: "The tipping point, ~2010",
        label: "Solar and wind costs fell far enough to start scaling fast.",
        wrap: 170
      },
      x: x(2010), y: y((windBand2010[0] + windBand2010[1]) / 2), dx: -20, dy: -90,
      connector: { end: "arrow" }
    }
  ];

  const makeAnnotations = d3.annotation()
    .type(d3.annotationCallout)
    .annotations(annotations);
  g.append("g").attr("class", "annotation-group").call(makeAnnotations);

  updateChrome("overview");
}

// ---------------------------------------------------------------------------
// SCENE: SOURCE STORY (log-scale line chart, toggleable series)
// ---------------------------------------------------------------------------
const SOURCE_LABELS = { solar: "SOLAR", wind: "WIND", hydro: "HYDRO", other: "OTHER RENEWABLES" };

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
    .html(d => `<span class="swatch" style="background:${COLORS[d]}"></span>${SOURCE_LABELS[d]}`)
    .on("click", (event, d) => {
      if (visibleSources.has(d)) visibleSources.delete(d); else visibleSources.add(d);
      renderSourceScene();
    })
    .on("keydown", (event, d) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (visibleSources.has(d)) visibleSources.delete(d); else visibleSources.add(d);
        renderSourceScene();
      }
    });
}

function renderSourceScene() {
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
          `<span class="t-name">${SOURCE_LABELS[key]} \u2014 ${d.year}</span>${fmtTWh(d.value)} TWh`,
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
        label: "Solar added ~1,925 TWh since 2020 alone \u2014 more than wind's entire 1990\u20132020 gain.",
        wrap: 190
      },
      x: x(2025), y: y(2778.64), dx: -190, dy: -50,
      connector: { end: "arrow" }
    },
    {
      note: {
        title: "Hydro: steady, not surging",
        label: "The old renewable barely doubled in 40 years.",
        wrap: 150
      },
      x: x(2005), y: y(2911.77), dx: 40, dy: -60,
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

  // signature motion: sweep the meter from the 1990 baseline to 2025 on entry
  setMeter(GLOBAL_SHARE_1990, true);
  setTimeout(() => setMeter(GLOBAL_SHARE_2025, false), 250);
}

// ---------------------------------------------------------------------------
// SCENE: COUNTRY STORY (bubble chart — scale vs. share, log x)
// ---------------------------------------------------------------------------
function renderCountryScene() {
  const g = clearChart();

  const x = d3.scaleLog().domain([5, 12000]).range([0, width]);
  const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);
  const rMax = d3.max(countryData, d => d.renewableTWh);
  const r = d3.scaleSqrt().domain([0, rMax]).range([3, 22]);

  g.append("g").attr("class", "gridline")
    .call(d3.axisLeft(y).tickSize(-width).tickFormat("").ticks(5));

  // world average reference line
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
      setMeter(d.share, false);
      document.getElementById("meter-label").textContent = d.country.toUpperCase();
    })
    .on("mouseout", () => {
      hideTooltip();
      setMeter(GLOBAL_SHARE_2025, false);
      document.getElementById("meter-label").textContent = "HOVER A COUNTRY";
    });

  // persistent labels for exemplar countries
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
        label: `China generates ${fmtTWh(china.gen)} TWh \u2014 more than double the US \u2014 but is still only ${fmtPct(china.share)}% renewable.`,
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
      x: x(160), y: y(99), dx: 60, dy: -30,
      connector: { end: "arrow" }
    }
  ];
  const makeAnnotations = d3.annotation().type(d3.annotationCallout).annotations(annotations);
  g.append("g").attr("class", "annotation-group").call(makeAnnotations);

  updateChrome("country");
  setMeter(GLOBAL_SHARE_2025, true);
}

// ---------------------------------------------------------------------------
// TRIGGERS
// ---------------------------------------------------------------------------
document.getElementById("btn-source").addEventListener("click", () => {
  currentView = "source";
  renderSourceScene();
});
document.getElementById("btn-country").addEventListener("click", () => {
  currentView = "country";
  renderCountryScene();
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
  renderCountryScene();
});
document.getElementById("gen-slider").addEventListener("input", (e) => {
  minGen = +e.target.value;
  document.getElementById("gen-slider-label").textContent = `${minGen} TWh`;
  renderCountryScene();
});

// ---------------------------------------------------------------------------
// DATA LOAD
// ---------------------------------------------------------------------------
Promise.all([
  d3.csv("data/world_electricity_by_source.csv", d3.autoType),
  d3.csv("data/countries_2025.csv", d3.autoType)
]).then(([world, countries]) => {
  // map raw CSV column names to the short field names the scene functions use
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

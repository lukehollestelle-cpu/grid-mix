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
const meterCx = 100, meterCy = 95, meterR = 62;
const meterStartAngle = -135 * (Math.PI / 180);
const meterEndAngle = 135 * (Math.PI / 180);
const meterAngleScale = d3.scaleLinear().domain([0, 100]).range([meterStartAngle, meterEndAngle]);

function buildMeter() {
  const track = d3.arc()
    .innerRadius(meterR - 13).outerRadius(meterR)
    .startAngle(meterStartAngle).endAngle(meterEndAngle);

  meterSvg.append("path")
    .attr("d", track())
    .attr("transform", `translate(${meterCx},${meterCy})`)
    .attr("fill", "#2b3742");

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
    .attr("font-family", "IBM Plex Sans, sans-serif")
    .attr("font-size", "25px")
    .attr("font-weight", "500")
    .attr("fill", COLORS.accent)
    .text("--");

  meterSvg.append("text")
    .attr("x", meterCx).attr("y", meterCy + 18)
    .attr("text-anchor", "middle")
    .attr("font-family", "IBM Plex Sans, sans-serif")
    .attr("font-size", "9px")
    .attr("fill", COLORS.muted)
    .text("% RENEWABLE");
}

function setMeter(value) {
  const clamped = Math.max(0, Math.min(100, value));
  const angle = meterAngleScale(clamped);
  const fillArc = d3.arc()
    .innerRadius(meterR - 13).outerRadius(meterR)
    .startAngle(meterStartAngle).endAngle(angle);

  meterSvg.select("#meter-fill")
    .attr("transform", `translate(${meterCx},${meterCy})`)
    .attr("d", fillArc());

  meterSvg.select("#meter-value").text(clamped.toFixed(1));
}

buildMeter();

const READOUT_COPY = {
  overview: `For 25 years renewable consistently represented about a fifth of the world's electricity (Most of that being represented by hydropower). Then in 2010, that fraction began to increase drastically. By 2025 it reached ${fmtPct(GLOBAL_SHARE_2025)}%, driven almost entirely by solar and wind. Choose a storyline below to see the trend.`,
  source: `Solar and wind were negligible before around 2010. Since then, solar output has grown roughly 85x and wind nearly 8x. Solar alone added more electricity since 2020 (~1,900 TWh) than wind managed in its first 30 years combined (~1,600 TWh). Hydropower, once nearly all of the world's renewable power, has barely doubled since 1985.`,
  country: `Scale and share don't necessarily correlate as much as you would think. For example, China currently generates more solar and wind electricity than the US, Germany, and Japan combined, but fossil fuels still dominate its overall power consumption. Meanwhile smaller countries like Norway and Costa Rica already run almost entirely on renewables. Hover over any point to compare countries.`
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


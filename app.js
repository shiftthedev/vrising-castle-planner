(function () {
  'use strict';

  var DATA = window.REGIONS_DATA || {};

  // x/y are fractions (0-1) of the map image, pin position = center of region on the map.
  // Eyeballed against assets/map.webp — nudge these if a pin lands off-zone.
  var REGION_GROUPS = [
    { name: 'Oakveil Woodlands', sheets: ['Oakveil Woodlands'], x: 0.184, y: 0.231 },
    { name: 'Silverlight Hills', sheets: ['Silverlight Hills'], x: 0.217, y: 0.447 },
    { name: 'Hallowed Mountains', sheets: ['Hallowed Mountains'], x: 0.741, y: 0.578 },
    { name: 'Gloomrot North', sheets: ['Gloomrot North'], x: 0.345, y: 0.176 },
    { name: 'Gloomrot South', sheets: ['Gloomrot South'], x: 0.492, y: 0.229 },
    { name: 'Dunley Farmlands', sheets: ['Dunley Farmlands West', 'Dunley Farmlands East'], x: 0.492, y: 0.45 },
    { name: 'Cursed Forest', sheets: ['Cursed Forest'], x: 0.671, y: 0.207 },
    { name: 'Farbane Woods', sheets: ['Farbane Woods 1', 'Farbane Woods 2', 'Farbane Woods 3', 'Farbane Woods 4', 'Farbane Woods 5'], x: 0.482, y: 0.687 }
  ];

  // Sub-areas (Farbane Woods 1-5, Dunley Farmlands West/East) are an internal data-organization
  // detail only — anything shown to the user should say just the region name.
  function groupNameFor(sheet) {
    var g = REGION_GROUPS.find(function (g) { return g.sheets.indexOf(sheet) !== -1; });
    return g ? g.name : sheet;
  }

  var TERRAIN = {
    '.': { label: 'Off plot', color: null },
    'R': { label: 'Road', color: '#8C8585' },
    'H': { label: 'Higher unbuildable', color: '#453321' },
    'U': { label: 'Unbuildable', color: '#6A543D' },
    'W': { label: 'Water', color: '#5FA5D7' },
    'P': { label: 'Platform', color: '#7DA26C' },
    'G': { label: 'Sludge', color: '#DCC35F' },
    'S': { label: 'Slopes / Stairs', color: '#7DA26C' },
    'B': { label: 'Bridge', color: '#B99B6B' }
  };
  var INTERIOR_COLOR = '#3a3226';
  // Buildability is not read off the terrain code directly: Platform, Slopes,
  // and Bridge are ground/transition/crossing tiles, not build area. The only
  // allowed area is the interior enclosed by the plot's terrain outline —
  // void ('.') cells that are NOT connected to the grid's outer edge through
  // other void cells.
  function computeInterior(cells, width, height) {
    var visited = [];
    for (var r = 0; r < height; r++) visited.push(new Array(width).fill(false));
    var queue = [];
    for (var r = 0; r < height; r++) {
      for (var c = 0; c < width; c++) {
        if ((r === 0 || r === height - 1 || c === 0 || c === width - 1) && cells[r][c] === '.' && !visited[r][c]) {
          visited[r][c] = true;
          queue.push([r, c]);
        }
      }
    }
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length) {
      var cur = queue.pop();
      for (var d = 0; d < 4; d++) {
        var nr = cur[0] + dirs[d][0], nc = cur[1] + dirs[d][1];
        if (nr >= 0 && nr < height && nc >= 0 && nc < width && !visited[nr][nc] && cells[nr][nc] === '.') {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
    var interior = [];
    for (var r2 = 0; r2 < height; r2++) {
      var row = [];
      for (var c2 = 0; c2 < width; c2++) row.push(cells[r2][c2] === '.' && !visited[r2][c2]);
      interior.push(row);
    }
    return interior;
  }

  var PALETTE = [
    { group: 'Tools', key: '__erase', label: 'Erase', color: '#000000', erase: true },
    { group: 'Structure', key: 'floor', label: 'Floor', color: '#c9b896' },
    { group: 'Structure', key: 'door', label: 'Door', color: '#8a5a2e' },
    { group: 'Structure', key: 'stair', label: 'Stair', color: '#7a6a4a' },
    { group: 'Structure', key: 'heart', label: 'Castle Heart', color: '#a8433a' },
    { group: 'Structure', key: 'invisible', label: 'Invisible', color: '#4a4a4a' },
    { group: 'Structure', key: 'waypoint', label: 'Waypoint', color: '#3f9c9c' },
    { group: 'Rooms', key: 'throne', label: 'Throne Room', color: '#7a3fa0' },
    { group: 'Rooms', key: 'bedroom', label: 'Bedroom', color: '#3f6fa0' },
    { group: 'Rooms', key: 'garden', label: 'Garden', color: '#4f9d4f' },
    { group: 'Rooms', key: 'hallway', label: 'Hallway', color: '#9a8a6a' },
    { group: 'Rooms', key: 'servants', label: 'Servants Bedroom', color: '#6a4a6a' },
    { group: 'Rooms', key: 'catacombs', label: 'Catacombs', color: '#3a3a4a' },
    { group: 'Rooms', key: 'prison', label: 'Prison', color: '#3a3a3a' },
    { group: 'Production', key: 'workshop', label: 'Workshop', color: '#b5793a' },
    { group: 'Production', key: 'forge', label: 'Forge', color: '#c0522a' },
    { group: 'Production', key: 'alchemy', label: 'Alchemy Lab', color: '#3a9c8a' },
    { group: 'Production', key: 'tailor', label: 'Tailor', color: '#a0763f' },
    { group: 'Production', key: 'library', label: 'Library', color: '#6a5a3a' },
    { group: 'Production', key: 'treasury', label: 'Treasury', color: '#c9a83f' },
    { group: 'Production', key: 'jewelry', label: 'Jewelry', color: '#c9c9df' }
  ];

  // Structural layer: painted on the lines between cells (walls/doors/windows), not the cells
  // themselves. Kept as a separate tool set + data layer from the room-fill PALETTE above.
  var WALL_PALETTE = [
    { key: '__erase', label: 'Erase', erase: true },
    { key: 'wall', label: 'Wall', color: '#5a5a5a', width: 5 },
    { key: 'door', label: 'Door', color: '#c9973f', width: 5 },
    { key: 'window', label: 'Window', color: '#5FA5D7', width: 5 }
  ];
  var EDGE_IDLE_COLOR = 'rgba(255,255,255,0.08)';

  // Must match --cell-size in style.css exactly — the wall overlay is plain SVG, not CSS grid,
  // so it needs the real pixel size to line its lines up with the cells underneath.
  var CELL_PX = 34.375;

  var state = {
    view: 'home',
    group: null,
    sheet: null,
    plotId: null,
    floor: null,
    tool: PALETTE[1],
    layer: 'floor', // 'floor' | 'wall' — which layer the plot editor is currently painting
    wallTool: WALL_PALETTE[1],
    plans: {},
    outline: {}, // "r,c" -> true, cells filled in the castle-outline designer
    settings: { customFloorLimit: false, maxFloors: 5 }
  };
  var painting = false;

  // ---- Local persistence (autosave to this browser) ----
  var STORAGE_KEY = 'vrising-castle-planner:v1';
  var saveTimer = null;
  function saveToStorage() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, plans: state.plans, outline: state.outline }));
      } catch (err) {
        // storage full/unavailable (e.g. private browsing) — plans still work in-memory this session
      }
    }, 300);
  }
  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && data.plans) state.plans = data.plans;
      if (data && data.outline) state.outline = data.outline;
    } catch (err) {
      // corrupt/unreadable saved data — start fresh rather than crash
    }
  }

  var SETTINGS_KEY = 'vrising-castle-planner:settings:v1';
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (err) {
      // storage full/unavailable — settings still work in-memory this session
    }
  }
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data.customFloorLimit === 'boolean') state.settings.customFloorLimit = data.customFloorLimit;
      if (data && Number.isInteger(data.maxFloors) && data.maxFloors >= 0) state.settings.maxFloors = data.maxFloors;
    } catch (err) {
      // corrupt/unreadable saved data — fall back to defaults
    }
  }

  function planKey(sheet, plotId) { return sheet + '|' + plotId; }
  function getPlot(sheet, plotId) {
    var plots = (DATA[sheet] && DATA[sheet].plots) || [];
    for (var i = 0; i < plots.length; i++) if (plots[i].id === plotId) return plots[i];
    return null;
  }
  // A floor's saved plan is { cells: {"r,c": {...}}, edges: {"h:r,c" / "v:r,c": {...}} }.
  // Older exported plans stored the cell map directly as the floor's value with no wrapper —
  // isNestedFloorPlan tells those apart so old plan files still load correctly.
  function isNestedFloorPlan(fp) { return !!fp && (fp.cells !== undefined || fp.edges !== undefined); }
  function floorPlanCells(fp) { if (!fp) return {}; return isNestedFloorPlan(fp) ? (fp.cells || {}) : fp; }
  function floorPlanEdges(fp) { if (!fp) return {}; return isNestedFloorPlan(fp) ? (fp.edges || {}) : {}; }
  function ensureFloorPlan(plan, floorName) {
    var fp = plan[floorName];
    if (!fp) {
      fp = { cells: {}, edges: {} };
    } else if (!isNestedFloorPlan(fp)) {
      fp = { cells: fp, edges: {} }; // migrate old flat format
    } else {
      if (!fp.cells) fp.cells = {};
      if (!fp.edges) fp.edges = {};
    }
    plan[floorName] = fp;
    return fp;
  }
  function ensurePlan(sheet, plotId) {
    var k = planKey(sheet, plotId);
    if (!state.plans[k]) state.plans[k] = {};
    return state.plans[k];
  }
  function planHasContent(sheet, plotId) {
    var k = planKey(sheet, plotId);
    var p = state.plans[k];
    if (!p) return false;
    for (var f in p) {
      if (Object.keys(floorPlanCells(p[f])).length || Object.keys(floorPlanEdges(p[f])).length) return true;
    }
    return false;
  }
  function countPaintedTiles(sheet, plotId) {
    var k = planKey(sheet, plotId);
    var p = state.plans[k];
    if (!p) return 0;
    var n = 0;
    for (var f in p) n += Object.keys(floorPlanCells(p[f])).length;
    return n;
  }

  var el = {};
  ['nav-home', 'crumb-region', 'crumb-plot', 'btn-import', 'btn-export', 'file-import',
   'view-home', 'view-region', 'view-plot', 'view-design', 'map-pins', 'region-title', 'plot-grid',
   'plot-title', 'tile-usage', 'palette', 'grid', 'legend', 'floor-below-overlay',
   'btn-design', 'design-dims', 'design-grid', 'design-palette', 'design-cellcount', 'design-results',
   'btn-design-clear', 'btn-design-find', 'btn-copy-floor', 'btn-paste-floor', 'btn-clear-floor',
   'btn-clear-plot', 'btn-clear-all', 'btn-floor-up', 'btn-floor-down', 'floor-spinner-value',
   'btn-layer-floor', 'btn-layer-wall', 'wall-palette', 'wall-overlay',
   'btn-settings', 'settings-overlay', 'btn-settings-close', 'settings-custom-floor-limit',
   'settings-max-floors', 'btn-clear-settings'
  ].forEach(function (id) { el[id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = document.getElementById(id); });

  function showView(name) {
    state.view = name;
    el.viewHome.classList.toggle('hidden', name !== 'home');
    el.viewRegion.classList.toggle('hidden', name !== 'region');
    el.viewPlot.classList.toggle('hidden', name !== 'plot');
    el.viewDesign.classList.toggle('hidden', name !== 'design');
    var hasPlans = Object.keys(state.plans).length !== 0;
    el.btnExport.disabled = !hasPlans;
    el.btnClearAll.disabled = !hasPlans;
  }

  function updateBreadcrumb() {
    el.crumbRegion.textContent = '';
    el.crumbRegion.className = 'crumb-sep';
    el.crumbPlot.textContent = '';
    el.crumbPlot.className = 'crumb-sep';

    if (state.group) {
      el.crumbRegion.textContent = state.group.name;
      el.crumbRegion.classList.add('link');
      el.crumbRegion.onclick = function () { openRegion(state.group); };
    }
    if (state.plotId !== null && state.plotId !== undefined) {
      el.crumbPlot.textContent = 'Plot ' + state.plotId;
    }
  }

  // ---- Home ----
  function renderHome() {
    el.mapPins.innerHTML = '';
    REGION_GROUPS.forEach(function (group) {
      var totalPlots = 0;
      group.sheets.forEach(function (s) { totalPlots += ((DATA[s] && DATA[s].plots) || []).length; });

      var pin = document.createElement('button');
      pin.className = 'map-pin';
      pin.style.left = (group.x * 100) + '%';
      pin.style.top = (group.y * 100) + '%';
      pin.setAttribute('aria-label', group.name);
      pin.onclick = function () { openRegion(group); };

      var label = document.createElement('div');
      label.className = 'map-pin-label';
      label.style.left = (group.x * 100) + '%';
      label.style.top = (group.y * 100) + '%';
      label.innerHTML = group.name + '<span class="plots">' + totalPlots + ' castle plots</span>';

      el.mapPins.appendChild(pin);
      el.mapPins.appendChild(label);
    });
    state.group = null; state.sheet = null; state.plotId = null;
    updateBreadcrumb();
    showView('home');
  }

  // ---- Region ----
  function openRegion(group) {
    state.group = group;
    state.sheet = null;
    renderRegionView();
  }

  function renderRegionView() {
    el.regionTitle.textContent = state.group.name;
    var entries = [];
    state.group.sheets.forEach(function (sheet) {
      ((DATA[sheet] && DATA[sheet].plots) || []).forEach(function (p) {
        entries.push({ sheet: sheet, plot: p });
      });
    });
    entries.sort(function (a, b) { return a.plot.id - b.plot.id; });

    el.plotGrid.innerHTML = '';
    entries.forEach(function (entry) {
      var sheet = entry.sheet, p = entry.plot;
      var badge = document.createElement('div');
      var has = planHasContent(sheet, p.id);
      badge.className = 'plot-badge' + (has ? ' has-plan' : '');
      badge.innerHTML = '<div class="pid">#' + p.id + '</div><div class="ptiles">' +
        (p.base_tiles ? p.base_tiles + ' base tiles' : '') + '</div>';
      badge.insertBefore(makePlotThumb(sheet, p), badge.firstChild);
      badge.onclick = function () { openPlot(sheet, p.id); };
      el.plotGrid.appendChild(badge);
    });
    state.sheet = null; state.plotId = null;
    updateBreadcrumb();
    showView('region');
  }

  function makePlotThumb(sheet, plot) {
    var images = window.PLOT_IMAGES && window.PLOT_IMAGES[sheet];
    var src = images && images[plot.id];
    if (src) {
      var img = document.createElement('img');
      img.className = 'plot-thumb';
      img.src = src;
      img.alt = 'Plot ' + plot.id;
      img.loading = 'lazy';
      return img;
    }
    var canvas = document.createElement('canvas');
    canvas.className = 'plot-thumb';
    canvas.width = 96;
    canvas.height = 96;
    drawPlotThumb(canvas, plot);
    return canvas;
  }

  function drawPlotThumb(canvas, plot) {
    var floorName = Object.keys(plot.floors)[0];
    var floor = plot.floors[floorName];
    var interior = computeInterior(floor.cells, floor.width, floor.height);
    var scale = Math.min(canvas.width / floor.width, canvas.height / floor.height);
    var offX = (canvas.width - floor.width * scale) / 2;
    var offY = (canvas.height - floor.height * scale) / 2;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var r = 0; r < floor.height; r++) {
      for (var c = 0; c < floor.width; c++) {
        var code = floor.cells[r][c];
        var isInteriorVoid = code === '.' && interior[r][c];
        var color = isInteriorVoid ? INTERIOR_COLOR : (TERRAIN[code] && TERRAIN[code].color);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(offX + c * scale, offY + r * scale, Math.ceil(scale), Math.ceil(scale));
      }
    }
  }

  // ---- Castle outline designer ----
  // Matching only looks at each plot's ground floor (elevated floors have their own separate
  // footprints and stairwell constraints that don't belong in a single flat outline match).
  function groundFloorName(plot) { return Object.keys(plot.floors)[0]; }
  function groundFloor(plot) { return plot.floors[groundFloorName(plot)]; }

  // Canvas size = the single biggest ground-floor grid (by bounding-box area) across every
  // plot in the game, so anything drawable on it is at least in the right ballpark for some plot.
  var DESIGN_DIMS = (function () {
    var best = { width: 10, height: 10, area: 0 };
    Object.keys(DATA).forEach(function (sheet) {
      (DATA[sheet].plots || []).forEach(function (p) {
        var f = groundFloor(p);
        var area = f.width * f.height;
        if (area > best.area) best = { width: f.width, height: f.height, area: area };
      });
    });
    return best;
  })();

  function renderDesignView() {
    el.designDims.textContent = DESIGN_DIMS.width + ' × ' + DESIGN_DIMS.height;
    el.designResults.innerHTML = '';
    renderPalette(el.designPalette);
    var grid = el.designGrid;
    grid.style.gridTemplateColumns = 'repeat(' + DESIGN_DIMS.width + ', var(--cell-size))';
    grid.style.gridTemplateRows = 'repeat(' + DESIGN_DIMS.height + ', var(--cell-size))';
    grid.innerHTML = '';

    for (var r = 0; r < DESIGN_DIMS.height; r++) {
      for (var c = 0; c < DESIGN_DIMS.width; c++) {
        (function (r, c) {
          var key = r + ',' + c;
          var cellDiv = document.createElement('div');
          cellDiv.className = 'cell buildable';
          var placed = state.outline[key];
          if (placed) {
            cellDiv.style.background = placed.color;
            cellDiv.title = placed.label;
            cellDiv.textContent = placed.label.slice(0, 1).toUpperCase();
          }
          function apply() {
            if (state.tool.erase) {
              delete state.outline[key];
              cellDiv.style.background = '';
              cellDiv.title = '';
              cellDiv.textContent = '';
            } else {
              var p = { type: state.tool.key, label: state.tool.label, color: state.tool.color };
              state.outline[key] = p;
              cellDiv.style.background = p.color;
              cellDiv.title = p.label;
              cellDiv.textContent = p.label.slice(0, 1).toUpperCase();
            }
            updateDesignCellCount();
            saveToStorage();
          }
          cellDiv.addEventListener('mousedown', function (e) {
            e.preventDefault();
            painting = true;
            apply();
          });
          cellDiv.addEventListener('mouseenter', function () {
            if (painting) apply();
          });
          grid.appendChild(cellDiv);
        })(r, c);
      }
    }
    updateDesignCellCount();
    updateBreadcrumb();
    showView('design');
  }

  function updateDesignCellCount() {
    var n = Object.keys(state.outline).length;
    el.designCellcount.textContent = n + ' cell' + (n === 1 ? '' : 's') + ' drawn';
  }

  el.btnDesign.onclick = function () {
    state.group = null; state.sheet = null; state.plotId = null;
    renderDesignView();
  };
  el.btnDesignClear.onclick = function () {
    state.outline = {};
    saveToStorage();
    renderDesignView();
  };

  // Each outline cell carries its painted room value along through normalization/rotation,
  // so a matched fit can be copied straight into a plot's plan (not just checked for size).
  function outlineToCells() {
    var pts = Object.keys(state.outline).map(function (k) {
      var parts = k.split(',');
      return { r: parseInt(parts[0], 10), c: parseInt(parts[1], 10), value: state.outline[k] };
    });
    var minR = Math.min.apply(null, pts.map(function (p) { return p.r; }));
    var minC = Math.min.apply(null, pts.map(function (p) { return p.c; }));
    return pts.map(function (p) { return { r: p.r - minR, c: p.c - minC, value: p.value }; });
  }

  function rotateCells(cells, times) {
    var out = cells;
    for (var t = 0; t < times; t++) {
      // 90° clockwise: (r,c) -> (c, maxR - r)
      var maxR = Math.max.apply(null, out.map(function (p) { return p.r; }));
      out = out.map(function (p) { return { r: p.c, c: maxR - p.r, value: p.value }; });
    }
    return out;
  }

  function boundsOf(cells) {
    return {
      w: Math.max.apply(null, cells.map(function (p) { return p.c; })) + 1,
      h: Math.max.apply(null, cells.map(function (p) { return p.r; })) + 1
    };
  }

  function findFit(cells, dims, interior, floorW, floorH) {
    if (dims.w > floorW || dims.h > floorH) return null;
    for (var dy = 0; dy <= floorH - dims.h; dy++) {
      for (var dx = 0; dx <= floorW - dims.w; dx++) {
        var ok = true;
        for (var i = 0; i < cells.length; i++) {
          var rr = cells[i].r + dy, cc = cells[i].c + dx;
          if (!interior[rr][cc]) { ok = false; break; }
        }
        if (ok) return { dy: dy, dx: dx };
      }
    }
    return null;
  }

  el.btnDesignFind.onclick = function () {
    var outlineCells = outlineToCells();
    if (outlineCells.length === 0) {
      el.designResults.innerHTML = '<p class="hint-text">Draw an outline first.</p>';
      return;
    }
    var rotations = [];
    var r0 = outlineCells;
    for (var t = 0; t < 4; t++) {
      rotations.push(r0);
      r0 = rotateCells(r0, 1);
    }
    var rotData = rotations.map(function (cells) { return { cells: cells, dims: boundsOf(cells) }; });
    var neededCount = outlineCells.length;

    var matches = []; // { sheet, plotId, cells, dy, dx }
    Object.keys(DATA).forEach(function (sheet) {
      (DATA[sheet].plots || []).forEach(function (p) {
        var floor = groundFloor(p);
        var interior = computeInterior(floor.cells, floor.width, floor.height);
        var interiorCount = 0;
        for (var r = 0; r < floor.height; r++) for (var c = 0; c < floor.width; c++) if (interior[r][c]) interiorCount++;
        if (interiorCount < neededCount) return;
        for (var ri = 0; ri < rotData.length; ri++) {
          var fit = findFit(rotData[ri].cells, rotData[ri].dims, interior, floor.width, floor.height);
          if (fit) {
            matches.push({ sheet: sheet, plotId: p.id, cells: rotData[ri].cells, dy: fit.dy, dx: fit.dx });
            break;
          }
        }
      });
    });

    renderDesignResults(matches);
  };

  function copyOutlineToPlot(m) {
    var plot = getPlot(m.sheet, m.plotId);
    var floorName = groundFloorName(plot);
    var plan = ensurePlan(m.sheet, m.plotId);
    var fp = ensureFloorPlan(plan, floorName);
    m.cells.forEach(function (cellObj) {
      var key = (cellObj.r + m.dy) + ',' + (cellObj.c + m.dx);
      fp.cells[key] = cellObj.value;
    });
    saveToStorage();
    openPlot(m.sheet, m.plotId, floorName);
  }

  function renderDesignResults(matches) {
    if (matches.length === 0) {
      el.designResults.innerHTML = '<p class="hint-text">No plot has a spot that fits this outline. Try a smaller or different shape.</p>';
      return;
    }
    var wrap = document.createElement('div');
    var summary = document.createElement('p');
    summary.className = 'hint-text';
    summary.textContent = matches.length + ' plot' + (matches.length === 1 ? '' : 's') + ' fit this outline on the ground floor:';
    wrap.appendChild(summary);
    var grid = document.createElement('div');
    grid.className = 'plot-grid';
    matches.forEach(function (m) {
      var plot = getPlot(m.sheet, m.plotId);
      var badge = document.createElement('div');
      badge.className = 'plot-badge';
      badge.innerHTML = '<div class="pid">#' + m.plotId + '</div><div class="ptiles">' + groupNameFor(m.sheet) + '</div>';
      badge.insertBefore(makePlotThumb(m.sheet, plot), badge.firstChild);
      badge.onclick = function () { openPlot(m.sheet, m.plotId, groundFloorName(plot)); };
      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy-to-plot-btn';
      copyBtn.textContent = 'Copy to Plot';
      copyBtn.onclick = function (e) { e.stopPropagation(); copyOutlineToPlot(m); };
      badge.appendChild(copyBtn);
      grid.appendChild(badge);
    });
    wrap.appendChild(grid);
    el.designResults.innerHTML = '';
    el.designResults.appendChild(wrap);
  }

  // ---- Plot editor ----
  // Ground Floor displays as 0, Floor N as N. Capped by default at 5 even though some plots'
  // data goes up to Floor 6 (index 6) — floors above the cap aren't reachable from the UI.
  // The cap is overridden by state.settings.maxFloors when the user turns on a custom limit.
  var DEFAULT_FLOOR_CAP = 5;
  function floorDisplayCap() {
    return state.settings.customFloorLimit ? state.settings.maxFloors : DEFAULT_FLOOR_CAP;
  }

  function openPlot(sheet, plotId, floor) {
    if (!state.group || state.group.sheets.indexOf(sheet) === -1) {
      state.group = REGION_GROUPS.find(function (g) { return g.sheets.indexOf(sheet) !== -1; }) || null;
    }
    state.sheet = sheet;
    state.plotId = plotId;
    var plot = getPlot(sheet, plotId);
    var floorNames = Object.keys(plot.floors);
    state.floor = (floor && floorNames.indexOf(floor) !== -1) ? floor : floorNames[0];
    renderPlotView();
  }

  function renderPlotView() {
    var plot = getPlot(state.sheet, state.plotId);
    el.plotTitle.textContent = groupNameFor(state.sheet) + ' — Plot #' + plot.id;

    var floorNames = Object.keys(plot.floors);
    var maxFloorIndex = Math.min(floorNames.length - 1, floorDisplayCap());
    var floorIndex = floorNames.indexOf(state.floor);
    el.floorSpinnerValue.textContent = floorIndex;
    el.btnFloorUp.disabled = floorIndex >= maxFloorIndex;
    el.btnFloorDown.disabled = floorIndex <= 0;

    renderPalette(el.palette);
    renderWallPalette(el.wallPalette);
    setLayer(state.layer);
    renderGrid(plot);
    renderLegend();
    updateUsage(plot);
    updateFloorClipboardButtons();
    updateBreadcrumb();
    showView('plot');
  }

  el.btnFloorUp.onclick = function () {
    var plot = getPlot(state.sheet, state.plotId);
    var floorNames = Object.keys(plot.floors);
    var maxFloorIndex = Math.min(floorNames.length - 1, floorDisplayCap());
    var idx = floorNames.indexOf(state.floor);
    if (idx < maxFloorIndex) { state.floor = floorNames[idx + 1]; renderPlotView(); }
  };
  el.btnFloorDown.onclick = function () {
    var plot = getPlot(state.sheet, state.plotId);
    var floorNames = Object.keys(plot.floors);
    var idx = floorNames.indexOf(state.floor);
    if (idx > 0) { state.floor = floorNames[idx - 1]; renderPlotView(); }
  };

  // ---- Floor copy/paste ----
  var floorClipboard = null; // { cells: {...}, edges: {...}, sourceLabel }

  function updateFloorClipboardButtons() {
    el.btnCopyFloor.textContent = 'Copy Floor (' + state.floor + ')';
    el.btnPasteFloor.disabled = !floorClipboard;
    el.btnPasteFloor.textContent = floorClipboard ? 'Paste Floor (from ' + floorClipboard.sourceLabel + ')' : 'Paste Floor';
  }

  el.btnCopyFloor.onclick = function () {
    var plan = ensurePlan(state.sheet, state.plotId);
    var fp = ensureFloorPlan(plan, state.floor);
    floorClipboard = {
      cells: JSON.parse(JSON.stringify(fp.cells)),
      edges: JSON.parse(JSON.stringify(fp.edges)),
      sourceLabel: groupNameFor(state.sheet) + ' #' + state.plotId + ' — ' + state.floor
    };
    updateFloorClipboardButtons();
  };

  function parseEdgeKey(key) {
    // "h:r,c" (horizontal, spans columns c..c+1 at row line r) or "v:r,c" (vertical, spans
    // row lines r..r+1 at column c)
    var axis = key.charAt(0);
    var parts = key.slice(2).split(',');
    return { axis: axis, r: parseInt(parts[0], 10), c: parseInt(parts[1], 10) };
  }
  function edgeInBounds(key, width, height) {
    var e = parseEdgeKey(key);
    if (e.axis === 'h') return e.r >= 0 && e.r <= height && e.c >= 0 && e.c < width;
    if (e.axis === 'v') return e.r >= 0 && e.r < height && e.c >= 0 && e.c <= width;
    return false;
  }

  el.btnPasteFloor.onclick = function () {
    if (!floorClipboard) return;
    var plot = getPlot(state.sheet, state.plotId);
    var floor = plot.floors[state.floor];
    var interior = computeInterior(floor.cells, floor.width, floor.height);
    var plan = ensurePlan(state.sheet, state.plotId);
    var fp = ensureFloorPlan(plan, state.floor);
    var pasted = 0, skipped = 0;
    Object.keys(floorClipboard.cells).forEach(function (key) {
      var parts = key.split(',');
      var r = parseInt(parts[0], 10), c = parseInt(parts[1], 10);
      var inBounds = r >= 0 && r < floor.height && c >= 0 && c < floor.width;
      var buildable = inBounds && (floor.cells[r][c] === '.' && interior[r][c]);
      if (buildable) {
        fp.cells[key] = floorClipboard.cells[key];
        pasted++;
      } else {
        skipped++;
      }
    });
    Object.keys(floorClipboard.edges || {}).forEach(function (key) {
      if (edgeInBounds(key, floor.width, floor.height)) {
        fp.edges[key] = floorClipboard.edges[key];
        pasted++;
      } else {
        skipped++;
      }
    });
    saveToStorage();
    renderPlotView();
    if (skipped) {
      alert('Pasted ' + pasted + ' cells/walls. Skipped ' + skipped + ' that fell outside this floor.');
    }
  };

  el.btnClearFloor.onclick = function () {
    if (!confirm('Clear all painted tiles and walls on this floor (' + state.floor + ')?')) return;
    var plan = ensurePlan(state.sheet, state.plotId);
    plan[state.floor] = { cells: {}, edges: {} };
    saveToStorage();
    renderPlotView();
  };

  el.btnClearPlot.onclick = function () {
    if (!confirm('Clear the entire plan for this plot, all floors?')) return;
    delete state.plans[planKey(state.sheet, state.plotId)];
    saveToStorage();
    renderPlotView();
  };

  function renderPalette(target) {
    target.innerHTML = '';
    var groups = [];
    PALETTE.forEach(function (item) { if (groups.indexOf(item.group) === -1) groups.push(item.group); });
    groups.forEach(function (g) {
      var label = document.createElement('div');
      label.className = 'palette-group-label';
      label.textContent = g;
      target.appendChild(label);
      PALETTE.filter(function (i) { return i.group === g; }).forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'palette-item' + (state.tool.key === item.key ? ' selected' : '');
        var sw = document.createElement('div');
        sw.className = 'palette-swatch';
        sw.style.background = item.erase ? 'repeating-linear-gradient(45deg,#333,#333 3px,#555 3px,#555 6px)' : item.color;
        row.appendChild(sw);
        var lb = document.createElement('span');
        lb.textContent = item.label;
        row.appendChild(lb);
        row.onclick = function () { state.tool = item; renderPalette(target); };
        target.appendChild(row);
      });
    });

    var customWrap = document.createElement('div');
    customWrap.className = 'palette-custom';
    var input = document.createElement('input');
    input.placeholder = 'Custom room name';
    input.type = 'text';
    var btn = document.createElement('button');
    btn.textContent = 'Use';
    btn.onclick = function () {
      var name = input.value.trim();
      if (!name) return;
      state.tool = { key: 'custom:' + name, label: name, color: '#9c7a3f', group: 'Custom' };
      renderPalette(target);
    };
    customWrap.appendChild(input);
    customWrap.appendChild(btn);
    target.appendChild(customWrap);
  }

  function renderLegend() {
    el.legend.innerHTML = '';
    ['R', 'H', 'U', 'W', 'P', 'G', 'S', 'B'].forEach(function (code) {
      var t = TERRAIN[code];
      var item = document.createElement('div');
      item.className = 'legend-item';
      var sw = document.createElement('div');
      sw.className = 'legend-swatch';
      sw.style.background = t.color;
      item.appendChild(sw);
      var lb = document.createElement('span');
      lb.textContent = t.label;
      item.appendChild(lb);
      el.legend.appendChild(item);
    });
    var interiorItem = document.createElement('div');
    interiorItem.className = 'legend-item';
    var interiorSw = document.createElement('div');
    interiorSw.className = 'legend-swatch';
    interiorSw.style.background = INTERIOR_COLOR;
    interiorItem.appendChild(interiorSw);
    var interiorLb = document.createElement('span');
    interiorLb.textContent = 'Buildable interior';
    interiorItem.appendChild(interiorLb);
    el.legend.appendChild(interiorItem);
  }

  function renderGrid(plot) {
    var floor = plot.floors[state.floor];
    var rows = floor.cells;
    var width = floor.width, height = floor.height;
    el.grid.style.gridTemplateColumns = 'repeat(' + width + ', var(--cell-size))';
    el.grid.style.gridTemplateRows = 'repeat(' + height + ', var(--cell-size))';
    el.grid.innerHTML = '';

    var plan = ensurePlan(state.sheet, plot.id);
    var fp = ensureFloorPlan(plan, state.floor);
    var floorPlan = fp.cells;
    var interior = computeInterior(rows, width, height);

    var floorNames = Object.keys(plot.floors);
    var curFloorIdx = floorNames.indexOf(state.floor);
    var belowCells = curFloorIdx > 0 ? floorPlanCells(plan[floorNames[curFloorIdx - 1]]) : null;
    el.floorBelowOverlay.style.gridTemplateColumns = el.grid.style.gridTemplateColumns;
    el.floorBelowOverlay.style.gridTemplateRows = el.grid.style.gridTemplateRows;
    el.floorBelowOverlay.innerHTML = '';
    el.floorBelowOverlay.classList.toggle('hidden', !belowCells);

    for (var r = 0; r < height; r++) {
      var rowStr = rows[r];
      for (var c = 0; c < width; c++) {
        var code = rowStr[c];
        var t = TERRAIN[code];
        var isInteriorVoid = code === '.' && interior[r][c];
        var baseColor = isInteriorVoid ? INTERIOR_COLOR : (t.color || '');
        var baseLabel = isInteriorVoid ? 'Buildable interior' : t.label;
        var cellDiv = document.createElement('div');
        cellDiv.className = 'cell';
        var buildable = isInteriorVoid;
        if (code === '.' && !isInteriorVoid) cellDiv.classList.add('void');
        cellDiv.style.background = baseColor;
        if (buildable) cellDiv.classList.add('buildable');

        var key = r + ',' + c;
        var placed = floorPlan[key];
        if (placed) {
          cellDiv.style.background = placed.color;
          cellDiv.classList.add('painted');
          cellDiv.title = placed.label;
          cellDiv.textContent = placed.label.slice(0, 1).toUpperCase();
        } else if (code === 'S') {
          cellDiv.textContent = 'S';
        } else if (code === 'B') {
          cellDiv.textContent = 'B';
        } else {
          cellDiv.title = baseLabel;
        }

        if (buildable) {
          (function (cellDiv, key, code, baseColor, baseLabel) {
            function apply() {
              if (state.tool.erase) {
                delete floorPlan[key];
                cellDiv.style.background = baseColor;
                cellDiv.classList.remove('painted');
                cellDiv.title = baseLabel;
                cellDiv.textContent = (code === 'S' || code === 'B') ? code : '';
              } else {
                var placed = { type: state.tool.key, label: state.tool.label, color: state.tool.color };
                floorPlan[key] = placed;
                cellDiv.style.background = placed.color;
                cellDiv.classList.add('painted');
                cellDiv.title = placed.label;
                cellDiv.textContent = placed.label.slice(0, 1).toUpperCase();
              }
              updateUsage(plot);
              saveToStorage();
            }
            cellDiv.addEventListener('mousedown', function (e) {
              e.preventDefault();
              painting = true;
              apply();
            });
            cellDiv.addEventListener('mouseenter', function () {
              if (painting) apply();
            });
          })(cellDiv, key, code, baseColor, baseLabel);
        }

        if (belowCells) {
          var belowDiv = document.createElement('div');
          var belowPlaced = !placed && belowCells[key];
          if (belowPlaced) belowDiv.style.background = belowPlaced.color;
          el.floorBelowOverlay.appendChild(belowDiv);
        }

        el.grid.appendChild(cellDiv);
      }
    }

    renderWallOverlay(fp, width, height);
  }
  document.addEventListener('mouseup', function () { painting = false; });

  // ---- Wall/door/window layer ----
  function renderWallPalette(target) {
    target.innerHTML = '';
    WALL_PALETTE.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'palette-item' + (state.wallTool.key === item.key ? ' selected' : '');
      var sw = document.createElement('div');
      sw.className = 'palette-swatch';
      sw.style.background = item.erase ? 'repeating-linear-gradient(45deg,#333,#333 3px,#555 3px,#555 6px)' : item.color;
      row.appendChild(sw);
      var lb = document.createElement('span');
      lb.textContent = item.label;
      row.appendChild(lb);
      row.onclick = function () { state.wallTool = item; renderWallPalette(target); };
      target.appendChild(row);
    });
  }

  function renderWallOverlay(fp, width, height) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = el.wallOverlay;
    var pxW = width * CELL_PX, pxH = height * CELL_PX;
    svg.setAttribute('viewBox', '0 0 ' + pxW + ' ' + pxH);
    svg.setAttribute('width', pxW);
    svg.setAttribute('height', pxH);
    svg.innerHTML = '';
    svg.classList.toggle('wall-active', state.layer === 'wall');

    function makeEdge(key, x1, y1, x2, y2) {
      var group = document.createElementNS(svgNS, 'g');
      var placed = fp.edges[key];

      var visible = document.createElementNS(svgNS, 'line');
      visible.setAttribute('x1', x1); visible.setAttribute('y1', y1);
      visible.setAttribute('x2', x2); visible.setAttribute('y2', y2);
      visible.setAttribute('stroke', placed ? placed.color : EDGE_IDLE_COLOR);
      visible.setAttribute('stroke-width', placed ? placed.width : 1);
      visible.setAttribute('stroke-linecap', 'round');
      group.appendChild(visible);

      var hit = document.createElementNS(svgNS, 'line');
      hit.setAttribute('x1', x1); hit.setAttribute('y1', y1);
      hit.setAttribute('x2', x2); hit.setAttribute('y2', y2);
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', 12);
      hit.setAttribute('class', 'edge-hit');
      var titleEl = document.createElementNS(svgNS, 'title');
      titleEl.textContent = placed ? placed.label : 'Empty';
      group.appendChild(titleEl);

      function apply() {
        if (state.wallTool.erase) {
          delete fp.edges[key];
          visible.setAttribute('stroke', EDGE_IDLE_COLOR);
          visible.setAttribute('stroke-width', 1);
        } else {
          var val = { type: state.wallTool.key, label: state.wallTool.label, color: state.wallTool.color, width: state.wallTool.width };
          fp.edges[key] = val;
          visible.setAttribute('stroke', val.color);
          visible.setAttribute('stroke-width', val.width);
        }
        saveToStorage();
      }
      hit.addEventListener('mousedown', function (e) {
        e.preventDefault();
        painting = true;
        apply();
      });
      hit.addEventListener('mouseenter', function () {
        if (painting) apply();
      });
      group.appendChild(hit);
      svg.appendChild(group);
    }

    for (var r = 0; r <= height; r++) {
      for (var c = 0; c < width; c++) {
        makeEdge('h:' + r + ',' + c, c * CELL_PX, r * CELL_PX, (c + 1) * CELL_PX, r * CELL_PX);
      }
    }
    for (var r2 = 0; r2 < height; r2++) {
      for (var c2 = 0; c2 <= width; c2++) {
        makeEdge('v:' + r2 + ',' + c2, c2 * CELL_PX, r2 * CELL_PX, c2 * CELL_PX, (r2 + 1) * CELL_PX);
      }
    }
  }

  function setLayer(layer) {
    state.layer = layer;
    el.btnLayerFloor.classList.toggle('active', layer === 'floor');
    el.btnLayerWall.classList.toggle('active', layer === 'wall');
    el.palette.classList.toggle('hidden', layer !== 'floor');
    el.wallPalette.classList.toggle('hidden', layer !== 'wall');
    el.wallOverlay.classList.toggle('wall-active', layer === 'wall');
    el.grid.classList.toggle('dimmed', layer === 'wall');
  }
  el.btnLayerFloor.onclick = function () { setLayer('floor'); };
  el.btnLayerWall.onclick = function () { setLayer('wall'); };

  function updateUsage(plot) {
    var used = countPaintedTiles(state.sheet, plot.id);
    el.tileUsage.textContent = used + ' tiles used';
  }

  // ---- Export / Import ----
  el.btnExport.onclick = async function () {
    var json = JSON.stringify({ version: 1, plans: state.plans }, null, 2);

    if (window.showSaveFilePicker) {
      try {
        var handle = await window.showSaveFilePicker({
          suggestedName: 'castle-plan.json',
          types: [{ description: 'Castle Plan', accept: { 'application/json': ['.json'] } }]
        });
        var writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
      } catch (err) {
        if (err.name !== 'AbortError') alert('Could not save plan file: ' + err.message);
      }
      return;
    }

    // Fallback: prompt for a filename, still lets user pick the name (browser controls the folder).
    var name = prompt('Save as:', 'castle-plan.json');
    if (!name) return;
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  el.btnImport.onclick = function () { el.fileImport.click(); };
  el.fileImport.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (data && data.plans) {
          Object.keys(data.plans).forEach(function (k) { state.plans[k] = data.plans[k]; });
          saveToStorage();
          el.btnExport.disabled = Object.keys(state.plans).length === 0;
          el.btnClearAll.disabled = el.btnExport.disabled;
          if (state.view === 'region') renderRegionView();
          if (state.view === 'plot') renderPlotView();
          if (state.view === 'home') renderHome();
        }
      } catch (err) {
        alert('Could not read plan file: ' + err.message);
      }
    };
    reader.readAsText(file);
    el.fileImport.value = '';
  };

  el.navHome.onclick = renderHome;

  el.btnClearAll.onclick = function () {
    if (!confirm('Clear every plot\'s plan? This cannot be undone.')) return;
    state.plans = {};
    saveToStorage();
    renderHome();
  };

  // ---- Settings ----
  function syncSettingsUI() {
    el.settingsCustomFloorLimit.checked = state.settings.customFloorLimit;
    el.settingsMaxFloors.value = state.settings.maxFloors;
    el.settingsMaxFloors.disabled = !state.settings.customFloorLimit;
  }

  el.btnSettings.onclick = function () { el.settingsOverlay.classList.remove('hidden'); };
  el.btnSettingsClose.onclick = function () { el.settingsOverlay.classList.add('hidden'); };
  el.settingsOverlay.onclick = function (e) {
    if (e.target === el.settingsOverlay) el.settingsOverlay.classList.add('hidden');
  };

  // If the open plot's current floor is now above the (lower) cap, drop back to the new
  // max floor and delete that plot's plan data on the floors that became unreachable.
  function enforceFloorCap() {
    if (state.view !== 'plot') return;
    var plot = getPlot(state.sheet, state.plotId);
    var floorNames = Object.keys(plot.floors);
    var maxFloorIndex = Math.min(floorNames.length - 1, floorDisplayCap());
    var curIndex = floorNames.indexOf(state.floor);
    if (curIndex <= maxFloorIndex) return;
    var plan = ensurePlan(state.sheet, state.plotId);
    for (var i = maxFloorIndex + 1; i < floorNames.length; i++) delete plan[floorNames[i]];
    state.floor = floorNames[maxFloorIndex];
    saveToStorage();
  }

  el.settingsCustomFloorLimit.onchange = function () {
    state.settings.customFloorLimit = el.settingsCustomFloorLimit.checked;
    el.settingsMaxFloors.disabled = !state.settings.customFloorLimit;
    saveSettings();
    enforceFloorCap();
    if (state.view === 'plot') renderPlotView();
  };

  el.settingsMaxFloors.oninput = function () {
    var n = parseInt(el.settingsMaxFloors.value, 10);
    if (!Number.isInteger(n) || n < 0) return;
    state.settings.maxFloors = n;
    saveSettings();
    enforceFloorCap();
    if (state.view === 'plot') renderPlotView();
  };
  el.settingsMaxFloors.onblur = function () {
    el.settingsMaxFloors.value = state.settings.maxFloors;
  };

  el.btnClearSettings.onclick = function () {
    if (!confirm('Reset settings to default and delete the saved copy?')) return;
    state.settings = { customFloorLimit: false, maxFloors: 5 };
    try { localStorage.removeItem(SETTINGS_KEY); } catch (err) {}
    syncSettingsUI();
    enforceFloorCap();
    if (state.view === 'plot') renderPlotView();
  };

  loadFromStorage();
  loadSettings();
  syncSettingsUI();
  renderHome();
})();

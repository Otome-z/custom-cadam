const MODEL_CATALOG = {
  yarn_path_collection: {
    displayName: 'Yarn Path Collection',
    description: 'A line-based yarn model where each yarn path is an independent line spec.',
    parameters: {},
    buildCode: (params, modelSpec) => `// catalog_model: yarn_path_collection
// This model is rendered by native three.js from modelSpec.lines.
// line_count = ${Array.isArray(modelSpec?.lines) ? modelSpec.lines.length : 0};
`,
  },
  woven_path_pattern: {
    displayName: 'Woven Path Pattern',
    description: 'A structured woven yarn path pattern with straight warp strands, paired rounded-zigzag weft strands, and over-under crossing rules.',
    parameters: {},
    buildCode: (params, modelSpec) => `// catalog_model: woven_path_pattern
// This model is rendered by native three.js from modelSpec.
// warp_count = ${modelSpec?.warp?.count ?? 0};
// weft_pair_count = ${modelSpec?.weftPairs?.count ?? 0};
`,
  },
  straight_yarn_bundle: {
    displayName: 'Straight Yarn Bundle',
    description: 'Parallel cylindrical yarn strands arranged side by side.',
    parameters: {
      num_strands: { displayName: 'Num Strands', description: 'Number of parallel yarn strands.', defaultValue: 12, min: 1, max: 64, step: 1 },
      strand_diameter: { displayName: 'Strand Diameter', description: 'Diameter of each yarn strand in millimeters.', defaultValue: 2, min: 0.2, max: 20, step: 0.1 },
      strand_length: { displayName: 'Strand Length', description: 'Length of each yarn strand in millimeters.', defaultValue: 120, min: 1, max: 500, step: 1 },
      spacing: { displayName: 'Spacing', description: 'Gap between neighboring strands in millimeters.', defaultValue: 1, min: 0, max: 10, step: 0.1 },
      radial_segments: { displayName: 'Radial Segments', description: 'Cylinder radial segment count.', defaultValue: 128, min: 72, max: 256, step: 4 },
    },
    buildCode: (params) => `// catalog_model: straight_yarn_bundle
radial_segments = ${formatNumber(params.radial_segments)}; // 72:4:256
num_strands = ${formatNumber(params.num_strands)}; // 1:1:64
strand_diameter = ${formatNumber(params.strand_diameter)}; // 0.2:0.1:20
strand_length = ${formatNumber(params.strand_length)}; // 1:1:500
spacing = ${formatNumber(params.spacing)}; // 0:0.1:10

$fn = radial_segments;
pitch = strand_diameter + spacing;
bundle_width = (num_strands - 1) * pitch;

module yarn_strand(x_offset = 0) {
  translate([x_offset, 0, 0])
    cylinder(h = strand_length, r = strand_diameter / 2, center = true, $fn = radial_segments);
}

for (i = [0 : num_strands - 1]) {
  yarn_strand(-bundle_width / 2 + i * pitch);
}
`,
  },
  yarn_sheet: {
    displayName: 'Yarn Sheet',
    description: 'A sheet-like yarn assembly built from multiple parallel rows.',
    parameters: {
      num_rows: { displayName: 'Num Rows', description: 'How many yarn rows in the sheet.', defaultValue: 5, min: 1, max: 32, step: 1 },
      strands_per_row: { displayName: 'Strands Per Row', description: 'How many strands per row.', defaultValue: 10, min: 1, max: 64, step: 1 },
      strand_diameter: { displayName: 'Strand Diameter', description: 'Diameter of each yarn strand in millimeters.', defaultValue: 1.6, min: 0.2, max: 20, step: 0.1 },
      strand_length: { displayName: 'Strand Length', description: 'Length of each strand in millimeters.', defaultValue: 120, min: 1, max: 500, step: 1 },
      strand_spacing: { displayName: 'Strand Spacing', description: 'Gap between neighboring strands in a row.', defaultValue: 0.8, min: 0, max: 10, step: 0.1 },
      row_spacing: { displayName: 'Row Spacing', description: 'Gap between rows.', defaultValue: 0.8, min: 0, max: 10, step: 0.1 },
      radial_segments: { displayName: 'Radial Segments', description: 'Cylinder radial segment count.', defaultValue: 128, min: 72, max: 256, step: 4 },
    },
    buildCode: (params) => `// catalog_model: yarn_sheet
radial_segments = ${formatNumber(params.radial_segments)}; // 72:4:256
num_rows = ${formatNumber(params.num_rows)}; // 1:1:32
strands_per_row = ${formatNumber(params.strands_per_row)}; // 1:1:64
strand_diameter = ${formatNumber(params.strand_diameter)}; // 0.2:0.1:20
strand_length = ${formatNumber(params.strand_length)}; // 1:1:500
strand_spacing = ${formatNumber(params.strand_spacing)}; // 0:0.1:10
row_spacing = ${formatNumber(params.row_spacing)}; // 0:0.1:10

$fn = radial_segments;
pitch_x = strand_diameter + strand_spacing;
pitch_y = strand_diameter + row_spacing;
row_width = (strands_per_row - 1) * pitch_x;
sheet_height = (num_rows - 1) * pitch_y;

module yarn_strand(pos = [0, 0, 0]) {
  translate(pos)
    rotate([90, 0, 0])
      cylinder(h = strand_length, r = strand_diameter / 2, center = true, $fn = radial_segments);
}

for (row = [0 : num_rows - 1]) {
  y = -sheet_height / 2 + row * pitch_y;
  row_shift = (row % 2 == 0) ? 0 : pitch_x / 2;

  for (col = [0 : strands_per_row - 1]) {
    x = -row_width / 2 + col * pitch_x + row_shift;
    yarn_strand([x, y, 0]);
  }
}
`,
  },
  woven_yarn_sheet: {
    displayName: 'Woven Yarn Sheet',
    description: 'A woven-style yarn sheet with straight warp yarns and smooth sinusoidal weft yarns.',
    parameters: {
      yarn_diameter: { displayName: 'Yarn Diameter', description: 'Diameter of each yarn in millimeters.', defaultValue: 1, min: 0.2, max: 20, step: 0.1 },
      warp_count: { displayName: 'Warp Count', description: 'Number of warp yarns.', defaultValue: 10, min: 1, max: 64, step: 1 },
      warp_spacing: { displayName: 'Warp Spacing', description: 'Center spacing between warp yarns in millimeters.', defaultValue: 2, min: 0.2, max: 20, step: 0.1 },
      warp_length: { displayName: 'Warp Length', description: 'Length of each warp yarn in millimeters.', defaultValue: 100, min: 1, max: 600, step: 1 },
      weft_count: { displayName: 'Weft Count', description: 'Number of weft yarns.', defaultValue: 10, min: 1, max: 64, step: 1 },
      weft_spacing: { displayName: 'Weft Spacing', description: 'Center spacing between weft yarns in millimeters.', defaultValue: 2, min: 0.2, max: 20, step: 0.1 },
      weft_length: { displayName: 'Weft Length', description: 'Length of each weft yarn in millimeters.', defaultValue: 100, min: 1, max: 600, step: 1 },
      amplitude: { displayName: 'Amplitude', description: 'Wave offset amplitude for weft yarn centerline. Use 0 for straight weft yarns.', defaultValue: 0, min: 0, max: 20, step: 0.1 },
      weft_period: { displayName: 'Weft Period', description: 'Sinusoidal period along weft path in millimeters.', defaultValue: 8, min: 0.5, max: 200, step: 0.1 },
      path_segments: { displayName: 'Path Segments', description: 'Sampling segments for smooth weft path hull.', defaultValue: 160, min: 64, max: 512, step: 2 },
      radial_segments: { displayName: 'Radial Segments', description: 'Sphere/cylinder radial segment count.', defaultValue: 128, min: 72, max: 256, step: 4 },
    },
    buildCode: (params) => `// catalog_model: woven_yarn_sheet
radial_segments = ${formatNumber(params.radial_segments)}; // 72:4:256
path_segments = ${formatNumber(params.path_segments)}; // 64:2:512

yarn_diameter = ${formatNumber(params.yarn_diameter)}; // 0.2:0.1:20
warp_count = ${formatNumber(params.warp_count)}; // 1:1:64
warp_spacing = ${formatNumber(params.warp_spacing)}; // 0.2:0.1:20
warp_length = ${formatNumber(params.warp_length)}; // 1:1:600
weft_count = ${formatNumber(params.weft_count)}; // 1:1:64
weft_spacing = ${formatNumber(params.weft_spacing)}; // 0.2:0.1:20
weft_length = ${formatNumber(params.weft_length)}; // 1:1:600
amplitude = ${formatNumber(params.amplitude)}; // 0:0.1:20
weft_period = ${formatNumber(params.weft_period)}; // 0.5:0.1:200

$fn = radial_segments;
sqrt2 = sqrt(2);
adaptive_segments = max(path_segments, ceil(weft_length / max(0.2, yarn_diameter * 0.25)));

function weft_center(j) = [j * weft_spacing / sqrt2, j * weft_spacing / sqrt2, 0];
function warp_center(i) = [i * warp_spacing / sqrt2, -i * warp_spacing / sqrt2, 0];

function wave_point(j, s) =
  let(
    base_x = s / sqrt2,
    base_y = -s / sqrt2,
    disp = amplitude * sin(360 * s / weft_period + 90),
    disp_x = disp / sqrt2,
    disp_y = disp / sqrt2,
    c = weft_center(j)
  )
  [base_x + disp_x + c[0], base_y + disp_y + c[1], c[2]];

module yarn_segment_smooth(p1, p2, radius) {
  hull() {
    translate(p1) sphere(r = radius, $fn = radial_segments);
    translate(p2) sphere(r = radius, $fn = radial_segments);
  }
}

module warp_yarn(i) {
  c = warp_center(i);
  translate([c[0], c[1], c[2]])
    rotate([0, 0, 45])
      rotate([0, 90, 0])
        cylinder(d = yarn_diameter, h = warp_length * sqrt2, center = false, $fn = radial_segments);
}

module weft_yarn(j) {
  for (step = [0 : adaptive_segments - 1]) {
    s1 = step * (weft_length / adaptive_segments);
    s2 = (step + 1) * (weft_length / adaptive_segments);
    yarn_segment_smooth(wave_point(j, s1), wave_point(j, s2), yarn_diameter / 2);
  }
}

for (i = [0 : warp_count - 1]) {
  color(i % 2 == 0 ? "gray" : "white")
    warp_yarn(i);
}

for (j = [0 : weft_count - 1]) {
  color(j == 0 ? "yellow" : (j % 2 == 0 ? "gray" : "white"))
    weft_yarn(j);
}
`,
  },
  twisted_yarn_bundle: {
    displayName: 'Twisted Yarn Bundle',
    description: 'Several yarn strands twisting around a shared center line.',
    parameters: {
      num_strands: { displayName: 'Num Strands', description: 'Number of helical yarn strands.', defaultValue: 3, min: 2, max: 12, step: 1 },
      strand_diameter: { displayName: 'Strand Diameter', description: 'Diameter of each yarn strand in millimeters.', defaultValue: 1.4, min: 0.2, max: 12, step: 0.1 },
      strand_length: { displayName: 'Strand Length', description: 'Overall bundle length in millimeters.', defaultValue: 120, min: 1, max: 500, step: 1 },
      bundle_radius: { displayName: 'Bundle Radius', description: 'Radius from center line to each strand center.', defaultValue: 2.6, min: 0.2, max: 40, step: 0.1 },
      twist_turns: { displayName: 'Twist Turns', description: 'How many full turns each strand makes.', defaultValue: 6, min: 0, max: 30, step: 0.5 },
      path_segments: { displayName: 'Path Segments', description: 'Segments used to approximate helical paths.', defaultValue: 144, min: 96, max: 320, step: 2 },
      radial_segments: { displayName: 'Radial Segments', description: 'Sphere/cylinder radial segment count.', defaultValue: 128, min: 72, max: 256, step: 4 },
    },
    buildCode: (params) => `// catalog_model: twisted_yarn_bundle
radial_segments = ${formatNumber(params.radial_segments)}; // 72:4:256
num_strands = ${formatNumber(params.num_strands)}; // 2:1:12
strand_diameter = ${formatNumber(params.strand_diameter)}; // 0.2:0.1:12
strand_length = ${formatNumber(params.strand_length)}; // 1:1:500
bundle_radius = ${formatNumber(params.bundle_radius)}; // 0.2:0.1:40
twist_turns = ${formatNumber(params.twist_turns)}; // 0:0.5:30
path_segments = ${formatNumber(params.path_segments)}; // 96:2:320

$fn = radial_segments;

function helix_point(angle_offset, t) = [
  bundle_radius * cos(angle_offset + 360 * twist_turns * t),
  bundle_radius * sin(angle_offset + 360 * twist_turns * t),
  -strand_length / 2 + strand_length * t
];

module yarn_segment(p1, p2, radius) {
  hull() {
    translate(p1) sphere(r = radius, $fn = radial_segments);
    translate(p2) sphere(r = radius, $fn = radial_segments);
  }
}

module helical_strand(angle_offset = 0) {
  for (step = [0 : path_segments - 1]) {
    t1 = step / path_segments;
    t2 = (step + 1) / path_segments;
    yarn_segment(helix_point(angle_offset, t1), helix_point(angle_offset, t2), strand_diameter / 2);
  }
}

for (i = [0 : num_strands - 1]) {
  helical_strand(360 * i / num_strands);
}
`,
  },
  curved_yarn_path: {
    displayName: 'Curved Yarn Path',
    description: 'A single yarn strand following a smooth circular arc.',
    parameters: {
      strand_diameter: { displayName: 'Strand Diameter', description: 'Diameter of the yarn strand in millimeters.', defaultValue: 2, min: 0.2, max: 20, step: 0.1 },
      arc_radius: { displayName: 'Arc Radius', description: 'Radius of the center arc in millimeters.', defaultValue: 60, min: 1, max: 300, step: 1 },
      arc_angle: { displayName: 'Arc Angle', description: 'Sweep angle of the yarn center path in degrees.', defaultValue: 120, min: 10, max: 330, step: 1 },
      path_segments: { displayName: 'Path Segments', description: 'Number of segments used to approximate curved path.', defaultValue: 128, min: 96, max: 320, step: 2 },
      radial_segments: { displayName: 'Radial Segments', description: 'Sphere/cylinder radial segment count.', defaultValue: 128, min: 72, max: 256, step: 4 },
    },
    buildCode: (params) => `// catalog_model: curved_yarn_path
radial_segments = ${formatNumber(params.radial_segments)}; // 72:4:256
strand_diameter = ${formatNumber(params.strand_diameter)}; // 0.2:0.1:20
arc_radius = ${formatNumber(params.arc_radius)}; // 1:1:300
arc_angle = ${formatNumber(params.arc_angle)}; // 10:1:330
path_segments = ${formatNumber(params.path_segments)}; // 96:2:320

$fn = radial_segments;

function arc_point(t) = let(angle = -arc_angle / 2 + arc_angle * t)
  [arc_radius * sin(angle), 0, arc_radius * cos(angle) - arc_radius * cos(arc_angle / 2)];

module yarn_segment(p1, p2, radius) {
  hull() {
    translate(p1) sphere(r = radius, $fn = radial_segments);
    translate(p2) sphere(r = radius, $fn = radial_segments);
  }
}

for (step = [0 : path_segments - 1]) {
  t1 = step / path_segments;
  t2 = (step + 1) / path_segments;
  yarn_segment(arc_point(t1), arc_point(t2), strand_diameter / 2);
}
`,
  },
  braided_yarn: {
    displayName: 'Braided Yarn',
    description: 'A 3-strand braid style yarn structure with crossing strands.',
    parameters: {
      strand_diameter: { displayName: 'Strand Diameter', description: 'Diameter of each strand in millimeters.', defaultValue: 1.2, min: 0.2, max: 12, step: 0.1 },
      braid_radius: { displayName: 'Braid Radius', description: 'Radius of strand centerline from braid axis.', defaultValue: 3.2, min: 0.2, max: 40, step: 0.1 },
      braid_length: { displayName: 'Braid Length', description: 'Overall braid length in millimeters.', defaultValue: 140, min: 1, max: 600, step: 1 },
      braid_turns: { displayName: 'Braid Turns', description: 'Full turns across the braid length.', defaultValue: 7, min: 1, max: 40, step: 0.5 },
      path_segments: { displayName: 'Path Segments', description: 'Segments used to approximate braid paths.', defaultValue: 180, min: 120, max: 400, step: 2 },
      radial_segments: { displayName: 'Radial Segments', description: 'Sphere/cylinder radial segment count.', defaultValue: 128, min: 72, max: 256, step: 4 },
    },
    buildCode: (params) => `// catalog_model: braided_yarn
radial_segments = ${formatNumber(params.radial_segments)}; // 72:4:256
strand_diameter = ${formatNumber(params.strand_diameter)}; // 0.2:0.1:12
braid_radius = ${formatNumber(params.braid_radius)}; // 0.2:0.1:40
braid_length = ${formatNumber(params.braid_length)}; // 1:1:600
braid_turns = ${formatNumber(params.braid_turns)}; // 1:0.5:40
path_segments = ${formatNumber(params.path_segments)}; // 120:2:400

$fn = radial_segments;

function braid_point(phase_deg, t) = [
  braid_radius * cos(phase_deg + 360 * braid_turns * t),
  braid_radius * sin(phase_deg + 360 * braid_turns * t),
  -braid_length / 2 + braid_length * t
];

module yarn_segment(p1, p2, radius) {
  hull() {
    translate(p1) sphere(r = radius, $fn = radial_segments);
    translate(p2) sphere(r = radius, $fn = radial_segments);
  }
}

module braid_strand(phase_deg = 0) {
  for (step = [0 : path_segments - 1]) {
    t1 = step / path_segments;
    t2 = (step + 1) / path_segments;
    yarn_segment(braid_point(phase_deg, t1), braid_point(phase_deg, t2), strand_diameter / 2);
  }
}

for (i = [0 : 2]) {
  braid_strand(120 * i);
}
`,
  },
};

export const MODEL_SPEC_SYSTEM_PROMPT = `You convert natural-language yarn modeling requests into one of the supported catalog models.

Return JSON only. Do not use markdown. Do not explain anything.

Supported model types:
${serializeCatalogForPrompt()}

Rules:
- Always map the user request to one of the supported model types.
- Do not output custom_scad.
- If the input includes an image, first extract visible yarn centerlines / line paths.
- If the image shows a structured woven yarn diagram with straight warp strands and paired horizontal folded weft strands, prefer modelType = "woven_path_pattern".
- In this woven pattern, horizontal weft strands are NOT sine waves; they are rounded-zigzag / stepped polyline paths.
- Their local shape is: P0 ---- P1, then diagonal transition, then P2 ---- P3.
- Use weftPairs.shape = "rounded-zigzag".
- Do not represent these weft strands as type="sine" unless user explicitly asks sinusoidal waves.
- Do not flatten paired interlaced weft structure into independent smoothPolyline grid when image clearly shows interlacing.
- Use crossing.mode = "alternate" and crossing.height > 0 for over-under weaving.
- Use highlight.weftIndex and highlight.color for yellow strand.
- Use yarn_path_collection for freeform unrelated line sketches; use woven_path_pattern for repeated regular woven path diagrams.
- If an image contains multiple distinct yarn paths, output modelType = "yarn_path_collection".
- If an image contains vertical straight strands and horizontal folded / wavy / interlaced strands, MUST output yarn_path_collection.
- Do not choose yarn_sheet when image contains both straight vertical yarns and folded / wavy / interlaced horizontal yarns.
- Do not choose woven_yarn_sheet unless user explicitly requests a globally regular woven sheet with one shared parameter set.
- If ambiguous between global sheet model and multi-line path model, prefer yarn_path_collection.
- For yarn_path_collection, each visible yarn path must be one item in lines[].
- Do not merge multiple yarn paths into global parameters.
- globalDefaults are defaults only. Each line can override yarnDiameter, radialSegments, pathSegments, color, amplitude, period, cornerRadius.
- Choose line type per line:
  - straight: horizontal / vertical / diagonal straight line
  - polyline: multi-segment sharp-corner piecewise straight path
  - smoothPolyline: multi-segment path with rounded corners / smooth turning
  - sine: continuous wave-like line
  - bezier: arbitrary smooth curve
- For a path like P0----P1 then diagonal turn then P2----P3, output ONE smoothPolyline with points [P0,P1,P2,P3], not multiple lines.
- For a highlighted yellow strand, output a separate line with yellow color such as "#f5e642".
- If image resembles technical yarn diagram / shoe upper texture path / yarn routing / wave-line / polyline / local interlaced path, prefer yarn_path_collection.
- Image-specific guidance: when the reference image has many vertical straight yarns, horizontal folded or wavy yarns, paired horizontal interlaced strands, and one highlighted yellow strand, output yarn_path_collection.
- Requests for parallel yarn rows, yarn surfaces made from side-by-side strands, or simple bundles should map to straight_yarn_bundle.
- Only choose yarn_sheet for simple rows of mostly parallel straight yarns with no obvious independent path variation.
- Only choose woven_yarn_sheet for regular full woven grids where warp/weft counts, spacing, and wave period can be shared globally.
- For woven_yarn_sheet, set amplitude to 0 unless the user (or reference image) clearly indicates sinusoidal/wavy weft paths.
- Requests for twisted bundles or rope-like spirals should map to twisted_yarn_bundle.
- Requests for a single bent yarn should map to curved_yarn_path.
- Requests for braid/plait/interlaced strands should map to braided_yarn.
- Use millimeters for all dimensions.
- Keep values practical and printable.
- Only include parameter names that belong to the chosen model type.

Return shape:
Line-based:
{
  "modelType": "yarn_path_collection",
  "summary": "short plain-language summary",
  "globalDefaults": {
    "yarnDiameter": <number_if_known>,
    "radialSegments": <number_if_known>,
    "pathSegments": <number_if_known>,
    "color": "<color_if_known>"
  },
  "lines": [
    {
      "id": "line_1",
      "name": "Line 1",
      "type": "smoothPolyline",
      "points": [[0, 0, 0], [50, 0, 0], [70, -20, 0], [120, -20, 0]],
      "yarnDiameter": <number_if_known>,
      "radialSegments": <number_if_known>,
      "pathSegments": <number_if_known>,
      "color": "<color_if_known>",
      "amplitude": <number_if_known>,
      "period": <number_if_known>,
      "cornerRadius": <number_if_known>
    }
  ]
}

Structured woven path pattern:
{
  "modelType": "woven_path_pattern",
  "summary": "short summary",
  "globalDefaults": {
    "yarnDiameter": 1,
    "radialSegments": 64,
    "pathSegments": 120,
    "warpColor": "#d9ddd0",
    "weftColor": "#ffffff",
    "highlightColor": "#f5e642"
  },
  "warp": {
    "count": 10,
    "spacing": 8,
    "length": 130,
    "tilt": -12
  },
  "weftPairs": {
    "count": 8,
    "spacing": 10,
    "pairOffset": 3,
    "length": 150,
    "shape": "rounded-zigzag",
    "stepLength": 28,
    "stepDrop": 8,
    "cornerRadius": 4
  },
  "crossing": {
    "mode": "alternate",
    "height": 2,
    "start": "over"
  },
  "highlight": {
    "weftIndex": 4,
    "pairRole": "upper",
    "color": "#f5e642"
  },
  "transform": {
    "rotationZ": -18,
    "scaleX": 1,
    "scaleY": 0.85,
    "scaleZ": 1
  }
}

Legacy catalog model:
{
  "modelType": "straight_yarn_bundle | yarn_sheet | woven_yarn_sheet | twisted_yarn_bundle | curved_yarn_path | braided_yarn",
  "summary": "short plain-language summary",
  "parameters": {
    "parameter_name": number
  }
}`;

export function normalizeCatalogModel(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const modelType = typeof payload.modelType === 'string' ? payload.modelType.trim() : '';
  const entry = MODEL_CATALOG[modelType];
  if (!entry) {
    return null;
  }

  if (modelType === 'yarn_path_collection') {
    const rawLines = Array.isArray(payload.lines) ? payload.lines : [];

    const globalDefaults = normalizeGlobalDefaults(payload.globalDefaults);
    const lines = rawLines
      .map((line, index) => normalizeLineSpec(line, index, globalDefaults))
      .filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    return {
      modelType,
      displayName: entry.displayName,
      description: entry.description,
      source: 'catalog',
      summary: typeof payload.summary === 'string' && payload.summary.trim() ? payload.summary.trim() : undefined,
      globalDefaults,
      lines,
    };
  }

  if (modelType === 'woven_path_pattern') {
    const globalDefaultsRaw = payload.globalDefaults && typeof payload.globalDefaults === 'object' ? payload.globalDefaults : {};
    const globalDefaults = {
      yarnDiameter: clampNumber(globalDefaultsRaw.yarnDiameter, 1, 0.1, 50),
      radialSegments: clampInteger(globalDefaultsRaw.radialSegments, 64, 12, 256),
      pathSegments: clampInteger(globalDefaultsRaw.pathSegments, 120, 2, 512),
      warpColor: normalizeHexColor(globalDefaultsRaw.warpColor) || '#d9ddd0',
      weftColor: normalizeHexColor(globalDefaultsRaw.weftColor) || '#ffffff',
      highlightColor: normalizeHexColor(globalDefaultsRaw.highlightColor) || '#f5e642',
    };

    const warpRaw = payload.warp && typeof payload.warp === 'object' ? payload.warp : {};
    const warp = {
      count: clampInteger(warpRaw.count, 10, 1, 128),
      spacing: clampNumber(warpRaw.spacing, 8, 0.1, 100),
      length: clampNumber(warpRaw.length, 130, 1, 1000),
      tilt: clampNumber(warpRaw.tilt, 0, -180, 180),
      start: normalizeVector3(warpRaw.start, [0, 0, 0]),
      direction: normalizeVector3(warpRaw.direction, [0, 1, 0]),
    };

    const weftRaw = payload.weftPairs && typeof payload.weftPairs === 'object' ? payload.weftPairs : {};
    const weftPairs = {
      count: clampInteger(weftRaw.count, 8, 1, 128),
      spacing: clampNumber(weftRaw.spacing, 10, 0.1, 100),
      pairOffset: clampNumber(weftRaw.pairOffset, 3, 0, 100),
      length: clampNumber(weftRaw.length, 150, 1, 1000),
      shape: nonEmptyString(weftRaw.shape) || 'rounded-zigzag',
      stepLength: clampNumber(weftRaw.stepLength, 28, 1, 300),
      stepDrop: clampNumber(weftRaw.stepDrop, 8, 0.1, 200),
      cornerRadius: clampNumber(weftRaw.cornerRadius, 4, 0, 200),
    };

    const crossingRaw = payload.crossing && typeof payload.crossing === 'object' ? payload.crossing : {};
    const crossing = {
      mode: nonEmptyString(crossingRaw.mode) || 'alternate',
      height: clampNumber(crossingRaw.height, 2, 0, 100),
      start: /under/i.test(nonEmptyString(crossingRaw.start)) ? 'under' : 'over',
    };

    const highlightRaw = payload.highlight && typeof payload.highlight === 'object' ? payload.highlight : {};
    const highlight = {
      weftIndex: clampInteger(highlightRaw.weftIndex, 0, 0, 1000),
      pairRole: /lower/i.test(nonEmptyString(highlightRaw.pairRole)) ? 'lower' : 'upper',
      color: normalizeHexColor(highlightRaw.color) || '#f5e642',
    };

    const transformRaw = payload.transform && typeof payload.transform === 'object' ? payload.transform : {};
    const transform = {
      rotationZ: clampNumber(transformRaw.rotationZ, 0, -360, 360),
      scaleX: clampNumber(transformRaw.scaleX, 1, 0.01, 100),
      scaleY: clampNumber(transformRaw.scaleY, 1, 0.01, 100),
      scaleZ: clampNumber(transformRaw.scaleZ, 1, 0.01, 100),
    };

    return {
      modelType,
      displayName: entry.displayName,
      description: entry.description,
      source: 'catalog',
      summary: typeof payload.summary === 'string' && payload.summary.trim() ? payload.summary.trim() : undefined,
      globalDefaults,
      warp,
      weftPairs,
      crossing,
      highlight,
      transform,
    };
  }

  const rawParameters = payload.parameters && typeof payload.parameters === 'object' ? payload.parameters : {};

  const parameters = Object.entries(entry.parameters).map(([name, schema]) => ({
    name,
    displayName: schema.displayName,
    value: normalizeNumber(rawParameters[name], schema),
    defaultValue: schema.defaultValue,
    type: 'number',
    description: schema.description,
    range: { min: schema.min, max: schema.max, step: schema.step },
  }));

  return {
    modelType,
    displayName: entry.displayName,
    description: entry.description,
    source: 'catalog',
    summary: typeof payload.summary === 'string' && payload.summary.trim() ? payload.summary.trim() : undefined,
    parameters,
  };
}

export function fallbackCatalogModel(promptText = '', options = {}) {
  const prompt = promptText.toLowerCase();
  const hasImage = Boolean(options?.hasImage);
  let modelType = 'straight_yarn_bundle';

  const explicitGlobalSheet = /(整片织物|整体织物|规则编织面|经纬网格|统一间距|统一周期|uniform\s+warp|uniform\s+weft|regular\s+woven\s+sheet|global\s+sheet)/i.test(promptText);
  const lineHint = /(折线|波浪线|线条|路径|纹路|曲线|\bp0\b|\bp1\b|\bp2\b|\bp3\b|path|line|polyline|wave|route)/i.test(promptText);
  const genericImagePrompt = /(根据图片生成模型|按图片生成|参考图片生成模型|generate from image)/i.test(promptText);

  if (hasImage && !lineHint && (!explicitGlobalSheet || genericImagePrompt)) {
    return buildFallbackWovenPathPattern();
  }

  if (hasImage && (!explicitGlobalSheet || lineHint || genericImagePrompt)) {
    return buildFallbackYarnPathCollection();
  }

  if (/(braid|plait|辫)/.test(prompt)) {
    modelType = 'braided_yarn';
  } else if (/(woven|weave|warp|weft|经|纬|波浪)/.test(prompt)) {
    modelType = 'woven_yarn_sheet';
  } else if (/(sheet|fabric|surface|面|片|布)/.test(prompt)) {
    modelType = 'yarn_sheet';
  } else if (/(twist|rope|螺旋|扭)/.test(prompt)) {
    modelType = 'twisted_yarn_bundle';
  } else if (/(curve|arc|bend|弧|弯)/.test(prompt)) {
    modelType = 'curved_yarn_path';
  }

  const entry = MODEL_CATALOG[modelType];
  const parameters = Object.entries(entry.parameters).map(([name, schema]) => ({
    name,
    displayName: schema.displayName,
    value: schema.defaultValue,
    defaultValue: schema.defaultValue,
    type: 'number',
    description: schema.description,
    range: { min: schema.min, max: schema.max, step: schema.step },
  }));

  return {
    modelType,
    displayName: entry.displayName,
    description: entry.description,
    source: 'catalog_fallback',
    summary: 'Fallback catalog model',
    parameters,
  };
}

export function buildOpenScadFromModelSpec(modelSpec) {
  if (!modelSpec || typeof modelSpec !== 'object') {
    return null;
  }

  const entry = MODEL_CATALOG[modelSpec.modelType];
  if (!entry) {
    return null;
  }

  if (modelSpec.modelType === 'yarn_path_collection' || modelSpec.modelType === 'woven_path_pattern') {
    return entry.buildCode({}, modelSpec);
  }

  const params = Object.fromEntries((Array.isArray(modelSpec.parameters) ? modelSpec.parameters : []).map((parameter) => [parameter.name, Number(parameter.value)]));
  return entry.buildCode(params);
}

function serializeCatalogForPrompt() {
  return Object.entries(MODEL_CATALOG)
    .map(([modelType, entry]) => {
      const parameters = Object.entries(entry.parameters)
        .map(([name, schema]) => `  - ${name}: default=${schema.defaultValue}, range=${schema.min}..${schema.max}, step=${schema.step}`)
        .join('\n');

      return `- ${modelType}: ${entry.description}\n${parameters}`;
    })
    .join('\n');
}

function normalizeNumber(value, schema) {
  let nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    nextValue = schema.defaultValue;
  }

  if (typeof schema.min === 'number') {
    nextValue = Math.max(schema.min, nextValue);
  }

  if (typeof schema.max === 'number') {
    nextValue = Math.min(schema.max, nextValue);
  }

  if (typeof schema.step === 'number' && schema.step > 0) {
    const base = typeof schema.min === 'number' ? schema.min : 0;
    nextValue = base + Math.round((nextValue - base) / schema.step) * schema.step;
  }

  return roundNumber(nextValue);
}

function roundNumber(value) {
  return Number(value.toFixed(4));
}

function formatNumber(value) {
  return roundNumber(value).toString();
}

const LINE_TYPES = new Set(['straight', 'polyline', 'smoothPolyline', 'sine', 'bezier']);
const DEFAULT_LINE_COLOR = '#d9ddd0';

function normalizeGlobalDefaults(rawDefaults) {
  const defaults = rawDefaults && typeof rawDefaults === 'object' && !Array.isArray(rawDefaults) ? rawDefaults : {};
  const normalized = {};
  setIfNumber(normalized, 'yarnDiameter', defaults.yarnDiameter, 0.1, 50, false);
  setIfNumber(normalized, 'radialSegments', defaults.radialSegments, 12, 256, true);
  setIfNumber(normalized, 'pathSegments', defaults.pathSegments, 2, 512, true);
  normalized.color = normalizeHexColor(defaults.color) || DEFAULT_LINE_COLOR;
  return normalized;
}

function normalizeLineSpec(rawLine, index, globalDefaults) {
  if (!rawLine || typeof rawLine !== 'object' || Array.isArray(rawLine)) {
    return null;
  }

  const points = normalizeLinePoints(rawLine.points);
  if (points.length < 2) {
    return null;
  }

  const normalizedType = normalizeLineType(rawLine.type);
  const type = LINE_TYPES.has(normalizedType) ? normalizedType : 'smoothPolyline';
  const normalizedLine = {
    id: nonEmptyString(rawLine.id) || `line_${index + 1}`,
    name: nonEmptyString(rawLine.name) || `Line ${index + 1}`,
    type,
    points,
  };

  setLineNumber(normalizedLine, 'yarnDiameter', rawLine.yarnDiameter, globalDefaults.yarnDiameter, 0.1, 50, false);
  setLineNumber(normalizedLine, 'radialSegments', rawLine.radialSegments, globalDefaults.radialSegments, 12, 256, true);
  setLineNumber(normalizedLine, 'pathSegments', rawLine.pathSegments, globalDefaults.pathSegments, 2, 512, true);
  setLineNumber(normalizedLine, 'amplitude', rawLine.amplitude, globalDefaults.amplitude, 0, 200, false);
  setLineNumber(normalizedLine, 'period', rawLine.period, globalDefaults.period, 0.1, 1000, false);
  setLineNumber(normalizedLine, 'cornerRadius', rawLine.cornerRadius, globalDefaults.cornerRadius, 0, 200, false);

  normalizedLine.color = normalizeHexColor(rawLine.color) || normalizeHexColor(globalDefaults.color) || DEFAULT_LINE_COLOR;
  if (nonEmptyString(rawLine.groupId)) {
    normalizedLine.groupId = nonEmptyString(rawLine.groupId);
  }
  if (nonEmptyString(rawLine.pairId)) {
    normalizedLine.pairId = nonEmptyString(rawLine.pairId);
  }
  if (nonEmptyString(rawLine.pairRole)) {
    normalizedLine.pairRole = nonEmptyString(rawLine.pairRole);
  }
  if (nonEmptyString(rawLine.layer)) {
    normalizedLine.layer = nonEmptyString(rawLine.layer);
  }
  if (rawLine.crossingRule && typeof rawLine.crossingRule === 'object' && !Array.isArray(rawLine.crossingRule)) {
    normalizedLine.crossingRule = {
      mode: nonEmptyString(rawLine.crossingRule.mode) || 'alternate',
      height: clampNumber(rawLine.crossingRule.height, 2, 0, 100),
      start: /under/i.test(nonEmptyString(rawLine.crossingRule.start)) ? 'under' : 'over',
    };
  }
  if (Number.isFinite(Number(rawLine.zOffset))) {
    normalizedLine.zOffset = roundNumber(Number(rawLine.zOffset));
  }

  return normalizedLine;
}

function normalizeLinePoints(rawPoints) {
  if (!Array.isArray(rawPoints)) {
    return [];
  }

  return rawPoints
    .map((point) => {
      if (!Array.isArray(point)) {
        return null;
      }

      if (point.length >= 3) {
        const x = Number(point[0]);
        const y = Number(point[1]);
        const z = Number(point[2]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          return [roundNumber(x), roundNumber(y), roundNumber(z)];
        }
        return null;
      }

      if (point.length >= 2) {
        const x = Number(point[0]);
        const y = Number(point[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          return [roundNumber(x), roundNumber(y), 0];
        }
      }

      return null;
    })
    .filter(Boolean);
}

function clampNumber(value, fallback, min, max) {
  let next = Number(value);
  if (!Number.isFinite(next)) {
    next = Number(fallback);
  }
  if (!Number.isFinite(next)) {
    next = min;
  }
  return roundNumber(Math.min(max, Math.max(min, next)));
}

function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

function setIfNumber(target, key, value, min, max, integer) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return;
  }
  const normalized = Math.min(max, Math.max(min, next));
  target[key] = integer ? Math.round(normalized) : roundNumber(normalized);
}

function setLineNumber(target, key, lineValue, defaultValue, min, max, integer) {
  const next = Number.isFinite(Number(lineValue)) ? Number(lineValue) : Number(defaultValue);
  if (!Number.isFinite(next)) {
    return;
  }
  const normalized = Math.min(max, Math.max(min, next));
  target[key] = integer ? Math.round(normalized) : roundNumber(normalized);
}

function pickString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeLineType(value) {
  const normalized = nonEmptyString(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) {
    return '';
  }
  if (normalized === 'smoothpolyline') {
    return 'smoothPolyline';
  }
  if (normalized === 'polyline') {
    return 'polyline';
  }
  if (normalized === 'straight') {
    return 'straight';
  }
  if (normalized === 'sine' || normalized === 'wave' || normalized === 'wavy') {
    return 'sine';
  }
  if (normalized === 'bezier') {
    return 'bezier';
  }
  return '';
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : '';
}

function nonEmptyString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildFallbackYarnPathCollection() {
  return {
    modelType: 'yarn_path_collection',
    displayName: MODEL_CATALOG.yarn_path_collection.displayName,
    description: MODEL_CATALOG.yarn_path_collection.description,
    source: 'catalog_fallback',
    summary: 'Fallback line-based yarn path model',
    globalDefaults: {
      yarnDiameter: 1,
      radialSegments: 64,
      pathSegments: 120,
      color: DEFAULT_LINE_COLOR,
    },
    lines: [
      {
        id: 'vertical_1',
        name: 'Vertical strand 1',
        type: 'straight',
        points: [[0, 0, 0], [0, 100, 0]],
        yarnDiameter: 1,
        radialSegments: 64,
        pathSegments: 80,
        color: DEFAULT_LINE_COLOR,
      },
      {
        id: 'vertical_2',
        name: 'Vertical strand 2',
        type: 'straight',
        points: [[10, 0, 0], [10, 100, 0]],
        yarnDiameter: 1,
        radialSegments: 64,
        pathSegments: 80,
        color: DEFAULT_LINE_COLOR,
      },
      {
        id: 'horizontal_folded_1',
        name: 'Horizontal folded strand 1',
        type: 'smoothPolyline',
        points: [[-20, 20, 0], [20, 20, 0], [30, 12, 0], [70, 12, 0], [80, 20, 0], [120, 20, 0]],
        yarnDiameter: 1,
        radialSegments: 64,
        pathSegments: 120,
        color: DEFAULT_LINE_COLOR,
        cornerRadius: 4,
      },
      {
        id: 'highlight_yellow',
        name: 'Highlighted yellow strand',
        type: 'smoothPolyline',
        points: [[-20, 35, 0], [20, 35, 0], [30, 27, 0], [70, 27, 0], [80, 35, 0], [120, 35, 0]],
        yarnDiameter: 1,
        radialSegments: 64,
        pathSegments: 120,
        color: '#f5e642',
        cornerRadius: 4,
      },
    ],
  };
}

function buildFallbackWovenPathPattern() {
  return {
    modelType: 'woven_path_pattern',
    displayName: MODEL_CATALOG.woven_path_pattern.displayName,
    description: MODEL_CATALOG.woven_path_pattern.description,
    source: 'catalog_fallback',
    summary: 'Fallback structured woven path pattern',
    globalDefaults: {
      yarnDiameter: 1,
      radialSegments: 64,
      pathSegments: 120,
      warpColor: '#d9ddd0',
      weftColor: '#ffffff',
      highlightColor: '#f5e642',
    },
    warp: {
      count: 10,
      spacing: 8,
      length: 130,
      tilt: -12,
      start: [0, 0, 0],
      direction: [0, 1, 0],
    },
    weftPairs: {
      count: 8,
      spacing: 10,
      pairOffset: 3,
      length: 150,
      shape: 'rounded-zigzag',
      stepLength: 28,
      stepDrop: 8,
      cornerRadius: 4,
    },
    crossing: {
      mode: 'alternate',
      height: 2,
      start: 'over',
    },
    highlight: {
      weftIndex: 4,
      pairRole: 'upper',
      color: '#f5e642',
    },
    transform: {
      rotationZ: -18,
      scaleX: 1,
      scaleY: 0.85,
      scaleZ: 1,
    },
  };
}

function normalizeVector3(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) {
    return [...fallback];
  }
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return [...fallback];
  }
  return [roundNumber(x), roundNumber(y), roundNumber(z)];
}

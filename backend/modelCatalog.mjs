const MODEL_CATALOG = {
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
- Requests for parallel yarn rows, yarn surfaces made from side-by-side strands, or simple bundles should map to straight_yarn_bundle.
- Requests mentioning sheet/plane/fabric-like layer should map to yarn_sheet.
- Requests for twisted bundles or rope-like spirals should map to twisted_yarn_bundle.
- Requests for a single bent yarn should map to curved_yarn_path.
- Requests for braid/plait/interlaced strands should map to braided_yarn.
- Use millimeters for all dimensions.
- Keep values practical and printable.
- Only include parameter names that belong to the chosen model type.

Return shape:
{
  "modelType": "straight_yarn_bundle | yarn_sheet | twisted_yarn_bundle | curved_yarn_path | braided_yarn",
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

export function fallbackCatalogModel(promptText = '') {
  const prompt = promptText.toLowerCase();
  let modelType = 'straight_yarn_bundle';

  if (/(braid|plait|编织|辫)/.test(prompt)) {
    modelType = 'braided_yarn';
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

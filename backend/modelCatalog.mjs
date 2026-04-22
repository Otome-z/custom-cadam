const MODEL_CATALOG = {
  straight_yarn_bundle: {
    displayName: 'Straight Yarn Bundle',
    description: 'Parallel cylindrical yarn strands arranged side by side.',
    parameters: {
      num_strands: {
        displayName: 'Num Strands',
        description: 'Number of parallel yarn strands.',
        defaultValue: 12,
        min: 1,
        max: 64,
        step: 1,
      },
      strand_diameter: {
        displayName: 'Strand Diameter',
        description: 'Diameter of each yarn strand in millimeters.',
        defaultValue: 2,
        min: 0.2,
        max: 20,
        step: 0.1,
      },
      strand_length: {
        displayName: 'Strand Length',
        description: 'Length of each yarn strand in millimeters.',
        defaultValue: 120,
        min: 1,
        max: 500,
        step: 1,
      },
      spacing: {
        displayName: 'Spacing',
        description: 'Gap between neighboring strands in millimeters.',
        defaultValue: 1,
        min: 0,
        max: 10,
        step: 0.1,
      },
      resolution: {
        displayName: 'Resolution',
        description: 'Radial segment count used for rounded geometry.',
        defaultValue: 96,
        min: 24,
        max: 256,
        step: 4,
      },
    },
    buildCode: (params) => `// catalog_model: straight_yarn_bundle
// Canonical yarn bundle model generated from the catalog spec.
resolution = ${formatNumber(params.resolution)}; // 24:4:256
num_strands = ${formatNumber(params.num_strands)}; // 1:1:64
strand_diameter = ${formatNumber(params.strand_diameter)}; // 0.2:0.1:20
strand_length = ${formatNumber(params.strand_length)}; // 1:1:500
spacing = ${formatNumber(params.spacing)}; // 0:0.1:10

$fn = resolution;
pitch = strand_diameter + spacing;
bundle_width = (num_strands - 1) * pitch;

module yarn_strand(x_offset = 0) {
  translate([x_offset, 0, 0])
    cylinder(h = strand_length, r = strand_diameter / 2, center = true, $fn = resolution);
}

for (i = [0 : num_strands - 1]) {
  yarn_strand(-bundle_width / 2 + i * pitch);
}
`,
  },
  twisted_yarn_bundle: {
    displayName: 'Twisted Yarn Bundle',
    description: 'Several yarn strands twisting around a shared center line.',
    parameters: {
      num_strands: {
        displayName: 'Num Strands',
        description: 'Number of helical yarn strands.',
        defaultValue: 3,
        min: 2,
        max: 12,
        step: 1,
      },
      strand_diameter: {
        displayName: 'Strand Diameter',
        description: 'Diameter of each yarn strand in millimeters.',
        defaultValue: 1.4,
        min: 0.2,
        max: 12,
        step: 0.1,
      },
      strand_length: {
        displayName: 'Strand Length',
        description: 'Overall bundle length in millimeters.',
        defaultValue: 120,
        min: 1,
        max: 500,
        step: 1,
      },
      bundle_radius: {
        displayName: 'Bundle Radius',
        description: 'Radius from the center line to each strand center.',
        defaultValue: 2.6,
        min: 0.2,
        max: 40,
        step: 0.1,
      },
      twist_turns: {
        displayName: 'Twist Turns',
        description: 'How many full turns each strand makes along the bundle length.',
        defaultValue: 6,
        min: 0,
        max: 30,
        step: 0.5,
      },
      path_segments: {
        displayName: 'Path Segments',
        description: 'Number of segments used to approximate the helix path.',
        defaultValue: 72,
        min: 12,
        max: 240,
        step: 1,
      },
      resolution: {
        displayName: 'Resolution',
        description: 'Radial segment count used for rounded geometry.',
        defaultValue: 96,
        min: 24,
        max: 256,
        step: 4,
      },
    },
    buildCode: (params) => `// catalog_model: twisted_yarn_bundle
// Canonical twisted yarn bundle model generated from the catalog spec.
resolution = ${formatNumber(params.resolution)}; // 24:4:256
num_strands = ${formatNumber(params.num_strands)}; // 2:1:12
strand_diameter = ${formatNumber(params.strand_diameter)}; // 0.2:0.1:12
strand_length = ${formatNumber(params.strand_length)}; // 1:1:500
bundle_radius = ${formatNumber(params.bundle_radius)}; // 0.2:0.1:40
twist_turns = ${formatNumber(params.twist_turns)}; // 0:0.5:30
path_segments = ${formatNumber(params.path_segments)}; // 12:1:240

$fn = resolution;

function helix_point(angle_offset, t) = [
  bundle_radius * cos(angle_offset + 360 * twist_turns * t),
  bundle_radius * sin(angle_offset + 360 * twist_turns * t),
  -strand_length / 2 + strand_length * t
];

module yarn_segment(p1, p2, radius) {
  hull() {
    translate(p1) sphere(r = radius, $fn = resolution);
    translate(p2) sphere(r = radius, $fn = resolution);
  }
}

module helical_strand(angle_offset = 0) {
  for (step = [0 : path_segments - 1]) {
    t1 = step / path_segments;
    t2 = (step + 1) / path_segments;
    yarn_segment(
      helix_point(angle_offset, t1),
      helix_point(angle_offset, t2),
      strand_diameter / 2
    );
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
      strand_diameter: {
        displayName: 'Strand Diameter',
        description: 'Diameter of the yarn strand in millimeters.',
        defaultValue: 2,
        min: 0.2,
        max: 20,
        step: 0.1,
      },
      arc_radius: {
        displayName: 'Arc Radius',
        description: 'Radius of the center arc in millimeters.',
        defaultValue: 60,
        min: 1,
        max: 300,
        step: 1,
      },
      arc_angle: {
        displayName: 'Arc Angle',
        description: 'Sweep angle of the yarn center path in degrees.',
        defaultValue: 120,
        min: 10,
        max: 330,
        step: 1,
      },
      path_segments: {
        displayName: 'Path Segments',
        description: 'Number of segments used to approximate the curved path.',
        defaultValue: 48,
        min: 8,
        max: 240,
        step: 1,
      },
      resolution: {
        displayName: 'Resolution',
        description: 'Radial segment count used for rounded geometry.',
        defaultValue: 96,
        min: 24,
        max: 256,
        step: 4,
      },
    },
    buildCode: (params) => `// catalog_model: curved_yarn_path
// Canonical curved yarn path model generated from the catalog spec.
resolution = ${formatNumber(params.resolution)}; // 24:4:256
strand_diameter = ${formatNumber(params.strand_diameter)}; // 0.2:0.1:20
arc_radius = ${formatNumber(params.arc_radius)}; // 1:1:300
arc_angle = ${formatNumber(params.arc_angle)}; // 10:1:330
path_segments = ${formatNumber(params.path_segments)}; // 8:1:240

$fn = resolution;

function arc_point(t) = let(angle = -arc_angle / 2 + arc_angle * t)
  [
    arc_radius * sin(angle),
    0,
    arc_radius * cos(angle) - arc_radius * cos(arc_angle / 2)
  ];

module yarn_segment(p1, p2, radius) {
  hull() {
    translate(p1) sphere(r = radius, $fn = resolution);
    translate(p2) sphere(r = radius, $fn = resolution);
  }
}

for (step = [0 : path_segments - 1]) {
  t1 = step / path_segments;
  t2 = (step + 1) / path_segments;
  yarn_segment(arc_point(t1), arc_point(t2), strand_diameter / 2);
}
`,
  },
};

export const MODEL_SPEC_SYSTEM_PROMPT = `You convert natural-language yarn modeling requests into one of the supported catalog models.

Return JSON only. Do not use markdown. Do not explain anything.

Supported model types:
${serializeCatalogForPrompt()}

Rules:
- Prefer the closest supported catalog model whenever possible.
- Requests for parallel yarn rows, yarn surfaces made from side-by-side strands, or simple straight yarn bundles should map to straight_yarn_bundle.
- Requests for twisted yarn bundles, rope-like yarn bundles, or strands spiraling around a center should map to twisted_yarn_bundle.
- Requests for a single bent yarn, arc-shaped yarn, or a smooth curved yarn path should map to curved_yarn_path.
- If the request is outside these supported model families, return {"modelType":"custom_scad","summary":"..."}.
- Use millimeters for all dimensions.
- Keep values practical and printable.
- Only include parameter names that belong to the chosen model type.

Return shape:
{
  "modelType": "straight_yarn_bundle | twisted_yarn_bundle | curved_yarn_path | custom_scad",
  "summary": "short plain-language summary",
  "parameters": {
    "parameter_name": number
  }
}`;

export function normalizeCatalogModel(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const modelType =
    typeof payload.modelType === 'string'
      ? payload.modelType.trim()
      : '';

  if (!modelType || modelType === 'custom_scad') {
    return null;
  }

  const entry = MODEL_CATALOG[modelType];
  if (!entry) {
    return null;
  }

  const rawParameters =
    payload.parameters && typeof payload.parameters === 'object'
      ? payload.parameters
      : {};

  const parameters = Object.entries(entry.parameters).map(([name, schema]) => {
    const value = normalizeNumber(rawParameters[name], schema);

    return {
      name,
      displayName: schema.displayName,
      value,
      defaultValue: schema.defaultValue,
      type: 'number',
      description: schema.description,
      range: {
        min: schema.min,
        max: schema.max,
        step: schema.step,
      },
    };
  });

  return {
    modelType,
    displayName: entry.displayName,
    description: entry.description,
    source: 'catalog',
    summary:
      typeof payload.summary === 'string' && payload.summary.trim()
        ? payload.summary.trim()
        : undefined,
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

  const params = Object.fromEntries(
    (Array.isArray(modelSpec.parameters) ? modelSpec.parameters : []).map((parameter) => [
      parameter.name,
      Number(parameter.value),
    ]),
  );

  return entry.buildCode(params);
}

function serializeCatalogForPrompt() {
  return Object.entries(MODEL_CATALOG)
    .map(([modelType, entry]) => {
      const parameters = Object.entries(entry.parameters)
        .map(([name, schema]) => {
          return `  - ${name}: default=${schema.defaultValue}, range=${schema.min}..${schema.max}, step=${schema.step}`;
        })
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

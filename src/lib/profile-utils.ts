import {
  Profile,
  ProfileSummary,
  AircraftType,
  PublishedStatus,
  RangeColour,
  Gauge,
  GaugeRange,
} from "@/types";

function generateId(): string {
  return crypto.randomUUID();
}

export function fixUpGauges(profile: Profile): void {
  profile.manifoldPressure.allowDecimals = true;
  profile.fuelFlow.allowDecimals = true;
  profile.oilPressure.allowDecimals = true;

  fixRanges(profile.manifoldPressure);
  fixRanges(profile.fuelFlow);
  fixRanges(profile.oilPressure);

  // Ensure all gauge ranges have stable IDs (backfill for pre-existing profiles)
  const gaugeKeys: (keyof Profile)[] = [
    "manifoldPressure", "cht", "egt", "tit", "load",
    "torque", "ng", "itt", "rpm", "fuel", "fuelFlow",
    "oilPressure", "oilTemperature",
  ];
  for (const key of gaugeKeys) {
    const gauge = profile[key] as Gauge;
    if (gauge?.ranges) {
      for (const range of gauge.ranges) {
        if (!range.id) {
          range.id = generateId();
        }
      }
    }
  }
}

function fixRanges(gauge: Gauge): void {
  for (let i = 0; i < 4; i++) {
    gauge.ranges[i].allowDecimals = true;
  }
}

export function filterByPublished(profiles: ProfileSummary[]): ProfileSummary[] {
  return profiles.filter((x) => x.isPublished);
}

export function filterByType(profiles: ProfileSummary[], type: AircraftType): ProfileSummary[] {
  return profiles.filter((x) => x.aircraftType === type);
}

export function filterByEngineCount(profiles: ProfileSummary[], engines: number): ProfileSummary[] {
  return profiles.filter((x) => x.engines === engines);
}

export function filterByOwner(profiles: ProfileSummary[], ownerId: string): ProfileSummary[] {
  return profiles.filter((x) => x.owner?.id != null && x.owner.id === ownerId);
}

export function filterBySearch(profiles: ProfileSummary[], searchTerms: string): ProfileSummary[] {
  if (!searchTerms?.trim()) return profiles;

  const terms = searchTerms.split(/[\s,]+/);
  let output = profiles;
  for (const term of terms) {
    const lower = term.toLowerCase();
    output = output.filter(
      (x) =>
        (x.name && x.name.toLowerCase().includes(lower)) ||
        (x.owner?.name && x.owner.name.toLowerCase().includes(lower)) ||
        AircraftType[x.aircraftType]?.toLowerCase().includes(lower)
    );
  }
  return output;
}

export function filterProfiles(
  profiles: ProfileSummary[],
  published: PublishedStatus,
  type: AircraftType | null,
  engines: number | null,
  ownerId: string | null,
  ownerOnly: boolean,
  searchTerms: string | null
): ProfileSummary[] {
  let output: ProfileSummary[];

  switch (published) {
    case PublishedStatus.Unpublished:
      output = profiles.filter((x) => !x.isPublished);
      break;
    case PublishedStatus.PublishedOwner:
      output = profiles.filter((x) => x.isPublished || x.owner?.id === ownerId);
      break;
    case PublishedStatus.UnpublishedOwner:
      output = profiles.filter((x) => !x.isPublished && x.owner?.id === ownerId);
      break;
    default:
      output = profiles.filter((x) => x.isPublished);
      break;
  }

  if (type != null) output = filterByType(output, type);
  if (engines != null) output = filterByEngineCount(output, engines);
  if (ownerId != null && ownerOnly) output = filterByOwner(output, ownerId);
  if (searchTerms != null) output = filterBySearch(output, searchTerms);

  return output.sort(
    (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );
}

export function createDefaultGauge(
  name: string,
  min: number | null = null,
  max: number | null = null,
  options: {
    fuelInGallons?: boolean | null;
    capacityForSingleTank?: number | null;
    torqueInFootPounds?: boolean | null;
    maxPower?: number | null;
    allowDecimals?: boolean;
  } = {}
): Gauge {
  const ranges: GaugeRange[] = Array.from({ length: 4 }, () => ({
    id: generateId(),
    colour: RangeColour.None,
    min: 0,
    max: 0,
    allowDecimals: options.allowDecimals ?? false,
  }));

  return {
    name: name,
    min: min,
    max: max,
    fuelInGallons: options.fuelInGallons ?? null,
    capacityForSingleTank: options.capacityForSingleTank ?? null,
    torqueInFootPounds: options.torqueInFootPounds ?? null,
    maxPower: options.maxPower ?? null,
    ranges: ranges,
    allowDecimals: options.allowDecimals ?? false,
  };
}

export function createDefaultProfile(): Profile {
  return {
    id: null,
    owner: { id: null, name: null },
    lastUpdated: new Date().toISOString(),
    name: "New Profile",
    aircraftType: AircraftType.Piston,
    engines: 1,
    isPublished: false,
    notes: null,
    cylinders: 4,
    fadec: false,
    turbocharged: false,
    constantSpeed: false,
    vacuumPSIRange: { min: 0, max: 0, greenStart: 0, greenEnd: 0 },
    manifoldPressure: createDefaultGauge("Manifold Pressure (inHg)", 0, 0, { allowDecimals: true }),
    cht: createDefaultGauge("CHT (\u00b0F)", 0, 0),
    egt: createDefaultGauge("EGT (\u00b0F)", 0, 0),
    tit: createDefaultGauge("TIT (\u00b0F)", 0, 0),
    load: createDefaultGauge("Load %"),
    torque: createDefaultGauge("Torque (FT-LB)", 0, 0, { torqueInFootPounds: true }),
    ng: createDefaultGauge("NG (RPM%)", null, null),
    itt: createDefaultGauge("ITT (\u00b0F)", 0, 0),
    temperaturesInFahrenheit: true,
    rpm: createDefaultGauge("RPM", null, 0),
    fuel: createDefaultGauge("Fuel", undefined, undefined, { fuelInGallons: true, capacityForSingleTank: 0 }),
    fuelFlow: createDefaultGauge("Fuel Flow (GPH)", null, 0, { allowDecimals: true }),
    oilPressure: createDefaultGauge("Oil Pressure (PSI)", null, 0, { allowDecimals: true }),
    oilTemperature: createDefaultGauge("Oil Temp (\u00b0F)", 0, 0),
    displayElevatorTrim: false,
    elevatorTrimTakeOffRange: { min: 0, max: 0 },
    displayRudderTrim: false,
    rudderTrimTakeOffRange: { min: 0, max: 0 },
    displayFlapsIndicator: false,
    flapsRange: {
      markings: ["UP", null, null, null, null, "F"],
      positions: [0, null, null, null, null, 100],
    },
    vSpeeds: { Vs0: 0, Vs1: 0, Vfe: 0, Vno: 0, Vne: 0, Vglide: 0, Vr: 0, Vx: 0, Vy: 0 },
  };
}

export function getAircraftTypeImage(type: AircraftType): string {
  switch (type) {
    case AircraftType.Piston:
      return "/img/piston.jpg";
    case AircraftType.Turboprop:
      return "/img/turboprop.jpg";
    case AircraftType.Jet:
      return "/img/jet.jpg";
    default:
      return "";
  }
}

export function getAircraftTypeName(type: AircraftType): string {
  return AircraftType[type] ?? "Unknown";
}

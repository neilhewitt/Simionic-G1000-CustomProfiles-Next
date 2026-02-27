import { AircraftType } from "./enums";
import { Gauge } from "./gauge";

export interface OwnerInfo {
  id: string | null;
  name: string | null;
}

export interface SettingRange {
  min: number;
  max: number;
}

export interface VacuumPSIRange {
  min: number;
  max: number;
  greenStart: number;
  greenEnd: number;
}

export interface FlapsRange {
  markings: (string | null)[];
  positions: (number | null)[];
}

export interface VSpeeds {
  Vs0: number;
  Vs1: number;
  Vfe: number;
  Vno: number;
  Vne: number;
  Vglide: number;
  Vr: number;
  Vx: number;
  Vy: number;
}

export interface ProfileSummary {
  id: string;
  owner: OwnerInfo;
  lastUpdated: string;
  name: string;
  aircraftType: AircraftType;
  engines: number;
  isPublished: boolean;
  notes: string | null;
}

interface BaseProfile {
  owner: OwnerInfo;
  lastUpdated: string;
  name: string;
  aircraftType: AircraftType;
  engines: number;
  isPublished: boolean;
  notes: string | null;

  // Piston only
  cylinders: number;
  fadec: boolean;
  turbocharged: boolean;
  constantSpeed: boolean;
  vacuumPSIRange: VacuumPSIRange;
  manifoldPressure: Gauge;
  cht: Gauge;
  egt: Gauge;
  tit: Gauge;
  load: Gauge;

  // Turbo only
  torque: Gauge;
  ng: Gauge;

  // Turbo + Jet
  itt: Gauge;

  // Common to all
  temperaturesInFahrenheit: boolean;
  rpm: Gauge;
  fuel: Gauge;
  fuelFlow: Gauge;
  oilPressure: Gauge;
  oilTemperature: Gauge;

  displayElevatorTrim: boolean;
  elevatorTrimTakeOffRange: SettingRange;
  displayRudderTrim: boolean;
  rudderTrimTakeOffRange: SettingRange;
  displayFlapsIndicator: boolean;
  flapsRange: FlapsRange;
  vSpeeds: VSpeeds;
}

export interface NewProfile extends BaseProfile {
  id: null;
}

export interface SavedProfile extends BaseProfile {
  id: string;
}

export type Profile = NewProfile | SavedProfile;

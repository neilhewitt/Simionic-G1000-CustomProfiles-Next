import { RangeColour } from "./enums";

export interface GaugeRange {
  id: string;
  colour: RangeColour;
  min: number;
  max: number;
  allowDecimals?: boolean;
}

export interface Gauge {
  name: string;
  min: number | null;
  max: number | null;
  fuelInGallons?: boolean | null;
  capacityForSingleTank?: number | null;
  torqueInFootPounds?: boolean | null;
  maxPower?: number | null;
  ranges: GaugeRange[];
  allowDecimals: boolean;
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Gauge, RangeColour } from "@/types";

interface GaugeDisplayProps {
  gauge: Gauge;
  gaugeType?: "Standard" | "Fuel" | "Torque" | "Load" | "NG";
  hasRange?: boolean;
  editing?: boolean;
  onChange?: (gauge: Gauge) => void;
}

function getColourName(colour: RangeColour): string {
  switch (colour) {
    case RangeColour.Green: return "green";
    case RangeColour.Yellow: return "yellow";
    case RangeColour.Red: return "red";
    default: return "none";
  }
}

function ColourIndicator({
  range,
  index,
  editing,
  onChange,
}: {
  range: { colour: RangeColour; min: number; max: number };
  index: number;
  editing: boolean;
  onChange: (index: number, colour: RangeColour) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const colourName = getColourName(range.colour);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showDropdown]);

  return (
    <div className="col" ref={dropdownRef}>
      <div
        className="profile-indicator"
        role={editing ? "button" : undefined}
        onClick={() => editing && setShowDropdown(!showDropdown)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/img/${colourName}.jpg`}
          alt={colourName}
          style={{ height: "125%", width: "100%", objectFit: "cover" }}
        />
      </div>
      {editing && showDropdown && (
        <ul className="dropdown-menu show px-0 py-0 w100">
          <li><button type="button" className="profile-indicator none p-0 border-0 w-100" aria-label="None" onClick={() => { onChange(index, RangeColour.None); setShowDropdown(false); }} /></li>
          <li><button type="button" className="profile-indicator green p-0 border-0 w-100" aria-label="Green" onClick={() => { onChange(index, RangeColour.Green); setShowDropdown(false); }} /></li>
          <li><button type="button" className="profile-indicator yellow p-0 border-0 w-100" aria-label="Yellow" onClick={() => { onChange(index, RangeColour.Yellow); setShowDropdown(false); }} /></li>
          <li><button type="button" className="profile-indicator red p-0 border-0 w-100" aria-label="Red" onClick={() => { onChange(index, RangeColour.Red); setShowDropdown(false); }} /></li>
        </ul>
      )}
    </div>
  );
}

export default function GaugeDisplay({
  gauge,
  gaugeType = "Standard",
  hasRange = false,
  editing = false,
  onChange,
}: GaugeDisplayProps) {
  if (!gauge) return null;

  function updateGauge(updates: Partial<Gauge>) {
    if (onChange) {
      onChange({ ...gauge, ...updates });
    }
  }

  function handleNumericChange(field: keyof Gauge, value: string) {
    if (value === "") {
      // Allow empty string as intermediate state for nullable fields; coerce to 0 on blur
      // Gauge.min and Gauge.max are number | null, so null is type-safe here
      updateGauge({ [field]: null });
      return;
    }
    const num = Number(value);
    if (!isNaN(num)) updateGauge({ [field]: num });
  }

  function handleNumericBlur(field: keyof Gauge, value: string) {
    if (value === "") updateGauge({ [field]: 0 });
  }

  function updateRangeColour(index: number, colour: RangeColour) {
    const newRanges = [...gauge.ranges];
    newRanges[index] = { ...newRanges[index], colour: colour };
    updateGauge({ ranges: newRanges });
  }

  function updateRangeValue(index: number, field: "min" | "max", value: string) {
    if (value === "") {
      // Don't update the model while the field is empty; coerce to 0 on blur instead
      return;
    }
    const num = Number(value);
    if (isNaN(num)) return;
    const newRanges = [...gauge.ranges];
    newRanges[index] = { ...newRanges[index], [field]: num };
    updateGauge({ ranges: newRanges });
  }

  function handleRangeBlur(index: number, field: "min" | "max", value: string) {
    if (value === "") {
      const newRanges = [...gauge.ranges];
      newRanges[index] = { ...newRanges[index], [field]: 0 };
      updateGauge({ ranges: newRanges });
    }
  }

  function isSelectedButton(active: boolean): string {
    return active ? "btn-primary" : "btn-secondary";
  }

  return (
    <div>
      {/* Header row */}
      <div className="row justify-content-center">
        <div className={`${gaugeType === "NG" ? "col-12" : "col-3"} pt-2 pr-5`}>
          <p className="text-black font-weight-bold">{gauge.name}</p>
        </div>

        {gaugeType === "Fuel" && (
          <>
            <div className="col-2">
              <div className="form-group">
                <div className="btn-group">
                  <button
                    className={`btn btn-medium ${isSelectedButton(!!gauge.fuelInGallons)} mt-1 mb-1 shadow-none`}
                    onClick={() => editing && updateGauge({ fuelInGallons: true })}
                    disabled={!editing}
                  >
                    Gal
                  </button>
                  <button
                    className={`btn btn-medium ${isSelectedButton(!gauge.fuelInGallons)} mt-1 mb-1 shadow-none`}
                    onClick={() => editing && updateGauge({ fuelInGallons: false })}
                    disabled={!editing}
                  >
                    Lb
                  </button>
                </div>
              </div>
            </div>
            <div className="col-7">
              <div className="form-group">
                <label className="form-label text-black font-weight-bold mt-1">
                  Capacity for a single tank{" "}
                  <input
                    type="number"
                    step="1"
                    className="input-text ml-2 custom-profile-textbox"
                    value={gauge.capacityForSingleTank ?? ""}
                    onChange={(e) => handleNumericChange("capacityForSingleTank", e.target.value)}
                    disabled={!editing}
                  />
                </label>
              </div>
            </div>
          </>
        )}

        {gaugeType === "Standard" && hasRange && (
          <div className="col-9 pt-1">
            <div className="form-group">
              <label className="form-label text-black font-weight-bold">
                Range
                <input
                  type="number"
                  step={gauge.allowDecimals ? "any" : "1"}
                  className="input-text ml-2 custom-profile-textbox"
                  value={gauge.min ?? ""}
                  onChange={(e) => handleNumericChange("min", e.target.value)}
                  onBlur={(e) => handleNumericBlur("min", e.target.value)}
                  disabled={!editing}
                />
                <span>~</span>
                <input
                  type="number"
                  step={gauge.allowDecimals ? "any" : "1"}
                  className="input-text custom-profile-textbox"
                  value={gauge.max ?? ""}
                  onChange={(e) => handleNumericChange("max", e.target.value)}
                  onBlur={(e) => handleNumericBlur("max", e.target.value)}
                  disabled={!editing}
                />
              </label>
            </div>
          </div>
        )}

        {gaugeType === "Standard" && !hasRange && (
          <div className="col-9 pt-1">
            <div className="form-group">
              <label className="form-label text-black font-weight-bold">
                Max
                <input
                  type="number"
                  step={gauge.allowDecimals ? "any" : "1"}
                  className="input-text ml-2 custom-profile-textbox"
                  value={gauge.max ?? ""}
                  onChange={(e) => handleNumericChange("max", e.target.value)}
                  disabled={!editing}
                />
              </label>
            </div>
          </div>
        )}

        {gaugeType === "Load" && (
          <div className="col-9">
            <div className="form-group">
              <label className="form-label text-black font-weight-bold">
                Max power (watts)
                <input
                  type="number"
                  step="1"
                  className="input-text ml-2 custom-profile-textbox-wide"
                  value={gauge.maxPower ?? ""}
                  onChange={(e) => handleNumericChange("maxPower", e.target.value)}
                  disabled={!editing}
                />
              </label>
            </div>
          </div>
        )}

        {gaugeType === "Torque" && (
          <>
            <div className="col-6 pt-1">
              <div className="form-group">
                <label className="form-label text-black font-weight-bold">
                  Range
                  <input
                    type="number"
                    step="any"
                    className="input-text ml-2 custom-profile-textbox"
                    value={gauge.min ?? ""}
                    onChange={(e) => handleNumericChange("min", e.target.value)}
                    disabled={!editing}
                  />
                  <span>~</span>
                  <input
                    type="number"
                    step="any"
                    className="input-text custom-profile-textbox"
                    value={gauge.max ?? ""}
                    onChange={(e) => handleNumericChange("max", e.target.value)}
                    disabled={!editing}
                  />
                </label>
              </div>
            </div>
            <div className="col-3">
              <div className="form-group">
                <div className="btn-group">
                  <button
                    className={`btn btn-medium ${isSelectedButton(!!gauge.torqueInFootPounds)} mt-1 mb-1 shadow-none`}
                    onClick={() => editing && updateGauge({ torqueInFootPounds: true })}
                    disabled={!editing}
                  >
                    Value
                  </button>
                  <button
                    className={`btn btn-medium ${isSelectedButton(!gauge.torqueInFootPounds)} mt-1 mb-1 shadow-none`}
                    onClick={() => editing && updateGauge({ torqueInFootPounds: false })}
                    disabled={!editing}
                  >
                    Percentage
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Colour indicator bars */}
      <div className="row justify-content-center mb-0">
        {gauge.ranges.map((range, i) => (
          <ColourIndicator
            key={range.id}
            range={range}
            index={i}
            editing={editing}
            onChange={updateRangeColour}
          />
        ))}
      </div>

      {/* Range value inputs */}
      <div className="row justify-content-center mb-5">
        {gauge.ranges.map((range, i) => (
          <div key={range.id} className="col">
            <input
              type="number"
              step={range.allowDecimals ? "any" : "1"}
              className="input-text custom-profile-valuebox"
              value={range.min ?? ""}
              onChange={(e) => updateRangeValue(i, "min", e.target.value)}
              onBlur={(e) => handleRangeBlur(i, "min", e.target.value)}
              disabled={!editing}
            />
            <input
              type="number"
              step={range.allowDecimals ? "any" : "1"}
              className="input-text custom-profile-valuebox"
              value={range.max ?? ""}
              onChange={(e) => updateRangeValue(i, "max", e.target.value)}
              onBlur={(e) => handleRangeBlur(i, "max", e.target.value)}
              disabled={!editing}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

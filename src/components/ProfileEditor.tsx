"use client";

import { Fragment } from "react";
import { Profile, AircraftType, Gauge } from "@/types";
import GaugeDisplay from "./GaugeDisplay";

const vspeedTooltips: Record<string, string> = {
  Vs0: "Stall speed in landing configuration (flaps down)",
  Vs1: "Stall speed in clean configuration (flaps up)",
  Vfe: "Maximum flap extended speed",
  Vno: "Maximum structural cruising speed",
  Vne: "Never exceed speed",
  Vglide: "Best glide speed",
  Vr: "Rotation speed",
  Vx: "Best angle of climb speed",
  Vy: "Best rate of climb speed",
};

interface ProfileEditorProps {
  profile: Profile;
  editing: boolean;
  onChange?: (profile: Profile) => void;
}

export default function ProfileEditor({ profile, editing, onChange }: ProfileEditorProps) {
  function update(updates: Partial<Profile>) {
    if (onChange) {
      onChange({ ...profile, ...updates });
    }
  }

  function parseNum(value: string): number | null {
    const num = value === "" ? 0 : Number(value);
    return isNaN(num) ? null : num;
  }

  function updateGauge(key: keyof Profile, gauge: Gauge) {
    update({ [key]: gauge });
  }

  function setTempScale(fahrenheit: boolean) {
    const newTemp = "\u00b0" + (fahrenheit ? "F" : "C");
    const oldTemp = "\u00b0" + (fahrenheit ? "C" : "F");

    const gaugeKeys: (keyof Profile)[] = [
      "cht", "egt", "torque", "ng", "itt", "manifoldPressure",
      "load", "rpm", "fuel", "tit", "fuelFlow", "oilPressure", "oilTemperature",
    ];

    const updates: Partial<Profile> = { temperaturesInFahrenheit: fahrenheit };
    for (const key of gaugeKeys) {
      const gauge = profile[key] as Gauge;
      if (gauge?.name) {
        Object.assign(updates, { [key]: { ...gauge, name: gauge.name.replace(oldTemp, newTemp) } });
      }
    }
    update(updates);
  }

  function setFADEC(fadec: boolean) {
    update({ fadec: fadec, constantSpeed: fadec ? false : profile.constantSpeed });
  }

  function isSelectedButton(active: boolean): string {
    return active ? "btn-primary" : "btn-secondary";
  }

  return (
    <div>
      {/* Aircraft type */}
      <div className="row">
        <div className="col-3">
          <label className="form-label text-black font-weight-bold pt-2">Type</label>
        </div>
        <div className="col-9">
          <div className="form-group">
            <div className="btn-group">
              {[AircraftType.Piston, AircraftType.Turboprop, AircraftType.Jet].map((type) => (
                <button
                  key={type}
                  className={`btn btn-medium ${isSelectedButton(profile.aircraftType === type)} mt-1 mb-1 shadow-none`}
                  onClick={() => update({ aircraftType: type })}
                  disabled={!editing}
                >
                  {AircraftType[type]}
                </button>
              ))}
            </div>
            <div className="btn-group">
              <button
                className={`btn btn-medium ${isSelectedButton(profile.engines === 1)} mt-1 mb-1 shadow-none`}
                onClick={() => update({ engines: 1 })}
                disabled={!editing}
              >
                Single
              </button>
              <button
                className={`btn btn-medium ${isSelectedButton(profile.engines === 2)} mt-1 mb-1 shadow-none`}
                onClick={() => update({ engines: 2 })}
                disabled={!editing}
              >
                Twin
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Piston-specific options */}
      {profile.aircraftType === AircraftType.Piston && (
        <>
          <div className="row">
            <div className="col-3">
              <label className="form-label text-black font-weight-bold pt-2">Cylinders</label>
            </div>
            <div className="col-9">
              <div className="form-group">
                <div className="btn-group">
                  <button
                    className={`btn btn-medium ${isSelectedButton(profile.cylinders === 4)} mt-1 mb-1 shadow-none`}
                    onClick={() => update({ cylinders: 4 })}
                    disabled={!editing}
                  >
                    4
                  </button>
                  <button
                    className={`btn btn-medium ${isSelectedButton(profile.cylinders === 6)} mt-1 mb-1 shadow-none`}
                    onClick={() => update({ cylinders: 6 })}
                    disabled={!editing}
                  >
                    6
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="row">
            <div className="col-3 pt-1">
              <label className="form-label text-black font-weight-bold">FADEC</label>
            </div>
            <div className="col-9">
              <input className="form-check-input custom-profile-checkbox shadow-none" type="checkbox" checked={profile.fadec} onChange={(e) => setFADEC(e.target.checked)} disabled={!editing} />
            </div>
          </div>
          <div className="row">
            <div className="col-3 pt-1">
              <label className="form-label text-black font-weight-bold">Turbocharged</label>
            </div>
            <div className="col-9">
              <input className="form-check-input custom-profile-checkbox shadow-none" type="checkbox" checked={profile.turbocharged} onChange={(e) => update({ turbocharged: e.target.checked })} disabled={!editing} />
            </div>
          </div>
          <div className="row">
            <div className="col-3 pt-1">
              <label className="form-label text-black font-weight-bold">Constant-speed</label>
            </div>
            <div className="col-9">
              <input className="form-check-input custom-profile-checkbox shadow-none" type="checkbox" checked={profile.constantSpeed} onChange={(e) => update({ constantSpeed: e.target.checked })} disabled={!editing || profile.fadec} />
            </div>
          </div>
        </>
      )}

      {/* Temperature scale */}
      <div className="row pt-3">
        <div className="col-3 pt-3 pt-1">
          <label className="form-label text-black font-weight-bold mr-2">Temperature</label>
        </div>
        <div className="col-9 pt-2">
          <div className="form-group">
            <div className="btn-group">
              <button
                className={`btn btn-medium ${isSelectedButton(profile.temperaturesInFahrenheit)} mt-1 mb-1 shadow-none`}
                onClick={() => setTempScale(true)}
                disabled={!editing}
              >
                &deg;F
              </button>
              <button
                className={`btn btn-medium ${isSelectedButton(!profile.temperaturesInFahrenheit)} mt-1 mb-1 shadow-none`}
                onClick={() => setTempScale(false)}
                disabled={!editing}
              >
                &deg;C
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Gauges - conditional on aircraft type */}
      {profile.aircraftType !== AircraftType.Piston && (
        <GaugeDisplay gauge={profile.itt} gaugeType="Standard" hasRange editing={editing} onChange={(g) => updateGauge("itt", g)} />
      )}
      {profile.aircraftType === AircraftType.Turboprop && (
        <GaugeDisplay gauge={profile.torque} gaugeType="Torque" hasRange editing={editing} onChange={(g) => updateGauge("torque", g)} />
      )}
      {profile.aircraftType === AircraftType.Piston && profile.constantSpeed && (
        <GaugeDisplay gauge={profile.manifoldPressure} gaugeType="Standard" hasRange editing={editing} onChange={(g) => updateGauge("manifoldPressure", g)} />
      )}
      {profile.aircraftType === AircraftType.Piston && profile.fadec && (
        <GaugeDisplay gauge={profile.load} gaugeType="Load" editing={editing} onChange={(g) => updateGauge("load", g)} />
      )}
      {profile.aircraftType !== AircraftType.Jet && (
        <GaugeDisplay gauge={profile.rpm} gaugeType="Standard" editing={editing} onChange={(g) => updateGauge("rpm", g)} />
      )}
      {profile.aircraftType === AircraftType.Piston && profile.turbocharged && (
        <GaugeDisplay gauge={profile.tit} gaugeType="Standard" hasRange editing={editing} onChange={(g) => updateGauge("tit", g)} />
      )}
      {profile.aircraftType === AircraftType.Turboprop && (
        <GaugeDisplay gauge={profile.ng} gaugeType="NG" editing={editing} onChange={(g) => updateGauge("ng", g)} />
      )}

      <GaugeDisplay gauge={profile.fuel} gaugeType="Fuel" editing={editing} onChange={(g) => updateGauge("fuel", g)} />
      <GaugeDisplay gauge={profile.fuelFlow} gaugeType="Standard" editing={editing} onChange={(g) => updateGauge("fuelFlow", g)} />

      {/* Vacuum PSI - Piston only */}
      {profile.aircraftType === AircraftType.Piston && (
        <div className="row mb-5">
          <div className="col-2 pt-2 pr-5"><p className="text-black font-weight-bold">Vacuum (PSI)</p></div>
          <div className="col-md-auto pt-2 pr-1"><p className="text-black font-weight-bold">Range</p></div>
          <div className="col-md-auto pt-1">
            <div className="form-group">
              <label className="form-label text-black font-weight-bold">
                <input type="number" step="any" className="input-text ml-2 custom-profile-textbox" value={profile.vacuumPSIRange.min} onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ vacuumPSIRange: { ...profile.vacuumPSIRange, min: n } }); }} disabled={!editing} />
                <span>~</span>
                <input type="number" step="any" className="input-text custom-profile-textbox" value={profile.vacuumPSIRange.max} onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ vacuumPSIRange: { ...profile.vacuumPSIRange, max: n } }); }} disabled={!editing} />
              </label>
            </div>
          </div>
          <div className="col-md-auto pt-2 pl-5 pr-1"><p className="text-black font-weight-bold">Green</p></div>
          <div className="col-md-auto pt-1">
            <div className="form-group">
              <label className="form-label text-black font-weight-bold">
                <input type="number" step="any" className="input-text ml-2 custom-profile-textbox" value={profile.vacuumPSIRange.greenStart} onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ vacuumPSIRange: { ...profile.vacuumPSIRange, greenStart: n } }); }} disabled={!editing} />
                <span>~</span>
                <input type="number" step="any" className="input-text ml-2 custom-profile-textbox" value={profile.vacuumPSIRange.greenEnd} onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ vacuumPSIRange: { ...profile.vacuumPSIRange, greenEnd: n } }); }} disabled={!editing} />
              </label>
            </div>
          </div>
        </div>
      )}

      <GaugeDisplay gauge={profile.oilPressure} gaugeType="Standard" editing={editing} onChange={(g) => updateGauge("oilPressure", g)} />
      <GaugeDisplay gauge={profile.oilTemperature} gaugeType="Standard" hasRange editing={editing} onChange={(g) => updateGauge("oilTemperature", g)} />

      {profile.aircraftType === AircraftType.Piston && (
        <>
          <GaugeDisplay gauge={profile.cht} gaugeType="Standard" hasRange editing={editing} onChange={(g) => updateGauge("cht", g)} />
          <GaugeDisplay gauge={profile.egt} gaugeType="Standard" hasRange editing={editing} onChange={(g) => updateGauge("egt", g)} />
        </>
      )}

      {/* Elevator Trim */}
      <div className="row mb-3">
        <div className="col-2 pt-1">
          <label className="form-label text-black font-weight-bold">Elevator Trim</label>
        </div>
        <div className="col-2">
          <input className="form-check-input custom-profile-checkbox shadow-none" type="checkbox" checked={profile.displayElevatorTrim} onChange={(e) => update({ displayElevatorTrim: e.target.checked })} disabled={!editing} />
        </div>
        <div className="col-md-auto pt-1 ml-5">
          <div className="form-group mb-0">
            <label className={`form-label ${profile.displayElevatorTrim ? "text-black" : "text-muted"} font-weight-bold`}>
              T/O Range (0-100)
              <input type="number" step="1" className="input-text ml-2 custom-profile-textbox" value={profile.elevatorTrimTakeOffRange.min} onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ elevatorTrimTakeOffRange: { ...profile.elevatorTrimTakeOffRange, min: n } }); }} disabled={!editing || !profile.displayElevatorTrim} />
              ~<input type="number" step="1" className="input-text ml-2 custom-profile-textbox" value={profile.elevatorTrimTakeOffRange.max} onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ elevatorTrimTakeOffRange: { ...profile.elevatorTrimTakeOffRange, max: n } }); }} disabled={!editing || !profile.displayElevatorTrim} />
            </label>
          </div>
        </div>
      </div>

      {/* Rudder Trim */}
      <div className="row mb-3">
        <div className="col-2 pt-1">
          <label className="form-label text-black font-weight-bold">Rudder Trim</label>
        </div>
        <div className="col-2">
          <input className="form-check-input custom-profile-checkbox shadow-none" type="checkbox" checked={profile.displayRudderTrim} onChange={(e) => update({ displayRudderTrim: e.target.checked })} disabled={!editing} />
        </div>
        <div className="col-md-auto pt-1 ml-5">
          <div className="form-group mb-0">
            <label className={`form-label ${profile.displayRudderTrim ? "text-black" : "text-muted"} font-weight-bold`}>
              T/O Range (0-100)
              <input type="number" step="1" className="input-text ml-2 custom-profile-textbox" value={profile.rudderTrimTakeOffRange.min} onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ rudderTrimTakeOffRange: { ...profile.rudderTrimTakeOffRange, min: n } }); }} disabled={!editing || !profile.displayRudderTrim} />
              ~<input type="number" step="1" className="input-text ml-2 custom-profile-textbox" value={profile.rudderTrimTakeOffRange.max} onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ rudderTrimTakeOffRange: { ...profile.rudderTrimTakeOffRange, max: n } }); }} disabled={!editing || !profile.displayRudderTrim} />
            </label>
          </div>
        </div>
      </div>

      {/* Flap Indicator */}
      <div className="row mb-4">
        <div className="col-2 pt-1">
          <label className="form-label text-black font-weight-bold">Flap Indicator</label>
        </div>
        <div className="col-2">
          <input className="form-check-input custom-profile-checkbox shadow-none" type="checkbox" checked={profile.displayFlapsIndicator} onChange={(e) => update({ displayFlapsIndicator: e.target.checked })} disabled={!editing} />
        </div>
      </div>

      {/* Flap Markings */}
      <div className="row">
        <div className="col-2" />
        <div className="col-2 pt-1">
          <label className={`form-label ${profile.displayFlapsIndicator ? "text-black" : "text-muted"} font-weight-bold`}>Markings</label>
        </div>
        <div className="col-8 pt-1">
          <div className="form-group mb-0">
            {profile.flapsRange.markings.map((m, i) => (
              <input
                key={i}
                type="text"
                className={`input-text custom-profile-textbox${i > 0 ? " ml-2" : ""}`}
                value={m ?? ""}
                onChange={(e) => {
                  const newMarkings = [...profile.flapsRange.markings];
                  newMarkings[i] = e.target.value || null;
                  update({ flapsRange: { ...profile.flapsRange, markings: newMarkings } });
                }}
                disabled={!editing || !profile.displayFlapsIndicator}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Flap Positions */}
      <div className="row mb-4">
        <div className="col-2" />
        <div className="col-2 pt-1">
          <label className={`form-label ${profile.displayFlapsIndicator ? "text-black" : "text-muted"} font-weight-bold`}>Positions</label>
        </div>
        <div className="col-8 pt-1">
          <div className="form-group mb-0">
            {profile.flapsRange.positions.map((p, i) => (
              <input
                key={i}
                type="text"
                className={`input-text custom-profile-textbox${i > 0 ? " ml-2" : ""}`}
                placeholder="%"
                value={p ?? ""}
                onChange={(e) => {
                  const newPositions = [...profile.flapsRange.positions];
                  newPositions[i] = e.target.value ? Number(e.target.value) : null;
                  update({ flapsRange: { ...profile.flapsRange, positions: newPositions } });
                }}
                disabled={!editing || !profile.displayFlapsIndicator || (i === 5)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* V-Speeds */}
      <div className="row mb-1">
        {(["Vs0", "Vs1", "Vfe", "Vno", "Vne"] as const).map((key) => (
          <Fragment key={key}>
            <div className="col-1 text-end pr-1">
              <abbr className="form-label text-black font-weight-bold mb-0 mt-1" title={vspeedTooltips[key]} style={{ textDecoration: "none", cursor: "help" }}>{key}</abbr>
            </div>
            <div className="col-1 px-0">
              <input
                type="number"
                step="1"
                className="input-text ml-1 custom-profile-textbox"
                value={profile.vSpeeds[key]}
                onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ vSpeeds: { ...profile.vSpeeds, [key]: n } }); }}
                disabled={!editing}
              />
            </div>
          </Fragment>
        ))}
      </div>
      <div className="row mb-4">
        <div className="col-2" />
        {(["Vglide", "Vr", "Vx", "Vy"] as const).map((key) => (
          <Fragment key={key}>
            <div className="col-1 text-end pr-1">
              <abbr className="form-label text-black font-weight-bold mb-0 mt-1" title={vspeedTooltips[key]} style={{ textDecoration: "none", cursor: "help" }}>{key === "Vglide" ? "Vg" : key}</abbr>
            </div>
            <div className="col-1 px-0">
              <input
                type="number"
                step="1"
                className="input-text ml-1 custom-profile-textbox"
                value={profile.vSpeeds[key]}
                onChange={(e) => { const n = parseNum(e.target.value); if (n !== null) update({ vSpeeds: { ...profile.vSpeeds, [key]: n } }); }}
                disabled={!editing}
              />
            </div>
          </Fragment>
        ))}
      </div>

      {/* Notes (edit mode only) */}
      {editing && (
        <div className="row mt-5 mb-3">
          <div className="col-12">
            <label className="form-label text-black font-weight-bold">Notes</label><br />
            <textarea
              className="form-control input-text shadow-none w-auto p-3"
              style={{ resize: "none", minWidth: "100%" }}
              rows={5}
              maxLength={2000}
              placeholder="Any notes about this profile you want users to see"
              value={profile.notes ?? ""}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

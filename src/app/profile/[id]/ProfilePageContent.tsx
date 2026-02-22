"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Profile } from "@/types";
import ProfileEditor from "@/components/ProfileEditor";
import { exportProfileAsJson } from "@/lib/export";
import { createDefaultProfile } from "@/lib/profile-utils";

export default function ProfilePageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const isNew = id === "new";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const ownerId = session?.ownerId ?? null;
  const isLoggedIn = !!session?.user;
  const canEdit = isLoggedIn && !!ownerId && profile?.Owner?.Id === ownerId;

  // Load the profile (or create a new one)
  useEffect(() => {
    if (isNew) {
      if (!isLoggedIn) return;
      const name = searchParams.get("name") ?? "New Profile";
      const newProfile = createDefaultProfile();
      newProfile.Name = name;
      newProfile.Owner = {
        Id: ownerId,
        Name: session?.user?.name ?? null,
      };
      setProfile(newProfile);
      setEditing(true);
    } else if (id) {
      fetch(`/api/profiles/${id}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch profile");
          return res.json();
        })
        .then((data) => {
          setProfile(data);
          // Enter edit mode if ?edit=true and user owns the profile
          if (
            searchParams.get("edit") === "true" &&
            isLoggedIn &&
            ownerId &&
            data.Owner?.Id === ownerId
          ) {
            setEditing(true);
          }
        })
        .catch((err) => setError(err.message));
    }
  }, [id, isNew, isLoggedIn, ownerId, session?.user?.name, searchParams]);

  // Save (or first-time save confirmation for new profiles)
  const save = useCallback(async () => {
    if (!profile || saving) return;

    if (profile.id === null && !showSaveConfirm) {
      setShowSaveConfirm(true);
      return;
    }

    setShowSaveConfirm(false);
    setSaving(true);

    try {
      const profileId = profile.id ?? crypto.randomUUID();
      const profileToSave = { ...profile, id: profileId };

      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileToSave),
      });

      if (!res.ok) throw new Error("Failed to save profile");

      setProfile(profileToSave);
      setSaving(false);
      setSaved(true);
      setEditing(false);

      setTimeout(() => setSaved(false), 2000);

      // Navigate to the canonical view URL after saving
      router.replace(`/profile/${profileId}`);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }, [profile, saving, showSaveConfirm, router]);

  function cancelEdit() {
    if (isNew) {
      // Nothing to go back to — return to the profile list
      router.push("/profiles");
      return;
    }
    // Re-fetch to discard unsaved changes
    fetch(`/api/profiles/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setProfile(data);
        setEditing(false);
      });
  }

  function getSaveButtonText() {
    if (saving) return "Saving changes...";
    if (saved) return "Changes saved";
    if (profile?.id === null) return "Save as draft";
    return "Save changes";
  }

  // New profiles require the user to be logged in
  if (isNew && !isLoggedIn) {
    return (
      <section className="bg-white py-5 vh-100">
        <div className="text-center">
          <h3 className="fw-bolder">Please log in to create profiles</h3>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white pt-5">
      <div className="text-center mb-2">
        <h3 className="fw-bolder">
          {profile?.Name ?? "Loading..."}
          {editing && profile && (
            <span className="text-danger ms-3 fs-5">
              {profile.id === null ? "New Profile" : "Editing"}
            </span>
          )}
        </h3>
      </div>

      {profile && (
        <>
          <div className="text-center mb-4">
            <h5>By {profile.Owner?.Name}</h5>
          </div>

          <div className="container" style={{ maxWidth: "960px" }}>
            <div className="px-5 py-3 mb-5 bg-dark bg-opacity-25 rounded-3">

              {/* Warnings (edit mode only) */}
              {editing && profile.id === null && (
                <div className="alert alert-danger">
                  <b>If you leave this page without saving your new profile as a draft, it will be lost.</b>
                </div>
              )}
              {editing && profile.id !== null && (
                <div className="alert alert-danger">
                  <b>Changes made here do not take effect until you click &apos;save changes&apos;.</b>
                </div>
              )}

              {/* Action buttons (view mode only) */}
              {!editing && profile.id && (
                <div className="d-flex justify-content-center gap-2 mb-5 bg-white rounded py-2">
                  {canEdit && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setEditing(true)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => exportProfileAsJson(profile)}
                  >
                    Export
                  </button>
                </div>
              )}

              {/* Published / draft toggle (edit mode, existing profiles) */}
              {editing && profile.id !== null && (
                <div className="d-flex align-items-center gap-3 mb-4">
                  <label className="fw-bold">Status</label>
                  <div className="btn-group">
                    <button
                      className={`btn btn-sm ${!profile.IsPublished ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setProfile({ ...profile, IsPublished: false })}
                    >
                      Draft
                    </button>
                    <button
                      className={`btn btn-sm ${profile.IsPublished ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setProfile({ ...profile, IsPublished: true })}
                    >
                      Published
                    </button>
                  </div>
                </div>
              )}

              {/* Author notes (always shown at top when present) */}
              {profile.Notes && (
                <div className="alert alert-secondary text-black" role="alert">
                  <b>Author note:</b> {profile.Notes}
                </div>
              )}

              {/* Gauge editor / display */}
              <ProfileEditor
                profile={profile}
                editing={editing}
                onChange={editing ? setProfile : undefined}
              />

              {/* Profile name + bottom save bar */}
              <div className="d-flex flex-wrap align-items-center gap-3 mt-4">
                <label className="fw-bold">
                  Profile name{" "}
                  <input
                    type="text"
                    className="form-control d-inline-block w-auto ms-2"
                    value={profile.Name}
                    onChange={(e) =>
                      editing ? setProfile({ ...profile, Name: e.target.value }) : undefined
                    }
                    disabled={!editing}
                  />
                </label>
                {editing && (
                  <>
                    <button
                      className={`btn btn-sm ${saving || saved ? "btn-secondary opacity-50" : "btn-success"}`}
                      onClick={save}
                      disabled={saving || saved}
                    >
                      {getSaveButtonText()}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save confirmation modal (new profiles) */}
      {showSaveConfirm && (
        <div className="modal d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-body p-4">
                <p>This will save your new profile to the database as a draft</p>
                <div className="d-flex gap-2 justify-content-end">
                  <button className="btn btn-success" onClick={save}>Save</button>
                  <button className="btn btn-primary" onClick={() => { setShowSaveConfirm(false); setSaving(false); }}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <>
          <p className="text-center text-danger">{error}</p>
          <p className="text-center">
            Please try again later, or if this persists, contact{" "}
            <Link href="/contact">the site admin</Link>.
          </p>
        </>
      )}

      <p className="text-center py-4">
        <Link href="/profiles">Back to profile list</Link>
      </p>
    </section>
  );
}

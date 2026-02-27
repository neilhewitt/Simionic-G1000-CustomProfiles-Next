"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Profile } from "@/types";
import { toCamelCase } from "@/lib/field-mapping";

export default function ImportPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [fileChosen, setFileChosen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  const isLoggedIn = !!session?.user;
  const ownerId = session?.ownerId ?? null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileChosen(true);
    setUploading(true);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // Imported files from the iPad app use PascalCase; convert to camelCase
      const profile: Profile = toCamelCase<Profile>(parsed);

      const newId = crypto.randomUUID();
      profile.id = newId;
      profile.owner = {
        id: ownerId,
        name: session?.user?.name ?? null,
      };
      profile.isPublished = false;

      const res = await fetch(`/api/profiles/${newId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      if (!res.ok) {
        let message = "Failed to upload profile";
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
          else if (body?.message) message = body.message;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      setUploading(false);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      router.push(`/profile/${newId}?edit=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setUploading(false);
    }
  }

  function resetState() {
    setError(null);
    setUploading(false);
    setFileChosen(false);
  }

  return (
    <main className="bg-dark py-5">
      <div className="container px-5">
        <div className="row gx-5 align-items-center justify-content-center">
          <div className="col-lg-8 col-xl-7 col-xxl-6">
            <div className="my-5 text-center text-xl-start">
              <h3 className="fw-bolder text-white mb-2">Import a profile</h3>
              {!isLoggedIn ? (
                <>
                  <p className="lead fw-normal text-white-50 mb-4">
                    To import a profile, you must be logged in. You can log in{" "}
                    <Link href="/auth/signin">here</Link>.
                  </p>
                </>
              ) : (
                <>
                  <p className="lead fw-normal text-white-50">Choose the exported profile (.json file) to import</p>
                  <div className="pb-5">
                    {!fileChosen && !error && (
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFile}
                        className="form-control form-control-lg"
                      />
                    )}
                    {fileChosen && !error && uploading && (
                      <h4 className="text-white">Importing &apos;{fileName}&apos;...</h4>
                    )}
                    {fileChosen && !error && !uploading && (
                      <h4 className="text-success">Imported successfully. Opening editor...</h4>
                    )}
                    {error && (
                      <>
                        <p className="lead fw-normal text-danger">{error}</p>
                        <p className="lead fw-normal text-white-50 mb-4">
                          You can{" "}
                          <a href="#" onClick={(e) => { e.preventDefault(); resetState(); }}>try again</a>.
                        </p>
                      </>
                    )}
                  </div>
                  <p className="lead fw-normal text-white-50">
                    Profiles stored on your iPad can be exported using the
                    <br />
                    <Link href="/downloads">Custom Profile Manager</Link>.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="col-xl-5 col-xxl-6 d-none d-xl-block text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="img-fluid rounded-3 my-5" src="/img/G1000_screen.jpg" alt="G1000 MFD & PFD set into a cockpit instrument panel" />
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ProfileSummary, AircraftType } from "@/types";
import ProfileCard from "@/components/ProfileCard";
import ProfileCardSkeleton from "@/components/ProfileCardSkeleton";
import ProfileFilters from "@/components/ProfileFilters";
import { getUserFriendlyError } from "@/lib/error-utils";

interface PaginatedProfiles {
  profiles: ProfileSummary[];
  total: number;
  page: number;
  limit: number;
}

export default function ProfileListContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  const [data, setData] = useState<PaginatedProfiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") ?? "");
  const [typeFilter, setTypeFilter] = useState<AircraftType | null>(null);
  const [engineFilter, setEngineFilter] = useState<number | null>(null);
  const [onlyShowMine, setOnlyShowMine] = useState(false);
  const [onlyShowDrafts, setOnlyShowDrafts] = useState(false);
  const [page, setPage] = useState(1);

  const isLoggedIn = !!session?.user;
  const ownerId = session?.ownerId ?? null;

  useEffect(() => {
    async function fetchProfiles() {
      try {
        const params = new URLSearchParams();
        if (typeFilter !== null) params.set("type", String(typeFilter));
        if (engineFilter !== null) params.set("engines", String(engineFilter));
        if (searchTerm) params.set("search", searchTerm);
        if (ownerId && onlyShowMine) {
          params.set("owner", ownerId);
          if (onlyShowDrafts) params.set("drafts", "true");
        }
        params.set("page", String(page));

        const res = await fetch(`/api/profiles?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch profiles");
        const result: PaginatedProfiles = await res.json();
        setData(result);
        setError(null);
      } catch (err) {
        setError(getUserFriendlyError(err));
      }
    }

    fetchProfiles();
  }, [typeFilter, engineFilter, searchTerm, onlyShowMine, onlyShowDrafts, page, ownerId]);

  function handleTypeChange(type: AircraftType | null) {
    setTypeFilter(type);
    setPage(1);
  }

  function handleEngineChange(engines: number | null) {
    setEngineFilter(engines);
    setPage(1);
  }

  function handleSearchChange(term: string) {
    setSearchTerm(term);
    setPage(1);
  }

  function handleOwnerFilterChange(mine: boolean, drafts: boolean) {
    setOnlyShowMine(mine);
    setOnlyShowDrafts(drafts);
    setPage(1);
  }

  function reset() {
    setSearchTerm("");
    setTypeFilter(null);
    setEngineFilter(null);
    setOnlyShowMine(false);
    setOnlyShowDrafts(false);
    setPage(1);
  }

  const profiles = data?.profiles ?? [];
  const total = data?.total ?? 0;
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
  const isLoaded = data !== null;

  const title = (() => {
    if (isLoggedIn && onlyShowMine) {
      return `${session?.user?.name}'s ${onlyShowDrafts ? "drafts" : "profiles"}`;
    }
    if (searchTerm) return "Search results";
    return "Browse profiles";
  })();

  return (
    <section className={`bg-white py-5 ${!isLoaded || !profiles.length ? "vh-100" : ""}`}>
      <div className="container px-5 my-3">
        <div className="row gx-5 justify-content-center">
          <div className="col-md-auto">
            <div className="text-center">
              <h3 className="fw-bolder">{title}</h3>
              <ProfileFilters
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeChange}
                engineFilter={engineFilter}
                onEngineChange={handleEngineChange}
                isLoggedIn={isLoggedIn}
                onlyShowMine={onlyShowMine}
                onlyShowDrafts={onlyShowDrafts}
                onOwnerFilterChange={handleOwnerFilterChange}
                onReset={reset}
              />
            </div>
          </div>
        </div>

        {isLoaded ? (
          <>
            <div className="row gx-5">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  isOwner={isLoggedIn && ownerId === profile.Owner?.Id}
                />
              ))}
            </div>
            {profiles.length === 0 && (
              <div className="text-center">
                <h5>Nothing to see here... try changing the filter.</h5>
              </div>
            )}
            {totalPages > 1 && (
              <div className="d-flex justify-content-center gap-2 mt-4">
                <button
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="align-self-center">
                  Page {page} of {totalPages} ({total} profiles)
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <div className="row gx-5">
              {Array.from({ length: 6 }, (_, i) => (
                <ProfileCardSkeleton key={i} />
              ))}
            </div>
            {error && (
              <>
                <p className="text-danger">{error}</p>
                <p>Try again later, or if this persists, contact <a href="/contact">the site admin</a></p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

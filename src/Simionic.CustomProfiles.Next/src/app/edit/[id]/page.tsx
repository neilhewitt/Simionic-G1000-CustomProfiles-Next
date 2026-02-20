"use client";

import { useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";

export default function EditRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  useEffect(() => {
    if (id === "new") {
      const name = searchParams.get("name");
      const qs = name ? `?name=${encodeURIComponent(name)}` : "";
      router.replace(`/profile/new${qs}`);
    } else {
      router.replace(`/profile/${id}?edit=true`);
    }
  }, [id, router, searchParams]);

  return (
    <section className="bg-white py-12 min-h-screen">
      <div className="text-center">
        <h5 className="text-black">Redirecting...</h5>
      </div>
    </section>
  );
}

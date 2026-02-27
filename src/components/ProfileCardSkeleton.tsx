"use client";

export default function ProfileCardSkeleton() {
  return (
    <div className="col-lg-4 mb-5">
      <div className="card h-100 border-1 shadow-sm">
        <div
          className="card-img-top placeholder-glow"
          style={{ height: 180, backgroundColor: "#e0e0e0" }}
        />
        <div className="card-body p-4">
          <div className="placeholder-glow">
            <span className="placeholder col-8 mb-3" style={{ height: "1.25rem" }} />
            <span className="placeholder col-6" />
          </div>
        </div>
        <div className="card-footer p-4 pt-0 bg-transparent border-top-0">
          <div className="placeholder-glow">
            <span className="placeholder col-4" />
            <br />
            <span className="placeholder col-5 mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

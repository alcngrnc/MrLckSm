"use client";

import { useEffect, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
} from "react-leaflet";
import L from "leaflet";

type Job = {
  id: string;
  tracking_code: string | null;
  customer_name: string | null;
  address: string;
  problem_type: string | null;
  status: string;
  lat?: number | null;
  lng?: number | null;
};

type DriverLocation = {
  id?: string;
  job_id?: string | null;
  lat: number;
  lng: number;
  recorded_at?: string | null;
};

type Props = {
  jobs: Job[];
  driverLocations: DriverLocation[];
};

const jobIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const driverIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [30, 46],
  iconAnchor: [15, 46],
});

export default function AdminDispatchMap({ jobs, driverLocations }: Props) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  const jobsWithCoords = jobs.filter(
    (job) => typeof job.lat === "number" && typeof job.lng === "number"
  );

  const driver = driverLocations[0];
  const activeJob = jobsWithCoords[0];

  const center: [number, number] = driver
    ? [driver.lat, driver.lng]
    : activeJob
      ? [activeJob.lat as number, activeJob.lng as number]
      : [40.7282, -73.7949];

  useEffect(() => {
    const loadRoute = async () => {
      if (!driver || !activeJob?.lat || !activeJob.lng) {
        setRouteCoords([]);
        setEtaMinutes(null);
        return;
      }

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${driver.lng},${driver.lat};${activeJob.lng},${activeJob.lat}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        const data = await res.json();

        const coords = data?.routes?.[0]?.geometry?.coordinates || [];
        const duration = data?.routes?.[0]?.duration;

        setRouteCoords(
          coords.map(([lng, lat]: [number, number]) => [lat, lng])
        );

        setEtaMinutes(duration ? Math.round(duration / 60) : null);
      } catch (error) {
        console.error("ADMIN_MAP_ROUTE_ERROR", error);
        setRouteCoords([]);
        setEtaMinutes(null);
      }
    };

    void loadRoute();
  }, [
    driver?.lat,
    driver?.lng,
    activeJob?.lat,
    activeJob?.lng,
    activeJob?.id,
  ]);

  return (
    <div className="relative h-[520px] overflow-hidden rounded-3xl border border-white/10 bg-black">
      {etaMinutes !== null && (
        <div className="absolute left-4 top-4 z-[1000] rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-white shadow-xl backdrop-blur">
          <p className="text-xs text-white/50">Live ETA</p>
          <p className="text-2xl font-bold">{etaMinutes} min</p>
          <p className="text-xs text-white/60">
            Driver → {activeJob?.tracking_code}
          </p>
        </div>
      )}

      <MapContainer center={center} zoom={12} className="h-full w-full">
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routeCoords.length > 0 && (
          <Polyline positions={routeCoords} weight={5} opacity={0.75} />
        )}

        {jobsWithCoords.map((job) => (
          <Marker
            key={job.id}
            position={[job.lat as number, job.lng as number]}
            icon={jobIcon}
          >
            <Popup>
              <strong>{job.tracking_code}</strong>
              <br />
              {job.customer_name || "Unknown Customer"}
              <br />
              {job.problem_type || "Service"}
              <br />
              Status: {job.status}
              <br />
              {job.address}
            </Popup>
          </Marker>
        ))}

        {driver && (
          <Marker position={[driver.lat, driver.lng]} icon={driverIcon}>
            <Popup>
              <strong>Technician Location</strong>
              <br />
              Updated: {driver.recorded_at || "-"}
              {etaMinutes !== null && (
                <>
                  <br />
                  ETA: {etaMinutes} min
                </>
              )}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
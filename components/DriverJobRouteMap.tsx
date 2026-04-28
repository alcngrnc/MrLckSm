"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";

type Props = {
  jobLat: number | null;
  jobLng: number | null;
  driverLat: number | null;
  driverLng: number | null;
  customerName?: string | null;
  address?: string | null;
};

const defaultIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function DriverJobRouteMap({
  jobLat,
  jobLng,
  driverLat,
  driverLng,
  customerName,
  address,
}: Props) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [eta, setEta] = useState<number | null>(null);

  const hasJob = typeof jobLat === "number" && typeof jobLng === "number";
  const hasDriver =
    typeof driverLat === "number" && typeof driverLng === "number";

  const center: [number, number] = hasDriver
    ? [driverLat!, driverLng!]
    : hasJob
      ? [jobLat!, jobLng!]
      : [40.7282, -73.7949];

  useEffect(() => {
    const loadRoute = async () => {
      if (!hasDriver || !hasJob) return;

      const url = `https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${jobLng},${jobLat}?overview=full&geometries=geojson`;

      const res = await fetch(url);
      const data = await res.json();

      const coords = data?.routes?.[0]?.geometry?.coordinates || [];
      const duration = data?.routes?.[0]?.duration;

      setRouteCoords(coords.map(([lng, lat]: [number, number]) => [lat, lng]));
      setEta(duration ? Math.round(duration / 60) : null);
    };

    void loadRoute();
  }, [driverLat, driverLng, jobLat, jobLng, hasDriver, hasJob]);

  return (
    <div className="relative h-[360px] overflow-hidden rounded-3xl border border-white/10 bg-black">
      {eta !== null && (
        <div className="absolute left-4 top-4 z-[1000] rounded-2xl bg-black/80 px-4 py-3 text-white backdrop-blur">
          <p className="text-xs text-white/50">ETA to customer</p>
          <p className="text-2xl font-bold">{eta} min</p>
        </div>
      )}

      <MapContainer center={center} zoom={14} className="h-full w-full">
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routeCoords.length > 0 && (
          <Polyline positions={routeCoords} weight={5} opacity={0.8} />
        )}

        {hasDriver && (
          <Marker position={[driverLat!, driverLng!]} icon={defaultIcon}>
            <Popup>Technician Location</Popup>
          </Marker>
        )}

        {hasJob && (
          <Marker position={[jobLat!, jobLng!]} icon={defaultIcon}>
            <Popup>
              <strong>{customerName || "Customer"}</strong>
              <br />
              {address}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
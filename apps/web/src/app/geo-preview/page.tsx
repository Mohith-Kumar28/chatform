"use client";

import { ResultsAnalytics, type AnalyticsPayload } from "@/components/builder/results-analytics";

const P = (country: string, region: string, city: string, lat: number, lon: number, count: number, completed: number) => ({ country, region, city, lat, lon, count, completed });

const places = [
  P("US", "New York", "New York", 40.7, -74, 233, 180), P("US", "California", "Los Angeles", 34, -118.2, 189, 120),
  P("US", "California", "San Francisco", 37.8, -122.4, 123, 90), P("US", "Washington", "Seattle", 47.6, -122.3, 59, 40),
  P("US", "Texas", "Austin", 30.3, -97.7, 41, 30), P("US", "Florida", "Miami", 25.8, -80.2, 12, 5), P("US", "Hawaii", "Honolulu", 21.3, -157.8, 3, 1),
  P("CA", "Ontario", "Toronto", 43.7, -79.4, 60, 40), P("CA", "British Columbia", "Vancouver", 49.3, -123.1, 38, 20),
  P("IN", "Maharashtra", "Mumbai", 19, 72.8, 48, 30), P("IN", "Maharashtra", "Pune", 18.5, 73.9, 12, 8), P("IN", "Karnataka", "Bengaluru", 12.97, 77.6, 22, 15),
  P("IN", "Delhi", "New Delhi", 28.6, 77.2, 14, 9), P("IN", "Telangana", "Hyderabad", 17.4, 78.5, 9, 3),
  P("ID", "Jakarta", "Jakarta", -6.2, 106.8, 23, 10), P("GB", "England", "London", 51.5, -0.1, 19, 12), P("DE", "Berlin", "Berlin", 52.5, 13.4, 18, 14),
  P("ES", "Madrid", "Madrid", 40.4, -3.7, 11, 6), P("VN", "Hanoi", "Hanoi", 21, 105.8, 10, 4), P("BR", "São Paulo", "São Paulo", -23.5, -46.6, 10, 7),
  P("SG", "Singapore", "Singapore", 1.35, 103.8, 9, 7), P("FR", "Île-de-France", "Paris", 48.9, 2.35, 9, 5), P("AU", "New South Wales", "Sydney", -33.9, 151.2, 7, 5),
  P("JP", "Tokyo", "Tokyo", 35.7, 139.7, 6, 3), P("NG", "Lagos", "Lagos", 6.5, 3.4, 5, 2), P("MX", "CDMX", "Mexico City", 19.4, -99.1, 5, 3),
];

const analytics = {
  views: 1500, starts: 1100, completed: 700, abandoned: 400, completionRate: 0.64, avgDurationMs: 90000, medianDurationMs: 70000,
  perBlock: [], daily: [], bySource: [], byCountry: [], byDevice: null, durationBuckets: [], places,
} as unknown as AnalyticsPayload;

export default function Page() {
  return <div className="bg-background min-h-screen p-8"><ResultsAnalytics analytics={analytics} /></div>;
}

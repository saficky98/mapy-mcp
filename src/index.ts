import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import type { Props } from "./utils";

type MapyEnv = Env & {
	MAPY_API_KEY: string;
};

type Point = { lon: number; lat: number };
type Place = {
	name?: string;
	label?: string;
	position: Point;
};

const ALLOWED_USERNAMES = new Set<string>(["saficky98"]);

function pointToString(point: Point) {
	return `${point.lon},${point.lat}`;
}

function sample<T>(items: T[], max: number): T[] {
	if (items.length <= max) return items;
	return Array.from({ length: max }, (_, i) => {
		const index = Math.round((i * (items.length - 1)) / (max - 1));
		return items[index];
	});
}

function haversineMeters(a: [number, number], b: [number, number]) {
	const radians = Math.PI / 180;
	const lat1 = a[1] * radians;
	const lat2 = b[1] * radians;
	const dLat = (b[1] - a[1]) * radians;
	const dLon = (b[0] - a[0]) * radians;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function mapyGet<T>(
	apiKey: string,
	path: string,
	params: Record<string, string | number | boolean | undefined>,
): Promise<T> {
	const url = new URL(`https://api.mapy.com${path}`);
	url.searchParams.set("apikey", apiKey);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) url.searchParams.set(key, String(value));
	}
	const response = await fetch(url, {
		headers: { "User-Agent": "MapyMCP/1.0" },
	});
	if (!response.ok) {
		throw new Error(`Mapy API ${response.status}: ${await response.text()}`);
	}
	return response.json() as Promise<T>;
}

async function geocode(apiKey: string, query: string): Promise<Place> {
	const data = await mapyGet<{ items?: Place[] }>(apiKey, "/v1/geocode", {
		query,
		limit: 1,
		lang: "cs",
	});
	const place = data.items?.[0];
	if (!place?.position) {
		throw new Error(`Místo „${query}“ nebylo nalezeno.`);
	}
	return place;
}

export class MyMCP extends McpAgent<MapyEnv, Record<string, never>, Props> {
	server = new McpServer({
		name: "Mapy MCP",
		version: "1.0.0",
	});

	async init() {
		if (!ALLOWED_USERNAMES.has(this.props!.login)) {
			return;
		}

		this.server.tool(
			"mapy_search_place",
			"Vyhledá adresu, obec, vrchol nebo bod zájmu na Mapy.com.",
			{ query: z.string().min(2).max(160) },
			async ({ query }) => {
				try {
					const data = await mapyGet<{ items?: Place[] }>(
						this.env.MAPY_API_KEY,
						"/v1/geocode",
						{ query, limit: 5, lang: "cs" },
					);
					return {
						content: [{ type: "text", text: JSON.stringify(data.items ?? [], null, 2) }],
					};
				} catch (error) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: error instanceof Error ? error.message : "Neznámá chyba.",
							},
						],
					};
				}
			},
		);

		this.server.tool(
			"mapy_plan_route",
			"Naplánuje trasu a vrátí vzdálenost, odhad času, stoupání, klesání a výškový profil.",
			{
				origin: z.string().min(2),
				destination: z.string().min(2),
				routeType: z
					.enum([
						"car_fast",
						"car_fast_traffic",
						"car_short",
						"foot_fast",
						"foot_hiking",
						"bike_road",
						"bike_mountain",
					])
					.default("foot_hiking"),
			},
			async ({ origin, destination, routeType }) => {
				try {
					const start = await geocode(this.env.MAPY_API_KEY, origin);
					const end = await geocode(this.env.MAPY_API_KEY, destination);

					const route = await mapyGet<{
						length: number;
						duration: number;
						geometry: { coordinates: [number, number][] };
					}>(this.env.MAPY_API_KEY, "/v1/routing/route", {
						start: pointToString(start.position),
						end: pointToString(end.position),
						routeType,
						format: "geojson",
						lang: "cs",
					});

					const rawGeometry: any = (route as any).geometry;
					const points: [number, number][] | undefined =
					  rawGeometry?.coordinates ??
					  rawGeometry?.geometry?.coordinates ??
					  (Array.isArray(rawGeometry) ? rawGeometry : undefined);

					if (!points) {
					  return {
					    isError: true,
					    content: [{
					      type: "text",
					      text: "Nepodařilo se najít geometrii trasy. Syrová odpověď API: " + JSON.stringify(route).slice(0, 1500),
					    }],
					  };
					}

					const sampledPoints = sample(points, 256);

					const elevation = await mapyGet<{ items: Array<{ elevation: number }> }>(
						this.env.MAPY_API_KEY,
						"/v1/elevation",
						{
							positions: sampledPoints.map(([lon, lat]) => `${lon},${lat}`).join(";"),
							lang: "cs",
						},
					);

					let ascent = 0;
					let descent = 0;
					let distance = 0;
					const profile = elevation.items.map((item, index) => {
						if (index > 0) {
							distance += haversineMeters(
								sampledPoints[index - 1],
								sampledPoints[index],
							);
							const delta = item.elevation - elevation.items[index - 1].elevation;
							if (delta > 0) ascent += delta;
							else descent -= delta;
						}
						return {
							km: Number((distance / 1000).toFixed(2)),
							elevation_m: Math.round(item.elevation),
						};
					});

					const mapyLink = new URL("https://mapy.com/fnc/v1/route");
					mapyLink.searchParams.set("start", pointToString(start.position));
					mapyLink.searchParams.set("end", pointToString(end.position));
					mapyLink.searchParams.set("routeType", routeType);
					mapyLink.searchParams.set("mapset", "outdoor");

					const result = {
						start: start.label ?? start.name ?? origin,
						destination: end.label ?? end.name ?? destination,
						route_type: routeType,
						distance_km: Number((route.length / 1000).toFixed(2)),
						estimated_duration_min: Math.round(route.duration / 60),
						ascent_m: Math.round(ascent),
						descent_m: Math.round(descent),
						mapy_link: mapyLink.toString(),
						route_geometry: sample(points, 100).map(([lon, lat]) => ({ lat, lon })),
						elevation_profile: sample(profile, 64),
					};

					return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
				} catch (error) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: error instanceof Error ? error.message : "Neznámá chyba.",
							},
						],
					};
				}
			},
		);
	}
}

export default new OAuthProvider({
	apiHandler: MyMCP.serve("/mcp"),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",
});

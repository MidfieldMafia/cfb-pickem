import { Cloud, CloudRain, CloudSun, CloudSunRain, Moon, Sun } from "lucide-react";
import type { Weather } from "@/lib/scoring/types";

const ICONS = {
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  "cloud-sun": CloudSun,
  "cloud-rain": CloudRain,
  "cloud-sun-rain": CloudSunRain,
} as const;

/** Fixed 30px height so the pill never reflows the meta row between games. */
export function WeatherPill({ weather }: { weather: Weather }) {
  const Icon = ICONS[weather.icon as keyof typeof ICONS] ?? Cloud;
  return (
    <span
      title={`Forecast: ${weather.temperature}°, ${weather.precipitation}% rain, wind ${weather.wind} mph`}
      className="inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 tabular-nums text-foreground"
    >
      <span className="font-display text-base leading-[30px]">{weather.temperature}°</span>
      <Icon size={18} />
      {/* Below 20% the number is noise, so the pill drops it. */}
      {weather.precipitation >= 20 ? (
        <span className="text-[13px] font-semibold leading-[30px] text-muted-foreground">
          {weather.precipitation}%
        </span>
      ) : null}
    </span>
  );
}

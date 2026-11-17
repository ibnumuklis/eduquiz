import { Award, BadgeCheck, BookOpen, Flame, Medal, Rocket, Star, Timer, Trophy, Zap, type LucideProps } from "lucide-react";
import type { ComponentType } from "react";

const ICONS: Record<string, ComponentType<LucideProps>> = {
  rocket: Rocket, "badge-check": BadgeCheck, trophy: Trophy, "book-open": BookOpen, medal: Medal, flame: Flame, zap: Zap, timer: Timer, star: Star,
};

export function AchievementIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Award;
  return <Icon className={className} aria-hidden />;
}

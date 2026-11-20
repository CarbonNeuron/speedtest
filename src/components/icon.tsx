import {
  Activity,
  ArrowRight,
  Check,
  Clock,
  Download,
  Server,
  Square,
  Upload,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "activity"
  | "download"
  | "upload"
  | "server"
  | "arrow"
  | "check"
  | "clock"
  | "stop";
const icons: Record<IconName, LucideIcon> = {
  activity: Activity,
  download: Download,
  upload: Upload,
  server: Server,
  arrow: ArrowRight,
  check: Check,
  clock: Clock,
  stop: Square,
};
export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  const SvgIcon = icons[name];
  return (
    <SvgIcon
      strokeWidth={1.7}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}

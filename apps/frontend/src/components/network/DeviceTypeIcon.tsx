import { Router, Network, Server, BatteryCharging, HelpCircle, type LucideIcon } from "lucide-react";
import type { ApiDeviceType } from "../../types/api.js";

const DEVICE_TYPE_CONFIG: Record<ApiDeviceType, { label: string; Icon: LucideIcon }> = {
  AP: { label: "Access Point", Icon: Router },
  SWITCH: { label: "Switch", Icon: Network },
  GATEWAY: { label: "Gateway", Icon: Server },
  UPS: { label: "UPS", Icon: BatteryCharging },
  OTRO: { label: "Otro dispositivo", Icon: HelpCircle },
};

export function DeviceTypeIcon({ tipo }: { tipo: ApiDeviceType }) {
  const { label, Icon } = DEVICE_TYPE_CONFIG[tipo];
  return (
    <span title={label} className="inline-flex items-center text-slate-500 dark:text-slate-400">
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

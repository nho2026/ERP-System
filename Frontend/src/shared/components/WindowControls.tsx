import { Maximize2, Minus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";

declare global {
  interface Window {
    electronWindow?: {
      printTicket: (token: string, height: number) => Promise<void>;
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      showNotification: (notification: {
        title: string;
        body: string;
        route?: string;
      }) => void;
      onNotificationClick: (callback: (route: string) => void) => () => void;
      openWhatsapp?: (phone: string) => Promise<void>;
      openMediaSettings: (kind: "camera" | "microphone") => Promise<boolean>;
    };
  }
}

export function WindowControls() {
  const { i18n, t } = useTranslation();
  const controls = window.electronWindow;
  if (!controls) return null;

  return (
    <TooltipProvider delayDuration={350}>
      <div
        dir={i18n.dir()}
        className="electron-window-controls ms-5 flex shrink-0 items-center gap-2"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="order-3 grid size-9 shrink-0 place-items-center rounded-lg border border-red-600 bg-red-500 text-white shadow-sm transition-colors hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
              onClick={() => controls.close()}
              aria-label={t("windowControls.close")}
            >
              <X className="size-4 stroke-[2.5]" />
            </button>
          </TooltipTrigger>
          <TooltipContent dir={i18n.dir()}>
            {t("windowControls.close")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="order-1 grid size-9 shrink-0 place-items-center rounded-lg border border-amber-600 bg-amber-500 text-white shadow-sm transition-colors hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
              onClick={() => controls.minimize()}
              aria-label={t("windowControls.minimize")}
            >
              <Minus className="size-4 stroke-[2.5]" />
            </button>
          </TooltipTrigger>
          <TooltipContent dir={i18n.dir()}>
            {t("windowControls.minimize")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="order-2 grid size-9 shrink-0 place-items-center rounded-lg border border-emerald-600 bg-emerald-500 text-white shadow-sm transition-colors hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
              onClick={() => controls.toggleMaximize()}
              aria-label={t("windowControls.maximize")}
            >
              <Maximize2 className="size-4 stroke-[2.5]" />
            </button>
          </TooltipTrigger>
          <TooltipContent dir={i18n.dir()}>
            {t("windowControls.maximize")}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

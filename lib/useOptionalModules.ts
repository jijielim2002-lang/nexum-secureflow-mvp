// Hook that returns whether optional AI/intelligence panels should be shown.
// Returns false when NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES=true OR when the
// system_settings row disable_optional_modules = 'true' (checked at page load).
//
// Usage in any page component:
//   const showOptional = useOptionalModules();
//   {showOptional && <NexumBrainPanel ... />}

"use client";
import { useMemo } from "react";
import { OPTIONAL_MODULES_DISABLED } from "@/lib/appEnv";

export function useOptionalModules(
  systemSettingDisabled?: boolean,
): boolean {
  return useMemo(
    () => !OPTIONAL_MODULES_DISABLED && !systemSettingDisabled,
    [systemSettingDisabled],
  );
}

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Wrappers tipados de next/link, useRouter, redirect, etc. con soporte i18n.
// Usar SIEMPRE estos en lugar de los de "next/link" / "next/navigation" en código del grupo público.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

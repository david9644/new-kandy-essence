import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import type { PrintBusiness } from "@/lib/print/invoice-layout";
import {
  DEFAULT_PRINT_SETTINGS,
  validatePrintSettings,
  type PrintSettings,
} from "@/lib/print/settings";

export interface PrintConfig {
  business: PrintBusiness;
  settings: PrintSettings;
}

// Business header + printer grid from app_settings (readable by both roles).
// A missing / invalid grid falls back to the defaults rather than failing to
// print; the Settings page shows the validation error to the owner.
export async function loadPrintConfig(supabase: SupabaseClient<Database>): Promise<PrintConfig> {
  const { data } = await supabase
    .from("app_settings")
    .select(
      "business_name, business_address, business_phone1, business_phone2, print_page_width_in, print_page_height_in, print_margin_top_in, print_margin_bottom_in, print_margin_left_in, print_margin_right_in, print_cpi, print_lpi, print_footer, print_continuous, print_max_sheets, print_strike_mode, print_cashier_text"
    )
    .eq("id", true)
    .maybeSingle();

  const settings: PrintSettings = data
    ? {
        pageWidthIn: Number(data.print_page_width_in),
        pageHeightIn: Number(data.print_page_height_in),
        marginTopIn: Number(data.print_margin_top_in),
        marginBottomIn: Number(data.print_margin_bottom_in),
        marginLeftIn: Number(data.print_margin_left_in),
        marginRightIn: Number(data.print_margin_right_in),
        cpi: Number(data.print_cpi),
        lpi: Number(data.print_lpi),
        footer: data.print_footer,
        continuous: data.print_continuous,
        maxSheets: Number(data.print_max_sheets),
        strikeMode: (["strike", "text", "off"].includes(data.print_strike_mode)
          ? data.print_strike_mode
          : "strike") as PrintSettings["strikeMode"],
        // an EMPTY text is kept as it is (= print the stored user name)
        cashierText: data.print_cashier_text ?? DEFAULT_PRINT_SETTINGS.cashierText,
      }
    : DEFAULT_PRINT_SETTINGS;

  return {
    business: {
      name: data?.business_name?.trim() || "New Kandy Essence",
      address: data?.business_address ?? "",
      phone1: data?.business_phone1 ?? "",
      phone2: data?.business_phone2 ?? "",
    },
    settings: validatePrintSettings(settings) === null ? settings : DEFAULT_PRINT_SETTINGS,
  };
}

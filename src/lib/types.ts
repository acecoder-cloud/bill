export type Role = "admin" | "user";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface AppSettings {
  users_view_all: boolean;
  allow_public_signup: boolean;
}

/** An editable row in the bill editor. Numbers are kept as strings while typing. */
export interface ItemRow {
  key: string;
  serial_no: string;
  item_name: string;
  qty: string;
  rate: string;
  total_amount: string;
}

export interface BillItem {
  id: string;
  bill_id: string;
  serial_no: number | null;
  item_name: string;
  qty: number | null;
  rate: number | null;
  total_amount: number | null;
}

export interface Bill {
  id: string;
  bill_date: string;
  image_url: string | null;
  logged_by: string;
  logged_at: string;
  updated_at: string;
}

/** A row of the "entries" database view (one per bill item). */
export interface Entry {
  item_id: string;
  bill_id: string;
  serial_no: number | null;
  item_name: string;
  qty: number | null;
  rate: number | null;
  total_amount: number | null;
  bill_date: string;
  logged_at: string;
  logged_by: string;
  logged_by_name: string | null;
  logged_by_email: string | null;
}

/** What /api/extract returns. */
export interface ExtractedRow {
  serial_no: number | null;
  bill_date: string | null;
  item_name: string;
  qty: number | null;
  rate: number | null;
  total_amount: number | null;
}

export interface ExtractResponse {
  bill_date: string | null;
  rows: ExtractedRow[];
}

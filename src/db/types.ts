export type Role = 'admin' | 'member';
export type UserStatus = 'pending' | 'active' | 'suspended';

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: Role;
  status: UserStatus;
  member_no: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SessionUser = Omit<User, 'password_hash'>;

export type CopyStatus = 'available' | 'on_loan' | 'reserved' | 'lost' | 'repair' | 'withdrawn';
export type CopyCondition = 'new' | 'good' | 'fair' | 'poor';

export interface Book {
  id: number;
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  subtitle: string | null;
  authors: string | null;
  publisher: string | null;
  published_year: number | null;
  language: string;
  page_count: number | null;
  categories: string | null;
  description: string | null;
  cover_url: string | null;
  openlibrary_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookWithStock extends Book {
  total_copies: number;
  available_copies: number;
}

export interface Copy {
  id: number;
  book_id: number;
  inventory_no: string;
  status: CopyStatus;
  condition: CopyCondition;
  shelf_location: string | null;
  acquired_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'fulfilled';

export interface BorrowRequest {
  id: number;
  user_id: number;
  book_id: number;
  copy_id: number | null;
  status: RequestStatus;
  member_note: string | null;
  admin_note: string | null;
  handled_by: number | null;
  handled_at: string | null;
  created_at: string;
}

export interface RequestWithDetails extends BorrowRequest {
  member_name: string;
  member_email: string;
  book_title: string;
  book_authors: string | null;
  copy_inventory_no: string | null;
}

export interface Loan {
  id: number;
  copy_id: number;
  book_id: number;
  user_id: number;
  request_id: number | null;
  loaned_by: number | null;
  loaned_at: string;
  due_at: string;
  returned_at: string | null;
  returned_by: number | null;
  renew_count: number;
  notes: string | null;
}

export interface LoanWithDetails extends Loan {
  member_name: string;
  member_email: string;
  book_title: string;
  book_authors: string | null;
  inventory_no: string;
}

export interface AuditEntry {
  id: number;
  actor_id: number | null;
  actor_name?: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: string | null;
  created_at: string;
}
